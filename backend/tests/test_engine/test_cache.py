"""Tests for MJPEG cache encoding/decoding."""

import numpy as np

from engine.cache import decode_mjpeg, encode_mjpeg


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
