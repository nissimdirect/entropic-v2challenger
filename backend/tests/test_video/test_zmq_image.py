"""ZMQ integration tests for image ingest and rendering."""

import os
import uuid
from pathlib import Path

import pytest
from PIL import Image


@pytest.fixture(scope="session")
def synthetic_image_for_zmq():
    """Create a synthetic 200x100 PNG under ~/ for ZMQ tests."""
    fixture_dir = Path.home() / ".cache" / "entropic" / "test-fixtures"
    fixture_dir.mkdir(parents=True, exist_ok=True)
    path = str(fixture_dir / f"zmq_img_{uuid.uuid4().hex[:8]}.png")
    img = Image.new("RGBA", (200, 100), (255, 0, 0, 255))
    img.save(path)
    img.close()
    yield path
    os.unlink(path)


def test_ingest_image(zmq_server, synthetic_image_for_zmq):
    """Ingesting an image should return probe metadata with ok=True."""
    result = zmq_server.handle_message(
        {
            "cmd": "ingest",
            "id": "test-img-ingest",
            "path": synthetic_image_for_zmq,
            "_token": zmq_server.token,
        }
    )
    assert result["ok"] is True
    assert result["width"] == 200
    assert result["height"] == 100
    assert result["fps"] == 0
    assert result["duration_s"] == 5.0
    assert result["has_audio"] is False
    assert result["frame_count"] == 0


def test_seek_image(zmq_server, synthetic_image_for_zmq):
    """Seeking an image should return a frame."""
    # Ingest first
    zmq_server.handle_message(
        {
            "cmd": "ingest",
            "id": "ingest-before-seek",
            "path": synthetic_image_for_zmq,
            "_token": zmq_server.token,
        }
    )

    result = zmq_server.handle_message(
        {
            "cmd": "seek",
            "id": "test-img-seek",
            "path": synthetic_image_for_zmq,
            "time": 0,
            "_token": zmq_server.token,
        }
    )
    assert result["ok"] is True
    assert "frame_data" in result
    assert result["width"] == 200
    assert result["height"] == 100


def test_render_frame_image(zmq_server, synthetic_image_for_zmq):
    """render_frame on an image should apply effects and return a frame."""
    # Ingest first
    zmq_server.handle_message(
        {
            "cmd": "ingest",
            "id": "ingest-before-render",
            "path": synthetic_image_for_zmq,
            "_token": zmq_server.token,
        }
    )

    result = zmq_server.handle_message(
        {
            "cmd": "render_frame",
            "id": "test-img-render",
            "path": synthetic_image_for_zmq,
            "frame_index": 0,
            "chain": [],
            "project_seed": 42,
            "_token": zmq_server.token,
        }
    )
    assert result["ok"] is True
    assert "frame_data" in result


def test_render_composite_with_image(zmq_server, synthetic_image_for_zmq):
    """render_composite should handle image layers."""
    # Ingest first
    zmq_server.handle_message(
        {
            "cmd": "ingest",
            "id": "ingest-before-composite",
            "path": synthetic_image_for_zmq,
            "_token": zmq_server.token,
        }
    )

    result = zmq_server.handle_message(
        {
            "cmd": "render_composite",
            "id": "test-img-composite",
            "layers": [
                {
                    "asset_path": synthetic_image_for_zmq,
                    "frame_index": 0,
                    "chain": [],
                    "opacity": 1.0,
                    "blend_mode": "normal",
                }
            ],
            "resolution": [200, 100],
            "project_seed": 42,
            "_token": zmq_server.token,
        }
    )
    assert result["ok"] is True
    assert "frame_data" in result


def test_ingest_image_invalid_extension(zmq_server):
    """A file with an unsupported extension should be rejected."""
    result = zmq_server.handle_message(
        {
            "cmd": "ingest",
            "id": "test-bad-ext",
            "path": "/tmp/fake.xyz",
            "_token": zmq_server.token,
        }
    )
    assert result["ok"] is False
