from __future__ import annotations

from pathlib import Path
from typing import Any, ClassVar

from lxml import etree

from austrac_reporting.models import ReportType

XSD_DIR = Path(__file__).parent / "xsd"


class XSDValidationError(Exception):
    """Raised when XML fails XSD validation."""

    def __init__(self, message: str, error_log: Any) -> None:
        super().__init__(message)
        self.error_log = error_log


class XSDValidator:
    """Pre-flight XML validation against AUSTRAC-published XSD schemas."""

    _schemas: ClassVar[dict[str, etree.XMLSchema]] = {}

    @classmethod
    def _load_schema(cls, report_type: ReportType) -> etree.XMLSchema:
        if report_type.value in cls._schemas:
            return cls._schemas[report_type.value]

        xsd_file = XSD_DIR / f"{report_type.value}.xsd"
        if not xsd_file.exists():
            # Wrap the OS-level FileNotFoundError in a ValueError so callers
            # can treat "no schema for this report type" as a domain error
            # rather than having to catch OSError/FileNotFoundError.
            raise ValueError(f"XSD schema not found for report type: {report_type.value}") from FileNotFoundError(
                xsd_file
            )

        with open(xsd_file, "rb") as f:
            schema_doc = etree.parse(f)
        schema = etree.XMLSchema(schema_doc)
        cls._schemas[report_type.value] = schema
        return schema

    @classmethod
    def validate(cls, report_type: ReportType, xml_content: str) -> tuple[bool, list[str]]:
        """Validate XML string against the XSD for the given report type."""
        try:
            schema = cls._load_schema(report_type)
            xml_doc = etree.fromstring(xml_content.encode("utf-8"))
            schema.assertValid(xml_doc)
            return True, []
        except etree.DocumentInvalid as exc:
            errors = [str(error) for error in exc.error_log]
            return False, errors
        except Exception as exc:
            return False, [str(exc)]
