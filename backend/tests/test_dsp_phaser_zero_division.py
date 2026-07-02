"""F-0514-15 regression: dsp_phaser must not warn or NaN on all-black frame.

Pre-fix dsp_phaser.py:187 used:
    scale = np.where(brightness > 0.005, transfer / brightness, 1.0)

`np.where` evaluates BOTH branches before selecting, so the
`transfer / brightness` division ran for every pixel — including zero
brightness — emitting numpy "RuntimeWarning: divide by zero encountered"
and "invalid value encountered in true_divide" on all-black input.

Fix uses np.divide with `where=` clause so the slots where brightness <=
0.005 are sourced from `out=` (ones), not the division.

This test exercises:
  - an all-black 1080p frame (worst case: every pixel has brightness 0)
  - a partially-black frame (mix of zeros and non-zeros)
"""

import warnings

import numpy as np
import pytest

from effects.fx import dsp_phaser

pytestmark = pytest.mark.smoke


def _black_frame(width: int = 320, height: int = 180) -> np.ndarray:
    """Pure black RGBA frame (alpha = 255 so the alpha channel passes through)."""
    return np.dstack(
        [
            np.zeros((height, width), dtype=np.uint8),
            np.zeros((height, width), dtype=np.uint8),
            np.zeros((height, width), dtype=np.uint8),
            np.full((height, width), 255, dtype=np.uint8),
        ]
    )


def _mixed_frame(width: int = 320, height: int = 180) -> np.ndarray:
    """Half-black, half-white RGBA frame."""
    frame = _black_frame(width, height)
    frame[:, width // 2 :, :3] = 255
    return frame


def test_dsp_phaser_does_not_warn_on_all_black_frame():
    """No numpy divide-by-zero / invalid-value warnings on pure black input."""
    frame = _black_frame()
    params = {"rate": 1.0, "band_width": 0.2}

    with warnings.catch_warnings():
        warnings.simplefilter("error", RuntimeWarning)
        result, _ = dsp_phaser.apply(
            frame,
            params,
            state_in=None,
            frame_index=0,
            seed=0,
            resolution=(frame.shape[1], frame.shape[0]),
        )

    assert result.shape == frame.shape
    assert not np.any(np.isnan(result.astype(np.float32)))
    assert not np.any(np.isinf(result.astype(np.float32)))


def test_dsp_phaser_handles_mixed_zero_and_nonzero_pixels():
    """Mixed black/white frame should produce no NaN/Inf and stay in [0, 255]."""
    frame = _mixed_frame()
    params = {"rate": 0.5, "band_width": 0.15}

    with warnings.catch_warnings():
        warnings.simplefilter("error", RuntimeWarning)
        result, _ = dsp_phaser.apply(
            frame,
            params,
            state_in=None,
            frame_index=3,
            seed=42,
            resolution=(frame.shape[1], frame.shape[0]),
        )

    arr = result.astype(np.float32)
    assert result.shape == frame.shape
    assert not np.any(np.isnan(arr))
    assert not np.any(np.isinf(arr))
    assert arr.min() >= 0
    assert arr.max() <= 255


def test_dsp_phaser_preserves_alpha_on_all_black_frame():
    """Alpha channel should pass through untouched even on all-black frames."""
    frame = _black_frame()
    frame[..., 3] = 200  # arbitrary non-default alpha
    result, _ = dsp_phaser.apply(
        frame,
        {"rate": 1.0, "band_width": 0.2},
        state_in=None,
        frame_index=0,
        seed=0,
        resolution=(frame.shape[1], frame.shape[0]),
    )
    assert np.array_equal(result[..., 3], frame[..., 3])
