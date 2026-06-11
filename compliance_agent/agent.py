from __future__ import annotations

from typing import Any

import httpx
from pydantic_ai import Agent, RunContext

from .models import ChatResponse
from .service_client import ComplianceServiceClient

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
    try:
        return await ctx.deps.onboard_entity(entity_name, entity_type, country_code)
    except httpx.HTTPStatusError as exc:
        return {"error": f"Service call failed: {exc.response.status_code}"}


@agent.tool
async def check_onboarding_status(
    ctx: RunContext[ComplianceServiceClient],
    onboarding_id: str,
) -> dict[str, Any]:
    """Check the status of an onboarding workflow."""
    try:
        return await ctx.deps.check_onboarding_status(onboarding_id)
    except httpx.HTTPStatusError as exc:
        return {"error": f"Service call failed: {exc.response.status_code}"}


@agent.tool
async def analyze_document(
    ctx: RunContext[ComplianceServiceClient],
    document_reference_id: str,
    filename: str,
    content_type: str = "application/pdf",
) -> dict[str, Any]:
    """Analyze a document for visual forgery, prompt injection, and whitespace steganography.

    This tool is for post-ingestion references only; the document must already be uploaded
    and this parameter is the reference ID returned by ingestion.
    """
    try:
        return await ctx.deps.analyze_document_by_reference(
            document_reference_id, filename, content_type
        )
    except httpx.HTTPStatusError as exc:
        return {"error": f"Service call failed: {exc.response.status_code}"}


@agent.tool
async def generate_report(
    ctx: RunContext[ComplianceServiceClient],
    report_type: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """Generate a compliance report of the given type.

    The payload dict should contain the report-specific fields such as entity_name,
    reporting period, transaction details, and any flags required by AUSTRAC.
    """
    try:
        return await ctx.deps.generate_report(report_type, payload)
    except httpx.HTTPStatusError as exc:
        return {"error": f"Service call failed: {exc.response.status_code}"}


@agent.tool
async def draft_narrative(
    ctx: RunContext[ComplianceServiceClient],
    report_id: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """Draft a narrative for a report.

    The payload dict should contain the narrative fields such as summary, indicators,
    supporting evidence, and any contextual notes for the AUSTRAC submission.
    The report_id is merged into the payload automatically before sending.
    """
    try:
        full_payload: dict[str, Any] = {**payload, "report_id": report_id}
        return await ctx.deps.draft_narrative(full_payload)
    except httpx.HTTPStatusError as exc:
        return {"error": f"Service call failed: {exc.response.status_code}"}


@agent.tool
async def transmit_report(
    ctx: RunContext[ComplianceServiceClient],
    report_id: str,
    report_type: str,
    xml_content: str,
) -> dict[str, Any]:
    """Transmit a signed report to the regulator."""
    try:
        return await ctx.deps.transmit_report(report_id, report_type, xml_content)
    except httpx.HTTPStatusError as exc:
        return {"error": f"Service call failed: {exc.response.status_code}"}


@agent.tool
async def get_board_metrics(
    ctx: RunContext[ComplianceServiceClient],
) -> dict[str, Any]:
    """Retrieve board-level governance metrics."""
    try:
        return await ctx.deps.get_board_metrics()
    except httpx.HTTPStatusError as exc:
        return {"error": f"Service call failed: {exc.response.status_code}"}


@agent.tool
async def list_alerts(
    ctx: RunContext[ComplianceServiceClient],
) -> dict[str, Any]:
    """List open compliance alerts."""
    try:
        return await ctx.deps.list_alerts()
    except httpx.HTTPStatusError as exc:
        return {"error": f"Service call failed: {exc.response.status_code}"}


@agent.tool
async def calculate_ubo(
    ctx: RunContext[ComplianceServiceClient],
    entity_id: str,
) -> dict[str, Any]:
    """Calculate beneficial ownership for an entity applying AUSTRAC's 25% threshold."""
    try:
        return await ctx.deps.calculate_ubo(entity_id)
    except httpx.HTTPStatusError as exc:
        return {"error": f"Service call failed: {exc.response.status_code}"}


@agent.tool
async def sign_report(
    ctx: RunContext[ComplianceServiceClient],
    report_id: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """Sign off a compliance report.

    The payload dict should contain signatory details such as officer_name,
    officer_id, timestamp, and any attestation fields required by AUSTRAC.
    """
    try:
        return await ctx.deps.sign_report(report_id, payload)
    except httpx.HTTPStatusError as exc:
        return {"error": f"Service call failed: {exc.response.status_code}"}


async def run_agent_chat(
    message: str,
    service_client: ComplianceServiceClient,
) -> ChatResponse:
    """Run the compliance agent for a single chat turn."""
    try:
        result = await agent.run(message, deps=service_client)
        return ChatResponse(response=str(result.output), task_ids=[])
    except Exception as exc:
        return ChatResponse(response=f"Agent error: {exc}", task_ids=[])
