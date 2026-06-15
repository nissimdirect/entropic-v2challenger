"""SG-5 part A integration: runtime-aware toposort + deterministic cycle-break.

SPEC-3 §4.2 (A+B), §4.3, §4.4, §4.5. Verifies that:

- the static fast path (`_topological_sort`) STILL raises on a cycle (INJ-2
  regression guard — DO-NOT-TOUCH raise semantics);
- `topological_sort_with_runtime` no longer degrades to declaration order on a
  cycle, but breaks it deterministically via `safety.cycle_detection.break_cycles`;
- the break is the lex-smallest edge id, identical across 100 repeated sorts;
- the operators→RoutingGraph adapter preserves ALL edges (roundtrip);
- static-only graphs bypass to the fast path unchanged;
- a runtime-conditional edge is evaluated BEFORE the static snapshot.
"""

from __future__ import annotations

import pytest

from modulation.engine import (
    ModulationCycleError,
    SignalEngine,
    _topological_sort,
    topological_sort_with_runtime,
)
from modulation.graph_adapter import (
    operators_to_routing_graph,
    remaining_source_edges,
)
from modulation.runtime_context import RuntimeContext
from safety.cycle_detection import break_cycles, detect_cycles


def _fusion(op_id: str, *source_ids: str) -> dict:
    """An operator that reads `source_ids` via parameters.sources (Fusion shape)."""
    return {
        "id": op_id,
        "type": "fusion",
        "is_enabled": True,
        "parameters": {"sources": [{"operator_id": s} for s in source_ids]},
    }


# --- INJ-2 regression guard (SPEC-3 §4.5) -------------------------------------


def test_static_cycle_caught_by_existing_toposort() -> None:
    """DO-NOT-TOUCH: the static `_topological_sort` STILL raises on a cycle.

    SG-5 wraps + resolves the raise; it must NOT change when/how the static sort
    raises. This guards the INJ-2 contract (#150).
    """
    ops = [_fusion("a", "b"), _fusion("b", "a")]
    with pytest.raises(ModulationCycleError) as exc:
        _topological_sort(ops)
    assert set(exc.value.unresolved_ids) == {"a", "b"}


# --- deterministic break replaces declaration order (SPEC-3 §4.2 B) -----------


def test_cycle_now_breaks_deterministically_not_declaration_order() -> None:
    """A cycle no longer degrades to raw declaration order.

    The old behavior returned `operators[:MAX]` verbatim (declaration order).
    Now the cycle is broken: the edge a→b is removed, so `b` (no remaining deps)
    must evaluate before `a`. Declaration order would have been [a, b]; the
    broken order is [b, a].
    """
    ops = [_fusion("a", "b"), _fusion("b", "a")]
    out = topological_sort_with_runtime(ops)
    ids = [o["id"] for o in out]
    assert ids == ["b", "a"], f"expected broken order [b, a], got {ids}"
    # All operators are still present (none dropped).
    assert set(ids) == {"a", "b"}


def test_break_is_lex_smallest_edge() -> None:
    """`break_cycles` removes the lex-smallest edge id (determinism contract).

    Edge ids are `{src}->{dst}#{ordinal}`. For the a↔b cycle the candidates are
    `a->b#0` and `b->a#0`; min() is `a->b#0`, so a→b is removed and `a` loses its
    dependency on `b`.
    """
    ops = [_fusion("a", "b"), _fusion("b", "a")]
    graph = operators_to_routing_graph(ops)
    removed = break_cycles(graph)
    assert removed == ["a->b#0"], f"expected lex-smallest break, got {removed}"
    # After break the graph is acyclic.
    assert not detect_cycles(graph).has_cycles


# --- adapter roundtrip (SPEC-3 §4.2 A) ----------------------------------------


def test_adapter_roundtrip_preserves_all_edges() -> None:
    """operators → RoutingGraph preserves EVERY operator-to-operator edge."""
    ops = [
        _fusion("a", "b", "c"),  # two incoming edges: b→a, c→a
        _fusion("b", "c"),  # c→b
        _fusion("c"),  # no sources
    ]
    graph = operators_to_routing_graph(ops)
    # Nodes: one per operator.
    assert {n.id for n in graph.nodes()} == {"a", "b", "c"}
    # Edges (source → consumer), collapsed to (src, dst) pairs.
    edges = remaining_source_edges(graph)
    assert edges == {("b", "a"), ("c", "a"), ("c", "b")}
    # Edge count matches the source declarations exactly (no edges lost/added).
    assert len(graph.edges()) == 3


def test_adapter_roundtrip_preserves_duplicate_edges() -> None:
    """Duplicate source references roundtrip as distinct edges (no collision)."""
    ops = [_fusion("a", "b", "b"), _fusion("b")]  # a reads b TWICE
    graph = operators_to_routing_graph(ops)
    assert len(graph.edges()) == 2
    assert {e.id for e in graph.edges()} == {"b->a#0", "b->a#1"}


# --- static-only fast path (SPEC-3 §4.4) --------------------------------------


def test_static_only_graph_uses_fast_path() -> None:
    """An acyclic, runtime-free graph returns the same order as `_topological_sort`.

    With no RuntimeContext (or one with no conditional edges) the wrapper must
    produce IDENTICAL output to the existing static sort — proving the fast path
    is taken unchanged.
    """
    ops = [_fusion("consumer", "src"), _fusion("src"), _fusion("independent")]
    fast = [o["id"] for o in _topological_sort(ops)]
    via_runtime = [o["id"] for o in topological_sort_with_runtime(ops, None)]
    assert via_runtime == fast
    # Source resolves before consumer; independent keeps declaration position.
    assert via_runtime.index("src") < via_runtime.index("consumer")

    # A RuntimeContext with NO conditional edges is still the static fast path.
    ctx = RuntimeContext(frame_index=0)
    assert not ctx.has_runtime_conditional_edges
    via_empty_ctx = [o["id"] for o in topological_sort_with_runtime(ops, ctx)]
    assert via_empty_ctx == fast


# --- runtime-conditional edge evaluated before snapshot (SPEC-3 §4.3) ---------


def test_runtime_conditional_edge_evaluated_before_snapshot() -> None:
    """A runtime-conditional edge (predicate-driven) is folded in BEFORE the sort.

    No runtime edge KINDS are implemented yet, so the seam takes a predicate.
    Here a conditional edge `c → consumer` (source c must run before consumer) is
    active only when `frame_index >= 1`. When active, the snapshot must include
    the edge and order c before consumer; when inactive, it must not.
    """
    base = [_fusion("consumer"), _fusion("c")]
    # Descriptor: source c feeds consumer; predicate gates on frame_index.
    cond_edge = {"src": "c", "dst": "consumer"}

    def predicate(edge: dict, ctx: RuntimeContext) -> bool:
        return ctx.frame_index >= 1

    # Frame 0 — predicate False → edge inactive → no ordering constraint imposed.
    ctx_inactive = RuntimeContext(
        frame_index=0,
        conditional_edge_predicate=predicate,
        conditional_edges=[cond_edge],
    )
    assert ctx_inactive.active_conditional_edges() == []
    out0 = [o["id"] for o in topological_sort_with_runtime(base, ctx_inactive)]
    # No edge → declaration order preserved.
    assert out0 == ["consumer", "c"]

    # Frame 1 — predicate True → edge active → c must precede consumer.
    ctx_active = RuntimeContext(
        frame_index=1,
        conditional_edge_predicate=predicate,
        conditional_edges=[cond_edge],
    )
    assert ctx_active.active_conditional_edges() == [cond_edge]
    out1 = [o["id"] for o in topological_sort_with_runtime(base, ctx_active)]
    assert out1.index("c") < out1.index("consumer"), f"runtime edge not honored: {out1}"


# --- determinism across 100 repeated sorts (acceptance gate) ------------------


def test_break_is_deterministic_across_100_sorts() -> None:
    """Same cycle → same break + same order across 100 repeated sorts."""
    orders: set[tuple[str, ...]] = set()
    breaks: set[tuple[str, ...]] = set()
    for _ in range(100):
        ops = [_fusion("a", "b"), _fusion("b", "a")]
        orders.add(tuple(o["id"] for o in topological_sort_with_runtime(ops)))
        graph = operators_to_routing_graph(ops)
        breaks.add(tuple(break_cycles(graph)))
    assert len(orders) == 1, f"non-deterministic order: {orders}"
    assert len(breaks) == 1, f"non-deterministic break: {breaks}"


def test_three_node_cycle_breaks_deterministically() -> None:
    """A 3-node cycle a→c→b→a is broken to a single acyclic order, repeatably."""
    orders: set[tuple[str, ...]] = set()
    for _ in range(100):
        ops = [_fusion("a", "c"), _fusion("b", "a"), _fusion("c", "b")]
        out = topological_sort_with_runtime(ops)
        assert len(out) == 3  # no operator dropped
        orders.add(tuple(o["id"] for o in out))
    assert len(orders) == 1, f"non-deterministic 3-cycle order: {orders}"


# --- engine render-path integration -------------------------------------------


def test_evaluate_all_breaks_cycle_and_renders() -> None:
    """SignalEngine.evaluate_all resolves a cycle via the deterministic break.

    The render must not crash and must return dict values/state. The declaration
    -order fallback is gone; the cycle is broken instead.
    """
    ops = [_fusion("a", "b"), _fusion("b", "a")]
    engine = SignalEngine()
    values, new_state = engine.evaluate_all(operators=ops, frame_index=0, fps=30.0)
    assert isinstance(values, dict)
    assert isinstance(new_state, dict)
    # Both operators evaluated (present in values).
    assert "a" in values and "b" in values
