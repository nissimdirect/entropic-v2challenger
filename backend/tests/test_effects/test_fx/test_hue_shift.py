"""Tests for fx.hue_shift — 4-test contract (basic, determinism, boundary, state)."""

import numpy as np

from effects.fx.hue_shift import EFFECT_ID, PARAMS, apply


def _frame(h=100, w=100):
    rng = np.random.default_rng(42)
    return rng.integers(0, 256, (h, w, 4), dtype=np.uint8)


KW = {"frame_index": 0, "seed": 42, "resolution": (100, 100)}


def test_basic():
    frame = _frame()
    result, state = apply(frame, {"amount": 180.0}, None, **KW)
    assert result.shape == frame.shape
    assert result.dtype == np.uint8
    # Hue shifted by 180 degrees should differ from input
    assert not np.array_equal(result[:, :, :3], frame[:, :, :3])


def test_determinism():
    frame = _frame()
    params = {"amount": 90.0}
    r1, _ = apply(frame, params, None, **KW)
    r2, _ = apply(frame, params, None, **KW)
    np.testing.assert_array_equal(r1, r2)


def test_boundary():
    frame = _frame()
    # Min: amount=0 should return (near) original
    r_min, _ = apply(frame, {"amount": 0.0}, None, **KW)
    assert r_min.shape == frame.shape
    assert r_min.dtype == np.uint8
    # Max: amount=360 is a full rotation, should be (near) original
    r_max, _ = apply(frame, {"amount": 360.0}, None, **KW)
    assert r_max.shape == frame.shape
    assert r_max.dtype == np.uint8


def test_state():
    frame = _frame()
    _, state = apply(frame, {"amount": 180.0}, None, **KW)
    assert state is None
