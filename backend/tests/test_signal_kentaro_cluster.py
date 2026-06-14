"""Tests for the Kentaro Cluster 8-LFO operator (P4.2)."""

import math

from modulation.kentaro_cluster import evaluate_kentaro_cluster
from modulation.engine import SignalEngine


def _lfos(n, rate_hz=1.0, shape="sine", depth=1.0, phase=0.0):
    """Build a list of n per-LFO config dicts."""
    return [
        {"shape": shape, "rate_hz": rate_hz, "depth": depth, "phase": phase}
        for _ in range(n)
    ]


def test_eight_lfos_produce_independent_values_with_different_rates():
    """8 sub-LFOs at distinct rates yield 8 pairwise-distinct sub-values."""
    lfos = [
        {"shape": "sine", "rate_hz": 0.5 + i * 0.37, "depth": 1.0, "phase": 0.0}
        for i in range(8)
    ]
    params = {"lfos": lfos, "lfo_count": 8}
    values, _ = evaluate_kentaro_cluster(params, frame_index=30, fps=30.0)

    subs = [values[f"lfo{i}"] for i in range(8)]
    # All 8 present and in range.
    assert len(subs) == 8
    for v in subs:
        assert 0.0 <= v <= 1.0
    # Pairwise distinct at frame 30.
    assert len(set(subs)) == 8, f"expected 8 distinct sub-values, got {subs}"
    print("EIGHT_DISTINCT frame30 sub-values:", subs)


def test_lfo_count_clamped_between_2_and_8():
    """lfo_count of 0/1/9/999 clamps to [2, 8] and never raises."""
    lfos = _lfos(8)
    for requested, expected in [(0, 2), (1, 2), (9, 8), (999, 8)]:
        params = {"lfos": lfos, "lfo_count": requested}
        values, _ = evaluate_kentaro_cluster(params, frame_index=10, fps=30.0)
        sub_keys = [k for k in values if k.startswith("lfo")]
        assert len(sub_keys) == expected, (
            f"lfo_count={requested} → expected {expected} sub-LFOs, got {len(sub_keys)}"
        )


def test_master_depth_scales_all_lfo_outputs():
    """master_depth scales every sub-LFO output proportionally."""
    lfos = _lfos(4, rate_hz=1.0)
    full = evaluate_kentaro_cluster(
        {"lfos": lfos, "lfo_count": 4, "master_depth": 1.0}, 7, 30.0
    )[0]
    half = evaluate_kentaro_cluster(
        {"lfos": lfos, "lfo_count": 4, "master_depth": 0.5}, 7, 30.0
    )[0]
    zero = evaluate_kentaro_cluster(
        {"lfos": lfos, "lfo_count": 4, "master_depth": 0.0}, 7, 30.0
    )[0]

    for i in range(4):
        # At master_depth 0.5 each output is half the full-depth output.
        assert math.isclose(half[f"lfo{i}"], full[f"lfo{i}"] * 0.5, abs_tol=1e-9)
        # At master_depth 0.0 everything collapses to 0.
        assert zero[f"lfo{i}"] == 0.0
    assert zero[""] == 0.0


def test_bpm_sync_converts_beat_rate_to_hz_using_bpm():
    """bpm_sync reinterprets rate_hz as beats: effective_hz = beats*bpm/60."""
    # 1 beat at 120 BPM = 2 Hz. A bpm_sync cluster at rate 1 (beat) and bpm 120
    # must match a non-sync cluster at rate 2.0 Hz, frame for frame.
    synced = evaluate_kentaro_cluster(
        {"lfos": _lfos(2, rate_hz=1.0), "lfo_count": 2, "bpm_sync": True},
        frame_index=11,
        fps=30.0,
        bpm=120.0,
    )[0]
    direct = evaluate_kentaro_cluster(
        {"lfos": _lfos(2, rate_hz=2.0), "lfo_count": 2, "bpm_sync": False},
        frame_index=11,
        fps=30.0,
    )[0]
    for i in range(2):
        assert math.isclose(synced[f"lfo{i}"], direct[f"lfo{i}"], abs_tol=1e-9)


def test_phase_reset_counter_restarts_all_lfo_phases():
    """Incrementing phase_reset restarts every sub-LFO to its cycle start."""
    lfos = _lfos(3, rate_hz=1.0, shape="saw")
    state = {}
    # Evaluate at frame 0 (cycle start → saw ≈ 0).
    v0, state = evaluate_kentaro_cluster(
        {"lfos": lfos, "lfo_count": 3, "phase_reset": 0}, 0, 30.0, state_in=state
    )
    # Advance to frame 20 without reset (saw has progressed).
    v20, state = evaluate_kentaro_cluster(
        {"lfos": lfos, "lfo_count": 3, "phase_reset": 0}, 20, 30.0, state_in=state
    )
    assert v20["lfo0"] != v0["lfo0"]
    # Now bump phase_reset at frame 20 → phases restart, output ≈ frame-0 value.
    v_reset, state = evaluate_kentaro_cluster(
        {"lfos": lfos, "lfo_count": 3, "phase_reset": 1}, 20, 30.0, state_in=state
    )
    for i in range(3):
        assert math.isclose(v_reset[f"lfo{i}"], v0[f"lfo{i}"], abs_tol=1e-9)


def test_nan_inf_master_rate_yields_zero_not_crash():
    """NaN/+Inf/-Inf/string master_rate (and master_depth) never crash."""
    lfos = _lfos(2)
    for bad in [float("nan"), float("inf"), float("-inf"), "fast", None]:
        # Bad master_rate_hz — guarded, must not raise.
        v1, _ = evaluate_kentaro_cluster(
            {"lfos": lfos, "lfo_count": 2, "master_rate_hz": bad}, 5, 30.0
        )
        assert isinstance(v1, dict)
        # Bad master_depth → safe default (1.0), still produces valid output.
        v2, _ = evaluate_kentaro_cluster(
            {"lfos": lfos, "lfo_count": 2, "master_depth": bad}, 5, 30.0
        )
        assert isinstance(v2, dict)
        for k, val in v2.items():
            assert 0.0 <= val <= 1.0
    # Bad per-LFO rate_hz → safe default (1.0 Hz), no crash, output in range.
    bad_lfos = [
        {"shape": "sine", "rate_hz": bad, "depth": 1.0}
        for bad in [float("nan"), float("inf"), "fast", None]
    ]
    v3, _ = evaluate_kentaro_cluster({"lfos": bad_lfos, "lfo_count": 4}, 5, 30.0)
    for i in range(4):
        assert 0.0 <= v3[f"lfo{i}"] <= 1.0


def test_lfos_param_not_a_list_treated_as_empty_cluster():
    """params['lfos'] not a list → empty cluster, master 0.0, no crash."""
    for bad in ["nope", 42, None, {"lfo0": {}}]:
        values, state = evaluate_kentaro_cluster({"lfos": bad, "lfo_count": 4}, 3, 30.0)
        assert values == {"": 0.0}
        assert isinstance(state, dict)


def test_engine_exposes_subkey_values_for_each_lfo():
    """SignalEngine.evaluate_all exposes op_id (master) + op_id/lfo{i} sub-keys."""
    engine = SignalEngine()
    op_id = "op-1700000000-0"
    operators = [
        {
            "id": op_id,
            "type": "kentaroCluster",
            "is_enabled": True,
            "parameters": {
                "lfos": [
                    {"shape": "sine", "rate_hz": 0.5 + i * 0.37, "depth": 1.0}
                    for i in range(8)
                ],
                "lfo_count": 8,
            },
            "processing": [],
            "mappings": [],
        }
    ]
    values, _ = engine.evaluate_all(operators, frame_index=30, fps=30.0)
    # Master value at op_id.
    assert op_id in values
    assert 0.0 <= values[op_id] <= 1.0
    # Each sub-LFO at op_id/lfo{i}.
    for i in range(8):
        key = f"{op_id}/lfo{i}"
        assert key in values, f"missing sub-key {key}"
        assert 0.0 <= values[key] <= 1.0
    # The slash sub-key scheme can't collide with the master key.
    assert f"{op_id}/lfo0" != op_id
