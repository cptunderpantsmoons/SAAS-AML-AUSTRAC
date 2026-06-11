from __future__ import annotations

import logging
from typing import Any

from pydantic_ai import Agent, RunContext

from .models import ChatResponse
from .service_client import ComplianceServiceClient

logger = logging.getLogger(__name__)

agent = Agent(
    "anthropic:claude-sonnet-4-6",
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
    file_bytes: bytes,
    filename: str,
    content_type: str,
) -> dict[str, Any]:
    """Analyze a document for visual forgery, prompt injection, and whitespace steganography."""
    return await ctx.deps.analyze_document(file_bytes, filename, content_type)


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
) -> dict[str, Any]:
    """Sign off a compliance report."""
    return await ctx.deps.sign_report(report_id, payload)


async def run_agent_chat(
    message: str,
    service_client: ComplianceServiceClient,
) -> ChatResponse:
    """Run the compliance agent for a single chat turn."""
    result = await agent.run(message, deps=service_client)
    return ChatResponse(response=str(result.output), task_ids=[])
