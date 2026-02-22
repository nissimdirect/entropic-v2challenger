"""Tests for fx.invert — 4-test contract (basic, determinism, boundary, state)."""

import numpy as np

from effects.fx.invert import EFFECT_ID, PARAMS, apply


def _frame(h=100, w=100):
    rng = np.random.default_rng(42)
    return rng.integers(0, 256, (h, w, 4), dtype=np.uint8)


KW = {"frame_index": 0, "seed": 42, "resolution": (100, 100)}


def test_basic():
    frame = np.zeros((100, 100, 4), dtype=np.uint8)
    frame[:, :, 0] = 200
    frame[:, :, 1] = 100
    frame[:, :, 2] = 50
    frame[:, :, 3] = 255
    result, state = apply(frame, {}, None, **KW)
    assert result.shape == frame.shape
    assert result.dtype == np.uint8
    np.testing.assert_array_equal(result[:, :, 0], 55)
    np.testing.assert_array_equal(result[:, :, 1], 155)
    np.testing.assert_array_equal(result[:, :, 2], 205)
    np.testing.assert_array_equal(result[:, :, 3], 255)


def test_determinism():
    frame = _frame()
    r1, _ = apply(frame, {}, None, **KW)
    r2, _ = apply(frame, {}, None, **KW)
    np.testing.assert_array_equal(r1, r2)


def test_boundary():
    """No params to test min/max — just confirm empty params works."""
    frame = _frame()
    result, _ = apply(frame, {}, None, **KW)
    assert result.shape == frame.shape
    assert result.dtype == np.uint8


def test_state():
    frame = _frame()
    _, state = apply(frame, {}, None, **KW)
    assert state is None
