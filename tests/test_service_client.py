from __future__ import annotations

from typing import Any

import httpx
import pytest
from compliance_agent.config import Settings
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


def _make_client(mock_transport: _MockTransport) -> ComplianceServiceClient:
    return ComplianceServiceClient(
        gateway_url="http://test-gateway",
        client=httpx.AsyncClient(transport=httpx.MockTransport(mock_transport)),
    )


@pytest.mark.asyncio
class TestOnboardEntity:
    async def test_posts_correct_payload(self) -> None:
        mock = _MockTransport(json_body={"onboarding_id": "oid-1"})
        client = _make_client(mock)
        result = await client.onboard_entity("Acme Corp", "organisation", "AU")
        await client.aclose()
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
    async def test_gets_correct_path(self) -> None:
        mock = _MockTransport(json_body={"state": "completed"})
        client = _make_client(mock)
        result = await client.check_onboarding_status("oid-1")
        await client.aclose()
        assert result == {"state": "completed"}
        req = mock.last_request
        assert req is not None
        assert req.method == "GET"
        assert req.url.path == "/onboarding/status/oid-1"

    async def test_encodes_onboarding_id_in_path(self) -> None:
        mock = _MockTransport(json_body={"state": "completed"})
        client = _make_client(mock)
        await client.check_onboarding_status("oid/1?")
        await client.aclose()
        req = mock.last_request
        assert req is not None
        assert req.url.raw_path == b"/onboarding/status/oid%2F1%3F"


@pytest.mark.asyncio
class TestAnalyzeDocument:
    async def test_posts_multipart(self) -> None:
        mock = _MockTransport(json_body={"risk_score": 42})
        client = _make_client(mock)
        result = await client.analyze_document(b"filedata", "doc.pdf", "application/pdf")
        await client.aclose()
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
    async def test_posts_correct_path_and_json(self) -> None:
        mock = _MockTransport(json_body={"report_id": "r-1"})
        client = _make_client(mock)
        result = await client.generate_report("suspicious_matter", {"entity_id": "e-1"})
        await client.aclose()
        assert result == {"report_id": "r-1"}
        req = mock.last_request
        assert req is not None
        assert req.method == "POST"
        assert req.url.path == "/reports/generate/suspicious_matter"
        body = await req.aread()
        assert b"entity_id" in body

    async def test_encodes_report_type_in_path(self) -> None:
        mock = _MockTransport(json_body={"report_id": "r-1"})
        client = _make_client(mock)
        await client.generate_report("type with#space", {"entity_id": "e-1"})
        await client.aclose()
        req = mock.last_request
        assert req is not None
        assert req.url.raw_path == b"/reports/generate/type%20with%23space"


@pytest.mark.asyncio
class TestDraftNarrative:
    async def test_posts_correct_json(self) -> None:
        mock = _MockTransport(json_body={"narrative": "narr-1"})
        client = _make_client(mock)
        result = await client.draft_narrative({"summary": "test"})
        await client.aclose()
        assert result == {"narrative": "narr-1"}
        req = mock.last_request
        assert req is not None
        assert req.method == "POST"
        assert req.url.path == "/reports/narrative/draft"
        body = await req.aread()
        assert b"summary" in body


@pytest.mark.asyncio
class TestTransmitReport:
    async def test_posts_correct_path_and_json(self) -> None:
        mock = _MockTransport(json_body={"transmitted": True})
        client = _make_client(mock)
        result = await client.transmit_report("r-1", "suspicious_matter", "<xml/>")
        await client.aclose()
        assert result == {"transmitted": True}
        req = mock.last_request
        assert req is not None
        assert req.method == "POST"
        assert req.url.path == "/reports/r-1/transmit"
        body = await req.aread()
        assert b"suspicious_matter" in body
        assert b"<xml/>" in body

    async def test_encodes_report_id_in_path(self) -> None:
        mock = _MockTransport(json_body={"transmitted": True})
        client = _make_client(mock)
        await client.transmit_report("r/1", "suspicious_matter", "<xml/>")
        await client.aclose()
        req = mock.last_request
        assert req is not None
        assert req.url.raw_path == b"/reports/r%2F1/transmit"


@pytest.mark.asyncio
class TestGetBoardMetrics:
    async def test_gets_correct_path(self) -> None:
        mock = _MockTransport(json_body={"metrics": []})
        client = _make_client(mock)
        result = await client.get_board_metrics()
        await client.aclose()
        assert result == {"metrics": []}
        req = mock.last_request
        assert req is not None
        assert req.method == "GET"
        assert req.url.path == "/governance/metrics"


@pytest.mark.asyncio
class TestListAlerts:
    async def test_gets_correct_path(self) -> None:
        mock = _MockTransport(json_body={"alerts": []})
        client = _make_client(mock)
        result = await client.list_alerts()
        await client.aclose()
        assert result == {"alerts": []}
        req = mock.last_request
        assert req is not None
        assert req.method == "GET"
        assert req.url.path == "/alerts"


@pytest.mark.asyncio
class TestCalculateUBO:
    async def test_gets_with_params(self) -> None:
        mock = _MockTransport(json_body={"owners": []})
        client = _make_client(mock)
        result = await client.calculate_ubo("ent-1")
        await client.aclose()
        assert result == {"owners": []}
        req = mock.last_request
        assert req is not None
        assert req.method == "GET"
        assert req.url.path == "/ubo/calculate"
        assert req.url.query == b"entity_id=ent-1"


@pytest.mark.asyncio
class TestSignReport:
    async def test_posts_correct_path_and_json(self) -> None:
        mock = _MockTransport(json_body={"signature": "ok"})
        client = _make_client(mock)
        result = await client.sign_report("r-1", {"hash": "abc"}, "Officer X")
        await client.aclose()
        assert result == {"signature": "ok"}
        req = mock.last_request
        assert req is not None
        assert req.method == "POST"
        assert req.url.path == "/reports/r-1/sign"
        body = await req.aread()
        assert b"hash" in body
        assert b"Officer X" in body

    async def test_encodes_report_id_in_path(self) -> None:
        mock = _MockTransport(json_body={"signature": "ok"})
        client = _make_client(mock)
        await client.sign_report("r?1", {"hash": "abc"}, "Officer X")
        await client.aclose()
        req = mock.last_request
        assert req is not None
        assert req.url.raw_path == b"/reports/r%3F1/sign"


@pytest.mark.asyncio
class TestHTTPErrorHandling:
    async def test_raises_on_5xx(self) -> None:
        mock = _MockTransport(status_code=500, json_body={"detail": "boom"})
        client = _make_client(mock)
        with pytest.raises(httpx.HTTPStatusError):
            await client.list_alerts()
        await client.aclose()

    async def test_raises_on_4xx(self) -> None:
        mock = _MockTransport(status_code=404, json_body={"detail": "not found"})
        client = _make_client(mock)
        with pytest.raises(httpx.HTTPStatusError):
            await client.check_onboarding_status("missing")
        await client.aclose()


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

    def test_allows_client_injection(self) -> None:
        mock = _MockTransport()
        http_client = httpx.AsyncClient(transport=httpx.MockTransport(mock))
        client = ComplianceServiceClient(gateway_url="http://example.com", client=http_client)
        assert client._client is http_client

    @pytest.mark.asyncio
    async def test_aclose_closes_underlying_client(self) -> None:
        mock = _MockTransport()
        client = _make_client(mock)
        await client.aclose()
        assert client._client.is_closed

    def test_from_settings_uses_configured_values(self) -> None:
        settings = Settings(gateway_url="http://gateway.local", agent_timeout_seconds=45.0)
        client = ComplianceServiceClient.from_settings(settings)
        assert client._base_url == "http://gateway.local"
        assert client._timeout == 45.0
