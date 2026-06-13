"""Audit change log service.

A small, append-only ring buffer of user-facing change-log entries
(distinct from the immutable cryptographic audit trail in
``audit.py``).  The Settings UI reads from this list to show
"who did what when" without exposing the full AUSTRAC-mandated
immutable log.
"""
from __future__ import annotations

import asyncio
from collections import deque
from datetime import datetime
from typing import Any

from governance.models import AuditChangeEntry


class AuditChangeService:
    """In-memory ring buffer (most recent 1000 entries) of change-log entries."""

    MAX_ENTRIES = 1000

    def __init__(self) -> None:
        self._entries: deque[AuditChangeEntry] = deque(maxlen=self.MAX_ENTRIES)
        self._lock = asyncio.Lock()

    async def record_change(self, entry: AuditChangeEntry) -> None:
        async with self._lock:
            self._entries.appendleft(entry)

    async def record(
        self,
        *,
        user: str,
        action: str,
        entity_type: str,
        entity_id: str,
        changes: dict[str, Any] | None = None,
    ) -> None:
        await self.record_change(
            AuditChangeEntry(
                user=user,
                action=action,
                entity_type=entity_type,
                entity_id=entity_id,
                changes=changes or {},
            )
        )

    async def query(
        self,
        *,
        user: str | None = None,
        action: str | None = None,
        entity_type: str | None = None,
        entity_id: str | None = None,
        start: datetime | None = None,
        end: datetime | None = None,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[list[AuditChangeEntry], int]:
        async with self._lock:
            results = list(self._entries)

        if user is not None:
            results = [e for e in results if e.user == user]
        if action is not None:
            results = [e for e in results if e.action == action]
        if entity_type is not None:
            results = [e for e in results if e.entity_type == entity_type]
        if entity_id is not None:
            results = [e for e in results if e.entity_id == entity_id]
        if start is not None:
            results = [e for e in results if e.timestamp >= start]
        if end is not None:
            results = [e for e in results if e.timestamp <= end]

        total = len(results)
        start_idx = max(0, (page - 1) * page_size)
        return results[start_idx : start_idx + page_size], total

    async def list_users(self) -> list[str]:
        async with self._lock:
            return sorted({e.user for e in self._entries if e.user})
