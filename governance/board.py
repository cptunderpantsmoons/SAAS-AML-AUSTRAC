from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from governance.models import BoardMetrics, MonthlyReport


class BoardDashboardService:
    """Read-only board governance metrics and digital sign-off workflow."""

    def __init__(self, audit_service: Any = None) -> None:
        self._audit = audit_service

    async def get_metrics(self) -> BoardMetrics:
        return BoardMetrics(
            total_alerts=0,
            open_alerts=0,
            smr_in_progress=0,
            avg_resolution_hours=0.0,
        )

    async def get_monthly_report(self, month: str) -> MonthlyReport:
        return MonthlyReport(
            month=month,
            total_smr=0,
            total_ttr=0,
            total_ifti_e=0,
        )

    async def approve_monthly_report(
        self,
        report_id: str,
        approved_by: str,
    ) -> MonthlyReport:
        report = MonthlyReport(
            month=report_id,
            total_smr=0,
            total_ttr=0,
            total_ifti_e=0,
        )
        report.board_approved = True
        report.board_approved_by = approved_by
        report.board_approved_at = datetime.now(UTC)
        if self._audit is not None:
            await self._audit.log_event(
                "board_approval",
                details={"report_id": report_id, "approved_by": approved_by},
                user_role="board_member",
            )
        return report
