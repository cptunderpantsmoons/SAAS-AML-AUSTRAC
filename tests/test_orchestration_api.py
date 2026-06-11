from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from orchestration_layer.app import _workflow_store, create_app
from orchestration_layer.config import Settings


@pytest.fixture
def settings() -> Settings:
    return Settings(
        kyc_provider="veriff",
        sanctions_provider="open_sanctions",
        kyb_provider="kyckr",
    )


@pytest.fixture
def app(settings: Settings):
    app = create_app(settings=settings)
    _workflow_store.clear()
    return app


@pytest.fixture
def client(app):
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


class TestHealthEndpoint:
    @pytest.mark.asyncio
    async def test_healthz(self, client: AsyncClient) -> None:
        resp = await client.get("/healthz")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "ok"
        assert body["service"] == "orchestration-layer"


class TestInitiateOnboarding:
    @pytest.mark.asyncio
    async def test_initiate_individual(self, client: AsyncClient) -> None:
        resp = await client.post(
            "/onboarding/initiate",
            json={
                "entity_name": "John Doe",
                "entity_type": "individual",
                "country_code": "AU",
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "onboarding_id" in body
        assert body["state"] == "initiated"

    @pytest.mark.asyncio
    async def test_initiate_organisation(self, client: AsyncClient) -> None:
        resp = await client.post(
            "/onboarding/initiate",
            json={
                "entity_name": "Acme Corp",
                "entity_type": "organisation",
                "country_code": "AU",
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["state"] == "initiated"

    @pytest.mark.asyncio
    async def test_rejects_invalid_entity_type(self, client: AsyncClient) -> None:
        resp = await client.post(
            "/onboarding/initiate",
            json={
                "entity_name": "Test",
                "entity_type": "trust",
                "country_code": "AU",
            },
        )
        assert resp.status_code == 422


class TestOnboardingStatus:
    @pytest.mark.asyncio
    async def test_status_not_found(self, client: AsyncClient) -> None:
        resp = await client.get("/onboarding/status/nonexistent-id")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_status_after_initiate(self, client: AsyncClient) -> None:
        # First, create an onboarding
        initiate_resp = await client.post(
            "/onboarding/initiate",
            json={
                "entity_name": "Jane Smith",
                "entity_type": "individual",
                "country_code": "AU",
            },
        )
        onboarding_id = initiate_resp.json()["onboarding_id"]

        # Then check status
        status_resp = await client.get(f"/onboarding/status/{onboarding_id}")
        assert status_resp.status_code == 200
        body = status_resp.json()
        assert body["onboarding_id"] == onboarding_id
        assert body["entity_name"] == "Jane Smith"


class TestKYCVerify:
    @pytest.mark.asyncio
    async def test_kyc_verify_not_found(self, client: AsyncClient) -> None:
        resp = await client.post(
            "/kyc/verify",
            json={
                "onboarding_id": "nonexistent",
                "full_name": "Test",
                "document_type": "passport",
                "country_of_issue": "AU",
            },
        )
        assert resp.status_code == 404
