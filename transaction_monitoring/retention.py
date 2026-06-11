from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

RETENTION_YEARS = 7


def is_eligible_for_hard_delete(alert: dict[str, Any]) -> bool:
    """Check if an alert can be hard-deleted (past retention AND no legal hold)."""
    deleted_at: datetime | None = alert.get("deleted_at")
    legal_hold: bool = alert.get("legal_hold", False)
    if legal_hold:
        return False
    if deleted_at is None:
        return False
    cutoff = datetime.now(UTC) - timedelta(days=RETENTION_YEARS * 365)
    return bool(deleted_at < cutoff)


def should_soft_delete(alert: dict[str, Any], retention_override_days: int | None = None) -> bool:
    """Determine if an alert should be soft-deleted."""
    if alert.get("legal_hold", False):
        return False
    created_at: datetime | None = alert.get("created_at")
    if created_at is None:
        return False
    retention_days = retention_override_days or (RETENTION_YEARS * 365)
    cutoff = datetime.now(UTC) - timedelta(days=retention_days)
    return bool(created_at < cutoff)
