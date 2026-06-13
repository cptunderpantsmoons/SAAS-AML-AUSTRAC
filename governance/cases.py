"""Case management service.

In-memory registry of AML investigation cases.  Production deployments
will swap the registry for a Postgres-backed store; for now the
in-memory dicts are guarded by an ``asyncio.Lock`` to keep the API
safe for concurrent requests.
"""
from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from governance.models import (
    AddCaseNoteRequest,
    AmlCase,
    AuditChangeEntry,
    CaseNote,
    CaseStatus,
    CreateCaseRequest,
    LinkedEvidence,
    StatusChange,
    UpdateCaseRequest,
)


class CaseNotFoundError(Exception):
    """Raised when a case id is not in the registry."""


class CaseService:
    """CRUD service for AML investigation cases."""

    def __init__(self, audit: Any = None) -> None:
        self._cases: dict[UUID, AmlCase] = {}
        self._lock = asyncio.Lock()
        self._audit = audit

    async def list_cases(
        self,
        *,
        status: CaseStatus | None = None,
        priority: str | None = None,
        case_type: str | None = None,
        assigned_to: str | None = None,
        search: str | None = None,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[list[AmlCase], int]:
        async with self._lock:
            results = list(self._cases.values())

        if status is not None:
            results = [c for c in results if c.status == status]
        if priority is not None:
            results = [c for c in results if c.priority.value == priority]
        if case_type is not None:
            results = [c for c in results if c.type.value == case_type]
        if assigned_to is not None:
            results = [c for c in results if c.assigned_to == assigned_to]
        if search:
            needle = search.lower()
            results = [
                c
                for c in results
                if needle in c.case_id.lower()
                or needle in c.title.lower()
                or needle in c.client_name.lower()
                or needle in c.assigned_to.lower()
            ]

        # Newest first
        results.sort(key=lambda c: c.created_at, reverse=True)

        total = len(results)
        start = max(0, (page - 1) * page_size)
        return results[start : start + page_size], total

    async def get_case(self, case_id: UUID) -> AmlCase:
        async with self._lock:
            case = self._cases.get(case_id)
        if case is None:
            raise CaseNotFoundError(f"Case {case_id} not found")
        return case

    async def create_case(
        self, request: CreateCaseRequest, actor: str = "system"
    ) -> AmlCase:
        async with self._lock:
            # Generate human-friendly case id (CASE-YYYY-NNN) based on the
            # current year and the running count.
            year = datetime.now(UTC).year
            prefix = f"CASE-{year}-"
            existing = sum(1 for c in self._cases.values() if c.case_id.startswith(prefix))
            case_id = f"{prefix}{str(existing + 1).zfill(3)}"
            now = datetime.now(UTC)
            case = AmlCase(
                case_id=case_id,
                title=request.title,
                description=request.description,
                type=request.type,
                priority=request.priority,
                status=CaseStatus.OPEN,
                assigned_to=request.assigned_to or "Unassigned",
                client_id=request.client_id,
                client_name=request.client_name,
                linked_alerts=list(request.linked_alerts),
                linked_documents=list(request.linked_documents),
                linked_evidence=[
                    LinkedEvidence(
                        id=alert_id,
                        type="alert",
                        title=f"Linked alert {alert_id}",
                        description=f"Alert {alert_id}",
                        date=now.date().isoformat(),
                    )
                    for alert_id in request.linked_alerts
                ],
                status_timeline=[
                    StatusChange(
                        status=CaseStatus.OPEN,
                        timestamp=now,
                        actor=actor,
                        note="Case created",
                    )
                ],
                created_at=now,
                updated_at=now,
            )
            self._cases[case.id] = case
        await self._record_change(
            actor=actor,
            action="create",
            entity_id=case.case_id,
            changes={"title": case.title, "type": case.type.value, "priority": case.priority.value},
        )
        return case

    async def update_case(
        self, case_id: UUID, request: UpdateCaseRequest, actor: str = "system"
    ) -> AmlCase:
        async with self._lock:
            case = self._cases.get(case_id)
            if case is None:
                raise CaseNotFoundError(f"Case {case_id} not found")
            before: dict[str, Any] = {}
            after: dict[str, Any] = {}
            if request.title is not None and request.title != case.title:
                before["title"] = case.title
                after["title"] = request.title
                case.title = request.title
            if request.description is not None and request.description != case.description:
                before["description"] = case.description
                after["description"] = request.description
                case.description = request.description
            if request.priority is not None and request.priority != case.priority:
                before["priority"] = case.priority.value
                after["priority"] = request.priority.value
                case.priority = request.priority
            if request.assigned_to is not None and request.assigned_to != case.assigned_to:
                before["assigned_to"] = case.assigned_to
                after["assigned_to"] = request.assigned_to
                case.assigned_to = request.assigned_to
            if request.linked_alerts is not None:
                before["linked_alerts"] = list(case.linked_alerts)
                after["linked_alerts"] = list(request.linked_alerts)
                case.linked_alerts = list(request.linked_alerts)
            if request.linked_documents is not None:
                before["linked_documents"] = list(case.linked_documents)
                after["linked_documents"] = list(request.linked_documents)
                case.linked_documents = list(request.linked_documents)
            if request.status is not None and request.status != case.status:
                before["status"] = case.status.value
                after["status"] = request.status.value
                case.status = request.status
                case.status_timeline.append(
                    StatusChange(
                        status=request.status,
                        timestamp=datetime.now(UTC),
                        actor=actor,
                        note=request.note or "",
                    )
                )
                if request.status == CaseStatus.CLOSED:
                    case.closed_at = datetime.now(UTC)
                else:
                    case.closed_at = None
            case.updated_at = datetime.now(UTC)
            self._cases[case_id] = case
        if before or after:
            await self._record_change(
                actor=actor,
                action="update",
                entity_id=case.case_id,
                changes={"before": before, "after": after},
            )
        return case

    async def add_case_note(
        self, case_id: UUID, request: AddCaseNoteRequest
    ) -> AmlCase:
        async with self._lock:
            case = self._cases.get(case_id)
            if case is None:
                raise CaseNotFoundError(f"Case {case_id} not found")
            note = CaseNote(
                author=request.author,
                content=request.content,
            )
            case.notes.append(note)
            case.updated_at = datetime.now(UTC)
            self._cases[case_id] = case
        await self._record_change(
            actor=request.author,
            action="add_note",
            entity_id=case.case_id,
            changes={"note_id": str(note.id)},
        )
        return case

    async def delete_case(self, case_id: UUID, actor: str = "system") -> None:
        async with self._lock:
            case = self._cases.get(case_id)
            if case is None:
                raise CaseNotFoundError(f"Case {case_id} not found")
            self._cases.pop(case_id)
        await self._record_change(
            actor=actor,
            action="delete",
            entity_id=case.case_id,
            changes={},
        )

    async def list_assignees(self) -> list[str]:
        async with self._lock:
            return sorted({c.assigned_to for c in self._cases.values() if c.assigned_to})

    async def _record_change(
        self, *, actor: str, action: str, entity_id: str, changes: dict[str, Any]
    ) -> None:
        if self._audit is None:
            return
        entry = AuditChangeEntry(
            user=actor,
            action=action,
            entity_type="case",
            entity_id=entity_id,
            changes=changes,
        )
        # The audit service is a generic recorder; the actual API
        # endpoint exposes ``/audit-changes`` for read-back.  Audit
        # failures must never break the request, so we suppress any
        # error from the recorder.
        import contextlib

        record = getattr(self._audit, "record_change", None)
        if callable(record):
            with contextlib.suppress(Exception):
                await record(entry)


# Helper used by the governance lifespan to keep the case service warm.
def fresh_case_id() -> UUID:
    return uuid4()
