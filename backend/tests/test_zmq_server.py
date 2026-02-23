import uuid

import zmq


def test_ping_pong(zmq_client):
    msg_id = str(uuid.uuid4())
    zmq_client.send_json({"cmd": "ping", "id": msg_id})
    resp = zmq_client.recv_json()
    assert resp["id"] == msg_id
    assert resp["status"] == "alive"
    assert isinstance(resp["uptime_s"], float)


def test_unknown_command(zmq_client):
    msg_id = str(uuid.uuid4())
    zmq_client.send_json({"cmd": "foobar", "id": msg_id})
    resp = zmq_client.recv_json()
    assert resp["id"] == msg_id
    assert resp["ok"] is False
    assert "unknown" in resp["error"]


def test_shutdown(zmq_server):
    ctx = zmq.Context()
    sock = ctx.socket(zmq.REQ)
    sock.connect(f"tcp://127.0.0.1:{zmq_server.port}")
    msg_id = str(uuid.uuid4())
    sock.send_json({"cmd": "shutdown", "id": msg_id, "_token": zmq_server.token})
    resp = sock.recv_json()
    assert resp["id"] == msg_id
    assert resp["ok"] is True
    sock.close()
    ctx.term()
