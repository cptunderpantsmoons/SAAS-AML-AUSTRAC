from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from auth.config import AuthSettings, get_auth_settings
from auth.dependencies import get_session
from fastapi.testclient import TestClient
from orchestration_layer.app import create_app


def _mock_auth(app: Any) -> None:
    """Override auth dependencies so tests can call protected routes without a real session."""

    async def _mock_session() -> Any:
        mock = MagicMock()
        mock.get_user_id.return_value = "test-user"
        mock.get_access_token_payload.return_value = {"st-role": {"v": ["compliance_officer"]}}
        return mock

    app.dependency_overrides[get_session] = _mock_session
    app.dependency_overrides[get_auth_settings] = lambda: AuthSettings(enable_middleware=False)


@pytest.fixture
def client() -> TestClient:
    app = create_app()
    _mock_auth(app)
    return TestClient(app)


def _make_async_client(data: Any, status: int = 200):
    """Build a mock AsyncClient whose .request() returns the given response."""
    resp = MagicMock()
    resp.status_code = status
    resp.json.return_value = data

    async def _request(*args, **kwargs):
        return resp

    async def _aclose():
        pass

    client = MagicMock()
    client.request = _request
    client.aclose = _aclose
    return client


@patch("orchestration_layer.gateway.httpx.AsyncClient")
def test_documents_list_returns_downstream_data(mock_cls, client: TestClient) -> None:
    mock_cls.return_value = _make_async_client(
        {"documents": [{"document_id": "doc-1"}], "pagination": {"total": 1}}
    )
    resp = client.get("/documents")
    assert resp.status_code == 200
    data = resp.json()
    assert "documents" in data


@patch("orchestration_layer.gateway.httpx.AsyncClient")
def test_transactions_list_returns_downstream_data(mock_cls, client: TestClient) -> None:
    mock_cls.return_value = _make_async_client([{"transaction_id": "tx-1"}])
    resp = client.get("/transactions")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)


@patch("orchestration_layer.gateway.httpx.AsyncClient")
def test_reports_list_returns_downstream_data(mock_cls, client: TestClient) -> None:
    mock_cls.return_value = _make_async_client(
        {"reports": [{"id": "r-1"}], "pagination": {"total": 1}}
    )
    resp = client.get("/reports")
    assert resp.status_code == 200
    data = resp.json()
    assert "reports" in data


@patch("orchestration_layer.gateway.httpx.AsyncClient")
def test_audit_logs_list_returns_downstream_data(mock_cls, client: TestClient) -> None:
    mock_cls.return_value = _make_async_client(
        {"logs": [{"audit_id": "a-1"}], "pagination": {"total": 1}}
    )
    resp = client.get("/audit")
    assert resp.status_code == 200
    data = resp.json()
    assert "logs" in data


@patch("orchestration_layer.gateway._proxy_json")
def test_monitoring_rules_list_returns_downstream_data(mock_proxy, client: TestClient) -> None:
    mock_proxy.return_value = [{"rule_id": "rule-1", "name": "High Value"}]
    resp = client.get("/monitoring/rules")
    assert resp.status_code == 200
    data = resp.json()
    assert "rules" in data
    assert len(data["rules"]) == 1


def test_search_returns_empty_when_no_query(client: TestClient) -> None:
    """GET /search without q should return empty results."""
    resp = client.get("/search")
    assert resp.status_code == 200
    data = resp.json()
    assert data["results"] == []


def test_seed_populates_stores(client: TestClient) -> None:
    """POST /seed should populate in-memory stores."""
    resp = client.post("/seed")
    assert resp.status_code == 200
    data = resp.json()
    assert data["message"] == "Seeded sample data across all services"
    details = data["details"]
    assert details["ubo_seeded"] is True
    assert details["rules_seeded"] > 0
    assert details["transactions_seeded"] > 0
    assert details["reports_seeded"] > 0
    assert details["documents_seeded"] > 0
