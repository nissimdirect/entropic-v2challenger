"""Tests for fx.edge_detect — 4-test contract (basic, determinism, boundary, state)."""

import numpy as np
import pytest

from effects.fx.edge_detect import EFFECT_ID, PARAMS, apply

pytestmark = pytest.mark.smoke


def _frame(h=100, w=100):
    rng = np.random.default_rng(42)
    return rng.integers(0, 256, (h, w, 4), dtype=np.uint8)


KW = {"frame_index": 0, "seed": 42, "resolution": (100, 100)}


def test_basic():
    frame = _frame()
    params = {"method": "sobel"}
    result, state = apply(frame, params, None, **KW)
    assert result.shape == frame.shape
    assert result.dtype == np.uint8


def test_determinism():
    frame = _frame()
    params = {"method": "sobel"}
    r1, _ = apply(frame, params, None, **KW)
    r2, _ = apply(frame, params, None, **KW)
    np.testing.assert_array_equal(r1, r2)


def test_boundary():
    frame = _frame()
    # Test each method option
    for method in ["sobel", "canny", "laplacian"]:
        result, _ = apply(frame, {"method": method}, None, **KW)
        assert result.shape == frame.shape
        assert result.dtype == np.uint8


def test_state():
    frame = _frame()
    _, state = apply(frame, {"method": "sobel"}, None, **KW)
    assert state is None
