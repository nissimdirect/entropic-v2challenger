"""Tests for the gate operator (P4.3).

A gate thresholds ONE source operator's value (Fusion's sources[].operator_id
read pattern) into a binary 1.0/0.0 signal, with optional hysteresis to prevent
flutter around the threshold.
"""

from modulation.engine import SignalEngine
from modulation.gate import evaluate_gate


def _gate_params(source_id="src", threshold=0.5, hysteresis=0.0):
    return {
        "sources": [{"operator_id": source_id}],
        "threshold": threshold,
        "hysteresis": hysteresis,
    }


def test_gate_outputs_one_when_source_operator_above_threshold():
    value, _ = evaluate_gate(_gate_params(threshold=0.5), {"src": 0.8}, None)
    assert value == 1.0


def test_gate_outputs_zero_when_source_below_threshold():
    value, _ = evaluate_gate(_gate_params(threshold=0.5), {"src": 0.2}, None)
    assert value == 0.0


def test_gate_hysteresis_prevents_flutter_around_threshold():
    """Source oscillating ±0.04 around threshold=0.5 with hysteresis=0.1 → the
    band is [0.45, 0.55]. The gate opens once (a single value above 0.55), then
    oscillation INSIDE the band (0.54/0.46) crosses neither edge, so the gate
    stays open: EXACTLY 1 transition over 120 frames. Without hysteresis the same
    oscillation around 0.5 would flutter every frame."""
    params = _gate_params(threshold=0.5, hysteresis=0.1)
    state = {}
    transitions = 0
    prev = 0.0  # gate starts closed; the open event is the 1 expected transition
    for i in range(120):
        if i == 0:
            # One value above the upper band edge (0.55) opens the gate.
            src = 0.6
        else:
            # Oscillate 0.54 / 0.46 around 0.5 (amplitude 0.04) — inside [0.45, 0.55].
            src = 0.54 if (i % 2 == 0) else 0.46
        value, state = evaluate_gate(params, {"src": src}, state)
        if value != prev:
            transitions += 1
        prev = value
    assert transitions == 1, (
        f"hysteresis should yield exactly 1 transition (initial open), got {transitions}"
    )


def test_gate_with_missing_source_outputs_zero():
    """Empty sources, missing sources key, and a dangling operator_id all → 0.0."""
    # Empty sources list.
    v1, _ = evaluate_gate({"sources": [], "threshold": 0.5}, {"src": 0.9}, None)
    assert v1 == 0.0
    # Missing sources key entirely.
    v2, _ = evaluate_gate({"threshold": 0.5}, {"src": 0.9}, None)
    assert v2 == 0.0
    # Dangling operator_id (not present in operator_values).
    v3, _ = evaluate_gate(_gate_params(source_id="ghost"), {"src": 0.9}, None)
    assert v3 == 0.0


def test_gate_nan_threshold_outputs_zero_not_crash():
    """NaN/Inf threshold or NaN source value degrades to closed (0.0), no crash."""
    # NaN threshold → default 0.5; source 0.2 below → 0.0.
    v_nan_thr, _ = evaluate_gate(
        _gate_params(threshold=float("nan")), {"src": 0.2}, None
    )
    assert v_nan_thr == 0.0
    # NaN source value → treated as 0.0 → below threshold → 0.0.
    v_nan_src, _ = evaluate_gate(
        _gate_params(threshold=0.5), {"src": float("nan")}, None
    )
    assert v_nan_src == 0.0
    # Inf threshold → default 0.5; high source → 1.0 (no crash).
    v_inf_thr, _ = evaluate_gate(
        _gate_params(threshold=float("inf")), {"src": 0.9}, None
    )
    assert v_inf_thr in (0.0, 1.0)


def test_gate_after_lfo_in_toposort_reads_current_frame_value():
    """Via evaluate_all: declare gate BEFORE its source lfo → toposort orders the
    lfo first, so the gate reads the lfo's CURRENT-frame value (not 0.0)."""
    engine = SignalEngine()
    ops = [
        # Gate declared FIRST, but depends on the lfo via sources[].operator_id.
        {
            "id": "gate-1",
            "type": "gate",
            "is_enabled": True,
            "parameters": {
                "sources": [{"operator_id": "lfo-1"}],
                "threshold": 0.5,
            },
        },
        # Source LFO declared SECOND. A saw at frame_index where phase > 0.5.
        {
            "id": "lfo-1",
            "type": "lfo",
            "is_enabled": True,
            "parameters": {"waveform": "saw", "rate_hz": 1.0, "phase_offset": 0.0},
        },
    ]
    # At fps=30, rate 1Hz: frames_per_cycle=30. frame 20 → phase ~0.667 (saw) > 0.5.
    values, _ = engine.evaluate_all(ops, frame_index=20, fps=30.0)
    assert "lfo-1" in values and "gate-1" in values
    assert values["lfo-1"] > 0.5, "saw at frame 20 should be > 0.5"
    assert values["gate-1"] == 1.0, (
        "gate must read the lfo's current-frame value (toposort ordered lfo first)"
    )
