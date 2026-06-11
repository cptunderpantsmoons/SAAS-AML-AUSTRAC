"""CloudWatch Logs handler for Python's logging framework.

Streams structured JSON log records to a CloudWatch Logs log group.
Uses boto3 under the hood; gracefully degrades if boto3 is unavailable
(e.g. in local dev) by falling back to stderr output.
"""
from __future__ import annotations

import logging
import time
from typing import Any

logger = logging.getLogger(__name__)

_CW_MAX_BATCH = 10_000  # AWS PutLogEvents limit per call


def _import_no_credentials_error() -> Any:
    """Lazy-import botocore NoCredentialsError (only when boto3 is present)."""
    from botocore.exceptions import NoCredentialsError
    return NoCredentialsError


class CloudWatchLogHandler(logging.Handler):
    """Push log records to AWS CloudWatch Logs as structured JSON events.

    Parameters
    ----------
    log_group:
        CloudWatch Logs log group name (e.g. ``/aml-au/orchestration``).
    log_stream:
        Log stream name within the group.  Defaults to the process hostname
        + timestamp so each container/pod gets its own stream.
    aws_region:
        AWS region for the CloudWatch Logs client.
    """

    def __init__(
        self,
        log_group: str = "/aml-au/orchestration",
        log_stream: str | None = None,
        aws_region: str = "ap-southeast-2",
    ) -> None:
        super().__init__()
        self._log_group = log_group
        self._aws_region = aws_region

        if log_stream is None:
            import socket

            log_stream = f"{socket.gethostname()}-{int(time.time())}"
        self._log_stream = log_stream

        self._client: Any = None
        self._sequence_token: str | None = None
        self._buffer: list[dict[str, Any]] = []

    # ── Lazy boto3 client ────────────────────────────────────────────────

    def _get_client(self) -> Any:
        if self._client is not None:
            return self._client
        try:
            import boto3

            self._client = boto3.client("logs", region_name=self._aws_region)
            self._ensure_stream()
        except ImportError:
            logger.debug("CloudWatch Logs: boto3 not installed — handler disabled")
            self._client = None
        except Exception as exc:
            # Catches NoCredentialsError and any other init failures
            logger.warning("CloudWatch Logs client init failed: %s — handler disabled", exc)
            self._client = None
        return self._client

    def _ensure_stream(self) -> None:
        """Create the log stream if it doesn't already exist."""
        if self._client is None:
            return
        NoCredentialsError = _import_no_credentials_error()
        try:
            self._client.create_log_stream(
                logGroupName=self._log_group,
                logStreamName=self._log_stream,
            )
        except self._client.exceptions.ResourceAlreadyExistsException:
            pass
        except NoCredentialsError:
            raise  # let _get_client() catch this and disable the handler
        except Exception as exc:
            logger.warning("CloudWatch create_log_stream failed: %s", exc)

    # ── Emit ─────────────────────────────────────────────────────────────

    def emit(self, record: logging.LogRecord) -> None:
        try:
            msg = self.format(record)
            entry: dict[str, Any] = {
                "timestamp": int(record.created * 1000),
                "message": msg,
            }
            self._buffer.append(entry)

            if len(self._buffer) >= _CW_MAX_BATCH:
                self.flush()
        except Exception:
            self.handleError(record)

    def flush(self) -> None:
        """Send buffered log events to CloudWatch Logs."""
        self.acquire()
        try:
            if not self._buffer:
                return
            client = self._get_client()
            if client is None:
                # Dev fallback — just clear the buffer
                self._buffer.clear()
                return

            events = self._buffer[:_CW_MAX_BATCH]
            self._buffer = self._buffer[_CW_MAX_BATCH:]

            kwargs: dict[str, Any] = {
                "logGroupName": self._log_group,
                "logStreamName": self._log_stream,
                "logEvents": events,
            }
            if self._sequence_token:
                kwargs["sequenceToken"] = self._sequence_token

            try:
                resp = client.put_log_events(**kwargs)
                self._sequence_token = resp.get("nextSequenceToken")
            except client.exceptions.InvalidSequenceTokenException as exc:
                # AWS sometimes requires the correct sequence token
                expected = str(exc).split(" ")[:-1]  # last token in the error msg
                if expected:
                    self._sequence_token = expected[-1]
                self._buffer[:0] = events  # re-queue
            except Exception as exc:
                logger.warning("CloudWatch put_log_events failed: %s", exc)
                self._buffer[:0] = events  # re-queue on failure
        finally:
            self.release()

    def close(self) -> None:
        self.flush()
        super().close()
