"""SG-5 Dynamic Cycle Detection (SPEC-3 §4).

The modulation routing graph (PR #24 RoutingGraph) is a DAG by contract,
but users can construct cycles two ways:

1. Static cycles — edges form a cycle visible at edit time (e.g.,
   lane-A → fx-blur.radius → lane-B → lane-A). Caught by a topological
   sort at edit time.

2. Runtime-conditional cycles — painted/learned binding rules whose
   evaluation depends on runtime data; cycle status can flip frame-to-frame.
   Painted masks that read their own output. Learned bindings that
   condition on a downstream value.

Both kinds must be detected. When found, we use deterministic
cycle-break: remove the lex-smallest edge id from the cycle. This
keeps the rendered behavior reproducible across runs (per Vision
deterministic rendering note).

Per [[feedback_sdlc-verify-in-app-not-just-code]]: unit tests verify
the DFS + break logic; the in-app validation lights up when the
routing canvas (PR #24 I2 frontend) renders cycle-break warnings on
a graph the user just constructed.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Optional

from inspector.routing_graph import GraphEdge, RoutingGraph

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class CycleReport:
    """One detected cycle + the deterministic break recommendation."""

    edge_ids: tuple[str, ...]  # the edges forming the cycle (in traversal order)
    node_ids: tuple[str, ...]  # nodes in traversal order
    suggested_break_edge_id: str  # lex-smallest edge_id in the cycle
    is_runtime_conditional: bool = False


@dataclass
class CycleDetectionResult:
    """Outcome of a cycle scan."""

    cycles: list[CycleReport] = field(default_factory=list)

    @property
    def has_cycles(self) -> bool:
        return bool(self.cycles)

    def suggested_break_edges(self) -> set[str]:
        return {c.suggested_break_edge_id for c in self.cycles}


def detect_cycles(graph: RoutingGraph) -> CycleDetectionResult:
    """Scan the static modulation graph for cycles via DFS.

    Returns a CycleDetectionResult listing every distinct cycle found
    with its deterministic-break recommendation. Each cycle is reported
    once even if multiple DFS paths discover it.
    """
    nodes = graph.nodes()
    edges = graph.edges()

    # Build adjacency: node_id → list of (edge, target_node)
    adj: dict[str, list[GraphEdge]] = defaultdict(list)
    for e in edges:
        adj[e.src_id].append(e)

    visited: set[str] = set()
    in_stack: dict[str, int] = {}  # node_id → stack-position
    stack_edges: list[GraphEdge] = []
    cycles: list[CycleReport] = []
    seen_cycle_keys: set[frozenset[str]] = set()

    def dfs(node_id: str) -> None:
        if node_id in in_stack:
            # Cycle: from stack[in_stack[node_id]] back to current
            cycle_start = in_stack[node_id]
            cycle_edges = stack_edges[cycle_start:]
            cycle_edge_ids = tuple(e.id for e in cycle_edges)
            cycle_node_ids = tuple(e.src_id for e in cycle_edges)
            cycle_key = frozenset(cycle_edge_ids)
            if cycle_key not in seen_cycle_keys:
                seen_cycle_keys.add(cycle_key)
                cycles.append(
                    CycleReport(
                        edge_ids=cycle_edge_ids,
                        node_ids=cycle_node_ids,
                        suggested_break_edge_id=min(cycle_edge_ids),
                    )
                )
            return
        if node_id in visited:
            return
        visited.add(node_id)
        in_stack[node_id] = len(stack_edges)
        for edge in adj.get(node_id, []):
            stack_edges.append(edge)
            dfs(edge.dst_id)
            stack_edges.pop()
        del in_stack[node_id]

    for n in nodes:
        if n.id not in visited:
            dfs(n.id)

    return CycleDetectionResult(cycles=cycles)


def break_cycles(graph: RoutingGraph, *, max_iterations: int = 100) -> list[str]:
    """Repeatedly detect + break cycles until the graph is acyclic.

    Returns the list of edge_ids removed (in removal order). Caller is
    responsible for surfacing this in the I3 inline action menu (PR #25)
    or as a toast.

    `max_iterations` guards against pathological cases where break
    doesn't fully decyclize (shouldn't happen with min-edge-id, but
    defensive).
    """
    removed: list[str] = []
    for _ in range(max_iterations):
        result = detect_cycles(graph)
        if not result.has_cycles:
            return removed
        # Pick the lex-smallest break across ALL cycles to be most decisive
        next_break = min(result.suggested_break_edges())
        if graph.remove_edge(next_break):
            removed.append(next_break)
            logger.info(
                "SG-5: broke cycle by removing edge %s (%d cycles remain)",
                next_break,
                len(result.cycles) - 1,
            )
        else:
            # Edge already gone — defensive break
            logger.warning(
                "SG-5: edge %s already removed; aborting cycle break", next_break
            )
            break
    return removed


def cycle_safe_edge_addition(graph: RoutingGraph, candidate: GraphEdge) -> bool:
    """Check whether adding `candidate` would create a cycle. Does NOT modify."""
    # Build adjacency including the candidate
    adj: dict[str, list[str]] = defaultdict(list)
    for e in graph.edges():
        adj[e.src_id].append(e.dst_id)
    adj[candidate.src_id].append(candidate.dst_id)

    # DFS from candidate.dst_id; if we reach candidate.src_id we have a cycle
    target = candidate.src_id
    start = candidate.dst_id
    if start == target:  # self-loop
        return False

    seen: set[str] = set()
    stack = [start]
    while stack:
        cur = stack.pop()
        if cur == target:
            return False  # cycle would be created
        if cur in seen:
            continue
        seen.add(cur)
        for nxt in adj.get(cur, []):
            stack.append(nxt)
    return True
