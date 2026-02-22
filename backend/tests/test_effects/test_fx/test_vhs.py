"""Tests for fx.vhs — 4-test contract (basic, determinism, boundary, state)."""

import numpy as np

from effects.fx.vhs import EFFECT_ID, PARAMS, apply


def _frame(h=100, w=100):
    rng = np.random.default_rng(42)
    return rng.integers(0, 256, (h, w, 4), dtype=np.uint8)


KW = {"frame_index": 0, "seed": 42, "resolution": (100, 100)}


def test_basic():
    frame = _frame()
    params = {"tracking": 0.5, "noise": 0.3, "chromatic": 0.2}
    result, state = apply(frame, params, None, **KW)
    assert result.shape == frame.shape
    assert result.dtype == np.uint8


def test_determinism():
    frame = _frame()
    params = {"tracking": 0.5, "noise": 0.3, "chromatic": 0.2}
    r1, _ = apply(frame, params, None, **KW)
    r2, _ = apply(frame, params, None, **KW)
    np.testing.assert_array_equal(r1, r2)


def test_boundary():
    frame = _frame()
    # All params at min
    r_min, _ = apply(
        frame, {"tracking": 0.0, "noise": 0.0, "chromatic": 0.0}, None, **KW
    )
    assert r_min.shape == frame.shape
    assert r_min.dtype == np.uint8
    # All params at max
    r_max, _ = apply(
        frame, {"tracking": 1.0, "noise": 1.0, "chromatic": 1.0}, None, **KW
    )
    assert r_max.shape == frame.shape
    assert r_max.dtype == np.uint8


def test_state():
    frame = _frame()
    params = {"tracking": 0.5, "noise": 0.3, "chromatic": 0.2}
    _, state = apply(frame, params, None, **KW)
    assert state is None
