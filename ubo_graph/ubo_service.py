"""UBO calculation service — recursive ownership unwrapping.

Implements the AUSTRAC "reasonable steps" methodology:
  1. Walk the ownership graph upstream from the target entity.
  2. Aggregate ownership percentages across all paths to each Person.
  3. Apply the 25% beneficial ownership threshold.
  4. Handle trust-specific rules (trustee deemed ownership).
  5. Merge in trustee-deemed ownership for trusts.
"""
from __future__ import annotations

import hashlib
import json
import logging
import time
from collections import defaultdict
from typing import Any

from ubo_graph.db_client import Neo4jClient
from ubo_graph.models import (
    BeneficialOwner,
    EdgeType,
    OwnershipPath,
    OwnershipThreshold,
    UBOAuditEntry,
    UBOCalculationResult,
    UBOCalculationStatus,
)

logger = logging.getLogger("ubo_graph.ubo_service")

# AUSTRAC beneficial ownership threshold
DEFAULT_THRESHOLD_PERCENTAGE = 25.0
DEFAULT_MAX_DEPTH = 5


def _compute_result_hash(result: UBOCalculationResult) -> str:
    """Deterministic hash of the UBO result for audit integrity."""
    payload = json.dumps(
        {
            "entity_id": result.entity_id,
            "beneficial_owners": [
                {"person_id": bo.person_id, "effective_ownership_percentage": bo.effective_ownership_percentage}
                for bo in sorted(result.beneficial_owners, key=lambda b: b.person_id)
            ],
            "total_ownership_accounted": result.total_ownership_accounted,
        },
        sort_keys=True,
    )
    return hashlib.sha256(payload.encode()).hexdigest()[:16]


def _classify_threshold(percentage: float, threshold: float) -> OwnershipThreshold:
    if percentage > threshold:
        return OwnershipThreshold.ABOVE_THRESHOLD
    if abs(percentage - threshold) < 0.01:
        return OwnershipThreshold.AT_THRESHOLD
    return OwnershipThreshold.BELOW_THRESHOLD


class UBOService:
    """Core UBO calculation engine.

    Parameters
    ----------
    db_client:
        Neo4j (or in-memory fallback) graph client.
    threshold_percentage:
        Beneficial ownership threshold (default 25% per AUSTRAC).
    """

    def __init__(
        self,
        db_client: Neo4jClient,
        threshold_percentage: float = DEFAULT_THRESHOLD_PERCENTAGE,
    ) -> None:
        self._db = db_client
        self._threshold = threshold_percentage

    @property
    def threshold_percentage(self) -> float:
        return self._threshold

    def calculate(
        self,
        entity_id: str,
        max_depth: int = DEFAULT_MAX_DEPTH,
        threshold_percentage: float | None = None,
        include_paths: bool = True,
    ) -> UBOCalculationResult:
        """Calculate beneficial owners for *entity_id*.

        Walks the ownership graph upstream, aggregating ownership
        percentages across all paths to each Person node.
        """
        start = time.monotonic()
        threshold = threshold_percentage if threshold_percentage is not None else self._threshold

        # Check entity exists
        entity_info = self._db.entity_exists(entity_id)
        if entity_info is None:
            return UBOCalculationResult(
                entity_id=entity_id,
                status=UBOCalculationStatus.FAILED,
                threshold_percentage=threshold,
                error_message=f"Entity {entity_id} not found in graph",
                calculation_time_ms=0.0,
            )

        # Walk ownership paths
        raw_paths = self._db.ubo_paths(entity_id, max_depth=max_depth)

        # Also get trustee-deemed ownership
        trustee_paths = self._db.trustee_deemed_ownership(entity_id)

        # Aggregate ownership per person
        owner_aggregates: dict[str, dict[str, Any]] = defaultdict(
            lambda: {
                "name": "",
                "country_code": "AU",
                "total_ownership": 0.0,
                "paths": [],
                "max_depth": 0,
                "is_politically_exposed": False,
            },
        )

        nodes_visited = set()

        for path_data in raw_paths:
            person_id = path_data["person_id"]
            effective_pct = path_data.get("effective_percentage", 0.0)
            depth = path_data["depth"]

            agg = owner_aggregates[person_id]
            agg["name"] = path_data["name"]
            agg["country_code"] = path_data.get("country_code", "AU")
            agg["total_ownership"] += effective_pct
            agg["max_depth"] = max(agg["max_depth"], depth)

            if include_paths:
                agg["paths"].append(
                    OwnershipPath(
                        path=path_data.get("path_nodes", [entity_id, person_id]),
                        ownership_percentage=effective_pct,
                        edge_types=[EdgeType(et) for et in path_data.get("edge_types", [])],
                        depth=depth,
                    )
                )

            for nid in path_data.get("path_nodes", []):
                nodes_visited.add(nid)

        # Process trustee-deemed ownership
        for trustee_data in trustee_paths:
            person_id = trustee_data["person_id"]
            deemed_pct = trustee_data["deemed_percentage"]
            agg = owner_aggregates[person_id]
            agg["name"] = trustee_data["name"]
            agg["country_code"] = trustee_data.get("country_code", "AU")
            agg["total_ownership"] += deemed_pct
            agg["is_politically_exposed"] = False

        # Build BeneficialOwner list
        beneficial_owners: list[BeneficialOwner] = []
        total_accounted = 0.0

        for person_id, agg in sorted(owner_aggregates.items(), key=lambda x: -x[1]["total_ownership"]):
            effective_pct = min(agg["total_ownership"], 100.0)
            total_accounted += effective_pct
            threshold_status = _classify_threshold(effective_pct, threshold)

            beneficial_owners.append(
                BeneficialOwner(
                    person_id=person_id,
                    name=agg["name"],
                    total_ownership_percentage=round(agg["total_ownership"], 4),
                    effective_ownership_percentage=round(effective_pct, 4),
                    threshold_status=threshold_status,
                    confidence=min(1.0, 1.0 - (max(agg["max_depth"] - 1, 0) * 0.05)),
                    ownership_paths=agg["paths"],
                    is_politically_exposed=agg["is_politically_exposed"],
                    country_code=agg["country_code"],
                )
            )

        elapsed_ms = (time.monotonic() - start) * 1000.0
        max_depth_traversed = max(
            (bo.ownership_paths[-1].depth for bo in beneficial_owners if bo.ownership_paths),
            default=0,
        )

        result = UBOCalculationResult(
            entity_id=entity_id,
            status=UBOCalculationStatus.COMPLETED,
            beneficial_owners=beneficial_owners,
            total_ownership_accounted=round(total_accounted, 4),
            max_depth_traversed=max_depth_traversed,
            threshold_percentage=threshold,
            confidence_score=round(
                max(0.0, 1.0 - (max(max_depth_traversed - 1, 0) * 0.05)), 2,
            ) if beneficial_owners else 1.0,
            graph_nodes_visited=len(nodes_visited) + 1,  # +1 for the entity itself
            calculation_time_ms=round(elapsed_ms, 2),
        )

        # Compute result hash
        result_hash = _compute_result_hash(result)
        logger.info(
            "UBO calculation: entity=%s owners=%d total_ownership=%.2f%% hash=%s",
            entity_id, len(beneficial_owners), total_accounted, result_hash,
        )

        return result

    def create_audit_entry(
        self,
        result: UBOCalculationResult,
        query_params: dict[str, Any],
        from_cache: bool = False,
    ) -> UBOAuditEntry:
        """Create an audit entry for compliance logging."""
        result_hash = _compute_result_hash(result)
        return UBOAuditEntry(
            entity_id=result.entity_id,
            query_parameters=query_params,
            result_hash=result_hash,
            beneficial_owner_count=len(result.beneficial_owners),
            max_depth_traversed=result.max_depth_traversed,
            threshold_percentage=result.threshold_percentage,
            calculation_time_ms=result.calculation_time_ms,
            from_cache=from_cache,
        )
