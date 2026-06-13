from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from typing import Any
from uuid import UUID

from auth import get_auth_settings, init_supertokens, setup_supertokens_middleware
from auth.dependencies import get_session, require_board_member, require_compliance_officer
from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response

from governance.audit import AuditTrailService
from governance.audit_changes import AuditChangeService
from governance.board import BoardDashboardService
from governance.cases import CaseNotFoundError, CaseService
from governance.integrations import ProviderService, ServiceHealthService
from governance.models import (
    AddCaseNoteRequest,
    BoardMetrics,
    CaseStatus,
    CreateCaseRequest,
    CreateTaskRequest,
    MonthlyReport,
    ProviderStatus,
    RecordAuditChangeRequest,
    SanctionsMatch,
    SanctionsSource,
    ScreenRequest,
    ServiceStatus,
    TaskStatus,
    UpdateCaseRequest,
    UpdateProviderRequest,
    UpdateSanctionsMatchRequest,
    UpdateTaskRequest,
)
from governance.sanctions import SanctionsService
from governance.signing import ComplianceSigner
from governance.tasks import TaskNotFoundError, TaskService

logger = logging.getLogger("governance.app")

_audit_service: AuditTrailService | None = None
_audit_change_service: AuditChangeService | None = None
_case_service: CaseService | None = None
_task_service: TaskService | None = None
_provider_service: ProviderService | None = None
_service_health_service: ServiceHealthService | None = None
_sanctions_service: SanctionsService | None = None
_board_service: BoardDashboardService | None = None
_signer: ComplianceSigner | None = None


def _build_signer() -> ComplianceSigner:
    """Build the compliance signer.

    Prefers AWS KMS when ``GOVERNANCE_KMS_KEY_ARN`` is set; otherwise requires
    a strong ``GOVERNANCE_HMAC_FALLBACK_SECRET`` from the environment.  Refuses
    to start with a weak or default secret in production.
    """
    kms_key_arn = os.getenv("GOVERNANCE_KMS_KEY_ARN", "")
    fallback_secret = os.getenv("GOVERNANCE_HMAC_FALLBACK_SECRET", "")
    env = os.getenv("AML_ENV", "development").lower()

    if not kms_key_arn and not fallback_secret:
        msg = (
            "Refusing to start: neither GOVERNANCE_KMS_KEY_ARN nor "
            "GOVERNANCE_HMAC_FALLBACK_SECRET is configured. Set one of these "
            "environment variables to enable report signing."
        )
        if env == "production":
            raise RuntimeError(msg)
        # In dev/test, fall back to a random per-process secret so a developer
        # who never signs anything still gets a working service.  The signer
        # itself logs a loud warning.
        import secrets as _secrets

        fallback_secret = _secrets.token_hex(32)
        logger.warning(
            "GOVERNANCE_KMS_KEY_ARN and GOVERNANCE_HMAC_FALLBACK_SECRET are "
            "unset — using a random per-process HMAC key.  Signatures will be "
            "INVALID after restart.  Do not use this in production."
        )

    if (
        fallback_secret
        and not kms_key_arn
        and env == "production"
        and (fallback_secret in {"dev-fallback-secret", "changeme", "secret"} or len(fallback_secret) < 32)
    ):
        # A weak dev-style secret must never reach production.
        raise RuntimeError(
            "Refusing to start: GOVERNANCE_HMAC_FALLBACK_SECRET is a "
            "weak/default value in production. Provide a strong secret "
            "(>=32 chars) or use KMS instead."
        )

    return ComplianceSigner(kms_key_arn=kms_key_arn, fallback_secret=fallback_secret)


@asynccontextmanager
async def lifespan(app: FastAPI) -> Any:
    global _audit_service, _audit_change_service, _case_service
    global _task_service, _provider_service, _service_health_service
    global _sanctions_service, _board_service, _signer
    _audit_service = AuditTrailService(":memory:")
    _audit_change_service = AuditChangeService()
    _case_service = CaseService(audit=_audit_change_service)
    _task_service = TaskService(audit=_audit_change_service)
    _provider_service = ProviderService()
    _service_health_service = ServiceHealthService()
    _sanctions_service = SanctionsService()
    _board_service = BoardDashboardService(audit_service=_audit_service)
    _signer = _build_signer()

    logger.info("Governance service started")
    yield
    logger.info("Governance service stopped")
    if _audit_service is not None:
        await _audit_service.close()
    _audit_service = None
    _audit_change_service = None
    _case_service = None
    _task_service = None
    _provider_service = None
    _service_health_service = None
    _sanctions_service = None
    _board_service = None
    _signer = None


app = FastAPI(title="Governance Dashboard", version="0.6.0", lifespan=lifespan)

# Initialise SuperTokens session management (must happen before middleware)
auth_settings = get_auth_settings()
try:
    init_supertokens(auth_settings)
except Exception:
    logger.warning("SuperTokens init failed — auth endpoints may be unavailable")

# Attach SuperTokens middleware (must be before route registration)
setup_supertokens_middleware(app, enable=auth_settings.enable_middleware)


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok", "service": "governance"}


@app.get("/board/metrics", response_model=BoardMetrics)
async def board_metrics(
    session: Any = Depends(require_board_member),
) -> BoardMetrics:
    if _board_service is None:
        raise HTTPException(status_code=503, detail="Board service not initialized")
    return await _board_service.get_metrics()


@app.get("/board/monthly-report/{month}")
async def board_monthly_report(
    month: str,
    session: Any = Depends(require_board_member),
) -> MonthlyReport:
    if _board_service is None:
        raise HTTPException(status_code=503, detail="Board service not initialized")
    return await _board_service.get_monthly_report(month)


@app.post("/board/monthly-report/{month}/approve")
async def approve_monthly_report(
    month: str,
    approved_by: str,
    session: Any = Depends(require_board_member),
) -> MonthlyReport:
    if _board_service is None:
        raise HTTPException(status_code=503, detail="Board service not initialized")
    return await _board_service.approve_monthly_report(month, approved_by)


@app.get("/audit/logs")
async def list_audit_logs(
    event_type: str | None = None,
    limit: int = 50,
    session: Any = Depends(get_session),
) -> dict[str, Any]:
    if _audit_service is None:
        raise HTTPException(status_code=503, detail="Audit service not initialised")
    logs = await _audit_service.query(event_type=event_type, limit=limit)
    return {
        "logs": [log.model_dump(mode="json") for log in logs],
        "pagination": {"page": 1, "limit": limit, "total": len(logs), "totalPages": 1},
    }


@app.post("/reports/{report_id}/sign")
async def sign_report(
    report_id: str,
    payload: str,
    signed_by: str = "system",
    session: Any = Depends(require_compliance_officer),
) -> dict[str, Any]:
    if _signer is None:
        raise HTTPException(status_code=503, detail="Signer not initialized")
    sig = await _signer.sign(report_id, payload, signed_by=signed_by)
    if _audit_service is not None:
        await _audit_service.log_event(
            "report_signed",
            payload_hash=sig.signature_b64[:64],
            details={"report_id": report_id, "signed_by": signed_by},
            user_role="compliance_officer",
        )
    return {
        "signature_id": str(sig.signature_id),
        "signature_b64": sig.signature_b64,
    }


# ── Case Management ────────────────────────────────────────────────────────


def _actor_from_session(session: Any) -> str:
    """Extract the user id from a SuperTokens session object.

    The session is supplied via FastAPI's ``Depends(get_session)`` (or the
    role-restricted variants).  When the dependency is overridden in
    tests the same object is used, so this function works in both
    production and unit-test contexts.
    """
    if session is None:
        return "system"
    try:
        user_id = session.get_user_id()
    except Exception:
        return "system"
    return user_id or "system"


@app.get("/cases")
async def list_cases(
    status_filter: str | None = Query(default=None, alias="status"),
    priority: str | None = None,
    case_type: str | None = None,
    assigned_to: str | None = None,
    search: str | None = None,
    page: int = 1,
    page_size: int = 50,
    session: Any = Depends(get_session),
) -> dict[str, Any]:
    if _case_service is None:
        raise HTTPException(status_code=503, detail="Case service not initialised")
    status_enum: CaseStatus | None = None
    if status_filter is not None:
        try:
            status_enum = CaseStatus(status_filter)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=f"Invalid status: {status_filter}") from exc
    cases, total = await _case_service.list_cases(
        status=status_enum,
        priority=priority,
        case_type=case_type,
        assigned_to=assigned_to,
        search=search,
        page=page,
        page_size=page_size,
    )
    return {
        "cases": [c.model_dump(mode="json") for c in cases],
        "pagination": {
            "page": page,
            "limit": page_size,
            "total": total,
            "totalPages": max(1, (total + page_size - 1) // page_size),
        },
        "assignees": await _case_service.list_assignees(),
    }


@app.post("/cases", response_model=None)
async def create_case(
    request: Request,
    payload: CreateCaseRequest,
    session: Any = Depends(require_compliance_officer),
) -> dict[str, Any]:
    if _case_service is None:
        raise HTTPException(status_code=503, detail="Case service not initialised")
    case = await _case_service.create_case(payload, actor=_actor_from_session(session))
    return case.model_dump(mode="json")


@app.get("/cases/{case_id}")
async def get_case(
    case_id: UUID,
    session: Any = Depends(get_session),
) -> dict[str, Any]:
    if _case_service is None:
        raise HTTPException(status_code=503, detail="Case service not initialised")
    try:
        case = await _case_service.get_case(case_id)
    except CaseNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return case.model_dump(mode="json")


@app.patch("/cases/{case_id}")
async def update_case(
    case_id: UUID,
    payload: UpdateCaseRequest,
    session: Any = Depends(require_compliance_officer),
) -> dict[str, Any]:
    if _case_service is None:
        raise HTTPException(status_code=503, detail="Case service not initialised")
    actor = payload.actor or _actor_from_session(session)
    try:
        case = await _case_service.update_case(case_id, payload, actor=actor)
    except CaseNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return case.model_dump(mode="json")


@app.post("/cases/{case_id}/notes")
async def add_case_note(
    case_id: UUID,
    payload: AddCaseNoteRequest,
    session: Any = Depends(require_compliance_officer),
) -> dict[str, Any]:
    if _case_service is None:
        raise HTTPException(status_code=503, detail="Case service not initialised")
    try:
        case = await _case_service.add_case_note(case_id, payload)
    except CaseNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return case.model_dump(mode="json")


@app.delete("/cases/{case_id}", status_code=204, response_class=Response)
async def delete_case(
    case_id: UUID,
    session: Any = Depends(require_compliance_officer),
) -> Response:
    if _case_service is None:
        raise HTTPException(status_code=503, detail="Case service not initialised")
    try:
        await _case_service.delete_case(case_id, actor=_actor_from_session(session))
    except CaseNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return Response(status_code=204)


# ── Compliance Tasks ───────────────────────────────────────────────────────


@app.get("/tasks")
async def list_tasks(
    status_filter: str | None = Query(default=None, alias="status"),
    priority: str | None = None,
    category: str | None = None,
    assignee: str | None = None,
    overdue_only: bool = False,
    page: int = 1,
    page_size: int = 100,
    session: Any = Depends(get_session),
) -> dict[str, Any]:
    if _task_service is None:
        raise HTTPException(status_code=503, detail="Task service not initialised")
    status_enum: TaskStatus | None = None
    if status_filter is not None:
        try:
            status_enum = TaskStatus(status_filter)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=f"Invalid status: {status_filter}") from exc
    tasks, total = await _task_service.list_tasks(
        status=status_enum,
        priority=priority,
        category=category,
        assignee=assignee,
        include_overdue_only=overdue_only,
        page=page,
        page_size=page_size,
    )
    return {
        "tasks": [t.model_dump(mode="json") for t in tasks],
        "pagination": {
            "page": page,
            "limit": page_size,
            "total": total,
            "totalPages": max(1, (total + page_size - 1) // page_size),
        },
        "assignees": await _task_service.list_assignees(),
    }


@app.post("/tasks")
async def create_task(
    payload: CreateTaskRequest,
    session: Any = Depends(require_compliance_officer),
) -> dict[str, Any]:
    if _task_service is None:
        raise HTTPException(status_code=503, detail="Task service not initialised")
    task = await _task_service.create_task(payload, actor=_actor_from_session(session))
    return task.model_dump(mode="json")


@app.get("/tasks/{task_id}")
async def get_task(
    task_id: UUID,
    session: Any = Depends(get_session),
) -> dict[str, Any]:
    if _task_service is None:
        raise HTTPException(status_code=503, detail="Task service not initialised")
    try:
        task = await _task_service.get_task(task_id)
    except TaskNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return task.model_dump(mode="json")


@app.patch("/tasks/{task_id}")
async def update_task(
    task_id: UUID,
    payload: UpdateTaskRequest,
    session: Any = Depends(require_compliance_officer),
) -> dict[str, Any]:
    if _task_service is None:
        raise HTTPException(status_code=503, detail="Task service not initialised")
    try:
        task = await _task_service.update_task(
            task_id, payload, actor=_actor_from_session(session)
        )
    except TaskNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return task.model_dump(mode="json")


@app.delete("/tasks/{task_id}", status_code=204, response_class=Response)
async def delete_task(
    task_id: UUID,
    session: Any = Depends(require_compliance_officer),
) -> Response:
    if _task_service is None:
        raise HTTPException(status_code=503, detail="Task service not initialised")
    try:
        await _task_service.delete_task(task_id, actor=_actor_from_session(session))
    except TaskNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return Response(status_code=204)


# ── Audit Changes (user-facing change log) ─────────────────────────────────


@app.get("/audit-changes")
async def list_audit_changes(
    user: str | None = None,
    action: str | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    page: int = 1,
    page_size: int = 50,
    session: Any = Depends(get_session),
) -> dict[str, Any]:
    if _audit_change_service is None:
        raise HTTPException(status_code=503, detail="Audit change service not initialised")
    entries, total = await _audit_change_service.query(
        user=user,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        page=page,
        page_size=page_size,
    )
    return {
        "entries": [e.model_dump(mode="json") for e in entries],
        "users": await _audit_change_service.list_users(),
        "pagination": {
            "page": page,
            "limit": page_size,
            "total": total,
            "totalPages": max(1, (total + page_size - 1) // page_size),
        },
    }


@app.post("/audit-changes")
async def record_audit_change(
    payload: RecordAuditChangeRequest,
    session: Any = Depends(require_compliance_officer),
) -> dict[str, Any]:
    if _audit_change_service is None:
        raise HTTPException(status_code=503, detail="Audit change service not initialised")
    await _audit_change_service.record(
        user=payload.user,
        action=payload.action,
        entity_type=payload.entity_type,
        entity_id=payload.entity_id,
        changes=payload.changes,
    )
    return {"status": "recorded"}


# ── Integration Provider Status ────────────────────────────────────────────


@app.get("/providers", response_model=list[ProviderStatus])
async def list_providers(
    session: Any = Depends(get_session),
) -> list[ProviderStatus]:
    if _provider_service is None:
        raise HTTPException(status_code=503, detail="Provider service not initialised")
    return await _provider_service.list_providers()


@app.post("/providers", response_model=ProviderStatus)
async def update_provider(
    payload: UpdateProviderRequest,
    session: Any = Depends(require_compliance_officer),
) -> ProviderStatus:
    if _provider_service is None:
        raise HTTPException(status_code=503, detail="Provider service not initialised")
    return await _provider_service.update_provider(payload)


# ── Service Health ─────────────────────────────────────────────────────────


@app.get("/services/status", response_model=list[ServiceStatus])
async def list_service_health(
    session: Any = Depends(get_session),
) -> list[ServiceStatus]:
    if _service_health_service is None:
        raise HTTPException(status_code=503, detail="Service health not initialised")
    return await _service_health_service.list_services()


# ── Sanctions Screening ─────────────────────────────────────────────────────


@app.get("/sanctions/sources", response_model=list[SanctionsSource])
async def list_sanctions_sources(
    session: Any = Depends(get_session),
) -> list[SanctionsSource]:
    if _sanctions_service is None:
        raise HTTPException(status_code=503, detail="Sanctions service not initialised")
    return await _sanctions_service.list_sources()


@app.get("/sanctions/matches")
async def list_sanctions_matches(
    status: str | None = None,
    client_id: str | None = None,
    source: str | None = None,
    page: int = 1,
    page_size: int = 100,
    session: Any = Depends(get_session),
) -> dict[str, Any]:
    if _sanctions_service is None:
        raise HTTPException(status_code=503, detail="Sanctions service not initialised")
    matches, total = await _sanctions_service.list_matches(
        status=status,
        client_id=client_id,
        source=source,
        page=page,
        page_size=page_size,
    )
    return {
        "matches": [m.model_dump(mode="json") for m in matches],
        "pagination": {
            "page": page,
            "limit": page_size,
            "total": total,
            "totalPages": max(1, (total + page_size - 1) // page_size),
        },
    }


@app.post("/sanctions/screen", response_model=list[SanctionsMatch])
async def screen_name(
    payload: ScreenRequest,
    session: Any = Depends(require_compliance_officer),
) -> list[SanctionsMatch]:
    if _sanctions_service is None:
        raise HTTPException(status_code=503, detail="Sanctions service not initialised")
    return await _sanctions_service.screen(payload)


@app.patch("/sanctions/matches/{match_id}", response_model=SanctionsMatch)
async def update_sanctions_match(
    match_id: UUID,
    payload: UpdateSanctionsMatchRequest,
    session: Any = Depends(require_compliance_officer),
) -> SanctionsMatch:
    if _sanctions_service is None:
        raise HTTPException(status_code=503, detail="Sanctions service not initialised")
    try:
        return await _sanctions_service.update_match(match_id, payload)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

