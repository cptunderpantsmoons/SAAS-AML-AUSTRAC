from __future__ import annotations

import pytest
from jsonschema import Draft202012Validator


def load_schema():
    try:
        from document_detection_engine.schemas import ANALYSIS_RESPONSE_SCHEMA
    except ModuleNotFoundError as exc:
        pytest.fail(f"analysis schema module missing: {exc}")

    return ANALYSIS_RESPONSE_SCHEMA


def test_analysis_schema_is_draft_2020_12_and_strict_on_required_sections():
    schema = load_schema()

    Draft202012Validator.check_schema(schema)
    assert schema["$schema"] == "https://json-schema.org/draft/2020-12/schema"
    assert set(schema["required"]) == {
        "analysis_id",
        "document",
        "modules",
        "summary",
        "audit",
    }
