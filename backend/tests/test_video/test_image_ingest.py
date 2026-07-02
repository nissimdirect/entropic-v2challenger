"""Tests for image probing via ingest.probe_image."""

import os
import uuid
from pathlib import Path

import pytest
from PIL import Image

from video.ingest import probe_image, IMAGE_DEFAULT_DURATION
from video.image_reader import MAX_IMAGE_DIMENSION


@pytest.fixture(scope="session")
def synthetic_png_path():
    """Create a synthetic 400x300 PNG for probing."""
    fixture_dir = Path.home() / ".cache" / "entropic" / "test-fixtures"
    fixture_dir.mkdir(parents=True, exist_ok=True)
    path = str(fixture_dir / f"probe_test_{uuid.uuid4().hex[:8]}.png")
    img = Image.new("RGBA", (400, 300), (0, 255, 0, 255))
    img.save(path)
    img.close()
    yield path
    os.unlink(path)


@pytest.fixture(scope="session")
def synthetic_webp_path():
    """Create a synthetic WebP for probing."""
    fixture_dir = Path.home() / ".cache" / "entropic" / "test-fixtures"
    fixture_dir.mkdir(parents=True, exist_ok=True)
    path = str(fixture_dir / f"probe_test_{uuid.uuid4().hex[:8]}.webp")
    img = Image.new("RGB", (640, 480), (128, 128, 128))
    img.save(path, "WEBP")
    img.close()
    yield path
    os.unlink(path)


def test_probe_image_png(synthetic_png_path):
    result = probe_image(synthetic_png_path)
    assert result["ok"] is True
    assert result["width"] == 400
    assert result["height"] == 300
    assert result["fps"] == 0
    assert result["duration_s"] == IMAGE_DEFAULT_DURATION
    assert result["has_audio"] is False
    assert result["frame_count"] == 0
    assert result["codec"] == "png"


def test_probe_image_webp(synthetic_webp_path):
    result = probe_image(synthetic_webp_path)
    assert result["ok"] is True
    assert result["width"] == 640
    assert result["height"] == 480
    assert result["codec"] == "webp"


def test_probe_image_nonexistent():
    result = probe_image("/nonexistent/image.png")
    assert result["ok"] is False
    assert "error" in result


def test_probe_image_oversized():
    """Images exceeding dimension limit should fail."""
    fixture_dir = Path.home() / ".cache" / "entropic" / "test-fixtures"
    fixture_dir.mkdir(parents=True, exist_ok=True)
    path = str(fixture_dir / f"probe_huge_{uuid.uuid4().hex[:8]}.png")
    img = Image.new("RGBA", (1, MAX_IMAGE_DIMENSION + 1), (0, 0, 0, 255))
    img.save(path)
    img.close()
    try:
        result = probe_image(path)
        assert result["ok"] is False
        assert "exceed maximum" in result["error"]
    finally:
        os.unlink(path)
