from __future__ import annotations

import json
from typing import Any

from austrac_reporting.models import ReportPayload


def build_system_prompt(payload: ReportPayload) -> str:
    """Build a system prompt with structured JSON payload injection for SMR narrative drafting.

    Section 5.1 compliance: inject structured JSON payload into system prompt.
    """
    structured_payload: dict[str, Any] = {
        "report_id": str(payload.report_id),
        "report_type": payload.report_type.value,
        "reporting_entity": {
            "name": payload.reporting_entity.name,
            "abn": payload.reporting_entity.abn,
            "sector": payload.reporting_entity.sector,
        },
        "subject": {
            "type": payload.subject.subject_type.value,
            "full_name": payload.subject.full_name,
            "date_of_birth": payload.subject.date_of_birth,
            "identifiers": payload.subject.identifiers,
        },
        "transactions": [
            {
                "transaction_id": tx.transaction_id,
                "date": tx.date,
                "amount": tx.amount,
                "currency": tx.currency,
                "accounts": tx.accounts,
                "description": tx.description,
            }
            for tx in payload.transactions
        ],
        "suspicion_grounds": payload.suspicion.grounds if payload.suspicion else [],
        "risk_indicators": payload.suspicion.risk_indicators if payload.suspicion else [],
        "document_risk_score": payload.document_risk_score,
        "source_data_hash": payload.source_data_hash,
    }

    prompt = (
        "You are an AUSTRAC compliance officer drafting a Suspicious Matter Report narrative.\n"
        "Use ONLY the structured data below. Do NOT hallucinate facts, names, amounts, or dates.\n"
        "If information is missing, state 'Not provided' rather than inventing details.\n"
        "Return a concise, factual narrative (max 500 words) suitable for regulatory submission.\n\n"
        "STRUCTURED PAYLOAD (JSON):\n"
        f"{json.dumps(structured_payload, indent=2, default=str)}\n"
    )
    return prompt
