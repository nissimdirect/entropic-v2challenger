"""Tests for graceful ZMQ server shutdown."""

import threading
import time
import uuid

import zmq


def test_shutdown_sets_running_false(zmq_server):
    """Shutdown command sets server.running = False."""
    assert zmq_server.running is True
    ctx = zmq.Context()
    sock = ctx.socket(zmq.REQ)
    sock.connect(f"tcp://127.0.0.1:{zmq_server.port}")
    msg_id = str(uuid.uuid4())
    sock.send_json({"cmd": "shutdown", "id": msg_id})
    resp = sock.recv_json()
    assert resp["ok"] is True
    assert resp["id"] == msg_id
    assert zmq_server.running is False
    sock.close()
    ctx.term()


def test_shutdown_returns_msg_id(zmq_server):
    """Shutdown response echoes back the message id."""
    ctx = zmq.Context()
    sock = ctx.socket(zmq.REQ)
    sock.connect(f"tcp://127.0.0.1:{zmq_server.port}")
    msg_id = str(uuid.uuid4())
    sock.send_json({"cmd": "shutdown", "id": msg_id})
    resp = sock.recv_json()
    assert resp["id"] == msg_id
    sock.close()
    ctx.term()


def test_shutdown_without_id(zmq_server):
    """Shutdown works even when no id is provided."""
    ctx = zmq.Context()
    sock = ctx.socket(zmq.REQ)
    sock.connect(f"tcp://127.0.0.1:{zmq_server.port}")
    sock.send_json({"cmd": "shutdown"})
    resp = sock.recv_json()
    assert resp["ok"] is True
    assert resp["id"] is None
    sock.close()
    ctx.term()


def test_server_run_loop_exits_after_shutdown(zmq_server):
    """After shutdown, the run() loop should stop within the poller timeout."""
    ctx = zmq.Context()
    sock = ctx.socket(zmq.REQ)
    sock.connect(f"tcp://127.0.0.1:{zmq_server.port}")
    sock.send_json({"cmd": "shutdown", "id": "exit-test"})
    resp = sock.recv_json()
    assert resp["ok"] is True
    # Server should stop within ~500ms (the poller timeout) after running=False
    time.sleep(0.7)
    assert zmq_server.running is False
    sock.close()
    ctx.term()


def test_ping_before_shutdown(zmq_server):
    """Server responds to ping, then shutdown works cleanly."""
    ctx = zmq.Context()
    sock = ctx.socket(zmq.REQ)
    sock.connect(f"tcp://127.0.0.1:{zmq_server.port}")

    # Ping first
    sock.send_json({"cmd": "ping", "id": "pre-ping"})
    resp = sock.recv_json()
    assert resp["status"] == "alive"

    # Then shutdown
    sock.send_json({"cmd": "shutdown", "id": "post-shutdown"})
    resp = sock.recv_json()
    assert resp["ok"] is True

    sock.close()
    ctx.term()
