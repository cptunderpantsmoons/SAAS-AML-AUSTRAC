from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class ReportType(StrEnum):
    SMR = "smr"
    TTR = "ttr"
    IFTI_E = "ifti_e"


class Severity(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class SubjectType(StrEnum):
    INDIVIDUAL = "individual"
    ORGANISATION = "organisation"


class ReportingEntity(BaseModel):
    name: str
    abn: str
    sector: str
    contact_email: str
    contact_phone: str


class SubjectDetails(BaseModel):
    subject_type: SubjectType
    full_name: str
    date_of_birth: str | None = None
    identifiers: list[dict[str, str]] = Field(default_factory=list)
    addresses: list[str] = Field(default_factory=list)


class TransactionDetail(BaseModel):
    transaction_id: str
    date: str
    amount: float
    currency: str = "AUD"
    accounts: list[str] = Field(default_factory=list)
    description: str = ""


class SuspicionGrounds(BaseModel):
    grounds: list[str] = Field(default_factory=list)
    risk_indicators: list[str] = Field(default_factory=list)


class ReportPayload(BaseModel):
    report_id: UUID = Field(default_factory=uuid4)
    report_type: ReportType
    reporting_entity: ReportingEntity
    subject: SubjectDetails
    transactions: list[TransactionDetail] = Field(default_factory=list)
    suspicion: SuspicionGrounds | None = None
    document_risk_score: float = Field(ge=0.0, le=1.0, default=0.0)
    source_data_hash: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    metadata: dict[str, Any] = Field(default_factory=dict)


class NarrativeDraft(BaseModel):
    draft_text: str
    requires_human_approval: bool = True
    confidence_score: float = Field(ge=0.0, le=1.0, default=0.0)
    model_used: str = ""
    generated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class GenerateReportRequest(BaseModel):
    payload: ReportPayload
    include_narrative: bool = False


class GenerateReportResponse(BaseModel):
    report_id: UUID
    report_type: ReportType
    xml_content: str
    narrative: NarrativeDraft | None = None
    xsd_valid: bool
    validation_errors: list[str] = Field(default_factory=list)
    generated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class GatewayResult(BaseModel):
    message_id: UUID
    status: str
    http_status: int | None = None
    receipt_id: str | None = None
    error_message: str | None = None
    transmitted_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class DeadLetterEntry(BaseModel):
    message_id: UUID
    payload: dict[str, Any]
    error_message: str
    retry_count: int = 0
    next_retry_at: datetime | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
