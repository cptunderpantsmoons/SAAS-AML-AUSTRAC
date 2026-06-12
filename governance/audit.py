from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any
from uuid import UUID

from governance.models import AuditLogEntry

logger = logging.getLogger("governance.audit")


class AuditTrailError(Exception):
    """Raised when audit trail operation fails."""


class AuditTrailService:
    """Immutable SQLite-backed audit trail with append-only enforcement."""

    def __init__(self, db_path: str = ":memory:") -> None:
        self._db_path = db_path
        self._db: Any = None

    async def _ensure_db(self) -> Any:
        if self._db is not None:
            return self._db
        import aiosqlite

        self._db = await aiosqlite.connect(self._db_path)
        await self._db.execute(
            """
            CREATE TABLE IF NOT EXISTS audit_logs (
                audit_id TEXT PRIMARY KEY,
                event_type TEXT NOT NULL,
                payload_hash TEXT NOT NULL DEFAULT '',
                receipt_id TEXT NOT NULL DEFAULT '',
                user_role TEXT NOT NULL DEFAULT 'system',
                details TEXT DEFAULT '{}',
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
            """
        )
        await self._db.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type
            ON audit_logs(event_type)
            """
        )
        await self._db.execute(
            """
            CREATE TRIGGER IF NOT EXISTS audit_log_no_update
            BEFORE UPDATE ON audit_logs
            BEGIN
                SELECT RAISE(ABORT, 'audit_logs is immutable: UPDATE is forbidden');
            END
            """
        )
        await self._db.execute(
            """
            CREATE TRIGGER IF NOT EXISTS audit_log_no_delete
            BEFORE DELETE ON audit_logs
            BEGIN
                SELECT RAISE(ABORT, 'audit_logs is immutable: DELETE is forbidden');
            END
            """
        )
        await self._db.commit()
        return self._db

    async def log_event(
        self,
        event_type: str,
        *,
        payload_hash: str = "",
        receipt_id: str = "",
        user_role: str = "system",
        details: dict[str, Any] | None = None,
    ) -> AuditLogEntry:
        entry = AuditLogEntry(
            event_type=event_type,
            payload_hash=payload_hash,
            receipt_id=receipt_id,
            user_role=user_role,
            details=details or {},
        )
        db = await self._ensure_db()
        await db.execute(
            """
            INSERT INTO audit_logs
                (audit_id, event_type, payload_hash, receipt_id, user_role, details, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(entry.audit_id),
                entry.event_type,
                entry.payload_hash,
                entry.receipt_id,
                entry.user_role,
                json.dumps(entry.details),
                entry.created_at.isoformat(),
            ),
        )
        await db.commit()
        logger.info("AUDIT_LOG event=%s audit_id=%s", event_type, entry.audit_id)
        return entry

    async def query(
        self,
        event_type: str | None = None,
        limit: int = 100,
    ) -> list[AuditLogEntry]:
        db = await self._ensure_db()
        if event_type:
            cursor = await db.execute(
                """
                SELECT audit_id, event_type, payload_hash, receipt_id,
                       user_role, details, created_at
                FROM audit_logs
                WHERE event_type = ?
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (event_type, limit),
            )
        else:
            cursor = await db.execute(
                """
                SELECT audit_id, event_type, payload_hash, receipt_id,
                       user_role, details, created_at
                FROM audit_logs
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (limit,),
            )
        rows = await cursor.fetchall()
        return [
            AuditLogEntry(
                audit_id=UUID(row[0]),
                event_type=row[1],
                payload_hash=row[2] or "",
                receipt_id=row[3] or "",
                user_role=row[4] or "system",
                details=json.loads(row[5] or "{}"),
                created_at=datetime.fromisoformat(row[6]),
            )
            for row in rows
        ]

    async def close(self) -> None:
        if self._db is not None:
            await self._db.close()
            self._db = None
