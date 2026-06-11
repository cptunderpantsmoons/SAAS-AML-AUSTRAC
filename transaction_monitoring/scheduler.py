from __future__ import annotations

import asyncio
import inspect
import logging
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

from transaction_monitoring.models import Rule, Transaction
from transaction_monitoring.rule_engine import evaluate_rules
from transaction_monitoring.structuring import detect_structuring

logger = logging.getLogger("transaction_monitoring.scheduler")


class SlidingWindowScheduler:
    """Periodically re-evaluates transactions in sliding windows."""

    def __init__(self, window_days: int = 7, analysis_interval_seconds: int = 60) -> None:
        self._window_days = window_days
        self._analysis_interval = analysis_interval_seconds
        self._rules: list[Rule] = []
        self._transactions: list[Transaction] = []
        self._running = False
        self._task: asyncio.Task[Any] | None = None

    def set_rules(self, rules: list[Rule]) -> None:
        self._rules = [r for r in rules if r.enabled]

    def add_transaction(self, transaction: Transaction) -> None:
        self._transactions.append(transaction)

    def _prune_old(self) -> None:
        cutoff = datetime.now(UTC) - __import__("datetime").timedelta(days=self._window_days)
        self._transactions = [tx for tx in self._transactions if tx.timestamp >= cutoff]

    async def _run_analysis(self, callback: Callable[[Any], Any] | None = None) -> None:
        self._prune_old()
        for rule in self._rules:
            matched = [tx for tx in self._transactions if evaluate_rules([rule], tx)]
            if matched:
                total = sum(tx.amount for tx in matched)
                struct = detect_structuring(matched, window_days=rule.window_days)
                result = {
                    "rule_id": str(rule.rule_id),
                    "rule_name": rule.name,
                    "matched_count": len(matched),
                    "total_amount": total,
                    "structuring": struct.model_dump(),
                    "timestamp": datetime.now(UTC).isoformat(),
                }
                if callback:
                    if inspect.iscoroutinefunction(callback):
                        await callback(result)
                    else:
                        callback(result)
                else:
                    logger.info("window_analysis %s", result)

    async def start(self, callback: Callable[[Any], Any] | None = None) -> None:
        self._running = True
        while self._running:
            await asyncio.sleep(self._analysis_interval)
            if not self._running:
                break
            await self._run_analysis(callback)

    def stop(self) -> None:
        self._running = False

    async def run_once(self, callback: Callable[[Any], Any] | None = None) -> None:
        await self._run_analysis(callback)
