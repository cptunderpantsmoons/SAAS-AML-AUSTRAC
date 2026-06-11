from __future__ import annotations

from typing import Any
from unittest.mock import patch

import httpx
import pytest
from compliance_agent.service_client import ComplianceServiceClient


class _MockTransport:
    """Records the last request and returns a configured response."""

    def __init__(self, status_code: int = 200, json_body: dict[str, Any] | None = None) -> None:
        self.status_code = status_code
        self.json_body = json_body or {}
        self.last_request: httpx.Request | None = None

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.last_request = request
        return httpx.Response(self.status_code, json=self.json_body)


def _patched_async_client(mock: _MockTransport) -> type[httpx.AsyncClient]:
    """Return an httpx.AsyncClient subclass wired to the given mock transport."""

    class _Client(httpx.AsyncClient):
        def __init__(self, *a: Any, **kw: Any) -> None:
            kw["transport"] = httpx.MockTransport(mock)
            super().__init__(*a, **kw)

    return _Client


@pytest.fixture
def client() -> ComplianceServiceClient:
    return ComplianceServiceClient(gateway_url="http://test-gateway")


@pytest.mark.asyncio
class TestOnboardEntity:
    async def test_posts_correct_payload(self, client: ComplianceServiceClient) -> None:
        mock = _MockTransport(json_body={"onboarding_id": "oid-1"})
        with patch("httpx.AsyncClient", _patched_async_client(mock)):
            result = await client.onboard_entity("Acme Corp", "organisation", "AU")
        assert result == {"onboarding_id": "oid-1"}
        req = mock.last_request
        assert req is not None
        assert req.method == "POST"
        assert req.url.path == "/onboarding/initiate"
        assert req.url.host == "test-gateway"
        body = await req.aread()
        assert b"Acme Corp" in body
        assert b"organisation" in body
        assert b"AU" in body


@pytest.mark.asyncio
class TestCheckOnboardingStatus:
    async def test_gets_correct_path(self, client: ComplianceServiceClient) -> None:
        mock = _MockTransport(json_body={"state": "completed"})
        with patch("httpx.AsyncClient", _patched_async_client(mock)):
            result = await client.check_onboarding_status("oid-1")
        assert result == {"state": "completed"}
        req = mock.last_request
        assert req is not None
        assert req.method == "GET"
        assert req.url.path == "/onboarding/status/oid-1"


@pytest.mark.asyncio
class TestAnalyzeDocument:
    async def test_posts_multipart(self, client: ComplianceServiceClient) -> None:
        mock = _MockTransport(json_body={"risk_score": 42})
        with patch("httpx.AsyncClient", _patched_async_client(mock)):
            result = await client.analyze_document(b"filedata", "doc.pdf", "application/pdf")
        assert result == {"risk_score": 42}
        req = mock.last_request
        assert req is not None
        assert req.method == "POST"
        assert req.url.path == "/documents/analyze"
        body = await req.aread()
        assert b"filedata" in body
        assert b"doc.pdf" in body
        assert b"application/pdf" in body


@pytest.mark.asyncio
class TestGenerateReport:
    async def test_posts_correct_path_and_json(self, client: ComplianceServiceClient) -> None:
        mock = _MockTransport(json_body={"report_id": "r-1"})
        with patch("httpx.AsyncClient", _patched_async_client(mock)):
            result = await client.generate_report("suspicious_matter", {"entity_id": "e-1"})
        assert result == {"report_id": "r-1"}
        req = mock.last_request
        assert req is not None
        assert req.method == "POST"
        assert req.url.path == "/reports/generate/suspicious_matter"
        body = await req.aread()
        assert b"entity_id" in body


@pytest.mark.asyncio
class TestDraftNarrative:
    async def test_posts_correct_json(self, client: ComplianceServiceClient) -> None:
        mock = _MockTransport(json_body={"narrative": "narr-1"})
        with patch("httpx.AsyncClient", _patched_async_client(mock)):
            result = await client.draft_narrative({"summary": "test"})
        assert result == {"narrative": "narr-1"}
        req = mock.last_request
        assert req is not None
        assert req.method == "POST"
        assert req.url.path == "/reports/narrative/draft"
        body = await req.aread()
        assert b"summary" in body


@pytest.mark.asyncio
class TestTransmitReport:
    async def test_posts_correct_path_and_json(self, client: ComplianceServiceClient) -> None:
        mock = _MockTransport(json_body={"transmitted": True})
        with patch("httpx.AsyncClient", _patched_async_client(mock)):
            result = await client.transmit_report("r-1", "suspicious_matter", "<xml/>")
        assert result == {"transmitted": True}
        req = mock.last_request
        assert req is not None
        assert req.method == "POST"
        assert req.url.path == "/reports/r-1/transmit"
        body = await req.aread()
        assert b"suspicious_matter" in body
        assert b"<xml/>" in body


@pytest.mark.asyncio
class TestGetBoardMetrics:
    async def test_gets_correct_path(self, client: ComplianceServiceClient) -> None:
        mock = _MockTransport(json_body={"metrics": []})
        with patch("httpx.AsyncClient", _patched_async_client(mock)):
            result = await client.get_board_metrics()
        assert result == {"metrics": []}
        req = mock.last_request
        assert req is not None
        assert req.method == "GET"
        assert req.url.path == "/governance/metrics"


@pytest.mark.asyncio
class TestListAlerts:
    async def test_gets_correct_path(self, client: ComplianceServiceClient) -> None:
        mock = _MockTransport(json_body={"alerts": []})
        with patch("httpx.AsyncClient", _patched_async_client(mock)):
            result = await client.list_alerts()
        assert result == {"alerts": []}
        req = mock.last_request
        assert req is not None
        assert req.method == "GET"
        assert req.url.path == "/alerts"


@pytest.mark.asyncio
class TestCalculateUBO:
    async def test_gets_with_params(self, client: ComplianceServiceClient) -> None:
        mock = _MockTransport(json_body={"owners": []})
        with patch("httpx.AsyncClient", _patched_async_client(mock)):
            result = await client.calculate_ubo("ent-1")
        assert result == {"owners": []}
        req = mock.last_request
        assert req is not None
        assert req.method == "GET"
        assert req.url.path == "/ubo/calculate"
        assert req.url.query == b"entity_id=ent-1"


@pytest.mark.asyncio
class TestSignReport:
    async def test_posts_correct_path_and_json(self, client: ComplianceServiceClient) -> None:
        mock = _MockTransport(json_body={"signature": "ok"})
        with patch("httpx.AsyncClient", _patched_async_client(mock)):
            result = await client.sign_report("r-1", {"hash": "abc"}, "Officer X")
        assert result == {"signature": "ok"}
        req = mock.last_request
        assert req is not None
        assert req.method == "POST"
        assert req.url.path == "/reports/r-1/sign"
        body = await req.aread()
        assert b"hash" in body
        assert b"Officer X" in body


@pytest.mark.asyncio
class TestHTTPErrorHandling:
    async def test_raises_on_5xx(self, client: ComplianceServiceClient) -> None:
        mock = _MockTransport(status_code=500, json_body={"detail": "boom"})
        with pytest.raises(httpx.HTTPStatusError), patch("httpx.AsyncClient", _patched_async_client(mock)):
            await client.list_alerts()

    async def test_raises_on_4xx(self, client: ComplianceServiceClient) -> None:
        mock = _MockTransport(status_code=404, json_body={"detail": "not found"})
        with pytest.raises(httpx.HTTPStatusError), patch("httpx.AsyncClient", _patched_async_client(mock)):
            await client.check_onboarding_status("missing")


class TestComplianceServiceClientInit:
    def test_rejects_empty_gateway_url(self) -> None:
        with pytest.raises(ValueError, match="gateway_url must not be empty"):
            ComplianceServiceClient(gateway_url="")

    def test_strips_trailing_slash(self) -> None:
        client = ComplianceServiceClient(gateway_url="http://example.com/")
        assert client._base_url == "http://example.com"

    def test_default_timeout(self) -> None:
        client = ComplianceServiceClient(gateway_url="http://example.com")
        assert client._timeout == 30.0

    def test_custom_timeout(self) -> None:
        client = ComplianceServiceClient(gateway_url="http://example.com", timeout=60.0)
        assert client._timeout == 60.0
