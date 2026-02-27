"""Tests for extended ZMQ commands — ingest, seek, render_frame, list_effects, flush_state."""

import uuid


def test_ingest_command(zmq_client, synthetic_video_path):
    msg_id = str(uuid.uuid4())
    zmq_client.send_json({"cmd": "ingest", "id": msg_id, "path": synthetic_video_path})
    resp = zmq_client.recv_json()
    assert resp["id"] == msg_id
    assert resp["ok"] is True
    assert resp["width"] == 1280
    assert resp["height"] == 720
    assert resp["fps"] == 30.0


def test_ingest_missing_path(zmq_client):
    msg_id = str(uuid.uuid4())
    zmq_client.send_json({"cmd": "ingest", "id": msg_id})
    resp = zmq_client.recv_json()
    assert resp["ok"] is False
    assert "missing path" in resp["error"]


def test_seek_command(zmq_client, synthetic_video_path):
    msg_id = str(uuid.uuid4())
    zmq_client.send_json(
        {"cmd": "seek", "id": msg_id, "path": synthetic_video_path, "time": 1.0}
    )
    resp = zmq_client.recv_json()
    assert resp["id"] == msg_id
    assert resp["ok"] is True
    assert resp["frame_index"] == 30  # 1.0s * 30fps


def test_render_frame_empty_chain(zmq_client, synthetic_video_path):
    msg_id = str(uuid.uuid4())
    zmq_client.send_json(
        {
            "cmd": "render_frame",
            "id": msg_id,
            "path": synthetic_video_path,
            "time": 0.0,
            "chain": [],
        }
    )
    resp = zmq_client.recv_json()
    assert resp["id"] == msg_id
    assert resp["ok"] is True
    assert resp["frame_index"] == 0


def test_render_frame_with_invert(zmq_client, synthetic_video_path):
    msg_id = str(uuid.uuid4())
    zmq_client.send_json(
        {
            "cmd": "render_frame",
            "id": msg_id,
            "path": synthetic_video_path,
            "time": 0.0,
            "chain": [{"effect_id": "fx.invert", "params": {}}],
        }
    )
    resp = zmq_client.recv_json()
    assert resp["id"] == msg_id
    assert resp["ok"] is True


def test_render_frame_unknown_effect(zmq_client, synthetic_video_path):
    msg_id = str(uuid.uuid4())
    zmq_client.send_json(
        {
            "cmd": "render_frame",
            "id": msg_id,
            "path": synthetic_video_path,
            "time": 0.0,
            "chain": [{"effect_id": "fx.nonexistent", "params": {}}],
        }
    )
    resp = zmq_client.recv_json()
    assert resp["ok"] is False
    # Server wraps ValueError as generic error for security (SEC hardening)
    assert "error" in resp


def test_list_effects(zmq_client):
    msg_id = str(uuid.uuid4())
    zmq_client.send_json({"cmd": "list_effects", "id": msg_id})
    resp = zmq_client.recv_json()
    assert resp["id"] == msg_id
    assert resp["ok"] is True
    ids = [e["id"] for e in resp["effects"]]
    assert "fx.invert" in ids


def test_flush_state(zmq_client):
    msg_id = str(uuid.uuid4())
    zmq_client.send_json(
        {"cmd": "flush_state", "id": msg_id, "project": {"name": "test"}}
    )
    resp = zmq_client.recv_json()
    assert resp["id"] == msg_id
    assert resp["ok"] is True
