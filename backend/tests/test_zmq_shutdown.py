"""Tests for graceful ZMQ server shutdown + auth token validation."""

import time
import uuid

import zmq


def _send(sock, msg: dict, token: str) -> dict:
    """Send a message with the auth token injected."""
    msg["_token"] = token
    sock.send_json(msg)
    return sock.recv_json()


def test_shutdown_sets_running_false(zmq_server_disposable):
    """Shutdown command sets server.running = False."""
    assert zmq_server_disposable.running is True
    ctx = zmq.Context()
    sock = ctx.socket(zmq.REQ)
    sock.connect(f"tcp://127.0.0.1:{zmq_server_disposable.port}")
    msg_id = str(uuid.uuid4())
    resp = _send(sock, {"cmd": "shutdown", "id": msg_id}, zmq_server_disposable.token)
    assert resp["ok"] is True
    assert resp["id"] == msg_id
    assert zmq_server_disposable.running is False
    sock.close()
    ctx.term()


def test_shutdown_returns_msg_id(zmq_server_disposable):
    """Shutdown response echoes back the message id."""
    ctx = zmq.Context()
    sock = ctx.socket(zmq.REQ)
    sock.connect(f"tcp://127.0.0.1:{zmq_server_disposable.port}")
    msg_id = str(uuid.uuid4())
    resp = _send(sock, {"cmd": "shutdown", "id": msg_id}, zmq_server_disposable.token)
    assert resp["id"] == msg_id
    sock.close()
    ctx.term()


def test_shutdown_without_id(zmq_server_disposable):
    """Shutdown works even when no id is provided."""
    ctx = zmq.Context()
    sock = ctx.socket(zmq.REQ)
    sock.connect(f"tcp://127.0.0.1:{zmq_server_disposable.port}")
    resp = _send(sock, {"cmd": "shutdown"}, zmq_server_disposable.token)
    assert resp["ok"] is True
    assert resp["id"] is None
    sock.close()
    ctx.term()


def test_server_run_loop_exits_after_shutdown(zmq_server_disposable):
    """After shutdown, the run() loop should stop within the poller timeout."""
    ctx = zmq.Context()
    sock = ctx.socket(zmq.REQ)
    sock.connect(f"tcp://127.0.0.1:{zmq_server_disposable.port}")
    resp = _send(
        sock, {"cmd": "shutdown", "id": "exit-test"}, zmq_server_disposable.token
    )
    assert resp["ok"] is True
    # Server should stop within ~500ms (the poller timeout) after running=False
    time.sleep(0.7)
    assert zmq_server_disposable.running is False
    sock.close()
    ctx.term()


def test_ping_before_shutdown(zmq_server_disposable):
    """Server responds to ping, then shutdown works cleanly."""
    ctx = zmq.Context()
    sock = ctx.socket(zmq.REQ)
    sock.connect(f"tcp://127.0.0.1:{zmq_server_disposable.port}")

    # Ping first
    resp = _send(sock, {"cmd": "ping", "id": "pre-ping"}, zmq_server_disposable.token)
    assert resp["status"] == "alive"

    # Then shutdown
    resp = _send(
        sock, {"cmd": "shutdown", "id": "post-shutdown"}, zmq_server_disposable.token
    )
    assert resp["ok"] is True

    sock.close()
    ctx.term()


def test_unauthenticated_message_rejected(zmq_server_disposable):
    """Message without auth token is rejected."""
    ctx = zmq.Context()
    sock = ctx.socket(zmq.REQ)
    sock.connect(f"tcp://127.0.0.1:{zmq_server_disposable.port}")
    sock.send_json({"cmd": "ping", "id": "no-token"})
    resp = sock.recv_json()
    assert resp["ok"] is False
    assert "token" in resp["error"]
    sock.close()
    ctx.term()


def test_wrong_token_rejected(zmq_server_disposable):
    """Message with wrong token is rejected."""
    ctx = zmq.Context()
    sock = ctx.socket(zmq.REQ)
    sock.connect(f"tcp://127.0.0.1:{zmq_server_disposable.port}")
    resp = _send(sock, {"cmd": "ping", "id": "bad-token"}, "wrong-token-value")
    assert resp["ok"] is False
    assert "token" in resp["error"]
    sock.close()
    ctx.term()
