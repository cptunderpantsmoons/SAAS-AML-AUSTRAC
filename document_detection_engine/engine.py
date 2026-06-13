from __future__ import annotations

import hashlib
import logging
import uuid
from datetime import UTC, datetime
from typing import Any

from document_detection_engine.config import Settings
from document_detection_engine.detectors.prompt_injection import detect_prompt_injection
from document_detection_engine.detectors.visual_forgery import detect_visual_forgery
from document_detection_engine.detectors.whitespace_steganography import (
    detect_whitespace_steganography,
)
from document_detection_engine.storage import StorageClient

audit_logger = logging.getLogger("document_detection_engine.audit")


def _apply_threshold(result: dict[str, Any], threshold: float) -> dict[str, Any]:
    normalized = dict(result)
    normalized["detected"] = bool(result["signals"]) and result["confidence"] >= threshold
    normalized["threshold"] = threshold
    return normalized


# Compute the average confidence of detectors that *fired* (not the running
# sum divided by the total number of detectors).  This matches the documented
# "average confidence of active modules" behaviour — a single high-confidence
# hit is treated as high risk; a half-confidence hit from a single detector
# is medium risk.
def _derive_risk_score(modules: dict[str, dict[str, Any]]) -> tuple[float, str]:
    active = [result for result in modules.values() if result["detected"]]
    if not active:
        return 0.0, "low"

    avg_confidence = sum(result["confidence"] for result in active) / len(active)
    risk_score = min(100.0, avg_confidence * 100)
    if risk_score >= 90:
        risk_level = "critical"
    elif risk_score >= 70:
        risk_level = "high"
    elif risk_score >= 35:
        risk_level = "medium"
    else:
        risk_level = "low"
    return round(risk_score, 2), risk_level


def analyze_document(
    *,
    payload: bytes,
    filename: str,
    content_type: str,
    settings: Settings,
    storage_client: StorageClient,
) -> dict[str, Any]:
    visual = _apply_threshold(
        detect_visual_forgery(payload, filename=filename),
        settings.visual_forgery_threshold,
    )
    prompt = _apply_threshold(
        detect_prompt_injection(payload, filename=filename),
        settings.prompt_injection_threshold,
    )
    whitespace_detection = detect_whitespace_steganography(payload, filename=filename)
    whitespace = _apply_threshold(
        whitespace_detection,
        settings.whitespace_threshold,
    )

    modules = {
        "visual_forgery": visual,
        "prompt_injection": prompt,
        "whitespace_steganography": {
            key: value for key, value in whitespace.items() if key != "sanitized_content"
        },
    }
    risk_score, risk_level = _derive_risk_score(modules)
    sanitized_payload: bytes = whitespace_detection["sanitized_content"]
    storage_result = storage_client.store_sanitized(filename, sanitized_payload, content_type)
    analysis_id = str(uuid.uuid4())
    flagged_modules = [name for name, result in modules.items() if result["detected"]]

    audit_logger.info(
        "analysis_completed analysis_id=%s filename=%s risk_level=%s flagged_modules=%s sanitized_storage=%s",
        analysis_id,
        filename,
        risk_level,
        ",".join(flagged_modules) or "none",
        storage_result["provider"],
    )

    return {
        "analysis_id": analysis_id,
        "document": {
            "filename": filename,
            "content_type": content_type,
            "size_bytes": len(payload),
            "sha256": hashlib.sha256(payload).hexdigest(),
        },
        "modules": modules,
        "summary": {
            "risk_score": risk_score,
            "risk_level": risk_level,
            "flagged_modules": flagged_modules,
            "sanitized_storage": storage_result,
        },
        "audit": {
            "created_at": datetime.now(UTC).isoformat(),
            "thresholds": {
                "visual_forgery": settings.visual_forgery_threshold,
                "prompt_injection": settings.prompt_injection_threshold,
                "whitespace_steganography": settings.whitespace_threshold,
            },
            "sanitization_applied": whitespace_detection["sanitized_changed"],
            "pii_handling": (
                "PII is processed in-memory for analysis, sanitized output is stored separately, "
                "and the storage tier is expected to enforce SSE-KMS encryption."
            ),
        },
    }
