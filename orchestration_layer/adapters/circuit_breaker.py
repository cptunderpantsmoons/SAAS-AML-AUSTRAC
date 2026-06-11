from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Callable, Coroutine
from enum import StrEnum
from functools import wraps
from typing import TYPE_CHECKING, Any, TypeVar

if TYPE_CHECKING:
    from orchestration_layer.monitoring.alert_dispatcher import AlertDispatcher

logger = logging.getLogger("orchestration_layer.circuit_breaker")

T = TypeVar("T")


class CircuitState(StrEnum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitBreakerOpenError(Exception):
    """Raised when a call is attempted while the circuit is open."""


class CircuitBreaker:
    """Thread-safe (asyncio-safe) circuit breaker with exponential backoff.

    States:
      CLOSED  — calls pass through; failures increment the counter.
      OPEN    — calls are rejected immediately; after *recovery_timeout* the
                circuit transitions to HALF_OPEN.
      HALF_OPEN — a limited number of probe calls are allowed; if they succeed
                  the circuit closes, if they fail it re-opens.
    """

    def __init__(
        self,
        name: str,
        failure_threshold: int = 5,
        recovery_timeout_seconds: int = 30,
        half_open_max_calls: int = 3,
        alert_dispatcher: AlertDispatcher | None = None,
    ) -> None:
        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout_seconds = recovery_timeout_seconds
        self.half_open_max_calls = half_open_max_calls
        self._alert_dispatcher = alert_dispatcher

        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._success_count = 0
        self._half_open_calls = 0
        self._last_failure_time: float = 0.0

    @property
    def state(self) -> CircuitState:
        if self._state == CircuitState.OPEN:
            elapsed = time.monotonic() - self._last_failure_time
            if elapsed >= self.recovery_timeout_seconds:
                self._state = CircuitState.HALF_OPEN
                self._half_open_calls = 0
                logger.info("circuit=%s transitioned to HALF_OPEN", self.name)
        return self._state

    def _on_success(self) -> None:
        if self._state == CircuitState.HALF_OPEN:
            self._half_open_calls += 1
            if self._half_open_calls >= self.half_open_max_calls:
                self._transition_to(CircuitState.CLOSED)
        else:
            self._failure_count = max(0, self._failure_count - 1)

    def _on_failure(self) -> None:
        self._failure_count += 1
        self._last_failure_time = time.monotonic()
        if self._state == CircuitState.HALF_OPEN or self._failure_count >= self.failure_threshold:
            self._transition_to(CircuitState.OPEN)

    def _transition_to(self, new_state: CircuitState) -> None:
        logger.warning(
            "circuit=%s transitioned from %s to %s (failures=%d)",
            self.name,
            self._state.value,
            new_state.value,
            self._failure_count,
        )
        self._state = new_state
        if new_state == CircuitState.CLOSED:
            self._failure_count = 0
            self._success_count = 0
            self._half_open_calls = 0

    async def call(self, fn: Callable[..., Coroutine[Any, Any, T]], *args: Any, **kwargs: Any) -> T:
        current = self.state
        if current == CircuitState.OPEN:
            if self._alert_dispatcher:
                self._alert_dispatcher.record_failure(self.name, latency_ms=0.0)
            raise CircuitBreakerOpenError(f"Circuit '{self.name}' is open")
        start = time.monotonic()
        try:
            result = await fn(*args, **kwargs)
        except Exception:
            latency_ms = (time.monotonic() - start) * 1000
            self._on_failure()
            if self._alert_dispatcher:
                self._alert_dispatcher.record_failure(self.name, latency_ms=latency_ms)
            raise
        latency_ms = (time.monotonic() - start) * 1000
        self._on_success()
        if self._alert_dispatcher:
            self._alert_dispatcher.record_success(self.name, latency_ms=latency_ms)
        return result


async def exponential_backoff[T](
    fn: Callable[..., Coroutine[Any, Any, T]],
    *args: Any,
    max_retries: int = 3,
    base_seconds: float = 1.0,
    max_seconds: float = 60.0,
    **kwargs: Any,
) -> T:
    """Call *fn* with exponential backoff on transient failures.

    Raises the last exception after *max_retries* attempts.
    """
    last_exc: Exception | None = None
    for attempt in range(max_retries + 1):
        try:
            return await fn(*args, **kwargs)
        except CircuitBreakerOpenError:
            raise  # don't retry an open circuit
        except Exception as exc:
            last_exc = exc
            if attempt < max_retries:
                delay = min(base_seconds * (2 ** attempt), max_seconds)
                logger.warning(
                    "backoff attempt=%d/%d delay=%.1fs error=%s",
                    attempt + 1,
                    max_retries,
                    delay,
                    exc,
                )
                await asyncio.sleep(delay)
    raise last_exc  # type: ignore[misc]


def with_circuit_breaker(breaker: CircuitBreaker) -> Callable[..., Any]:
    """Decorator combining circuit-breaker + exponential backoff."""

    def decorator(fn: Callable[..., Coroutine[Any, Any, T]]) -> Callable[..., Coroutine[Any, Any, T]]:
        @wraps(fn)
        async def wrapper(*args: Any, **kwargs: Any) -> T:
            return await breaker.call(fn, *args, **kwargs)
        return wrapper
    return decorator
