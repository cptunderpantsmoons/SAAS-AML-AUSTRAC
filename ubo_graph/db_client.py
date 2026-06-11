from __future__ import annotations

import logging
from typing import Any

from ubo_graph.models import EdgeType, GraphEdge, GraphNode, NodeType

logger = logging.getLogger("ubo_graph.db_client")

# ── In-memory graph store (fallback for dev/test) ──────────────────────────


class InMemoryGraphStore:
    """Simple adjacency-list graph store for development and testing.

    Supports the same query interface as the Neo4j client so the UBO
    service layer is database-agnostic.
    """

    def __init__(self) -> None:
        self._nodes: dict[str, GraphNode] = {}
        self._edges: dict[str, GraphEdge] = {}
        # Adjacency: source_id → list of edges going *into* target
        self._outgoing: dict[str, list[str]] = {}  # source → edge_ids
        self._incoming: dict[str, list[str]] = {}  # target → edge_ids

    # ── Mutation ────────────────────────────────────────────────────────

    def add_node(self, node: GraphNode) -> None:
        self._nodes[node.node_id] = node
        self._outgoing.setdefault(node.node_id, [])
        self._incoming.setdefault(node.node_id, [])

    def add_edge(self, edge: GraphEdge) -> None:
        self._edges[edge.edge_id] = edge
        self._outgoing.setdefault(edge.source_id, []).append(edge.edge_id)
        self._incoming.setdefault(edge.target_id, []).append(edge.edge_id)

    def clear(self) -> None:
        self._nodes.clear()
        self._edges.clear()
        self._outgoing.clear()
        self._incoming.clear()

    # ── Queries ─────────────────────────────────────────────────────────

    def get_node(self, node_id: str) -> GraphNode | None:
        return self._nodes.get(node_id)

    def entity_exists(self, entity_id: str) -> dict[str, str] | None:
        node = self._nodes.get(entity_id)
        if node is None:
            return None
        return {"node_type": node.node_type.value, "name": node.name}

    def direct_shareholders(self, entity_id: str) -> list[dict[str, Any]]:
        edge_ids = self._incoming.get(entity_id, [])
        results: list[dict[str, Any]] = []
        for eid in edge_ids:
            edge = self._edges[eid]
            if edge.edge_type in (EdgeType.OWNS_SHARES, EdgeType.IS_TRUSTEE_OF, EdgeType.CONTROLS):
                source = self._nodes.get(edge.source_id)
                if source:
                    results.append({
                        "node_id": source.node_id,
                        "name": source.name,
                        "node_type": source.node_type.value,
                        "ownership_percentage": edge.ownership_percentage,
                        "edge_type": edge.edge_type.value,
                    })
        results.sort(key=lambda r: r["ownership_percentage"], reverse=True)
        return results

    def ubo_paths(self, entity_id: str, max_depth: int = 5) -> list[dict[str, Any]]:
        """Recursive DFS upstream from *entity_id* to all Person nodes."""
        visited_paths: list[dict[str, Any]] = []

        def _walk(current_id: str, path: list[str], percentages: list[float],
                  edge_types: list[str], depth: int) -> None:
            if depth > max_depth:
                return
            edge_ids = self._incoming.get(current_id, [])
            for eid in edge_ids:
                edge = self._edges[eid]
                if edge.edge_type not in (EdgeType.OWNS_SHARES, EdgeType.IS_TRUSTEE_OF, EdgeType.CONTROLS):
                    continue
                source = self._nodes.get(edge.source_id)
                if source is None:
                    continue
                new_path = [*path, source.node_id]
                # IS_TRUSTEE_OF edges represent 100% effective control
                if edge.edge_type == EdgeType.IS_TRUSTEE_OF:
                    new_pcts = [*percentages, 100.0]
                else:
                    new_pcts = [*percentages, edge.ownership_percentage]
                new_types = [*edge_types, edge.edge_type.value]
                if source.node_type == NodeType.PERSON:
                    # Reached a beneficial owner
                    # Effective ownership = product of percentages along the path / 100^(depth-1)
                    # IS_TRUSTEE_OF edges are treated as 100% control
                    effective = new_pcts[0]
                    for p in new_pcts[1:]:
                        effective = effective * p / 100.0
                    visited_paths.append({
                        "person_id": source.node_id,
                        "name": source.name,
                        "country_code": source.country_code,
                        "ownership_percentages": list(new_pcts),
                        "edge_types": list(new_types),
                        "depth": depth,
                        "path_nodes": [entity_id, *new_path],
                        "effective_percentage": round(effective, 4),
                    })
                else:
                    # Intermediate entity — keep walking
                    _walk(source.node_id, new_path, new_pcts, new_types, depth + 1)

        _walk(entity_id, [], [], [], 1)
        visited_paths.sort(key=lambda r: r["depth"])
        return visited_paths

    def trustee_deemed_ownership(self, entity_id: str) -> list[dict[str, Any]]:
        """Find trustees who are deemed to control trust ownership."""
        results: list[dict[str, Any]] = []
        # Find trusts that own shares in the entity
        incoming_edge_ids = self._incoming.get(entity_id, [])
        for eid in incoming_edge_ids:
            edge = self._edges[eid]
            if edge.edge_type != EdgeType.OWNS_SHARES:
                continue
            trust_node = self._nodes.get(edge.source_id)
            if trust_node is None or trust_node.node_type != NodeType.TRUST:
                continue
            # Find trustees of this trust
            trust_incoming = self._incoming.get(trust_node.node_id, [])
            for teid in trust_incoming:
                trust_edge = self._edges[teid]
                if trust_edge.edge_type != EdgeType.IS_TRUSTEE_OF:
                    continue
                trustee = self._nodes.get(trust_edge.source_id)
                if trustee and trustee.node_type == NodeType.PERSON:
                    results.append({
                        "person_id": trustee.node_id,
                        "name": trustee.name,
                        "country_code": trustee.country_code,
                        "deemed_percentage": edge.ownership_percentage,
                    })
        return results

    # ── Stats ───────────────────────────────────────────────────────────

    @property
    def node_count(self) -> int:
        return len(self._nodes)

    @property
    def edge_count(self) -> int:
        return len(self._edges)


# ── Neo4j client (production) ──────────────────────────────────────────────


class Neo4jClient:
    """Async Neo4j client using the official ``neo4j`` driver.

    Connects with TLS and auth; designed to run inside the private VPC.
    Falls back to :class:`InMemoryGraphStore` when the driver is unavailable.
    """

    def __init__(
        self,
        uri: str = "bolt://localhost:7687",
        username: str = "neo4j",
        password: str = "",
        database: str = "neo4j",
        encrypted: bool = True,
    ) -> None:
        self._uri = uri
        self._username = username
        self._password = password
        self._database = database
        self._encrypted = encrypted
        self._driver: Any = None
        self._fallback = InMemoryGraphStore()
        self._using_fallback = True

    async def connect(self) -> None:
        try:
            from neo4j import GraphDatabase

            self._driver = GraphDatabase.driver(
                self._uri,
                auth=(self._username, self._password),
                encrypted=self._encrypted,
            )
            self._driver.verify_connectivity()
            self._using_fallback = False
            logger.info("Connected to Neo4j at %s (encrypted=%s)", self._uri, self._encrypted)
        except Exception as exc:
            logger.warning(
                "Neo4j unavailable (%s) — using in-memory fallback",
                exc,
            )
            self._using_fallback = True

    async def close(self) -> None:
        if self._driver is not None:
            self._driver.close()
            self._driver = None

    @property
    def using_fallback(self) -> bool:
        return self._using_fallback

    @property
    def store(self) -> InMemoryGraphStore:
        """Direct access to the fallback store (for dev/test seeding)."""
        return self._fallback

    # ── Delegated operations ────────────────────────────────────────────

    def add_node(self, node: GraphNode) -> None:
        if self._using_fallback:
            self._fallback.add_node(node)
            return
        # Production: execute Cypher
        self._execute_write(
            f"MERGE (n:{node.node_type.value} {{node_id: $node_id}}) SET n.name = $name, "
            "n.country_code = $country_code, n.registration_id = $registration_id, "
            "n.properties = $properties",
            {
                "node_id": node.node_id,
                "name": node.name,
                "country_code": node.country_code,
                "registration_id": node.registration_id,
                "properties": node.properties,
            },
        )

    def add_edge(self, edge: GraphEdge) -> None:
        if self._using_fallback:
            self._fallback.add_edge(edge)
            return
        self._execute_write(
            "MATCH (s {node_id: $source_id}) MATCH (t {node_id: $target_id}) "
            f"MERGE (s)-[r:{edge.edge_type.value}]->(t) SET r.ownership_percentage = $ownership_percentage, "
            "r.effective_date = $effective_date, r.properties = $properties",
            {
                "source_id": edge.source_id,
                "target_id": edge.target_id,
                "ownership_percentage": edge.ownership_percentage,
                "effective_date": edge.effective_date,
                "properties": edge.properties,
            },
        )

    def entity_exists(self, entity_id: str) -> dict[str, str] | None:
        if self._using_fallback:
            return self._fallback.entity_exists(entity_id)
        return self._execute_read(
            "MATCH (e {node_id: $entity_id}) RETURN labels(e)[0] AS node_type, e.name AS name",
            {"entity_id": entity_id},
        )

    def direct_shareholders(self, entity_id: str) -> list[dict[str, Any]]:
        if self._using_fallback:
            return self._fallback.direct_shareholders(entity_id)
        return self._execute_read_many(
            "MATCH (sh)-[r:OWNS_SHARES|IS_TRUSTEE_OF|CONTROLS]->(e {node_id: $entity_id}) "
            "RETURN sh.node_id AS node_id, sh.name AS name, labels(sh)[0] AS node_type, "
            "r.ownership_percentage AS ownership_percentage, type(r) AS edge_type "
            "ORDER BY r.ownership_percentage DESC",
            {"entity_id": entity_id},
        )

    def ubo_paths(self, entity_id: str, max_depth: int = 5) -> list[dict[str, Any]]:
        if self._using_fallback:
            return self._fallback.ubo_paths(entity_id, max_depth)
        from ubo_graph.graph_schema import format_ubo_paths_cypher
        cypher = format_ubo_paths_cypher(max_depth)
        return self._execute_read_many(cypher, {"entity_id": entity_id})

    def trustee_deemed_ownership(self, entity_id: str) -> list[dict[str, Any]]:
        if self._using_fallback:
            return self._fallback.trustee_deemed_ownership(entity_id)
        from ubo_graph.graph_schema import TRUSTEE_DEEMED_OWNERSHIP_CYPHER
        return self._execute_read_many(TRUSTEE_DEEMED_OWNERSHIP_CYPHER, {"entity_id": entity_id})

    def clear(self) -> None:
        if self._using_fallback:
            self._fallback.clear()
            return
        self._execute_write("MATCH (n) DETACH DELETE n", {})

    # ── Internal helpers ────────────────────────────────────────────────

    def _execute_write(self, cypher: str, params: dict[str, Any]) -> None:
        if self._driver is None:
            return
        with self._driver.session(database=self._database) as session:
            session.run(cypher, **params)

    def _execute_read(self, cypher: str, params: dict[str, Any]) -> dict[str, str] | None:
        if self._driver is None:
            return None
        with self._driver.session(database=self._database) as session:
            result = session.run(cypher, **params)
            record = result.single()
            return dict(record) if record else None

    def _execute_read_many(self, cypher: str, params: dict[str, Any]) -> list[dict[str, Any]]:
        if self._driver is None:
            return []
        with self._driver.session(database=self._database) as session:
            result = session.run(cypher, **params)
            return [dict(record) for record in result]


def create_db_client(
    uri: str = "bolt://localhost:7687",
    username: str = "neo4j",
    password: str = "",
    database: str = "neo4j",
    encrypted: bool = True,
) -> Neo4jClient:
    return Neo4jClient(uri=uri, username=username, password=password,
                        database=database, encrypted=encrypted)
