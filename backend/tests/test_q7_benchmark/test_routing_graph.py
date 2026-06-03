"""Tests for I2 Routing Canvas backend graph (PR #24)."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

BACKEND_SRC = Path(__file__).resolve().parents[2] / "src"
if str(BACKEND_SRC) not in sys.path:
    sys.path.insert(0, str(BACKEND_SRC))

from inspector.routing_graph import (
    GraphEdge,
    GraphNode,
    NodeKind,
    RoutingGraph,
    RoutingGraphError,
    global_routing_graph,
    reset_global_routing_graph_for_testing,
)


@pytest.fixture(autouse=True)
def _reset():
    reset_global_routing_graph_for_testing()
    yield
    reset_global_routing_graph_for_testing()


def _populate_simple_graph() -> RoutingGraph:
    g = RoutingGraph()
    g.add_node(GraphNode(id="lane-A", kind=NodeKind.LANE, label="A"))
    g.add_node(GraphNode(id="effect-1", kind=NodeKind.EFFECT, label="fx-blur"))
    g.add_edge(
        GraphEdge(
            id="e1",
            src_id="lane-A",
            dst_id="effect-1",
            dst_param="radius",
            amount=0.5,
        )
    )
    return g


# ---- Node operations ----


@pytest.mark.smoke
def test_empty_graph():
    g = RoutingGraph()
    assert g.nodes() == []
    assert g.edges() == []


@pytest.mark.smoke
def test_add_node():
    g = RoutingGraph()
    n = GraphNode(id="n1", kind=NodeKind.EFFECT, label="x")
    g.add_node(n)
    assert g.get_node("n1") == n
    assert len(g.nodes()) == 1


@pytest.mark.smoke
def test_add_node_duplicate_raises():
    g = RoutingGraph()
    g.add_node(GraphNode(id="n1", kind=NodeKind.EFFECT, label="x"))
    with pytest.raises(RoutingGraphError, match="already exists"):
        g.add_node(GraphNode(id="n1", kind=NodeKind.EFFECT, label="y"))


@pytest.mark.smoke
def test_remove_node_returns_true():
    g = RoutingGraph()
    g.add_node(GraphNode(id="n1", kind=NodeKind.EFFECT, label="x"))
    assert g.remove_node("n1") is True
    assert g.get_node("n1") is None


@pytest.mark.smoke
def test_remove_node_missing_returns_false():
    g = RoutingGraph()
    assert g.remove_node("nope") is False


@pytest.mark.smoke
def test_remove_node_cascades_to_edges():
    g = _populate_simple_graph()
    g.remove_node("lane-A")
    assert g.edges() == []  # the edge was cascaded out


# ---- Edge operations ----


@pytest.mark.smoke
def test_add_edge_creates_route():
    g = _populate_simple_graph()
    edges = g.edges()
    assert len(edges) == 1
    assert edges[0].src_id == "lane-A"
    assert edges[0].dst_id == "effect-1"
    assert edges[0].amount == 0.5


@pytest.mark.smoke
def test_add_edge_with_missing_src_raises():
    g = RoutingGraph()
    g.add_node(GraphNode(id="dst", kind=NodeKind.EFFECT, label="d"))
    with pytest.raises(RoutingGraphError, match="src"):
        g.add_edge(GraphEdge(id="e", src_id="ghost", dst_id="dst", dst_param="x"))


@pytest.mark.smoke
def test_add_edge_with_missing_dst_raises():
    g = RoutingGraph()
    g.add_node(GraphNode(id="src", kind=NodeKind.LANE, label="s"))
    with pytest.raises(RoutingGraphError, match="dst"):
        g.add_edge(GraphEdge(id="e", src_id="src", dst_id="ghost", dst_param="x"))


@pytest.mark.smoke
def test_add_edge_amount_out_of_range_raises():
    g = _populate_simple_graph()
    with pytest.raises(RoutingGraphError, match="amount"):
        g.add_edge(
            GraphEdge(
                id="bad", src_id="lane-A", dst_id="effect-1", dst_param="x", amount=2.5
            )
        )


@pytest.mark.smoke
def test_remove_edge():
    g = _populate_simple_graph()
    assert g.remove_edge("e1") is True
    assert g.edges() == []


@pytest.mark.smoke
def test_remove_edge_missing_returns_false():
    g = RoutingGraph()
    assert g.remove_edge("nope") is False


@pytest.mark.smoke
def test_update_edge_amount():
    g = _populate_simple_graph()
    assert g.update_edge_amount("e1", -0.3) is True
    assert g.get_edge("e1").amount == -0.3


@pytest.mark.smoke
def test_update_edge_amount_out_of_range_raises():
    g = _populate_simple_graph()
    with pytest.raises(RoutingGraphError, match="amount"):
        g.update_edge_amount("e1", 1.5)


@pytest.mark.smoke
def test_update_missing_edge_returns_false():
    g = RoutingGraph()
    assert g.update_edge_amount("nope", 0.5) is False


# ---- Topology queries ----


@pytest.mark.smoke
def test_edges_from_filters_by_src():
    g = RoutingGraph()
    g.add_node(GraphNode(id="a", kind=NodeKind.LANE, label="a"))
    g.add_node(GraphNode(id="b", kind=NodeKind.EFFECT, label="b"))
    g.add_node(GraphNode(id="c", kind=NodeKind.EFFECT, label="c"))
    g.add_edge(GraphEdge(id="e1", src_id="a", dst_id="b", dst_param="x"))
    g.add_edge(GraphEdge(id="e2", src_id="a", dst_id="c", dst_param="y"))
    g.add_edge(GraphEdge(id="e3", src_id="b", dst_id="c", dst_param="z"))
    assert {e.id for e in g.edges_from("a")} == {"e1", "e2"}
    assert {e.id for e in g.edges_from("b")} == {"e3"}


@pytest.mark.smoke
def test_edges_to_filters_by_dst():
    g = RoutingGraph()
    g.add_node(GraphNode(id="a", kind=NodeKind.LANE, label="a"))
    g.add_node(GraphNode(id="b", kind=NodeKind.LANE, label="b"))
    g.add_node(GraphNode(id="c", kind=NodeKind.EFFECT, label="c"))
    g.add_edge(GraphEdge(id="e1", src_id="a", dst_id="c", dst_param="x"))
    g.add_edge(GraphEdge(id="e2", src_id="b", dst_id="c", dst_param="x"))
    assert {e.id for e in g.edges_to("c")} == {"e1", "e2"}


# ---- Cycle detection ----


@pytest.mark.smoke
def test_no_cycle_in_dag():
    g = _populate_simple_graph()
    assert g.has_cycle() is False


@pytest.mark.smoke
def test_self_loop_is_cycle():
    g = RoutingGraph()
    g.add_node(GraphNode(id="n", kind=NodeKind.EFFECT, label="x"))
    g.add_edge(GraphEdge(id="e", src_id="n", dst_id="n", dst_param="x"))
    assert g.has_cycle() is True


@pytest.mark.smoke
def test_two_node_cycle():
    g = RoutingGraph()
    g.add_node(GraphNode(id="a", kind=NodeKind.EFFECT, label="a"))
    g.add_node(GraphNode(id="b", kind=NodeKind.EFFECT, label="b"))
    g.add_edge(GraphEdge(id="e1", src_id="a", dst_id="b", dst_param="x"))
    g.add_edge(GraphEdge(id="e2", src_id="b", dst_id="a", dst_param="y"))
    assert g.has_cycle() is True


@pytest.mark.smoke
def test_three_node_cycle():
    g = RoutingGraph()
    for nid in ("a", "b", "c"):
        g.add_node(GraphNode(id=nid, kind=NodeKind.EFFECT, label=nid))
    g.add_edge(GraphEdge(id="e1", src_id="a", dst_id="b", dst_param="x"))
    g.add_edge(GraphEdge(id="e2", src_id="b", dst_id="c", dst_param="x"))
    g.add_edge(GraphEdge(id="e3", src_id="c", dst_id="a", dst_param="x"))
    assert g.has_cycle() is True


# ---- Serialization ----


@pytest.mark.smoke
def test_to_dict_shape():
    g = _populate_simple_graph()
    d = g.to_dict()
    assert set(d.keys()) == {"nodes", "edges"}
    assert len(d["nodes"]) == 2
    assert len(d["edges"]) == 1
    assert d["edges"][0]["src_id"] == "lane-A"


@pytest.mark.smoke
def test_load_dict_round_trip():
    g1 = _populate_simple_graph()
    d = g1.to_dict()

    g2 = RoutingGraph()
    g2.load_dict(d)
    assert g2.to_dict() == d


@pytest.mark.smoke
def test_load_dict_clears_existing_state():
    g = _populate_simple_graph()
    g.load_dict({"nodes": [], "edges": []})
    assert g.nodes() == []
    assert g.edges() == []


# ---- Global singleton ----


@pytest.mark.smoke
def test_global_routing_graph_singleton():
    g1 = global_routing_graph()
    g2 = global_routing_graph()
    assert g1 is g2
