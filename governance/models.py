from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class UserRole(StrEnum):
    COMPLIANCE_OFFICER = "compliance_officer"
    CLIENT_STAFF = "client_staff"
    BOARD_MEMBER = "board_member"
    SYSTEM = "system"


class AuditLogEntry(BaseModel):
    audit_id: UUID = Field(default_factory=uuid4)
    event_type: str = Field(..., min_length=1)
    payload_hash: str = ""
    receipt_id: str = ""
    user_role: str = "system"
    details: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class BoardMetrics(BaseModel):
    total_alerts: int = 0
    open_alerts: int = 0
    smr_in_progress: int = 0
    avg_resolution_hours: float = 0.0
    risk_appetite_score: float = Field(default=0.0, ge=0.0, le=1.0)
    computed_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class DigitalSignature(BaseModel):
    signature_id: UUID = Field(default_factory=uuid4)
    report_id: str = Field(..., min_length=1)
    signed_by: str = Field(..., min_length=1)
    kms_key_arn: str = ""
    signature_b64: str = ""
    signed_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class MonthlyReport(BaseModel):
    report_id: UUID = Field(default_factory=uuid4)
    month: str = Field(..., min_length=1)
    total_smr: int = 0
    total_ttr: int = 0
    total_ifti_e: int = 0
    risk_appetite_score: float = Field(default=0.0, ge=0.0, le=1.0)
    board_approved: bool = False
    board_approved_by: str = ""
    board_approved_at: datetime | None = None
