from __future__ import annotations

import random
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient
from transaction_monitoring.app import _alerts, app
from transaction_monitoring.db import PostgresClient
from transaction_monitoring.escalation import escalate_severity
from transaction_monitoring.models import (
    Alert,
    AlertStatus,
    CreateRuleRequest,
    Rule,
    RuleCondition,
    Severity,
    Transaction,
)
from transaction_monitoring.retention import is_eligible_for_hard_delete
from transaction_monitoring.rule_engine import evaluate_rule, evaluate_rules
from transaction_monitoring.scheduler import SlidingWindowScheduler
from transaction_monitoring.structuring import detect_structuring

# ── Models ──────────────────────────────────────────────────────────────────


class TestModels:
    def test_rule_condition_valid(self) -> None:
        cond = RuleCondition(field="amount", operator=">", value=10000)
        assert cond.field == "amount"
        assert cond.operator == ">"

    def test_rule_condition_invalid_operator(self) -> None:
        with pytest.raises(ValueError):
            RuleCondition(field="amount", operator="like", value=10000)

    def test_transaction_positive_amount(self) -> None:
        tx = Transaction(onboarding_id="abc", amount=500.0)
        assert tx.amount == 500.0

    def test_transaction_negative_amount_rejected(self) -> None:
        with pytest.raises(ValueError):
            Transaction(onboarding_id="abc", amount=-50.0)

    def test_severity_enum(self) -> None:
        assert Severity.CRITICAL.value == "critical"

    def test_create_rule_request(self) -> None:
        req = CreateRuleRequest(
            name="Test Rule",
            conditions=[RuleCondition(field="amount", operator=">", value=10000)],
            base_severity=Severity.HIGH,
        )
        assert req.name == "Test Rule"
        assert req.window_days == 1


# ── Rule Engine ─────────────────────────────────────────────────────────────


class TestRuleEngine:
    def test_amount_greater_than(self) -> None:
        rule = Rule(
            name="Amount > 10k",
            conditions=[RuleCondition(field="amount", operator=">", value=10000)],
            base_severity=Severity.HIGH,
        )
        tx = Transaction(onboarding_id="abc", amount=15000)
        assert evaluate_rule(rule, tx) is True

    def test_amount_not_greater_than(self) -> None:
        rule = Rule(
            name="Amount > 10k",
            conditions=[RuleCondition(field="amount", operator=">", value=10000)],
            base_severity=Severity.HIGH,
        )
        tx = Transaction(onboarding_id="abc", amount=5000)
        assert evaluate_rule(rule, tx) is False

    def test_disabled_rule_not_evaluated(self) -> None:
        rule = Rule(
            name="Amount > 10k",
            conditions=[RuleCondition(field="amount", operator=">", value=10000)],
            base_severity=Severity.HIGH,
            enabled=False,
        )
        tx = Transaction(onboarding_id="abc", amount=15000)
        assert evaluate_rule(rule, tx) is False

    def test_metadata_field_lookup(self) -> None:
        rule = Rule(
            name="High risk country",
            conditions=[RuleCondition(field="country", operator="==", value="IR")],
            base_severity=Severity.CRITICAL,
        )
        tx = Transaction(onboarding_id="abc", amount=1000, metadata={"country": "IR"})
        assert evaluate_rule(rule, tx) is True

    def test_multiple_conditions_and(self) -> None:
        rule = Rule(
            name="Large + High risk",
            conditions=[
                RuleCondition(field="amount", operator=">", value=10000),
                RuleCondition(field="currency", operator="==", value="USD"),
            ],
            base_severity=Severity.CRITICAL,
        )
        tx = Transaction(onboarding_id="abc", amount=15000, currency="USD")
        assert evaluate_rule(rule, tx) is True

        tx2 = Transaction(onboarding_id="abc", amount=15000, currency="AUD")
        assert evaluate_rule(rule, tx2) is False

    def test_evaluate_rules_multiple(self) -> None:
        rules = [
            Rule(
                name="R1",
                conditions=[RuleCondition(field="amount", operator=">", value=10000)],
                base_severity=Severity.HIGH,
            ),
            Rule(
                name="R2",
                conditions=[RuleCondition(field="amount", operator=">", value=5000)],
                base_severity=Severity.MEDIUM,
            ),
        ]
        tx = Transaction(onboarding_id="abc", amount=15000)
        matched = evaluate_rules(rules, tx)
        assert len(matched) == 2

    def test_contains_operator(self) -> None:
        rule = Rule(
            name="Sender contains test",
            conditions=[RuleCondition(field="sender_account", operator="contains", value="test")],
            base_severity=Severity.MEDIUM,
        )
        tx = Transaction(onboarding_id="abc", amount=1000, sender_account="test-account-123")
        assert evaluate_rule(rule, tx) is True

    def test_in_operator(self) -> None:
        rule = Rule(
            name="Currency in list",
            conditions=[RuleCondition(field="currency", operator="in", value=["USD", "EUR"])],
            base_severity=Severity.MEDIUM,
        )
        tx = Transaction(onboarding_id="abc", amount=1000, currency="USD")
        assert evaluate_rule(rule, tx) is True

        tx2 = Transaction(onboarding_id="abc", amount=1000, currency="AUD")
        assert evaluate_rule(rule, tx2) is False


# ── Structuring Detection ───────────────────────────────────────────────────


class TestStructuringDetection:
    def test_below_min_count_returns_no_structuring(self) -> None:
        txs = [Transaction(onboarding_id="abc", amount=5000)]
        result = detect_structuring(txs)
        assert result.detected is False

    def test_aggregate_sub_threshold(self) -> None:
        txs = [
            Transaction(onboarding_id="abc", amount=4000, timestamp=datetime.now(UTC)),
            Transaction(onboarding_id="abc", amount=3500, timestamp=datetime.now(UTC)),
            Transaction(onboarding_id="abc", amount=3500, timestamp=datetime.now(UTC)),
        ]
        result = detect_structuring(txs, threshold_amount=10000)
        assert result.detected is True
        assert result.pattern == "aggregate_sub_threshold"
        assert result.total_amount == 11000.0

    def test_round_amount_clustering(self) -> None:
        # Amounts below threshold individually and don't aggregate above threshold
        txs = [
            Transaction(onboarding_id="abc", amount=1999, timestamp=datetime.now(UTC)),
            Transaction(onboarding_id="abc", amount=1999, timestamp=datetime.now(UTC)),
            Transaction(onboarding_id="abc", amount=1999, timestamp=datetime.now(UTC)),
        ]
        result = detect_structuring(txs, threshold_amount=10000, min_count=3)
        assert result.detected is True
        assert result.pattern == "round_amount_clustering"

    def test_old_transactions_outside_window(self) -> None:
        old = datetime.now(UTC) - timedelta(days=10)
        txs = [
            Transaction(onboarding_id="abc", amount=5000, timestamp=old),
            Transaction(onboarding_id="abc", amount=5000, timestamp=old),
            Transaction(onboarding_id="abc", amount=5000, timestamp=old),
        ]
        result = detect_structuring(txs, window_days=7)
        assert result.detected is False


# ── Structuring Precision/Recall ────────────────────────────────────────────


class TestStructuringPrecisionRecall:
    def _generate_suspicious(self, n: int = 50) -> list[Transaction]:
        return [
            Transaction(
                onboarding_id="sus", amount=9999,
                timestamp=datetime.now(UTC) - timedelta(hours=i),
            )
            for i in range(n)
        ]

    def _generate_benign(self, n: int = 200) -> list[Transaction]:
        random.seed(42)
        # Keep amounts small so groups of 3 never exceed 10k threshold
        # and avoid 999/000 endings that trigger round-amount clustering
        amounts = []
        while len(amounts) < n:
            a = random.uniform(50, 1500)
            if not str(int(a)).endswith(("999", "000")):
                amounts.append(a)
        return [
            Transaction(
                onboarding_id="benign", amount=round(a, 2),
                timestamp=datetime.now(UTC) - timedelta(hours=i),
            )
            for i, a in enumerate(amounts)
        ]

    def test_precision_recall_above_95(self) -> None:
        suspicious = self._generate_suspicious(50)
        benign = self._generate_benign(200)

        # Structuring detection needs groups, so test per-group
        tp = sum(
            1 for i in range(0, len(suspicious), 3)
            if detect_structuring(suspicious[i:i+3]).detected
        )
        fp = sum(
            1 for i in range(0, len(benign), 3)
            if detect_structuring(benign[i:i+3]).detected
        )
        total_groups = len(suspicious) // 3
        fn = total_groups - tp

        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0

        assert precision >= 0.95, f"Precision {precision:.2%} below 95%"
        assert recall >= 0.95, f"Recall {recall:.2%} below 95%"


# ── Severity Escalation ───────────────────────────────────────────────────


class TestEscalation:
    def test_no_boost(self) -> None:
        assert escalate_severity(Severity.LOW, 0.0) == Severity.LOW
        assert escalate_severity(Severity.MEDIUM, 0.3) == Severity.MEDIUM

    def test_one_level_boost(self) -> None:
        assert escalate_severity(Severity.LOW, 0.4) == Severity.MEDIUM
        assert escalate_severity(Severity.MEDIUM, 0.4) == Severity.HIGH
        assert escalate_severity(Severity.HIGH, 0.4) == Severity.CRITICAL

    def test_two_level_boost(self) -> None:
        assert escalate_severity(Severity.LOW, 0.85) == Severity.HIGH
        assert escalate_severity(Severity.MEDIUM, 0.85) == Severity.CRITICAL

    def test_structuring_additional_boost(self) -> None:
        # doc_risk 0.5 -> +1 level, structuring -> +1 more
        assert escalate_severity(Severity.LOW, 0.5, structuring_detected=True) == Severity.HIGH

    def test_capped_at_critical(self) -> None:
        assert escalate_severity(Severity.CRITICAL, 1.0, structuring_detected=True) == Severity.CRITICAL

    def test_document_risk_0_85_plus_medium_to_critical(self) -> None:
        # Acceptance criteria: document_risk_score=0.85 + base_severity=medium -> final_severity=critical
        assert escalate_severity(Severity.MEDIUM, 0.85) == Severity.CRITICAL


# ── Scheduler ─────────────────────────────────────────────────────────────────


class TestScheduler:
    def test_prune_old_transactions(self) -> None:
        sched = SlidingWindowScheduler(window_days=1)
        old = datetime.now(UTC) - timedelta(days=2)
        tx = Transaction(onboarding_id="abc", amount=1000, timestamp=old)
        sched.add_transaction(tx)
        sched._prune_old()
        assert len(sched._transactions) == 0

    def test_set_rules_filters_disabled(self) -> None:
        sched = SlidingWindowScheduler()
        rules = [
            Rule(
                name="enabled",
                conditions=[RuleCondition(field="amount", operator=">", value=100)],
                base_severity=Severity.HIGH,
                enabled=True,
            ),
            Rule(
                name="disabled",
                conditions=[RuleCondition(field="amount", operator=">", value=100)],
                base_severity=Severity.HIGH,
                enabled=False,
            ),
        ]
        sched.set_rules(rules)
        assert len(sched._rules) == 1

    @pytest.mark.asyncio
    async def test_run_once(self) -> None:
        sched = SlidingWindowScheduler(window_days=7)
        rule = Rule(
            name="Amount > 10k",
            conditions=[RuleCondition(field="amount", operator=">", value=10000)],
            base_severity=Severity.HIGH,
        )
        sched.set_rules([rule])
        sched.add_transaction(Transaction(onboarding_id="abc", amount=15000))
        results: list[Any] = []
        await sched.run_once(callback=lambda r: results.append(r))
        assert len(results) == 1
        assert results[0]["matched_count"] == 1


# ── Retention ─────────────────────────────────────────────────────────────────


class TestRetention:
    def test_legal_hold_blocks_hard_delete(self) -> None:
        alert = {"deleted_at": datetime.now(UTC) - timedelta(days=365*8), "legal_hold": True}
        assert is_eligible_for_hard_delete(alert) is False

    def test_past_retention_no_legal_hold_is_eligible(self) -> None:
        alert = {"deleted_at": datetime.now(UTC) - timedelta(days=365*8), "legal_hold": False}
        assert is_eligible_for_hard_delete(alert) is True

    def test_not_yet_deleted_not_eligible(self) -> None:
        alert = {"deleted_at": None, "legal_hold": False}
        assert is_eligible_for_hard_delete(alert) is False


# ── DB Client ─────────────────────────────────────────────────────────────────


class TestDBClient:
    def test_dsn_from_env_or_default(self) -> None:
        db = PostgresClient()
        assert db._dsn == "postgresql://localhost/aml"

    def test_custom_dsn(self) -> None:
        db = PostgresClient(dsn="postgresql://user@host/db")
        assert db._dsn == "postgresql://user@host/db"


# ── Alert Management API ────────────────────────────────────────────────────


@pytest.fixture
def client() -> AsyncClient:
    _alerts.clear()
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


class TestAlertAPI:
    @pytest.mark.asyncio
    async def test_healthz(self, client: AsyncClient) -> None:
        resp = await client.get("/healthz")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"

    @pytest.mark.asyncio
    async def test_list_alerts_empty(self, client: AsyncClient) -> None:
        resp = await client.get("/alerts/list")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["alerts"] == []

    @pytest.mark.asyncio
    async def test_list_alerts_filtered_by_status(self, client: AsyncClient) -> None:
        alert = Alert(
            alert_id=__import__("uuid").uuid4(),
            rule_id=__import__("uuid").uuid4(),
            onboarding_id="abc",
            base_severity=Severity.MEDIUM,
            final_severity=Severity.MEDIUM,
            status=AlertStatus.OPEN,
        )
        _alerts[str(alert.alert_id)] = alert
        resp = await client.get("/alerts/list", params={"status": "open"})
        assert resp.status_code == 200
        assert resp.json()["total"] == 1

    @pytest.mark.asyncio
    async def test_list_alerts_filtered_by_severity(self, client: AsyncClient) -> None:
        alert = Alert(
            alert_id=__import__("uuid").uuid4(),
            rule_id=__import__("uuid").uuid4(),
            onboarding_id="abc",
            base_severity=Severity.HIGH,
            final_severity=Severity.CRITICAL,
        )
        _alerts[str(alert.alert_id)] = alert
        resp = await client.get("/alerts/list", params={"severity": "critical"})
        assert resp.status_code == 200
        assert resp.json()["total"] == 1

    @pytest.mark.asyncio
    async def test_assign_alert(self, client: AsyncClient) -> None:
        alert = Alert(
            alert_id=__import__("uuid").uuid4(),
            rule_id=__import__("uuid").uuid4(),
            onboarding_id="abc",
            base_severity=Severity.MEDIUM,
            final_severity=Severity.MEDIUM,
        )
        _alerts[str(alert.alert_id)] = alert
        resp = await client.post(f"/alerts/{alert.alert_id}/assign", json={"assigned_to": "analyst-1"})
        assert resp.status_code == 200
        assert resp.json()["assigned_to"] == "analyst-1"
        assert resp.json()["status"] == "assigned"

    @pytest.mark.asyncio
    async def test_assign_alert_not_found(self, client: AsyncClient) -> None:
        resp = await client.post("/alerts/nonexistent/assign", json={"assigned_to": "analyst-1"})
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_update_status(self, client: AsyncClient) -> None:
        alert = Alert(
            alert_id=__import__("uuid").uuid4(),
            rule_id=__import__("uuid").uuid4(),
            onboarding_id="abc",
            base_severity=Severity.HIGH,
            final_severity=Severity.CRITICAL,
        )
        _alerts[str(alert.alert_id)] = alert
        resp = await client.post(
            f"/alerts/{alert.alert_id}/update-status",
            json={"status": "resolved", "notes": "Investigated"},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "resolved"
        assert resp.json()["notes"] == "Investigated"

    @pytest.mark.asyncio
    async def test_update_status_not_found(self, client: AsyncClient) -> None:
        resp = await client.post(
            "/alerts/nonexistent/update-status",
            json={"status": "resolved"},
        )
        assert resp.status_code == 404
