"""Unified API gateway — mounts / proxies downstream microservices and provides stubs for endpoints not yet implemented.

Environment variables (with defaults for local dev):
    TX_MONITORING_URL      — transaction_monitoring service
    REPORTING_URL          — austrac_reporting service
    GOVERNANCE_URL         — governance service
    DOCUMENT_ENGINE_URL    — document_detection_engine service
    UBO_GRAPH_URL          — ubo_graph service
"""

from __future__ import annotations

import os
from datetime import UTC, datetime

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

gateway_router = APIRouter()

# ── Service base URLs ─────────────────────────────────────────────────────────
_TX_MONITORING = os.getenv("TX_MONITORING_URL", "http://localhost:8003")
_REPORTING = os.getenv("REPORTING_URL", "http://localhost:8004")
_GOVERNANCE = os.getenv("GOVERNANCE_URL", "http://localhost:8005")
_DOCUMENT_ENGINE = os.getenv("DOCUMENT_ENGINE_URL", "http://localhost:8001")
_UBO_GRAPH = os.getenv("UBO_GRAPH_URL", "http://localhost:8002")


async def _proxy_request(
    method: str,
    base_url: str,
    path: str,
    request: Request,
    allowed_statuses: tuple[int, ...] = (200, 201),
) -> JSONResponse:
    """Forward an incoming request to a downstream service and return its JSON response."""
    client = httpx.AsyncClient()
    try:
        url = f"{base_url}{path}"
        headers = {}
        for key, value in request.headers.items():
            if key.lower() in ("authorization", "content-type"):
                headers[key] = value

        if method.upper() in ("POST", "PUT", "PATCH"):
            body = await request.body()
            resp = await client.request(method, url, headers=headers, content=body, timeout=30.0)
        else:
            params = dict(request.query_params)
            resp = await client.request(method, url, headers=headers, params=params, timeout=30.0)

        if resp.status_code not in allowed_statuses:
            raise HTTPException(status_code=resp.status_code, detail=resp.text)

        return JSONResponse(content=resp.json(), status_code=resp.status_code)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Gateway error: {exc}") from exc
    finally:
        await client.aclose()


# ═══════════════════════════════════════════════════════════════════════════════
#  PROXY ROUTES — forward to existing microservices
# ═══════════════════════════════════════════════════════════════════════════════

# ── Transaction Monitoring ────────────────────────────────────────────────────

@gateway_router.get("/alerts")
async def list_alerts(request: Request) -> JSONResponse:
    return await _proxy_request("GET", _TX_MONITORING, "/alerts/list", request)


@gateway_router.post("/alerts/{alert_id}/assign")
async def assign_alert(alert_id: str, request: Request) -> JSONResponse:
    return await _proxy_request("POST", _TX_MONITORING, f"/alerts/{alert_id}/assign", request)


@gateway_router.patch("/alerts/{alert_id}")
async def update_alert(alert_id: str, request: Request) -> JSONResponse:
    # Transaction monitoring uses POST /alerts/{id}/update-status, not PATCH /alerts/{id}
    return await _proxy_request("POST", _TX_MONITORING, f"/alerts/{alert_id}/update-status", request)


# ── AUSTRAC Reporting ─────────────────────────────────────────────────────────

@gateway_router.post("/reports/generate/{report_type}")
async def generate_report(report_type: str, request: Request) -> JSONResponse:
    return await _proxy_request("POST", _REPORTING, f"/reports/generate/{report_type}", request)


@gateway_router.post("/reports/narrative/draft")
async def draft_narrative(request: Request) -> JSONResponse:
    return await _proxy_request("POST", _REPORTING, "/reports/narrative/draft", request)


@gateway_router.post("/reports/{report_id}/transmit")
async def transmit_report(report_id: str, request: Request) -> JSONResponse:
    return await _proxy_request("POST", _REPORTING, f"/reports/{report_id}/transmit", request)


# ── Governance ──────────────────────────────────────────────────────────────

@gateway_router.get("/governance/metrics")
async def governance_metrics(request: Request) -> JSONResponse:
    # Governance exposes /board/metrics which maps to the governance dashboard data.
    return await _proxy_request("GET", _GOVERNANCE, "/board/metrics", request)


@gateway_router.get("/board/monthly-report/{month}")
async def monthly_report(month: str, request: Request) -> JSONResponse:
    return await _proxy_request("GET", _GOVERNANCE, f"/board/monthly-report/{month}", request)


@gateway_router.post("/board/monthly-report/{month}/approve")
async def approve_monthly_report(month: str, request: Request) -> JSONResponse:
    return await _proxy_request("POST", _GOVERNANCE, f"/board/monthly-report/{month}/approve", request)


@gateway_router.post("/reports/{report_id}/sign")
async def sign_report(report_id: str, request: Request) -> JSONResponse:
    return await _proxy_request("POST", _GOVERNANCE, f"/reports/{report_id}/sign", request)


# ── Document Detection Engine ───────────────────────────────────────────────
# Starlette app — proxy through its HTTP interface.

@gateway_router.post("/documents/analyze")
async def analyze_document(request: Request) -> JSONResponse:
    return await _proxy_request("POST", _DOCUMENT_ENGINE, "/api/v1/documents/analyze", request)


# ── UBO Graph ─────────────────────────────────────────────────────────────────

@gateway_router.get("/ubo/calculate")
async def calculate_ubo(request: Request) -> JSONResponse:
    return await _proxy_request("GET", _UBO_GRAPH, "/api/v1/ubo/calculate", request)


@gateway_router.post("/ubo/reconcile")
async def reconcile_ubo(request: Request) -> JSONResponse:
    return await _proxy_request("POST", _UBO_GRAPH, "/api/v1/ubo/reconcile", request)


@gateway_router.get("/ubo/audit/{entity_id}")
async def ubo_audit(entity_id: str, request: Request) -> JSONResponse:
    return await _proxy_request("GET", _UBO_GRAPH, f"/api/v1/ubo/audit/{entity_id}", request)


# ═══════════════════════════════════════════════════════════════════════════════
#  STUB ROUTES — return mock data for endpoints not yet implemented in backend
# ═══════════════════════════════════════════════════════════════════════════════

@gateway_router.get("/dashboard/stats")
async def dashboard_stats() -> JSONResponse:
    """Stub — aggregate data from downstream services or a future analytics module."""
    return JSONResponse({
        "metrics": {
            "totalClients": 0,
            "highRiskClients": 0,
            "pendingOnboarding": 0,
            "openAlerts": 0,
            "criticalAlerts": 0,
            "reportsFiled": {"smr": 0, "ttr": 0, "iftiE": 0},
            "avgRiskScore": 0.0,
            "documentsAnalyzed": 0,
        },
        "recentActivity": [],
    })


@gateway_router.get("/clients")
async def list_clients() -> JSONResponse:
    """Stub — client registry not yet implemented."""
    return JSONResponse({"clients": [], "pagination": {"page": 1, "limit": 50, "total": 0, "totalPages": 0}})


@gateway_router.post("/clients")
async def create_client(request: Request) -> JSONResponse:
    """Stub — client creation not yet implemented."""
    body = await request.json()
    return JSONResponse({"id": "stub-client-id", **body})


@gateway_router.get("/documents")
async def list_documents() -> JSONResponse:
    """Stub — document registry not yet implemented."""
    return JSONResponse({"documents": [], "pagination": {"page": 1, "limit": 50, "total": 0, "totalPages": 0}})


@gateway_router.get("/transactions")
async def list_transactions() -> JSONResponse:
    """Stub — transaction registry not yet implemented."""
    return JSONResponse({"transactions": [], "pagination": {"page": 1, "limit": 50, "total": 0, "totalPages": 0}})


@gateway_router.get("/monitoring/rules")
async def list_monitoring_rules() -> JSONResponse:
    """Stub — monitoring rules engine not yet implemented."""
    return JSONResponse({"rules": []})


@gateway_router.post("/monitoring/rules")
async def create_monitoring_rule(request: Request) -> JSONResponse:
    """Stub — monitoring rule creation not yet implemented."""
    body = await request.json()
    return JSONResponse({"id": "stub-rule-id", **body})


@gateway_router.post("/onboarding/{case_id}/advance")
async def advance_onboarding(case_id: str, request: Request) -> JSONResponse:
    """Stub — advance workflow step not yet implemented."""
    body = await request.json() if await request.body() else {}
    return JSONResponse({"case_id": case_id, "advanced": True, "payload": body})


@gateway_router.get("/reports")
async def list_reports() -> JSONResponse:
    """Stub — report registry not yet implemented."""
    return JSONResponse({"reports": [], "pagination": {"page": 1, "limit": 50, "total": 0, "totalPages": 0}})


@gateway_router.get("/reports/{report_id}")
async def get_report(report_id: str) -> JSONResponse:
    """Stub — single report retrieval not yet implemented."""
    return JSONResponse({"report": {"id": report_id, "status": "draft"}})


@gateway_router.patch("/reports/{report_id}")
async def update_report(report_id: str, request: Request) -> JSONResponse:
    """Stub — report update not yet implemented."""
    body = await request.json()
    return JSONResponse({"id": report_id, **body})


@gateway_router.get("/audit")
async def list_audit_logs() -> JSONResponse:
    """Stub — audit log index not yet implemented."""
    return JSONResponse({"logs": [], "pagination": {"page": 1, "limit": 50, "total": 0, "totalPages": 0}})


@gateway_router.get("/search")
async def global_search(q: str = "") -> JSONResponse:
    """Stub — global search not yet implemented."""
    return JSONResponse({"results": []})


@gateway_router.post("/seed")
async def seed_data() -> JSONResponse:
    """Stub — seed endpoint not needed with real backend."""
    return JSONResponse({"message": "Seed not required — using live backend data."})


@gateway_router.post("/ai/chat")
async def ai_chat(request: Request) -> JSONResponse:
    """Stub — AI chat integration not yet implemented."""
    body = await request.json()
    return JSONResponse({
        "response": "AI assistant is not yet connected.",
        "timestamp": datetime.now(UTC).isoformat(),
        "echo": body.get("message", ""),
    })
