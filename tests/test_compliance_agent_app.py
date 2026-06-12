from __future__ import annotations

import asyncio
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest
from auth.config import AuthSettings, get_auth_settings
from auth.dependencies import get_session
from compliance_agent.app import create_app
from compliance_agent.config import Settings
from compliance_agent.ingestion import IngestionPipeline
from compliance_agent.mail_client import AgentMailClient
from compliance_agent.models import AgentTask, ChatResponse, EmailIngestionResult
from compliance_agent.service_client import ComplianceServiceClient


def _mock_auth(app: Any) -> None:
    """Override auth dependencies so tests can call protected routes without a real session."""

    async def _mock_session() -> Any:
        mock = MagicMock()
        mock.get_user_id.return_value = "test-user"
        mock.get_access_token_payload.return_value = {"st-role": {"v": ["compliance_officer"]}}
        return mock

    app.dependency_overrides[get_session] = _mock_session
    app.dependency_overrides[get_auth_settings] = lambda: AuthSettings(enable_middleware=False)


@pytest.fixture(autouse=True)
def reset_app_globals(monkeypatch: pytest.MonkeyPatch) -> None:
    import compliance_agent.app as app_module

    monkeypatch.setattr(app_module, "_compliance_client", None)
    monkeypatch.setattr(app_module, "_mail_client", None)
    monkeypatch.setattr(app_module, "_ingestion_pipeline", None)
    monkeypatch.setattr(app_module, "_task_store", {})


@pytest.fixture(autouse=True)
def mock_supertokens(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("compliance_agent.app.init_supertokens", lambda *args, **kwargs: None)
    monkeypatch.setattr("compliance_agent.app.setup_supertokens_middleware", lambda *args, **kwargs: None)

    async def _mock_get_roles_for_user(*args: Any, **kwargs: Any) -> Any:
        mock = MagicMock()
        mock.roles = ["compliance_officer"]
        return mock

    monkeypatch.setattr("supertokens_python.recipe.userroles.asyncio.get_roles_for_user", _mock_get_roles_for_user)


@pytest.fixture
def app_module() -> Any:
    import compliance_agent.app

    return compliance_agent.app


# ── Lifespan ────────────────────────────────────────────────────────────────


class TestLifespan:
    @pytest.mark.asyncio
    async def test_initializes_clients_and_starts_subscription(
        self, app_module: Any, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        mock_settings = Settings()
        monkeypatch.setattr(app_module, "get_settings", lambda: mock_settings)

        mock_service = MagicMock(spec=ComplianceServiceClient)
        mock_service.aclose = AsyncMock()
        monkeypatch.setattr(
            app_module.ComplianceServiceClient, "from_settings", lambda _s: mock_service
        )

        mock_mail = MagicMock(spec=AgentMailClient)
        mock_mail.create_inbox = AsyncMock()
        mock_mail.subscribe_inbound = AsyncMock(
            return_value=asyncio.create_task(asyncio.sleep(0))
        )
        mock_mail.aclose = AsyncMock()
        monkeypatch.setattr(app_module.AgentMailClient, "from_settings", lambda _s: mock_mail)

        app = create_app()
        async with app_module.lifespan(app):
            assert app_module._compliance_client is mock_service
            assert app_module._mail_client is mock_mail
            assert app_module._ingestion_pipeline is not None
            mock_mail.create_inbox.assert_awaited_once()
            mock_mail.subscribe_inbound.assert_awaited_once()
            assert hasattr(app.state, "ws_task")

        mock_mail.aclose.assert_awaited_once()
        mock_service.aclose.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_graceful_when_inbox_creation_fails(
        self, app_module: Any, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        mock_settings = Settings()
        monkeypatch.setattr(app_module, "get_settings", lambda: mock_settings)

        mock_service = MagicMock(spec=ComplianceServiceClient)
        mock_service.aclose = AsyncMock()
        monkeypatch.setattr(
            app_module.ComplianceServiceClient, "from_settings", lambda _s: mock_service
        )

        mock_mail = MagicMock(spec=AgentMailClient)
        mock_mail.create_inbox = AsyncMock(side_effect=RuntimeError("network error"))
        mock_mail.aclose = AsyncMock()
        monkeypatch.setattr(app_module.AgentMailClient, "from_settings", lambda _s: mock_mail)

        app = create_app()
        async with app_module.lifespan(app):
            assert app_module._compliance_client is mock_service
            assert app_module._mail_client is mock_mail
            assert app_module._ingestion_pipeline is None
            mock_mail.create_inbox.assert_awaited_once()
            mock_mail.subscribe_inbound.assert_not_called()

        mock_mail.aclose.assert_awaited_once()
        mock_service.aclose.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_cancels_websocket_task_on_shutdown(
        self, app_module: Any, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        mock_settings = Settings()
        monkeypatch.setattr(app_module, "get_settings", lambda: mock_settings)

        mock_service = MagicMock(spec=ComplianceServiceClient)
        mock_service.aclose = AsyncMock()
        monkeypatch.setattr(
            app_module.ComplianceServiceClient, "from_settings", lambda _s: mock_service
        )

        blocking = asyncio.Event()

        async def _listen() -> None:
            await blocking.wait()

        mock_mail = MagicMock(spec=AgentMailClient)
        mock_mail.create_inbox = AsyncMock()
        ws_task = asyncio.create_task(_listen())
        mock_mail.subscribe_inbound = AsyncMock(return_value=ws_task)
        mock_mail.aclose = AsyncMock()
        monkeypatch.setattr(app_module.AgentMailClient, "from_settings", lambda _s: mock_mail)

        app = create_app()
        async with app_module.lifespan(app):
            assert not ws_task.done()

        assert ws_task.cancelled()
        mock_mail.aclose.assert_awaited_once()
        mock_service.aclose.assert_awaited_once()


# ── Healthz ─────────────────────────────────────────────────────────────────


class TestHealthz:
    @pytest.mark.asyncio
    async def test_returns_ok(self, app_module: Any) -> None:
        app_module._compliance_client = MagicMock(spec=ComplianceServiceClient)

        app = create_app()
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/healthz")
            assert resp.status_code == 200
            assert resp.json() == {"status": "ok", "service": "compliance-agent"}


# ── Chat ────────────────────────────────────────────────────────────────────


class TestChat:
    @pytest.mark.asyncio
    async def test_returns_chat_response(self, app_module: Any, monkeypatch: pytest.MonkeyPatch) -> None:
        app_module._compliance_client = MagicMock(spec=ComplianceServiceClient)

        async def _mock_run(message: str, service_client: Any) -> ChatResponse:
            return ChatResponse(response="Hello, how can I help?", task_ids=["task-chat-1"])

        monkeypatch.setattr(app_module, "run_agent_chat", _mock_run)

        app = create_app()
        _mock_auth(app)
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post("/agent/chat", json={"message": "Hi"})
            assert resp.status_code == 200
            data = resp.json()
            assert data["response"] == "Hello, how can I help?"
            assert data["task_ids"] == ["task-chat-1"]
            assert "task-chat-1" in app_module._task_store
            assert app_module._task_store["task-chat-1"].status == "pending"

    @pytest.mark.asyncio
    async def test_rejects_empty_message(self, app_module: Any) -> None:
        app_module._compliance_client = MagicMock(spec=ComplianceServiceClient)

        app = create_app()
        _mock_auth(app)
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post("/agent/chat", json={"message": ""})
            assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_returns_503_when_not_initialized(self, app_module: Any) -> None:
        app_module._compliance_client = None

        app = create_app()
        _mock_auth(app)
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post("/agent/chat", json={"message": "Hi"})
            assert resp.status_code == 503


# ── Tasks ───────────────────────────────────────────────────────────────────


class TestListTasks:
    @pytest.mark.asyncio
    async def test_returns_tasks(self, app_module: Any) -> None:
        app_module._compliance_client = MagicMock(spec=ComplianceServiceClient)
        app_module._task_store["task-1"] = AgentTask(task_id="task-1", status="completed")

        app = create_app()
        _mock_auth(app)
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/agent/tasks")
            assert resp.status_code == 200
            data = resp.json()
            assert len(data) == 1
            assert data[0]["task_id"] == "task-1"
            assert data[0]["status"] == "completed"

    @pytest.mark.asyncio
    async def test_returns_empty_list_when_no_tasks(self, app_module: Any) -> None:
        app_module._compliance_client = MagicMock(spec=ComplianceServiceClient)

        app = create_app()
        _mock_auth(app)
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/agent/tasks")
            assert resp.status_code == 200
            assert resp.json() == []


class TestGetTask:
    @pytest.mark.asyncio
    async def test_returns_task(self, app_module: Any) -> None:
        app_module._compliance_client = MagicMock(spec=ComplianceServiceClient)
        app_module._task_store["task-1"] = AgentTask(task_id="task-1", status="completed")

        app = create_app()
        _mock_auth(app)
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/agent/tasks/task-1")
            assert resp.status_code == 200
            data = resp.json()
            assert data["task_id"] == "task-1"

    @pytest.mark.asyncio
    async def test_returns_404_for_missing_task(self, app_module: Any) -> None:
        app_module._compliance_client = MagicMock(spec=ComplianceServiceClient)

        app = create_app()
        _mock_auth(app)
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/agent/tasks/missing")
            assert resp.status_code == 404


# ── Ingestion Webhook ───────────────────────────────────────────────────────


class TestIngestionWebhook:
    @pytest.mark.asyncio
    async def test_processes_email(self, app_module: Any) -> None:
        mock_pipeline = MagicMock(spec=IngestionPipeline)
        mock_pipeline._process_email = AsyncMock(
            return_value=EmailIngestionResult(
                message_id="msg-webhook-1",
                attachments_count=1,
                document_analysis_id="anal-1",
            )
        )
        app_module._ingestion_pipeline = mock_pipeline

        app = create_app()
        _mock_auth(app)
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/agent/ingestion/webhook",
                json={
                    "event_id": "evt-1",
                    "message": {
                        "message_id": "msg-webhook-1",
                        "inbox_id": "inbox-1",
                        "from": "a@b.com",
                        "to": ["c@d.com"],
                        "subject": "Test",
                        "text": "Screen entity Acme Corp.",
                        "attachments": [
                            {
                                "attachment_id": "att-1",
                                "filename": "doc.pdf",
                                "size": 100,
                                "content_type": "application/pdf",
                            }
                        ],
                    },
                },
            )
            assert resp.status_code == 200
            data = resp.json()
            assert data["message_id"] == "msg-webhook-1"
            assert data["attachments_count"] == 1
            assert data["document_analysis_id"] == "anal-1"
            mock_pipeline._process_email.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_returns_503_when_pipeline_not_initialized(self, app_module: Any) -> None:
        app_module._ingestion_pipeline = None

        app = create_app()
        _mock_auth(app)
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post("/agent/ingestion/webhook", json={"message": {}})
            assert resp.status_code == 503

    @pytest.mark.asyncio
    async def test_returns_422_for_invalid_payload(self, app_module: Any) -> None:
        mock_pipeline = MagicMock(spec=IngestionPipeline)
        app_module._ingestion_pipeline = mock_pipeline

        app = create_app()
        _mock_auth(app)
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            # Non-dict attachment causes AttributeError during construction
            resp = await client.post(
                "/agent/ingestion/webhook",
                json={"message": {"attachments": [123]}},
            )
            assert resp.status_code == 422
