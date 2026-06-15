"""P5b.22 (B9) — binding-rule semantics in the modulation resolver.

Four rules: broadcast / sampleAt / scanOver / integrate. broadcast MUST stay
byte-identical to the legacy scalar path. Field (2D) destinations are gated behind
EXPERIMENTAL_FIELD_DST. Axis-bound operator-to-operator edges participate in SG-5
cycle detection.
"""

from __future__ import annotations

import pytest

from modulation.routing import (
    FieldDestinationDisabledError,
    resolve_axis_binding,
    resolve_routings,
)
from modulation.graph_adapter import operators_to_routing_graph, remaining_source_edges
from safety.cycle_detection import break_cycles, detect_cycles

pytestmark = pytest.mark.smoke


# --- broadcast byte-identical to legacy scalar --------------------------------


def test_broadcast_identical_to_legacy_scalar():
    """broadcast(scalar) == the raw scalar * depth — the legacy contribution.

    Hand-computed: signal 0.7, depth 1.0 → 0.7.
    """
    assert resolve_axis_binding(0.7, "broadcast", depth=1.0) == pytest.approx(0.7)
    # With depth 0.5 → 0.35.
    assert resolve_axis_binding(0.7, "broadcast", depth=0.5) == pytest.approx(0.35)


def test_broadcast_routing_unchanged_from_legacy():
    """resolve_routings (the legacy path) is untouched: a broadcast/absent mapping
    produces the exact same modulated chain as before B9.

    Hand-computed: base radius 0.0, param range [0,1], signal 1.0, depth 1.0,
    blend add → new radius = 0.0 + (0.0 + 1.0*(1.0-0.0))*1.0 * (1-0) = 1.0.
    """
    chain = [
        {"effect_id": "fx-blur", "enabled": True, "params": {"radius": 0.0}, "mix": 1.0}
    ]
    operators = [
        {
            "id": "op-1",
            "is_enabled": True,
            "mappings": [
                {
                    "target_effect_id": "fx-blur",
                    "target_param_key": "radius",
                    "depth": 1.0,
                    "min": 0.0,
                    "max": 1.0,
                    "blend_mode": "add",
                }
            ],
        }
    ]
    out = resolve_routings({"op-1": 1.0}, operators, chain)
    assert out[0]["params"]["radius"] == pytest.approx(1.0)


# --- sampleAt -----------------------------------------------------------------


def test_sampleAt_reads_single_index():
    """sampleAt returns the value at one axis index (depth 1.0).

    Hand-computed: samples [0.1, 0.2, 0.3], index 1 → 0.2.
    """
    assert resolve_axis_binding([0.1, 0.2, 0.3], "sampleAt", index=1) == pytest.approx(
        0.2
    )
    # Index clamps into range (numeric trust boundary): index 99 → last (0.3).
    assert resolve_axis_binding([0.1, 0.2, 0.3], "sampleAt", index=99) == pytest.approx(
        0.3
    )
    # Negative index clamps to 0.
    assert resolve_axis_binding([0.1, 0.2, 0.3], "sampleAt", index=-5) == pytest.approx(
        0.1
    )


# --- scanOver -----------------------------------------------------------------


def test_scanOver_produces_per_row_vector(monkeypatch):
    """scanOver with field dst (flag on) returns a per-row VECTOR.

    Hand-computed: samples [0.2, 0.4, 0.6], depth 1.0 → [0.2, 0.4, 0.6].
    """
    monkeypatch.setenv("EXPERIMENTAL_FIELD_DST", "true")
    vec = resolve_axis_binding([0.2, 0.4, 0.6], "scanOver", depth=1.0, field_dst=True)
    assert vec == pytest.approx([0.2, 0.4, 0.6])


def test_scanOver_scalar_dst_collapses_to_mean():
    """scanOver to a SCALAR dst (flag-off / no field) collapses to the mean.

    Hand-computed: mean([0.2, 0.4, 0.6]) = 0.4.
    """
    assert resolve_axis_binding(
        [0.2, 0.4, 0.6], "scanOver", depth=1.0
    ) == pytest.approx(0.4)


# --- integrate ----------------------------------------------------------------


def test_integrate_cumulative_over_axis(monkeypatch):
    """integrate accumulates over the axis.

    Hand-computed: samples [0.1, 0.2, 0.3], depth 1.0:
      running = 0.1, 0.3, 0.6 → scalar dst = 0.6 (the total).
    Field dst exposes the running partial sums [0.1, 0.3, 0.6].
    """
    assert resolve_axis_binding(
        [0.1, 0.2, 0.3], "integrate", depth=1.0
    ) == pytest.approx(0.6)
    monkeypatch.setenv("EXPERIMENTAL_FIELD_DST", "true")
    partials = resolve_axis_binding(
        [0.1, 0.2, 0.3], "integrate", depth=1.0, field_dst=True
    )
    assert partials == pytest.approx([0.1, 0.3, 0.6])


# --- field destination flag gate ----------------------------------------------


def test_field_destination_rejected_flag_off(monkeypatch):
    """Requesting a field (2D) destination with the flag off RAISES (no silent
    partial render)."""
    monkeypatch.delenv("EXPERIMENTAL_FIELD_DST", raising=False)
    with pytest.raises(FieldDestinationDisabledError):
        resolve_axis_binding([0.1, 0.2], "scanOver", field_dst=True)


# --- depth finite + clamp -----------------------------------------------------


@pytest.mark.parametrize("bad", [float("nan"), float("inf"), float("-inf"), "x", None])
def test_edge_depth_clamped_finite(bad):
    """A non-finite / non-numeric depth falls back to the finite default (1.0),
    never propagates NaN/inf into the render."""
    out = resolve_axis_binding(0.5, "broadcast", depth=bad)
    assert out == pytest.approx(0.5)  # depth → 1.0 default → 0.5 * 1.0


def test_depth_clamped_to_unit_range():
    """depth is clamped to [-1, 1] (nominal per-edge range)."""
    assert resolve_axis_binding(1.0, "broadcast", depth=5.0) == pytest.approx(1.0)
    assert resolve_axis_binding(1.0, "broadcast", depth=-5.0) == pytest.approx(-1.0)


# --- unimplemented rule guard -------------------------------------------------


def test_unimplemented_rule_raises():
    with pytest.raises(ValueError, match="not implemented"):
        resolve_axis_binding(0.5, "painted")


# --- axis-bound cycle detection via SG-5 --------------------------------------


def _op(op_id: str, *map_targets: str) -> dict:
    """An operator whose mappings target other operators (axis-bound edges)."""
    return {
        "id": op_id,
        "type": "lfo",
        "is_enabled": True,
        "parameters": {},
        "mappings": [
            {
                "target_effect_id": t,
                "target_param_key": "value",
                "depth": 1.0,
                "src_axis": "t",
                "dst_axis": "y",
                "binding_rule": "scanOver",
            }
            for t in map_targets
        ],
    }


def test_axis_edge_cycle_detected_via_sg5_direct():
    """A direct axis-bound 2-cycle op-a ↔ op-b is detected + broken (SG-5)."""
    ops = [_op("op-a", "op-b"), _op("op-b", "op-a")]
    graph = operators_to_routing_graph(ops)
    assert detect_cycles(graph).has_cycles
    removed = break_cycles(graph)
    assert removed  # at least one edge removed
    assert not detect_cycles(graph).has_cycles


def test_axis_edge_cycle_detected_via_sg5_nhop():
    """An n-hop axis-bound cycle a→b→c→a is detected + broken (SG-5)."""
    ops = [_op("op-a", "op-b"), _op("op-b", "op-c"), _op("op-c", "op-a")]
    graph = operators_to_routing_graph(ops)
    assert detect_cycles(graph).has_cycles
    edges = remaining_source_edges(graph)
    assert ("op-a", "op-b") in edges
    assert ("op-c", "op-a") in edges
    break_cycles(graph)
    assert not detect_cycles(graph).has_cycles


def test_axis_edge_to_effect_is_not_a_graph_edge():
    """A mapping targeting a real EFFECT (not an operator) is NOT a graph edge —
    only operator-to-operator axis edges participate in cycle detection."""
    ops = [_op("op-a", "fx-blur")]  # fx-blur is not a present operator
    graph = operators_to_routing_graph(ops)
    assert len(graph.edges()) == 0
    assert not detect_cycles(graph).has_cycles
