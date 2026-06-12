from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any

from auth import get_auth_settings, init_supertokens, setup_supertokens_middleware
from auth.dependencies import require_board_member, require_compliance_officer
from fastapi import Depends, FastAPI, HTTPException

from governance.audit import AuditTrailService
from governance.board import BoardDashboardService
from governance.models import BoardMetrics, MonthlyReport
from governance.signing import ComplianceSigner

logger = logging.getLogger("governance.app")

_audit_service: AuditTrailService | None = None
_board_service: BoardDashboardService | None = None
_signer: ComplianceSigner | None = None


@asynccontextmanager
async def lifespan(app: FastAPI) -> Any:
    global _audit_service, _board_service, _signer
    _audit_service = AuditTrailService(":memory:")
    _board_service = BoardDashboardService(audit_service=_audit_service)
    _signer = ComplianceSigner(fallback_secret="dev-fallback-secret")

    logger.info("Governance service started")
    yield
    logger.info("Governance service stopped")
    if _audit_service is not None:
        await _audit_service.close()
    _audit_service = None
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
