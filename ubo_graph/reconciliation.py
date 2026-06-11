from __future__ import annotations

import logging
from typing import Any

from ubo_graph.models import (
    BeneficialOwner,
    ReconciledUBO,
    ReconciliationResult,
    UBOCalculationResult,
)
from ubo_graph.ubo_service import _classify_threshold

logger = logging.getLogger("ubo_graph.reconciliation")

# Discrepancy threshold: flag if KYB vs graph differ by more than this %
DISCREPANCY_THRESHOLD_PCT = 5.0


class ReconciliationService:
    """Merges graph-derived UBO data with KYB provider data.

    Parameters
    ----------
    discrepancy_threshold:
        Flag discrepancies where ownership differs by more than this %.
    """

    def __init__(
        self,
        discrepancy_threshold: float = DISCREPANCY_THRESHOLD_PCT,
    ) -> None:
        self._discrepancy_threshold = discrepancy_threshold

    def reconcile(
        self,
        graph_result: UBOCalculationResult,
        kyb_data: list[dict[str, Any]],
        kyb_provider: str = "",
        threshold_percentage: float = 25.0,
    ) -> ReconciliationResult:
        """Reconcile graph UBO results with KYB provider data.

        Parameters
        ----------
        graph_result:
            UBO calculation result from the graph engine.
        kyb_data:
            List of KYB provider results, each with keys:
            ``person_id``, ``name``, ``ownership_percentage``.
        kyb_provider:
            Name of the KYB provider (e.g. ``"kyckr"``).
        threshold_percentage:
            Beneficial ownership threshold.
        """
        # Index KYB data by person_id
        kyb_by_person: dict[str, dict[str, Any]] = {}
        for entry in kyb_data:
            person_id = entry.get("person_id", "")
            if person_id:
                kyb_by_person[person_id] = entry

        # Build index of graph UBOs
        graph_by_person: dict[str, BeneficialOwner] = {
            bo.person_id: bo for bo in graph_result.beneficial_owners
        }

        # Merge all person_ids from both sources
        all_person_ids = set(graph_by_person.keys()) | set(kyb_by_person.keys())

        reconciled: list[ReconciledUBO] = []

        for person_id in sorted(all_person_ids):
            graph_bo = graph_by_person.get(person_id)
            kybo = kyb_by_person.get(person_id)

            graph_pct = graph_bo.effective_ownership_percentage if graph_bo else 0.0
            kyb_pct = float(kybo.get("ownership_percentage", 0.0)) if kybo else None

            discrepancy: float | None = None
            if kyb_pct is not None:
                discrepancy = abs(graph_pct - kyb_pct)

            # Use the higher confidence source for threshold classification
            effective_pct = max(graph_pct, kyb_pct or 0.0)
            threshold_status = _classify_threshold(effective_pct, threshold_percentage)

            note = ""
            if discrepancy is not None and discrepancy > self._discrepancy_threshold:
                note = f"Discrepancy: graph={graph_pct:.2f}%, kyb={kyb_pct:.2f}% (Δ={discrepancy:.2f}%)"
                logger.warning(
                    "UBO reconciliation discrepancy: entity=%s person=%s %s",
                    graph_result.entity_id, person_id, note,
                )
            elif graph_bo is None and kybo is not None:
                note = "Present in KYB only — not found in graph"
            elif graph_bo is not None and kybo is None:
                note = "Present in graph only — not found in KYB data"

            confidence = 1.0
            if discrepancy is not None and discrepancy > self._discrepancy_threshold:
                confidence = 0.5

            reconciled.append(
                ReconciledUBO(
                    person_id=person_id,
                    name=graph_bo.name if graph_bo else (kybo.get("name", "") if kybo else ""),
                    graph_ownership_percentage=round(graph_pct, 4),
                    kyb_ownership_percentage=round(kyb_pct, 4) if kyb_pct is not None else None,
                    discrepancy_percentage=round(discrepancy, 4) if discrepancy is not None else None,
                    confidence=confidence,
                    threshold_status=threshold_status,
                    reconciliation_note=note,
                )
            )

        from ubo_graph.ubo_service import _compute_result_hash
        result_hash = _compute_result_hash(graph_result)

        return ReconciliationResult(
            entity_id=graph_result.entity_id,
            reconciled_ubos=reconciled,
            kyb_provider=kyb_provider,
            graph_result_hash=result_hash,
        )
