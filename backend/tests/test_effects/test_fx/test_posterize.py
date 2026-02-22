"""Tests for fx.posterize — 4-test contract (basic, determinism, boundary, state)."""

import numpy as np

from effects.fx.posterize import EFFECT_ID, PARAMS, apply


def _frame(h=100, w=100):
    rng = np.random.default_rng(42)
    return rng.integers(0, 256, (h, w, 4), dtype=np.uint8)


KW = {"frame_index": 0, "seed": 42, "resolution": (100, 100)}


def test_basic():
    frame = _frame()
    result, state = apply(frame, {"levels": 4}, None, **KW)
    assert result.shape == frame.shape
    assert result.dtype == np.uint8
    # With 4 levels, unique values per channel should be <= 4
    unique_r = np.unique(result[:, :, 0])
    assert len(unique_r) <= 4
    # Alpha preserved
    np.testing.assert_array_equal(result[:, :, 3], frame[:, :, 3])


def test_determinism():
    frame = _frame()
    params = {"levels": 4}
    r1, _ = apply(frame, params, None, **KW)
    r2, _ = apply(frame, params, None, **KW)
    np.testing.assert_array_equal(r1, r2)


def test_boundary():
    frame = _frame()
    # Min: levels=2
    r_min, _ = apply(frame, {"levels": 2}, None, **KW)
    assert r_min.shape == frame.shape
    unique_r = np.unique(r_min[:, :, 0])
    assert len(unique_r) <= 2
    # Max: levels=32
    r_max, _ = apply(frame, {"levels": 32}, None, **KW)
    assert r_max.shape == frame.shape
    assert r_max.dtype == np.uint8


def test_state():
    frame = _frame()
    _, state = apply(frame, {"levels": 4}, None, **KW)
    assert state is None
