"""I3 Inline Probe + Action Menu (Vision PRD).

Surface C: a context menu (right-click) on any param/effect surface
that exposes structured actions:

  - Reveal in routing canvas (jump to that node in I2)
  - Copy modulation route shortcut
  - Add modulation source… (opens lane picker)
  - Show in inspector track (jump to I1 + scroll to row)
  - Disconnect all incoming routes
  - Set value to default

Each action is a pure function `(action_id, context, registry) -> ActionResult`.
The frontend builds the menu by asking `list_actions_for(context)` and
dispatching via `invoke_action(action_id, context)`. Backend owns the
business logic; the frontend just renders.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass, field
from enum import Enum
from typing import Callable, Optional

from .routing_graph import RoutingGraph, global_routing_graph


class ActionContextKind(str, Enum):
    EFFECT = "effect"
    PARAM = "param"
    LANE = "lane"
    OPERATOR = "operator"
    PAD = "pad"


@dataclass(frozen=True)
class ActionContext:
    """What the user right-clicked. Drives which actions are eligible."""

    kind: ActionContextKind
    node_id: str
    param_path: Optional[str] = None
    track_id: Optional[str] = None


@dataclass(frozen=True)
class ActionResult:
    """Outcome of invoking an action."""

    ok: bool
    message: str = ""
    # Optional structured response (e.g., {jump_to_node: 'lane-A'} for "reveal in canvas")
    payload: dict = field(default_factory=dict)


@dataclass(frozen=True)
class ActionDescriptor:
    """One menu-item entry."""

    id: str
    label: str
    eligible_for: frozenset[ActionContextKind]
    handler: Callable[[ActionContext, RoutingGraph], ActionResult]
    # Optional: shortcut hint shown in the menu
    shortcut: str = ""


# ---------------------------------------------------------------------------
# Standard action handlers
# ---------------------------------------------------------------------------


def _reveal_in_canvas(ctx: ActionContext, graph: RoutingGraph) -> ActionResult:
    node = graph.get_node(ctx.node_id)
    if node is None:
        return ActionResult(
            ok=False, message=f"node {ctx.node_id!r} not in routing graph"
        )
    return ActionResult(
        ok=True,
        message=f"jump to {node.label!r}",
        payload={"jump_to_node": node.id, "node_kind": node.kind.value},
    )


def _disconnect_all_incoming(ctx: ActionContext, graph: RoutingGraph) -> ActionResult:
    edges = graph.edges_to(ctx.node_id)
    removed = 0
    for e in edges:
        if graph.remove_edge(e.id):
            removed += 1
    return ActionResult(
        ok=True,
        message=f"removed {removed} incoming routes",
        payload={"removed_count": removed},
    )


def _disconnect_all_outgoing(ctx: ActionContext, graph: RoutingGraph) -> ActionResult:
    edges = graph.edges_from(ctx.node_id)
    removed = 0
    for e in edges:
        if graph.remove_edge(e.id):
            removed += 1
    return ActionResult(
        ok=True,
        message=f"removed {removed} outgoing routes",
        payload={"removed_count": removed},
    )


def _show_in_inspector_track(ctx: ActionContext, graph: RoutingGraph) -> ActionResult:
    if ctx.track_id is None:
        return ActionResult(ok=False, message="action requires a track context")
    return ActionResult(
        ok=True,
        message=f"focus inspector track {ctx.track_id}",
        payload={"focus_track_id": ctx.track_id, "highlight_node_id": ctx.node_id},
    )


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------


class InlineActionRegistry:
    """Thread-safe registry of inline-probe menu actions.

    Comes preloaded with the standard actions; effects can add their own.
    """

    def __init__(self) -> None:
        self._actions: dict[str, ActionDescriptor] = {}
        self._lock = threading.RLock()
        self._install_defaults()

    def _install_defaults(self) -> None:
        defaults = [
            ActionDescriptor(
                id="reveal_in_canvas",
                label="Reveal in routing canvas",
                eligible_for=frozenset(
                    {
                        ActionContextKind.EFFECT,
                        ActionContextKind.LANE,
                        ActionContextKind.OPERATOR,
                        ActionContextKind.PARAM,
                    }
                ),
                handler=_reveal_in_canvas,
                shortcut="Cmd+Shift+I",
            ),
            ActionDescriptor(
                id="disconnect_all_incoming",
                label="Disconnect all incoming routes",
                eligible_for=frozenset(
                    {
                        ActionContextKind.EFFECT,
                        ActionContextKind.PARAM,
                    }
                ),
                handler=_disconnect_all_incoming,
            ),
            ActionDescriptor(
                id="disconnect_all_outgoing",
                label="Disconnect all outgoing routes",
                eligible_for=frozenset(
                    {
                        ActionContextKind.LANE,
                        ActionContextKind.OPERATOR,
                    }
                ),
                handler=_disconnect_all_outgoing,
            ),
            ActionDescriptor(
                id="show_in_inspector_track",
                label="Show in inspector track",
                eligible_for=frozenset(
                    {
                        ActionContextKind.EFFECT,
                        ActionContextKind.PARAM,
                    }
                ),
                handler=_show_in_inspector_track,
            ),
        ]
        for d in defaults:
            self._actions[d.id] = d

    def register(self, action: ActionDescriptor) -> None:
        with self._lock:
            self._actions[action.id] = action

    def unregister(self, action_id: str) -> bool:
        with self._lock:
            return self._actions.pop(action_id, None) is not None

    def list_actions_for(self, ctx: ActionContext) -> list[ActionDescriptor]:
        with self._lock:
            return [d for d in self._actions.values() if ctx.kind in d.eligible_for]

    def invoke(
        self,
        action_id: str,
        ctx: ActionContext,
        graph: Optional[RoutingGraph] = None,
    ) -> ActionResult:
        with self._lock:
            descriptor = self._actions.get(action_id)
        if descriptor is None:
            return ActionResult(ok=False, message=f"unknown action: {action_id!r}")
        if ctx.kind not in descriptor.eligible_for:
            return ActionResult(
                ok=False,
                message=f"action {action_id!r} not eligible for context {ctx.kind.value!r}",
            )
        try:
            return descriptor.handler(ctx, graph or global_routing_graph())
        except Exception as exc:  # noqa: BLE001
            return ActionResult(ok=False, message=f"{type(exc).__name__}: {exc}")

    def action_count(self) -> int:
        with self._lock:
            return len(self._actions)


_GLOBAL: Optional[InlineActionRegistry] = None


def global_inline_actions() -> InlineActionRegistry:
    global _GLOBAL
    if _GLOBAL is None:
        _GLOBAL = InlineActionRegistry()
    return _GLOBAL


def reset_global_inline_actions_for_testing() -> None:
    global _GLOBAL
    _GLOBAL = None
