from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, Field


class AgentTask(BaseModel):
    task_id: str
    status: str = "pending"
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    completed_at: datetime | None = None
    result: dict[str, Any] | None = None


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1)
    session_id: str | None = None


class ChatResponse(BaseModel):
    response: str
    task_ids: list[str] = Field(default_factory=list)


class EmailIngestionResult(BaseModel):
    message_id: str
    attachments_count: int = 0
    document_analysis_id: str | None = None
