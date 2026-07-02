"""Tests for I3 Inline Probe action menu (PR #25)."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

BACKEND_SRC = Path(__file__).resolve().parents[2] / "src"
if str(BACKEND_SRC) not in sys.path:
    sys.path.insert(0, str(BACKEND_SRC))

from inspector.inline_actions import (
    ActionContext,
    ActionContextKind,
    ActionDescriptor,
    ActionResult,
    InlineActionRegistry,
    global_inline_actions,
    reset_global_inline_actions_for_testing,
)
from inspector.routing_graph import (
    GraphEdge,
    GraphNode,
    NodeKind,
    RoutingGraph,
)


@pytest.fixture(autouse=True)
def _reset():
    reset_global_inline_actions_for_testing()
    yield
    reset_global_inline_actions_for_testing()


def _populate_graph() -> RoutingGraph:
    g = RoutingGraph()
    g.add_node(GraphNode(id="lane-A", kind=NodeKind.LANE, label="A"))
    g.add_node(GraphNode(id="lane-B", kind=NodeKind.LANE, label="B"))
    g.add_node(
        GraphNode(id="fx-blur", kind=NodeKind.EFFECT, label="blur", track_id="t1")
    )
    g.add_edge(
        GraphEdge(id="e1", src_id="lane-A", dst_id="fx-blur", dst_param="radius")
    )
    g.add_edge(
        GraphEdge(id="e2", src_id="lane-B", dst_id="fx-blur", dst_param="radius")
    )
    return g


# ---- Defaults / registration ----


@pytest.mark.smoke
def test_registry_preloads_defaults():
    r = InlineActionRegistry()
    assert r.action_count() == 4


@pytest.mark.smoke
def test_register_custom_action():
    r = InlineActionRegistry()
    custom = ActionDescriptor(
        id="my_action",
        label="My Action",
        eligible_for=frozenset({ActionContextKind.EFFECT}),
        handler=lambda ctx, g: ActionResult(ok=True, message="ok"),
    )
    r.register(custom)
    assert r.action_count() == 5


@pytest.mark.smoke
def test_unregister_action():
    r = InlineActionRegistry()
    assert r.unregister("reveal_in_canvas") is True
    assert r.action_count() == 3


@pytest.mark.smoke
def test_unregister_missing_returns_false():
    r = InlineActionRegistry()
    assert r.unregister("nope") is False


# ---- Listing eligible actions ----


@pytest.mark.smoke
def test_list_actions_for_effect_context():
    r = InlineActionRegistry()
    ctx = ActionContext(kind=ActionContextKind.EFFECT, node_id="fx-blur")
    actions = r.list_actions_for(ctx)
    labels = {a.id for a in actions}
    assert "reveal_in_canvas" in labels
    assert "disconnect_all_incoming" in labels
    assert "show_in_inspector_track" in labels
    # Outgoing isn't eligible for effects
    assert "disconnect_all_outgoing" not in labels


@pytest.mark.smoke
def test_list_actions_for_lane_context():
    r = InlineActionRegistry()
    ctx = ActionContext(kind=ActionContextKind.LANE, node_id="lane-A")
    actions = r.list_actions_for(ctx)
    labels = {a.id for a in actions}
    assert "reveal_in_canvas" in labels
    assert "disconnect_all_outgoing" in labels
    # Incoming + show_in_inspector_track not eligible for lanes
    assert "disconnect_all_incoming" not in labels


@pytest.mark.smoke
def test_list_actions_for_param_context():
    r = InlineActionRegistry()
    ctx = ActionContext(
        kind=ActionContextKind.PARAM,
        node_id="fx-blur",
        param_path="radius",
    )
    actions = r.list_actions_for(ctx)
    labels = {a.id for a in actions}
    assert "reveal_in_canvas" in labels
    assert "disconnect_all_incoming" in labels


# ---- Invocation ----


@pytest.mark.smoke
def test_invoke_unknown_action_returns_error():
    r = InlineActionRegistry()
    ctx = ActionContext(kind=ActionContextKind.EFFECT, node_id="x")
    result = r.invoke("nope", ctx)
    assert result.ok is False
    assert "unknown action" in result.message


@pytest.mark.smoke
def test_invoke_with_ineligible_context_returns_error():
    r = InlineActionRegistry()
    # disconnect_all_outgoing is for LANE/OPERATOR; passing EFFECT is wrong
    ctx = ActionContext(kind=ActionContextKind.EFFECT, node_id="fx-blur")
    result = r.invoke("disconnect_all_outgoing", ctx)
    assert result.ok is False
    assert "not eligible" in result.message


@pytest.mark.smoke
def test_invoke_reveal_in_canvas_finds_node():
    r = InlineActionRegistry()
    g = _populate_graph()
    ctx = ActionContext(kind=ActionContextKind.EFFECT, node_id="fx-blur")
    result = r.invoke("reveal_in_canvas", ctx, graph=g)
    assert result.ok is True
    assert result.payload["jump_to_node"] == "fx-blur"
    assert result.payload["node_kind"] == "effect"


@pytest.mark.smoke
def test_invoke_reveal_in_canvas_missing_node():
    r = InlineActionRegistry()
    g = RoutingGraph()
    ctx = ActionContext(kind=ActionContextKind.EFFECT, node_id="ghost")
    result = r.invoke("reveal_in_canvas", ctx, graph=g)
    assert result.ok is False


@pytest.mark.smoke
def test_invoke_disconnect_all_incoming_clears_routes():
    r = InlineActionRegistry()
    g = _populate_graph()
    assert len(g.edges_to("fx-blur")) == 2
    ctx = ActionContext(kind=ActionContextKind.EFFECT, node_id="fx-blur")
    result = r.invoke("disconnect_all_incoming", ctx, graph=g)
    assert result.ok is True
    assert result.payload["removed_count"] == 2
    assert g.edges_to("fx-blur") == []


@pytest.mark.smoke
def test_invoke_disconnect_all_outgoing_clears_lane_routes():
    r = InlineActionRegistry()
    g = _populate_graph()
    assert len(g.edges_from("lane-A")) == 1
    ctx = ActionContext(kind=ActionContextKind.LANE, node_id="lane-A")
    result = r.invoke("disconnect_all_outgoing", ctx, graph=g)
    assert result.ok is True
    assert result.payload["removed_count"] == 1


@pytest.mark.smoke
def test_invoke_show_in_inspector_track_requires_track_id():
    r = InlineActionRegistry()
    ctx = ActionContext(kind=ActionContextKind.EFFECT, node_id="fx-blur", track_id=None)
    result = r.invoke("show_in_inspector_track", ctx)
    assert result.ok is False
    assert "track" in result.message.lower()


@pytest.mark.smoke
def test_invoke_show_in_inspector_track_with_track_id():
    r = InlineActionRegistry()
    ctx = ActionContext(kind=ActionContextKind.EFFECT, node_id="fx-blur", track_id="t1")
    result = r.invoke("show_in_inspector_track", ctx)
    assert result.ok is True
    assert result.payload["focus_track_id"] == "t1"


@pytest.mark.smoke
def test_invoke_handler_exception_returns_error():
    r = InlineActionRegistry()
    custom = ActionDescriptor(
        id="boom",
        label="boom",
        eligible_for=frozenset({ActionContextKind.EFFECT}),
        handler=lambda ctx, g: (_ for _ in ()).throw(RuntimeError("boom!")),
    )
    r.register(custom)
    ctx = ActionContext(kind=ActionContextKind.EFFECT, node_id="x")
    result = r.invoke("boom", ctx)
    assert result.ok is False
    assert "RuntimeError" in result.message


# ---- Sentinels ----


@pytest.mark.smoke
def test_action_context_kinds_complete():
    assert {k.value for k in ActionContextKind} == {
        "effect",
        "param",
        "lane",
        "operator",
        "pad",
    }


@pytest.mark.smoke
def test_global_singleton():
    g1 = global_inline_actions()
    g2 = global_inline_actions()
    assert g1 is g2


@pytest.mark.smoke
def test_action_descriptor_carries_shortcut():
    r = InlineActionRegistry()
    ctx = ActionContext(kind=ActionContextKind.EFFECT, node_id="fx-blur")
    actions = r.list_actions_for(ctx)
    reveal = next(a for a in actions if a.id == "reveal_in_canvas")
    assert reveal.shortcut == "Cmd+Shift+I"
