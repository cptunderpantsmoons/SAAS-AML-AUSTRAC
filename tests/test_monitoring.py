"""Tests for the monitoring infrastructure: alert dispatcher, CloudWatch & Splunk handlers."""
from __future__ import annotations

import logging
from unittest.mock import patch

import pytest
from orchestration_layer.monitoring.alert_dispatcher import AlertDispatcher, AlertEvent
from orchestration_layer.monitoring.cloudwatch_handler import CloudWatchLogHandler
from orchestration_layer.monitoring.splunk_handler import SplunkHECHandler

# ── AlertDispatcher ─────────────────────────────────────────────────────────


class TestAlertDispatcher:
    """Test alert threshold monitoring and dispatching."""

    def test_no_alert_when_error_rate_below_threshold(self) -> None:
        dispatcher = AlertDispatcher(error_rate_threshold=0.5, window_seconds=60.0)
        # 1 error out of 10 calls = 10% error rate < 50% threshold
        for _ in range(9):
            dispatcher.record_success("veriff", latency_ms=100.0)
        dispatcher.record_failure("veriff", latency_ms=500.0)

        assert dispatcher.get_error_rate("veriff") == 0.1

    def test_alert_fired_when_error_rate_exceeds_threshold(self) -> None:
        dispatcher = AlertDispatcher(error_rate_threshold=0.1, window_seconds=60.0)

        with patch.object(dispatcher, "_dispatch") as mock_dispatch:
            # 3 errors out of 5 calls = 60% > 10% threshold
            for _ in range(2):
                dispatcher.record_success("veriff", latency_ms=100.0)
            for _ in range(3):
                dispatcher.record_failure("veriff", latency_ms=500.0)

            assert mock_dispatch.call_count >= 1
            alert: AlertEvent = mock_dispatch.call_args[0][0]
            assert alert.alert_type == "error_rate"
            assert alert.provider == "veriff"
            assert alert.current_value > 0.1

    def test_alert_fired_when_latency_exceeds_threshold(self) -> None:
        dispatcher = AlertDispatcher(latency_threshold_ms=1000, window_seconds=60.0)

        with patch.object(dispatcher, "_dispatch") as mock_dispatch:
            dispatcher.record_success("veriff", latency_ms=6000.0)

            assert mock_dispatch.call_count == 1
            alert: AlertEvent = mock_dispatch.call_args[0][0]
            assert alert.alert_type == "latency"
            assert alert.current_value == 6000.0

    def test_no_alert_when_latency_below_threshold(self) -> None:
        dispatcher = AlertDispatcher(latency_threshold_ms=5000, window_seconds=60.0)

        with patch.object(dispatcher, "_dispatch") as mock_dispatch:
            dispatcher.record_success("veriff", latency_ms=100.0)
            mock_dispatch.assert_not_called()

    def test_error_rate_requires_minimum_errors(self) -> None:
        """Even if rate is high, need at least 3 errors to trigger."""
        dispatcher = AlertDispatcher(error_rate_threshold=0.01, window_seconds=60.0)

        with patch.object(dispatcher, "_dispatch") as mock_dispatch:
            # Only 1 error — should not fire even though 100% rate
            dispatcher.record_failure("veriff")
            mock_dispatch.assert_not_called()

    def test_error_rate_per_provider_isolation(self) -> None:
        dispatcher = AlertDispatcher(error_rate_threshold=0.5, window_seconds=60.0)

        # veriff is healthy
        for _ in range(10):
            dispatcher.record_success("veriff", latency_ms=100.0)

        # open_sanctions is failing
        for _ in range(3):
            dispatcher.record_failure("open_sanctions", latency_ms=200.0)

        assert dispatcher.get_error_rate("veriff") == 0.0
        assert dispatcher.get_error_rate("open_sanctions") == 1.0

    def test_avg_latency_calculation(self) -> None:
        dispatcher = AlertDispatcher(window_seconds=60.0)
        dispatcher.record_success("veriff", latency_ms=100.0)
        dispatcher.record_success("veriff", latency_ms=300.0)

        assert dispatcher.get_avg_latency_ms("veriff") == pytest.approx(200.0)

    def test_dispatch_logs_at_critical(self, caplog: pytest.LogCaptureFixture) -> None:
        dispatcher = AlertDispatcher(error_rate_threshold=0.01, latency_threshold_ms=1, window_seconds=60.0)
        # Force a latency alert
        dispatcher.record_success("veriff", latency_ms=5000.0)

        assert any(
            record.levelno >= logging.CRITICAL and "ALERT" in record.message
            for record in caplog.records
        )

    def test_gc_prunes_old_entries(self) -> None:
        """Rolling window should drop old entries."""
        dispatcher = AlertDispatcher(window_seconds=0.01)  # 10ms window
        dispatcher.record_success("veriff", latency_ms=100.0)

        import time
        time.sleep(0.02)  # Wait for window to expire

        # New call triggers GC
        dispatcher.record_success("veriff", latency_ms=200.0)
        # After GC, only the new call should remain
        assert len(dispatcher._calls["veriff"]) == 1


# ── CloudWatchLogHandler ────────────────────────────────────────────────────


class TestCloudWatchLogHandler:
    """Test CloudWatch Logs handler."""

    def test_handler_creates_without_boto3(self) -> None:
        """Handler should not crash if boto3 is unavailable."""
        handler = CloudWatchLogHandler(
            log_group="/test/group",
            log_stream="test-stream",
            aws_region="ap-southeast-2",
        )
        assert handler._log_group == "/test/group"
        assert handler._log_stream == "test-stream"

    def test_emit_buffers_records(self) -> None:
        handler = CloudWatchLogHandler(
            log_group="/test/group",
            log_stream="test-stream",
            aws_region="ap-southeast-2",
        )
        record = logging.LogRecord(
            name="test", level=logging.INFO, pathname="", lineno=0,
            msg="hello", args=None, exc_info=None,
        )
        handler.emit(record)
        assert len(handler._buffer) == 1

    def test_flush_clears_buffer_when_no_client(self) -> None:
        handler = CloudWatchLogHandler(
            log_group="/test/group",
            log_stream="test-stream",
            aws_region="ap-southeast-2",
        )
        record = logging.LogRecord(
            name="test", level=logging.INFO, pathname="", lineno=0,
            msg="hello", args=None, exc_info=None,
        )
        handler.emit(record)
        handler.flush()
        assert len(handler._buffer) == 0


# ── SplunkHECHandler ────────────────────────────────────────────────────────


class TestSplunkHECHandler:
    """Test Splunk HEC handler."""

    def test_handler_creates_without_url(self) -> None:
        handler = SplunkHECHandler()
        assert handler._hec_url == ""

    def test_emit_buffers_events(self) -> None:
        handler = SplunkHECHandler(hec_url="https://splunk.test:8088/services/collector", hec_token="test-token")
        record = logging.LogRecord(
            name="test", level=logging.INFO, pathname="", lineno=0,
            msg="hello", args=None, exc_info=None,
        )
        handler.emit(record)
        assert len(handler._buffer) == 1

    def test_flush_noop_when_no_url(self) -> None:
        handler = SplunkHECHandler()
        record = logging.LogRecord(
            name="test", level=logging.INFO, pathname="", lineno=0,
            msg="hello", args=None, exc_info=None,
        )
        handler.emit(record)
        handler.flush()  # Should not raise
