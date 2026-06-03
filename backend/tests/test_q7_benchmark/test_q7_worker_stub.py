"""Tests for the q7_worker STUB (PR #4) — IPC shape, dispatch, lifecycle.

The stub binds a ZMQ REP socket and responds to ping/encode/shutdown. Tests
spawn the worker as a subprocess on a random port and send REQs. Real worker
(with model loads) ships in PR #9.
"""

from __future__ import annotations

import os
import socket
import subprocess
import sys
import time
from pathlib import Path

import pytest
import zmq

REPO_BACKEND = Path(__file__).resolve().parents[2]


def _find_free_port() -> int:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


@pytest.fixture
def worker_process():
    """Spawn the stub worker; yield (port, popen); kill on teardown."""
    port = _find_free_port()
    env = os.environ.copy()
    env["PYTHONPATH"] = str(REPO_BACKEND / "src")
    proc = subprocess.Popen(
        [sys.executable, "-m", "q7_worker", "--port", str(port)],
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    # Wait for "listening" message on stderr
    deadline = time.monotonic() + 5.0
    started = False
    while time.monotonic() < deadline:
        if proc.poll() is not None:
            stderr = proc.stderr.read().decode() if proc.stderr else ""
            raise RuntimeError(f"worker exited early: {stderr}")
        # Stub writes "listening" to stderr — give it a moment.
        time.sleep(0.05)
        # A simpler readiness check: try a connect.
        try:
            test_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            test_sock.settimeout(0.1)
            test_sock.connect(("127.0.0.1", port))
            test_sock.close()
            started = True
            break
        except (OSError, socket.timeout):
            continue
    if not started:
        proc.kill()
        raise RuntimeError("worker did not become ready in 5s")

    yield port, proc

    proc.terminate()
    try:
        proc.wait(timeout=2.0)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=2.0)


def _send_req(port: int, msg: dict, timeout_ms: int = 2000) -> dict:
    ctx = zmq.Context()
    sock = ctx.socket(zmq.REQ)
    sock.setsockopt(zmq.LINGER, 0)
    sock.setsockopt(zmq.RCVTIMEO, timeout_ms)
    sock.setsockopt(zmq.SNDTIMEO, timeout_ms)
    sock.connect(f"tcp://127.0.0.1:{port}")
    try:
        sock.send_json(msg)
        resp = sock.recv_json()
    finally:
        sock.close()
        ctx.term()
    return resp


@pytest.mark.smoke
def test_worker_responds_to_ping(worker_process):
    port, _ = worker_process
    resp = _send_req(port, {"cmd": "ping", "id": "test-1"})
    assert resp["ok"] is True
    assert resp["id"] == "test-1"
    assert resp["schema"] == "q7-worker-stub"


@pytest.mark.smoke
def test_worker_responds_to_encode_dinov2(worker_process):
    port, _ = worker_process
    resp = _send_req(
        port,
        {"cmd": "encode", "id": "enc-1", "payload": {"model": "dinov2"}},
    )
    assert resp["ok"] is True
    assert resp["model"] == "dinov2"
    assert resp["embed_dim"] == 384
    assert len(resp["embedding"]) == 384
    assert resp["backend"] == "stub"


@pytest.mark.smoke
def test_worker_responds_to_encode_clip(worker_process):
    port, _ = worker_process
    resp = _send_req(
        port,
        {"cmd": "encode", "id": "enc-2", "payload": {"model": "clip"}},
    )
    assert resp["embed_dim"] == 512


@pytest.mark.smoke
def test_worker_responds_to_encode_clap(worker_process):
    port, _ = worker_process
    resp = _send_req(
        port,
        {"cmd": "encode", "id": "enc-3", "payload": {"model": "clap"}},
    )
    assert resp["embed_dim"] == 512


@pytest.mark.smoke
def test_worker_rejects_unknown_cmd(worker_process):
    port, _ = worker_process
    resp = _send_req(port, {"cmd": "not-a-real-cmd", "id": "x"})
    assert resp["ok"] is False
    assert "unknown" in resp["error"].lower()


@pytest.mark.smoke
def test_worker_encode_is_deterministic(worker_process):
    """Same model name → same synthetic embedding (stub determinism)."""
    port, _ = worker_process
    a = _send_req(port, {"cmd": "encode", "payload": {"model": "dinov2"}})
    b = _send_req(port, {"cmd": "encode", "payload": {"model": "dinov2"}})
    assert a["embedding"] == b["embedding"]


@pytest.mark.smoke
def test_worker_shutdown_exits_cleanly(worker_process):
    port, proc = worker_process
    resp = _send_req(port, {"cmd": "shutdown", "id": "bye"})
    assert resp["ok"] is True
    assert "shutting down" in resp["message"]
    # Worker should exit shortly.
    try:
        rc = proc.wait(timeout=2.0)
        assert rc == 0
    except subprocess.TimeoutExpired:
        pytest.fail("worker did not exit after shutdown command")
