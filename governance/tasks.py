"""Compliance task service.

Tracks the day-to-day compliance workload (KYC reviews, sanctions
re-checks, audit actions, training) and exposes a typed CRUD API
that the frontend ``ComplianceTaskManager`` consumes.
"""
from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from governance.models import (
    AuditChangeEntry,
    ComplianceTask,
    CreateTaskRequest,
    TaskStatus,
    UpdateTaskRequest,
)


class TaskNotFoundError(Exception):
    """Raised when a task id is not in the registry."""


class TaskService:
    def __init__(self, audit: Any = None) -> None:
        self._tasks: dict[UUID, ComplianceTask] = {}
        self._lock = asyncio.Lock()
        self._audit = audit

    async def list_tasks(
        self,
        *,
        status: TaskStatus | None = None,
        priority: str | None = None,
        category: str | None = None,
        assignee: str | None = None,
        include_overdue_only: bool = False,
        page: int = 1,
        page_size: int = 100,
    ) -> tuple[list[ComplianceTask], int]:
        async with self._lock:
            results = list(self._tasks.values())

        if status is not None:
            results = [t for t in results if t.status == status]
        if priority is not None:
            results = [t for t in results if t.priority.value == priority]
        if category is not None:
            results = [t for t in results if t.category.value == category]
        if assignee is not None:
            results = [t for t in results if t.assignee == assignee]
        if include_overdue_only:
            now = datetime.now(UTC)
            results = [
                t for t in results
                if t.status != TaskStatus.COMPLETED and t.due_date < now
            ]

        # Soonest-due first; completed tasks at the bottom.
        results.sort(
            key=lambda t: (
                t.status == TaskStatus.COMPLETED,
                t.due_date,
            )
        )

        total = len(results)
        start = max(0, (page - 1) * page_size)
        return results[start : start + page_size], total

    async def get_task(self, task_id: UUID) -> ComplianceTask:
        async with self._lock:
            task = self._tasks.get(task_id)
        if task is None:
            raise TaskNotFoundError(f"Task {task_id} not found")
        return task

    async def create_task(
        self, request: CreateTaskRequest, actor: str = "system"
    ) -> ComplianceTask:
        now = datetime.now(UTC)
        async with self._lock:
            task = ComplianceTask(
                title=request.title,
                description=request.description,
                priority=request.priority,
                status=TaskStatus.ACTIVE,
                due_date=request.due_date,
                assignee=request.assignee or "Unassigned",
                category=request.category,
                created_at=now,
                updated_at=now,
            )
            self._tasks[task.id] = task
        await self._record_change(
            actor=actor,
            action="create",
            entity_id=str(task.id),
            changes={"title": task.title, "category": task.category.value},
        )
        return task

    async def update_task(
        self, task_id: UUID, request: UpdateTaskRequest, actor: str = "system"
    ) -> ComplianceTask:
        async with self._lock:
            task = self._tasks.get(task_id)
            if task is None:
                raise TaskNotFoundError(f"Task {task_id} not found")
            before: dict[str, Any] = {}
            after: dict[str, Any] = {}
            if request.title is not None and request.title != task.title:
                before["title"] = task.title
                after["title"] = request.title
                task.title = request.title
            if request.description is not None and request.description != task.description:
                before["description"] = task.description
                after["description"] = request.description
                task.description = request.description
            if request.priority is not None and request.priority != task.priority:
                before["priority"] = task.priority.value
                after["priority"] = request.priority.value
                task.priority = request.priority
            if request.assignee is not None and request.assignee != task.assignee:
                before["assignee"] = task.assignee
                after["assignee"] = request.assignee
                task.assignee = request.assignee
            if request.category is not None and request.category != task.category:
                before["category"] = task.category.value
                after["category"] = request.category.value
                task.category = request.category
            if request.due_date is not None and request.due_date != task.due_date:
                before["due_date"] = task.due_date.isoformat()
                after["due_date"] = request.due_date.isoformat()
                task.due_date = request.due_date
            if request.status is not None and request.status != task.status:
                before["status"] = task.status.value
                after["status"] = request.status.value
                task.status = request.status
                task.completed_at = (
                    datetime.now(UTC) if request.status == TaskStatus.COMPLETED else None
                )
            task.updated_at = datetime.now(UTC)
            self._tasks[task_id] = task
        if before or after:
            await self._record_change(
                actor=actor,
                action="update",
                entity_id=str(task_id),
                changes={"before": before, "after": after},
            )
        return task

    async def delete_task(self, task_id: UUID, actor: str = "system") -> None:
        async with self._lock:
            task = self._tasks.get(task_id)
            if task is None:
                raise TaskNotFoundError(f"Task {task_id} not found")
            self._tasks.pop(task_id)
        await self._record_change(
            actor=actor,
            action="delete",
            entity_id=str(task_id),
            changes={},
        )

    async def list_assignees(self) -> list[str]:
        async with self._lock:
            return sorted({t.assignee for t in self._tasks.values() if t.assignee})

    async def _record_change(
        self, *, actor: str, action: str, entity_id: str, changes: dict[str, Any]
    ) -> None:
        if self._audit is None:
            return
        entry = AuditChangeEntry(
            user=actor,
            action=action,
            entity_type="task",
            entity_id=entity_id,
            changes=changes,
        )
        import contextlib

        record = getattr(self._audit, "record_change", None)
        if callable(record):
            with contextlib.suppress(Exception):
                await record(entry)


def fresh_task_id() -> UUID:
    return uuid4()
