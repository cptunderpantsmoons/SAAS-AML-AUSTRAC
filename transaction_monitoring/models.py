from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class Severity(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class AlertStatus(StrEnum):
    OPEN = "open"
    ASSIGNED = "assigned"
    RESOLVED = "resolved"
    DISMISSED = "dismissed"


class RuleCondition(BaseModel):
    field: str
    operator: str = Field(..., pattern="^(==|!=|<|>|<=|>=|in|not_in|contains)$")
    value: Any


class Rule(BaseModel):
    rule_id: UUID = Field(default_factory=uuid4)
    name: str = Field(..., min_length=1)
    description: str = ""
    conditions: list[RuleCondition]
    base_severity: Severity
    window_days: int = Field(default=1, ge=1, le=30)
    enabled: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class Transaction(BaseModel):
    transaction_id: UUID = Field(default_factory=uuid4)
    onboarding_id: str = Field(..., min_length=1)
    amount: float = Field(..., gt=0)
    currency: str = "AUD"
    sender_account: str = ""
    receiver_account: str = ""
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))
    metadata: dict[str, Any] = Field(default_factory=dict)


class Alert(BaseModel):
    alert_id: UUID = Field(default_factory=uuid4)
    rule_id: UUID
    onboarding_id: str
    transaction_ids: list[UUID] = Field(default_factory=list)
    base_severity: Severity
    final_severity: Severity
    document_risk_score: float = Field(default=0.0, ge=0.0, le=1.0)
    status: AlertStatus = AlertStatus.OPEN
    assigned_to: str = ""
    notes: str = ""
    legal_hold: bool = False
    deleted_at: datetime | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class CreateRuleRequest(BaseModel):
    name: str = Field(..., min_length=1)
    description: str = ""
    conditions: list[RuleCondition]
    base_severity: Severity
    window_days: int = Field(default=1, ge=1, le=30)


class CreateTransactionRequest(BaseModel):
    onboarding_id: str = Field(..., min_length=1)
    amount: float = Field(..., gt=0)
    currency: str = "AUD"
    sender_account: str = ""
    receiver_account: str = ""
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))
    metadata: dict[str, Any] = Field(default_factory=dict)


class UpdateAlertStatusRequest(BaseModel):
    status: AlertStatus
    notes: str = ""


class AssignAlertRequest(BaseModel):
    assigned_to: str = Field(..., min_length=1)


class AlertListResponse(BaseModel):
    alerts: list[Alert]
    total: int
    page: int = 1
    page_size: int = 50


class StructuringResult(BaseModel):
    detected: bool
    pattern: str = ""
    transaction_count: int = 0
    total_amount: float = 0.0
    window_days: int = 0
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
