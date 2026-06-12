from __future__ import annotations

import logging
import os
import uuid
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Any

import httpx
from auth import get_auth_settings, init_supertokens, setup_supertokens_middleware
from auth.dependencies import get_optional_session, get_session
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from orchestration_layer.adapters.circuit_breaker import CircuitBreaker
from orchestration_layer.adapters.kyckr import KyckrAdapter
from orchestration_layer.adapters.open_sanctions import OpenSanctionsAdapter
from orchestration_layer.adapters.veriff import VeriffAdapter
from orchestration_layer.config import Settings, get_settings
from orchestration_layer.models import (
    ErrorResponse,
    InitiateOnboardingRequest,
    InitiateOnboardingResponse,
    KYCStatus,
    KYCVerifyRequest,
    KYCVerifyResponse,
    OnboardingState,
    OnboardingStatusResponse,
    RiskLevel,
    RiskScoreComponent,
    RiskScoreResult,
    UBOResult,
    WorkflowState,
)
from orchestration_layer.monitoring.alert_dispatcher import AlertDispatcher
from orchestration_layer.monitoring.cloudwatch_handler import CloudWatchLogHandler
from orchestration_layer.monitoring.splunk_handler import SplunkHECHandler
from orchestration_layer.secrets_manager import SecretsManagerClient
from orchestration_layer.state_machine import WorkflowStateMachine

logger = logging.getLogger("orchestration_layer.app")

# ── In-memory stores (replace with DynamoDB / RDS for production) ───────────

_workflow_store: dict[str, WorkflowState] = {}
_client_registry: dict[str, dict[str, Any]] = {}


def _store() -> dict[str, WorkflowState]:
    return _workflow_store


# ── Adapter factory ─────────────────────────────────────────────────────────


async def _create_kyc_adapter(
    settings: Settings, secrets: SecretsManagerClient, alert_dispatcher: AlertDispatcher | None = None,
) -> VeriffAdapter:
    api_key = await secrets.get_api_key(settings.kyc_provider)
    return VeriffAdapter(
        api_key=api_key,
        circuit_breaker=CircuitBreaker(
            name=settings.kyc_provider,
            failure_threshold=settings.circuit_failure_threshold,
            recovery_timeout_seconds=settings.circuit_recovery_timeout_seconds,
            half_open_max_calls=settings.circuit_half_open_max_calls,
            alert_dispatcher=alert_dispatcher,
        ),
    )


async def _create_sanctions_adapter(
    settings: Settings, secrets: SecretsManagerClient, alert_dispatcher: AlertDispatcher | None = None,
) -> OpenSanctionsAdapter:
    api_key = await secrets.get_api_key(settings.sanctions_provider)
    return OpenSanctionsAdapter(
        api_key=api_key,
        circuit_breaker=CircuitBreaker(
            name=settings.sanctions_provider,
            failure_threshold=settings.circuit_failure_threshold,
            recovery_timeout_seconds=settings.circuit_recovery_timeout_seconds,
            half_open_max_calls=settings.circuit_half_open_max_calls,
            alert_dispatcher=alert_dispatcher,
        ),
    )


async def _create_kyb_adapter(
    settings: Settings, secrets: SecretsManagerClient, alert_dispatcher: AlertDispatcher | None = None,
) -> KyckrAdapter:
    api_key = await secrets.get_api_key(settings.kyb_provider)
    return KyckrAdapter(
        api_key=api_key,
        circuit_breaker=CircuitBreaker(
            name=settings.kyb_provider,
            failure_threshold=settings.circuit_failure_threshold,
            recovery_timeout_seconds=settings.circuit_recovery_timeout_seconds,
            half_open_max_calls=settings.circuit_half_open_max_calls,
            alert_dispatcher=alert_dispatcher,
        ),
    )


# ── Risk score aggregation ──────────────────────────────────────────────────


def _aggregate_risk_score(ws: WorkflowState, settings: Settings) -> RiskScoreResult:
    """Weighted risk aggregation across 4 components: KYC, sanctions, document, UBO.

    Sprint 3: rebalanced weights kyc=0.35, sanctions=0.30, document=0.20, ubo=0.15.
    Returns a RiskScoreResult with full component-level transparency.
    """
    # Document risk (from Sprint 1 detection engine)
    doc_raw = 0.0
    if ws.document_analysis:
        doc_raw = ws.document_analysis.get("summary", {}).get("risk_score", 0.0) / 100.0

    # KYC risk
    kyc_raw = 0.0
    if ws.kyc_verification:
        if ws.kyc_verification.status == KYCStatus.VERIFIED:
            kyc_raw = 1.0 - ws.kyc_verification.confidence
        elif ws.kyc_verification.status == KYCStatus.REJECTED:
            kyc_raw = 1.0
        elif ws.kyc_verification.status == KYCStatus.ERROR:
            kyc_raw = 0.5  # unknown → moderate risk

    # Sanctions risk
    sanctions_raw = 0.0
    if ws.sanctions_screening and ws.sanctions_screening.match_status.value in (
        "confirmed_match",
        "possible_match",
    ):
            sanctions_raw = ws.sanctions_screening.confidence

    # UBO risk (organisations only)
    ubo_raw = 0.0
    if ws.ubo_result and ws.ubo_result.beneficial_owner_count > 0:
        if ws.ubo_result.confidence_score < 0.5:
            ubo_raw = 1.0 - ws.ubo_result.confidence_score
        unaccounted = 100.0 - ws.ubo_result.total_ownership_accounted
        if unaccounted > 25.0:
            ubo_raw = max(ubo_raw, unaccounted / 100.0)

    # Build per-component scores with weights
    kyc_comp = RiskScoreComponent(
        raw_score=round(kyc_raw, 4),
        weight=settings.risk_score_kyc_weight,
        weighted_score=round(kyc_raw * settings.risk_score_kyc_weight, 4),
    )
    sanctions_comp = RiskScoreComponent(
        raw_score=round(sanctions_raw, 4),
        weight=settings.risk_score_sanctions_weight,
        weighted_score=round(sanctions_raw * settings.risk_score_sanctions_weight, 4),
    )
    doc_comp = RiskScoreComponent(
        raw_score=round(doc_raw, 4),
        weight=settings.risk_score_document_weight,
        weighted_score=round(doc_raw * settings.risk_score_document_weight, 4),
    )
    ubo_comp = RiskScoreComponent(
        raw_score=round(ubo_raw, 4),
        weight=settings.risk_score_ubo_weight,
        weighted_score=round(ubo_raw * settings.risk_score_ubo_weight, 4),
    )

    weighted = (
        doc_raw * settings.risk_score_document_weight
        + kyc_raw * settings.risk_score_kyc_weight
        + sanctions_raw * settings.risk_score_sanctions_weight
        + ubo_raw * settings.risk_score_ubo_weight
    )
    aggregate_score = round(min(100.0, weighted * 100.0), 2)
    weights_sum = round(
        settings.risk_score_kyc_weight
        + settings.risk_score_sanctions_weight
        + settings.risk_score_document_weight
        + settings.risk_score_ubo_weight,
        2,
    )

    if aggregate_score >= 90:
        risk_level = RiskLevel.CRITICAL
    elif aggregate_score >= 70:
        risk_level = RiskLevel.HIGH
    elif aggregate_score >= 35:
        risk_level = RiskLevel.MEDIUM
    else:
        risk_level = RiskLevel.LOW

    return RiskScoreResult(
        kyc=kyc_comp,
        sanctions=sanctions_comp,
        document=doc_comp,
        ubo=ubo_comp,
        aggregate_score=aggregate_score,
        risk_level=risk_level,
        weights_sum=weights_sum,
    )


# ── Pipeline steps ──────────────────────────────────────────────────────────


async def _run_document_analysis(ws: WorkflowState, settings: Settings) -> dict[str, Any]:
    """Call the Sprint 1 Document Detection Engine."""
    async with httpx.AsyncClient(base_url=settings.detection_engine_url, timeout=30.0) as client:
        # In a real flow the document would have been uploaded already;
        # here we query the analysis status using the onboarding ID.
        resp = await client.get(f"/api/v1/documents/analyze/{ws.onboarding_id}")
        if resp.status_code == 200:
            result: dict[str, Any] = resp.json()
            return result
        # Fallback: for initiated onboarding without a pre-uploaded doc,
        # return a minimal clean analysis.
        return {
            "analysis_id": ws.onboarding_id,
            "summary": {"risk_score": 0.0, "risk_level": "low", "flagged_modules": []},
        }


async def _run_ubo_calculation(ws: WorkflowState, settings: Settings) -> UBOResult:
    """Call the Sprint 3 UBO Graph Service for beneficial owner calculation."""

    try:
        async with httpx.AsyncClient(base_url=settings.ubo_service_url, timeout=30.0) as client:
            resp = await client.get(
                "/api/v1/ubo/calculate",
                params={"entity_id": ws.onboarding_id, "max_depth": 5, "threshold_percentage": 25.0},
            )
            if resp.status_code == 200:
                data = resp.json()
                ubo_data = data.get("result", data)
                owners = ubo_data.get("beneficial_owners", [])
                above_threshold = sum(
                    1 for o in owners if o.get("threshold_status") == "above_threshold"
                )
                return UBOResult(
                    entity_id=ws.onboarding_id,
                    beneficial_owner_count=len(owners),
                    total_ownership_accounted=ubo_data.get("total_ownership_accounted", 0.0),
                    max_depth_traversed=ubo_data.get("max_depth_traversed", 0),
                    above_threshold_count=above_threshold,
                    confidence_score=ubo_data.get("confidence_score", 1.0),
                    result_hash=ubo_data.get("result_hash", ""),
                )
    except Exception as exc:
        logger.warning("UBO service unavailable for entity %s: %s", ws.onboarding_id, exc)

    # Fallback: UBO service unavailable — return empty result
    return UBOResult(entity_id=ws.onboarding_id)


async def _run_pipeline(
    ws: WorkflowState,
    settings: Settings,
    secrets: SecretsManagerClient,
    alert_dispatcher: AlertDispatcher | None = None,
) -> None:
    """Execute the full onboarding pipeline on a workflow state."""
    sm = WorkflowStateMachine(ws)

    try:
        # Step 1: Document Analysis
        sm.start_document_analysis()  # type: ignore[attr-defined]
        doc_result = await _run_document_analysis(ws, settings)
        ws.document_analysis = doc_result
        sm.complete_document_analysis()  # type: ignore[attr-defined]

        # Step 2: KYC Verification
        kyc_adapter = await _create_kyc_adapter(settings, secrets, alert_dispatcher)
        try:
            kyc_result = await kyc_adapter.initiate_verification(
                full_name=ws.entity_name,
                document_type="passport",
                country_of_issue=ws.country_code,
            )
            ws.kyc_verification = kyc_result
            sm.complete_kyc_verification()  # type: ignore[attr-defined]
        finally:
            await kyc_adapter.aclose()

        # Step 3: Sanctions Screening
        sanctions_adapter = await _create_sanctions_adapter(settings, secrets, alert_dispatcher)
        try:
            if ws.entity_type == "individual":
                sanctions_result = await sanctions_adapter.screen_individual(
                    full_name=ws.entity_name,
                    country_code=ws.country_code,
                )
            else:
                sanctions_result = await sanctions_adapter.screen_organisation(
                    name=ws.entity_name,
                    country_code=ws.country_code,
                )
            ws.sanctions_screening = sanctions_result
            sm.complete_sanctions_screening()  # type: ignore[attr-defined]
        finally:
            await sanctions_adapter.aclose()

        # Step 4: KYB Lookup (organisations only — state machine handles routing)
        if ws.state == OnboardingState.KYB_LOOKUP:
            kyb_adapter = await _create_kyb_adapter(settings, secrets, alert_dispatcher)
            try:
                kyb_result = await kyb_adapter.lookup_entity(
                    name=ws.entity_name,
                    country_code=ws.country_code,
                )
                ws.kyb_lookup = kyb_result
                sm.complete_kyb_lookup()  # type: ignore[attr-defined]
            finally:
                await kyb_adapter.aclose()

        # Step 5: UBO Calculation (organisations after KYB)
        if ws.state == OnboardingState.UBO_CALCULATION:
            ubo_result = await _run_ubo_calculation(ws, settings)
            ws.ubo_result = ubo_result
            sm.complete_ubo_calculation()  # type: ignore[attr-defined]

        # Step 6: Risk Aggregation
        risk_result = _aggregate_risk_score(ws, settings)
        ws.risk_score = risk_result.aggregate_score
        ws.risk_level = risk_result.risk_level
        ws.risk_score_result = risk_result
        sm.complete_risk_aggregation()  # type: ignore[attr-defined]

    except Exception as exc:
        logger.exception("pipeline failed for onboarding_id=%s", ws.onboarding_id)
        sm.fail(str(exc))


# ── Lifespan / App Factory ──────────────────────────────────────────────────


def _attach_monitoring_handlers(settings: Settings) -> None:
    """Attach CloudWatch and Splunk log handlers to the orchestration root logger."""
    root = logging.getLogger("orchestration_layer")

    # CloudWatch Logs handler
    cw_handler = CloudWatchLogHandler(
        log_group=settings.cloudwatch_log_group,
        aws_region=settings.aws_region,
    )
    cw_handler.setFormatter(logging.Formatter("%(asctime)s %(name)s %(levelname)s %(message)s"))
    root.addHandler(cw_handler)

    # Splunk HEC handler (only if configured)
    if settings.splunk_hec_url and settings.splunk_hec_token:
        splunk_handler = SplunkHECHandler(
            hec_url=settings.splunk_hec_url,
            hec_token=settings.splunk_hec_token,
            index=settings.splunk_index,
            source=settings.splunk_source,
        )
        splunk_handler.setFormatter(logging.Formatter("%(asctime)s %(name)s %(levelname)s %(message)s"))
        root.addHandler(splunk_handler)


@asynccontextmanager
async def lifespan(app: FastAPI) -> Any:
    settings = get_settings()
    app.state.settings = settings
    app.state.secrets = SecretsManagerClient(
        prefix=settings.secrets_manager_prefix,
        aws_region=settings.aws_region,
    )

    # Alert dispatcher wired to circuit breakers
    alert_dispatcher = AlertDispatcher(
        error_rate_threshold=settings.alert_error_rate_threshold,
        latency_threshold_ms=settings.alert_latency_threshold_ms,
    )
    app.state.alert_dispatcher = alert_dispatcher

    # Attach monitoring log handlers
    _attach_monitoring_handlers(settings)

    logger.info("orchestration layer started — kyc=%s sanctions=%s kyb=%s",
                settings.kyc_provider, settings.sanctions_provider, settings.kyb_provider)
    yield
    logger.info("orchestration layer shutting down")


def create_app(settings: Settings | None = None) -> FastAPI:
    app = FastAPI(
        title="AML/CTF Orchestration Layer",
        version="0.2.0",
        lifespan=lifespan,
    )
    if settings:
        # Pre-populate for testing
        app.state.settings = settings
        app.state.secrets = SecretsManagerClient(
            prefix=settings.secrets_manager_prefix,
            aws_region=settings.aws_region,
        )
        app.state.alert_dispatcher = AlertDispatcher(
            error_rate_threshold=settings.alert_error_rate_threshold,
            latency_threshold_ms=settings.alert_latency_threshold_ms,
        )

    # Initialise SuperTokens session management (must happen before middleware)
    auth_settings = get_auth_settings()
    try:
        init_supertokens(auth_settings)
    except Exception:
        logger.warning("SuperTokens init failed — auth endpoints may be unavailable")

    # Attach SuperTokens middleware (must be before route registration)
    setup_supertokens_middleware(app, enable=auth_settings.enable_middleware)

    # CORS: allow frontend origin(s)
    origins_env = os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:3000")
    origins = [o.strip() for o in origins_env.split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(public_router)
    app.include_router(protected_router)
    from orchestration_layer.gateway import gateway_router
    app.include_router(gateway_router, dependencies=[Depends(get_optional_session)])
    return app


# ── Routes ──────────────────────────────────────────────────────────────────

router = FastAPI().router  # placeholder — we'll define routes below

# Actually we need a real APIRouter:
from fastapi import APIRouter  # noqa: E402

# Public router (no auth required)
public_router = APIRouter()
# Protected router (session verification required)
protected_router = APIRouter(dependencies=[Depends(get_session)])


@public_router.get("/healthz")
async def healthz() -> JSONResponse:
    return JSONResponse({"status": "ok", "service": "orchestration-layer"})


@protected_router.post(
    "/onboarding/initiate",
    response_model=InitiateOnboardingResponse,
    responses={400: {"model": ErrorResponse}},
)
async def initiate_onboarding(
    payload: InitiateOnboardingRequest,
) -> InitiateOnboardingResponse:
    settings: Settings = get_settings()
    secrets = SecretsManagerClient(
        prefix=settings.secrets_manager_prefix,
        aws_region=settings.aws_region,
    )

    onboarding_id = str(uuid.uuid4())
    ws = WorkflowState(
        onboarding_id=onboarding_id,
        entity_name=payload.entity_name,
        entity_type=payload.entity_type,
        country_code=payload.country_code,
    )
    _store()[onboarding_id] = ws

    # Run the full pipeline in the background
    import asyncio

    alert_dispatcher: AlertDispatcher | None = getattr(app.state, "alert_dispatcher", None)
    task = asyncio.create_task(_run_pipeline(ws, settings, secrets, alert_dispatcher))
    app.state.background_tasks = getattr(app.state, "background_tasks", set())
    app.state.background_tasks.add(task)
    task.add_done_callback(app.state.background_tasks.discard)

    return InitiateOnboardingResponse(
        onboarding_id=onboarding_id,
        state=ws.state,
        created_at=ws.created_at,
    )


@protected_router.get(
    "/onboarding/status/{onboarding_id}",
    response_model=OnboardingStatusResponse,
    responses={404: {"model": ErrorResponse}},
)
async def get_onboarding_status(
    onboarding_id: str,
) -> OnboardingStatusResponse:
    ws = _store().get(onboarding_id)
    if not ws:
        raise HTTPException(status_code=404, detail=f"Onboarding {onboarding_id} not found")

    return OnboardingStatusResponse(
        onboarding_id=ws.onboarding_id,
        state=ws.state,
        entity_name=ws.entity_name,
        entity_type=ws.entity_type,
        country_code=ws.country_code,
        document_analysis=ws.document_analysis,
        kyc_verification=ws.kyc_verification,
        sanctions_screening=ws.sanctions_screening,
        kyb_lookup=ws.kyb_lookup,
        ubo_result=ws.ubo_result,
        risk_score=ws.risk_score,
        risk_level=ws.risk_level,
        risk_score_result=ws.risk_score_result,
        created_at=ws.created_at,
        updated_at=ws.updated_at,
    )


@protected_router.post(
    "/kyc/verify",
    response_model=KYCVerifyResponse,
    responses={404: {"model": ErrorResponse}, 400: {"model": ErrorResponse}},
)
async def kyc_verify(
    payload: KYCVerifyRequest,
) -> KYCVerifyResponse:
    ws = _store().get(payload.onboarding_id)
    if not ws:
        raise HTTPException(status_code=404, detail=f"Onboarding {payload.onboarding_id} not found")

    settings = get_settings()
    secrets = SecretsManagerClient(prefix=settings.secrets_manager_prefix, aws_region=settings.aws_region)
    alert_dispatcher: AlertDispatcher | None = getattr(app.state, "alert_dispatcher", None)

    kyc_adapter = await _create_kyc_adapter(settings, secrets, alert_dispatcher)
    try:
        result = await kyc_adapter.initiate_verification(
            full_name=payload.full_name,
            document_type=payload.document_type,
            country_of_issue=payload.country_of_issue,
            date_of_birth=payload.date_of_birth,
        )
    finally:
        await kyc_adapter.aclose()

    ws.kyc_verification = result
    ws.touch()

    return KYCVerifyResponse(
        onboarding_id=ws.onboarding_id,
        kyc_verification=result,
        updated_at=ws.updated_at,
    )


@protected_router.get("/clients")
async def list_clients() -> dict[str, Any]:
    total = len(_client_registry)
    total_pages = max(1, (total + 49) // 50)
    return {
        "clients": list(_client_registry.values()),
        "pagination": {"page": 1, "limit": 50, "total": total, "totalPages": total_pages},
    }


@protected_router.post("/clients")
async def create_client(request: Request) -> dict[str, Any]:
    body = await request.json()
    client_id = body.get("client_id") or str(uuid.uuid4())
    client = {"id": client_id, **body, "created_at": datetime.now(UTC).isoformat()}
    _client_registry[client_id] = client
    return client


@protected_router.post("/onboarding/{case_id}/advance")
async def advance_onboarding(case_id: str, request: Request) -> dict[str, Any]:
    ws = _store().get(case_id)
    if not ws:
        raise HTTPException(status_code=404, detail=f"Onboarding case {case_id} not found")
    body = await request.json() if await request.body() else {}
    trigger = body.get("trigger", "advance")
    sm = WorkflowStateMachine(ws)
    try:
        sm.trigger(trigger)  # type: ignore[attr-defined]
    except Exception as exc:
        msg = f"Invalid transition '{trigger}' from state {ws.state}: {exc}"
        raise HTTPException(status_code=400, detail=msg) from exc
    return {"case_id": case_id, "state": ws.state, "advanced": True}


# ── App instance ────────────────────────────────────────────────────────────

app = create_app()
