"""ZMQ integration tests for text rendering commands."""

import pytest


def test_list_fonts(zmq_server):
    """list_fonts should return a list of system fonts."""
    result = zmq_server.handle_message(
        {
            "cmd": "list_fonts",
            "id": "test-list-fonts",
            "_token": zmq_server.token,
        }
    )
    assert result["ok"] is True
    assert "fonts" in result
    assert isinstance(result["fonts"], list)
    assert len(result["fonts"]) > 0
    assert "name" in result["fonts"][0]


def test_render_text_frame(zmq_server):
    """render_text_frame should return base64 frame data."""
    result = zmq_server.handle_message(
        {
            "cmd": "render_text_frame",
            "id": "test-render-text",
            "text_config": {
                "text": "Hello Entropic",
                "font_family": "Helvetica",
                "font_size": 48,
                "color": "#ffffff",
                "position": [960, 540],
            },
            "resolution": [1920, 1080],
            "frame_index": 0,
            "fps": 30.0,
            "_token": zmq_server.token,
        }
    )
    assert result["ok"] is True
    assert "frame_data" in result
    assert result["width"] == 1920
    assert result["height"] == 1080


def test_render_text_frame_missing_config(zmq_server):
    """Missing text_config should return error."""
    result = zmq_server.handle_message(
        {
            "cmd": "render_text_frame",
            "id": "test-no-config",
            "_token": zmq_server.token,
        }
    )
    assert result["ok"] is False
    assert "text_config required" in result["error"]


def test_render_text_frame_empty_text(zmq_server):
    """Empty text should still return a valid frame (transparent)."""
    result = zmq_server.handle_message(
        {
            "cmd": "render_text_frame",
            "id": "test-empty-text",
            "text_config": {"text": ""},
            "resolution": [800, 600],
            "_token": zmq_server.token,
        }
    )
    assert result["ok"] is True
    assert "frame_data" in result


def test_render_composite_with_text_layer(zmq_server):
    """render_composite should handle text layers."""
    result = zmq_server.handle_message(
        {
            "cmd": "render_composite",
            "id": "test-text-composite",
            "layers": [
                {
                    "layer_type": "text",
                    "text_config": {
                        "text": "Overlay Text",
                        "font_size": 36,
                        "color": "#ffffff",
                        "position": [400, 300],
                    },
                    "chain": [],
                    "opacity": 1.0,
                    "blend_mode": "normal",
                    "frame_index": 0,
                    "fps": 30.0,
                }
            ],
            "resolution": [800, 600],
            "project_seed": 0,
            "_token": zmq_server.token,
        }
    )
    assert result["ok"] is True
    assert "frame_data" in result
