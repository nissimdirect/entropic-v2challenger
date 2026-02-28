"""Integration test — chaining all Color Suite effects."""

import time

import numpy as np
import pytest

from effects.util.levels import apply as levels_apply
from effects.util.curves import apply as curves_apply
from effects.util.hsl_adjust import apply as hsl_apply
from effects.util.color_balance import apply as cb_apply
from effects.util.auto_levels import apply as auto_apply
from effects.util.histogram import compute_histogram

pytestmark = pytest.mark.smoke

KW = {"frame_index": 0, "seed": 42, "resolution": (1920, 1080)}


def test_full_chain_changes_frame():
    """Levels -> Curves -> HSL -> Color Balance chain should modify the frame."""
    rng = np.random.default_rng(42)
    frame = rng.integers(0, 256, (1080, 1920, 4), dtype=np.uint8)
    frame[:, :, 3] = 255

    # Levels
    out, _ = levels_apply(frame, {"gamma": 0.8}, None, **KW)
    # Curves (S-curve)
    out, _ = curves_apply(
        out, {"points": [[0, 0], [64, 32], [192, 224], [255, 255]]}, None, **KW
    )
    # HSL
    out, _ = hsl_apply(out, {"saturation": 20.0}, None, **KW)
    # Color Balance
    out, _ = cb_apply(out, {"shadows_b": 30, "highlights_r": 20}, None, **KW)

    assert not np.array_equal(out, frame)
    assert out.shape == frame.shape
    assert out.dtype == np.uint8


def test_full_chain_determinism():
    """Same chain applied twice produces identical output."""
    rng = np.random.default_rng(42)
    frame = rng.integers(0, 256, (100, 100, 4), dtype=np.uint8)

    def run_chain(f):
        out, _ = levels_apply(
            f, {"gamma": 0.8}, None, frame_index=0, seed=42, resolution=(100, 100)
        )
        out, _ = curves_apply(
            out,
            {"points": [[0, 0], [64, 32], [192, 224], [255, 255]]},
            None,
            frame_index=0,
            seed=42,
            resolution=(100, 100),
        )
        out, _ = hsl_apply(
            out,
            {"saturation": 20.0},
            None,
            frame_index=0,
            seed=42,
            resolution=(100, 100),
        )
        out, _ = cb_apply(
            out, {"shadows_b": 30}, None, frame_index=0, seed=42, resolution=(100, 100)
        )
        return out

    result1 = run_chain(frame)
    result2 = run_chain(frame)
    np.testing.assert_array_equal(result1, result2)


def test_identity_params_identity_output():
    """Each effect with identity params should return input unchanged."""
    rng = np.random.default_rng(42)
    frame = rng.integers(0, 256, (50, 50, 4), dtype=np.uint8)
    kw = {"frame_index": 0, "seed": 42, "resolution": (50, 50)}

    # Levels identity
    out, _ = levels_apply(frame, {}, None, **kw)
    np.testing.assert_array_equal(out, frame)

    # Curves identity (diagonal)
    out, _ = curves_apply(
        frame, {"points": [[0, 0], [128, 128], [255, 255]]}, None, **kw
    )
    np.testing.assert_array_equal(out, frame)

    # HSL identity
    out, _ = hsl_apply(frame, {}, None, **kw)
    np.testing.assert_array_equal(out, frame)

    # Color balance identity
    out, _ = cb_apply(frame, {}, None, **kw)
    np.testing.assert_array_equal(out, frame)


def test_histogram_after_chain():
    """Histogram of processed frame should be valid."""
    frame = np.zeros((100, 100, 4), dtype=np.uint8)
    frame[:, :, 0] = 128
    frame[:, :, 1] = 64
    frame[:, :, 2] = 200
    frame[:, :, 3] = 255
    kw = {"frame_index": 0, "seed": 42, "resolution": (100, 100)}

    out, _ = levels_apply(frame, {"gamma": 0.5}, None, **kw)
    hist = compute_histogram(out)

    assert sum(hist["r"]) == 10000
    assert sum(hist["g"]) == 10000
    assert sum(hist["b"]) == 10000


@pytest.mark.perf
def test_chain_performance_1080p():
    """All 4 color tools chained should complete within 100ms at 1080p."""
    rng = np.random.default_rng(42)
    frame = rng.integers(0, 256, (1080, 1920, 4), dtype=np.uint8)

    start = time.perf_counter()
    out, _ = levels_apply(frame, {"gamma": 0.8}, None, **KW)
    out, _ = curves_apply(
        out, {"points": [[0, 0], [64, 32], [192, 224], [255, 255]]}, None, **KW
    )
    out, _ = hsl_apply(out, {"saturation": 20.0}, None, **KW)
    out, _ = cb_apply(out, {"shadows_b": 30, "highlights_r": 20}, None, **KW)
    elapsed = time.perf_counter() - start

    assert elapsed < 0.1, f"Chain took {elapsed * 1000:.1f}ms, limit is 100ms"
