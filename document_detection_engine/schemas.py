from __future__ import annotations

ANALYSIS_RESPONSE_SCHEMA = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "additionalProperties": False,
    "required": ["analysis_id", "document", "modules", "summary", "audit"],
    "properties": {
        "analysis_id": {"type": "string", "minLength": 1},
        "document": {
            "type": "object",
            "additionalProperties": False,
            "required": ["filename", "content_type", "size_bytes", "sha256"],
            "properties": {
                "filename": {"type": "string", "minLength": 1},
                "content_type": {"type": "string", "minLength": 1},
                "size_bytes": {"type": "integer", "minimum": 0},
                "sha256": {"type": "string", "pattern": "^[a-f0-9]{64}$"},
            },
        },
        "modules": {
            "type": "object",
            "additionalProperties": False,
            "required": [
                "visual_forgery",
                "prompt_injection",
                "whitespace_steganography",
            ],
            "properties": {
                "visual_forgery": {"$ref": "#/$defs/detectorResult"},
                "prompt_injection": {"$ref": "#/$defs/detectorResult"},
                "whitespace_steganography": {"$ref": "#/$defs/whitespaceDetectorResult"},
            },
        },
        "summary": {
            "type": "object",
            "additionalProperties": False,
            "required": ["risk_score", "risk_level", "flagged_modules", "sanitized_storage"],
            "properties": {
                "risk_score": {"type": "number", "minimum": 0, "maximum": 100},
                "risk_level": {
                    "type": "string",
                    "enum": ["low", "medium", "high", "critical"],
                },
                "flagged_modules": {"type": "array", "items": {"type": "string"}},
                "sanitized_storage": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["status", "provider", "object_key", "access_url", "expires_in_seconds"],
                    "properties": {
                        "status": {"type": "string", "enum": ["stored", "skipped"]},
                        "provider": {"type": "string"},
                        "object_key": {"type": "string"},
                        "access_url": {"type": "string"},
                        "expires_in_seconds": {"type": "integer", "minimum": 0},
                    },
                },
            },
        },
        "audit": {
            "type": "object",
            "additionalProperties": False,
            "required": ["created_at", "thresholds", "sanitization_applied", "pii_handling"],
            "properties": {
                "created_at": {"type": "string", "format": "date-time"},
                "thresholds": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": [
                        "visual_forgery",
                        "prompt_injection",
                        "whitespace_steganography",
                    ],
                    "properties": {
                        "visual_forgery": {"type": "number"},
                        "prompt_injection": {"type": "number"},
                        "whitespace_steganography": {"type": "number"},
                    },
                },
                "sanitization_applied": {"type": "boolean"},
                "pii_handling": {"type": "string", "minLength": 1},
            },
        },
    },
    "$defs": {
        "detectorResult": {
            "type": "object",
            "additionalProperties": False,
            "required": ["detected", "confidence", "signals", "details"],
            "properties": {
                "detected": {"type": "boolean"},
                "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                "threshold": {"type": "number", "minimum": 0, "maximum": 1},
                "signals": {"type": "array", "items": {"type": "string"}},
                "details": {"type": "array", "items": {"type": "string"}},
            },
        },
        "whitespaceDetectorResult": {
            "type": "object",
            "additionalProperties": False,
            "required": [
                "detected",
                "confidence",
                "signals",
                "details",
                "extracted_payload",
                "sanitized_changed",
            ],
            "properties": {
                "detected": {"type": "boolean"},
                "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                "threshold": {"type": "number", "minimum": 0, "maximum": 1},
                "signals": {"type": "array", "items": {"type": "string"}},
                "details": {"type": "array", "items": {"type": "string"}},
                "extracted_payload": {"type": "string"},
                "sanitized_changed": {"type": "boolean"},
            },
        },
    },
}
