"""Tests for util.curves effect."""

import json

import numpy as np
import pytest

from effects.util.curves import apply

pytestmark = pytest.mark.smoke

KW = {"frame_index": 0, "seed": 42, "resolution": (100, 100)}


def _frame(r=128, g=128, b=128, a=255, size=100):
    frame = np.zeros((size, size, 4), dtype=np.uint8)
    frame[:, :, 0] = r
    frame[:, :, 1] = g
    frame[:, :, 2] = b
    frame[:, :, 3] = a
    return frame


def test_identity_diagonal_unchanged():
    """Identity curve (diagonal) should leave frame unchanged."""
    frame = _frame(100, 150, 200)
    params = {"points": [[0, 0], [128, 128], [255, 255]]}
    result, state = apply(frame, params, None, **KW)
    assert state is None
    np.testing.assert_array_equal(result, frame)


def test_inverted_curve():
    """Inverted curve [[0,255],[255,0]] should approximately invert."""
    frame = _frame(0, 128, 255)
    params = {"points": [[0, 255], [255, 0]], "interpolation": "linear"}
    result, _ = apply(frame, params, None, **KW)
    assert result[0, 0, 0] == 255  # 0 -> 255
    assert result[0, 0, 2] == 0  # 255 -> 0


def test_per_channel_r():
    """Per-channel 'r' mode only changes red."""
    frame = _frame(128, 128, 128)
    params = {"points": [[0, 0], [128, 200], [255, 255]], "channel": "r"}
    result, _ = apply(frame, params, None, **KW)
    assert result[0, 0, 0] != 128  # Red changed
    assert result[0, 0, 1] == 128  # Green unchanged
    assert result[0, 0, 2] == 128  # Blue unchanged


def test_linear_interpolation():
    """Linear interpolation should produce exact mapping."""
    frame = _frame(64, 128, 192)
    params = {"points": [[0, 0], [128, 64], [255, 255]], "interpolation": "linear"}
    result, _ = apply(frame, params, None, **KW)
    # At x=64 with linear from (0,0) to (128,64): y = 64/128*64 = 32
    assert result[0, 0, 0] == 32
    # At x=128: y = 64
    assert result[0, 0, 1] == 64


def test_s_curve_increases_contrast():
    """S-curve should increase standard deviation (contrast)."""
    rng = np.random.default_rng(42)
    frame = rng.integers(50, 200, (100, 100, 4), dtype=np.uint8)
    frame[:, :, 3] = 255
    original_std = frame[:, :, :3].astype(float).std()

    # S-curve: darken shadows, brighten highlights
    params = {"points": [[0, 0], [64, 32], [192, 224], [255, 255]]}
    result, _ = apply(frame, params, None, **KW)
    new_std = result[:, :, :3].astype(float).std()
    assert new_std > original_std


def test_single_control_point_no_crash():
    """Single control point should not crash (falls back to identity)."""
    frame = _frame(128, 128, 128)
    params = {"points": [[128, 128]]}
    result, _ = apply(frame, params, None, **KW)
    assert result.shape == frame.shape


def test_16_control_points():
    """16 control points (max spec) should not crash."""
    pts = [[i * 16, i * 16] for i in range(16)]  # Identity diagonal
    frame = _frame(128, 128, 128)
    params = {"points": pts}
    result, _ = apply(frame, params, None, **KW)
    assert result.shape == frame.shape


def test_json_string_points():
    """Points as JSON string should work."""
    frame = _frame(0, 128, 255)
    params = {"points": json.dumps([[0, 255], [255, 0]]), "interpolation": "linear"}
    result, _ = apply(frame, params, None, **KW)
    assert result[0, 0, 0] == 255


def test_alpha_preserved():
    """Alpha channel should not change."""
    frame = _frame(128, 128, 128, a=100)
    params = {"points": [[0, 255], [255, 0]], "interpolation": "linear"}
    result, _ = apply(frame, params, None, **KW)
    np.testing.assert_array_equal(result[:, :, 3], 100)


def test_determinism():
    """Same input produces same output."""
    rng = np.random.default_rng(42)
    frame = rng.integers(0, 256, (50, 50, 4), dtype=np.uint8)
    params = {"points": [[0, 0], [64, 100], [192, 150], [255, 255]]}
    result1, _ = apply(frame, params, None, **KW)
    result2, _ = apply(frame, params, None, **KW)
    np.testing.assert_array_equal(result1, result2)


def test_empty_frame():
    """Empty frame should not crash."""
    frame = np.zeros((0, 0, 4), dtype=np.uint8)
    result, _ = apply(frame, {}, None, **KW)
    assert result.shape == frame.shape


def test_duplicate_x_values():
    """Duplicate x values should not crash."""
    frame = _frame(128, 128, 128)
    params = {"points": [[0, 0], [128, 100], [128, 200], [255, 255]]}
    result, _ = apply(frame, params, None, **KW)
    assert result.shape == frame.shape
