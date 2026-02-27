"""Tests for engine.pipeline — chain execution, ordering, SEC-7 cap, mix, timeout guard."""

import time

import numpy as np
import pytest

pytestmark = pytest.mark.smoke

from engine.pipeline import (
    EFFECT_ABORT_MS,
    EFFECT_WARN_MS,
    MAX_CHAIN_DEPTH,
    apply_chain,
)


def _frame(h=100, w=100):
    rng = np.random.default_rng(42)
    return rng.integers(0, 256, (h, w, 4), dtype=np.uint8)


def test_single_effect_chain():
    """Single invert in chain produces inverted output."""
    frame = _frame()
    chain = [{"effect_id": "fx.invert", "params": {}}]
    output, _ = apply_chain(
        frame, chain, project_seed=42, frame_index=0, resolution=(100, 100)
    )
    assert output.shape == frame.shape
    assert output.dtype == np.uint8
    np.testing.assert_array_equal(output[:, :, 0], 255 - frame[:, :, 0])


def test_three_effect_chain():
    """Three effects in chain all apply sequentially."""
    frame = _frame()
    chain = [
        {"effect_id": "fx.invert", "params": {}},
        {"effect_id": "fx.invert", "params": {}},
        {"effect_id": "fx.invert", "params": {}},
    ]
    output, _ = apply_chain(
        frame, chain, project_seed=42, frame_index=0, resolution=(100, 100)
    )
    np.testing.assert_array_equal(output[:, :, 0], 255 - frame[:, :, 0])


def test_order_matters():
    """A -> B != B -> A when effects are not commutative."""
    frame = _frame()
    chain_ab = [
        {"effect_id": "fx.invert", "params": {}},
        {"effect_id": "fx.posterize", "params": {"levels": 4}},
    ]
    chain_ba = [
        {"effect_id": "fx.posterize", "params": {"levels": 4}},
        {"effect_id": "fx.invert", "params": {}},
    ]
    out_ab, _ = apply_chain(
        frame, chain_ab, project_seed=42, frame_index=0, resolution=(100, 100)
    )
    out_ba, _ = apply_chain(
        frame, chain_ba, project_seed=42, frame_index=0, resolution=(100, 100)
    )
    assert not np.array_equal(out_ab, out_ba)


def test_empty_chain_returns_original():
    """Empty chain returns the original frame unmodified."""
    frame = _frame()
    output, _ = apply_chain(
        frame, [], project_seed=42, frame_index=0, resolution=(100, 100)
    )
    np.testing.assert_array_equal(output, frame)


def test_disabled_effect_skipped():
    """Disabled effects are skipped."""
    frame = _frame()
    chain = [{"effect_id": "fx.invert", "params": {}, "enabled": False}]
    output, _ = apply_chain(
        frame, chain, project_seed=42, frame_index=0, resolution=(100, 100)
    )
    np.testing.assert_array_equal(output, frame)


def test_sec7_cap_enforced():
    """Chain exceeding MAX_CHAIN_DEPTH raises ValueError (SEC-7)."""
    frame = _frame()
    chain = [
        {"effect_id": "fx.invert", "params": {}} for _ in range(MAX_CHAIN_DEPTH + 1)
    ]
    with pytest.raises(ValueError, match="SEC-7"):
        apply_chain(frame, chain, project_seed=42, frame_index=0, resolution=(100, 100))


def test_sec7_at_limit_succeeds():
    """Chain at exactly MAX_CHAIN_DEPTH succeeds."""
    frame = _frame()
    chain = [{"effect_id": "fx.invert", "params": {}} for _ in range(MAX_CHAIN_DEPTH)]
    output, _ = apply_chain(
        frame, chain, project_seed=42, frame_index=0, resolution=(100, 100)
    )
    assert output.shape == frame.shape


def test_unknown_effect_raises():
    """Unknown effect ID raises ValueError."""
    frame = _frame()
    chain = [{"effect_id": "fx.nonexistent", "params": {}}]
    with pytest.raises(ValueError, match="unknown effect"):
        apply_chain(frame, chain, project_seed=42, frame_index=0, resolution=(100, 100))


# --- Mix tests (P2 fix) ---


def test_mix_from_top_level_applied():
    """Top-level mix field is injected into params as _mix for EffectContainer."""
    frame = _frame()
    chain = [{"effect_id": "fx.invert", "params": {}, "mix": 0.0}]
    output, _ = apply_chain(
        frame, chain, project_seed=42, frame_index=0, resolution=(100, 100)
    )
    np.testing.assert_array_equal(output, frame)


def test_mix_half_blends():
    """mix=0.5 should produce a blend between dry and wet."""
    frame = _frame()
    chain_full = [{"effect_id": "fx.invert", "params": {}, "mix": 1.0}]
    chain_half = [{"effect_id": "fx.invert", "params": {}, "mix": 0.5}]
    out_full, _ = apply_chain(
        frame, chain_full, project_seed=42, frame_index=0, resolution=(100, 100)
    )
    out_half, _ = apply_chain(
        frame, chain_half, project_seed=42, frame_index=0, resolution=(100, 100)
    )
    assert not np.array_equal(out_half, frame)
    assert not np.array_equal(out_half, out_full)


def test_mix_default_is_fully_wet():
    """Without mix field, effect applies at full strength (mix=1.0 default)."""
    frame = _frame()
    chain_no_mix = [{"effect_id": "fx.invert", "params": {}}]
    chain_full = [{"effect_id": "fx.invert", "params": {}, "mix": 1.0}]
    out_no_mix, _ = apply_chain(
        frame, chain_no_mix, project_seed=42, frame_index=0, resolution=(100, 100)
    )
    out_full, _ = apply_chain(
        frame, chain_full, project_seed=42, frame_index=0, resolution=(100, 100)
    )
    np.testing.assert_array_equal(out_no_mix, out_full)


# --- Timeout guard tests (BUG-4 fix) ---


def test_timeout_constants():
    """BUG-4: verify timeout thresholds are exported and sane."""
    assert EFFECT_WARN_MS == 100
    assert EFFECT_ABORT_MS == 500
    assert EFFECT_WARN_MS < EFFECT_ABORT_MS


def test_slow_effect_returns_input_frame(monkeypatch):
    """BUG-4: if an effect exceeds EFFECT_ABORT_MS, return input frame unchanged."""
    frame = _frame()

    call_count = 0
    real_monotonic = time.monotonic

    def fake_monotonic():
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return 0.0
        elif call_count == 2:
            return 0.6  # 600ms > 500ms abort
        return real_monotonic()

    monkeypatch.setattr(time, "monotonic", fake_monotonic)

    chain = [{"effect_id": "fx.invert", "params": {}}]
    output, _ = apply_chain(
        frame, chain, project_seed=42, frame_index=0, resolution=(100, 100)
    )
    np.testing.assert_array_equal(output, frame)


def test_fast_effect_applies_normally(monkeypatch):
    """BUG-4: effects under EFFECT_WARN_MS apply normally."""
    frame = _frame()

    call_count = 0

    def fake_monotonic():
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return 0.0
        elif call_count == 2:
            return 0.010  # 10ms
        return 0.0

    monkeypatch.setattr(time, "monotonic", fake_monotonic)

    chain = [{"effect_id": "fx.invert", "params": {}}]
    output, _ = apply_chain(
        frame, chain, project_seed=42, frame_index=0, resolution=(100, 100)
    )
    np.testing.assert_array_equal(output[:, :, 0], 255 - frame[:, :, 0])
