"""Tests for fx.invert effect."""

import numpy as np

from effects.fx.invert import apply


def test_invert_produces_255_minus_input():
    frame = np.zeros((100, 100, 4), dtype=np.uint8)
    frame[:, :, 0] = 200
    frame[:, :, 1] = 100
    frame[:, :, 2] = 50
    frame[:, :, 3] = 255
    result, state = apply(
        frame, {}, None, frame_index=0, seed=42, resolution=(100, 100)
    )
    assert state is None
    np.testing.assert_array_equal(result[:, :, 0], 55)
    np.testing.assert_array_equal(result[:, :, 1], 155)
    np.testing.assert_array_equal(result[:, :, 2], 205)
    np.testing.assert_array_equal(result[:, :, 3], 255)  # Alpha preserved


def test_invert_determinism():
    rng = np.random.default_rng(42)
    frame = rng.integers(0, 256, (100, 100, 4), dtype=np.uint8)
    kw = {"frame_index": 0, "seed": 12345, "resolution": (100, 100)}
    result1, _ = apply(frame, {}, None, **kw)
    result2, _ = apply(frame, {}, None, **kw)
    np.testing.assert_array_equal(result1, result2)


def test_invert_double_invert_is_identity():
    rng = np.random.default_rng(99)
    frame = rng.integers(0, 256, (50, 50, 4), dtype=np.uint8)
    kw = {"frame_index": 0, "seed": 0, "resolution": (50, 50)}
    inverted, _ = apply(frame, {}, None, **kw)
    restored, _ = apply(inverted, {}, None, **kw)
    np.testing.assert_array_equal(restored[:, :, :3], frame[:, :, :3])
