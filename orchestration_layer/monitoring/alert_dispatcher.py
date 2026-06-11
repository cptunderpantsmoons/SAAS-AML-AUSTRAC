"""Alert dispatcher for the orchestration layer.

Monitors error rates and latency against configurable thresholds and
dispatches alerts when thresholds are breached.  Alerts are emitted via
the standard Python logging infrastructure so they flow through to
CloudWatch Logs and Splunk HEC handlers automatically.
"""
from __future__ import annotations

import logging
import time
from collections import defaultdict
from dataclasses import dataclass, field

logger = logging.getLogger("orchestration_layer.monitoring.alerts")


@dataclass
class AlertEvent:
    """Structured alert record."""

    alert_type: str  # "error_rate" | "latency"
    provider: str
    current_value: float
    threshold: float
    message: str
    timestamp: float = field(default_factory=time.monotonic)


class AlertDispatcher:
    """Track API call outcomes and fire alerts when thresholds are breached.

    This is *not* a log handler — it is an explicit instrumentation class
    that adapters and the pipeline call into.  When an alert fires it
    logs at ``CRITICAL`` so downstream handlers (CloudWatch / Splunk)
    always capture it.
    """

    def __init__(
        self,
        error_rate_threshold: float = 0.1,
        latency_threshold_ms: int = 5000,
        window_seconds: float = 60.0,
    ) -> None:
        self._error_rate_threshold = error_rate_threshold
        self._latency_threshold_ms = latency_threshold_ms
        self._window_seconds = window_seconds

        # Per-provider rolling windows
        self._calls: dict[str, list[float]] = defaultdict(list)
        self._errors: dict[str, list[float]] = defaultdict(list)
        self._latencies: dict[str, list[tuple[float, float]]] = defaultdict(list)  # (timestamp, latency_ms)

    # ── Public API ──────────────────────────────────────────────────────

    def record_success(self, provider: str, latency_ms: float) -> None:
        """Record a successful API call with its latency."""
        now = time.monotonic()
        self._calls[provider].append(now)
        self._latencies[provider].append((now, latency_ms))
        self._check_latency(provider, latency_ms)
        self._gc(provider)

    def record_failure(self, provider: str, latency_ms: float = 0.0) -> None:
        """Record a failed API call."""
        now = time.monotonic()
        self._calls[provider].append(now)
        self._errors[provider].append(now)
        if latency_ms > 0:
            self._latencies[provider].append((now, latency_ms))
        self._check_error_rate(provider)
        self._gc(provider)

    # ── Threshold checks ────────────────────────────────────────────────

    def _check_error_rate(self, provider: str) -> None:
        total = len(self._calls[provider])
        errors = len(self._errors[provider])
        if total == 0:
            return
        rate = errors / total
        if rate > self._error_rate_threshold and errors >= 3:
            alert = AlertEvent(
                alert_type="error_rate",
                provider=provider,
                current_value=round(rate, 3),
                threshold=self._error_rate_threshold,
                message=(
                    f"Provider '{provider}' error rate {rate:.1%} exceeds "
                    f"threshold {self._error_rate_threshold:.1%} "
                    f"({errors}/{total} errors in last {self._window_seconds:.0f}s)"
                ),
            )
            self._dispatch(alert)

    def _check_latency(self, provider: str, latency_ms: float) -> None:
        if latency_ms > self._latency_threshold_ms:
            alert = AlertEvent(
                alert_type="latency",
                provider=provider,
                current_value=latency_ms,
                threshold=float(self._latency_threshold_ms),
                message=(
                    f"Provider '{provider}' latency {latency_ms:.0f}ms exceeds "
                    f"threshold {self._latency_threshold_ms}ms"
                ),
            )
            self._dispatch(alert)

    # ── Dispatch ─────────────────────────────────────────────────────────

    def _dispatch(self, alert: AlertEvent) -> None:
        """Emit the alert.  Logged at CRITICAL so it always reaches CloudWatch/Splunk."""
        logger.critical(
            "ALERT: %s | type=%s provider=%s current=%.3f threshold=%.3f",
            alert.message,
            alert.alert_type,
            alert.provider,
            alert.current_value,
            alert.threshold,
            extra={
                "alert": True,
                "alert_type": alert.alert_type,
                "provider": alert.provider,
                "current_value": alert.current_value,
                "threshold": alert.threshold,
            },
        )

    # ── Garbage collection ───────────────────────────────────────────────

    def _gc(self, provider: str) -> None:
        """Prune entries older than the rolling window."""
        cutoff = time.monotonic() - self._window_seconds
        self._calls[provider] = [t for t in self._calls[provider] if t > cutoff]
        self._errors[provider] = [t for t in self._errors[provider] if t > cutoff]
        self._latencies[provider] = [(ts, lat) for ts, lat in self._latencies[provider] if ts > cutoff]

    # ── Helpers for testing ─────────────────────────────────────────────

    def get_error_rate(self, provider: str) -> float:
        total = len(self._calls[provider])
        if total == 0:
            return 0.0
        return len(self._errors[provider]) / total

    def get_avg_latency_ms(self, provider: str) -> float:
        lats = self._latencies.get(provider, [])
        if not lats:
            return 0.0
        return sum(lat for _, lat in lats) / len(lats)
