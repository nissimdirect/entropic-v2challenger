"""Oracle tests for fx.transition_column_cascade.

See docs/plans/transitions-pattern.md for the transitions test template this
follows. Contract: frame_a = solid black, frame_b = the input frame, progress
= frame_index / duration_frames (clamped [0, 1]). At defaults (duration=30,
columns=40) on a 40px-wide frame, each column is its own 1px-wide bucket.
"""

import numpy as np
import pytest

from effects.fx.transition_column_cascade import EFFECT_ID, apply
from effects.registry import get

pytestmark = pytest.mark.smoke


def _solid_frame(w=40, h=10, r=200, g=100, b=50):
    frame = np.zeros((h, w, 4), dtype=np.uint8)
    frame[:, :, 0] = r
    frame[:, :, 1] = g
    frame[:, :, 2] = b
    frame[:, :, 3] = 255
    return frame


def test_registered_in_registry():
    """The registry-wiring guard: file existing != effect registered."""
    info = get(EFFECT_ID)
    assert info is not None, (
        f"{EFFECT_ID} not registered — check registry.py phase12_mods"
    )
    assert info["name"] == "Column Cascade"
    assert info["category"] == "transition"
    assert callable(info["fn"])


def test_frame_zero_is_fully_black():
    frame = _solid_frame()
    result, state = apply(frame, {}, None, frame_index=0, seed=42, resolution=(40, 10))
    assert state is None
    np.testing.assert_array_equal(result[:, :, :3], 0)
    np.testing.assert_array_equal(result[:, :, 3], 255)  # alpha preserved


def test_visible_transition_at_defaults():
    """At the default duration's midpoint, left half revealed, right half black."""
    frame = _solid_frame()
    kw = {"frame_index": 15, "seed": 42, "resolution": (40, 10)}
    result, _ = apply(frame, {}, None, **kw)

    left = result[0, 0, :3]
    right = result[0, 39, :3]
    np.testing.assert_array_equal(left, [200, 100, 50])
    np.testing.assert_array_equal(right, [0, 0, 0])

    # Genuinely visible: left half and right half differ.
    assert not np.array_equal(result[:, :20, :3], result[:, 20:, :3])


def test_fully_revealed_after_duration():
    frame = _solid_frame()
    kw = {"frame_index": 30, "seed": 42, "resolution": (40, 10)}
    result, _ = apply(frame, {}, None, **kw)
    np.testing.assert_array_equal(result[:, :, :3], frame[:, :, :3])
    np.testing.assert_array_equal(result[:, :, 3], frame[:, :, 3])


def test_progress_clamps_past_duration():
    """frame_index beyond duration_frames stays fully revealed (no wraparound)."""
    frame = _solid_frame()
    result_at_duration, _ = apply(
        frame, {}, None, frame_index=30, seed=42, resolution=(40, 10)
    )
    result_past_duration, _ = apply(
        frame, {}, None, frame_index=999, seed=42, resolution=(40, 10)
    )
    np.testing.assert_array_equal(result_at_duration, result_past_duration)


def test_determinism():
    rng = np.random.default_rng(7)
    frame = rng.integers(0, 256, (10, 40, 4), dtype=np.uint8)
    kw = {"frame_index": 12, "seed": 12345, "resolution": (40, 10)}
    result1, _ = apply(frame, {}, None, **kw)
    result2, _ = apply(frame, {}, None, **kw)
    np.testing.assert_array_equal(result1, result2)


def test_custom_params_respected():
    frame = _solid_frame()
    result, _ = apply(
        frame,
        {"duration_frames": 10, "columns": 4},
        None,
        frame_index=5,
        seed=42,
        resolution=(40, 10),
    )
    # progress=0.5 with 4 columns -> first 2 columns (of 4 buckets, 10px each)
    # fully revealed, last 2 fully black.
    np.testing.assert_array_equal(result[0, 0, :3], [200, 100, 50])
    np.testing.assert_array_equal(result[0, 39, :3], [0, 0, 0])


def test_params_clamp_out_of_range_values():
    """Trust-boundary guard: malformed/out-of-range params never crash or
    escape the declared min/max (feedback_numeric-trust-boundary.md)."""
    frame = _solid_frame()
    result, _ = apply(
        frame,
        {"duration_frames": -5, "columns": 99999},
        None,
        frame_index=0,
        seed=42,
        resolution=(40, 10),
    )
    assert result.shape == frame.shape
    assert result.dtype == np.uint8
