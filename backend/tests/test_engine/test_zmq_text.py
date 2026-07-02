"""ZMQ integration tests for text rendering commands.

F4 (2026-07-02): removed the standalone render_text_frame IPC command — it
had zero renderer callers. Text-layer rendering is served entirely via
render_composite (which calls the underlying render_text_frame() Python
function directly, see zmq_server._handle_render_composite) and the CSS-only
TextOverlay.tsx preview. test_render_composite_with_text_layer below still
exercises the real text-rendering path end-to-end, including the
missing-config and empty-text cases that used to be covered by the deleted
render_text_frame command tests (see backend/tests/test_engine/test_text_renderer.py
for direct unit coverage of the render_text_frame() function itself).
"""

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
