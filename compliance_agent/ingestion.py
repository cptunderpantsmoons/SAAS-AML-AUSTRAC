from __future__ import annotations

import logging
import os
import re
import tempfile
import uuid
from pathlib import Path
from typing import Any

import httpx
from agentmail import MessageReceivedEvent

from .mail_client import AgentMailClient
from .models import AgentTask, EmailIngestionResult
from .service_client import ComplianceServiceClient

logger = logging.getLogger(__name__)

_DOCUMENT_EXTENSIONS = frozenset({".pdf", ".docx", ".jpeg", ".jpg", ".png"})

_INSTRUCTION_PATTERNS: list[tuple[str, str]] = [
    (r"screen\s+(?:entity\s+)?(.+?)(?:\n|\.|$)", "screen_entity"),
    (r"generate\s+SMR\s+for\s+report\s+(.+?)(?:\n|\.|$)", "generate_smr"),
    (r"generate\s+(?:an?\s+)?report\s+(.+?)(?:\n|\.|$)", "generate_report"),
    (r"generate\s+(?:an?\s+)?(.+?)\s+report(?:\n|\.|$)", "generate_report"),
]


async def _download_bytes(url: str) -> bytes:
    async with httpx.AsyncClient() as client:
        response = await client.get(url)
        response.raise_for_status()
        return response.content


def _is_document(filename: str | None) -> bool:
    if not filename:
        return False
    return Path(filename).suffix.lower() in _DOCUMENT_EXTENSIONS


def _parse_instructions(body: str | None) -> list[dict[str, Any]]:
    if not body:
        return []
    instructions: list[dict[str, Any]] = []
    for pattern, task_type in _INSTRUCTION_PATTERNS:
        for match in re.finditer(pattern, body, re.IGNORECASE):
            target = match.group(1).strip()
            if target:
                instructions.append({"type": task_type, "target": target})
    return instructions


class IngestionPipeline:
    """Ingest inbound emails: extract attachments, analyse documents, parse NL instructions."""

    def __init__(
        self,
        mail_client: AgentMailClient,
        service_client: ComplianceServiceClient,
    ) -> None:
        self._mail_client = mail_client
        self._service_client = service_client
        self._task_store: dict[str, AgentTask] = {}

    async def _extract_attachment(
        self,
        inbox_id: str,
        message_id: str,
        attachment_id: str,
        filename: str | None,
    ) -> str | None:
        try:
            response = await self._mail_client._client.inboxes.messages.get_attachment(
                inbox_id, message_id, attachment_id
            )
            data = await _download_bytes(response.download_url)
            suffix = Path(filename).suffix if filename else ""
            fd, path = tempfile.mkstemp(suffix=suffix)
            try:
                try:
                    os.write(fd, data)
                finally:
                    os.close(fd)
                return path
            except Exception:
                try:
                    os.remove(path)
                except OSError:
                    logger.exception("Failed to remove temp file after write failure")
                raise
        except Exception:
            logger.exception("Failed to extract attachment %s", attachment_id)
            return None

    async def _analyze_document_file(
        self,
        tmp_path: str,
        filename: str | None,
        content_type: str | None,
    ) -> dict[str, Any] | None:
        try:
            with open(tmp_path, "rb") as f:
                file_bytes = f.read()
            return await self._service_client.analyze_document(
                file_bytes, filename or "document.bin", content_type or "application/octet-stream"
            )
        except Exception:
            logger.exception("Document analysis failed for %s", filename)
            return None

    def _schedule_tasks(self, instructions: list[dict[str, Any]], message_id: str) -> list[AgentTask]:
        tasks: list[AgentTask] = []
        for instruction in instructions:
            task = AgentTask(
                task_id=str(uuid.uuid4()),
                status="pending",
                result={"message_id": message_id, **instruction},
            )
            self._task_store[task.task_id] = task
            tasks.append(task)
            logger.info("Scheduled task %s: %s", task.task_id, instruction)
        return tasks

    async def _process_email(self, event: MessageReceivedEvent) -> EmailIngestionResult:
        message = event.message
        attachments = message.attachments or []
        attachments_count = len(attachments)
        document_analysis_id: str | None = None
        tmp_paths: list[str] = []

        try:
            for attachment in attachments:
                tmp_path = await self._extract_attachment(
                    message.inbox_id,
                    message.message_id,
                    attachment.attachment_id,
                    attachment.filename,
                )
                if tmp_path:
                    tmp_paths.append(tmp_path)
                    if _is_document(attachment.filename):
                        result = await self._analyze_document_file(
                            tmp_path,
                            attachment.filename,
                            attachment.content_type,
                        )
                        if result is not None and document_analysis_id is None:
                            document_analysis_id = result.get("analysis_id")
        finally:
            for path in tmp_paths:
                try:
                    os.remove(path)
                except OSError:
                    logger.exception("Failed to remove temp file %s", path)

        body = message.text or message.extracted_text or message.preview or ""
        instructions = _parse_instructions(body)
        self._schedule_tasks(instructions, message.message_id)

        return EmailIngestionResult(
            message_id=message.message_id,
            attachments_count=attachments_count,
            document_analysis_id=document_analysis_id,
        )
