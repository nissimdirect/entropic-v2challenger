"""I2 backend graph-sync — build a RoutingGraph projection from live project state.

The graph is a PROJECTION: the operator mappings and automation lanes remain the
sole sources of truth. Every call to build_graph_from_project() is a fresh read;
nothing is cached between calls.

Node id conventions (deterministic, stable across calls with the same input):
  - operator:  ``op:{operator_id}``
  - effect:    ``fx:{track_id}:{effect_id}``
  - lane:      ``lane:{track_id}:{lane_id}``

Orphan edges (mapping references a non-existent effect/param in the supplied
chains) are dropped with a log warning — they never reach the serialized reply.
"""

from __future__ import annotations

import logging
import math
from typing import Any

from inspector.routing_graph import GraphEdge, GraphNode, NodeKind, RoutingGraph

_LOG = logging.getLogger(__name__)

# Amount bounds for operator mappings.
_AMOUNT_MIN = -1.0
_AMOUNT_MAX = 1.0


def _clamp_amount(value: float) -> float:
    """Clamp a depth/amount value to [-1, 1]."""
    if not math.isfinite(value):
        return 0.0
    return max(_AMOUNT_MIN, min(_AMOUNT_MAX, value))


def _safe_str(value: Any, max_len: int = 256) -> str:
    """Convert to str and truncate to max_len characters."""
    return str(value)[:max_len] if value is not None else ""


def build_graph_from_project(
    operators: list[dict],
    lanes_by_track: dict[str, list[dict]],
    chain_by_track: dict[str, list[dict]],
) -> RoutingGraph:
    """Build a RoutingGraph projection from the live project state.

    Args:
        operators: List of operator config dicts (each has 'id', 'mappings',
            'isEnabled'/'is_enabled', optional label).
        lanes_by_track: Map of track_id -> list of lane dicts. Each lane dict
            should have at minimum ``laneId``/``lane_id``, ``effectId``/
            ``effect_id``, and ``paramKey``/``param_key``. An optional ``label``
            is used for the node label.
        chain_by_track: Map of track_id -> list of effect dicts (the device
            chain for that track, in backend snake_case format). Used to validate
            that edges target real effects/params.

    Returns:
        A fresh RoutingGraph populated with nodes and edges from the given state.
        Empty input → empty graph (no error).

    Failure modes:
        - Operator mapping whose target effect/param does not exist in the
          supplied chains → orphan edge: dropped with a WARNING log, never
          reaches the reply.
        - Duplicate node ids → last-wins with a WARNING log.
        - Non-finite depth from the payload → clamped to 0.0.
    """
    graph = RoutingGraph()

    # ------------------------------------------------------------------
    # Step 1: Build a set of valid (track_id, effect_id) pairs so we can
    # validate edges cheaply.
    # ------------------------------------------------------------------
    # effect_params_by_track_effect: (track_id, effect_id) -> set of param keys
    effect_params: dict[tuple[str, str], set[str]] = {}
    for track_id, chain in chain_by_track.items():
        for effect in chain:
            if not isinstance(effect, dict):
                continue
            eid = _safe_str(effect.get("effect_id", effect.get("effectId", "")), 256)
            if not eid:
                continue
            params = effect.get("params", {})
            param_keys = set(params.keys()) if isinstance(params, dict) else set()
            key = (str(track_id), eid)
            effect_params.setdefault(key, set()).update(param_keys)

    # ------------------------------------------------------------------
    # Step 2: Add effect nodes (one per track × effect)
    # ------------------------------------------------------------------
    for track_id, chain in chain_by_track.items():
        for effect in chain:
            if not isinstance(effect, dict):
                continue
            eid = _safe_str(effect.get("effect_id", effect.get("effectId", "")), 256)
            if not eid:
                continue
            node_id = f"fx:{track_id}:{eid}"
            label = _safe_str(effect.get("label", effect.get("name", eid)), 256)
            node = GraphNode(
                id=node_id,
                kind=NodeKind.EFFECT,
                label=label,
                track_id=str(track_id),
            )
            if node_id in {n.id for n in graph.nodes()}:
                _LOG.warning(
                    "graph_sync: duplicate node id %r; replacing with latest",
                    node_id,
                )
                graph.remove_node(node_id)
            graph.add_node(node)

    # ------------------------------------------------------------------
    # Step 3: Add operator nodes and edges from operator.mappings
    # ------------------------------------------------------------------
    for op in operators:
        if not isinstance(op, dict):
            continue
        op_id = _safe_str(op.get("id", ""), 256)
        if not op_id:
            continue

        op_node_id = f"op:{op_id}"
        op_label = _safe_str(op.get("label", op.get("name", op_id)), 256)
        op_node = GraphNode(
            id=op_node_id,
            kind=NodeKind.OPERATOR,
            label=op_label,
            track_id=None,
        )
        if op_node_id in {n.id for n in graph.nodes()}:
            _LOG.warning(
                "graph_sync: duplicate operator node %r; replacing", op_node_id
            )
            graph.remove_node(op_node_id)
        graph.add_node(op_node)

        # Process mappings → edges to effect nodes
        for mapping in op.get("mappings", []):
            if not isinstance(mapping, dict):
                continue

            target_effect_id = _safe_str(
                mapping.get("target_effect_id", mapping.get("targetEffectId", "")),
                256,
            )
            target_param = _safe_str(
                mapping.get("target_param_key", mapping.get("targetParamKey", "")),
                256,
            )

            if not target_effect_id or not target_param:
                continue

            # Find which track owns this effect
            dst_node_id: str | None = None
            for track_id in chain_by_track:
                k = (str(track_id), target_effect_id)
                if k in effect_params:
                    dst_node_id = f"fx:{track_id}:{target_effect_id}"
                    break

            if dst_node_id is None:
                _LOG.warning(
                    "graph_sync: operator %r mapping targets unknown effect %r"
                    " — orphan edge dropped",
                    op_id,
                    target_effect_id,
                )
                continue

            # Validate the edge endpoint is in the graph
            dst_node = graph.get_node(dst_node_id)
            if dst_node is None:
                _LOG.warning(
                    "graph_sync: dst node %r not in graph — orphan edge dropped",
                    dst_node_id,
                )
                continue

            raw_depth = mapping.get("depth", mapping.get("amount", 1.0))
            try:
                depth = float(raw_depth)
            except (TypeError, ValueError):
                depth = 1.0
            amount = _clamp_amount(depth)

            # Deterministic edge id
            edge_id = f"op-edge:{op_id}:{target_effect_id}:{target_param}"

            # Skip duplicate edge ids silently (last-wins via remove+add would
            # change semantics; instead skip to keep first occurrence).
            if graph.get_edge(edge_id) is not None:
                continue

            edge = GraphEdge(
                id=edge_id,
                src_id=op_node_id,
                dst_id=dst_node_id,
                dst_param=target_param,
                amount=amount,
            )
            graph.add_edge(edge)

    # ------------------------------------------------------------------
    # Step 4: Add lane nodes and edges (lane → param)
    # ------------------------------------------------------------------
    for track_id, lanes in lanes_by_track.items():
        for lane_dict in lanes:
            if not isinstance(lane_dict, dict):
                continue
            lane_id = _safe_str(
                lane_dict.get("laneId", lane_dict.get("lane_id", "")), 256
            )
            if not lane_id:
                continue

            target_effect_id = _safe_str(
                lane_dict.get("effectId", lane_dict.get("effect_id", "")), 256
            )
            target_param = _safe_str(
                lane_dict.get("paramKey", lane_dict.get("param_key", "")), 256
            )

            # Add lane node
            lane_node_id = f"lane:{track_id}:{lane_id}"
            lane_label = _safe_str(
                lane_dict.get("label", lane_dict.get("name", lane_id)), 256
            )
            lane_node = GraphNode(
                id=lane_node_id,
                kind=NodeKind.LANE,
                label=lane_label,
                track_id=str(track_id),
            )
            if lane_node_id in {n.id for n in graph.nodes()}:
                _LOG.warning(
                    "graph_sync: duplicate lane node %r; replacing", lane_node_id
                )
                graph.remove_node(lane_node_id)
            graph.add_node(lane_node)

            # Edge: lane → effect.param (amount = 1.0 for lanes)
            if not target_effect_id or not target_param:
                # Lane with no target — node added but no edge
                continue

            dst_node_id = f"fx:{track_id}:{target_effect_id}"
            if graph.get_node(dst_node_id) is None:
                _LOG.warning(
                    "graph_sync: lane %r targets unknown effect %r on track %r"
                    " — orphan edge dropped",
                    lane_id,
                    target_effect_id,
                    track_id,
                )
                continue

            edge_id = (
                f"lane-edge:{track_id}:{lane_id}:{target_effect_id}:{target_param}"
            )
            if graph.get_edge(edge_id) is not None:
                continue

            edge = GraphEdge(
                id=edge_id,
                src_id=lane_node_id,
                dst_id=dst_node_id,
                dst_param=target_param,
                amount=1.0,
            )
            graph.add_edge(edge)

    return graph


def serialize_graph(graph: RoutingGraph) -> dict:
    """Serialize a RoutingGraph to the wire format for the ZMQ reply.

    Returns a dict with keys:
        nodes: list of node dicts (id, kind, label, trackId)
        edges: list of edge dicts (id, srcId, dstId, dstParam, amount)
        hasCycle: bool
        cycleNodeIds: list[str] (non-empty only when hasCycle is True)
    """
    raw = graph.to_dict()
    has_cycle = graph.has_cycle()

    # Compute cycle node ids when a cycle exists (DFS coloring)
    cycle_node_ids: list[str] = []
    if has_cycle:
        cycle_node_ids = _find_cycle_node_ids(graph)

    # Convert snake_case to camelCase for IPC
    nodes_out = [
        {
            "id": n["id"],
            "kind": n["kind"],
            "label": n["label"],
            "trackId": n.get("track_id"),
        }
        for n in raw["nodes"]
    ]
    edges_out = [
        {
            "id": e["id"],
            "srcId": e["src_id"],
            "dstId": e["dst_id"],
            "dstParam": e["dst_param"],
            "amount": e["amount"],
        }
        for e in raw["edges"]
    ]

    return {
        "nodes": nodes_out,
        "edges": edges_out,
        "hasCycle": has_cycle,
        "cycleNodeIds": cycle_node_ids,
    }


def _find_cycle_node_ids(graph: RoutingGraph) -> list[str]:
    """Return the ids of nodes involved in a cycle (DFS coloring)."""
    edges = graph.edges()
    adj: dict[str, list[str]] = {}
    for e in edges:
        adj.setdefault(e.src_id, []).append(e.dst_id)

    visited: set[str] = set()
    in_stack: set[str] = set()
    cycle_nodes: set[str] = set()

    def dfs(node_id: str) -> bool:
        if node_id in in_stack:
            cycle_nodes.add(node_id)
            return True
        if node_id in visited:
            return False
        visited.add(node_id)
        in_stack.add(node_id)
        for nxt in adj.get(node_id, []):
            if dfs(nxt):
                cycle_nodes.add(node_id)
        in_stack.discard(node_id)
        return node_id in cycle_nodes

    for node in graph.nodes():
        if node.id not in visited:
            dfs(node.id)

    return sorted(cycle_nodes)
