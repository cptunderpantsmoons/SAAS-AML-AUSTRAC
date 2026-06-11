from __future__ import annotations

import logging

from ubo_graph.models import UBOAuditEntry

logger = logging.getLogger("ubo_graph.audit")


class UBOAuditLogger:
    """Compliance audit logger for UBO calculations.

    Writes structured audit entries to the application log (which flows
    through CloudWatch/Splunk handlers from Sprint 2) and maintains
    an in-memory buffer for retrieval.
    """

    def __init__(self, max_entries: int = 10_000) -> None:
        self._entries: list[UBOAuditEntry] = []
        self._max_entries = max_entries

    def log(self, entry: UBOAuditEntry) -> None:
        """Record an audit entry."""
        if len(self._entries) >= self._max_entries:
            self._entries = self._entries[len(self._entries) // 2:]

        self._entries.append(entry)

        # Emit structured log for CloudWatch/Splunk ingestion
        logger.info(
            "UBO_AUDIT audit_id=%s entity_id=%s result_hash=%s "
            "owner_count=%d max_depth=%d threshold=%.1f%% "
            "calc_time_ms=%.2f from_cache=%s",
            entry.audit_id,
            entry.entity_id,
            entry.result_hash,
            entry.beneficial_owner_count,
            entry.max_depth_traversed,
            entry.threshold_percentage,
            entry.calculation_time_ms,
            entry.from_cache,
        )

    def get_entries(self, entity_id: str | None = None, limit: int = 100) -> list[UBOAuditEntry]:
        """Retrieve audit entries, optionally filtered by entity_id."""
        entries = self._entries
        if entity_id is not None:
            entries = [e for e in entries if e.entity_id == entity_id]
        return entries[-limit:]

    def get_entry_by_audit_id(self, audit_id: str) -> UBOAuditEntry | None:
        """Retrieve a specific audit entry by its ID."""
        for entry in reversed(self._entries):
            if entry.audit_id == audit_id:
                return entry
        return None

    @property
    def entry_count(self) -> int:
        return len(self._entries)

    def clear(self) -> None:
        self._entries.clear()
