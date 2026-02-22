"""Tests for fx.channelshift — 4-test contract (basic, determinism, boundary, state)."""

import numpy as np

from effects.fx.channelshift import EFFECT_ID, PARAMS, apply


def _frame(h=100, w=100):
    rng = np.random.default_rng(42)
    return rng.integers(0, 256, (h, w, 4), dtype=np.uint8)


KW = {"frame_index": 0, "seed": 42, "resolution": (100, 100)}


def test_basic():
    frame = _frame()
    params = {"r_offset": 5, "g_offset": -3, "b_offset": 2}
    result, state = apply(frame, params, None, **KW)
    assert result.shape == frame.shape
    assert result.dtype == np.uint8


def test_determinism():
    frame = _frame()
    params = {"r_offset": 5, "g_offset": -3, "b_offset": 2}
    r1, _ = apply(frame, params, None, **KW)
    r2, _ = apply(frame, params, None, **KW)
    np.testing.assert_array_equal(r1, r2)


def test_boundary():
    frame = _frame()
    # All zero offsets — should be close to original
    r_zero, _ = apply(frame, {"r_offset": 0, "g_offset": 0, "b_offset": 0}, None, **KW)
    assert r_zero.shape == frame.shape
    assert r_zero.dtype == np.uint8
    # Large offsets
    r_big, _ = apply(
        frame, {"r_offset": 50, "g_offset": -50, "b_offset": 50}, None, **KW
    )
    assert r_big.shape == frame.shape
    assert r_big.dtype == np.uint8


def test_state():
    frame = _frame()
    params = {"r_offset": 5, "g_offset": -3, "b_offset": 2}
    _, state = apply(frame, params, None, **KW)
    assert state is None
