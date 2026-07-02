"""Tests for backend/src/inspector/graph_sync.py (P6.9).

Named tests (from packet spec):
  test_build_graph_from_operators_modroutes
  test_build_graph_from_automation_lanes
  test_node_ids_deterministic
  test_edge_amount_clamped_from_mapping
  test_routing_graph_get_zmq_roundtrip
  test_edge_update_maps_back_to_operator_mapping
  test_edge_update_rejects_out_of_range          (negative)
  test_edge_update_unknown_edge_id_rejected      (negative)
  test_orphan_edge_to_missing_target_dropped_with_warning  (negative)
  test_cycle_flag_in_response
  test_empty_project_empty_graph                 (negative)
  test_build_200_nodes_500_edges_under_50ms      (perf, median-of-5)
  test_reply_size_500_edges_under_256kib
"""

from __future__ import annotations

import json
import statistics
import time
import uuid
import warnings

import pytest

from inspector.graph_sync import build_graph_from_project, serialize_graph
from inspector.routing_graph import NodeKind


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_operator(op_id: str, mappings: list[dict], label: str = "") -> dict:
    return {
        "id": op_id,
        "label": label or op_id,
        "is_enabled": True,
        "mappings": mappings,
    }


def _make_effect(effect_id: str, params: dict | None = None) -> dict:
    return {
        "effect_id": effect_id,
        "params": params or {"amount": 0.5},
    }


def _make_lane(
    lane_id: str,
    effect_id: str = "",
    param_key: str = "",
    label: str = "",
) -> dict:
    return {
        "laneId": lane_id,
        "effectId": effect_id,
        "paramKey": param_key,
        "label": label or lane_id,
    }


def _make_mapping(
    target_effect_id: str, target_param_key: str, depth: float = 1.0
) -> dict:
    return {
        "target_effect_id": target_effect_id,
        "target_param_key": target_param_key,
        "depth": depth,
    }


# ---------------------------------------------------------------------------
# Core build tests
# ---------------------------------------------------------------------------


def test_build_graph_from_operators_modroutes():
    """Operator mappings produce operator nodes and edges to effect nodes."""
    chain_by_track = {
        "t1": [_make_effect("fx-blur", {"radius": 10.0})],
    }
    operators = [
        _make_operator(
            "lfo1",
            [_make_mapping("fx-blur", "radius", depth=0.8)],
        )
    ]
    graph = build_graph_from_project(operators, {}, chain_by_track)

    node_ids = {n.id for n in graph.nodes()}
    assert "op:lfo1" in node_ids
    assert "fx:t1:fx-blur" in node_ids

    edges = graph.edges()
    assert len(edges) == 1
    edge = edges[0]
    assert edge.src_id == "op:lfo1"
    assert edge.dst_id == "fx:t1:fx-blur"
    assert edge.dst_param == "radius"
    assert abs(edge.amount - 0.8) < 1e-9


def test_build_graph_from_automation_lanes():
    """Automation lanes produce lane nodes and edges to effect nodes."""
    chain_by_track = {
        "t1": [_make_effect("fx-hue", {"shift": 0.0})],
    }
    lanes_by_track = {
        "t1": [_make_lane("lane-A", "fx-hue", "shift")],
    }
    graph = build_graph_from_project([], lanes_by_track, chain_by_track)

    node_ids = {n.id for n in graph.nodes()}
    assert "lane:t1:lane-A" in node_ids
    assert "fx:t1:fx-hue" in node_ids

    edges = graph.edges()
    assert len(edges) == 1
    edge = edges[0]
    assert edge.src_id == "lane:t1:lane-A"
    assert edge.dst_id == "fx:t1:fx-hue"
    assert edge.amount == 1.0


def test_node_ids_deterministic():
    """Calling build_graph_from_project twice with the same input → same ids."""
    chain_by_track = {
        "t1": [_make_effect("fx-blur", {"radius": 5.0})],
        "t2": [_make_effect("fx-grain", {"intensity": 0.3})],
    }
    operators = [_make_operator("op-x", [_make_mapping("fx-blur", "radius")])]
    lanes_by_track = {"t2": [_make_lane("lane-1", "fx-grain", "intensity")]}

    graph1 = build_graph_from_project(operators, lanes_by_track, chain_by_track)
    graph2 = build_graph_from_project(operators, lanes_by_track, chain_by_track)

    ids1 = {n.id for n in graph1.nodes()} | {e.id for e in graph1.edges()}
    ids2 = {n.id for n in graph2.nodes()} | {e.id for e in graph2.edges()}
    assert ids1 == ids2


def test_edge_amount_clamped_from_mapping():
    """Depth values outside [-1, 1] are clamped; non-finite → 0.0."""
    chain_by_track = {"t1": [_make_effect("fx-blur", {"radius": 5.0})]}
    operators = [
        _make_operator(
            "op1",
            [
                _make_mapping("fx-blur", "radius", depth=5.0),  # → clamped to 1.0
            ],
        )
    ]
    graph = build_graph_from_project(operators, {}, chain_by_track)
    edge = graph.edges()[0]
    assert edge.amount == 1.0

    # Negative clamp
    operators2 = [
        _make_operator(
            "op2",
            [_make_mapping("fx-blur", "radius", depth=-99.0)],
        )
    ]
    graph2 = build_graph_from_project(operators2, {}, chain_by_track)
    edge2 = graph2.edges()[0]
    assert edge2.amount == -1.0


# ---------------------------------------------------------------------------
# ZMQ round-trip test (uses ZMQServer.handle_message)
# ---------------------------------------------------------------------------


def test_routing_graph_get_zmq_roundtrip():
    """routing_graph_get command returns serialized graph via handle_message."""
    from zmq_server import ZMQServer

    server = ZMQServer()
    server.running = False

    payload = {
        "cmd": "routing_graph_get",
        "_token": server.token,
        "id": str(uuid.uuid4()),
        "operators": [
            {
                "id": "lfo-1",
                "label": "LFO 1",
                "is_enabled": True,
                "mappings": [
                    {
                        "target_effect_id": "fx-blur",
                        "target_param_key": "radius",
                        "depth": 0.5,
                    }
                ],
            }
        ],
        "lanesByTrack": {
            "track-A": [{"laneId": "L1", "effectId": "fx-blur", "paramKey": "radius"}]
        },
        "chainByTrack": {
            "track-A": [{"effect_id": "fx-blur", "params": {"radius": 5.0}}]
        },
    }

    result = server.handle_message(payload)

    assert result["ok"] is True, result.get("error")
    assert isinstance(result["nodes"], list)
    assert isinstance(result["edges"], list)
    assert "hasCycle" in result

    node_ids = {n["id"] for n in result["nodes"]}
    assert "op:lfo-1" in node_ids
    assert "fx:track-A:fx-blur" in node_ids
    assert "lane:track-A:L1" in node_ids

    # Edge from operator + edge from lane = 2 edges
    assert len(result["edges"]) == 2

    server.close()


# ---------------------------------------------------------------------------
# Edge update tests
# ---------------------------------------------------------------------------


def test_edge_update_maps_back_to_operator_mapping():
    """routing_edge_update returns operatorId, targetEffectId, targetParamKey."""
    from zmq_server import ZMQServer

    server = ZMQServer()
    server.running = False

    payload = {
        "cmd": "routing_edge_update",
        "_token": server.token,
        "id": str(uuid.uuid4()),
        "edgeId": "op-edge:lfo-1:fx-blur:radius",
        "amount": 0.75,
        "operators": [
            {
                "id": "lfo-1",
                "is_enabled": True,
                "mappings": [
                    {
                        "target_effect_id": "fx-blur",
                        "target_param_key": "radius",
                        "depth": 0.5,
                    }
                ],
            }
        ],
        "lanesByTrack": {},
        "chainByTrack": {
            "track-A": [{"effect_id": "fx-blur", "params": {"radius": 5.0}}]
        },
    }

    result = server.handle_message(payload)

    assert result["ok"] is True, result.get("error")
    assert result["edgeId"] == "op-edge:lfo-1:fx-blur:radius"
    assert abs(result["amount"] - 0.75) < 1e-9
    assert result["operatorId"] == "lfo-1"
    assert result["targetEffectId"] == "fx-blur"
    assert result["targetParamKey"] == "radius"

    server.close()


def test_edge_update_rejects_out_of_range():
    """amount outside [-1, 1] → ok: False."""
    from zmq_server import ZMQServer

    server = ZMQServer()
    server.running = False

    for bad_amount in [1.5, -2.0, 999.0]:
        payload = {
            "cmd": "routing_edge_update",
            "_token": server.token,
            "id": str(uuid.uuid4()),
            "edgeId": "op-edge:lfo-1:fx-blur:radius",
            "amount": bad_amount,
            "operators": [
                {
                    "id": "lfo-1",
                    "is_enabled": True,
                    "mappings": [
                        {
                            "target_effect_id": "fx-blur",
                            "target_param_key": "radius",
                            "depth": 0.5,
                        }
                    ],
                }
            ],
            "lanesByTrack": {},
            "chainByTrack": {
                "track-A": [{"effect_id": "fx-blur", "params": {"radius": 5.0}}]
            },
        }
        result = server.handle_message(payload)
        assert result["ok"] is False, f"Expected failure for amount={bad_amount}"

    server.close()


def test_edge_update_unknown_edge_id_rejected():
    """edge id not present in current project state → ok: False."""
    from zmq_server import ZMQServer

    server = ZMQServer()
    server.running = False

    payload = {
        "cmd": "routing_edge_update",
        "_token": server.token,
        "id": str(uuid.uuid4()),
        "edgeId": "op-edge:nonexistent-op:fx-blur:radius",
        "amount": 0.5,
        "operators": [],  # no operators → edge won't exist
        "lanesByTrack": {},
        "chainByTrack": {
            "track-A": [{"effect_id": "fx-blur", "params": {"radius": 5.0}}]
        },
    }

    result = server.handle_message(payload)
    assert result["ok"] is False
    assert "not found" in result.get("error", "").lower() or "error" in result

    server.close()


# ---------------------------------------------------------------------------
# Orphan edge negative test
# ---------------------------------------------------------------------------


def test_orphan_edge_to_missing_target_dropped_with_warning():
    """Mapping targeting a non-existent effect is dropped; graph still builds."""
    import logging

    chain_by_track = {
        "t1": [_make_effect("fx-blur", {"radius": 5.0})],
    }
    operators = [
        _make_operator(
            "lfo1",
            [
                _make_mapping("fx-blur", "radius", 0.5),  # valid
                _make_mapping("nonexistent-effect", "param", 0.5),  # orphan
            ],
        )
    ]

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        # Capture log warnings instead
        import logging as _log

        log_messages = []

        class _Capture(logging.Handler):
            def emit(self, record):
                log_messages.append(record.getMessage())

        h = _Capture()
        logger = _log.getLogger("inspector.graph_sync")
        logger.addHandler(h)
        try:
            graph = build_graph_from_project(operators, {}, chain_by_track)
        finally:
            logger.removeHandler(h)

    # Graph should build successfully
    node_ids = {n.id for n in graph.nodes()}
    assert "op:lfo1" in node_ids
    assert "fx:t1:fx-blur" in node_ids

    # Only 1 edge (the valid one); the orphan is dropped
    edges = graph.edges()
    assert len(edges) == 1
    assert edges[0].dst_id == "fx:t1:fx-blur"

    # A warning was logged
    assert any(
        "orphan" in m.lower() or "nonexistent" in m.lower() for m in log_messages
    )


# ---------------------------------------------------------------------------
# Cycle detection test
# ---------------------------------------------------------------------------


def test_cycle_flag_in_response():
    """hasCycle is True when the graph contains a cycle."""
    from inspector.routing_graph import GraphEdge, GraphNode, RoutingGraph
    from inspector.graph_sync import serialize_graph

    # Build a graph with a cycle manually (build_graph_from_project can't create
    # cycles from real operator→effect topology since ops → effects are DAG by design;
    # test the serialize_graph + has_cycle path directly via RoutingGraph API).
    g = RoutingGraph()
    n_a = GraphNode(id="a", kind=NodeKind.OPERATOR, label="A")
    n_b = GraphNode(id="b", kind=NodeKind.EFFECT, label="B")
    g.add_node(n_a)
    g.add_node(n_b)
    # a → b
    g.add_edge(GraphEdge(id="e1", src_id="a", dst_id="b", dst_param="p", amount=1.0))
    # b → a (cycle)
    g.add_edge(GraphEdge(id="e2", src_id="b", dst_id="a", dst_param="q", amount=1.0))

    payload = serialize_graph(g)
    assert payload["hasCycle"] is True
    assert len(payload["cycleNodeIds"]) > 0

    # Non-cycle graph → False
    g2 = RoutingGraph()
    g2.add_node(GraphNode(id="x", kind=NodeKind.OPERATOR, label="X"))
    g2.add_node(GraphNode(id="y", kind=NodeKind.EFFECT, label="Y"))
    g2.add_edge(GraphEdge(id="e3", src_id="x", dst_id="y", dst_param="p", amount=0.5))
    p2 = serialize_graph(g2)
    assert p2["hasCycle"] is False
    assert p2["cycleNodeIds"] == []


# ---------------------------------------------------------------------------
# Empty-project negative test
# ---------------------------------------------------------------------------


def test_empty_project_empty_graph():
    """Zero operators + zero lanes → {nodes: [], edges: [], hasCycle: False}."""
    graph = build_graph_from_project([], {}, {})
    payload = serialize_graph(graph)

    assert payload["nodes"] == []
    assert payload["edges"] == []
    assert payload["hasCycle"] is False


# ---------------------------------------------------------------------------
# Performance tests
# ---------------------------------------------------------------------------


def _build_large_fixture(n_effects: int, n_edges: int):
    """Build a fixture with n_effects effects and n_edges operator→effect edges."""
    chain_by_track: dict[str, list[dict]] = {}
    effects_per_track = max(1, n_effects // 10)
    for t_idx in range(10):
        track_id = f"track-{t_idx}"
        chain = []
        for e_idx in range(effects_per_track):
            eid = f"fx-{t_idx}-{e_idx}"
            chain.append({"effect_id": eid, "params": {"amount": 0.5}})
        chain_by_track[track_id] = chain

    # Build operators covering n_edges mappings
    operators = []
    edge_count = 0
    effect_list = [
        (tid, f"fx-{int(tid.split('-')[1])}-{e}")
        for tid in chain_by_track
        for e in range(effects_per_track)
    ]
    mappings_per_op = min(32, max(1, n_edges // max(1, n_effects // 5)))
    for op_idx in range(max(1, n_edges // mappings_per_op)):
        mappings = []
        for m in range(mappings_per_op):
            if edge_count >= n_edges:
                break
            target = effect_list[edge_count % len(effect_list)]
            mappings.append(
                {
                    "target_effect_id": target[1],
                    "target_param_key": "amount",
                    "depth": 0.5,
                }
            )
            edge_count += 1
        operators.append(
            {
                "id": f"op-{op_idx}",
                "is_enabled": True,
                "mappings": mappings,
            }
        )

    return operators, chain_by_track


def test_build_200_nodes_500_edges_under_50ms():
    """build_graph_from_project for ~200 nodes / ~500 edges finishes < 50ms (median-of-5)."""
    operators, chain_by_track = _build_large_fixture(n_effects=100, n_edges=500)

    times_ms = []
    for _ in range(5):
        t0 = time.perf_counter()
        graph = build_graph_from_project(operators, {}, chain_by_track)
        times_ms.append((time.perf_counter() - t0) * 1000)

    median_ms = statistics.median(times_ms)
    node_count = len(graph.nodes())
    edge_count = len(graph.edges())

    print(
        f"\nPerf: {node_count} nodes / {edge_count} edges "
        f"— median build time: {median_ms:.2f}ms"
    )
    assert median_ms < 50.0, (
        f"build_graph_from_project took {median_ms:.2f}ms median (limit: 50ms)"
    )


def test_reply_size_500_edges_under_256kib():
    """Serialized routing_graph_get reply for ~500 edges is under 256 KiB."""
    operators, chain_by_track = _build_large_fixture(n_effects=100, n_edges=500)

    graph = build_graph_from_project(operators, {}, chain_by_track)
    payload = serialize_graph(graph)

    serialized = json.dumps(payload)
    size_bytes = len(serialized.encode("utf-8"))
    size_kib = size_bytes / 1024

    print(f"\nReply size: {size_kib:.1f} KiB for {len(payload['edges'])} edges")
    assert size_bytes < 256 * 1024, (
        f"Reply size {size_kib:.1f} KiB exceeds 256 KiB limit"
    )
