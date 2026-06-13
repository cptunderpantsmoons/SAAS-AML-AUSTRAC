from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field

# ── Enums ───────────────────────────────────────────────────────────────────

class OnboardingState(StrEnum):
    INITIATED = "initiated"
    DOCUMENT_ANALYSIS = "document_analysis"
    KYC_VERIFICATION = "kyc_verification"
    SANCTIONS_SCREENING = "sanctions_screening"
    KYB_LOOKUP = "kyb_lookup"
    UBO_CALCULATION = "ubo_calculation"
    RISK_AGGREGATION = "risk_aggregation"
    COMPLETED = "completed"
    FAILED = "failed"


class KYCStatus(StrEnum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    VERIFIED = "verified"
    REJECTED = "rejected"
    ERROR = "error"


class SanctionsMatchStatus(StrEnum):
    NO_MATCH = "no_match"
    POSSIBLE_MATCH = "possible_match"
    CONFIRMED_MATCH = "confirmed_match"
    ERROR = "error"


class KYBStatus(StrEnum):
    PENDING = "pending"
    FOUND = "found"
    NOT_FOUND = "not_found"
    ERROR = "error"


class RiskLevel(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


# ── Request Models ──────────────────────────────────────────────────────────

class InitiateOnboardingRequest(BaseModel):
    entity_name: str = Field(..., min_length=1, max_length=500)
    entity_type: str = Field(..., pattern="^(individual|organisation)$")
    country_code: str = Field(..., min_length=2, max_length=3)
    document_filename: str | None = None
    document_content_type: str | None = None


class KYCVerifyRequest(BaseModel):
    onboarding_id: str = Field(..., min_length=1)
    full_name: str = Field(..., min_length=1, max_length=500)
    date_of_birth: str | None = None
    document_type: str = Field(default="passport", pattern="^(passport|drivers_licence|national_id)$")
    country_of_issue: str = Field(default="AU", min_length=2, max_length=3)


# ── Adapter Result Models ───────────────────────────────────────────────────

class KYCVerificationResult(BaseModel):
    provider: str
    status: KYCStatus
    verification_id: str = ""
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    details: list[str] = Field(default_factory=list)
    raw_response: dict[str, Any] = Field(default_factory=dict)


class SanctionsScreeningResult(BaseModel):
    provider: str
    match_status: SanctionsMatchStatus
    matches: list[dict[str, Any]] = Field(default_factory=list)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    details: list[str] = Field(default_factory=list)
    raw_response: dict[str, Any] = Field(default_factory=dict)


class KYBLookupResult(BaseModel):
    provider: str
    status: KYBStatus
    # The graph key in the UBO Neo4j store (e.g. ``co-abc12345``) that
    # corresponds to this entity.  Populated by the KYB adapter when it
    # resolves the registered business; the orchestration layer uses it
    # to call the UBO graph service.
    entity_id: str = ""
    entity_name: str = ""
    registration_id: str = ""
    jurisdiction: str = ""
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    details: list[str] = Field(default_factory=list)
    raw_response: dict[str, Any] = Field(default_factory=dict)


# ── UBO & Risk Score Models (Sprint 3) ─────────────────────────────────────

class UBOResult(BaseModel):
    """Summary of UBO calculation attached to a workflow."""
    entity_id: str
    beneficial_owner_count: int = 0
    total_ownership_accounted: float = 0.0
    max_depth_traversed: int = 0
    above_threshold_count: int = 0
    confidence_score: float = 1.0
    result_hash: str = ""


class RiskScoreComponent(BaseModel):
    """Individual risk component with raw score and applied weight."""
    raw_score: float = Field(default=0.0, ge=0.0, le=1.0)
    weight: float = Field(default=0.0, ge=0.0, le=1.0)
    weighted_score: float = Field(default=0.0, ge=0.0, le=1.0)


class RiskScoreResult(BaseModel):
    """Aggregated risk score with weighted component breakdown.

    Sprint 3 deliverable: rebalanced 4-component risk model
    (kyc=0.35, sanctions=0.30, document=0.20, ubo=0.15).
    """
    kyc: RiskScoreComponent = Field(default_factory=RiskScoreComponent)
    sanctions: RiskScoreComponent = Field(default_factory=RiskScoreComponent)
    document: RiskScoreComponent = Field(default_factory=RiskScoreComponent)
    ubo: RiskScoreComponent = Field(default_factory=RiskScoreComponent)
    aggregate_score: float = Field(default=0.0, ge=0.0, le=100.0)
    risk_level: RiskLevel = RiskLevel.LOW
    weights_sum: float = Field(default=1.0, ge=0.0, le=1.01)


# ── Response Models ─────────────────────────────────────────────────────────

class OnboardingStatusResponse(BaseModel):
    onboarding_id: str
    state: OnboardingState
    entity_name: str
    entity_type: str
    country_code: str
    document_analysis: dict[str, Any] | None = None
    kyc_verification: KYCVerificationResult | None = None
    sanctions_screening: SanctionsScreeningResult | None = None
    kyb_lookup: KYBLookupResult | None = None
    ubo_result: UBOResult | None = None
    risk_score: float | None = None
    risk_level: RiskLevel | None = None
    risk_score_result: RiskScoreResult | None = None
    created_at: str
    updated_at: str


class InitiateOnboardingResponse(BaseModel):
    onboarding_id: str
    state: OnboardingState
    created_at: str


class KYCVerifyResponse(BaseModel):
    onboarding_id: str
    kyc_verification: KYCVerificationResult
    updated_at: str


class RiskAggregation(BaseModel):
    onboarding_id: str
    risk_score: float = Field(..., ge=0.0, le=100.0)
    risk_level: RiskLevel
    components: dict[str, Any] = Field(default_factory=dict)
    calculated_at: str


class ErrorResponse(BaseModel):
    error: str
    detail: str = ""
    onboarding_id: str | None = None


# ── Internal Workflow State ─────────────────────────────────────────────────

class WorkflowState(BaseModel):
    """Mutable state carried through the orchestration pipeline."""
    onboarding_id: str
    state: OnboardingState = OnboardingState.INITIATED
    entity_name: str
    entity_type: str
    country_code: str
    document_analysis: dict[str, Any] | None = None
    kyc_verification: KYCVerificationResult | None = None
    sanctions_screening: SanctionsScreeningResult | None = None
    kyb_lookup: KYBLookupResult | None = None
    ubo_result: UBOResult | None = None
    risk_score: float | None = None
    risk_level: RiskLevel | None = None
    risk_score_result: RiskScoreResult | None = None
    created_at: str = Field(default_factory=lambda: datetime.now(UTC).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(UTC).isoformat())
    error_message: str | None = None

    def touch(self) -> None:
        self.updated_at = datetime.now(UTC).isoformat()
