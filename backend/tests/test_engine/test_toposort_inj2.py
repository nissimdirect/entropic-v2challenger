"""INJ-2: _topological_sort raises ModulationCycleError + walks all operator edges.

Replaces the prior warn+fallback-to-declaration-order behavior. SG-5 / B9 depend
on the cycle being an explicit, typed failure. The render-path caller
(SignalEngine.evaluate_all) catches it and degrades gracefully so renders never
crash — verified here too.
"""

from __future__ import annotations

import logging

import pytest

from modulation.engine import (
    ModulationCycleError,
    SignalEngine,
    _topological_sort,
)


def _fusion(op_id: str, *source_ids: str) -> dict:
    return {
        "id": op_id,
        "type": "fusion",
        "is_enabled": True,
        "parameters": {"sources": [{"operator_id": s} for s in source_ids]},
    }


def test_orders_source_before_consumer() -> None:
    # consumer declared BEFORE its source — sort must reorder source first.
    ops = [_fusion("consumer", "src"), _fusion("src")]
    ordered = _topological_sort(ops)
    ids = [o["id"] for o in ordered]
    assert ids.index("src") < ids.index("consumer")


def test_stable_when_no_dependencies() -> None:
    ops = [_fusion("a"), _fusion("b"), _fusion("c")]
    assert [o["id"] for o in _topological_sort(ops)] == ["a", "b", "c"]


def test_raises_on_direct_cycle() -> None:
    ops = [_fusion("a", "b"), _fusion("b", "a")]
    with pytest.raises(ModulationCycleError) as exc:
        _topological_sort(ops)
    assert set(exc.value.unresolved_ids) == {"a", "b"}


def test_raises_on_three_node_cycle() -> None:
    ops = [_fusion("a", "c"), _fusion("b", "a"), _fusion("c", "b")]
    with pytest.raises(ModulationCycleError):
        _topological_sort(ops)


def test_walks_non_fusion_operator_edges() -> None:
    # INJ-2: a NON-fusion operator that declares sources still creates a dep edge.
    consumer = {
        "id": "x",
        "type": "custom_router",
        "is_enabled": True,
        "parameters": {"sources": [{"operator_id": "y"}]},
    }
    src = {"id": "y", "type": "lfo", "is_enabled": True, "parameters": {}}
    ordered = _topological_sort([consumer, src])
    ids = [o["id"] for o in ordered]
    assert ids.index("y") < ids.index("x")


def test_single_or_empty_passthrough() -> None:
    assert _topological_sort([]) == []
    one = [_fusion("solo")]
    assert _topological_sort(one) == one


def test_evaluate_all_degrades_on_cycle_without_raising(caplog) -> None:
    # The render-path caller must NOT propagate the cycle error — it logs + keeps
    # declaration order so the frame still renders.
    ops = [_fusion("a", "b"), _fusion("b", "a")]
    engine = SignalEngine()
    with caplog.at_level(logging.WARNING):
        values, new_state = engine.evaluate_all(operators=ops, frame_index=0, fps=30.0)
    assert isinstance(values, dict)
    assert isinstance(new_state, dict)
    assert any("cycle" in r.message.lower() for r in caplog.records)
