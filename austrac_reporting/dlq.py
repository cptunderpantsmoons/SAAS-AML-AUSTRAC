from __future__ import annotations

import json
import logging
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from austrac_reporting.config import Settings, get_settings
from austrac_reporting.models import DeadLetterEntry

logger = logging.getLogger("austrac_reporting.dlq")


class DLQError(Exception):
    """Raised when DLQ operation fails."""


def exponential_backoff_delay(retry_count: int, base_seconds: float = 5.0) -> float:
    """Calculate backoff delay: base * 2^retry_count, capped at 1 hour."""
    delay: float = base_seconds * (2 ** retry_count)
    return min(delay, 3600.0)


class DeadLetterQueue:
    """SQS-backed dead letter queue for failed AUSTRAC transmissions with exponential backoff."""

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._sqs_client: Any = None
        self._entries: list[DeadLetterEntry] = []

    def _get_sqs(self) -> Any:
        if self._sqs_client is not None:
            return self._sqs_client
        try:
            import boto3
            self._sqs_client = boto3.client("sqs", region_name=self._settings.sqs_region)
        except Exception as exc:
            logger.warning("boto3/SQS unavailable: %s — using in-memory DLQ", exc)
            self._sqs_client = None
        return self._sqs_client

    async def enqueue(
        self,
        message_id: UUID,
        payload: dict[str, Any],
        error_message: str,
        retry_count: int = 0,
    ) -> None:
        entry = DeadLetterEntry(
            message_id=message_id,
            payload=payload,
            error_message=error_message,
            retry_count=retry_count,
            next_retry_at=datetime.now(UTC) + timedelta(seconds=exponential_backoff_delay(retry_count)),
        )
        sqs = self._get_sqs()
        if sqs is not None and self._settings.sqs_dlq_url:
            try:
                sqs.send_message(
                    QueueUrl=self._settings.sqs_dlq_url,
                    MessageBody=json.dumps({
                        "message_id": str(entry.message_id),
                        "payload": entry.payload,
                        "error_message": entry.error_message,
                        "retry_count": entry.retry_count,
                        "next_retry_at": entry.next_retry_at.isoformat() if entry.next_retry_at else None,
                        "created_at": entry.created_at.isoformat(),
                    }, default=str),
                    MessageAttributes={
                        "retry_count": {"DataType": "Number", "StringValue": str(retry_count)},
                        "report_type": {"DataType": "String", "StringValue": payload.get("report_type", "unknown")},
                    },
                )
                logger.info("DLQ message sent to SQS: %s", message_id)
                return
            except Exception as exc:
                logger.error("Failed to send to SQS DLQ (%s) — falling back to in-memory", exc)
        self._entries.append(entry)
        logger.info("DLQ message stored in-memory: %s", message_id)

    async def requeue_for_retry(self, entry: DeadLetterEntry) -> None:
        """Re-queue a DLQ entry after exponential backoff period has elapsed."""
        if entry.next_retry_at and datetime.now(UTC) < entry.next_retry_at:
            delay = (entry.next_retry_at - datetime.now(UTC)).total_seconds()
            logger.debug("Retry not yet due for %s (wait %.0fs)", entry.message_id, delay)
            return
        new_retry = entry.retry_count + 1
        await self.enqueue(
            message_id=entry.message_id,
            payload=entry.payload,
            error_message=entry.error_message,
            retry_count=new_retry,
        )

    def list_entries(self) -> list[DeadLetterEntry]:
        return list(self._entries)

    def clear(self) -> None:
        self._entries.clear()
