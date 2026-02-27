import os
import shutil
import threading
import time
import uuid
from pathlib import Path

import numpy as np
import pytest
import zmq

from zmq_server import ZMQServer


@pytest.fixture
def zmq_server():
    """Start a ZMQ server in a background thread."""
    srv = ZMQServer()
    thread = threading.Thread(target=srv.run, daemon=True)
    thread.start()
    time.sleep(0.1)
    yield srv
    srv.running = False
    time.sleep(0.6)  # Wait for poller timeout cycle


class AuthenticatedZmqClient:
    """Wraps a ZMQ REQ socket and auto-injects the auth token."""

    def __init__(self, sock: zmq.Socket, token: str):
        self._sock = sock
        self._token = token

    def send_json(self, msg: dict) -> None:
        msg["_token"] = self._token
        self._sock.send_json(msg)

    def recv_json(self) -> dict:
        return self._sock.recv_json()

    def close(self) -> None:
        self._sock.close()


@pytest.fixture
def zmq_client(zmq_server):
    """REQ socket connected to the test server (auto-injects auth token)."""
    ctx = zmq.Context()
    sock = ctx.socket(zmq.REQ)
    sock.connect(f"tcp://127.0.0.1:{zmq_server.port}")
    client = AuthenticatedZmqClient(sock, zmq_server.token)
    yield client
    sock.close()
    ctx.term()


@pytest.fixture
def zmq_ping_client(zmq_server):
    """REQ socket connected to the test server's ping port."""
    ctx = zmq.Context()
    sock = ctx.socket(zmq.REQ)
    sock.connect(f"tcp://127.0.0.1:{zmq_server.ping_port}")
    client = AuthenticatedZmqClient(sock, zmq_server.token)
    yield client
    sock.close()
    ctx.term()


@pytest.fixture(scope="session")
def synthetic_video_path():
    """Create a synthetic 5s 720p test video under ~/ (required by validate_upload)."""
    from video.writer import VideoWriter

    fixture_dir = Path.home() / ".cache" / "entropic" / "test-fixtures"
    fixture_dir.mkdir(parents=True, exist_ok=True)

    # Clean stale fixtures from previous crashed runs
    for old in fixture_dir.glob("test_*.mp4"):
        old.unlink(missing_ok=True)

    path = str(fixture_dir / f"test_{uuid.uuid4().hex[:8]}.mp4")
    w = VideoWriter(path, 1280, 720, fps=30)
    for i in range(150):  # 5 seconds at 30fps
        # Gradient that changes per frame (so seeks return different frames)
        frame = np.zeros((720, 1280, 4), dtype=np.uint8)
        frame[:, :, 0] = int(255 * i / 150)  # Red gradient over time
        frame[:, :, 1] = 128
        frame[:, :, 2] = 64
        frame[:, :, 3] = 255
        w.write_frame(frame)
    w.close()
    yield path
    os.unlink(path)


@pytest.fixture
def home_tmp_path(tmp_path_factory):
    """tmp_path equivalent under ~/ for tests that go through validate_upload."""
    base = Path.home() / ".cache" / "entropic" / "test-tmp"
    base.mkdir(parents=True, exist_ok=True)
    d = base / f"test_{uuid.uuid4().hex[:8]}"
    d.mkdir()
    yield d
    shutil.rmtree(d, ignore_errors=True)
