"""Oracle tests for fx.transition_row_waterfall.

See docs/plans/transitions-pattern.md for the transitions test template this
follows. Same contract as the column transitions, but the reveal sweeps
top to bottom along the row axis.
"""

import numpy as np
import pytest

from effects.fx.transition_row_waterfall import EFFECT_ID, apply
from effects.registry import get

pytestmark = pytest.mark.smoke


def _solid_frame(w=10, h=40, r=200, g=100, b=50):
    frame = np.zeros((h, w, 4), dtype=np.uint8)
    frame[:, :, 0] = r
    frame[:, :, 1] = g
    frame[:, :, 2] = b
    frame[:, :, 3] = 255
    return frame


def test_registered_in_registry():
    info = get(EFFECT_ID)
    assert info is not None, (
        f"{EFFECT_ID} not registered — check registry.py phase12_mods"
    )
    assert info["name"] == "Row Waterfall"
    assert info["category"] == "transition"
    assert callable(info["fn"])


def test_frame_zero_is_fully_black():
    frame = _solid_frame()
    result, state = apply(frame, {}, None, frame_index=0, seed=42, resolution=(10, 40))
    assert state is None
    np.testing.assert_array_equal(result[:, :, :3], 0)
    np.testing.assert_array_equal(result[:, :, 3], 255)


def test_visible_transition_at_defaults():
    """At the default duration's midpoint, top half revealed, bottom half black."""
    frame = _solid_frame()
    kw = {"frame_index": 15, "seed": 42, "resolution": (10, 40)}
    result, _ = apply(frame, {}, None, **kw)

    top = result[0, 0, :3]
    bottom = result[39, 0, :3]
    np.testing.assert_array_equal(top, [200, 100, 50])
    np.testing.assert_array_equal(bottom, [0, 0, 0])
    assert not np.array_equal(result[:20, :, :3], result[20:, :, :3])


def test_fully_revealed_after_duration():
    frame = _solid_frame()
    result, _ = apply(frame, {}, None, frame_index=30, seed=42, resolution=(10, 40))
    np.testing.assert_array_equal(result[:, :, :3], frame[:, :, :3])
    np.testing.assert_array_equal(result[:, :, 3], frame[:, :, 3])


def test_progress_clamps_past_duration():
    frame = _solid_frame()
    result_at_duration, _ = apply(
        frame, {}, None, frame_index=30, seed=42, resolution=(10, 40)
    )
    result_past_duration, _ = apply(
        frame, {}, None, frame_index=999, seed=42, resolution=(10, 40)
    )
    np.testing.assert_array_equal(result_at_duration, result_past_duration)


def test_determinism():
    rng = np.random.default_rng(3)
    frame = rng.integers(0, 256, (40, 10, 4), dtype=np.uint8)
    kw = {"frame_index": 12, "seed": 55, "resolution": (10, 40)}
    result1, _ = apply(frame, {}, None, **kw)
    result2, _ = apply(frame, {}, None, **kw)
    np.testing.assert_array_equal(result1, result2)


def test_custom_params_respected():
    frame = _solid_frame()
    result, _ = apply(
        frame,
        {"duration_frames": 10, "rows": 4},
        None,
        frame_index=5,
        seed=42,
        resolution=(10, 40),
    )
    np.testing.assert_array_equal(result[0, 0, :3], [200, 100, 50])
    np.testing.assert_array_equal(result[39, 0, :3], [0, 0, 0])


def test_params_clamp_out_of_range_values():
    frame = _solid_frame()
    result, _ = apply(
        frame,
        {"duration_frames": -5, "rows": 99999},
        None,
        frame_index=0,
        seed=42,
        resolution=(10, 40),
    )
    assert result.shape == frame.shape
    assert result.dtype == np.uint8
