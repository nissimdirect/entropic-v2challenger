"""Tests for MJPEG cache encoding/decoding."""

import numpy as np
import pytest

from engine.cache import decode_mjpeg, encode_mjpeg, encode_mjpeg_fit


def test_encode_produces_jpeg_header():
    frame = np.zeros((1080, 1920, 4), dtype=np.uint8)
    frame[:, :, :3] = 128
    frame[:, :, 3] = 255
    data = encode_mjpeg(frame)
    # JPEG magic bytes
    assert data[:2] == b"\xff\xd8"
    # 1080p JPEG at quality 95 should be under 1MB
    assert len(data) < 1_000_000


def test_roundtrip_dimensions_match():
    frame = np.zeros((720, 1280, 4), dtype=np.uint8)
    frame[:, :, 0] = 200
    frame[:, :, 1] = 100
    frame[:, :, 2] = 50
    frame[:, :, 3] = 255
    data = encode_mjpeg(frame)
    decoded = decode_mjpeg(data)
    # Decoded is RGB (no alpha)
    assert decoded.shape == (720, 1280, 3)


def test_roundtrip_psnr_above_40db():
    """JPEG compression should preserve quality — PSNR > 40dB on smooth content."""
    # Use smooth gradient (representative of video frames, not random noise)
    frame = np.zeros((480, 640, 4), dtype=np.uint8)
    rows = np.linspace(0, 255, 480, dtype=np.uint8)[:, None]
    cols = np.linspace(0, 255, 640, dtype=np.uint8)[None, :]
    frame[:, :, 0] = rows
    frame[:, :, 1] = cols
    frame[:, :, 2] = 128
    frame[:, :, 3] = 255
    data = encode_mjpeg(frame, quality=95)
    decoded = decode_mjpeg(data)
    original_rgb = frame[:, :, :3].astype(np.float64)
    decoded_f = decoded.astype(np.float64)
    mse = np.mean((original_rgb - decoded_f) ** 2)
    if mse == 0:
        return  # Perfect match
    psnr = 10 * np.log10(255.0**2 / mse)
    assert psnr > 40.0, f"PSNR {psnr:.1f}dB is below 40dB threshold"


def test_encode_all_black():
    frame = np.zeros((100, 100, 4), dtype=np.uint8)
    frame[:, :, 3] = 255
    data = encode_mjpeg(frame)
    assert data[:2] == b"\xff\xd8"


def test_encode_all_white():
    frame = np.full((100, 100, 4), 255, dtype=np.uint8)
    data = encode_mjpeg(frame)
    assert data[:2] == b"\xff\xd8"


# ---------------------------------------------------------------------------
# encode_mjpeg_fit — quality fallback tests
# ---------------------------------------------------------------------------


def test_fit_small_frame_stays_at_q95():
    """A small frame should fit at Q95 — no fallback needed."""
    frame = np.zeros((100, 100, 4), dtype=np.uint8)
    frame[:, :, :3] = 128
    frame[:, :, 3] = 255
    data, quality = encode_mjpeg_fit(frame, max_bytes=4_194_304)
    assert quality == 95
    assert data[:2] == b"\xff\xd8"


def test_fit_reduces_quality_when_oversized():
    """When Q95 output exceeds max_bytes, quality should fall back."""
    # Use random noise at 4K — known to exceed 4MB at Q95
    rng = np.random.default_rng(42)
    frame_4k = rng.integers(0, 256, size=(2160, 3840, 4), dtype=np.uint8)
    frame_4k[:, :, 3] = 255

    # Verify Q95 is too large for 4MB
    q95_data = encode_mjpeg(frame_4k, quality=95)
    assert len(q95_data) > 4_194_304, "Test precondition: Q95 must exceed 4MB"

    # encode_mjpeg_fit should fall back to a lower quality
    data, quality = encode_mjpeg_fit(frame_4k, max_bytes=4_194_304)
    assert quality < 95
    assert quality in (85, 75, 65, 50)
    assert len(data) <= 4_194_304
    assert data[:2] == b"\xff\xd8"


def test_fit_raises_when_all_qualities_fail():
    """If frame exceeds max_bytes at every quality level, raise ValueError."""
    rng = np.random.default_rng(99)
    frame = rng.integers(0, 256, size=(1080, 1920, 4), dtype=np.uint8)
    frame[:, :, 3] = 255

    # Use a tiny max_bytes that no JPEG can fit in
    with pytest.raises(ValueError, match="exceeds.*bytes"):
        encode_mjpeg_fit(frame, max_bytes=1024)


def test_fit_custom_quality_chain():
    """Custom quality chain should be respected."""
    frame = np.zeros((100, 100, 4), dtype=np.uint8)
    frame[:, :, :3] = 128
    frame[:, :, 3] = 255
    data, quality = encode_mjpeg_fit(
        frame, max_bytes=4_194_304, quality_chain=(90, 70, 50)
    )
    assert quality == 90  # Small frame fits at first quality


def test_fit_returns_valid_jpeg():
    """Output from encode_mjpeg_fit should roundtrip through decode_mjpeg."""
    frame = np.zeros((480, 640, 4), dtype=np.uint8)
    frame[:, :, 0] = 200
    frame[:, :, 1] = 100
    frame[:, :, 2] = 50
    frame[:, :, 3] = 255
    data, _q = encode_mjpeg_fit(frame)
    decoded = decode_mjpeg(data)
    assert decoded.shape == (480, 640, 3)
