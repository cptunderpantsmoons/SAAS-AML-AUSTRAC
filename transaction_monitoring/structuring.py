from __future__ import annotations

from datetime import UTC, datetime, timedelta

from transaction_monitoring.models import StructuringResult, Transaction

DEFAULT_WINDOW_DAYS = 7
DEFAULT_MIN_COUNT = 3
DEFAULT_THRESHOLD_AMOUNT = 10000.0


def detect_structuring(
    transactions: list[Transaction],
    *,
    window_days: int = DEFAULT_WINDOW_DAYS,
    min_count: int = DEFAULT_MIN_COUNT,
    threshold_amount: float = DEFAULT_THRESHOLD_AMOUNT,
) -> StructuringResult:
    """Detect potential structuring (smurfing).

    Structuring pattern: multiple sub-threshold transactions within a window
    that collectively exceed the threshold, or a repeated pattern of breaking
    large amounts into smaller chunks.
    """
    if len(transactions) < min_count:
        return StructuringResult(detected=False)

    now = datetime.now(UTC)
    window_start = now - timedelta(days=window_days)
    recent = [tx for tx in transactions if tx.timestamp >= window_start]

    if len(recent) < min_count:
        return StructuringResult(detected=False)

    # Pattern 1: Multiple sub-threshold txns that sum above threshold
    total = sum(tx.amount for tx in recent)
    if total >= threshold_amount:
        return StructuringResult(
            detected=True,
            pattern="aggregate_sub_threshold",
            transaction_count=len(recent),
            total_amount=round(total, 2),
            window_days=window_days,
            confidence=min(1.0, len(recent) / min_count * 0.5 + 0.5),
        )

    # Pattern 2: Round-amount clustering (e.g. $9,999s)
    round_amount_count = sum(
        1 for tx in recent
        if tx.amount < threshold_amount and str(int(tx.amount)).endswith(("999", "000"))
    )
    if round_amount_count >= min_count:
        total_round = sum(
            tx.amount for tx in recent
            if tx.amount < threshold_amount and str(int(tx.amount)).endswith(("999", "000"))
        )
        return StructuringResult(
            detected=True,
            pattern="round_amount_clustering",
            transaction_count=round_amount_count,
            total_amount=round(total_round, 2),
            window_days=window_days,
            confidence=min(1.0, round_amount_count / min_count * 0.5 + 0.5),
        )

    return StructuringResult(detected=False)
