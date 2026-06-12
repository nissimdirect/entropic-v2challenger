"""I2 Routing Canvas backend — modulation graph state (Vision PRD).

Surface B: a graph view of every modulation route in the project.
Nodes are effects, lanes, operators, and pads. Edges are routes
(e.g., "lane L1 modulates fx-blur.radius on track t1").

The graph is the authoritative state; the frontend canvas
(`Cmd+Shift+I`) renders it as a node-link diagram via react-flow.

This module owns:
- Node/Edge model + lookups
- Add/remove/update operations (thread-safe)
- Cycle detection (delegates to existing PR-zero topological sort
  helpers when wired)
- Serialization for `.dna` round-trip
"""

from __future__ import annotations

import threading
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class NodeKind(str, Enum):
    EFFECT = "effect"
    LANE = "lane"
    OPERATOR = "operator"
    PAD = "pad"


@dataclass(frozen=True)
class GraphNode:
    id: str
    kind: NodeKind
    label: str
    track_id: Optional[str] = None


@dataclass(frozen=True)
class GraphEdge:
    """A modulation route: src node → dst param.

    `dst_param` is the target parameter path (e.g., `fx-blur.radius`)
    on the destination node. `amount` is the modulation depth in [-1, 1].
    """

    id: str
    src_id: str
    dst_id: str
    dst_param: str
    amount: float = 1.0


class RoutingGraphError(Exception):
    """Bad operation on the routing graph."""


class RoutingGraph:
    """Thread-safe modulation routing graph."""

    def __init__(self) -> None:
        self._nodes: dict[str, GraphNode] = {}
        self._edges: dict[str, GraphEdge] = {}
        self._lock = threading.RLock()

    # ---- node operations ----

    def add_node(self, node: GraphNode) -> None:
        with self._lock:
            if node.id in self._nodes:
                raise RoutingGraphError(f"node id {node.id!r} already exists")
            self._nodes[node.id] = node

    def remove_node(self, node_id: str) -> bool:
        with self._lock:
            if node_id not in self._nodes:
                return False
            # Cascade-remove any edges touching this node
            self._edges = {
                eid: e
                for eid, e in self._edges.items()
                if e.src_id != node_id and e.dst_id != node_id
            }
            del self._nodes[node_id]
            return True

    def get_node(self, node_id: str) -> Optional[GraphNode]:
        with self._lock:
            return self._nodes.get(node_id)

    def nodes(self) -> list[GraphNode]:
        with self._lock:
            return list(self._nodes.values())

    # ---- edge operations ----

    def add_edge(self, edge: GraphEdge) -> None:
        with self._lock:
            if edge.id in self._edges:
                raise RoutingGraphError(f"edge id {edge.id!r} already exists")
            if edge.src_id not in self._nodes:
                raise RoutingGraphError(f"edge src {edge.src_id!r} not in graph")
            if edge.dst_id not in self._nodes:
                raise RoutingGraphError(f"edge dst {edge.dst_id!r} not in graph")
            if not -1.0 <= edge.amount <= 1.0:
                raise RoutingGraphError(
                    f"edge amount must be in [-1, 1], got {edge.amount}"
                )
            self._edges[edge.id] = edge

    def remove_edge(self, edge_id: str) -> bool:
        with self._lock:
            return self._edges.pop(edge_id, None) is not None

    def update_edge_amount(self, edge_id: str, amount: float) -> bool:
        with self._lock:
            edge = self._edges.get(edge_id)
            if edge is None:
                return False
            if not -1.0 <= amount <= 1.0:
                raise RoutingGraphError(f"edge amount must be in [-1, 1], got {amount}")
            self._edges[edge_id] = GraphEdge(
                id=edge.id,
                src_id=edge.src_id,
                dst_id=edge.dst_id,
                dst_param=edge.dst_param,
                amount=amount,
            )
            return True

    def get_edge(self, edge_id: str) -> Optional[GraphEdge]:
        with self._lock:
            return self._edges.get(edge_id)

    def edges(self) -> list[GraphEdge]:
        with self._lock:
            return list(self._edges.values())

    def edges_from(self, src_id: str) -> list[GraphEdge]:
        with self._lock:
            return [e for e in self._edges.values() if e.src_id == src_id]

    def edges_to(self, dst_id: str) -> list[GraphEdge]:
        with self._lock:
            return [e for e in self._edges.values() if e.dst_id == dst_id]

    # ---- cycle detection ----

    def has_cycle(self) -> bool:
        """DFS over the edge set; returns True if any cycle exists."""
        with self._lock:
            adj: dict[str, list[str]] = {}
            for e in self._edges.values():
                adj.setdefault(e.src_id, []).append(e.dst_id)
            visited: set[str] = set()
            in_stack: set[str] = set()

            def dfs(node_id: str) -> bool:
                if node_id in in_stack:
                    return True
                if node_id in visited:
                    return False
                visited.add(node_id)
                in_stack.add(node_id)
                for nxt in adj.get(node_id, []):
                    if dfs(nxt):
                        return True
                in_stack.discard(node_id)
                return False

            return any(dfs(n) for n in list(self._nodes.keys()))

    # ---- serialization ----

    def to_dict(self) -> dict:
        with self._lock:
            return {
                "nodes": [
                    {
                        "id": n.id,
                        "kind": n.kind.value,
                        "label": n.label,
                        "track_id": n.track_id,
                    }
                    for n in self._nodes.values()
                ],
                "edges": [
                    {
                        "id": e.id,
                        "src_id": e.src_id,
                        "dst_id": e.dst_id,
                        "dst_param": e.dst_param,
                        "amount": e.amount,
                    }
                    for e in self._edges.values()
                ],
            }

    def load_dict(self, data: dict) -> None:
        """Replace the graph state from a dict (`.dna` round-trip)."""
        with self._lock:
            self._nodes.clear()
            self._edges.clear()
            for n_raw in data.get("nodes", []):
                node = GraphNode(
                    id=str(n_raw["id"]),
                    kind=NodeKind(n_raw["kind"]),
                    label=str(n_raw.get("label", "")),
                    track_id=n_raw.get("track_id"),
                )
                self._nodes[node.id] = node
            for e_raw in data.get("edges", []):
                edge = GraphEdge(
                    id=str(e_raw["id"]),
                    src_id=str(e_raw["src_id"]),
                    dst_id=str(e_raw["dst_id"]),
                    dst_param=str(e_raw["dst_param"]),
                    amount=float(e_raw.get("amount", 1.0)),
                )
                self._edges[edge.id] = edge


_GLOBAL: Optional[RoutingGraph] = None


def global_routing_graph() -> RoutingGraph:
    global _GLOBAL
    if _GLOBAL is None:
        _GLOBAL = RoutingGraph()
    return _GLOBAL


def reset_global_routing_graph_for_testing() -> None:
    global _GLOBAL
    _GLOBAL = None
