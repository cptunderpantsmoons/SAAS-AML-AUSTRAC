from __future__ import annotations

import pytest
from ubo_graph.app import create_app
from ubo_graph.audit import UBOAuditLogger
from ubo_graph.cache import InMemoryCache, RedisCache
from ubo_graph.db_client import InMemoryGraphStore, Neo4jClient
from ubo_graph.graph_schema import (
    CLEANUP_ALL_CYPHER,
    CREATE_EDGE_CYPHER,
    CREATE_NODE_CYPHER,
    DIRECT_SHAREHOLDERS_CYPHER,
    ENTITY_EXISTS_CYPHER,
    SCHEMA_CONSTRAINTS,
    TRUSTEE_DEEMED_OWNERSHIP_CYPHER,
    UBO_PATHS_CYPHER,
    format_create_edge_cypher,
    format_create_node_cypher,
    format_ubo_paths_cypher,
)
from ubo_graph.models import (
    EdgeType,
    GraphEdge,
    GraphNode,
    NodeType,
    OwnershipThreshold,
    UBOCalculationStatus,
)
from ubo_graph.reconciliation import ReconciliationService
from ubo_graph.seed_data import (
    seed_all,
    seed_controls_relationship,
    seed_cross_held_companies,
    seed_deep_nested_structure,
    seed_multi_layered_trust,
    seed_simple_company,
)
from ubo_graph.ubo_service import UBOService, _classify_threshold

# ── Fixtures ────────────────────────────────────────────────────────────────


@pytest.fixture
def db() -> InMemoryGraphStore:
    return InMemoryGraphStore()


@pytest.fixture
def neo4j_client() -> Neo4jClient:
    """Neo4j client that will use in-memory fallback."""
    client = Neo4jClient()
    # Don't call connect — we use the fallback store directly
    return client


@pytest.fixture
def ubo_service(neo4j_client: Neo4jClient) -> UBOService:
    return UBOService(db_client=neo4j_client, threshold_percentage=25.0)


@pytest.fixture
def audit_logger() -> UBOAuditLogger:
    return UBOAuditLogger()


@pytest.fixture
def reconciliation() -> ReconciliationService:
    return ReconciliationService()


# ── Threshold Classification ────────────────────────────────────────────────


class TestThresholdClassification:
    """Validate 25% beneficial ownership threshold logic."""

    def test_above_threshold(self) -> None:
        assert _classify_threshold(30.0, 25.0) == OwnershipThreshold.ABOVE_THRESHOLD

    def test_at_threshold(self) -> None:
        assert _classify_threshold(25.0, 25.0) == OwnershipThreshold.AT_THRESHOLD

    def test_below_threshold(self) -> None:
        assert _classify_threshold(20.0, 25.0) == OwnershipThreshold.BELOW_THRESHOLD

    def test_zero_ownership_below_threshold(self) -> None:
        assert _classify_threshold(0.0, 25.0) == OwnershipThreshold.BELOW_THRESHOLD

    def test_exactly_at_threshold_with_floating_point(self) -> None:
        # 25.0 - 0.01 < 0.01 tolerance check
        assert _classify_threshold(25.0, 25.0) == OwnershipThreshold.AT_THRESHOLD

    def test_custom_threshold(self) -> None:
        assert _classify_threshold(15.0, 10.0) == OwnershipThreshold.ABOVE_THRESHOLD
        assert _classify_threshold(5.0, 10.0) == OwnershipThreshold.BELOW_THRESHOLD


# ── In-Memory Graph Store ──────────────────────────────────────────────────


class TestInMemoryGraphStore:
    def test_add_and_retrieve_node(self, db: InMemoryGraphStore) -> None:
        node = GraphNode(node_id="p-1", node_type=NodeType.PERSON, name="Alice")
        db.add_node(node)
        assert db.get_node("p-1") is not None
        assert db.get_node("p-1").name == "Alice"  # type: ignore[union-attr]

    def test_entity_exists_returns_info(self, db: InMemoryGraphStore) -> None:
        db.add_node(GraphNode(node_id="co-1", node_type=NodeType.COMPANY, name="TestCo"))
        result = db.entity_exists("co-1")
        assert result is not None
        assert result["node_type"] == "Company"
        assert result["name"] == "TestCo"

    def test_entity_not_found(self, db: InMemoryGraphStore) -> None:
        assert db.entity_exists("nonexistent") is None

    def test_add_edge_and_query_shareholders(self, db: InMemoryGraphStore) -> None:
        db.add_node(GraphNode(node_id="co-1", node_type=NodeType.COMPANY, name="TestCo"))
        db.add_node(GraphNode(node_id="p-1", node_type=NodeType.PERSON, name="Alice"))
        db.add_edge(GraphEdge(
            edge_id="e-1", source_id="p-1", target_id="co-1",
            edge_type=EdgeType.OWNS_SHARES, ownership_percentage=60.0,
        ))
        shareholders = db.direct_shareholders("co-1")
        assert len(shareholders) == 1
        assert shareholders[0]["node_id"] == "p-1"
        assert shareholders[0]["ownership_percentage"] == 60.0

    def test_clear_resets_store(self, db: InMemoryGraphStore) -> None:
        db.add_node(GraphNode(node_id="p-1", node_type=NodeType.PERSON, name="Alice"))
        assert db.node_count == 1
        db.clear()
        assert db.node_count == 0
        assert db.edge_count == 0


# ── UBO Calculation: Simple Company ─────────────────────────────────────────


class TestUBOSimpleCompany:
    """Two direct shareholders: Alice (60%) and Bob (40%)."""

    def test_both_above_25_percent_threshold(self, neo4j_client: Neo4jClient, ubo_service: UBOService) -> None:
        ids = seed_simple_company(neo4j_client)
        result = ubo_service.calculate(entity_id=ids["company_id"])

        assert result.status == UBOCalculationStatus.COMPLETED
        assert len(result.beneficial_owners) == 2

        alice = next(bo for bo in result.beneficial_owners if bo.person_id == ids["alice_id"])
        bob = next(bo for bo in result.beneficial_owners if bo.person_id == ids["bob_id"])

        assert alice.effective_ownership_percentage == 60.0
        assert alice.threshold_status == OwnershipThreshold.ABOVE_THRESHOLD

        assert bob.effective_ownership_percentage == 40.0
        assert bob.threshold_status == OwnershipThreshold.ABOVE_THRESHOLD

    def test_total_ownership_accounted(self, neo4j_client: Neo4jClient, ubo_service: UBOService) -> None:
        ids = seed_simple_company(neo4j_client)
        result = ubo_service.calculate(entity_id=ids["company_id"])
        assert result.total_ownership_accounted == 100.0

    def test_confidence_score_is_1_for_direct_ownership(
        self, neo4j_client: Neo4jClient, ubo_service: UBOService,
    ) -> None:
        ids = seed_simple_company(neo4j_client)
        result = ubo_service.calculate(entity_id=ids["company_id"])
        assert result.confidence_score == 1.0

    def test_ownership_paths_included(self, neo4j_client: Neo4jClient, ubo_service: UBOService) -> None:
        ids = seed_simple_company(neo4j_client)
        result = ubo_service.calculate(entity_id=ids["company_id"])
        alice = next(bo for bo in result.beneficial_owners if bo.person_id == ids["alice_id"])
        assert len(alice.ownership_paths) == 1
        assert alice.ownership_paths[0].depth == 1


# ── UBO Calculation: Multi-Layered Trust ────────────────────────────────────


class TestUBOMultiLayeredTrust:
    """Trust → Company → Subsidiary with trustee deemed ownership."""

    def test_trustee_deemed_ownership(self, neo4j_client: Neo4jClient, ubo_service: UBOService) -> None:
        ids = seed_multi_layered_trust(neo4j_client)
        result = ubo_service.calculate(entity_id=ids["target_id"])

        assert result.status == UBOCalculationStatus.COMPLETED

        # Carol's effective ownership via trust: 70% * 100% = 70%
        carol = next((bo for bo in result.beneficial_owners if bo.person_id == ids["carol_id"]), None)
        assert carol is not None, "Carol should be found as a beneficial owner"
        # Effective through graph traversal: 100% (HoldingCo→TargetCo) * 70% (Trust→HoldingCo) but
        # Carol is trustee, so she gets deemed ownership from trustee_deemed_ownership
        # The graph path: Carol -IS_TRUSTEE_OF-> Trust
        # -OWNS_SHARES(70%)-> HoldingCo -OWNS_SHARES(100%)-> TargetCo
        # Effective = 100.0 * 70.0 / 100 = 70.0 (since path goes Carol→Trust→HoldingCo→TargetCo)
        assert carol.effective_ownership_percentage >= 70.0
        assert carol.threshold_status == OwnershipThreshold.ABOVE_THRESHOLD

    def test_dave_direct_ownership_through_company(self, neo4j_client: Neo4jClient, ubo_service: UBOService) -> None:
        ids = seed_multi_layered_trust(neo4j_client)
        result = ubo_service.calculate(entity_id=ids["target_id"])

        dave = next((bo for bo in result.beneficial_owners if bo.person_id == ids["dave_id"]), None)
        assert dave is not None
        # Dave → HoldingCo (30%) → TargetCo (100%) = 30.0%
        assert dave.effective_ownership_percentage >= 30.0
        assert dave.threshold_status == OwnershipThreshold.ABOVE_THRESHOLD

    def test_max_depth_traversed(self, neo4j_client: Neo4jClient, ubo_service: UBOService) -> None:
        ids = seed_multi_layered_trust(neo4j_client)
        result = ubo_service.calculate(entity_id=ids["target_id"])
        assert result.max_depth_traversed >= 2


# ── UBO Calculation: Cross-Held Companies ──────────────────────────────────


class TestUBOCrossHeldCompanies:
    """Two companies with cross-shareholdings."""

    def test_eve_ownership_of_beta(self, neo4j_client: Neo4jClient, ubo_service: UBOService) -> None:
        ids = seed_cross_held_companies(neo4j_client)
        result = ubo_service.calculate(entity_id=ids["beta_id"])

        eve = next((bo for bo in result.beneficial_owners if bo.person_id == ids["eve_id"]), None)
        assert eve is not None
        # Eve → AlphaCo (80%) → BetaCo (40%) = 32%
        assert eve.effective_ownership_percentage >= 32.0
        assert eve.threshold_status == OwnershipThreshold.ABOVE_THRESHOLD

    def test_frank_ownership_of_alpha(self, neo4j_client: Neo4jClient, ubo_service: UBOService) -> None:
        ids = seed_cross_held_companies(neo4j_client)
        result = ubo_service.calculate(entity_id=ids["alpha_id"])

        frank = next((bo for bo in result.beneficial_owners if bo.person_id == ids["frank_id"]), None)
        assert frank is not None
        # Frank → BetaCo (70%) → AlphaCo (30%) = 21%
        assert frank.effective_ownership_percentage >= 20.0
        # 21% is BELOW the 25% threshold
        assert frank.threshold_status == OwnershipThreshold.BELOW_THRESHOLD


# ── UBO Calculation: Deep Nested Structure ──────────────────────────────────


class TestUBODeepNested:
    """5-level deep ownership chain — tests sub-threshold detection."""

    def test_grace_ownership_below_25_percent(self, neo4j_client: Neo4jClient, ubo_service: UBOService) -> None:
        ids = seed_deep_nested_structure(neo4j_client)
        result = ubo_service.calculate(entity_id=ids["target_id"])

        grace = next((bo for bo in result.beneficial_owners if bo.person_id == ids["grace_id"]), None)
        assert grace is not None
        # 100% * 60% * 70% * 80% * 50% = 16.8%
        assert 16.0 <= grace.effective_ownership_percentage <= 17.0
        assert grace.threshold_status == OwnershipThreshold.BELOW_THRESHOLD

    def test_max_depth_5_traversed(self, neo4j_client: Neo4jClient, ubo_service: UBOService) -> None:
        ids = seed_deep_nested_structure(neo4j_client)
        result = ubo_service.calculate(entity_id=ids["target_id"])
        assert result.max_depth_traversed == 5

    def test_confidence_decreases_with_depth(self, neo4j_client: Neo4jClient, ubo_service: UBOService) -> None:
        ids = seed_deep_nested_structure(neo4j_client)
        result = ubo_service.calculate(entity_id=ids["target_id"])
        # depth=5 → confidence = 1.0 - (5 * 0.05) = 0.75
        assert result.confidence_score < 1.0


# ── UBO Calculation: CONTROLS Relationship ──────────────────────────────────


class TestUBOControlsRelationship:
    """CONTROLS edge (non-shareholding control)."""

    def test_hank_controls_entity(self, neo4j_client: Neo4jClient, ubo_service: UBOService) -> None:
        ids = seed_controls_relationship(neo4j_client)
        result = ubo_service.calculate(entity_id=ids["target_id"])

        hank = next((bo for bo in result.beneficial_owners if bo.person_id == ids["hank_id"]), None)
        assert hank is not None
        # Hank CONTROLS IndirectCo (90%) → IndirectCo OWNS_SHARES (90%) TargetCo
        # Effective = 90.0 * 90.0 / 100 = 81.0%
        assert hank.effective_ownership_percentage >= 80.0
        assert hank.threshold_status == OwnershipThreshold.ABOVE_THRESHOLD

    def test_ivy_direct_small_shareholder(self, neo4j_client: Neo4jClient, ubo_service: UBOService) -> None:
        ids = seed_controls_relationship(neo4j_client)
        result = ubo_service.calculate(entity_id=ids["target_id"])

        ivy = next((bo for bo in result.beneficial_owners if bo.person_id == ids["ivy_id"]), None)
        assert ivy is not None
        assert ivy.effective_ownership_percentage == 10.0
        assert ivy.threshold_status == OwnershipThreshold.BELOW_THRESHOLD


# ── UBO Calculation: Entity Not Found ──────────────────────────────────────


class TestUBOEntityNotFound:
    def test_nonexistent_entity_returns_failed(self, ubo_service: UBOService) -> None:
        result = ubo_service.calculate(entity_id="nonexistent-id")
        assert result.status == UBOCalculationStatus.FAILED
        assert "not found" in (result.error_message or "").lower()


# ── UBO Calculation: Without Paths ─────────────────────────────────────────


class TestUBOWithoutPaths:
    def test_calculate_without_paths(self, neo4j_client: Neo4jClient, ubo_service: UBOService) -> None:
        ids = seed_simple_company(neo4j_client)
        result = ubo_service.calculate(entity_id=ids["company_id"], include_paths=False)
        assert result.status == UBOCalculationStatus.COMPLETED
        for bo in result.beneficial_owners:
            assert len(bo.ownership_paths) == 0


# ── In-Memory Cache ────────────────────────────────────────────────────────


class TestInMemoryCache:
    def test_set_and_get(self) -> None:
        cache = InMemoryCache()
        cache.set("key1", {"data": "value"}, ttl_seconds=60)
        result = cache.get("key1")
        assert result is not None
        assert result["data"] == "value"

    def test_miss_returns_none(self) -> None:
        cache = InMemoryCache()
        assert cache.get("nonexistent") is None

    def test_delete_key(self) -> None:
        cache = InMemoryCache()
        cache.set("key1", {"data": "value"}, ttl_seconds=60)
        cache.delete("key1")
        assert cache.get("key1") is None

    def test_clear_resets(self) -> None:
        cache = InMemoryCache()
        cache.set("key1", {"data": "value"}, ttl_seconds=60)
        cache.clear()
        assert cache.size == 0

    def test_hit_rate_tracking(self) -> None:
        cache = InMemoryCache()
        cache.set("key1", {"data": "value"}, ttl_seconds=60)
        cache.get("key1")  # hit
        cache.get("nonexistent")  # miss
        assert cache.hit_rate == 0.5

    def test_ttl_expiration(self) -> None:
        import time

        cache = InMemoryCache()
        cache.set("key1", {"data": "value"}, ttl_seconds=1)
        time.sleep(1.1)
        assert cache.get("key1") is None


# ── Reconciliation Service ─────────────────────────────────────────────────


class TestReconciliationService:
    def test_matching_data_no_discrepancy(self, neo4j_client: Neo4jClient, ubo_service: UBOService) -> None:
        ids = seed_simple_company(neo4j_client)
        result = ubo_service.calculate(entity_id=ids["company_id"])

        recon = ReconciliationService()
        kyb_data = [
            {"person_id": ids["alice_id"], "name": "Alice Smith", "ownership_percentage": 60.0},
            {"person_id": ids["bob_id"], "name": "Bob Jones", "ownership_percentage": 40.0},
        ]

        recon_result = recon.reconcile(result, kyb_data, kyb_provider="kyckr")
        assert len(recon_result.reconciled_ubos) == 2
        for ru in recon_result.reconciled_ubos:
            assert ru.discrepancy_percentage is not None
            assert ru.discrepancy_percentage <= 5.0
            assert ru.confidence == 1.0

    def test_discrepancy_flagged(self, neo4j_client: Neo4jClient, ubo_service: UBOService) -> None:
        ids = seed_simple_company(neo4j_client)
        result = ubo_service.calculate(entity_id=ids["company_id"])

        recon = ReconciliationService(discrepancy_threshold=5.0)
        # KYB says Alice owns 40% instead of 60% — big discrepancy
        kyb_data = [
            {"person_id": ids["alice_id"], "name": "Alice Smith", "ownership_percentage": 40.0},
        ]

        recon_result = recon.reconcile(result, kyb_data, kyb_provider="kyckr")
        alice = next(ru for ru in recon_result.reconciled_ubos if ru.person_id == ids["alice_id"])
        assert alice.discrepancy_percentage is not None
        assert alice.discrepancy_percentage > 5.0
        assert alice.confidence == 0.5
        assert "Discrepancy" in alice.reconciliation_note

    def test_graph_only_entry(self, neo4j_client: Neo4jClient, ubo_service: UBOService) -> None:
        ids = seed_simple_company(neo4j_client)
        result = ubo_service.calculate(entity_id=ids["company_id"])

        recon = ReconciliationService()
        recon_result = recon.reconcile(result, [], kyb_provider="kyckr")
        for ru in recon_result.reconciled_ubos:
            assert "graph only" in ru.reconciliation_note.lower()

    def test_result_hash_included(self, neo4j_client: Neo4jClient, ubo_service: UBOService) -> None:
        ids = seed_simple_company(neo4j_client)
        result = ubo_service.calculate(entity_id=ids["company_id"])

        recon = ReconciliationService()
        recon_result = recon.reconcile(result, [], kyb_provider="kyckr")
        assert len(recon_result.graph_result_hash) > 0


# ── Audit Logger ────────────────────────────────────────────────────────────


class TestUBOAuditLogger:
    def test_log_entry_stored(self, audit_logger: UBOAuditLogger) -> None:
        from ubo_graph.models import UBOAuditEntry

        entry = UBOAuditEntry(entity_id="test-1", result_hash="abc123", beneficial_owner_count=2)
        audit_logger.log(entry)
        assert audit_logger.entry_count == 1

    def test_get_entries_by_entity(self, audit_logger: UBOAuditLogger) -> None:
        from ubo_graph.models import UBOAuditEntry

        audit_logger.log(UBOAuditEntry(entity_id="test-1", result_hash="hash1"))
        audit_logger.log(UBOAuditEntry(entity_id="test-2", result_hash="hash2"))
        audit_logger.log(UBOAuditEntry(entity_id="test-1", result_hash="hash3"))

        entries = audit_logger.get_entries(entity_id="test-1")
        assert len(entries) == 2

    def test_get_entry_by_audit_id(self, audit_logger: UBOAuditLogger) -> None:
        from ubo_graph.models import UBOAuditEntry

        entry = UBOAuditEntry(entity_id="test-1", result_hash="abc123")
        audit_logger.log(entry)
        found = audit_logger.get_entry_by_audit_id(entry.audit_id)
        assert found is not None
        assert found.entity_id == "test-1"

    def test_audit_entry_from_ubo_calculation(self, neo4j_client: Neo4jClient, ubo_service: UBOService) -> None:
        ids = seed_simple_company(neo4j_client)
        result = ubo_service.calculate(entity_id=ids["company_id"])

        audit = UBOAuditLogger()
        entry = ubo_service.create_audit_entry(
            result,
            query_params={"entity_id": ids["company_id"], "max_depth": 5},
        )
        audit.log(entry)

        assert entry.entity_id == ids["company_id"]
        assert entry.beneficial_owner_count == 2
        assert entry.max_depth_traversed >= 1
        assert len(entry.result_hash) > 0
        assert entry.threshold_percentage == 25.0

    def test_audit_max_entries_eviction(self) -> None:
        audit = UBOAuditLogger(max_entries=10)
        from ubo_graph.models import UBOAuditEntry

        for i in range(15):
            audit.log(UBOAuditEntry(entity_id=f"test-{i}", result_hash=f"hash-{i}"))
        # Should have been pruned to roughly half
        assert audit.entry_count <= 10


# ── UBO API Endpoints ──────────────────────────────────────────────────────


class TestUBOAPIEndpoints:
    @pytest.mark.asyncio
    async def test_calculate_endpoint(self, neo4j_client: Neo4jClient) -> None:
        from httpx import ASGITransport, AsyncClient

        ids = seed_simple_company(neo4j_client)

        # Build the app with shared state
        import ubo_graph.app as app_module

        app_module._db_client = neo4j_client
        app_module._ubo_service = UBOService(db_client=neo4j_client)
        app_module._audit_logger = UBOAuditLogger()
        app_module._reconciliation = ReconciliationService()
        app_module._cache = RedisCache()
        await app_module._cache.connect()

        app = create_app()
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(
                "/api/v1/ubo/calculate",
                params={"entity_id": ids["company_id"]},
            )
            assert resp.status_code == 200
            data = resp.json()
            assert data["result"]["status"] == "completed"
            assert data["result"]["entity_id"] == ids["company_id"]
            assert len(data["result"]["beneficial_owners"]) == 2
            assert data["from_cache"] is False

    @pytest.mark.asyncio
    async def test_calculate_entity_not_found(self) -> None:
        import ubo_graph.app as app_module
        from httpx import ASGITransport, AsyncClient

        app_module._db_client = Neo4jClient()
        app_module._ubo_service = UBOService(db_client=app_module._db_client)
        app_module._audit_logger = UBOAuditLogger()
        app_module._reconciliation = ReconciliationService()
        app_module._cache = RedisCache()
        await app_module._cache.connect()

        app = create_app()
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(
                "/api/v1/ubo/calculate",
                params={"entity_id": "nonexistent-id"},
            )
            assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_healthz(self) -> None:
        from httpx import ASGITransport, AsyncClient

        app = create_app()
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/v1/ubo/healthz")
            assert resp.status_code == 200
            assert resp.json()["status"] == "ok"


# ── Validation Suite: 25% Threshold Across All Structures ──────────────────


class TestThresholdValidationSuite:
    """Comprehensive validation of the 25% threshold logic across
    all seeded entity structures, as required by the acceptance criteria."""

    def test_simple_company_threshold_results(self, neo4j_client: Neo4jClient, ubo_service: UBOService) -> None:
        ids = seed_simple_company(neo4j_client)
        result = ubo_service.calculate(entity_id=ids["company_id"])

        above = [bo for bo in result.beneficial_owners if bo.threshold_status == OwnershipThreshold.ABOVE_THRESHOLD]
        below = [bo for bo in result.beneficial_owners if bo.threshold_status == OwnershipThreshold.BELOW_THRESHOLD]

        assert len(above) == 2  # Alice (60%) and Bob (40%) both above 25%
        assert len(below) == 0

    def test_multi_layered_trust_threshold_results(self, neo4j_client: Neo4jClient, ubo_service: UBOService) -> None:
        ids = seed_multi_layered_trust(neo4j_client)
        result = ubo_service.calculate(entity_id=ids["target_id"])

        above = [bo for bo in result.beneficial_owners if bo.threshold_status == OwnershipThreshold.ABOVE_THRESHOLD]
        # Carol (≥70% via trust) and Dave (≥30% direct) should both be above threshold
        assert len(above) >= 2

    def test_cross_held_threshold_results_for_alpha(self, neo4j_client: Neo4jClient, ubo_service: UBOService) -> None:
        ids = seed_cross_held_companies(neo4j_client)
        result = ubo_service.calculate(entity_id=ids["alpha_id"])

        # Eve: 80% (direct) → above threshold
        # Frank: 21% (via BetaCo 70% * AlphaCo 30%) → below threshold
        above = [bo for bo in result.beneficial_owners if bo.threshold_status == OwnershipThreshold.ABOVE_THRESHOLD]
        below = [bo for bo in result.beneficial_owners if bo.threshold_status == OwnershipThreshold.BELOW_THRESHOLD]

        assert any(bo.person_id == ids["eve_id"] for bo in above)
        assert any(bo.person_id == ids["frank_id"] for bo in below)

    def test_deep_nested_below_threshold(self, neo4j_client: Neo4jClient, ubo_service: UBOService) -> None:
        ids = seed_deep_nested_structure(neo4j_client)
        result = ubo_service.calculate(entity_id=ids["target_id"])

        # Grace's ownership = 16.8% → below 25%
        assert len(result.beneficial_owners) == 1
        assert result.beneficial_owners[0].threshold_status == OwnershipThreshold.BELOW_THRESHOLD

    def test_controls_relationship_threshold(self, neo4j_client: Neo4jClient, ubo_service: UBOService) -> None:
        ids = seed_controls_relationship(neo4j_client)
        result = ubo_service.calculate(entity_id=ids["target_id"])

        above = [bo for bo in result.beneficial_owners if bo.threshold_status == OwnershipThreshold.ABOVE_THRESHOLD]
        below = [bo for bo in result.beneficial_owners if bo.threshold_status == OwnershipThreshold.BELOW_THRESHOLD]

        # Hank (≥80% via CONTROLS) → above
        # Ivy (10% direct) → below
        assert len(above) >= 1
        assert len(below) >= 1


# ── Seed Data: All Structures ───────────────────────────────────────────────


class TestSeedAll:
    def test_seed_all_populates_graph(self, neo4j_client: Neo4jClient) -> None:
        result = seed_all(neo4j_client)
        assert len(result) == 5
        assert "simple_company" in result
        assert "multi_layered_trust" in result
        assert "cross_held_companies" in result
        assert "deep_nested_structure" in result
        assert "controls_relationship" in result

    def test_all_seeded_entities_are_calculable(self, neo4j_client: Neo4jClient) -> None:
        ids_map = seed_all(neo4j_client)
        ubo_svc = UBOService(db_client=neo4j_client)

        target_ids = [
            ids_map["simple_company"]["company_id"],
            ids_map["multi_layered_trust"]["target_id"],
            ids_map["cross_held_companies"]["alpha_id"],
            ids_map["deep_nested_structure"]["target_id"],
            ids_map["controls_relationship"]["target_id"],
        ]

        for entity_id in target_ids:
            result = ubo_svc.calculate(entity_id=entity_id)
            assert result.status == UBOCalculationStatus.COMPLETED, f"Failed for {entity_id}"
            assert len(result.beneficial_owners) > 0, f"No owners for {entity_id}"


# ── Graph Schema: Cypher Templates ─────────────────────────────────────────


class TestGraphSchema:
    """Exercise graph_schema constants and format helpers for coverage."""

    def test_schema_constraints_populated(self) -> None:
        assert len(SCHEMA_CONSTRAINTS) == 3
        assert all("UNIQUE" in c for c in SCHEMA_CONSTRAINTS)

    def test_create_node_cypher_contains_placeholders(self) -> None:
        assert "{node_type}" in CREATE_NODE_CYPHER
        assert "$node_id" in CREATE_NODE_CYPHER

    def test_create_edge_cypher_contains_placeholders(self) -> None:
        assert "{edge_type}" in CREATE_EDGE_CYPHER
        assert "$source_id" in CREATE_EDGE_CYPHER

    def test_ubo_paths_cypher_contains_depth_placeholder(self) -> None:
        assert "{max_depth}" in UBO_PATHS_CYPHER

    def test_other_cypher_constants_nonempty(self) -> None:
        assert len(DIRECT_SHAREHOLDERS_CYPHER) > 0
        assert len(ENTITY_EXISTS_CYPHER) > 0
        assert len(CLEANUP_ALL_CYPHER) > 0
        assert len(TRUSTEE_DEEMED_OWNERSHIP_CYPHER) > 0

    def test_format_create_node_cypher(self) -> None:
        result = format_create_node_cypher(NodeType.PERSON)
        assert "Person" in result
        assert "{node_type}" not in result

    def test_format_create_edge_cypher(self) -> None:
        result = format_create_edge_cypher(EdgeType.OWNS_SHARES)
        assert "OWNS_SHARES" in result
        assert "{edge_type}" not in result

    def test_format_ubo_paths_cypher_default_depth(self) -> None:
        result = format_ubo_paths_cypher()
        assert "1..5" in result

    def test_format_ubo_paths_cypher_custom_depth(self) -> None:
        result = format_ubo_paths_cypher(max_depth=3)
        assert "1..3" in result

    def test_format_ubo_paths_cypher_capped_at_10(self) -> None:
        result = format_ubo_paths_cypher(max_depth=99)
        assert "1..10" in result

    def test_format_ubo_paths_cypher_min_depth_1(self) -> None:
        result = format_ubo_paths_cypher(max_depth=0)
        assert "1..1" in result
