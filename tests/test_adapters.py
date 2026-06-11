from __future__ import annotations

from typing import Any

import pytest
from orchestration_layer.adapters.circuit_breaker import CircuitBreaker
from orchestration_layer.adapters.kyckr import KyckrAdapter
from orchestration_layer.adapters.open_sanctions import OpenSanctionsAdapter
from orchestration_layer.adapters.veriff import VeriffAdapter
from orchestration_layer.models import (
    KYBStatus,
    KYCStatus,
    SanctionsMatchStatus,
)

# We use httpx's mock transport to simulate vendor API responses.


class TestVeriffAdapter:
    @pytest.mark.asyncio
    async def test_initiate_verification_returns_in_progress(self) -> None:
        handler = _mock_handler(201, {
            "verification": {"id": "sess-123", "status": "created"},
        })
        adapter = VeriffAdapter(
            api_key="test-key",
            circuit_breaker=CircuitBreaker("veriff-test"),
            base_url="http://mock-veriff",
        )
        # Patch the client transport
        adapter._client = _patch_client(adapter._client, handler)

        result = await adapter.initiate_verification(full_name="John Doe")
        assert result.provider == "veriff"
        assert result.status == KYCStatus.IN_PROGRESS
        assert result.verification_id == "sess-123"

    @pytest.mark.asyncio
    async def test_poll_returns_verified(self) -> None:
        handler = _mock_handler(200, {
            "verification": {"id": "sess-456", "code": 9001, "status": "approved"},
        })
        adapter = VeriffAdapter(
            api_key="test-key",
            circuit_breaker=CircuitBreaker("veriff-test"),
            base_url="http://mock-veriff",
        )
        adapter._client = _patch_client(adapter._client, handler)

        result = await adapter.poll_verification_status("sess-456")
        assert result.status == KYCStatus.VERIFIED
        assert result.confidence == 0.95

    @pytest.mark.asyncio
    async def test_webhook_approved(self) -> None:
        adapter = VeriffAdapter(
            api_key="test-key",
            circuit_breaker=CircuitBreaker("veriff-test"),
        )
        result = await adapter.handle_webhook({"id": "sess-789", "status": "approved"})
        assert result.status == KYCStatus.VERIFIED

    @pytest.mark.asyncio
    async def test_webhook_declined(self) -> None:
        adapter = VeriffAdapter(api_key="test-key", circuit_breaker=CircuitBreaker("veriff-test"))
        result = await adapter.handle_webhook({"id": "sess-000", "status": "declined"})
        assert result.status == KYCStatus.REJECTED

    @pytest.mark.asyncio
    async def test_initiate_verification_handles_error(self) -> None:
        def handler(request: Any) -> Any:
            raise ConnectionError("network down")

        adapter = VeriffAdapter(
            api_key="test-key",
            circuit_breaker=CircuitBreaker("veriff-test", failure_threshold=10),
            base_url="http://mock-veriff",
        )
        adapter._client = _patch_client(adapter._client, handler)

        result = await adapter.initiate_verification(full_name="Error Test")
        assert result.status == KYCStatus.ERROR

    @pytest.mark.asyncio
    async def test_health_check_success(self) -> None:
        handler = _mock_handler(200, {})
        adapter = VeriffAdapter(
            api_key="test-key",
            circuit_breaker=CircuitBreaker("veriff-test"),
            base_url="http://mock-veriff",
        )
        adapter._client = _patch_client(adapter._client, handler)
        assert await adapter.health_check() is True

    @pytest.mark.asyncio
    async def test_health_check_failure(self) -> None:
        def handler(request: Any) -> Any:
            raise ConnectionError("down")

        adapter = VeriffAdapter(
            api_key="test-key",
            circuit_breaker=CircuitBreaker("veriff-test"),
            base_url="http://mock-veriff",
        )
        adapter._client = _patch_client(adapter._client, handler)
        assert await adapter.health_check() is False


class TestOpenSanctionsAdapter:
    @pytest.mark.asyncio
    async def test_screen_individual_no_match(self) -> None:
        handler = _mock_handler(200, {"results": []})
        adapter = OpenSanctionsAdapter(
            api_key="test-key",
            circuit_breaker=CircuitBreaker("os-test"),
            base_url="http://mock-os",
        )
        adapter._client = _patch_client(adapter._client, handler)

        result = await adapter.screen_individual(full_name="Clean Person")
        assert result.match_status == SanctionsMatchStatus.NO_MATCH
        assert result.confidence == 0.0

    @pytest.mark.asyncio
    async def test_screen_individual_confirmed_match(self) -> None:
        handler = _mock_handler(200, {
            "results": [
                {"id": "Q7747", "caption": "Vladimir Putin", "score": 0.95, "schema": "Person"},
            ],
        })
        adapter = OpenSanctionsAdapter(
            api_key="test-key",
            circuit_breaker=CircuitBreaker("os-test"),
            base_url="http://mock-os",
        )
        adapter._client = _patch_client(adapter._client, handler)

        result = await adapter.screen_individual(full_name="Vladimir Putin")
        assert result.match_status == SanctionsMatchStatus.CONFIRMED_MATCH
        assert result.confidence >= 0.85

    @pytest.mark.asyncio
    async def test_screen_individual_possible_match(self) -> None:
        handler = _mock_handler(200, {
            "results": [
                {"id": "Q123", "caption": "Similar Name", "score": 0.65, "schema": "Person"},
            ],
        })
        adapter = OpenSanctionsAdapter(
            api_key="test-key",
            circuit_breaker=CircuitBreaker("os-test"),
            base_url="http://mock-os",
        )
        adapter._client = _patch_client(adapter._client, handler)

        result = await adapter.screen_individual(full_name="Similar Name")
        assert result.match_status == SanctionsMatchStatus.POSSIBLE_MATCH

    @pytest.mark.asyncio
    async def test_screen_organisation(self) -> None:
        handler = _mock_handler(200, {"results": []})
        adapter = OpenSanctionsAdapter(
            api_key="test-key",
            circuit_breaker=CircuitBreaker("os-test"),
            base_url="http://mock-os",
        )
        adapter._client = _patch_client(adapter._client, handler)

        result = await adapter.screen_organisation(name="Clean Corp")
        assert result.match_status == SanctionsMatchStatus.NO_MATCH

    @pytest.mark.asyncio
    async def test_batch_screen(self) -> None:
        handler = _mock_handler(200, {"results": []})
        adapter = OpenSanctionsAdapter(
            api_key="test-key",
            circuit_breaker=CircuitBreaker("os-test"),
            base_url="http://mock-os",
        )
        adapter._client = _patch_client(adapter._client, handler)

        entities = [
            {"name": "Person A", "entity_type": "individual"},
            {"name": "Corp B", "entity_type": "organisation"},
        ]
        results = await adapter.batch_screen(entities)
        assert len(results) == 2

    @pytest.mark.asyncio
    async def test_screen_handles_error(self) -> None:
        def handler(request: Any) -> Any:
            raise ConnectionError("down")

        adapter = OpenSanctionsAdapter(
            api_key="test-key",
            circuit_breaker=CircuitBreaker("os-test", failure_threshold=10),
            base_url="http://mock-os",
        )
        adapter._client = _patch_client(adapter._client, handler)

        result = await adapter.screen_individual(full_name="Error Person")
        assert result.match_status == SanctionsMatchStatus.ERROR


class TestKyckrAdapter:
    @pytest.mark.asyncio
    async def test_lookup_entity_found(self) -> None:
        handler = _mock_handler(200, {
            "entities": [{
                "name": "Acme Pty Ltd",
                "registrationId": "123456789",
                "countryCode": "AU",
                "matchScore": 0.95,
            }],
        })
        adapter = KyckrAdapter(
            api_key="test-key",
            circuit_breaker=CircuitBreaker("kyckr-test"),
            base_url="http://mock-kyckr",
        )
        adapter._client = _patch_client(adapter._client, handler)

        result = await adapter.lookup_entity(name="Acme Pty Ltd")
        assert result.status == KYBStatus.FOUND
        assert result.entity_name == "Acme Pty Ltd"
        assert result.registration_id == "123456789"

    @pytest.mark.asyncio
    async def test_lookup_entity_not_found(self) -> None:
        handler = _mock_handler(200, {"entities": []})
        adapter = KyckrAdapter(
            api_key="test-key",
            circuit_breaker=CircuitBreaker("kyckr-test"),
            base_url="http://mock-kyckr",
        )
        adapter._client = _patch_client(adapter._client, handler)

        result = await adapter.lookup_entity(name="Nonexistent Corp")
        assert result.status == KYBStatus.NOT_FOUND

    @pytest.mark.asyncio
    async def test_resolve_entity_falls_back_to_lookup(self) -> None:
        handler = _mock_handler(200, {"entities": []})
        adapter = KyckrAdapter(
            api_key="test-key",
            circuit_breaker=CircuitBreaker("kyckr-test"),
            base_url="http://mock-kyckr",
        )
        adapter._client = _patch_client(adapter._client, handler)

        result = await adapter.resolve_entity(name="Ghost Corp")
        assert result.status == KYBStatus.NOT_FOUND

    @pytest.mark.asyncio
    async def test_lookup_handles_error(self) -> None:
        def handler(request: Any) -> Any:
            raise ConnectionError("down")

        adapter = KyckrAdapter(
            api_key="test-key",
            circuit_breaker=CircuitBreaker("kyckr-test", failure_threshold=10),
            base_url="http://mock-kyckr",
        )
        adapter._client = _patch_client(adapter._client, handler)

        result = await adapter.lookup_entity(name="Error Corp")
        assert result.status == KYBStatus.ERROR


# ── Test helpers ────────────────────────────────────────────────────────────


def _mock_handler(status_code: int, body: dict[str, Any]) -> Any:
    """Create a mock handler that returns a fixed response."""
    import httpx

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status_code, json=body)

    return handler


def _patch_client(client: Any, handler: Any) -> Any:
    """Replace an httpx.AsyncClient's transport with a mock handler."""
    import httpx

    client._transport = httpx.MockTransport(handler)
    return client
