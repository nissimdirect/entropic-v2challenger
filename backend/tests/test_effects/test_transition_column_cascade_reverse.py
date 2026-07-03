"""Oracle tests for fx.transition_column_cascade_reverse.

See docs/plans/transitions-pattern.md for the transitions test template this
follows. Mirrors test_transition_column_cascade.py but the reveal order runs
right to left.
"""

import numpy as np
import pytest

from effects.fx.transition_column_cascade_reverse import EFFECT_ID, apply
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
    info = get(EFFECT_ID)
    assert info is not None, (
        f"{EFFECT_ID} not registered — check registry.py phase12_mods"
    )
    assert info["name"] == "Column Cascade Reverse"
    assert info["category"] == "transition"
    assert callable(info["fn"])


def test_frame_zero_is_fully_black():
    frame = _solid_frame()
    result, state = apply(frame, {}, None, frame_index=0, seed=42, resolution=(40, 10))
    assert state is None
    np.testing.assert_array_equal(result[:, :, :3], 0)


def test_visible_transition_at_defaults_reveals_right_first():
    """At the default duration's midpoint, right half revealed, left half black
    — the mirror image of the forward cascade."""
    frame = _solid_frame()
    kw = {"frame_index": 15, "seed": 42, "resolution": (40, 10)}
    result, _ = apply(frame, {}, None, **kw)

    left = result[0, 0, :3]
    right = result[0, 39, :3]
    np.testing.assert_array_equal(right, [200, 100, 50])
    np.testing.assert_array_equal(left, [0, 0, 0])
    assert not np.array_equal(result[:, :20, :3], result[:, 20:, :3])


def test_fully_revealed_after_duration():
    frame = _solid_frame()
    result, _ = apply(frame, {}, None, frame_index=30, seed=42, resolution=(40, 10))
    np.testing.assert_array_equal(result[:, :, :3], frame[:, :, :3])


def test_determinism():
    rng = np.random.default_rng(7)
    frame = rng.integers(0, 256, (10, 40, 4), dtype=np.uint8)
    kw = {"frame_index": 12, "seed": 999, "resolution": (40, 10)}
    result1, _ = apply(frame, {}, None, **kw)
    result2, _ = apply(frame, {}, None, **kw)
    np.testing.assert_array_equal(result1, result2)


def test_mirrors_forward_cascade():
    """At the same progress, reverse's revealed region is the horizontal
    mirror of the forward cascade's revealed region."""
    from effects.fx.transition_column_cascade import apply as forward_apply

    frame = _solid_frame()
    kw = {"frame_index": 15, "seed": 42, "resolution": (40, 10)}
    forward_result, _ = forward_apply(frame, {}, None, **kw)
    reverse_result, _ = apply(frame, {}, None, **kw)

    np.testing.assert_array_equal(forward_result[:, :, :3], reverse_result[:, ::-1, :3])


def test_params_clamp_out_of_range_values():
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
