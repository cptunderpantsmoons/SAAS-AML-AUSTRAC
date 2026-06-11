from __future__ import annotations

import re
from typing import Any

ZERO_WIDTH_CHARS = {"\u200b", "\u200c", "\u200d", "\ufeff"}


def detect_prompt_injection(payload: bytes, filename: str) -> dict[str, Any]:
    text = payload.decode("utf-8", errors="ignore")
    normalized = "".join(ch for ch in text if ch not in ZERO_WIDTH_CHARS)
    lowered = normalized.lower()
    signals: list[str] = []
    details: list[str] = []

    if any(ch in text for ch in ZERO_WIDTH_CHARS):
        signals.append("zero_width_characters")
        details.append(f"zero-width obfuscation found in {filename}")

    hidden_layer_patterns = (
        r"display\s*:\s*none",
        r"opacity\s*:\s*0",
        r"<\!--.*?-->",
        r"hidden\s*=",
    )
    if any(re.search(pattern, text, flags=re.IGNORECASE | re.DOTALL) for pattern in hidden_layer_patterns):
        signals.append("hidden_instruction_layer")
        details.append("hidden html/svg layer detected")

    prompt_patterns = (
        "ignore all prior instructions",
        "return secrets",
        "disregard policy",
        "system prompt",
    )
    if any(pattern in lowered for pattern in prompt_patterns):
        signals.append("injection_phrase")
        details.append("known prompt injection phrasing detected")

    confidence = min(1.0, 0.4 + (0.2 * len(signals)))
    return {
        "detected": bool(signals),
        "confidence": round(confidence, 2) if signals else 0.0,
        "signals": signals,
        "details": details,
    }
