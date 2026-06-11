from __future__ import annotations

import time

import pytest
from orchestration_layer.adapters.circuit_breaker import (
    CircuitBreaker,
    CircuitBreakerOpenError,
    CircuitState,
    exponential_backoff,
)


class TestCircuitBreaker:
    def test_starts_closed(self) -> None:
        cb = CircuitBreaker("test")
        assert cb.state == CircuitState.CLOSED

    def test_transitions_to_open_after_threshold(self) -> None:
        cb = CircuitBreaker("test", failure_threshold=3)
        for _ in range(3):
            cb._on_failure()
        assert cb.state == CircuitState.OPEN

    @pytest.mark.asyncio
    async def test_rejects_calls_when_open(self) -> None:
        cb = CircuitBreaker("test", failure_threshold=1, recovery_timeout_seconds=60)
        cb._on_failure()  # trigger open
        with pytest.raises(CircuitBreakerOpenError):
            await cb.call(self._failing_fn)

    def test_transitions_to_half_open_after_recovery(self) -> None:
        cb = CircuitBreaker("test", failure_threshold=1, recovery_timeout_seconds=1)
        cb._on_failure()
        assert cb._state == CircuitState.OPEN  # internal state before property check
        time.sleep(1.1)
        assert cb.state == CircuitState.HALF_OPEN

    def test_half_open_closes_after_successful_probes(self) -> None:
        cb = CircuitBreaker("test", failure_threshold=1, recovery_timeout_seconds=0, half_open_max_calls=2)
        cb._on_failure()
        time.sleep(0.01)
        assert cb.state == CircuitState.HALF_OPEN

        # Successful calls in half-open
        cb._on_success()
        cb._on_success()
        assert cb.state == CircuitState.CLOSED

    def test_half_open_reopens_on_failure(self) -> None:
        cb = CircuitBreaker("test", failure_threshold=1, recovery_timeout_seconds=1)
        cb._on_failure()
        time.sleep(1.1)
        assert cb.state == CircuitState.HALF_OPEN

        cb._on_failure()
        assert cb._state == CircuitState.OPEN

    def test_successful_call_decrements_failures(self) -> None:
        cb = CircuitBreaker("test", failure_threshold=5)
        cb._on_failure()
        cb._on_failure()
        assert cb._failure_count == 2
        cb._on_success()
        assert cb._failure_count == 1

    @staticmethod
    async def _failing_fn() -> None:
        raise RuntimeError("boom")


class TestExponentialBackoff:
    @pytest.mark.asyncio
    async def test_succeeds_on_first_try(self) -> None:
        call_count = 0

        async def ok() -> str:
            nonlocal call_count
            call_count += 1
            return "done"

        result = await exponential_backoff(ok, max_retries=3, base_seconds=0.01)
        assert result == "done"
        assert call_count == 1

    @pytest.mark.asyncio
    async def test_retries_on_failure_then_succeeds(self) -> None:
        call_count = 0

        async def flaky() -> str:
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise ConnectionError("transient")
            return "recovered"

        result = await exponential_backoff(flaky, max_retries=3, base_seconds=0.01)
        assert result == "recovered"
        assert call_count == 3

    @pytest.mark.asyncio
    async def test_raises_after_max_retries(self) -> None:
        async def always_fail() -> str:
            raise ConnectionError("persistent")

        with pytest.raises(ConnectionError, match="persistent"):
            await exponential_backoff(always_fail, max_retries=2, base_seconds=0.01)

    @pytest.mark.asyncio
    async def test_does_not_retry_circuit_open(self) -> None:
        call_count = 0

        async def raises_open() -> str:
            nonlocal call_count
            call_count += 1
            raise CircuitBreakerOpenError("open")

        with pytest.raises(CircuitBreakerOpenError):
            await exponential_backoff(raises_open, max_retries=3, base_seconds=0.01)
        assert call_count == 1  # should not retry


class TestCircuitBreakerWithAsyncCall:
    @pytest.mark.asyncio
    async def test_call_succeeds(self) -> None:
        cb = CircuitBreaker("test")

        async def ok() -> str:
            return "hello"

        result = await cb.call(ok)
        assert result == "hello"

    @pytest.mark.asyncio
    async def test_call_tracks_failure(self) -> None:
        cb = CircuitBreaker("test", failure_threshold=2)

        async def bad() -> str:
            raise RuntimeError("fail")

        with pytest.raises(RuntimeError):
            await cb.call(bad)

        assert cb._failure_count == 1
