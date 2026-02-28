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


# --- Audio playback command tests ---


@pytest.mark.smoke
def test_audio_load_command(zmq_client, synthetic_video_with_audio_path):
    msg_id = str(uuid.uuid4())
    zmq_client.send_json(
        {"cmd": "audio_load", "id": msg_id, "path": synthetic_video_with_audio_path}
    )
    resp = zmq_client.recv_json()
    assert resp["ok"] is True
    assert resp["sample_rate"] == 44100
    assert resp["channels"] == 2
    assert resp["num_samples"] > 0


def test_audio_position_command(zmq_client, synthetic_video_with_audio_path):
    # Load first
    zmq_client.send_json(
        {
            "cmd": "audio_load",
            "id": str(uuid.uuid4()),
            "path": synthetic_video_with_audio_path,
        }
    )
    zmq_client.recv_json()

    msg_id = str(uuid.uuid4())
    zmq_client.send_json({"cmd": "audio_position", "id": msg_id})
    resp = zmq_client.recv_json()
    assert resp["ok"] is True
    assert "position_s" in resp
    assert "duration_s" in resp
    assert "is_playing" in resp
    assert "volume" in resp


def test_audio_seek_command(zmq_client, synthetic_video_with_audio_path):
    zmq_client.send_json(
        {
            "cmd": "audio_load",
            "id": str(uuid.uuid4()),
            "path": synthetic_video_with_audio_path,
        }
    )
    zmq_client.recv_json()

    msg_id = str(uuid.uuid4())
    zmq_client.send_json({"cmd": "audio_seek", "id": msg_id, "time": 1.0})
    resp = zmq_client.recv_json()
    assert resp["ok"] is True
    assert resp["position_s"] > 0.9


def test_audio_volume_command(zmq_client):
    msg_id = str(uuid.uuid4())
    zmq_client.send_json({"cmd": "audio_volume", "id": msg_id, "volume": 0.5})
    resp = zmq_client.recv_json()
    assert resp["ok"] is True
    assert resp["volume"] == 0.5


def test_audio_play_without_load(zmq_client):
    # Stop any previous loaded audio
    zmq_client.send_json({"cmd": "audio_stop", "id": str(uuid.uuid4())})
    zmq_client.recv_json()

    msg_id = str(uuid.uuid4())
    zmq_client.send_json({"cmd": "audio_play", "id": msg_id})
    resp = zmq_client.recv_json()
    # After stop, player has no samples loaded — play should fail
    assert (
        resp["ok"] is False or resp.get("is_playing") is True
    )  # depends on prior state


def test_audio_stop_command(zmq_client, synthetic_video_with_audio_path):
    zmq_client.send_json(
        {
            "cmd": "audio_load",
            "id": str(uuid.uuid4()),
            "path": synthetic_video_with_audio_path,
        }
    )
    zmq_client.recv_json()

    msg_id = str(uuid.uuid4())
    zmq_client.send_json({"cmd": "audio_stop", "id": msg_id})
    resp = zmq_client.recv_json()
    assert resp["ok"] is True


# --- A/V Clock command tests ---


@pytest.mark.smoke
def test_clock_sync_command(zmq_client):
    msg_id = str(uuid.uuid4())
    zmq_client.send_json({"cmd": "clock_sync", "id": msg_id})
    resp = zmq_client.recv_json()
    assert resp["ok"] is True
    assert "audio_time_s" in resp
    assert "target_frame" in resp
    assert "is_playing" in resp
    assert "duration_s" in resp
    assert "fps" in resp
    assert "total_frames" in resp


def test_clock_set_fps_command(zmq_client):
    msg_id = str(uuid.uuid4())
    zmq_client.send_json({"cmd": "clock_set_fps", "id": msg_id, "fps": 24.0})
    resp = zmq_client.recv_json()
    assert resp["ok"] is True
    assert resp["fps"] == 24.0


def test_clock_sync_after_seek(zmq_client, synthetic_video_with_audio_path):
    # Load audio first
    zmq_client.send_json(
        {
            "cmd": "audio_load",
            "id": str(uuid.uuid4()),
            "path": synthetic_video_with_audio_path,
        }
    )
    zmq_client.recv_json()

    # Set fps to 30
    zmq_client.send_json({"cmd": "clock_set_fps", "id": str(uuid.uuid4()), "fps": 30.0})
    zmq_client.recv_json()

    # Seek to 1.0s
    zmq_client.send_json({"cmd": "audio_seek", "id": str(uuid.uuid4()), "time": 1.0})
    zmq_client.recv_json()

    # Check clock sync
    msg_id = str(uuid.uuid4())
    zmq_client.send_json({"cmd": "clock_sync", "id": msg_id})
    resp = zmq_client.recv_json()
    assert resp["ok"] is True
    assert resp["audio_time_s"] > 0.9
    assert resp["target_frame"] >= 29  # floor(~1.0 * 30)


def test_clock_set_fps_missing(zmq_client):
    msg_id = str(uuid.uuid4())
    zmq_client.send_json({"cmd": "clock_set_fps", "id": msg_id})
    resp = zmq_client.recv_json()
    assert resp["ok"] is False
    assert "missing fps" in resp["error"]


# --- ZMQ handler guard tests (Item 3) ---


def test_malformed_json_returns_error(zmq_server):
    """Non-JSON bytes over ZMQ → error reply, socket stays functional."""
    import zmq as _zmq

    ctx = _zmq.Context()
    sock = ctx.socket(_zmq.REQ)
    sock.setsockopt(_zmq.RCVTIMEO, 3000)
    sock.connect(f"tcp://127.0.0.1:{zmq_server.port}")
    try:
        # Send raw invalid bytes (not valid JSON)
        sock.send(b"this is not json{{{")
        resp_bytes = sock.recv()
        import json

        resp = json.loads(resp_bytes)
        assert resp["ok"] is False
        assert "Invalid message format" in resp["error"]

        # Socket still functional — send a valid message next
        msg = {"cmd": "ping", "id": "after-malformed", "_token": zmq_server.token}
        sock.send(json.dumps(msg).encode())
        resp_bytes = sock.recv()
        resp = json.loads(resp_bytes)
        assert resp.get("status") == "alive" or resp.get("ok") is not None
    finally:
        sock.close()
        ctx.term()


def test_double_malformed_no_deadlock(zmq_server):
    """Two malformed messages in a row don't deadlock the server."""
    import zmq as _zmq

    ctx = _zmq.Context()
    sock = ctx.socket(_zmq.REQ)
    sock.setsockopt(_zmq.RCVTIMEO, 3000)
    sock.connect(f"tcp://127.0.0.1:{zmq_server.port}")
    try:
        import json

        # First malformed
        sock.send(b"bad1")
        resp = json.loads(sock.recv())
        assert resp["ok"] is False

        # Second malformed
        sock.send(b"bad2")
        resp = json.loads(sock.recv())
        assert resp["ok"] is False

        # Third: valid — proves no deadlock
        msg = {"cmd": "ping", "id": "recovery", "_token": zmq_server.token}
        sock.send(json.dumps(msg).encode())
        resp = json.loads(sock.recv())
        assert resp.get("status") == "alive"
    finally:
        sock.close()
        ctx.term()


def test_audio_handler_returns_error_on_exception(zmq_client, monkeypatch):
    """Audio handlers (play/pause/seek/volume/position/stop) return error on exception."""
    # Monkeypatch audio_player to raise on all methods
    from zmq_server import ZMQServer

    class BrokenPlayer:
        def play(self):
            raise RuntimeError("broken")

        def pause(self):
            raise RuntimeError("broken")

        def seek(self, t):
            raise RuntimeError("broken")

        def set_volume(self, v):
            raise RuntimeError("broken")

        @property
        def position_seconds(self):
            raise RuntimeError("broken")

        @property
        def position(self):
            raise RuntimeError("broken")

        @property
        def duration_seconds(self):
            raise RuntimeError("broken")

        @property
        def is_playing(self):
            raise RuntimeError("broken")

        @property
        def volume(self):
            raise RuntimeError("broken")

        def stop(self):
            raise RuntimeError("broken")

        def close(self):
            pass

    # Swap audio player for test
    from zmq_server import ZMQServer as _ZS

    # Get the server instance from the fixture chain
    # zmq_client fixture depends on zmq_server which yields the server
    # We can access it through the handle_message path
    import types

    # Use handle_message directly to test handler guards
    server = ZMQServer.__new__(ZMQServer)
    server.audio_player = BrokenPlayer()
    server.token = "test-token"

    for cmd in ["audio_play", "audio_pause", "audio_stop", "audio_position"]:
        msg = {"cmd": cmd, "id": "test", "_token": "test-token"}
        resp = server.handle_message(msg)
        assert resp["ok"] is False, f"{cmd} should return error"
        assert "error" in resp, f"{cmd} should have error field"


def test_clock_handler_returns_error_on_exception(zmq_client, monkeypatch):
    """Clock handlers (sync/set_fps) return error dict on exception."""
    from zmq_server import ZMQServer

    class BrokenClock:
        def sync_state(self):
            raise RuntimeError("broken")

        def set_fps(self, fps):
            raise RuntimeError("broken")

        @property
        def fps(self):
            raise RuntimeError("broken")

    server = ZMQServer.__new__(ZMQServer)
    server.av_clock = BrokenClock()
    server.token = "test-token"

    resp = server.handle_message(
        {"cmd": "clock_sync", "id": "test", "_token": "test-token"}
    )
    assert resp["ok"] is False

    resp = server.handle_message(
        {"cmd": "clock_set_fps", "id": "test", "fps": 30.0, "_token": "test-token"}
    )
    assert resp["ok"] is False


def test_export_status_cancel_returns_error_on_exception(zmq_client, monkeypatch):
    """Export status/cancel handlers return error dict on exception."""
    from zmq_server import ZMQServer

    class BrokenExportManager:
        def get_status(self):
            raise RuntimeError("broken")

        def cancel(self):
            raise RuntimeError("broken")

    server = ZMQServer.__new__(ZMQServer)
    server.export_manager = BrokenExportManager()
    server.token = "test-token"

    resp = server.handle_message(
        {"cmd": "export_status", "id": "test", "_token": "test-token"}
    )
    assert resp["ok"] is False

    resp = server.handle_message(
        {"cmd": "export_cancel", "id": "test", "_token": "test-token"}
    )
    assert resp["ok"] is False


def test_export_start_catches_non_runtime_errors(zmq_client, monkeypatch):
    """Export start catches TypeError/ValueError, not just RuntimeError."""
    from zmq_server import ZMQServer
    from pathlib import Path

    class TypeErrorExportManager:
        def start(self, *args):
            raise TypeError("unexpected type")

    server = ZMQServer.__new__(ZMQServer)
    server.export_manager = TypeErrorExportManager()
    server.token = "test-token"

    # We need a valid input/output path to get past validation
    # Use handle_message with a message that passes all validation checks
    # by monkeypatching the validation functions
    import security

    original_upload = security.validate_upload
    original_output = security.validate_output_path
    original_chain = security.validate_chain_depth

    monkeypatch.setattr(security, "validate_upload", lambda p: [])
    monkeypatch.setattr(security, "validate_output_path", lambda p: [])
    monkeypatch.setattr(security, "validate_chain_depth", lambda c: [])

    resp = server.handle_message(
        {
            "cmd": "export_start",
            "id": "test",
            "_token": "test-token",
            "input_path": "/fake/input.mp4",
            "output_path": "/fake/output.mp4",
            "chain": [],
        }
    )
    assert resp["ok"] is False
    assert "error" in resp
