"""Tests for freeze/flatten ZMQ commands — round-trip through the server."""

import base64

import pytest

pytestmark = pytest.mark.smoke


def test_freeze_prefix_command(zmq_client, synthetic_video_path):
    """freeze_prefix returns a cache_id on success."""
    zmq_client.send_json(
        {
            "cmd": "freeze_prefix",
            "id": "f1",
            "asset_path": synthetic_video_path,
            "chain": [{"effect_id": "fx.invert", "params": {}}],
            "project_seed": 42,
            "frame_count": 3,
            "resolution": [1280, 720],
        }
    )
    resp = zmq_client.recv_json()
    assert resp["ok"] is True
    assert "cache_id" in resp
    assert isinstance(resp["cache_id"], str)
    assert len(resp["cache_id"]) > 0


def test_freeze_prefix_missing_path(zmq_client):
    """freeze_prefix without asset_path returns error."""
    zmq_client.send_json(
        {
            "cmd": "freeze_prefix",
            "id": "f2",
            "chain": [],
            "frame_count": 3,
        }
    )
    resp = zmq_client.recv_json()
    assert resp["ok"] is False
    assert "asset_path" in resp["error"]


def test_read_freeze_command(zmq_client, synthetic_video_path):
    """read_freeze returns base64 frame data."""
    # First freeze
    zmq_client.send_json(
        {
            "cmd": "freeze_prefix",
            "id": "r1",
            "asset_path": synthetic_video_path,
            "chain": [{"effect_id": "fx.invert", "params": {}}],
            "project_seed": 42,
            "frame_count": 3,
            "resolution": [1280, 720],
        }
    )
    freeze_resp = zmq_client.recv_json()
    cache_id = freeze_resp["cache_id"]

    # Then read frame 0
    zmq_client.send_json(
        {
            "cmd": "read_freeze",
            "id": "r2",
            "cache_id": cache_id,
            "frame_index": 0,
        }
    )
    resp = zmq_client.recv_json()
    assert resp["ok"] is True
    assert "frame_data" in resp
    # Verify it's valid base64
    decoded = base64.b64decode(resp["frame_data"])
    assert len(decoded) > 0
    assert resp["width"] == 1280
    assert resp["height"] == 720


def test_flatten_command(zmq_client, synthetic_video_path, home_tmp_path):
    """flatten returns the output path."""
    # First freeze
    zmq_client.send_json(
        {
            "cmd": "freeze_prefix",
            "id": "fl1",
            "asset_path": synthetic_video_path,
            "chain": [{"effect_id": "fx.invert", "params": {}}],
            "project_seed": 42,
            "frame_count": 3,
            "resolution": [1280, 720],
        }
    )
    freeze_resp = zmq_client.recv_json()
    cache_id = freeze_resp["cache_id"]

    output = str(home_tmp_path / "flat_output.mp4")
    zmq_client.send_json(
        {
            "cmd": "flatten",
            "id": "fl2",
            "cache_id": cache_id,
            "output_path": output,
            "fps": 30,
        }
    )
    resp = zmq_client.recv_json()
    assert resp["ok"] is True
    assert resp["output_path"] == output


def test_invalidate_cache_command(zmq_client, synthetic_video_path):
    """invalidate_cache returns ok."""
    zmq_client.send_json(
        {
            "cmd": "freeze_prefix",
            "id": "i1",
            "asset_path": synthetic_video_path,
            "chain": [{"effect_id": "fx.invert", "params": {}}],
            "project_seed": 42,
            "frame_count": 2,
            "resolution": [1280, 720],
        }
    )
    freeze_resp = zmq_client.recv_json()
    cache_id = freeze_resp["cache_id"]

    zmq_client.send_json(
        {
            "cmd": "invalidate_cache",
            "id": "i2",
            "cache_id": cache_id,
        }
    )
    resp = zmq_client.recv_json()
    assert resp["ok"] is True

    # Reading from invalidated cache should fail
    zmq_client.send_json(
        {
            "cmd": "read_freeze",
            "id": "i3",
            "cache_id": cache_id,
            "frame_index": 0,
        }
    )
    resp = zmq_client.recv_json()
    assert resp["ok"] is False


def test_memory_status_command(zmq_client):
    """memory_status returns RSS info."""
    zmq_client.send_json(
        {
            "cmd": "memory_status",
            "id": "m1",
        }
    )
    resp = zmq_client.recv_json()
    assert resp["ok"] is True
    assert "rss_mb" in resp
    assert isinstance(resp["rss_mb"], (int, float))
