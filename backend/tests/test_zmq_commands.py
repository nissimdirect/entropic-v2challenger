"""Tests for extended ZMQ commands — ingest, seek, render_frame, list_effects, flush_state."""

import uuid

import pytest


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


# --- Audio decode command ---


def test_audio_decode_command(zmq_client, synthetic_video_with_audio_path):
    msg_id = str(uuid.uuid4())
    zmq_client.send_json(
        {"cmd": "audio_decode", "id": msg_id, "path": synthetic_video_with_audio_path}
    )
    resp = zmq_client.recv_json()
    assert resp["id"] == msg_id
    assert resp["ok"] is True
    assert resp["sample_rate"] == 44100
    assert resp["channels"] == 2
    assert resp["num_samples"] > 0
    assert resp["duration_s"] > 0
    assert 0.0 < resp["peak"] <= 1.0


def test_audio_decode_no_audio(zmq_client, synthetic_video_path):
    msg_id = str(uuid.uuid4())
    zmq_client.send_json(
        {"cmd": "audio_decode", "id": msg_id, "path": synthetic_video_path}
    )
    resp = zmq_client.recv_json()
    assert resp["ok"] is False
    assert "No audio stream" in resp["error"]


def test_audio_decode_missing_path(zmq_client):
    msg_id = str(uuid.uuid4())
    zmq_client.send_json({"cmd": "audio_decode", "id": msg_id})
    resp = zmq_client.recv_json()
    assert resp["ok"] is False
    assert "missing path" in resp["error"]


def test_audio_decode_with_seek(zmq_client, synthetic_video_with_audio_path):
    msg_id = str(uuid.uuid4())
    zmq_client.send_json(
        {
            "cmd": "audio_decode",
            "id": msg_id,
            "path": synthetic_video_with_audio_path,
            "start_s": 1.0,
        }
    )
    resp = zmq_client.recv_json()
    assert resp["ok"] is True
    assert resp["num_samples"] > 0


# --- Waveform command tests ---


@pytest.mark.smoke
def test_waveform_command(zmq_client, synthetic_video_with_audio_path):
    msg_id = str(uuid.uuid4())
    zmq_client.send_json(
        {"cmd": "waveform", "id": msg_id, "path": synthetic_video_with_audio_path}
    )
    resp = zmq_client.recv_json()
    assert resp["id"] == msg_id
    assert resp["ok"] is True
    assert "peaks" in resp
    assert resp["num_bins"] == 800  # default
    assert resp["channels"] == 2
    assert resp["duration_s"] > 0
    assert resp["cached"] is False
    # peaks is a nested list: (num_bins, channels, 2)
    assert len(resp["peaks"]) == 800
    assert len(resp["peaks"][0]) == 2  # stereo
    assert len(resp["peaks"][0][0]) == 2  # min/max


def test_waveform_custom_bins(zmq_client, synthetic_video_with_audio_path):
    msg_id = str(uuid.uuid4())
    zmq_client.send_json(
        {
            "cmd": "waveform",
            "id": msg_id,
            "path": synthetic_video_with_audio_path,
            "num_bins": 200,
        }
    )
    resp = zmq_client.recv_json()
    assert resp["ok"] is True
    assert resp["num_bins"] == 200
    assert len(resp["peaks"]) == 200


def test_waveform_cache_hit(zmq_client, synthetic_video_with_audio_path):
    msg_id1 = str(uuid.uuid4())
    zmq_client.send_json(
        {"cmd": "waveform", "id": msg_id1, "path": synthetic_video_with_audio_path}
    )
    resp1 = zmq_client.recv_json()
    assert resp1["ok"] is True
    assert resp1["cached"] is False

    msg_id2 = str(uuid.uuid4())
    zmq_client.send_json(
        {"cmd": "waveform", "id": msg_id2, "path": synthetic_video_with_audio_path}
    )
    resp2 = zmq_client.recv_json()
    assert resp2["ok"] is True
    assert resp2["cached"] is True
    assert resp2["peaks"] == resp1["peaks"]


def test_waveform_no_audio(zmq_client, synthetic_video_path):
    msg_id = str(uuid.uuid4())
    zmq_client.send_json(
        {"cmd": "waveform", "id": msg_id, "path": synthetic_video_path}
    )
    resp = zmq_client.recv_json()
    assert resp["ok"] is False
    assert "No audio stream" in resp["error"]


def test_waveform_missing_path(zmq_client):
    msg_id = str(uuid.uuid4())
    zmq_client.send_json({"cmd": "waveform", "id": msg_id})
    resp = zmq_client.recv_json()
    assert resp["ok"] is False
    assert "missing path" in resp["error"]
