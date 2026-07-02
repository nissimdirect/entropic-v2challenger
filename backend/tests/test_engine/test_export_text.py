"""Tests for ExportManager text layer compositing and image input support."""

import os
import time
import uuid
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from engine.export import ExportManager, ExportStatus


@pytest.fixture(scope="session")
def synthetic_image_for_export():
    """Create a synthetic PNG for export testing."""
    fixture_dir = Path.home() / ".cache" / "entropic" / "test-fixtures"
    fixture_dir.mkdir(parents=True, exist_ok=True)
    path = str(fixture_dir / f"export_img_{uuid.uuid4().hex[:8]}.png")
    img = Image.new("RGBA", (320, 240), (255, 0, 0, 255))
    img.save(path)
    img.close()
    yield path
    os.unlink(path)


@pytest.fixture
def export_output_path():
    """Temporary output path for export tests."""
    fixture_dir = Path.home() / ".cache" / "entropic" / "test-fixtures"
    fixture_dir.mkdir(parents=True, exist_ok=True)
    path = str(fixture_dir / f"export_out_{uuid.uuid4().hex[:8]}.mp4")
    yield path
    if os.path.exists(path):
        os.unlink(path)


def test_composite_text_layers():
    """_composite_text_layers renders text onto a frame."""
    frame = np.ones((100, 200, 4), dtype=np.uint8) * 128
    frame[:, :, 3] = 255

    text_layers = [
        {
            "text_config": {
                "text": "TEST",
                "font_size": 24,
                "color": "#ffffff",
                "position": [100, 50],
                "alignment": "center",
            },
            "opacity": 1.0,
        }
    ]

    result = ExportManager._composite_text_layers(
        frame, text_layers, (200, 100), 0, 30.0
    )
    assert result.shape == frame.shape
    assert result.dtype == np.uint8


def test_composite_text_layers_empty():
    """Empty text layers returns frame unchanged."""
    frame = np.ones((100, 200, 4), dtype=np.uint8) * 128
    result = ExportManager._composite_text_layers(frame, [], (200, 100), 0, 30.0)
    np.testing.assert_array_equal(result, frame)


def test_composite_text_layers_zero_opacity():
    """Zero opacity text layer doesn't modify frame."""
    frame = np.ones((100, 200, 4), dtype=np.uint8) * 128
    frame[:, :, 3] = 255
    text_layers = [
        {
            "text_config": {"text": "HIDDEN", "font_size": 24, "position": [50, 50]},
            "opacity": 0.0,
        }
    ]
    result = ExportManager._composite_text_layers(
        frame, text_layers, (200, 100), 0, 30.0
    )
    np.testing.assert_array_equal(result, frame)


def test_export_image_input(synthetic_image_for_export, export_output_path):
    """ExportManager should handle image input files."""
    mgr = ExportManager()
    job = mgr.start(
        synthetic_image_for_export,
        export_output_path,
        chain=[],
        project_seed=42,
        settings={"export_type": "video", "fps": "source", "resolution": "source"},
    )

    # Wait for completion (image exports are fast)
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        status = mgr.get_status()
        if status["status"] in ("complete", "error"):
            break
        time.sleep(0.1)

    status = mgr.get_status()
    assert status["status"] == "complete", f"Export failed: {status.get('error')}"
    assert os.path.exists(export_output_path)


def test_export_with_text_layers(synthetic_video_path, export_output_path):
    """ExportManager should composite text layers during video export."""
    mgr = ExportManager()
    text_layers = [
        {
            "text_config": {
                "text": "WATERMARK",
                "font_size": 36,
                "color": "#ffffff",
                "position": [640, 360],
                "alignment": "center",
            },
            "opacity": 0.5,
        }
    ]
    job = mgr.start(
        synthetic_video_path,
        export_output_path,
        chain=[],
        project_seed=42,
        settings={"export_type": "video", "fps": "source", "resolution": "source"},
        text_layers=text_layers,
    )

    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        status = mgr.get_status()
        if status["status"] in ("complete", "error"):
            break
        time.sleep(0.1)

    status = mgr.get_status()
    assert status["status"] == "complete", f"Export failed: {status.get('error')}"
    assert os.path.exists(export_output_path)
