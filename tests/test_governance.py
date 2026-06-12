import pytest
from governance.models import (
    AuditLogEntry,
    BoardMetrics,
    DigitalSignature,
    MonthlyReport,
    UserRole,
)


class TestGovernanceModels:
    def test_audit_log_entry_creation(self) -> None:
        entry = AuditLogEntry(
            event_type="report_transmitted",
            payload_hash="abc123",
            receipt_id="R-001",
            user_role="compliance_officer",
            details={"report_type": "smr"},
        )
        assert entry.payload_hash == "abc123"
        assert entry.receipt_id == "R-001"
        assert entry.user_role == "compliance_officer"

    def test_audit_log_defaults(self) -> None:
        entry = AuditLogEntry(event_type="test")
        assert entry.payload_hash == ""
        assert entry.receipt_id == ""
        assert entry.user_role == "system"
        assert entry.details == {}

    def test_user_role_enum(self) -> None:
        assert UserRole.COMPLIANCE_OFFICER == "compliance_officer"
        assert UserRole.CLIENT_STAFF == "client_staff"
        assert UserRole.BOARD_MEMBER == "board_member"

    def test_board_metrics_defaults(self) -> None:
        m = BoardMetrics()
        assert m.total_alerts == 0
        assert m.risk_appetite_score == 0.0

    def test_digital_signature(self) -> None:
        sig = DigitalSignature(report_id="r1", signed_by="Alice")
        assert sig.report_id == "r1"
        assert sig.signature_b64 == ""

    def test_monthly_report(self) -> None:
        r = MonthlyReport(month="2024-01")
        assert r.month == "2024-01"
        assert r.board_approved is False


class TestAuditTrailService:
    @pytest.mark.asyncio
    async def test_log_and_retrieve(self) -> None:
        from governance.audit import AuditTrailService
        service = AuditTrailService(":memory:")
        entry = await service.log_event(
            "test",
            payload_hash="abc",
            receipt_id="R-1",
            user_role="system",
        )
        assert entry.payload_hash == "abc"
        results = await service.query(event_type="test")
        assert len(results) == 1
        assert results[0].receipt_id == "R-1"
        await service.close()

    @pytest.mark.asyncio
    async def test_insert_rejected_update(self) -> None:
        import os
        import tempfile

        import aiosqlite
        from governance.audit import AuditTrailService

        with tempfile.TemporaryDirectory() as td:
            db_path = os.path.join(td, "audit_test.db")
            service = AuditTrailService(db_path)
            entry = await service.log_event("update_test")
            await service.close()

            async with aiosqlite.connect(db_path) as conn:  # type: ignore[import-untyped]
                with pytest.raises(aiosqlite.IntegrityError):
                    await conn.execute(
                        "UPDATE audit_logs SET event_type = ? WHERE audit_id = ?",
                        ("tampered", str(entry.audit_id)),
                    )
                    await conn.commit()

    @pytest.mark.asyncio
    async def test_insert_rejected_delete(self) -> None:
        import os
        import tempfile

        import aiosqlite
        from governance.audit import AuditTrailService

        with tempfile.TemporaryDirectory() as td:
            db_path = os.path.join(td, "audit_test.db")
            service = AuditTrailService(db_path)
            entry = await service.log_event("delete_test")
            await service.close()

            async with aiosqlite.connect(db_path) as conn:  # type: ignore[import-untyped]
                with pytest.raises(aiosqlite.IntegrityError):
                    await conn.execute(
                        "DELETE FROM audit_logs WHERE audit_id = ?",
                        (str(entry.audit_id),),
                    )
                    await conn.commit()


class TestRLS:
    def test_role_context_sql(self) -> None:
        from governance.rls import RoleContext
        ctx = RoleContext(role="compliance_officer", user_id="u1")
        sql = ctx.set_session_sql()
        assert "SET LOCAL app.current_user_role = 'compliance_officer'" in sql

    def test_build_rls_policy_compliance(self) -> None:
        from governance.rls import build_rls_policy_sql
        sql = build_rls_policy_sql("alerts", "compliance_officer")
        assert "FOR ALL" in sql
        assert "USING (true)" in sql

    def test_build_rls_policy_client_staff(self) -> None:
        from governance.rls import build_rls_policy_sql
        sql = build_rls_policy_sql("alerts", "client_staff")
        assert "smr_status IS NULL" in sql
        assert "FOR SELECT" in sql

    def test_build_rls_policy_board(self) -> None:
        from governance.rls import build_rls_policy_sql
        sql = build_rls_policy_sql("alerts", "board_member")
        assert "FOR SELECT" in sql
        assert "board_member" in sql


class TestComplianceSigner:
    @pytest.mark.asyncio
    async def test_sign_and_verify_with_hmac_fallback(self) -> None:
        from governance.signing import ComplianceSigner
        signer = ComplianceSigner(kms_key_arn="", fallback_secret="test-secret")
        sig = await signer.sign("report-1", b"monthly compliance report", signed_by="Alice")
        assert sig.signature_b64 != ""
        valid = await signer.verify(
            "report-1",
            b"monthly compliance report",
            sig.signature_b64,
        )
        assert valid is True

    @pytest.mark.asyncio
    async def test_verify_tampered_payload_fails(self) -> None:
        from governance.signing import ComplianceSigner
        signer = ComplianceSigner(kms_key_arn="", fallback_secret="test-secret")
        sig = await signer.sign("report-1", b"monthly compliance report")
        valid = await signer.verify("report-1", b"tampered", sig.signature_b64)
        assert valid is False


class TestBoardDashboard:
    @pytest.fixture(autouse=True)
    def _init_governance(self) -> None:
        from unittest.mock import MagicMock

        import governance.app as gov_app
        from auth.dependencies import require_board_member, require_compliance_officer

        def _mock_board_member():
            mock = MagicMock()
            mock.get_user_id.return_value = "test-board-user"
            return mock

        def _mock_compliance_officer():
            mock = MagicMock()
            mock.get_user_id.return_value = "test-compliance-user"
            return mock

        gov_app.app.dependency_overrides[require_board_member] = _mock_board_member
        gov_app.app.dependency_overrides[require_compliance_officer] = _mock_compliance_officer

        yield

        gov_app.app.dependency_overrides = {}

    @pytest.mark.asyncio
    async def test_board_metrics_requires_role(self) -> None:
        import governance.app as gov_app
        from governance.app import app
        from governance.audit import AuditTrailService
        from governance.board import BoardDashboardService
        from governance.signing import ComplianceSigner
        from httpx import ASGITransport, AsyncClient

        # Reset override so auth fails
        gov_app.app.dependency_overrides = {}
        gov_app._audit_service = AuditTrailService(":memory:")
        gov_app._board_service = BoardDashboardService(
            audit_service=gov_app._audit_service
        )
        gov_app._signer = ComplianceSigner(fallback_secret="dev-fallback-secret")

        try:
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                response = await client.get("/board/metrics")
                assert response.status_code == 401
        finally:
            if gov_app._audit_service is not None:
                await gov_app._audit_service.close()
            gov_app._audit_service = None
            gov_app._board_service = None
            gov_app._signer = None

    @pytest.mark.asyncio
    async def test_board_metrics_success(self) -> None:
        import governance.app as gov_app
        from governance.app import app
        from governance.audit import AuditTrailService
        from governance.board import BoardDashboardService
        from governance.signing import ComplianceSigner
        from httpx import ASGITransport, AsyncClient

        gov_app._audit_service = AuditTrailService(":memory:")
        gov_app._board_service = BoardDashboardService(
            audit_service=gov_app._audit_service
        )
        gov_app._signer = ComplianceSigner(fallback_secret="dev-fallback-secret")

        try:
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                response = await client.get(
                    "/board/metrics",
                )
                assert response.status_code == 200
                data = response.json()
                assert "total_alerts" in data
        finally:
            if gov_app._audit_service is not None:
                await gov_app._audit_service.close()
            gov_app._audit_service = None
            gov_app._board_service = None
            gov_app._signer = None

    @pytest.mark.asyncio
    async def test_board_monthly_report(self) -> None:
        import governance.app as gov_app
        from governance.app import app
        from governance.audit import AuditTrailService
        from governance.board import BoardDashboardService
        from governance.signing import ComplianceSigner
        from httpx import ASGITransport, AsyncClient

        gov_app._audit_service = AuditTrailService(":memory:")
        gov_app._board_service = BoardDashboardService(
            audit_service=gov_app._audit_service
        )
        gov_app._signer = ComplianceSigner(fallback_secret="dev-fallback-secret")

        try:
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                response = await client.get(
                    "/board/monthly-report/2024-01",
                )
                assert response.status_code == 200
                data = response.json()
                assert data["month"] == "2024-01"
        finally:
            if gov_app._audit_service is not None:
                await gov_app._audit_service.close()
            gov_app._audit_service = None
            gov_app._board_service = None
            gov_app._signer = None

    @pytest.mark.asyncio
    async def test_sign_report_requires_compliance_role(self) -> None:
        import governance.app as gov_app
        from auth.dependencies import require_compliance_officer
        from governance.app import app
        from governance.audit import AuditTrailService
        from governance.signing import ComplianceSigner
        from httpx import ASGITransport, AsyncClient

        gov_app._audit_service = AuditTrailService(":memory:")
        gov_app._signer = ComplianceSigner(fallback_secret="dev-fallback-secret")

        # Remove compliance officer override so auth fails
        if require_compliance_officer in gov_app.app.dependency_overrides:
            del gov_app.app.dependency_overrides[require_compliance_officer]

        try:
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                response = await client.post(
                    "/reports/r1/sign",
                    params={"payload": "test", "signed_by": "Alice"},
                )
                assert response.status_code == 401
        finally:
            if gov_app._audit_service is not None:
                await gov_app._audit_service.close()
            gov_app._audit_service = None
            gov_app._signer = None

    @pytest.mark.asyncio
    async def test_sign_report_success(self) -> None:
        import governance.app as gov_app
        from governance.app import app
        from governance.audit import AuditTrailService
        from governance.signing import ComplianceSigner
        from httpx import ASGITransport, AsyncClient

        gov_app._audit_service = AuditTrailService(":memory:")
        gov_app._signer = ComplianceSigner(fallback_secret="dev-fallback-secret")

        try:
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                response = await client.post(
                    "/reports/r1/sign",
                    params={"payload": "test payload", "signed_by": "Alice"},
                )
                assert response.status_code == 200
                data = response.json()
                assert "signature_b64" in data
        finally:
            if gov_app._audit_service is not None:
                await gov_app._audit_service.close()
            gov_app._audit_service = None
            gov_app._signer = None
