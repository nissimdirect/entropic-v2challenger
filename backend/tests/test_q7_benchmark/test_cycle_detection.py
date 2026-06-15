"""Tests for SG-5 Dynamic Cycle Detection (PR #26)."""

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
)
from safety.cycle_detection import (
    CycleReport,
    break_cycles,
    cycle_safe_edge_addition,
    detect_cycles,
)


def _nodes(g: RoutingGraph, *ids: str) -> None:
    for nid in ids:
        g.add_node(GraphNode(id=nid, kind=NodeKind.EFFECT, label=nid))


def _edge(src: str, dst: str, eid: str | None = None) -> GraphEdge:
    return GraphEdge(
        id=eid or f"{src}->{dst}",
        src_id=src,
        dst_id=dst,
        dst_param="x",
    )


# ---- Empty / acyclic ----


@pytest.mark.smoke
def test_empty_graph_no_cycles():
    g = RoutingGraph()
    result = detect_cycles(g)
    assert not result.has_cycles
    assert result.cycles == []


@pytest.mark.smoke
def test_single_edge_dag_no_cycles():
    g = RoutingGraph()
    _nodes(g, "a", "b")
    g.add_edge(_edge("a", "b"))
    assert not detect_cycles(g).has_cycles


@pytest.mark.smoke
def test_diamond_dag_no_cycles():
    g = RoutingGraph()
    _nodes(g, "a", "b", "c", "d")
    g.add_edge(_edge("a", "b"))
    g.add_edge(_edge("a", "c"))
    g.add_edge(_edge("b", "d"))
    g.add_edge(_edge("c", "d"))
    assert not detect_cycles(g).has_cycles


# ---- Self-loop ----


@pytest.mark.smoke
def test_self_loop_detected():
    g = RoutingGraph()
    _nodes(g, "n")
    g.add_edge(_edge("n", "n", eid="self"))
    result = detect_cycles(g)
    assert result.has_cycles
    assert len(result.cycles) == 1
    assert result.cycles[0].suggested_break_edge_id == "self"


# ---- 2-node cycle ----


@pytest.mark.smoke
def test_two_node_cycle_detected():
    g = RoutingGraph()
    _nodes(g, "a", "b")
    g.add_edge(_edge("a", "b", eid="e1"))
    g.add_edge(_edge("b", "a", eid="e2"))
    result = detect_cycles(g)
    assert result.has_cycles
    # Lex-smallest edge: e1
    assert result.cycles[0].suggested_break_edge_id == "e1"


# ---- 3-node cycle ----


@pytest.mark.smoke
def test_three_node_cycle_detected():
    g = RoutingGraph()
    _nodes(g, "a", "b", "c")
    g.add_edge(_edge("a", "b", eid="e2"))
    g.add_edge(_edge("b", "c", eid="e3"))
    g.add_edge(_edge("c", "a", eid="e1"))
    result = detect_cycles(g)
    assert result.has_cycles
    assert result.cycles[0].suggested_break_edge_id == "e1"


@pytest.mark.smoke
def test_three_cycle_reports_all_three_edges():
    g = RoutingGraph()
    _nodes(g, "a", "b", "c")
    g.add_edge(_edge("a", "b", eid="ab"))
    g.add_edge(_edge("b", "c", eid="bc"))
    g.add_edge(_edge("c", "a", eid="ca"))
    result = detect_cycles(g)
    cycle = result.cycles[0]
    assert set(cycle.edge_ids) == {"ab", "bc", "ca"}


# ---- Multiple distinct cycles ----


@pytest.mark.smoke
def test_two_disjoint_cycles_both_detected():
    g = RoutingGraph()
    _nodes(g, "a", "b", "c", "d")
    g.add_edge(_edge("a", "b", eid="ab"))
    g.add_edge(_edge("b", "a", eid="ba"))
    g.add_edge(_edge("c", "d", eid="cd"))
    g.add_edge(_edge("d", "c", eid="dc"))
    result = detect_cycles(g)
    assert len(result.cycles) == 2


# ---- Deduplication: don't double-report same cycle ----


@pytest.mark.smoke
def test_same_cycle_reported_once_even_when_dfs_visits_twice():
    """DFS from a OR b finds the same cycle; should report once."""
    g = RoutingGraph()
    _nodes(g, "a", "b")
    g.add_edge(_edge("a", "b", eid="e1"))
    g.add_edge(_edge("b", "a", eid="e2"))
    result = detect_cycles(g)
    assert len(result.cycles) == 1


# ---- break_cycles ----


@pytest.mark.smoke
def test_break_cycles_on_acyclic_does_nothing():
    g = RoutingGraph()
    _nodes(g, "a", "b")
    g.add_edge(_edge("a", "b"))
    removed = break_cycles(g)
    assert removed == []


@pytest.mark.smoke
def test_break_cycles_removes_min_edge():
    g = RoutingGraph()
    _nodes(g, "a", "b")
    g.add_edge(_edge("a", "b", eid="e1"))
    g.add_edge(_edge("b", "a", eid="e2"))
    removed = break_cycles(g)
    assert removed == ["e1"]
    assert not detect_cycles(g).has_cycles


@pytest.mark.smoke
def test_break_cycles_handles_multiple_cycles():
    g = RoutingGraph()
    _nodes(g, "a", "b", "c", "d")
    g.add_edge(_edge("a", "b", eid="ab"))
    g.add_edge(_edge("b", "a", eid="ba"))
    g.add_edge(_edge("c", "d", eid="cd"))
    g.add_edge(_edge("d", "c", eid="dc"))
    removed = break_cycles(g)
    assert len(removed) == 2  # one edge per cycle
    assert not detect_cycles(g).has_cycles


@pytest.mark.smoke
def test_break_cycles_max_iterations_bounded():
    """Even if break logic is buggy, max_iterations stops the loop."""
    g = RoutingGraph()
    _nodes(g, "a")
    g.add_edge(_edge("a", "a", eid="self"))
    removed = break_cycles(g, max_iterations=1)
    assert removed == ["self"]
    assert not detect_cycles(g).has_cycles


# ---- cycle_safe_edge_addition ----


@pytest.mark.smoke
def test_cycle_safe_addition_in_dag_returns_true():
    g = RoutingGraph()
    _nodes(g, "a", "b", "c")
    g.add_edge(_edge("a", "b"))
    # Adding b→c: still DAG
    candidate = _edge("b", "c", eid="new")
    assert cycle_safe_edge_addition(g, candidate) is True


@pytest.mark.smoke
def test_cycle_safe_addition_detects_would_create_cycle():
    g = RoutingGraph()
    _nodes(g, "a", "b")
    g.add_edge(_edge("a", "b"))
    # Adding b→a would create cycle
    candidate = _edge("b", "a", eid="new")
    assert cycle_safe_edge_addition(g, candidate) is False


@pytest.mark.smoke
def test_cycle_safe_addition_self_loop_unsafe():
    g = RoutingGraph()
    _nodes(g, "a")
    candidate = _edge("a", "a", eid="self")
    assert cycle_safe_edge_addition(g, candidate) is False


@pytest.mark.smoke
def test_cycle_safe_addition_does_not_modify_graph():
    """Pre-check should be read-only."""
    g = RoutingGraph()
    _nodes(g, "a", "b")
    g.add_edge(_edge("a", "b", eid="existing"))
    candidate = _edge("b", "a", eid="new")
    cycle_safe_edge_addition(g, candidate)
    # Graph state unchanged
    assert len(g.edges()) == 1
    assert g.get_edge("existing") is not None


# ---- CycleReport shape ----


@pytest.mark.smoke
def test_cycle_report_carries_all_fields():
    g = RoutingGraph()
    _nodes(g, "a", "b")
    g.add_edge(_edge("a", "b", eid="e1"))
    g.add_edge(_edge("b", "a", eid="e2"))
    result = detect_cycles(g)
    cycle = result.cycles[0]
    assert isinstance(cycle, CycleReport)
    assert cycle.is_runtime_conditional is False  # default
    assert len(cycle.edge_ids) == 2
    assert len(cycle.node_ids) == 2


# ---- suggested_break_edges ----


@pytest.mark.smoke
def test_suggested_break_edges_aggregates():
    g = RoutingGraph()
    _nodes(g, "a", "b", "c", "d")
    g.add_edge(_edge("a", "b", eid="ab"))
    g.add_edge(_edge("b", "a", eid="ba"))
    g.add_edge(_edge("c", "d", eid="cd"))
    g.add_edge(_edge("d", "c", eid="dc"))
    result = detect_cycles(g)
    breaks = result.suggested_break_edges()
    assert breaks == {"ab", "cd"}  # lex-smallest per cycle
