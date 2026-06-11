from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException

from ubo_graph.audit import UBOAuditLogger
from ubo_graph.cache import RedisCache
from ubo_graph.db_client import Neo4jClient, create_db_client
from ubo_graph.models import (
    ErrorResponse,
    ReconciliationResult,
    UBOAuditEntry,
    UBOCalculateResponse,
    UBOCalculationResult,
    UBOCalculationStatus,
)
from ubo_graph.reconciliation import ReconciliationService
from ubo_graph.ubo_service import UBOService

logger = logging.getLogger("ubo_graph.app")

# ── Shared state (initialised in lifespan) ──────────────────────────────────

_db_client: Neo4jClient | None = None
_cache: RedisCache | None = None
_ubo_service: UBOService | None = None
_audit_logger: UBOAuditLogger | None = None
_reconciliation: ReconciliationService | None = None


def _get_services() -> tuple[Neo4jClient, RedisCache, UBOService, UBOAuditLogger, ReconciliationService]:
    if any(x is None for x in (_db_client, _cache, _ubo_service, _audit_logger, _reconciliation)):
        raise RuntimeError("Services not initialised — call lifespan first")
    return _db_client, _cache, _ubo_service, _audit_logger, _reconciliation  # type: ignore[return-value]


# ── Lifespan ────────────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI) -> Any:
    global _db_client, _cache, _ubo_service, _audit_logger, _reconciliation

    _db_client = create_db_client()
    await _db_client.connect()

    _cache = RedisCache()
    await _cache.connect()

    _ubo_service = UBOService(db_client=_db_client)
    _audit_logger = UBOAuditLogger()
    _reconciliation = ReconciliationService()

    logger.info("UBO Graph Service started — db_fallback=%s cache_fallback=%s",
                _db_client.using_fallback, _cache.using_fallback)
    yield

    await _db_client.close()
    await _cache.close()
    logger.info("UBO Graph Service shut down")


def create_app() -> FastAPI:
    app = FastAPI(
        title="UBO Graph Service",
        version="0.3.0",
        lifespan=lifespan,
    )
    app.include_router(router)
    return app


# ── Routes ──────────────────────────────────────────────────────────────────

from fastapi import APIRouter  # noqa: E402

router = APIRouter(prefix="/api/v1/ubo")


@router.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok", "service": "ubo-graph"}


@router.get(
    "/calculate",
    response_model=UBOCalculateResponse,
    responses={404: {"model": ErrorResponse}, 400: {"model": ErrorResponse}},
)
async def calculate_ubo(
    entity_id: str,
    max_depth: int = 5,
    threshold_percentage: float = 25.0,
    include_paths: bool = True,
) -> UBOCalculateResponse:
    """Calculate beneficial owners for an entity.

    Walks the ownership graph upstream from *entity_id*, aggregating
    ownership percentages across all paths to each Person node.
    """
    _db, cache, ubo_svc, audit, _recon = _get_services()

    # Check cache first
    cached = await cache.get(entity_id)
    if cached is not None:
        result = UBOCalculationResult(**cached)
        audit_entry = ubo_svc.create_audit_entry(
            result,
            query_params={
                "entity_id": entity_id,
                "max_depth": max_depth,
                "threshold_percentage": threshold_percentage,
            },
            from_cache=True,
        )
        audit.log(audit_entry)
        return UBOCalculateResponse(result=result, from_cache=True)

    # Calculate
    result = ubo_svc.calculate(
        entity_id=entity_id,
        max_depth=max_depth,
        threshold_percentage=threshold_percentage,
        include_paths=include_paths,
    )

    if result.status == UBOCalculationStatus.FAILED:
        raise HTTPException(status_code=404, detail=result.error_message)

    # Cache the result
    await cache.set(entity_id, result.model_dump())

    # Audit log
    audit_entry = ubo_svc.create_audit_entry(
        result,
        query_params={
            "entity_id": entity_id,
            "max_depth": max_depth,
            "threshold_percentage": threshold_percentage,
        },
        from_cache=False,
    )
    audit.log(audit_entry)

    return UBOCalculateResponse(result=result, from_cache=False)


@router.post(
    "/reconcile",
    response_model=ReconciliationResult,
    responses={404: {"model": ErrorResponse}},
)
async def reconcile_ubo(
    entity_id: str,
    kyb_provider: str = "kyckr",
    threshold_percentage: float = 25.0,
) -> ReconciliationResult:
    """Reconcile graph UBO data with KYB provider data.

    Fetches the cached/calculated UBO result and merges it with
    KYB data for the same entity.
    """
    db, cache, ubo_svc, _audit, recon = _get_services()

    # Get UBO result (from cache or calculate)
    cached = await cache.get(entity_id)
    if cached is not None:
        graph_result = UBOCalculationResult(**cached)
    else:
        graph_result = ubo_svc.calculate(entity_id=entity_id, threshold_percentage=threshold_percentage)
        if graph_result.status == UBOCalculationStatus.FAILED:
            raise HTTPException(status_code=404, detail=graph_result.error_message)

    # For now, KYB data comes from the direct shareholders query
    # In production this would call the KYB adapter
    kyb_data: list[dict[str, Any]] = []
    shareholders = db.direct_shareholders(entity_id)
    for sh in shareholders:
        kyb_data.append({
            "person_id": sh["node_id"],
            "name": sh["name"],
            "ownership_percentage": sh["ownership_percentage"],
        })

    result = recon.reconcile(
        graph_result=graph_result,
        kyb_data=kyb_data,
        kyb_provider=kyb_provider,
        threshold_percentage=threshold_percentage,
    )

    return result


@router.get(
    "/audit/{entity_id}",
    response_model=list[UBOAuditEntry],
)
async def get_audit_entries(entity_id: str, limit: int = 100) -> list[UBOAuditEntry]:
    """Retrieve audit entries for an entity."""
    _, _, _, audit, _ = _get_services()
    return audit.get_entries(entity_id=entity_id, limit=limit)


# ── App instance ────────────────────────────────────────────────────────────

app = create_app()
