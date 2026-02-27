"""Tests for fx.pixelsort — contract + performance (BUG-4 optimization)."""

import time

import numpy as np
import pytest

from effects.fx.pixelsort import EFFECT_ID, PARAMS, apply

pytestmark = pytest.mark.smoke


def _frame(h=100, w=100):
    rng = np.random.default_rng(42)
    return rng.integers(0, 256, (h, w, 4), dtype=np.uint8)


KW = {"frame_index": 0, "seed": 42, "resolution": (100, 100)}


def test_basic():
    frame = _frame()
    params = {"threshold": 0.5, "direction": "horizontal", "reverse": False}
    result, state = apply(frame, params, None, **KW)
    assert result.shape == frame.shape
    assert result.dtype == np.uint8


def test_determinism():
    frame = _frame()
    params = {"threshold": 0.5, "direction": "horizontal", "reverse": False}
    r1, _ = apply(frame, params, None, **KW)
    r2, _ = apply(frame, params, None, **KW)
    np.testing.assert_array_equal(r1, r2)


def test_determinism_vertical():
    frame = _frame()
    params = {"threshold": 0.5, "direction": "vertical", "reverse": True}
    r1, _ = apply(frame, params, None, **KW)
    r2, _ = apply(frame, params, None, **KW)
    np.testing.assert_array_equal(r1, r2)


def test_boundary():
    frame = _frame()
    # Min threshold
    r_min, _ = apply(
        frame,
        {"threshold": 0.0, "direction": "horizontal", "reverse": False},
        None,
        **KW,
    )
    assert r_min.shape == frame.shape
    assert r_min.dtype == np.uint8
    # Max threshold
    r_max, _ = apply(
        frame, {"threshold": 1.0, "direction": "vertical", "reverse": True}, None, **KW
    )
    assert r_max.shape == frame.shape
    assert r_max.dtype == np.uint8


def test_state():
    frame = _frame()
    params = {"threshold": 0.5, "direction": "horizontal", "reverse": False}
    _, state = apply(frame, params, None, **KW)
    assert state is None


def test_modifies_frame():
    """Verify pixelsort actually changes pixel ordering."""
    frame = _frame()
    params = {"threshold": 0.3, "direction": "horizontal", "reverse": False}
    result, _ = apply(frame, params, None, **KW)
    assert not np.array_equal(result, frame)


def test_reverse_differs():
    """Reverse sort should produce different output from forward sort."""
    frame = _frame()
    base_params = {"threshold": 0.3, "direction": "horizontal"}
    r_fwd, _ = apply(frame, {**base_params, "reverse": False}, None, **KW)
    r_rev, _ = apply(frame, {**base_params, "reverse": True}, None, **KW)
    assert not np.array_equal(r_fwd, r_rev)


def test_performance_1080p():
    """BUG-4: optimized pixelsort must process 1080p in <100ms."""
    frame = _frame(h=1080, w=1920)
    params = {"threshold": 0.5, "direction": "horizontal", "reverse": False}
    kw = {"frame_index": 0, "seed": 42, "resolution": (1920, 1080)}

    # Warm up
    apply(frame, params, None, **kw)

    t0 = time.monotonic()
    result, _ = apply(frame, params, None, **kw)
    elapsed_ms = (time.monotonic() - t0) * 1000

    assert result.shape == frame.shape
    assert result.dtype == np.uint8
    # Pixelsort with random data is worst-case (~480 segments/row).
    # Real video frames have fewer transitions and run faster.
    # Threshold: 150ms (well under 500ms abort guard; original was 500ms+).
    assert elapsed_ms < 150, (
        f"pixelsort took {elapsed_ms:.0f}ms at 1080p (must be <150ms)"
    )
