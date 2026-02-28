"""Tests for effect container — mask + mix pipeline."""

from unittest.mock import patch

import numpy as np
import pytest
import sentry_sdk

from effects.fx.invert import apply as invert_apply
from engine.container import EffectContainer

pytestmark = pytest.mark.smoke


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


# --- Exception isolation tests (Item 1) ---


def _crashing_effect(frame, params, state_in, *, frame_index, seed, resolution):
    """Effect that always raises."""
    raise ZeroDivisionError("Deliberate crash")


def _wrong_dtype_effect(frame, params, state_in, *, frame_index, seed, resolution):
    """Effect that returns float64 instead of uint8."""
    return frame.astype(np.float64), state_in


def _wrong_shape_effect(frame, params, state_in, *, frame_index, seed, resolution):
    """Effect that returns wrong shape."""
    return np.zeros((10, 10, 4), dtype=np.uint8), state_in


def _state_corrupting_effect(frame, params, state_in, *, frame_index, seed, resolution):
    """Effect that corrupts state then crashes."""
    if state_in is not None:
        state_in["corrupted"] = True
    raise RuntimeError("Crash after state corruption")


def test_crashing_effect_returns_input_frame():
    """Crashing effect returns input frame unchanged (pass-through)."""
    container = EffectContainer(_crashing_effect, "test.crash")
    frame = _make_frame(r=200, g=100, b=50)
    output, state = container.process(
        frame, {}, None, frame_index=0, project_seed=42, resolution=(100, 100)
    )
    np.testing.assert_array_equal(output, frame)
    assert state is None
    assert container.last_error is not None
    assert isinstance(container.last_error, ZeroDivisionError)


def test_crashing_effect_chain_continues():
    """After a crash, subsequent containers can still process."""
    container = EffectContainer(_crashing_effect, "test.crash")
    frame = _make_frame(r=200, g=100, b=50)
    output, _ = container.process(
        frame, {}, None, frame_index=0, project_seed=42, resolution=(100, 100)
    )
    # Container returns pass-through — verify the frame is usable as input to next container
    container2 = EffectContainer(invert_apply, "fx.invert")
    output2, _ = container2.process(
        output, {}, None, frame_index=0, project_seed=42, resolution=(100, 100)
    )
    np.testing.assert_array_equal(output2[:, :, 0], 55)


def test_crashing_effect_sentry_context_has_param_keys():
    """Sentry context contains param keys but NOT values (PII safety)."""
    container = EffectContainer(_crashing_effect, "test.crash")
    frame = _make_frame()

    captured_extras = []

    with patch("engine.container._capture_with_context") as mock_capture:
        container.process(
            frame,
            {"brightness": 0.5, "secret_path": "/Users/me/file.mp4"},
            None,
            frame_index=7,
            project_seed=42,
            resolution=(100, 100),
        )

    mock_capture.assert_called_once()
    _, _, extra = mock_capture.call_args[0]
    assert "param_keys" in extra
    assert "brightness" in extra["param_keys"]
    assert "secret_path" in extra["param_keys"]
    # Verify values are NOT in context
    assert 0.5 not in extra.values()
    assert "/Users/me/file.mp4" not in extra.values()


def test_crashing_effect_preserves_state_in():
    """state_in is preserved (not None'd out) on crash."""
    container = EffectContainer(_crashing_effect, "test.crash")
    frame = _make_frame()
    original_state = {"counter": 5, "buffer": [1, 2, 3]}
    _, state = container.process(
        frame,
        {},
        original_state,
        frame_index=0,
        project_seed=42,
        resolution=(100, 100),
    )
    assert state is original_state
    assert state["counter"] == 5


def test_wrong_dtype_output_handled():
    """Effect returning float64 is auto-converted to uint8."""
    container = EffectContainer(_wrong_dtype_effect, "test.wrong_dtype")
    frame = _make_frame(r=200, g=100, b=50)
    output, _ = container.process(
        frame, {}, None, frame_index=0, project_seed=42, resolution=(100, 100)
    )
    assert output.dtype == np.uint8
    assert output.shape == frame.shape


def test_wrong_shape_output_isolated():
    """Effect returning wrong shape returns pass-through."""
    container = EffectContainer(_wrong_shape_effect, "test.wrong_shape")
    frame = _make_frame(r=200, g=100, b=50)
    output, _ = container.process(
        frame, {}, None, frame_index=0, project_seed=42, resolution=(100, 100)
    )
    np.testing.assert_array_equal(output, frame)
    assert container.last_error is not None


def test_state_corrupting_crash_doesnt_cascade():
    """Effect that corrupts state_in before crashing still returns state."""
    container = EffectContainer(_state_corrupting_effect, "test.state_corrupt")
    frame = _make_frame()
    original_state = {"counter": 5}
    _, state = container.process(
        frame,
        {},
        original_state,
        frame_index=0,
        project_seed=42,
        resolution=(100, 100),
    )
    assert state is original_state
