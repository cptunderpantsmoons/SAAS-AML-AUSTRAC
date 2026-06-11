from __future__ import annotations

from ubo_graph.models import EdgeType, NodeType

# ── Cypher: schema initialisation ───────────────────────────────────────────

SCHEMA_CONSTRAINTS: list[str] = [
    f"CREATE CONSTRAINT node_id_unique IF NOT EXISTS "
    f"FOR (n:{NodeType.PERSON.value}) REQUIRE n.node_id IS UNIQUE",
    f"CREATE CONSTRAINT company_id_unique IF NOT EXISTS "
    f"FOR (n:{NodeType.COMPANY.value}) REQUIRE n.node_id IS UNIQUE",
    f"CREATE CONSTRAINT trust_id_unique IF NOT EXISTS "
    f"FOR (n:{NodeType.TRUST.value}) REQUIRE n.node_id IS UNIQUE",
]

# ── Cypher: node creation ──────────────────────────────────────────────────

CREATE_NODE_CYPHER = """
MERGE (n:{node_type} {{node_id: $node_id}})
SET n.name = $name,
    n.country_code = $country_code,
    n.registration_id = $registration_id,
    n.properties = $properties
RETURN n.node_id AS node_id
"""

# ── Cypher: edge creation ──────────────────────────────────────────────────

CREATE_EDGE_CYPHER = """
MATCH (source {{node_id: $source_id}})
MATCH (target {{node_id: $target_id}})
MERGE (source)-[r:{edge_type}]->(target)
SET r.ownership_percentage = $ownership_percentage,
    r.effective_date = $effective_date,
    r.properties = $properties
RETURN type(r) AS edge_type
"""

# ── Cypher: UBO path traversal ─────────────────────────────────────────────
# Walks upstream from a target entity to all Person nodes reachable
# via OWNS_SHARES, IS_TRUSTEE_OF, or CONTROLS edges, up to max_depth.

UBO_PATHS_CYPHER = """
MATCH path = (ubo:Person)<-[:OWNS_SHARES|IS_TRUSTEE_OF|CONTROLS*1..{max_depth}]-(entity)
WHERE entity.node_id = $entity_id
WITH ubo, path,
     [rel IN relationships(path) | rel.ownership_percentage] AS percentages,
     [rel IN relationships(path) | type(rel)] AS edge_types,
     length(path) AS depth
RETURN ubo.node_id           AS person_id,
       ubo.name              AS name,
       ubo.country_code      AS country_code,
       percentages           AS ownership_percentages,
       edge_types            AS edge_types,
       depth                 AS depth,
       [node IN nodes(path)  | node.node_id] AS path_nodes
ORDER BY depth
"""

# ── Cypher: direct shareholders ────────────────────────────────────────────

DIRECT_SHAREHOLDERS_CYPHER = """
MATCH (shareholder)-[r:OWNS_SHARES|IS_TRUSTEE_OF|CONTROLS]->(entity)
WHERE entity.node_id = $entity_id
RETURN shareholder.node_id           AS node_id,
       shareholder.name              AS name,
       labels(shareholder)[0]        AS node_type,
       r.ownership_percentage        AS ownership_percentage,
       type(r)                       AS edge_type
ORDER BY r.ownership_percentage DESC
"""

# ── Cypher: entity existence check ─────────────────────────────────────────

ENTITY_EXISTS_CYPHER = """
MATCH (e) WHERE e.node_id = $entity_id
RETURN labels(e)[0] AS node_type, e.name AS name
"""

# ── Cypher: seed data cleanup (for tests) ──────────────────────────────────

CLEANUP_ALL_CYPHER = """
MATCH (n)
DETACH DELETE n
"""

# ── Trust-specific rule ────────────────────────────────────────────────────
# When a Person is a trustee of a Trust that owns shares, the trustee
# is deemed to control the trust's ownership percentage for UBO purposes
# unless a different beneficial owner is explicitly declared.

TRUSTEE_DEEMED_OWNERSHIP_CYPHER = """
MATCH (trustee:Person)-[:IS_TRUSTEE_OF]->(trust:Trust)-[r:OWNS_SHARES]->(company:Company)
WHERE company.node_id = $entity_id
RETURN trustee.node_id         AS person_id,
       trustee.name            AS name,
       trustee.country_code    AS country_code,
       r.ownership_percentage  AS deemed_percentage
"""


def format_create_node_cypher(node_type: NodeType) -> str:
    return CREATE_NODE_CYPHER.format(node_type=node_type.value)


def format_create_edge_cypher(edge_type: EdgeType) -> str:
    return CREATE_EDGE_CYPHER.format(edge_type=edge_type.value)


def format_ubo_paths_cypher(max_depth: int = 5) -> str:
    capped = min(max(max_depth, 1), 10)
    return UBO_PATHS_CYPHER.format(max_depth=capped)
