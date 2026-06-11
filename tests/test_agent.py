from __future__ import annotations

from typing import cast
from unittest.mock import AsyncMock

import pytest
from compliance_agent.agent import (
    _append_session_task_id,
    _get_session_task_ids,
    agent,
    run_agent_chat,
)
from compliance_agent.models import ChatResponse
from compliance_agent.service_client import ComplianceServiceClient
from pydantic_ai.models.test import TestModel


@pytest.fixture
def mock_client() -> ComplianceServiceClient:
    """Return a mock ComplianceServiceClient with all async methods stubbed."""
    client = AsyncMock(spec=ComplianceServiceClient)
    client.onboard_entity.return_value = {"onboarding_id": "123"}
    client.check_onboarding_status.return_value = {"status": "COMPLETED"}
    client.generate_report.return_value = {"report_id": "r-1"}
    client.draft_narrative.return_value = {"narrative": "Done"}
    client.transmit_report.return_value = {"transmitted": True}
    client.get_board_metrics.return_value = {"alerts": 5}
    client.list_alerts.return_value = {"alerts": ["a1"]}
    client.calculate_ubo.return_value = {"ubo": "Alice 30%"}
    client.sign_report.return_value = {"signed": True}
    return cast(ComplianceServiceClient, client)


class TestAgentTools:
    @pytest.mark.anyio
    async def test_onboard_entity_tool(self, mock_client: ComplianceServiceClient) -> None:
        result = await agent.run(
            "Onboard ACME Corp as a company in AU",
            deps=mock_client,
            model=TestModel(call_tools=["onboard_entity"]),
        )
        mock_client.onboard_entity.assert_awaited_once()  # type: ignore[attr-defined]
        assert "123" in result.output

    @pytest.mark.anyio
    async def test_check_onboarding_status_tool(self, mock_client: ComplianceServiceClient) -> None:
        result = await agent.run(
            "Check status of onboarding-1",
            deps=mock_client,
            model=TestModel(call_tools=["check_onboarding_status"]),
        )
        mock_client.check_onboarding_status.assert_awaited_once()  # type: ignore[attr-defined]
        assert "COMPLETED" in result.output

    @pytest.mark.anyio
    async def test_analyze_document_tool_returns_upload_message(self, mock_client: ComplianceServiceClient) -> None:
        result = await agent.run(
            "Analyse document at http://example.com/file.pdf",
            deps=mock_client,
            model=TestModel(call_tools=["analyze_document"]),
        )
        assert "upload" in result.output.lower()

    @pytest.mark.anyio
    async def test_analyze_document_tool_with_analysis_id(self, mock_client: ComplianceServiceClient) -> None:
        result = await agent.run(
            "Use analysis abc-123",
            deps=mock_client,
            model=TestModel(call_tools=["analyze_document"]),
        )
        # TestModel passes default args so the tool falls back to the generic upload message.
        assert "upload" in result.output.lower()

    @pytest.mark.anyio
    async def test_generate_report_tool(self, mock_client: ComplianceServiceClient) -> None:
        result = await agent.run(
            "Generate SMR report",
            deps=mock_client,
            model=TestModel(call_tools=["generate_report"]),
        )
        mock_client.generate_report.assert_awaited_once()  # type: ignore[attr-defined]
        assert "r-1" in result.output

    @pytest.mark.anyio
    async def test_draft_narrative_tool(self, mock_client: ComplianceServiceClient) -> None:
        result = await agent.run(
            "Draft narrative for report-1",
            deps=mock_client,
            model=TestModel(call_tools=["draft_narrative"]),
        )
        mock_client.draft_narrative.assert_awaited_once()  # type: ignore[attr-defined]
        assert "Done" in result.output

    @pytest.mark.anyio
    async def test_transmit_report_tool(self, mock_client: ComplianceServiceClient) -> None:
        result = await agent.run(
            "Transmit report-1",
            deps=mock_client,
            model=TestModel(call_tools=["transmit_report"]),
        )
        mock_client.transmit_report.assert_awaited_once()  # type: ignore[attr-defined]
        assert "true" in result.output.lower()

    @pytest.mark.anyio
    async def test_get_board_metrics_tool(self, mock_client: ComplianceServiceClient) -> None:
        result = await agent.run(
            "Board metrics",
            deps=mock_client,
            model=TestModel(call_tools=["get_board_metrics"]),
        )
        mock_client.get_board_metrics.assert_awaited_once()  # type: ignore[attr-defined]
        assert "5" in result.output

    @pytest.mark.anyio
    async def test_list_alerts_tool(self, mock_client: ComplianceServiceClient) -> None:
        result = await agent.run(
            "List alerts",
            deps=mock_client,
            model=TestModel(call_tools=["list_alerts"]),
        )
        mock_client.list_alerts.assert_awaited_once()  # type: ignore[attr-defined]
        assert "a1" in result.output

    @pytest.mark.anyio
    async def test_calculate_ubo_tool(self, mock_client: ComplianceServiceClient) -> None:
        result = await agent.run(
            "Calculate UBO for entity-1",
            deps=mock_client,
            model=TestModel(call_tools=["calculate_ubo"]),
        )
        mock_client.calculate_ubo.assert_awaited_once()  # type: ignore[attr-defined]
        assert "Alice" in result.output

    @pytest.mark.anyio
    async def test_sign_report_tool(self, mock_client: ComplianceServiceClient) -> None:
        result = await agent.run(
            "Sign report-1",
            deps=mock_client,
            model=TestModel(call_tools=["sign_report"]),
        )
        mock_client.sign_report.assert_awaited_once()  # type: ignore[attr-defined]
        assert "true" in result.output.lower()


class TestRunAgentChat:
    @pytest.mark.anyio
    async def test_run_agent_chat_returns_chat_response(self, mock_client: ComplianceServiceClient) -> None:
        with agent.override(model=TestModel()):
            resp = await run_agent_chat("hello", mock_client)
        assert isinstance(resp, ChatResponse)
        assert isinstance(resp.response, str)
        assert resp.task_ids == []

    @pytest.mark.anyio
    async def test_run_agent_chat_with_session_id(self, mock_client: ComplianceServiceClient) -> None:
        sess = "sess-abc"
        _append_session_task_id(sess, "task-1")
        with agent.override(model=TestModel()):
            resp = await run_agent_chat("hello", mock_client, session_id=sess)
        assert "task-1" in resp.task_ids


class TestSessionStore:
    def test_get_and_append(self) -> None:
        sid = "test-session"
        assert _get_session_task_ids(sid) == []
        _append_session_task_id(sid, "t1")
        assert _get_session_task_ids(sid) == ["t1"]
