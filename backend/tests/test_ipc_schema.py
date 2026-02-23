"""Tests for IPC message schema validation — unknown commands, malformed JSON, missing fields."""

import uuid


def test_unknown_command_returns_error(zmq_client):
    """Unknown command returns ok=False with 'unknown' in error."""
    msg_id = str(uuid.uuid4())
    zmq_client.send_json({"cmd": "does_not_exist", "id": msg_id})
    resp = zmq_client.recv_json()
    assert resp["id"] == msg_id
    assert resp["ok"] is False
    assert "unknown" in resp["error"]


def test_empty_cmd_field(zmq_client):
    """Empty string cmd treated as unknown."""
    msg_id = str(uuid.uuid4())
    zmq_client.send_json({"cmd": "", "id": msg_id})
    resp = zmq_client.recv_json()
    assert resp["ok"] is False
    assert "unknown" in resp["error"]


def test_missing_cmd_field(zmq_client):
    """Message with no 'cmd' key returns unknown error."""
    msg_id = str(uuid.uuid4())
    zmq_client.send_json({"id": msg_id, "data": "test"})
    resp = zmq_client.recv_json()
    assert resp["id"] == msg_id
    assert resp["ok"] is False
    assert "unknown" in resp["error"]


def test_null_cmd_field(zmq_client):
    """Message with cmd=None returns unknown error."""
    msg_id = str(uuid.uuid4())
    zmq_client.send_json({"cmd": None, "id": msg_id})
    resp = zmq_client.recv_json()
    assert resp["ok"] is False
    assert "unknown" in resp["error"]


def test_missing_id_field(zmq_client):
    """Message with no 'id' key returns id=None."""
    zmq_client.send_json({"cmd": "ping"})
    resp = zmq_client.recv_json()
    assert resp["id"] is None
    assert resp["status"] == "alive"


def test_ingest_missing_path(zmq_client):
    """Ingest without path returns error."""
    msg_id = str(uuid.uuid4())
    zmq_client.send_json({"cmd": "ingest", "id": msg_id})
    resp = zmq_client.recv_json()
    assert resp["ok"] is False
    assert "missing path" in resp["error"]


def test_seek_missing_path(zmq_client):
    """Seek without path returns error."""
    msg_id = str(uuid.uuid4())
    zmq_client.send_json({"cmd": "seek", "id": msg_id, "time": 1.0})
    resp = zmq_client.recv_json()
    assert resp["ok"] is False
    assert "missing path" in resp["error"]


def test_render_frame_missing_path(zmq_client):
    """render_frame without path returns error."""
    msg_id = str(uuid.uuid4())
    zmq_client.send_json({"cmd": "render_frame", "id": msg_id, "chain": []})
    resp = zmq_client.recv_json()
    assert resp["ok"] is False
    assert "missing path" in resp["error"]


def test_apply_chain_missing_path(zmq_client):
    """apply_chain without path returns error."""
    msg_id = str(uuid.uuid4())
    zmq_client.send_json({"cmd": "apply_chain", "id": msg_id, "chain": []})
    resp = zmq_client.recv_json()
    assert resp["ok"] is False
    assert "missing path" in resp["error"]


def test_export_start_missing_input_path(zmq_client):
    """export_start without input_path returns error."""
    msg_id = str(uuid.uuid4())
    zmq_client.send_json(
        {"cmd": "export_start", "id": msg_id, "output_path": "/tmp/out.mp4"}
    )
    resp = zmq_client.recv_json()
    assert resp["ok"] is False
    assert "missing input_path" in resp["error"]


def test_export_start_missing_output_path(zmq_client):
    """export_start without output_path returns error."""
    msg_id = str(uuid.uuid4())
    zmq_client.send_json(
        {"cmd": "export_start", "id": msg_id, "input_path": "/tmp/in.mp4"}
    )
    resp = zmq_client.recv_json()
    assert resp["ok"] is False
    assert "missing output_path" in resp["error"]


def test_numeric_cmd_returns_unknown(zmq_client):
    """Numeric cmd value returns unknown error."""
    msg_id = str(uuid.uuid4())
    zmq_client.send_json({"cmd": 12345, "id": msg_id})
    resp = zmq_client.recv_json()
    assert resp["ok"] is False
    assert "unknown" in resp["error"]


def test_extra_fields_ignored(zmq_client):
    """Extra fields in message don't break anything."""
    msg_id = str(uuid.uuid4())
    zmq_client.send_json(
        {"cmd": "ping", "id": msg_id, "extra": "data", "nested": {"a": 1}}
    )
    resp = zmq_client.recv_json()
    assert resp["id"] == msg_id
    assert resp["status"] == "alive"


def test_list_effects_no_extra_fields_needed(zmq_client):
    """list_effects works with just cmd and id."""
    msg_id = str(uuid.uuid4())
    zmq_client.send_json({"cmd": "list_effects", "id": msg_id})
    resp = zmq_client.recv_json()
    assert resp["ok"] is True
    assert isinstance(resp["effects"], list)
    assert len(resp["effects"]) > 0


def test_flush_state_returns_ok(zmq_client):
    """flush_state returns ok=True."""
    msg_id = str(uuid.uuid4())
    zmq_client.send_json({"cmd": "flush_state", "id": msg_id})
    resp = zmq_client.recv_json()
    assert resp["ok"] is True
    assert resp["id"] == msg_id
