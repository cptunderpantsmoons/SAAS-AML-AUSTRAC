from __future__ import annotations

from datetime import datetime

import pytest
from compliance_agent.config import Settings, get_settings
from compliance_agent.models import AgentTask, ChatRequest, ChatResponse, EmailIngestionResult


class TestConfig:
    def test_settings_defaults(self) -> None:
        settings = Settings()
        assert settings.agentmail_api_key == ""
        assert settings.agent_model == "anthropic:claude-sonnet-4-6"
        assert settings.gateway_url == "http://localhost:8000"
        assert settings.agent_timeout_seconds == 30.0

    def test_get_settings_returns_instance(self) -> None:
        settings = get_settings()
        assert isinstance(settings, Settings)
        assert settings.gateway_url == "http://localhost:8000"

    def test_settings_explicit_override(self) -> None:
        settings = Settings(agent_model="anthropic:claude-opus-4")
        assert settings.agent_model == "anthropic:claude-opus-4"

    def test_settings_validation_timeout_positive(self) -> None:
        with pytest.raises(ValueError, match="agent_timeout_seconds must be positive"):
            Settings(agent_timeout_seconds=-5.0)

    def test_settings_validation_gateway_url_nonempty(self) -> None:
        with pytest.raises(ValueError, match="gateway_url must not be empty"):
            Settings(gateway_url="")


class TestModels:
    def test_agent_task_defaults(self) -> None:
        task = AgentTask(task_id="task-1")
        assert task.task_id == "task-1"
        assert task.status == "pending"
        assert task.completed_at is None
        assert task.result is None
        assert isinstance(task.created_at, datetime)

    def test_chat_request_optional_session_id(self) -> None:
        req = ChatRequest(message="hello")
        assert req.message == "hello"
        assert req.session_id is None

        req2 = ChatRequest(message="hello", session_id="sess-1")
        assert req2.session_id == "sess-1"

    def test_chat_response_defaults(self) -> None:
        resp = ChatResponse(response="ok")
        assert resp.response == "ok"
        assert resp.task_ids == []

    def test_email_ingestion_result_defaults(self) -> None:
        result = EmailIngestionResult(message_id="msg-1")
        assert result.message_id == "msg-1"
        assert result.attachments_count == 0
        assert result.document_analysis_id is None
