from __future__ import annotations

import re
from typing import Any


def detect_visual_forgery(payload: bytes, filename: str) -> dict[str, Any]:
    text = payload.decode("latin-1", errors="ignore")
    lowered = text.lower()
    signals: list[str] = []
    details: list[str] = []

    producer_match = re.search(r"/Producer\s*\(([^)]+)\)", text)
    creator_match = re.search(r"/Creator\s*\(([^)]+)\)", text)
    if producer_match and creator_match:
        producer = producer_match.group(1).strip().lower()
        creator = creator_match.group(1).strip().lower()
        if producer != creator:
            signals.append("metadata_mismatch")
            details.append(f"producer={producer} creator={creator}")

    font_names = re.findall(r"/FontName\s*/([A-Za-z0-9_-]+)", text)
    if len(set(font_names)) > 1:
        signals.append("font_inconsistency")
        details.append(f"multiple font families detected in {filename}")

    if b"\x00\xff\x00\xff" in payload or b"\xff\x00\xff\x00" in payload:
        signals.append("pixel_artifact_pattern")
        details.append("repeating pixel artefact signature found")

    if "photoshop" in lowered or "synthetic" in lowered:
        signals.append("synthetic_editing_marker")
        details.append("editing metadata suggests post-capture manipulation")

    confidence = min(1.0, 0.39 + (0.18 * len(signals)))
    return {
        "detected": bool(signals),
        "confidence": round(confidence, 2) if signals else 0.0,
        "signals": signals,
        "details": details,
    }
