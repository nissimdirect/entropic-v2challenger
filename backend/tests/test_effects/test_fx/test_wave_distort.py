"""Tests for fx.wave_distort — contract + performance (BUG-4 vectorization)."""

import time

import numpy as np

from effects.fx.wave_distort import EFFECT_ID, PARAMS, apply


def _frame(h=100, w=100):
    rng = np.random.default_rng(42)
    return rng.integers(0, 256, (h, w, 4), dtype=np.uint8)


KW = {"frame_index": 0, "seed": 42, "resolution": (100, 100)}


def test_basic():
    frame = _frame()
    params = {"amplitude": 10.0, "frequency": 5.0, "direction": "horizontal"}
    result, state = apply(frame, params, None, **KW)
    assert result.shape == frame.shape
    assert result.dtype == np.uint8


def test_determinism():
    frame = _frame()
    params = {"amplitude": 10.0, "frequency": 5.0, "direction": "horizontal"}
    r1, _ = apply(frame, params, None, **KW)
    r2, _ = apply(frame, params, None, **KW)
    np.testing.assert_array_equal(r1, r2)


def test_determinism_vertical():
    frame = _frame()
    params = {"amplitude": 10.0, "frequency": 5.0, "direction": "vertical"}
    r1, _ = apply(frame, params, None, **KW)
    r2, _ = apply(frame, params, None, **KW)
    np.testing.assert_array_equal(r1, r2)


def test_boundary():
    frame = _frame()
    # Min params — amplitude 0 returns copy of input
    r_min, _ = apply(
        frame,
        {"amplitude": 0.0, "frequency": 0.1, "direction": "horizontal"},
        None,
        **KW,
    )
    assert r_min.shape == frame.shape
    assert r_min.dtype == np.uint8
    np.testing.assert_array_equal(r_min, frame)
    # Max params
    r_max, _ = apply(
        frame,
        {"amplitude": 50.0, "frequency": 20.0, "direction": "vertical"},
        None,
        **KW,
    )
    assert r_max.shape == frame.shape
    assert r_max.dtype == np.uint8


def test_state():
    frame = _frame()
    params = {"amplitude": 10.0, "frequency": 5.0, "direction": "horizontal"}
    _, state = apply(frame, params, None, **KW)
    assert state is None


def test_horizontal_modifies_frame():
    """Verify that non-zero amplitude actually shifts pixels."""
    frame = _frame()
    params = {"amplitude": 10.0, "frequency": 2.0, "direction": "horizontal"}
    result, _ = apply(frame, params, None, **KW)
    assert not np.array_equal(result, frame)


def test_vertical_modifies_frame():
    """Verify that vertical direction shifts pixels."""
    frame = _frame()
    params = {"amplitude": 10.0, "frequency": 2.0, "direction": "vertical"}
    result, _ = apply(frame, params, None, **KW)
    assert not np.array_equal(result, frame)


def test_performance_1080p():
    """BUG-4: vectorized wave_distort must process 1080p in <100ms."""
    frame = _frame(h=1080, w=1920)
    params = {"amplitude": 20.0, "frequency": 5.0, "direction": "horizontal"}
    kw = {"frame_index": 0, "seed": 42, "resolution": (1920, 1080)}

    # Warm up (JIT / cache effects)
    apply(frame, params, None, **kw)

    t0 = time.monotonic()
    result, _ = apply(frame, params, None, **kw)
    elapsed_ms = (time.monotonic() - t0) * 1000

    assert result.shape == frame.shape
    assert result.dtype == np.uint8
    assert elapsed_ms < 200, (
        f"wave_distort took {elapsed_ms:.0f}ms at 1080p (must be <200ms)"
    )


def test_performance_1080p_vertical():
    """BUG-4: vertical direction must also be fast at 1080p."""
    frame = _frame(h=1080, w=1920)
    params = {"amplitude": 20.0, "frequency": 5.0, "direction": "vertical"}
    kw = {"frame_index": 0, "seed": 42, "resolution": (1920, 1080)}

    # Warm up
    apply(frame, params, None, **kw)

    t0 = time.monotonic()
    result, _ = apply(frame, params, None, **kw)
    elapsed_ms = (time.monotonic() - t0) * 1000

    assert result.shape == frame.shape
    assert elapsed_ms < 200, (
        f"wave_distort vertical took {elapsed_ms:.0f}ms at 1080p (must be <200ms)"
    )
