"""Tests for verdict.py — three states + advisory flags + boundary."""

from __future__ import annotations

import pytest

from q7_benchmark.verdict import (
    FLAG_DEGRADES_UNDER_LOAD,
    FLAG_HIGH_VARIANCE,
    GATE_P95_CONDITIONAL_THRESHOLD_MS,
    GATE_P95_GO_THRESHOLD_MS,
    Verdict,
    VerdictState,
    compute_verdict,
    verdict_from_measurement,
)


@pytest.mark.smoke
def test_thresholds_are_50_and_100():
    """Sentinel: don't accidentally change the spec gate."""
    assert GATE_P95_GO_THRESHOLD_MS == 50.0
    assert GATE_P95_CONDITIONAL_THRESHOLD_MS == 100.0


@pytest.mark.smoke
def test_verdict_go_just_under_threshold():
    v = compute_verdict(49.99)
    assert v.state == VerdictState.GO
    assert v.flags == ()
    assert "GO" in v.note


@pytest.mark.smoke
def test_verdict_conditional_at_threshold():
    """Exactly 50.0 is NOT < 50, so it's conditional."""
    v = compute_verdict(50.0)
    assert v.state == VerdictState.CONDITIONAL
    assert "CONDITIONAL" in v.note


@pytest.mark.smoke
def test_verdict_conditional_mid_range():
    v = compute_verdict(75.0)
    assert v.state == VerdictState.CONDITIONAL


@pytest.mark.smoke
def test_verdict_no_go_at_100():
    v = compute_verdict(100.0)
    assert v.state == VerdictState.NO_GO
    assert "NO_GO" in v.note
    assert "v1.1" in v.note


@pytest.mark.smoke
def test_verdict_no_go_far_over():
    v = compute_verdict(250.0)
    assert v.state == VerdictState.NO_GO


@pytest.mark.smoke
def test_verdict_negative_p95_raises():
    with pytest.raises(ValueError, match="non-negative"):
        compute_verdict(-1.0)


@pytest.mark.smoke
def test_verdict_zero_p95_is_go():
    """Edge: 0ms p95 is still under 50ms, so GO."""
    v = compute_verdict(0.0)
    assert v.state == VerdictState.GO


@pytest.mark.smoke
def test_high_variance_flag_surfaces():
    v = compute_verdict(40.0, high_variance=True)
    assert FLAG_HIGH_VARIANCE in v.flags
    # Still GO — flag is advisory, not blocking
    assert v.state == VerdictState.GO


@pytest.mark.smoke
def test_degrades_under_load_flag_surfaces():
    v = compute_verdict(40.0, degradation_under_load=True)
    assert FLAG_DEGRADES_UNDER_LOAD in v.flags
    assert v.state == VerdictState.GO  # advisory, not blocking


@pytest.mark.smoke
def test_both_flags_surface():
    v = compute_verdict(40.0, high_variance=True, degradation_under_load=True)
    assert set(v.flags) == {FLAG_HIGH_VARIANCE, FLAG_DEGRADES_UNDER_LOAD}


@pytest.mark.smoke
def test_verdict_to_dict_shape():
    v = compute_verdict(42.0, high_variance=True)
    d = v.to_dict()
    assert d["state"] == "TIER_5_GO"
    assert d["flags"] == ["HIGH_VARIANCE"]
    assert d["canonical_p95_ms"] == 42.0
    assert isinstance(d["note"], str)


@pytest.mark.smoke
def test_verdict_from_measurement_canonical_path():
    measurement = {
        "interpolation": {
            "canonical_sparsity": 8,
            "by_sparsity": {
                "8": {"jitter_p95_ms": 30.0, "jitter_p50_ms": 18.0},
                "4": {"jitter_p95_ms": 60.0, "jitter_p50_ms": 35.0},
            },
            "jitter_p95_ms": 30.0,
            "degradation_under_load": False,
        },
        "heads": {"dinov2": {"high_variance": False}},
    }
    v = verdict_from_measurement(measurement)
    assert v.state == VerdictState.GO
    assert v.canonical_p95_ms == 30.0


@pytest.mark.smoke
def test_verdict_from_measurement_picks_up_flags():
    measurement = {
        "interpolation": {
            "canonical_sparsity": 8,
            "by_sparsity": {"8": {"jitter_p95_ms": 45.0}},
            "jitter_p95_ms": 45.0,
            "degradation_under_load": True,
        },
        "heads": {
            "dinov2": {"high_variance": True},
            "clip": {"high_variance": False},
            "clap": {"high_variance": False},
        },
    }
    v = verdict_from_measurement(measurement)
    assert v.state == VerdictState.GO
    assert FLAG_HIGH_VARIANCE in v.flags
    assert FLAG_DEGRADES_UNDER_LOAD in v.flags


@pytest.mark.smoke
def test_verdict_from_measurement_fallback_to_top_level():
    """When by_sparsity is absent, fall back to top-level jitter_p95_ms."""
    measurement = {
        "interpolation": {
            "canonical_sparsity": 8,
            "jitter_p95_ms": 22.0,
            "degradation_under_load": False,
        },
        "heads": {},
    }
    v = verdict_from_measurement(measurement)
    assert v.state == VerdictState.GO
    assert v.canonical_p95_ms == 22.0
