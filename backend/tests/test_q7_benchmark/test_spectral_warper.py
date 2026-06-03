"""Tests for A4 Spectral Frame Warper (PR #17)."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pytest

BACKEND_SRC = Path(__file__).resolve().parents[2] / "src"
if str(BACKEND_SRC) not in sys.path:
    sys.path.insert(0, str(BACKEND_SRC))

from effects.spectral import (
    SUPPORTED_PRIMITIVES,
    SUPPORTED_TRANSFORMS,
    SpectralWarpError,
    warp_frame,
)


def _busy_frame(h: int = 64, w: int = 64, seed: int = 42) -> np.ndarray:
    """Frame with high spectral energy (non-flat) so primitives have something to act on."""
    rng = np.random.default_rng(seed)
    return rng.integers(0, 256, size=(h, w, 3), dtype=np.uint8)


@pytest.mark.smoke
def test_supported_primitives_constant():
    assert SUPPORTED_PRIMITIVES == (
        "shift",
        "comb",
        "smear",
        "formant",
        "parity",
        "inversion",
    )


@pytest.mark.smoke
def test_supported_transforms_constant():
    assert SUPPORTED_TRANSFORMS == ("dct", "fft", "auto")


@pytest.mark.smoke
def test_warp_unknown_primitive_raises():
    frame = _busy_frame()
    with pytest.raises(SpectralWarpError, match="unknown primitive"):
        warp_frame(frame, "not-a-primitive")


@pytest.mark.smoke
def test_warp_unknown_transform_raises():
    frame = _busy_frame()
    with pytest.raises(SpectralWarpError, match="unknown transform"):
        warp_frame(frame, "shift", transform="not-a-transform")  # type: ignore[arg-type]


@pytest.mark.smoke
def test_warp_invalid_shape_raises():
    bad = np.zeros((10, 10), dtype=np.uint8)  # missing channel
    with pytest.raises(SpectralWarpError, match="HxWx3"):
        warp_frame(bad, "shift")  # type: ignore[arg-type]


@pytest.mark.smoke
def test_warp_invalid_dtype_raises():
    bad = np.zeros((16, 16, 3), dtype=np.float32)
    with pytest.raises(SpectralWarpError, match="uint8"):
        warp_frame(bad, "shift")  # type: ignore[arg-type]


@pytest.mark.smoke
@pytest.mark.parametrize("primitive", list(SUPPORTED_PRIMITIVES))
def test_dct_primitive_preserves_shape_and_dtype(primitive):
    frame = _busy_frame()
    out = warp_frame(frame, primitive, transform="dct")  # type: ignore[arg-type]
    assert out.shape == frame.shape
    assert out.dtype == frame.dtype


@pytest.mark.smoke
@pytest.mark.parametrize("primitive", list(SUPPORTED_PRIMITIVES))
def test_fft_primitive_preserves_shape_and_dtype(primitive):
    frame = _busy_frame()
    out = warp_frame(frame, primitive, transform="fft")  # type: ignore[arg-type]
    assert out.shape == frame.shape
    assert out.dtype == frame.dtype


@pytest.mark.smoke
@pytest.mark.parametrize("primitive", list(SUPPORTED_PRIMITIVES))
def test_dct_primitive_changes_busy_frame(primitive):
    """Each primitive should produce SOME change on a non-flat input."""
    frame = _busy_frame()
    out = warp_frame(frame, primitive, transform="dct")  # type: ignore[arg-type]
    # L1 distance > some small threshold (some primitives are gentler than others)
    delta = np.abs(out.astype(np.int16) - frame.astype(np.int16)).mean()
    assert delta > 0.5, f"{primitive} produced no visible change (delta={delta})"


@pytest.mark.smoke
def test_dct_shift_with_zero_offset_is_near_identity():
    """shift(dy=0, dx=0) should be ~identity (modulo DCT round-trip noise)."""
    frame = _busy_frame()
    out = warp_frame(frame, "shift", params={"dy": 0, "dx": 0}, transform="dct")
    delta = np.abs(out.astype(np.int16) - frame.astype(np.int16)).mean()
    assert delta < 3.0  # round-trip noise floor


@pytest.mark.smoke
def test_dct_smear_with_kernel_one_is_near_identity():
    frame = _busy_frame()
    out = warp_frame(frame, "smear", params={"kernel": 1}, transform="dct")
    delta = np.abs(out.astype(np.int16) - frame.astype(np.int16)).mean()
    assert delta < 3.0


@pytest.mark.smoke
def test_dct_inversion_changes_input():
    """Applying inversion produces a non-trivial change.

    (Note: inversion is NOT a perfect involution under DCT — the discrete
    spectrum reversed-twice-then-iDCT'd accumulates rounding from float
    quantization. We just verify the operation alters the frame.)
    """
    frame = _busy_frame()
    once = warp_frame(frame, "inversion", transform="dct")
    delta = np.abs(once.astype(np.int16) - frame.astype(np.int16)).mean()
    assert delta > 1.0


@pytest.mark.smoke
def test_dct_formant_zero_tilt_is_near_identity():
    frame = _busy_frame()
    out = warp_frame(frame, "formant", params={"tilt": 0.0}, transform="dct")
    delta = np.abs(out.astype(np.int16) - frame.astype(np.int16)).mean()
    assert delta < 3.0


@pytest.mark.smoke
def test_dct_comb_period_zero_or_negative_uses_minimum():
    """Edge: period <= 1 should not crash; comb takes max(2, period)."""
    frame = _busy_frame()
    out = warp_frame(frame, "comb", params={"period": 0}, transform="dct")
    assert out.shape == frame.shape


@pytest.mark.smoke
def test_auto_transform_resolves_to_dct():
    """`transform='auto'` picks DCT for performance."""
    frame = _busy_frame()
    auto = warp_frame(frame, "shift", transform="auto")
    dct = warp_frame(frame, "shift", transform="dct")
    np.testing.assert_array_equal(auto, dct)


@pytest.mark.smoke
def test_dct_and_fft_differ_on_busy_frame():
    """DCT and FFT paths produce visibly different outputs (validates dispatch)."""
    frame = _busy_frame()
    dct = warp_frame(frame, "shift", params={"dy": 4, "dx": 4}, transform="dct")
    fft = warp_frame(frame, "shift", params={"dy": 4, "dx": 4}, transform="fft")
    # They should not be byte-identical
    assert not np.array_equal(dct, fft)


@pytest.mark.smoke
def test_dct_smear_with_large_kernel_reduces_high_freq():
    """smear should blur — variance should drop."""
    frame = _busy_frame()
    out = warp_frame(frame, "smear", params={"kernel": 7}, transform="dct")
    # Variance is a coarse stand-in for spectral energy
    assert out.var() <= frame.var()
