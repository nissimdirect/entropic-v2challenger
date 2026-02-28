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

# Register conftest plugins
pytest_plugins = ["conftest_plugins.manifest"]


def _wait_for_server(srv: ZMQServer, timeout: float = 2.0) -> bool:
    """Ping the server until it responds or timeout expires."""
    ctx = zmq.Context()
    sock = ctx.socket(zmq.REQ)
    sock.setsockopt(zmq.LINGER, 0)
    sock.setsockopt(zmq.RCVTIMEO, 500)
    sock.connect(f"tcp://127.0.0.1:{srv.port}")
    deadline = time.monotonic() + timeout
    alive = False
    while time.monotonic() < deadline:
        try:
            sock.send_json({"cmd": "ping", "id": "health", "_token": srv.token})
            resp = sock.recv_json()
            if resp.get("status") == "alive":
                alive = True
                break
        except zmq.Again:
            time.sleep(0.05)
    sock.close()
    ctx.term()
    return alive


@pytest.fixture(scope="session")
def _zmq_server_session():
    """Start ONE ZMQ server per xdist worker (session-scoped)."""
    srv = ZMQServer()
    thread = threading.Thread(target=srv.run, daemon=True)
    thread.start()
    if not _wait_for_server(srv):
        pytest.skip("ZMQ server failed to start within 2s")
    yield srv
    srv.running = False
    # Wait for poller timeout cycle to complete
    time.sleep(0.6)


@pytest.fixture
def zmq_server(_zmq_server_session):
    """Function-scoped wrapper: resets state between tests, shares session server."""
    _zmq_server_session.reset_state()
    _zmq_server_session.running = True
    yield _zmq_server_session


@pytest.fixture
def zmq_server_disposable():
    """Disposable server for shutdown tests that destroy sockets/context.

    Each test gets a fresh server that is fully torn down after.
    """
    srv = ZMQServer()
    thread = threading.Thread(target=srv.run, daemon=True)
    thread.start()
    if not _wait_for_server(srv):
        pytest.skip("ZMQ server failed to start within 2s")
    yield srv
    srv.running = False
    time.sleep(0.6)


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


@pytest.fixture(scope="session")
def synthetic_video_with_audio_path():
    """Create a synthetic 2s 320p test video WITH audio under ~/."""
    import av as _av

    fixture_dir = Path.home() / ".cache" / "entropic" / "test-fixtures"
    fixture_dir.mkdir(parents=True, exist_ok=True)
    path = str(fixture_dir / f"test_av_{uuid.uuid4().hex[:8]}.mp4")

    container = _av.open(path, mode="w")
    v_stream = container.add_stream("libx264", rate=30)
    v_stream.width = 320
    v_stream.height = 240
    v_stream.pix_fmt = "yuv420p"
    a_stream = container.add_stream("aac", rate=44100)
    a_stream.layout = "stereo"

    # Video: 60 frames (2s)
    for i in range(60):
        frame = np.zeros((240, 320, 3), dtype=np.uint8)
        frame[:, :, 0] = int(255 * i / 60)
        vf = _av.VideoFrame.from_ndarray(frame, format="rgb24")
        for pkt in v_stream.encode(vf):
            container.mux(pkt)

    # Audio: 2s 440Hz sine stereo
    sample_rate = 44100
    total = int(sample_rate * 2.0)
    t = np.arange(total, dtype=np.float32) / sample_rate
    sine = (np.sin(2 * np.pi * 440 * t) * 0.5).astype(np.float32)
    stereo = np.stack([sine, sine])
    frame_size = 1024
    for i in range(0, total, frame_size):
        chunk = stereo[:, i : i + frame_size]
        if chunk.shape[1] < frame_size:
            chunk = np.pad(chunk, ((0, 0), (0, frame_size - chunk.shape[1])))
        af = _av.AudioFrame.from_ndarray(chunk, format="fltp", layout="stereo")
        af.sample_rate = sample_rate
        for pkt in a_stream.encode(af):
            container.mux(pkt)

    for pkt in v_stream.encode():
        container.mux(pkt)
    for pkt in a_stream.encode():
        container.mux(pkt)
    container.close()

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
