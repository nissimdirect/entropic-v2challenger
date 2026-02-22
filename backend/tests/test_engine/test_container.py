"""Tests for effect container — mask + mix pipeline."""

import numpy as np

from effects.fx.invert import apply as invert_apply
from engine.container import EffectContainer


def _make_frame(r=128, g=64, b=32, a=255, h=100, w=100):
    frame = np.zeros((h, w, 4), dtype=np.uint8)
    frame[:, :, 0] = r
    frame[:, :, 1] = g
    frame[:, :, 2] = b
    frame[:, :, 3] = a
    return frame


def test_container_no_mask_full_mix():
    """mix=1.0, no mask → fully inverted."""
    container = EffectContainer(invert_apply, "fx.invert")
    frame = _make_frame(r=200, g=100, b=50)
    output, _ = container.process(
        frame, {}, None, frame_index=0, project_seed=42, resolution=(100, 100)
    )
    np.testing.assert_array_equal(output[:, :, 0], 55)
    np.testing.assert_array_equal(output[:, :, 1], 155)
    np.testing.assert_array_equal(output[:, :, 2], 205)
    np.testing.assert_array_equal(output[:, :, 3], 255)


def test_container_mix_half():
    """mix=0.5 → 50% blend between dry and wet."""
    container = EffectContainer(invert_apply, "fx.invert")
    frame = _make_frame(r=200, g=100, b=50)
    output, _ = container.process(
        frame,
        {"_mix": 0.5},
        None,
        frame_index=0,
        project_seed=42,
        resolution=(100, 100),
    )
    # Expected: (200*0.5 + 55*0.5) = 127.5 → 127 or 128
    assert abs(int(output[0, 0, 0]) - 128) <= 1
    assert abs(int(output[0, 0, 1]) - 128) <= 1
    assert abs(int(output[0, 0, 2]) - 128) <= 1


def test_container_mix_zero_is_dry():
    """mix=0.0 → output equals input exactly."""
    container = EffectContainer(invert_apply, "fx.invert")
    frame = _make_frame(r=200, g=100, b=50)
    output, _ = container.process(
        frame,
        {"_mix": 0.0},
        None,
        frame_index=0,
        project_seed=42,
        resolution=(100, 100),
    )
    np.testing.assert_array_equal(output, frame)


def test_container_checkerboard_mask():
    """Checkerboard mask → inverted only in masked regions."""
    container = EffectContainer(invert_apply, "fx.invert")
    frame = _make_frame(r=200, g=100, b=50)

    # Checkerboard mask: alternating 1.0 and 0.0
    mask = np.zeros((100, 100), dtype=np.float32)
    mask[::2, ::2] = 1.0  # Even rows, even cols = fully wet
    mask[1::2, 1::2] = 1.0  # Odd rows, odd cols = fully wet

    output, _ = container.process(
        frame,
        {"_mask": mask},
        None,
        frame_index=0,
        project_seed=42,
        resolution=(100, 100),
    )

    # Masked pixels (1.0) should be inverted
    assert output[0, 0, 0] == 55  # Even,even → inverted
    assert output[0, 0, 1] == 155
    # Unmasked pixels (0.0) should be original
    assert output[0, 1, 0] == 200  # Even,odd → original
    assert output[0, 1, 1] == 100


def test_container_mask_all_zeros_is_dry():
    """Mask of all zeros → output equals input."""
    container = EffectContainer(invert_apply, "fx.invert")
    frame = _make_frame(r=200, g=100, b=50)
    mask = np.zeros((100, 100), dtype=np.float32)
    output, _ = container.process(
        frame,
        {"_mask": mask},
        None,
        frame_index=0,
        project_seed=42,
        resolution=(100, 100),
    )
    np.testing.assert_array_equal(output, frame)


def test_container_mask_all_ones_is_wet():
    """Mask of all ones → output equals fully effected."""
    container = EffectContainer(invert_apply, "fx.invert")
    frame = _make_frame(r=200, g=100, b=50)
    mask = np.ones((100, 100), dtype=np.float32)
    output, _ = container.process(
        frame,
        {"_mask": mask},
        None,
        frame_index=0,
        project_seed=42,
        resolution=(100, 100),
    )
    np.testing.assert_array_equal(output[:, :, 0], 55)
    np.testing.assert_array_equal(output[:, :, 1], 155)
    np.testing.assert_array_equal(output[:, :, 2], 205)
