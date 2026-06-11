from __future__ import annotations

from datetime import UTC, datetime

from fastapi import FastAPI, HTTPException

from transaction_monitoring.models import (
    Alert,
    AlertListResponse,
    AlertStatus,
    AssignAlertRequest,
    UpdateAlertStatusRequest,
)

app = FastAPI(title="Transaction Monitoring", version="0.4.0")

_alerts: dict[str, Alert] = {}


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok", "service": "transaction-monitoring"}


@app.get("/alerts/list", response_model=AlertListResponse)
async def list_alerts(
    status: AlertStatus | None = None,
    severity: str | None = None,
    onboarding_id: str | None = None,
    page: int = 1,
    page_size: int = 50,
) -> AlertListResponse:
    results = list(_alerts.values())
    if status:
        results = [a for a in results if a.status == status]
    if severity:
        results = [a for a in results if a.final_severity.value == severity]
    if onboarding_id:
        results = [a for a in results if a.onboarding_id == onboarding_id]

    total = len(results)
    start = (page - 1) * page_size
    end = start + page_size
    return AlertListResponse(
        alerts=results[start:end],
        total=total,
        page=page,
        page_size=page_size,
    )


@app.post("/alerts/{alert_id}/assign")
async def assign_alert(alert_id: str, request: AssignAlertRequest) -> Alert:
    alert = _alerts.get(alert_id)
    if alert is None:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.assigned_to = request.assigned_to
    alert.status = AlertStatus.ASSIGNED
    alert.updated_at = datetime.now(UTC)
    _alerts[alert_id] = alert
    return alert


@app.post("/alerts/{alert_id}/update-status")
async def update_alert_status(alert_id: str, request: UpdateAlertStatusRequest) -> Alert:
    alert = _alerts.get(alert_id)
    if alert is None:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.status = request.status
    if request.notes:
        alert.notes = request.notes
    alert.updated_at = datetime.now(UTC)
    _alerts[alert_id] = alert
    return alert
