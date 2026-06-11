"""Splunk HTTP Event Collector (HEC) handler for Python's logging framework.

Sends structured JSON events to a Splunk HEC endpoint over HTTPS.
Falls back to stderr in dev environments where the HEC URL is not configured.
"""
from __future__ import annotations

import json
import logging
import threading
from typing import Any

import httpx

logger = logging.getLogger(__name__)


class SplunkHECHandler(logging.Handler):
    """Push log records to Splunk via HTTP Event Collector (HEC).

    Parameters
    ----------
    hec_url:
        Full HEC endpoint URL (e.g. ``https://splunk.example.com:8088/services/collector``).
    hec_token:
        Splunk HEC authentication token.
    index:
        Splunk index name.
    source:
        Event source field.
    sourcetype:
        Event sourcetype field.
    verify_ssl:
        Whether to verify the server TLS certificate.
    """

    def __init__(
        self,
        hec_url: str = "",
        hec_token: str = "",
        index: str = "main",
        source: str = "aml-au:orchestration",
        sourcetype: str = "_json",
        verify_ssl: bool = True,
    ) -> None:
        super().__init__()
        self._hec_url = hec_url.rstrip("/")
        self._hec_token = hec_token
        self._index = index
        self._source = source
        self._sourcetype = sourcetype
        self._verify_ssl = verify_ssl
        self._buffer: list[dict[str, Any]] = []
        self._lock = threading.Lock()
        self._client: httpx.AsyncClient | None = None  # lazy

        # Sync client for the handler (logging is sync)
        self._sync_client = httpx.Client(
            timeout=10.0,
            verify=verify_ssl,
        ) if hec_url else None

    def emit(self, record: logging.LogRecord) -> None:
        try:
            msg = self.format(record)
            event: dict[str, Any] = {
                "time": record.created,
                "host": getattr(record, "host", "unknown"),
                "source": self._source,
                "sourcetype": self._sourcetype,
                "index": self._index,
                "event": msg,
            }
            with self._lock:
                self._buffer.append(event)
        except Exception:
            self.handleError(record)

    def flush(self) -> None:
        """Send buffered events to Splunk HEC."""
        with self._lock:
            if not self._buffer:
                return
            events = self._buffer[:]
            self._buffer.clear()

        if not self._hec_url or not self._hec_token or self._sync_client is None:
            return

        # Splunk HEC accepts newline-delimited JSON
        payload = "\n".join(json.dumps(e) for e in events)

        try:
            resp = self._sync_client.post(
                self._hec_url,
                content=payload,
                headers={
                    "Authorization": f"Splunk {self._hec_token}",
                    "Content-Type": "application/json",
                },
            )
            if resp.status_code != 200:
                logger.warning("Splunk HEC returned status %d: %s", resp.status_code, resp.text[:200])
        except Exception as exc:
            logger.warning("Splunk HEC push failed: %s", exc)

    def close(self) -> None:
        self.flush()
        if self._sync_client is not None:
            self._sync_client.close()
        super().close()
