from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import FastAPI, HTTPException

from austrac_reporting.config import Settings, get_settings
from austrac_reporting.dlq import DeadLetterQueue
from austrac_reporting.gateway import AUSTRACGateway, GatewayError
from austrac_reporting.generators.ifti_e import IFTIEGenerator
from austrac_reporting.generators.smr import SMRGenerator
from austrac_reporting.generators.ttr import TTRGenerator
from austrac_reporting.llm import create_llm_adapter
from austrac_reporting.llm.prompts import build_system_prompt
from austrac_reporting.models import (
    GenerateReportRequest,
    GenerateReportResponse,
    NarrativeDraft,
    ReportType,
    UpdateReportRequest,
)
from austrac_reporting.xml_schemas import XSDValidator

logger = logging.getLogger("austrac_reporting.app")

_settings: Settings | None = None
_gateway: AUSTRACGateway | None = None
_dlq: DeadLetterQueue | None = None
_report_registry: dict[UUID, dict[str, Any]] = {}


@asynccontextmanager
async def lifespan(app: FastAPI) -> Any:
    global _settings, _gateway, _dlq
    _settings = get_settings()
    _gateway = AUSTRACGateway(settings=_settings)
    _dlq = DeadLetterQueue(settings=_settings)
    logger.info("AUSTRAC Reporting service started")
    yield
    if _gateway is not None:
        await _gateway.close()
    if _dlq is not None and hasattr(_dlq, "close"):
        try:
            await _dlq.close()
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("Failed to close DLQ cleanly: %s", exc)
    logger.info("AUSTRAC Reporting service stopped")


app = FastAPI(title="AUSTRAC Reporting Engine", version="0.5.0", lifespan=lifespan)


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok", "service": "austrac-reporting"}


@app.post("/reports/generate/{report_type}", response_model=GenerateReportResponse)
async def generate_report(
    report_type: str, request: GenerateReportRequest
) -> GenerateReportResponse:
    try:
        rt = ReportType(report_type)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Unknown report type: {report_type}") from exc

    payload = request.payload
    narrative: NarrativeDraft | None = None

    if rt == ReportType.SMR:
        generator = SMRGenerator(payload)
        if request.include_narrative:
            try:
                adapter = create_llm_adapter(_settings or get_settings())
                prompt = build_system_prompt(payload)
                narrative = await adapter.draft_narrative(payload, prompt)
                xml = generator.build(narrative=narrative.draft_text)
            except Exception as exc:
                logger.error("LLM narrative generation failed: %s", exc)
                xml = generator.build()
                narrative = NarrativeDraft(
                    draft_text="Narrative generation failed — requires manual drafting",
                    requires_human_approval=True,
                    model_used="error",
                    confidence_score=0.0,
                )
        else:
            xml = generator.build()
    elif rt == ReportType.TTR:
        xml = TTRGenerator(payload).build()
    elif rt == ReportType.IFTI_E:
        xml = IFTIEGenerator(payload).build()
    else:
        raise HTTPException(status_code=400, detail="Unsupported report type")

    valid, errors = XSDValidator.validate(rt, xml)

    response = GenerateReportResponse(
        report_id=payload.report_id,
        report_type=rt,
        xml_content=xml,
        narrative=narrative,
        xsd_valid=valid,
        validation_errors=errors,
    )
    _report_registry[payload.report_id] = {
        "id": str(payload.report_id),
        "report_type": rt.value,
        "status": "draft",
        "xsd_valid": valid,
        "validation_errors": errors,
        "xml_content": xml,
        "narrative": narrative.model_dump(mode="json") if narrative else None,
        "created_at": datetime.now(UTC).isoformat(),
    }
    return response


@app.post("/reports/narrative/draft", response_model=NarrativeDraft)
async def draft_narrative(request: GenerateReportRequest) -> NarrativeDraft:
    if request.payload.report_type != ReportType.SMR:
        raise HTTPException(status_code=400, detail="Narrative drafting is only supported for SMR")
    try:
        adapter = create_llm_adapter(_settings or get_settings())
        prompt = build_system_prompt(request.payload)
        draft = await adapter.draft_narrative(request.payload, prompt)
        return draft
    except Exception as exc:
        logger.error("Narrative draft failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Narrative generation failed: {exc}") from exc


@app.get("/reports")
async def list_reports() -> dict[str, Any]:
    return {
        "reports": list(_report_registry.values()),
        "pagination": {
            "page": 1,
            "limit": 50,
            "total": len(_report_registry),
            "totalPages": max(1, (len(_report_registry) + 49) // 50),
        },
    }


@app.get("/reports/{report_id}")
async def get_report(report_id: str) -> dict[str, Any]:
    try:
        rid = UUID(report_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid report ID") from exc
    report = _report_registry.get(rid)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return {"report": report}


@app.patch("/reports/{report_id}")
async def update_report(report_id: str, request: UpdateReportRequest) -> dict[str, Any]:
    try:
        rid = UUID(report_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid report ID") from exc
    report = _report_registry.get(rid)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    # Apply the typed request fields one at a time so a malicious or
    # over-permissive client cannot overwrite the canonical report
    # attributes (xml_content, xsd_valid, report_id, ...).
    body = request.model_dump(exclude_unset=True)
    allowed: dict[str, Any] = {}
    for key, value in body.items():
        if value is None:
            continue
        if key in {"status", "notes", "assigned_to", "metadata"}:
            allowed[key] = value
    report.update(allowed)
    return {"id": report_id, **report}


@app.post("/reports/{report_id}/transmit")
async def transmit_report(
    report_id: UUID, report_type: str, xml_content: str
) -> dict[str, Any]:
    if _gateway is None:
        raise HTTPException(status_code=503, detail="Gateway not initialized")
    # Validate the report exists in our registry before attempting to
    # transmit; otherwise a bogus report_id would silently send arbitrary
    # XML to the regulator.
    report = _report_registry.get(report_id)
    if not report:
        raise HTTPException(status_code=404, detail=f"Report {report_id} not found")
    # If the report_type and xml_content query/body params are not supplied
    # by the caller, fall back to the values recorded when the report was
    # generated.
    if not report_type:
        report_type = report.get("report_type", "")
    if not xml_content:
        xml_content = report.get("xml_content", "")
    if not report_type or not xml_content:
        raise HTTPException(
            status_code=400,
            detail="report_type and xml_content are required (either as request params or in the stored report)",
        )

    # Pre-compute the message_id we would have used so the DLQ entry can be
    # correlated with the failed transmission even if the gateway is never
    # reached.
    import hashlib

    derived_message_id = UUID(
        hashlib.sha256(f"{report_type}|{report_id}|{xml_content}".encode()).hexdigest()[:32]
    )

    try:
        result = await _gateway.transmit(report_type, xml_content, report_id)
        return {
            "message_id": str(result.message_id),
            "status": result.status,
            "receipt_id": result.receipt_id,
        }
    except GatewayError as exc:
        logger.error("Transmission failed: %s", exc)
        if _dlq is not None:
            # Preserve the gateway-derived message_id so the DLQ entry can
            # be correlated with the failed transmission.
            await _dlq.enqueue(
                message_id=derived_message_id,
                payload={
                    "report_id": str(report_id),
                    "report_type": report_type,
                    "xml_content": xml_content,
                },
                error_message=str(exc),
            )
        raise HTTPException(status_code=502, detail=str(exc)) from exc
