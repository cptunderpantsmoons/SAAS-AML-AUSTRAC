from __future__ import annotations

import logging
from typing import Any

from pydantic_ai import Agent, RunContext

from .config import get_settings
from .models import ChatResponse
from .service_client import ComplianceServiceClient

logger = logging.getLogger(__name__)

# Simple in-memory session store mapping session_id -> list of task_ids.
_session_store: dict[str, list[str]] = {}

agent = Agent(
    get_settings().agent_model,
    instructions=(
        "You are a compliance officer AI assistant for an AUSTRAC AML/CTF SaaS platform. "
        "You help users with onboarding, document analysis, report generation, "
        "narrative drafting, report transmission, governance metrics, alert review, "
        "UBO calculation, and report signing. Always follow AUSTRAC regulatory guidelines "
        "and ask for clarification when user intent is ambiguous."
    ),
    deps_type=ComplianceServiceClient,
    defer_model_check=True,
)


@agent.tool
async def onboard_entity(
    ctx: RunContext[ComplianceServiceClient],
    entity_name: str,
    entity_type: str,
    country_code: str,
) -> dict[str, Any]:
    """Initiate onboarding for a new entity."""
    return await ctx.deps.onboard_entity(entity_name, entity_type, country_code)


@agent.tool
async def check_onboarding_status(
    ctx: RunContext[ComplianceServiceClient],
    onboarding_id: str,
) -> dict[str, Any]:
    """Check the status of an onboarding workflow."""
    return await ctx.deps.check_onboarding_status(onboarding_id)


@agent.tool
async def analyze_document(
    ctx: RunContext[ComplianceServiceClient],
    document_url: str | None = None,
    base64_hint: str | None = None,
    analysis_id: str | None = None,
) -> dict[str, Any]:
    """Instruct the user to upload a document for analysis, or return an existing analysis_id."""
    # When running over email the ingestion pipeline provides an analysis_id directly.
    if analysis_id is not None:
        return {"analysis_id": analysis_id, "status": "ingested"}

    # For URL or base64 hints we currently ask the user to upload the real file.
    if document_url is not None:
        return {
            "message": "Please upload the document directly so it can be analysed for "
            "visual forgery, prompt injection, and whitespace steganography.",
            "hint": document_url,
        }

    if base64_hint is not None:
        return {
            "message": "Please upload the document directly so it can be analysed.",
            "hint": "base64",
        }

    return {
        "message": "Please upload the document you would like analysed.",
    }


@agent.tool
async def generate_report(
    ctx: RunContext[ComplianceServiceClient],
    report_type: str,
    payload_json: dict[str, Any],
) -> dict[str, Any]:
    """Generate a compliance report of the given type."""
    return await ctx.deps.generate_report(report_type, payload_json)


@agent.tool
async def draft_narrative(
    ctx: RunContext[ComplianceServiceClient],
    report_id: str,
    payload_json: dict[str, Any],
) -> dict[str, Any]:
    """Draft a narrative for a report."""
    payload: dict[str, Any] = {**payload_json, "report_id": report_id}
    return await ctx.deps.draft_narrative(payload)


@agent.tool
async def transmit_report(
    ctx: RunContext[ComplianceServiceClient],
    report_id: str,
    report_type: str,
    xml_content: str,
) -> dict[str, Any]:
    """Transmit a signed report to the regulator."""
    return await ctx.deps.transmit_report(report_id, report_type, xml_content)


@agent.tool
async def get_board_metrics(
    ctx: RunContext[ComplianceServiceClient],
) -> dict[str, Any]:
    """Retrieve board-level governance metrics."""
    return await ctx.deps.get_board_metrics()


@agent.tool
async def list_alerts(
    ctx: RunContext[ComplianceServiceClient],
) -> dict[str, Any]:
    """List open compliance alerts."""
    return await ctx.deps.list_alerts()


@agent.tool
async def calculate_ubo(
    ctx: RunContext[ComplianceServiceClient],
    entity_id: str,
) -> dict[str, Any]:
    """Calculate beneficial ownership for an entity applying AUSTRAC's 25% threshold."""
    return await ctx.deps.calculate_ubo(entity_id)


@agent.tool
async def sign_report(
    ctx: RunContext[ComplianceServiceClient],
    report_id: str,
    payload: dict[str, Any],
    signed_by: str,
) -> dict[str, Any]:
    """Sign off a compliance report."""
    return await ctx.deps.sign_report(report_id, payload, signed_by)


def _get_session_task_ids(session_id: str) -> list[str]:
    return _session_store.get(session_id, [])


def _append_session_task_id(session_id: str, task_id: str) -> None:
    if session_id not in _session_store:
        _session_store[session_id] = []
    _session_store[session_id].append(task_id)


async def run_agent_chat(
    message: str,
    service_client: ComplianceServiceClient,
    session_id: str | None = None,
) -> ChatResponse:
    """Run the compliance agent for a single chat turn."""
    result = await agent.run(message, deps=service_client)

    task_ids: list[str] = []
    if session_id is not None:
        # Extract any task-like IDs from tool call results — for now we keep it simple.
        # Future iterations may emit explicit AgentTask objects from tools.
        task_ids = _get_session_task_ids(session_id)

    return ChatResponse(response=str(result.output), task_ids=task_ids)
