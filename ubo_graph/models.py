from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field

# ── Enums ───────────────────────────────────────────────────────────────────

class NodeType(StrEnum):
    PERSON = "Person"
    COMPANY = "Company"
    TRUST = "Trust"


class EdgeType(StrEnum):
    OWNS_SHARES = "OWNS_SHARES"
    IS_TRUSTEE_OF = "IS_TRUSTEE_OF"
    CONTROLS = "CONTROLS"


class UBOCalculationStatus(StrEnum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"


class OwnershipThreshold(StrEnum):
    """AUSTRAC 25% beneficial ownership threshold."""
    ABOVE_THRESHOLD = "above_threshold"
    BELOW_THRESHOLD = "below_threshold"
    AT_THRESHOLD = "at_threshold"


# ── Graph Node Models ───────────────────────────────────────────────────────

class GraphNode(BaseModel):
    """A node in the UBO ownership graph."""
    node_id: str = Field(..., min_length=1)
    node_type: NodeType
    name: str = Field(..., min_length=1)
    country_code: str = Field(default="AU", min_length=2, max_length=3)
    registration_id: str | None = None
    properties: dict[str, Any] = Field(default_factory=dict)


class GraphEdge(BaseModel):
    """A directed edge in the UBO ownership graph (source → target)."""
    edge_id: str = Field(..., min_length=1)
    source_id: str = Field(..., min_length=1)
    target_id: str = Field(..., min_length=1)
    edge_type: EdgeType
    ownership_percentage: float = Field(default=0.0, ge=0.0, le=100.0)
    effective_date: str | None = None
    properties: dict[str, Any] = Field(default_factory=dict)


# ── UBO Result Models ───────────────────────────────────────────────────────

class OwnershipPath(BaseModel):
    """A single ownership chain from the target entity to a beneficial owner."""
    path: list[str] = Field(..., description="Ordered node IDs from target to UBO")
    ownership_percentage: float = Field(..., ge=0.0, le=100.0)
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    edge_types: list[EdgeType] = Field(default_factory=list)
    depth: int = Field(..., ge=1)


class BeneficialOwner(BaseModel):
    """An identified beneficial owner of an entity."""
    person_id: str
    name: str
    total_ownership_percentage: float = Field(..., ge=0.0, le=100.0)
    effective_ownership_percentage: float = Field(
        ..., ge=0.0, le=100.0,
        description="Ownership after applying threshold and trust rules",
    )
    threshold_status: OwnershipThreshold
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    ownership_paths: list[OwnershipPath] = Field(default_factory=list)
    is_politically_exposed: bool = False
    country_code: str = "AU"


class UBOCalculationResult(BaseModel):
    """Full result of a UBO calculation for an entity."""
    entity_id: str
    status: UBOCalculationStatus
    beneficial_owners: list[BeneficialOwner] = Field(default_factory=list)
    total_ownership_accounted: float = Field(
        default=0.0, ge=0.0,
        description="Sum of all UBO ownership percentages (may exceed 100% via multiple paths)",
    )
    max_depth_traversed: int = Field(default=0, ge=0)
    threshold_percentage: float = Field(default=25.0, description="AUSTRAC threshold")
    confidence_score: float = Field(default=1.0, ge=0.0, le=1.0)
    graph_nodes_visited: int = Field(default=0, ge=0)
    calculation_time_ms: float = Field(default=0.0, ge=0.0)
    calculated_at: str = Field(default_factory=lambda: datetime.now(UTC).isoformat())
    error_message: str | None = None


# ── Request / Response Models ───────────────────────────────────────────────

class UBOCalculateRequest(BaseModel):
    entity_id: str = Field(..., min_length=1)
    max_depth: int = Field(default=5, ge=1, le=10)
    threshold_percentage: float = Field(default=25.0, ge=0.0, le=100.0)
    include_paths: bool = Field(default=True)


class UBOCalculateResponse(BaseModel):
    result: UBOCalculationResult
    from_cache: bool = False


class ErrorResponse(BaseModel):
    error: str
    detail: str = ""
    entity_id: str | None = None


# ── Reconciliation Models ──────────────────────────────────────────────────

class ReconciledUBO(BaseModel):
    """UBO data reconciled between graph calculation and KYB provider data."""
    person_id: str
    name: str
    graph_ownership_percentage: float
    kyb_ownership_percentage: float | None = None
    discrepancy_percentage: float | None = None
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    threshold_status: OwnershipThreshold
    reconciliation_note: str = ""


class ReconciliationResult(BaseModel):
    entity_id: str
    reconciled_ubos: list[ReconciledUBO] = Field(default_factory=list)
    kyb_provider: str = ""
    graph_result_hash: str = ""
    reconciliation_timestamp: str = Field(
        default_factory=lambda: datetime.now(UTC).isoformat(),
    )


# ── Audit Models ────────────────────────────────────────────────────────────

class UBOAuditEntry(BaseModel):
    """Audit record for a UBO calculation, stored for compliance."""
    audit_id: str = Field(default_factory=lambda: f"ubo-audit-{datetime.now(UTC).strftime('%Y%m%d%H%M%S%f')}")
    entity_id: str
    query_parameters: dict[str, Any] = Field(default_factory=dict)
    result_hash: str = ""
    beneficial_owner_count: int = 0
    max_depth_traversed: int = 0
    threshold_percentage: float = 25.0
    calculation_time_ms: float = 0.0
    from_cache: bool = False
    timestamp: str = Field(default_factory=lambda: datetime.now(UTC).isoformat())
