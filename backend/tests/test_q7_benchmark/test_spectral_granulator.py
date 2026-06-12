"""Tests for A5 Spectral Granulator (PR #19)."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pytest

BACKEND_SRC = Path(__file__).resolve().parents[2] / "src"
if str(BACKEND_SRC) not in sys.path:
    sys.path.insert(0, str(BACKEND_SRC))

from effects.spectral import SpectralWarpError
from effects.spectral.granulator import (
    GrainConfig,
    _grain_origins,
    granulate_frame,
    granulate_spectrum,
)


def _busy_frame(h: int = 64, w: int = 64, seed: int = 42) -> np.ndarray:
    rng = np.random.default_rng(seed)
    return rng.integers(0, 256, size=(h, w, 3), dtype=np.uint8)


def _busy_spectrum(h: int = 64, w: int = 64, seed: int = 42) -> np.ndarray:
    rng = np.random.default_rng(seed)
    return rng.standard_normal((h, w)).astype(np.float32)


# ---------------------------------------------------------------------------
# GrainConfig
# ---------------------------------------------------------------------------


@pytest.mark.smoke
def test_grain_config_defaults():
    c = GrainConfig()
    assert c.grain_size == 16
    assert c.overlap == 0.0
    assert c.jitter == 0.0


@pytest.mark.smoke
def test_grain_config_validate_grain_size_zero_raises():
    with pytest.raises(SpectralWarpError, match="grain_size"):
        GrainConfig(grain_size=0).validate()


@pytest.mark.smoke
def test_grain_config_validate_overlap_one_raises():
    """overlap=1.0 means no advance — would loop forever."""
    with pytest.raises(SpectralWarpError, match="overlap"):
        GrainConfig(overlap=1.0).validate()


@pytest.mark.smoke
def test_grain_config_validate_negative_jitter_raises():
    with pytest.raises(SpectralWarpError, match="jitter"):
        GrainConfig(jitter=-0.1).validate()


# ---------------------------------------------------------------------------
# Grain origins
# ---------------------------------------------------------------------------


@pytest.mark.smoke
def test_grain_origins_no_overlap_tiles_exactly():
    config = GrainConfig(grain_size=16, overlap=0.0, jitter=0.0)
    origins = _grain_origins(64, 64, config)
    # 64/16 = 4 in each dim → 16 origins
    assert len(origins) == 16
    # First origin at (0, 0); last at (48, 48)
    assert (0, 0) in origins
    assert (48, 48) in origins


@pytest.mark.smoke
def test_grain_origins_with_overlap_produces_more_origins():
    config_no = GrainConfig(grain_size=16, overlap=0.0)
    config_half = GrainConfig(grain_size=16, overlap=0.5)
    n_no = len(_grain_origins(64, 64, config_no))
    n_half = len(_grain_origins(64, 64, config_half))
    assert n_half > n_no


@pytest.mark.smoke
def test_grain_origins_grain_larger_than_extent_raises():
    config = GrainConfig(grain_size=200)
    with pytest.raises(SpectralWarpError, match="exceeds"):
        _grain_origins(64, 64, config)


@pytest.mark.smoke
def test_grain_origins_jitter_deterministic_with_seed():
    """Same seed → same origins."""
    config1 = GrainConfig(grain_size=16, jitter=0.25, seed=7)
    config2 = GrainConfig(grain_size=16, jitter=0.25, seed=7)
    assert _grain_origins(64, 64, config1) == _grain_origins(64, 64, config2)


# ---------------------------------------------------------------------------
# granulate_spectrum
# ---------------------------------------------------------------------------


@pytest.mark.smoke
def test_granulate_spectrum_preserves_shape_and_dtype():
    spec = _busy_spectrum()
    out = granulate_spectrum(spec, "shift", GrainConfig(grain_size=16))
    assert out.shape == spec.shape
    assert out.dtype == spec.dtype


@pytest.mark.smoke
def test_granulate_spectrum_unknown_primitive_raises():
    spec = _busy_spectrum()
    with pytest.raises(SpectralWarpError, match="unknown primitive"):
        granulate_spectrum(spec, "bogus", GrainConfig())  # type: ignore[arg-type]


@pytest.mark.smoke
def test_granulate_spectrum_changes_input():
    spec = _busy_spectrum()
    out = granulate_spectrum(
        spec, "shift", GrainConfig(grain_size=16), params={"dy": 4, "dx": 4}
    )
    # Mean L1 distance should be non-trivial
    delta = np.abs(out - spec).mean()
    assert delta > 0.01


# ---------------------------------------------------------------------------
# granulate_frame end-to-end
# ---------------------------------------------------------------------------


@pytest.mark.smoke
def test_granulate_frame_preserves_shape_and_dtype():
    frame = _busy_frame()
    out = granulate_frame(frame, "shift", GrainConfig(grain_size=16))
    assert out.shape == frame.shape
    assert out.dtype == frame.dtype


@pytest.mark.smoke
def test_granulate_frame_defaults_work():
    """Calling with config=None uses default GrainConfig."""
    frame = _busy_frame()
    out = granulate_frame(frame, "shift")
    assert out.shape == frame.shape


@pytest.mark.smoke
@pytest.mark.parametrize(
    "primitive", ["shift", "comb", "smear", "formant", "parity", "inversion"]
)
def test_granulate_frame_each_primitive(primitive):
    frame = _busy_frame()
    out = granulate_frame(frame, primitive, GrainConfig(grain_size=16))
    assert out.shape == frame.shape


@pytest.mark.smoke
def test_granulate_frame_changes_busy_frame():
    """End-to-end: produces visible change on a non-flat input."""
    frame = _busy_frame()
    out = granulate_frame(
        frame, "shift", GrainConfig(grain_size=16), params={"dy": 8, "dx": 8}
    )
    delta = np.abs(out.astype(np.int16) - frame.astype(np.int16)).mean()
    assert delta > 0.5


@pytest.mark.smoke
def test_granulate_frame_fft_raises():
    frame = _busy_frame()
    with pytest.raises(SpectralWarpError, match="dct"):
        granulate_frame(frame, "shift", transform="fft")  # type: ignore[arg-type]


@pytest.mark.smoke
def test_granulate_frame_overlap_more_grains_more_blending():
    """With overlap, grains average where they overlap → smoother output."""
    frame = _busy_frame()
    no_overlap = granulate_frame(
        frame, "smear", GrainConfig(grain_size=16, overlap=0.0)
    )
    with_overlap = granulate_frame(
        frame, "smear", GrainConfig(grain_size=16, overlap=0.5)
    )
    # Both produce visible changes
    delta_no = np.abs(no_overlap.astype(np.int16) - frame.astype(np.int16)).mean()
    delta_w = np.abs(with_overlap.astype(np.int16) - frame.astype(np.int16)).mean()
    assert delta_no > 0
    assert delta_w > 0


@pytest.mark.smoke
def test_granulate_frame_jitter_changes_with_seed():
    """Different seeds produce different outputs when jitter > 0."""
    frame = _busy_frame()
    a = granulate_frame(
        frame,
        "shift",
        GrainConfig(grain_size=16, jitter=0.5, seed=1),
        params={"dy": 4, "dx": 4},
    )
    b = granulate_frame(
        frame,
        "shift",
        GrainConfig(grain_size=16, jitter=0.5, seed=2),
        params={"dy": 4, "dx": 4},
    )
    # Different seeds → different jittered origins → different output
    assert not np.array_equal(a, b)
