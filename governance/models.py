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


# ── Case Management ────────────────────────────────────────────────────────────

class CasePriority(StrEnum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class CaseStatus(StrEnum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    ESCALATED = "escalated"
    CLOSED = "closed"


class CaseType(StrEnum):
    SAR_INVESTIGATION = "SAR Investigation"
    PEP_REVIEW = "PEP Review"
    SANCTIONS_REVIEW = "Sanctions Review"
    TRANSACTION_REVIEW = "Transaction Review"
    KYC_DISCREPANCY = "KYC Discrepancy"


class CaseNote(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    author: str = Field(..., min_length=1)
    content: str = Field(..., min_length=1)
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))


class StatusChange(BaseModel):
    status: CaseStatus
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))
    actor: str = Field(..., min_length=1)
    note: str = ""


class LinkedEvidence(BaseModel):
    id: str = Field(..., min_length=1)
    type: str = Field(..., min_length=1)  # "document" | "alert" | "transaction"
    title: str = Field(..., min_length=1)
    description: str = ""
    date: str = Field(default_factory=lambda: datetime.now(UTC).date().isoformat())


class AmlCase(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    case_id: str = Field(..., min_length=1)  # human-friendly CASE-2026-001
    title: str = Field(..., min_length=1)
    description: str = ""
    type: CaseType
    priority: CasePriority
    status: CaseStatus = CaseStatus.OPEN
    assigned_to: str = "Unassigned"
    client_id: str = ""
    client_name: str = Field(..., min_length=1)
    linked_alerts: list[str] = Field(default_factory=list)
    linked_documents: list[str] = Field(default_factory=list)
    linked_evidence: list[LinkedEvidence] = Field(default_factory=list)
    notes: list[CaseNote] = Field(default_factory=list)
    status_timeline: list[StatusChange] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    closed_at: datetime | None = None


class CreateCaseRequest(BaseModel):
    title: str = Field(..., min_length=1)
    description: str = ""
    type: CaseType
    priority: CasePriority
    client_id: str = ""
    client_name: str = Field(..., min_length=1)
    assigned_to: str = "Unassigned"
    linked_alerts: list[str] = Field(default_factory=list)
    linked_documents: list[str] = Field(default_factory=list)


class UpdateCaseRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    priority: CasePriority | None = None
    status: CaseStatus | None = None
    assigned_to: str | None = None
    linked_alerts: list[str] | None = None
    linked_documents: list[str] | None = None
    note: str | None = None
    actor: str | None = None


class AddCaseNoteRequest(BaseModel):
    author: str = Field(..., min_length=1)
    content: str = Field(..., min_length=1)


# ── Compliance Tasks ──────────────────────────────────────────────────────────

class TaskPriority(StrEnum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class TaskStatus(StrEnum):
    ACTIVE = "active"
    COMPLETED = "completed"


class TaskCategory(StrEnum):
    KYC_REVIEW = "KYC Review"
    SANCTIONS = "Sanctions"
    REPORT_FILING = "Report Filing"
    AUDIT = "Audit"
    TRAINING = "Training"


class ComplianceTask(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    title: str = Field(..., min_length=1)
    description: str = ""
    priority: TaskPriority = TaskPriority.MEDIUM
    status: TaskStatus = TaskStatus.ACTIVE
    due_date: datetime = Field(default_factory=lambda: datetime.now(UTC))
    assignee: str = "Unassigned"
    category: TaskCategory
    completed_at: datetime | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class CreateTaskRequest(BaseModel):
    title: str = Field(..., min_length=1)
    description: str = ""
    priority: TaskPriority = TaskPriority.MEDIUM
    due_date: datetime
    assignee: str = "Unassigned"
    category: TaskCategory


class UpdateTaskRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    priority: TaskPriority | None = None
    status: TaskStatus | None = None
    due_date: datetime | None = None
    assignee: str | None = None
    category: TaskCategory | None = None


# ── Audit Changes (user-facing change log) ────────────────────────────────────

class AuditChangeEntry(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    user: str = "system"
    action: str = Field(..., min_length=1)  # "create" | "update" | "delete" | "sign" | ...
    entity_type: str = Field(..., min_length=1)  # "case" | "task" | "report" | "client" | ...
    entity_id: str = Field(..., min_length=1)
    changes: dict[str, Any] = Field(default_factory=dict)  # before/after diff
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))


class RecordAuditChangeRequest(BaseModel):
    user: str = "system"
    action: str = Field(..., min_length=1)
    entity_type: str = Field(..., min_length=1)
    entity_id: str = Field(..., min_length=1)
    changes: dict[str, Any] = Field(default_factory=dict)


# ── Integration Provider Status ───────────────────────────────────────────────

class ProviderStatus(BaseModel):
    name: str
    status: str  # "connected" | "disconnected" | "degraded"
    last_sync: datetime | None = None
    description: str = ""
    healthy: bool = True


class UpdateProviderRequest(BaseModel):
    name: str = Field(..., min_length=1)
    status: str = Field(..., min_length=1)
    description: str = ""


# ── Service Health ────────────────────────────────────────────────────────────

class ServiceStatus(BaseModel):
    name: str
    status: str  # "operational" | "degraded" | "down"
    uptime_pct: float = Field(default=100.0, ge=0.0, le=100.0)
    response_time_ms: float = Field(default=0.0, ge=0.0)
    last_incident: str = ""
    response_history: list[float] = Field(default_factory=list)
    healthy: bool = True
    checked_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


# ── Sanctions Screening ───────────────────────────────────────────────────────

class SanctionsSource(BaseModel):
    id: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1)
    enabled: bool = True
    last_check: datetime | None = None
    entries_indexed: int = 0
    healthy: bool = True


class SanctionsMatch(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    client_id: str = Field(default="", max_length=256)
    client_name: str = Field(..., min_length=1)
    source: str = Field(..., min_length=1)
    confidence: float = Field(ge=0.0, le=100.0)
    match_type: str = Field(..., min_length=1)  # "Exact" | "Partial" | "Fuzzy"
    status: str = Field(default="Pending Review")  # "Pending Review" | "Confirmed Match" | "False Positive" | "Cleared"
    listed_entity: str = Field(..., min_length=1)
    listed_entity_id: str = ""
    program: str = ""
    screened_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class ScreenRequest(BaseModel):
    query: str = Field(..., min_length=1)
    client_id: str = ""
    client_name: str = ""


class UpdateSanctionsMatchRequest(BaseModel):
    status: str = Field(..., min_length=1)

