"""SG-5 seam guard tests (P5b.7 fast-follow, task #83).

Verifies that the runtime-conditional-edge evaluation degrades gracefully to the
static _topological_sort path when a malformed/raising RuntimeContext is supplied.

Acceptance gates:
- test_malformed_runtime_context_degrades_to_static
- test_raising_predicate_degrades_to_static
- test_static_path_unchanged_when_context_none
- test_degradation_logged_once_not_per_call
"""

from __future__ import annotations

import logging

import pytest

from modulation.engine import (
    _topological_sort,
    topological_sort_with_runtime,
)
from modulation.runtime_context import RuntimeContext


def _fusion(op_id: str, *source_ids: str) -> dict:
    """Helper: an operator that depends on source_ids."""
    return {
        "id": op_id,
        "type": "fusion",
        "is_enabled": True,
        "parameters": {"sources": [{"operator_id": s} for s in source_ids]},
    }


class _MalformedContext:
    """A context object that is missing `has_runtime_conditional_edges` and
    `active_conditional_edges`. Simulates a partial/garbage RuntimeContext."""


class _RaisingContext:
    """A context whose `active_conditional_edges()` raises at call time."""

    @property
    def has_runtime_conditional_edges(self) -> bool:  # noqa: D102
        return True

    def active_conditional_edges(self) -> list:
        raise RuntimeError("predicate exploded")


class _RaisingPropertyContext:
    """A context whose `has_runtime_conditional_edges` property raises."""

    @property
    def has_runtime_conditional_edges(self) -> bool:  # noqa: D102
        raise AttributeError("property broken")


# ---------------------------------------------------------------------------
# Gate 1: malformed context → degrade to static, no crash
# ---------------------------------------------------------------------------


def test_malformed_runtime_context_degrades_to_static() -> None:
    """A context missing `active_conditional_edges` must not crash the sort.

    Expected: the function returns the same order as the plain static sort,
    never raises.
    """
    ops = [_fusion("consumer", "src"), _fusion("src"), _fusion("independent")]
    expected = [o["id"] for o in _topological_sort(ops)]

    ctx = _MalformedContext()
    result = [o["id"] for o in topological_sort_with_runtime(ops, ctx)]

    assert result == expected, (
        f"malformed context: expected static order {expected}, got {result}"
    )


# ---------------------------------------------------------------------------
# Gate 2: raising predicate → degrade to static, no crash, warn logged once
# ---------------------------------------------------------------------------


def test_raising_predicate_degrades_to_static(caplog: pytest.LogCaptureFixture) -> None:
    """A context whose active_conditional_edges() raises must not crash.

    Expected: static sort order returned; a WARNING is emitted with the reason.
    """
    ops = [_fusion("consumer", "src"), _fusion("src")]
    expected = [o["id"] for o in _topological_sort(ops)]

    ctx = _RaisingContext()

    # Clear the one-shot warning set so we get a fresh warning for this context.
    warned = getattr(topological_sort_with_runtime, "_seam_warned_ids", set())
    warned.discard(id(ctx))

    with caplog.at_level(logging.WARNING, logger="modulation.engine"):
        result = [o["id"] for o in topological_sort_with_runtime(ops, ctx)]

    assert result == expected, (
        f"raising predicate: expected static order {expected}, got {result}"
    )

    warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
    assert any(
        "seam guard" in r.message.lower() or "sg-5" in r.message.lower()
        for r in warnings
    ), (
        f"Expected a SG-5 seam-guard WARNING; records: {[r.message for r in caplog.records]}"
    )


def test_raising_property_degrades_to_static() -> None:
    """A context whose has_runtime_conditional_edges property raises must not crash."""
    ops = [_fusion("a", "b"), _fusion("b")]
    expected = [o["id"] for o in _topological_sort(ops)]

    ctx = _RaisingPropertyContext()
    result = [o["id"] for o in topological_sort_with_runtime(ops, ctx)]

    assert result == expected


# ---------------------------------------------------------------------------
# Gate 3: context=None → byte-identical to static path (regression guard)
# ---------------------------------------------------------------------------


def test_static_path_unchanged_when_context_none() -> None:
    """runtime_context=None must produce byte-identical output to _topological_sort.

    This is the hot production path: preview + export both call without a context.
    """
    ops = [_fusion("consumer", "src"), _fusion("src"), _fusion("independent")]
    static_order = [o["id"] for o in _topological_sort(ops)]
    runtime_order = [o["id"] for o in topological_sort_with_runtime(ops, None)]

    assert runtime_order == static_order, (
        f"context=None diverges from static: static={static_order} runtime={runtime_order}"
    )


# ---------------------------------------------------------------------------
# Gate 4: one-shot warn (not per-frame)
# ---------------------------------------------------------------------------


def test_degradation_logged_once_not_per_call(caplog: pytest.LogCaptureFixture) -> None:
    """The seam guard warning fires ONCE per context object, not on every call.

    Calling topological_sort_with_runtime 5 times with the same raising context
    must produce exactly ONE warning entry.
    """
    ops = [_fusion("a", "b"), _fusion("b")]
    ctx = _RaisingContext()

    # Ensure this context is fresh (not already warned).
    warned = getattr(topological_sort_with_runtime, "_seam_warned_ids", set())
    warned.discard(id(ctx))

    with caplog.at_level(logging.WARNING, logger="modulation.engine"):
        for _ in range(5):
            topological_sort_with_runtime(ops, ctx)

    seam_warnings = [
        r
        for r in caplog.records
        if r.levelno == logging.WARNING
        and ("seam guard" in r.message.lower() or "sg-5" in r.message.lower())
    ]
    assert len(seam_warnings) == 1, (
        f"Expected exactly 1 seam-guard warning, got {len(seam_warnings)}: "
        f"{[r.message for r in seam_warnings]}"
    )


# ---------------------------------------------------------------------------
# Bonus: acyclic + valid RuntimeContext (empty cond edges) → static fast path
# ---------------------------------------------------------------------------


def test_valid_empty_context_still_uses_static_path() -> None:
    """A valid RuntimeContext with no conditional edges is the static fast path."""
    ops = [_fusion("consumer", "src"), _fusion("src")]
    static_order = [o["id"] for o in _topological_sort(ops)]

    ctx = RuntimeContext(frame_index=0)
    assert not ctx.has_runtime_conditional_edges

    result = [o["id"] for o in topological_sort_with_runtime(ops, ctx)]
    assert result == static_order
