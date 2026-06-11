from __future__ import annotations

import uuid

from ubo_graph.db_client import Neo4jClient
from ubo_graph.models import EdgeType, GraphEdge, GraphNode, NodeType


def _uid(prefix: str = "") -> str:
    return f"{prefix}{uuid.uuid4().hex[:8]}"


def seed_simple_company(db: Neo4jClient) -> dict[str, str]:
    """Seed: Company with two direct Person shareholders.

    Alice owns 60%, Bob owns 40% → both above 25% threshold.
    """
    company_id = _uid("co-")
    alice_id = _uid("p-")
    bob_id = _uid("p-")

    db.add_node(GraphNode(node_id=company_id, node_type=NodeType.COMPANY, name="SimpleCo Pty Ltd", country_code="AU"))
    db.add_node(GraphNode(node_id=alice_id, node_type=NodeType.PERSON, name="Alice Smith", country_code="AU"))
    db.add_node(GraphNode(node_id=bob_id, node_type=NodeType.PERSON, name="Bob Jones", country_code="AU"))

    db.add_edge(GraphEdge(edge_id=_uid("e-"), source_id=alice_id, target_id=company_id,
                           edge_type=EdgeType.OWNS_SHARES, ownership_percentage=60.0))
    db.add_edge(GraphEdge(edge_id=_uid("e-"), source_id=bob_id, target_id=company_id,
                           edge_type=EdgeType.OWNS_SHARES, ownership_percentage=40.0))

    return {"company_id": company_id, "alice_id": alice_id, "bob_id": bob_id}


def seed_multi_layered_trust(db: Neo4jClient) -> dict[str, str]:
    """Seed: Trust → Company → Subsidiary with Person at the top.

    Structure:
        Carol (Person, trustee)
          → Trust A (IS_TRUSTEE_OF)
            → HoldingCo (OWNS_SHARES 70%)
              → TargetCo (OWNS_SHARES 100%)
        Dave (Person)
          → HoldingCo (OWNS_SHARES 30%)
            → TargetCo (OWNS_SHARES 100%)

    Carol's effective ownership of TargetCo = 70% (trustee deemed) * 100% = 70%
    Dave's effective ownership of TargetCo = 30% * 100% = 30%
    """
    target_id = _uid("co-")
    holding_id = _uid("co-")
    trust_id = _uid("tr-")
    carol_id = _uid("p-")
    dave_id = _uid("p-")

    db.add_node(GraphNode(node_id=target_id, node_type=NodeType.COMPANY, name="TargetCo Pty Ltd", country_code="AU"))
    db.add_node(GraphNode(node_id=holding_id, node_type=NodeType.COMPANY, name="HoldingCo Pty Ltd", country_code="AU"))
    db.add_node(GraphNode(node_id=trust_id, node_type=NodeType.TRUST, name="Trust A", country_code="AU"))
    db.add_node(GraphNode(node_id=carol_id, node_type=NodeType.PERSON, name="Carol White", country_code="AU"))
    db.add_node(GraphNode(node_id=dave_id, node_type=NodeType.PERSON, name="Dave Brown", country_code="AU"))

    # Trust owns 70% of HoldingCo
    db.add_edge(GraphEdge(edge_id=_uid("e-"), source_id=trust_id, target_id=holding_id,
                           edge_type=EdgeType.OWNS_SHARES, ownership_percentage=70.0))
    # Carol is trustee of Trust A
    db.add_edge(GraphEdge(edge_id=_uid("e-"), source_id=carol_id, target_id=trust_id,
                           edge_type=EdgeType.IS_TRUSTEE_OF, ownership_percentage=0.0))
    # Dave owns 30% of HoldingCo directly
    db.add_edge(GraphEdge(edge_id=_uid("e-"), source_id=dave_id, target_id=holding_id,
                           edge_type=EdgeType.OWNS_SHARES, ownership_percentage=30.0))
    # HoldingCo owns 100% of TargetCo
    db.add_edge(GraphEdge(edge_id=_uid("e-"), source_id=holding_id, target_id=target_id,
                           edge_type=EdgeType.OWNS_SHARES, ownership_percentage=100.0))

    return {
        "target_id": target_id,
        "holding_id": holding_id,
        "trust_id": trust_id,
        "carol_id": carol_id,
        "dave_id": dave_id,
    }


def seed_cross_held_companies(db: Neo4jClient) -> dict[str, str]:
    """Seed: Two companies with cross-shareholdings and a Person behind each.

    Structure:
        Eve (Person, 80% of AlphaCo)
        Frank (Person, 70% of BetaCo)
        AlphaCo owns 40% of BetaCo
        BetaCo owns 30% of AlphaCo

    Eve's effective ownership of BetaCo via AlphaCo = 80% * 40% = 32%
    Frank's effective ownership of AlphaCo via BetaCo = 70% * 30% = 21%

    For AlphaCo: Eve=80% (direct), Frank=21% (via BetaCo)
    For BetaCo:  Frank=70% (direct), Eve=32% (via AlphaCo)
    """
    alpha_id = _uid("co-")
    beta_id = _uid("co-")
    eve_id = _uid("p-")
    frank_id = _uid("p-")

    db.add_node(GraphNode(node_id=alpha_id, node_type=NodeType.COMPANY, name="AlphaCo Pty Ltd", country_code="AU"))
    db.add_node(GraphNode(node_id=beta_id, node_type=NodeType.COMPANY, name="BetaCo Pty Ltd", country_code="AU"))
    db.add_node(GraphNode(node_id=eve_id, node_type=NodeType.PERSON, name="Eve Taylor", country_code="AU"))
    db.add_node(GraphNode(node_id=frank_id, node_type=NodeType.PERSON, name="Frank Wilson", country_code="AU"))

    # Direct ownership
    db.add_edge(GraphEdge(edge_id=_uid("e-"), source_id=eve_id, target_id=alpha_id,
                           edge_type=EdgeType.OWNS_SHARES, ownership_percentage=80.0))
    db.add_edge(GraphEdge(edge_id=_uid("e-"), source_id=frank_id, target_id=beta_id,
                           edge_type=EdgeType.OWNS_SHARES, ownership_percentage=70.0))

    # Cross-holdings
    db.add_edge(GraphEdge(edge_id=_uid("e-"), source_id=alpha_id, target_id=beta_id,
                           edge_type=EdgeType.OWNS_SHARES, ownership_percentage=40.0))
    db.add_edge(GraphEdge(edge_id=_uid("e-"), source_id=beta_id, target_id=alpha_id,
                           edge_type=EdgeType.OWNS_SHARES, ownership_percentage=30.0))

    return {
        "alpha_id": alpha_id,
        "beta_id": beta_id,
        "eve_id": eve_id,
        "frank_id": frank_id,
    }


def seed_deep_nested_structure(db: Neo4jClient) -> dict[str, str]:
    """Seed: 5-level deep ownership chain (tests max depth traversal).

    Structure:
        Grace (Person, 100% of Level1Co)
          Level1Co owns 80% of Level2Co
            Level2Co owns 70% of Level3Co
              Level3Co owns 60% of Level4Co
                Level4Co owns 50% of TargetCo

    Grace's effective ownership of TargetCo = 100% * 80% * 70% * 60% * 50% = 16.8%
    This is BELOW the 25% threshold → tests that sub-threshold UBOs are detected.
    """
    target_id = _uid("co-")
    l1_id = _uid("co-")
    l2_id = _uid("co-")
    l3_id = _uid("co-")
    l4_id = _uid("co-")
    grace_id = _uid("p-")

    for nid, name in [(target_id, "DeepTargetCo"), (l1_id, "Level1Co"), (l2_id, "Level2Co"),
                       (l3_id, "Level3Co"), (l4_id, "Level4Co")]:
        db.add_node(GraphNode(node_id=nid, node_type=NodeType.COMPANY, name=name, country_code="AU"))

    db.add_node(GraphNode(node_id=grace_id, node_type=NodeType.PERSON, name="Grace Lee", country_code="AU"))

    # Chain: Grace → L1 → L2 → L3 → L4 → Target
    db.add_edge(GraphEdge(edge_id=_uid("e-"), source_id=grace_id, target_id=l4_id,
                           edge_type=EdgeType.OWNS_SHARES, ownership_percentage=100.0))
    db.add_edge(GraphEdge(edge_id=_uid("e-"), source_id=l4_id, target_id=l3_id,
                           edge_type=EdgeType.OWNS_SHARES, ownership_percentage=60.0))
    db.add_edge(GraphEdge(edge_id=_uid("e-"), source_id=l3_id, target_id=l2_id,
                           edge_type=EdgeType.OWNS_SHARES, ownership_percentage=70.0))
    db.add_edge(GraphEdge(edge_id=_uid("e-"), source_id=l2_id, target_id=l1_id,
                           edge_type=EdgeType.OWNS_SHARES, ownership_percentage=80.0))
    db.add_edge(GraphEdge(edge_id=_uid("e-"), source_id=l1_id, target_id=target_id,
                           edge_type=EdgeType.OWNS_SHARES, ownership_percentage=50.0))

    return {
        "target_id": target_id,
        "l1_id": l1_id, "l2_id": l2_id, "l3_id": l3_id, "l4_id": l4_id,
        "grace_id": grace_id,
    }


def seed_controls_relationship(db: Neo4jClient) -> dict[str, str]:
    """Seed: CONTROLS edge (non-shareholding control).

    Structure:
        Hank (Person, CONTROLS IndirectCo)
        IndirectCo owns 90% of TargetCo
        Ivy (Person, OWNS_SHARES 10% of TargetCo)

    Hank's effective ownership via CONTROLS = 90%
    Ivy's effective ownership = 10%
    """
    target_id = _uid("co-")
    indirect_id = _uid("co-")
    hank_id = _uid("p-")
    ivy_id = _uid("p-")

    db.add_node(GraphNode(
        node_id=target_id, node_type=NodeType.COMPANY,
        name="ControlledCo Pty Ltd", country_code="AU",
    ))
    db.add_node(GraphNode(
        node_id=indirect_id, node_type=NodeType.COMPANY,
        name="IndirectCo Pty Ltd", country_code="AU",
    ))
    db.add_node(GraphNode(node_id=hank_id, node_type=NodeType.PERSON, name="Hank Chen", country_code="AU"))
    db.add_node(GraphNode(node_id=ivy_id, node_type=NodeType.PERSON, name="Ivy Nguyen", country_code="AU"))

    db.add_edge(GraphEdge(edge_id=_uid("e-"), source_id=hank_id, target_id=indirect_id,
                           edge_type=EdgeType.CONTROLS, ownership_percentage=90.0))
    db.add_edge(GraphEdge(edge_id=_uid("e-"), source_id=indirect_id, target_id=target_id,
                           edge_type=EdgeType.OWNS_SHARES, ownership_percentage=90.0))
    db.add_edge(GraphEdge(edge_id=_uid("e-"), source_id=ivy_id, target_id=target_id,
                           edge_type=EdgeType.OWNS_SHARES, ownership_percentage=10.0))

    return {
        "target_id": target_id,
        "indirect_id": indirect_id,
        "hank_id": hank_id,
        "ivy_id": ivy_id,
    }


def seed_all(db: Neo4jClient) -> dict[str, dict[str, str]]:
    """Seed all test structures and return a map of structure name → IDs."""
    return {
        "simple_company": seed_simple_company(db),
        "multi_layered_trust": seed_multi_layered_trust(db),
        "cross_held_companies": seed_cross_held_companies(db),
        "deep_nested_structure": seed_deep_nested_structure(db),
        "controls_relationship": seed_controls_relationship(db),
    }
