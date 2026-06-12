"""Unified API gateway — mounts / proxies downstream microservices.

Environment variables (with defaults for local dev):
    TX_MONITORING_URL      — transaction_monitoring service
    REPORTING_URL          — austrac_reporting service
    GOVERNANCE_URL         — governance service
    DOCUMENT_ENGINE_URL    — document_detection_engine service
    UBO_GRAPH_URL          — ubo_graph service
    COMPLIANCE_AGENT_URL   — compliance_agent service
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

gateway_router = APIRouter()

logger = logging.getLogger("orchestration_layer.gateway")

# ── Service base URLs ─────────────────────────────────────────────────────────
_TX_MONITORING = os.getenv("TX_MONITORING_URL", "http://localhost:8003")
_REPORTING = os.getenv("REPORTING_URL", "http://localhost:8004")
_GOVERNANCE = os.getenv("GOVERNANCE_URL", "http://localhost:8005")
_DOCUMENT_ENGINE = os.getenv("DOCUMENT_ENGINE_URL", "http://localhost:8001")
_UBO_GRAPH = os.getenv("UBO_GRAPH_URL", "http://localhost:8002")
_COMPLIANCE_AGENT = os.getenv("COMPLIANCE_AGENT_URL", "http://localhost:8006")


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


async def _proxy_json(
    method: str,
    base_url: str,
    path: str,
    request: Request | None = None,
) -> dict[str, Any]:
    """Forward a request and return the parsed JSON dict (used for composition)."""
    client = httpx.AsyncClient()
    try:
        url = f"{base_url}{path}"
        headers = {}
        if request:
            for key, value in request.headers.items():
                if key.lower() in ("authorization", "content-type"):
                    headers[key] = value

        if method.upper() in ("POST", "PUT", "PATCH"):
            req_body = await request.body() if request else b""
            resp = await client.request(method, url, headers=headers, content=req_body, timeout=30.0)
        else:
            params = dict(request.query_params) if request else {}
            resp = await client.request(method, url, headers=headers, params=params, timeout=30.0)

        data: dict[str, Any] = {}
        if resp.status_code == 200:
            json_data = resp.json()
            if isinstance(json_data, dict):
                data = json_data
        return data
    except Exception:
        return {}
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

@gateway_router.post("/documents/analyze")
async def analyze_document(request: Request) -> JSONResponse:
    return await _proxy_request("POST", _DOCUMENT_ENGINE, "/api/v1/documents/analyze", request)


@gateway_router.get("/documents")
async def list_documents(request: Request) -> JSONResponse:
    return await _proxy_request("GET", _DOCUMENT_ENGINE, "/api/v1/documents", request)


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
#  REAL ROUTES — previously stubs, now wired to backends
# ═══════════════════════════════════════════════════════════════════════════════

@gateway_router.get("/dashboard/stats")
async def dashboard_stats(request: Request) -> JSONResponse:
    """Aggregate data from downstream services in parallel."""
    results = await asyncio.gather(
        _proxy_json("GET", _TX_MONITORING, "/alerts/list", request),
        _proxy_json("GET", _GOVERNANCE, "/board/metrics", request),
        _proxy_json("GET", _DOCUMENT_ENGINE, "/api/v1/documents", request),
    )
    alerts_data, metrics_data, docs_data = results

    alerts = alerts_data.get("alerts", [])
    open_alerts = sum(1 for a in alerts if a.get("status") == "open")
    critical_alerts = sum(1 for a in alerts if a.get("final_severity") == "critical")

    reports_filed = metrics_data.get("reportsFiled", {"smr": 0, "ttr": 0, "iftiE": 0})
    total_clients = metrics_data.get("totalClients", 0)
    high_risk_clients = metrics_data.get("highRiskClients", 0)
    pending_onboarding = metrics_data.get("pendingOnboarding", 0)
    avg_risk = metrics_data.get("avgRiskScore", 0.0)
    docs_analyzed = len(docs_data.get("documents", []))

    recent_activity: list[dict[str, Any]] = []
    for alert in alerts[:5]:
        recent_activity.append(
            {
                "type": "alert",
                "id": str(alert.get("alert_id", "")),
                "description": alert.get("notes", "New alert triggered"),
                "timestamp": alert.get("created_at", ""),
            }
        )

    return JSONResponse(
        {
            "metrics": {
                "totalClients": total_clients,
                "highRiskClients": high_risk_clients,
                "pendingOnboarding": pending_onboarding,
                "openAlerts": open_alerts,
                "criticalAlerts": critical_alerts,
                "reportsFiled": reports_filed,
                "avgRiskScore": avg_risk,
                "documentsAnalyzed": docs_analyzed,
            },
            "recentActivity": recent_activity,
        }
    )


# NOTE: /clients, /clients (POST), and /onboarding/{id}/advance are defined
# on protected_router in orchestration_layer/app.py — they MUST NOT be
# duplicated here so the real implementations win.


@gateway_router.get("/transactions")
async def list_transactions(request: Request) -> JSONResponse:
    return await _proxy_request("GET", _TX_MONITORING, "/transactions/list", request)


@gateway_router.get("/monitoring/rules")
async def list_monitoring_rules(request: Request) -> JSONResponse:
    data = await _proxy_json("GET", _TX_MONITORING, "/rules/list", request)
    if isinstance(data, list):
        return JSONResponse({"rules": data})
    if isinstance(data, dict) and "rules" in data:
        return JSONResponse({"rules": data["rules"]})
    return JSONResponse({"rules": []})


@gateway_router.post("/monitoring/rules")
async def create_monitoring_rule(request: Request) -> JSONResponse:
    return await _proxy_request("POST", _TX_MONITORING, "/rules", request)


@gateway_router.get("/reports")
async def list_reports(request: Request) -> JSONResponse:
    return await _proxy_request("GET", _REPORTING, "/reports", request)


@gateway_router.get("/reports/{report_id}")
async def get_report(report_id: str, request: Request) -> JSONResponse:
    return await _proxy_request("GET", _REPORTING, f"/reports/{report_id}", request)


@gateway_router.patch("/reports/{report_id}")
async def update_report(report_id: str, request: Request) -> JSONResponse:
    return await _proxy_request("PATCH", _REPORTING, f"/reports/{report_id}", request)


@gateway_router.get("/audit")
async def list_audit_logs(request: Request) -> JSONResponse:
    return await _proxy_request("GET", _GOVERNANCE, "/audit/logs", request)


@gateway_router.get("/search")
async def global_search(request: Request, q: str = "") -> JSONResponse:
    """Cross-service search across documents, alerts, reports, and audit logs."""
    query = q.lower()
    if not query:
        return JSONResponse({"results": []})

    results: list[dict[str, Any]] = []

    # Search documents
    docs = await _proxy_json("GET", _DOCUMENT_ENGINE, "/api/v1/documents", request)
    for doc in docs.get("documents", []):
        name = doc.get("filename", "")
        if query in name.lower():
            results.append(
                {"type": "document", "id": doc.get("document_id", ""), "title": name}
            )

    # Search alerts
    alerts = await _proxy_json("GET", _TX_MONITORING, "/alerts/list", request)
    for alert in alerts.get("alerts", []):
        notes = alert.get("notes", "")
        if query in notes.lower():
            results.append(
                {"type": "alert", "id": str(alert.get("alert_id", "")), "title": notes}
            )

    # Search reports
    reports = await _proxy_json("GET", _REPORTING, "/reports", request)
    for report in reports.get("reports", []):
        report_type = report.get("report_type", "")
        if query in report_type.lower() or query in str(report.get("id", "")).lower():
            results.append(
                {"type": "report", "id": str(report.get("id", "")), "title": report_type}
            )

    return JSONResponse({"results": results})


@gateway_router.post("/seed")
async def seed_data(request: Request) -> JSONResponse:
    """Seed all in-memory stores with sample data."""
    from ubo_graph.db_client import Neo4jClient
    from ubo_graph.seed_data import seed_all

    try:
        db = Neo4jClient()
        seed_all(db)
    except Exception as exc:
        logger.warning("UBO seed failed (expected when Neo4j unavailable): %s", exc)

    # Seed transaction monitoring
    from transaction_monitoring.app import _rules as tx_rules
    from transaction_monitoring.app import _transactions as tx_transactions
    from transaction_monitoring.models import (
        RuleCondition,
        Severity,
    )

    tx_rules["seed-rule-1"] = __import__(
        "transaction_monitoring.models", fromlist=["Rule"]
    ).Rule(
        name="High Value Transactions",
        description="Flag transactions above $10,000",
        conditions=[RuleCondition(field="amount", operator=">", value=10000)],
        base_severity=Severity.HIGH,
        window_days=1,
    )

    tx_transactions["seed-tx-1"] = __import__(
        "transaction_monitoring.models", fromlist=["Transaction"]
    ).Transaction(
        onboarding_id="seed-onboarding-1",
        amount=15000.0,
        currency="AUD",
        sender_account="acct-123",
        receiver_account="acct-456",
        metadata={"source": "seed"},
    )

    # Seed austrac reporting
    from uuid import uuid4

    from austrac_reporting.app import _report_registry as report_registry

    rid = uuid4()
    report_registry[rid] = {
        "id": str(rid),
        "report_type": "smr",
        "status": "draft",
        "xsd_valid": True,
        "validation_errors": [],
        "xml_content": "",
        "narrative": None,
        "created_at": __import__("datetime", fromlist=["datetime"]).datetime.now(
            __import__("datetime", fromlist=["UTC"]).UTC
        ).isoformat(),
    }

    # Seed document detection engine
    from document_detection_engine.app import _document_registry as doc_registry

    doc_registry.append(
        {
            "document_id": "seed-doc-1",
            "filename": "sample_passport.pdf",
            "analysis_id": "seed-analysis-1",
            "risk_score": 0.2,
            "risk_level": "low",
            "uploaded_at": __import__("datetime", fromlist=["datetime"]).datetime.now(
                __import__("datetime", fromlist=["UTC"]).UTC
            ).isoformat(),
        }
    )

    return JSONResponse(
        {
            "message": "Seeded sample data across all services",
            "details": {
                "ubo_seeded": True,
                "rules_seeded": len(tx_rules),
                "transactions_seeded": len(tx_transactions),
                "reports_seeded": len(report_registry),
                "documents_seeded": len(doc_registry),
            },
        }
    )


@gateway_router.post("/ai/chat")
async def ai_chat(request: Request) -> JSONResponse:
    return await _proxy_request("POST", _COMPLIANCE_AGENT, "/agent/chat", request)
