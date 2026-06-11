from __future__ import annotations

import re
from typing import Any


def _extract_binary_from_whitespace(text: str) -> str:
    whitespace_bits = "".join("1" if ch == "\t" else "0" for ch in text if ch in {" ", "\t"})
    chunks = [whitespace_bits[index : index + 8] for index in range(0, len(whitespace_bits), 8)]
    payload_bytes = bytearray()
    for chunk in chunks:
        if len(chunk) == 8:
            payload_bytes.append(int(chunk, 2))
    return payload_bytes.hex()


def _sanitize_whitespace_lines(payload: bytes) -> bytes:
    text = payload.decode("utf-8", errors="ignore")
    sanitized_lines = [line.rstrip(" \t") for line in text.splitlines()]
    sanitized = "\n".join(sanitized_lines)
    if text.endswith("\n"):
        sanitized += "\n"
    return sanitized.encode("utf-8")


def detect_whitespace_steganography(payload: bytes, filename: str) -> dict[str, Any]:
    text = payload.decode("utf-8", errors="ignore")
    signals: list[str] = []
    details: list[str] = []

    suspicious_lines = [
        line for line in text.splitlines() if re.search(r"[ \t]{4,}$", line) or "\t " in line or " \t" in line
    ]
    extracted_payload = _extract_binary_from_whitespace("\n".join(suspicious_lines))
    sanitized_content = _sanitize_whitespace_lines(payload)
    sanitized_changed = sanitized_content != payload

    if suspicious_lines:
        signals.append("suspicious_whitespace_pattern")
        details.append(f"{len(suspicious_lines)} suspicious line(s) found in {filename}")
    if extracted_payload:
        signals.append("embedded_whitespace_payload")
        details.append("binary payload reconstructed from whitespace markers")

    confidence = min(1.0, 0.45 + (0.2 * len(signals)))
    return {
        "detected": bool(signals),
        "confidence": round(confidence, 2) if signals else 0.0,
        "signals": signals,
        "details": details,
        "extracted_payload": extracted_payload,
        "sanitized_changed": sanitized_changed,
        "sanitized_content": sanitized_content,
    }
