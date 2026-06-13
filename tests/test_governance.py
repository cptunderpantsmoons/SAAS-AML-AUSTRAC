from datetime import UTC

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


# ── New endpoint coverage (cases, tasks, audit-changes, providers, services, sanctions) ─


def _init_governance_for_tests() -> None:
    """Initialise every governance service in the module-level globals."""
    import governance.app as gov_app
    from governance.audit import AuditTrailService
    from governance.audit_changes import AuditChangeService
    from governance.board import BoardDashboardService
    from governance.cases import CaseService
    from governance.integrations import ProviderService, ServiceHealthService
    from governance.sanctions import SanctionsService
    from governance.signing import ComplianceSigner
    from governance.tasks import TaskService

    gov_app._audit_service = AuditTrailService(":memory:")
    gov_app._audit_change_service = AuditChangeService()
    gov_app._case_service = CaseService(audit=gov_app._audit_change_service)
    gov_app._task_service = TaskService(audit=gov_app._audit_change_service)
    gov_app._provider_service = ProviderService()
    gov_app._service_health_service = ServiceHealthService()
    gov_app._sanctions_service = SanctionsService()
    gov_app._board_service = BoardDashboardService(audit_service=gov_app._audit_service)
    gov_app._signer = ComplianceSigner(fallback_secret="test-secret-for-unit-tests")


async def _cleanup_governance_for_tests() -> None:
    import governance.app as gov_app

    if gov_app._audit_service is not None:
        await gov_app._audit_service.close()
    for attr in (
        "_audit_service",
        "_audit_change_service",
        "_case_service",
        "_task_service",
        "_provider_service",
        "_service_health_service",
        "_sanctions_service",
        "_board_service",
        "_signer",
    ):
        setattr(gov_app, attr, None)


@pytest.fixture
def governance_app(monkeypatch: pytest.MonkeyPatch):
    """Fixture that wires a clean set of governance services for each test."""
    from unittest.mock import MagicMock

    from auth.dependencies import get_session, require_compliance_officer

    _init_governance_for_tests()
    import governance.app as gov_app
    from governance.app import app

    def _mock_session():
        mock = MagicMock()
        mock.get_user_id.return_value = "test-compliance-user"
        return mock

    def _mock_compliance_officer():
        mock = MagicMock()
        mock.get_user_id.return_value = "test-compliance-user"
        return mock

    app.dependency_overrides[get_session] = _mock_session
    app.dependency_overrides[require_compliance_officer] = _mock_compliance_officer
    yield app, gov_app
    app.dependency_overrides = {}
    # Synchronous teardown is fine; the audit service close is async-safe
    # in the test event loop.
    import asyncio

    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            _task = loop.create_task(_cleanup_governance_for_tests())
            del _task
        else:
            loop.run_until_complete(_cleanup_governance_for_tests())
    except RuntimeError:
        asyncio.run(_cleanup_governance_for_tests())


class TestCaseEndpoints:
    @pytest.mark.asyncio
    async def test_create_list_get_update_delete(self, governance_app) -> None:

        from httpx import ASGITransport, AsyncClient

        app, _ = governance_app
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            create_resp = await client.post(
                "/cases",
                json={
                    "title": "Test SAR",
                    "description": "Suspicious structuring",
                    "type": "SAR Investigation",
                    "priority": "high",
                    "client_name": "Acme Corp",
                    "client_id": "co-123",
                    "assigned_to": "alice",
                    "linked_alerts": ["alert-1", "alert-2"],
                },
            )
            assert create_resp.status_code == 200, create_resp.text
            created = create_resp.json()
            case_id = created["id"]
            assert created["case_id"].startswith("CASE-")
            assert created["status"] == "open"
            assert created["client_name"] == "Acme Corp"
            assert created["assigned_to"] == "alice"
            assert len(created["linked_evidence"]) == 2

            list_resp = await client.get("/cases")
            assert list_resp.status_code == 200
            listing = list_resp.json()
            assert listing["pagination"]["total"] == 1
            assert len(listing["assignees"]) == 1
            assert listing["assignees"][0] == "alice"

            get_resp = await client.get(f"/cases/{case_id}")
            assert get_resp.status_code == 200
            assert get_resp.json()["title"] == "Test SAR"

            patch_resp = await client.patch(
                f"/cases/{case_id}",
                json={"status": "in_progress", "priority": "critical", "note": "Escalated"},
            )
            assert patch_resp.status_code == 200
            updated = patch_resp.json()
            assert updated["status"] == "in_progress"
            assert updated["priority"] == "critical"
            assert any(
                change.get("status") == "in_progress"
                for change in updated["status_timeline"]
            )

            note_resp = await client.post(
                f"/cases/{case_id}/notes",
                json={"author": "alice", "content": "Reviewed the transactions"},
            )
            assert note_resp.status_code == 200
            assert len(note_resp.json()["notes"]) == 1

            delete_resp = await client.delete(f"/cases/{case_id}")
            assert delete_resp.status_code == 204

            assert (await client.get(f"/cases/{case_id}")).status_code == 404

    @pytest.mark.asyncio
    async def test_invalid_status_returns_400(self, governance_app) -> None:
        from httpx import ASGITransport, AsyncClient

        app, _ = governance_app
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get("/cases?status=not-a-status")
            assert response.status_code == 400


class TestTaskEndpoints:
    @pytest.mark.asyncio
    async def test_create_list_update_complete_delete(self, governance_app) -> None:
        from datetime import datetime, timedelta

        from httpx import ASGITransport, AsyncClient

        app, _ = governance_app
        due = (datetime.now(UTC) + timedelta(days=2)).isoformat()
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            create = await client.post(
                "/tasks",
                json={
                    "title": "Review KYC docs",
                    "description": "Annual review",
                    "priority": "high",
                    "due_date": due,
                    "category": "KYC Review",
                    "assignee": "bob",
                },
            )
            assert create.status_code == 200, create.text
            task_id = create.json()["id"]
            assert create.json()["status"] == "active"

            overdue_task = await client.post(
                "/tasks",
                json={
                    "title": "Already late",
                    "priority": "critical",
                    "due_date": (datetime.now(UTC) - timedelta(days=1)).isoformat(),
                    "category": "Audit",
                },
            )
            assert overdue_task.status_code == 200
            overdue_id = overdue_task.json()["id"]

            listing = await client.get("/tasks")
            assert listing.status_code == 200
            assert listing.json()["pagination"]["total"] == 2

            overdue_only = await client.get("/tasks?overdue_only=true")
            assert overdue_only.status_code == 200
            assert overdue_only.json()["pagination"]["total"] == 1
            assert overdue_only.json()["tasks"][0]["id"] == overdue_id

            complete = await client.patch(
                f"/tasks/{task_id}",
                json={"status": "completed"},
            )
            assert complete.status_code == 200
            assert complete.json()["status"] == "completed"
            assert complete.json()["completed_at"] is not None

            assert (await client.delete(f"/tasks/{overdue_id}")).status_code == 204
            listing = (await client.get("/tasks")).json()
            assert listing["pagination"]["total"] == 1


class TestAuditChangesEndpoint:
    @pytest.mark.asyncio
    async def test_records_and_queries_changes(self, governance_app) -> None:
        from httpx import ASGITransport, AsyncClient

        app, _gov_app = governance_app
        # Drive the audit recorder by creating a case (which records
        # "create" and "update" entries via the case service).

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            create = await client.post(
                "/cases",
                json={
                    "title": "Audit test",
                    "type": "KYC Discrepancy",
                    "priority": "medium",
                    "client_name": "Client A",
                },
            )
            assert create.status_code == 200
            case_id = create.json()["id"]
            await client.patch(f"/cases/{case_id}", json={"status": "in_progress"})

            response = await client.get("/audit-changes?entity_type=case")
            assert response.status_code == 200
            data = response.json()
            assert data["pagination"]["total"] >= 2
            actions = {e["action"] for e in data["entries"]}
            assert "create" in actions
            assert "update" in actions

            users = data["users"]
            assert "test-compliance-user" in users

            # Recording a custom change is also allowed.
            record = await client.post(
                "/audit-changes",
                json={
                    "user": "bob",
                    "action": "export",
                    "entity_type": "report",
                    "entity_id": "r-1",
                    "changes": {"format": "csv"},
                },
            )
            assert record.status_code == 200

            scoped = await client.get("/audit-changes?entity_type=report")
            assert scoped.json()["pagination"]["total"] >= 1


class TestProvidersAndServices:
    @pytest.mark.asyncio
    async def test_providers_default_and_update(self, governance_app) -> None:
        from httpx import ASGITransport, AsyncClient

        app, _ = governance_app
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            listing = await client.get("/providers")
            assert listing.status_code == 200
            names = {p["name"] for p in listing.json()}
            assert {"Veriff", "OpenSanctions", "Kyckr", "AU10TIX"} <= names

            update = await client.post(
                "/providers",
                json={"name": "Kyckr", "status": "connected", "description": "Re-enabled"},
            )
            assert update.status_code == 200
            assert update.json()["status"] == "connected"

            services = await client.get("/services/status")
            assert services.status_code == 200
            assert any(s["name"] == "API Server" for s in services.json())


class TestSanctions:
    @pytest.mark.asyncio
    async def test_screen_lists_matches_and_updates(self, governance_app) -> None:
        from httpx import ASGITransport, AsyncClient

        app, _ = governance_app
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            sources = await client.get("/sanctions/sources")
            assert sources.status_code == 200
            assert any(s["id"] == "ofac" for s in sources.json())

            screen = await client.post(
                "/sanctions/screen",
                json={"query": "John Smith Holdings", "client_name": "John Smith Holdings"},
            )
            assert screen.status_code == 200
            matches = screen.json()
            assert matches
            top = matches[0]
            assert top["confidence"] > 90
            assert top["match_type"] == "Exact"
            assert top["listed_entity"] == "John Smith Holdings"

            listing = await client.get("/sanctions/matches")
            assert listing.status_code == 200
            assert listing.json()["pagination"]["total"] == len(matches)

            update = await client.patch(
                f"/sanctions/matches/{top['id']}",
                json={"status": "Confirmed Match"},
            )
            assert update.status_code == 200
            assert update.json()["status"] == "Confirmed Match"

            # Non-matching query returns an empty list
            empty = await client.post(
                "/sanctions/screen",
                json={"query": "Completely Unique Name That Does Not Exist"},
            )
            assert empty.status_code == 200
            assert empty.json() == []

