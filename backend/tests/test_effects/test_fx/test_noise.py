"""Tests for fx.noise — 4-test contract (basic, determinism, boundary, state)."""

import numpy as np

from effects.fx.noise import EFFECT_ID, PARAMS, apply


def _frame(h=100, w=100):
    rng = np.random.default_rng(42)
    return rng.integers(0, 256, (h, w, 4), dtype=np.uint8)


KW = {"frame_index": 0, "seed": 42, "resolution": (100, 100)}


def test_basic():
    frame = _frame()
    result, state = apply(frame, {"intensity": 0.5}, None, **KW)
    assert result.shape == frame.shape
    assert result.dtype == np.uint8
    # Noise should modify the frame
    assert not np.array_equal(result[:, :, :3], frame[:, :, :3])
    # Alpha should be preserved
    np.testing.assert_array_equal(result[:, :, 3], frame[:, :, 3])


def test_determinism():
    frame = _frame()
    params = {"intensity": 0.5}
    r1, _ = apply(frame, params, None, **KW)
    r2, _ = apply(frame, params, None, **KW)
    np.testing.assert_array_equal(r1, r2)


def test_boundary():
    frame = _frame()
    # Min: intensity=0 should return copy of original
    r_min, _ = apply(frame, {"intensity": 0.0}, None, **KW)
    np.testing.assert_array_equal(r_min[:, :, :3], frame[:, :, :3])
    # Max: intensity=1.0 should still produce valid output
    r_max, _ = apply(frame, {"intensity": 1.0}, None, **KW)
    assert r_max.shape == frame.shape
    assert r_max.dtype == np.uint8


def test_state():
    frame = _frame()
    _, state = apply(frame, {"intensity": 0.5}, None, **KW)
    assert state is None
