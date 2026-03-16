"""Tests for ImageReader and is_image_file."""

import os
import uuid
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from video.image_reader import ImageReader, is_image_file, MAX_IMAGE_DIMENSION


@pytest.fixture(scope="session")
def synthetic_image_path():
    """Create a synthetic 200x100 PNG under ~/ (required by validate_upload)."""
    fixture_dir = Path.home() / ".cache" / "entropic" / "test-fixtures"
    fixture_dir.mkdir(parents=True, exist_ok=True)
    path = str(fixture_dir / f"test_{uuid.uuid4().hex[:8]}.png")
    img = Image.new("RGBA", (200, 100), (255, 0, 0, 255))
    img.save(path)
    img.close()
    yield path
    os.unlink(path)


@pytest.fixture(scope="session")
def synthetic_jpeg_path():
    """Create a synthetic JPEG test image."""
    fixture_dir = Path.home() / ".cache" / "entropic" / "test-fixtures"
    fixture_dir.mkdir(parents=True, exist_ok=True)
    path = str(fixture_dir / f"test_{uuid.uuid4().hex[:8]}.jpg")
    img = Image.new("RGB", (320, 240), (0, 128, 255))
    img.save(path, "JPEG")
    img.close()
    yield path
    os.unlink(path)


# --- is_image_file ---


def test_is_image_file_png():
    assert is_image_file("/path/to/image.png") is True


def test_is_image_file_jpg():
    assert is_image_file("/path/to/photo.jpg") is True


def test_is_image_file_jpeg_uppercase():
    assert is_image_file("/path/to/photo.JPEG") is True


def test_is_image_file_tiff():
    assert is_image_file("/path/to/scan.tiff") is True


def test_is_image_file_webp():
    assert is_image_file("/path/to/web.webp") is True


def test_is_image_file_bmp():
    assert is_image_file("/path/to/old.bmp") is True


def test_is_image_file_video():
    assert is_image_file("/path/to/video.mp4") is False


def test_is_image_file_no_extension():
    assert is_image_file("/path/to/noext") is False


# --- ImageReader ---


def test_image_reader_loads_png(synthetic_image_path):
    reader = ImageReader(synthetic_image_path)
    assert reader.width == 200
    assert reader.height == 100
    assert reader.fps == 30.0
    assert reader.duration == 5.0
    assert reader.frame_count == 150
    reader.close()


def test_image_reader_loads_jpeg(synthetic_jpeg_path):
    reader = ImageReader(synthetic_jpeg_path)
    assert reader.width == 320
    assert reader.height == 240
    reader.close()


def test_image_reader_frame_shape(synthetic_image_path):
    reader = ImageReader(synthetic_image_path)
    frame = reader.decode_frame(0)
    assert isinstance(frame, np.ndarray)
    assert frame.shape == (100, 200, 4)
    assert frame.dtype == np.uint8
    reader.close()


def test_image_reader_frame_is_rgba(synthetic_image_path):
    """Frame should be RGBA — red image."""
    reader = ImageReader(synthetic_image_path)
    frame = reader.decode_frame(0)
    # Red channel should be 255 everywhere (solid red image)
    assert frame[50, 100, 0] == 255  # R
    assert frame[50, 100, 3] == 255  # A
    reader.close()


def test_image_reader_any_frame_index(synthetic_image_path):
    """All frame indices return the same frame (static image)."""
    reader = ImageReader(synthetic_image_path)
    f0 = reader.decode_frame(0)
    f99 = reader.decode_frame(99)
    assert np.array_equal(f0, f99)
    reader.close()


def test_image_reader_custom_fps_duration(synthetic_image_path):
    reader = ImageReader(synthetic_image_path, default_fps=24.0, default_duration=10.0)
    assert reader.fps == 24.0
    assert reader.duration == 10.0
    assert reader.frame_count == 240
    reader.close()


def test_image_reader_dimension_guard():
    """Images exceeding MAX_IMAGE_DIMENSION should raise ValueError."""
    fixture_dir = Path.home() / ".cache" / "entropic" / "test-fixtures"
    fixture_dir.mkdir(parents=True, exist_ok=True)
    path = str(fixture_dir / f"test_huge_{uuid.uuid4().hex[:8]}.png")
    # Create a 1x1 image but with faked large dimensions via header
    # Instead, just verify the guard with a modestly large image that we skip creating
    # (creating an 8193x1 image is feasible)
    img = Image.new("RGBA", (MAX_IMAGE_DIMENSION + 1, 1), (0, 0, 0, 255))
    img.save(path)
    img.close()
    try:
        with pytest.raises(ValueError, match="exceed maximum"):
            ImageReader(path)
    finally:
        os.unlink(path)


def test_image_reader_nonexistent():
    with pytest.raises(Exception):
        ImageReader("/nonexistent/image.png")
