import os
import shutil
import threading
import time
import uuid
from pathlib import Path

import numpy as np
import pytest
import zmq

from effects.registry import _REGISTRY
from zmq_server import ZMQServer

# Register conftest plugins
pytest_plugins = ["conftest_plugins.manifest"]


@pytest.fixture(scope="function", autouse=True)
def _restore_effect_registry_per_function():
    """Function-scoped half of the registry guard: undoes any registration a
    single test makes directly in its own body (e.g.
    TestReservedParamNamespace.test_register_allows_normal_param_keys calling
    `registry.register(...)` inline). See `_restore_effect_registry_per_module`
    below for the module-scoped half — both are needed, see that fixture's
    docstring for why one alone is insufficient.
    """
    snapshot = dict(_REGISTRY)
    try:
        yield
    finally:
        _REGISTRY.clear()
        _REGISTRY.update(snapshot)


@pytest.fixture(scope="module", autouse=True)
def _restore_effect_registry_per_module():
    """Root-level guard against effect-registry pollution (F4b-2 regression;
    promoted from the function-scoped-only fixture in
    tests/test_effects/conftest.py, now deleted).

    F4b regression: TestReservedParamNamespace.test_register_allows_normal_param_keys
    (test_registry.py) registers `test._reserved_namespace_ok` directly into the
    shared, module-level `effects.registry._REGISTRY` dict and never unregisters
    it — the function-scoped fixture above handles that case.

    `test_mask_routing.py`'s `_register_test_effects` fixture leaks
    `test.add10`/`test.add40`/`test.add100`/`test.invert_rgb` a different way:
    it is itself `scope="module", autouse=True` with no teardown. Pytest sets up
    higher-scoped (module) autouse fixtures before same-request lower-scoped
    (function) ones, so by the time the function-scoped fixture above takes its
    first snapshot within that module, the leak has ALREADY happened — a
    function-scoped guard alone can never undo a module-scoped leak, because its
    "clean" snapshot is taken after the pollution occurred and its restore just
    puts the pollution straight back. Only a fixture at the SAME scope as (or
    broader than) the leaking fixture, torn down after that fixture, can catch
    it. This module-scoped guard snapshots before any module-scoped fixture in
    the module runs (conftest fixtures are instantiated before same-scoped
    fixtures declared in the test module itself) and restores after the module's
    own fixtures tear down, so it closes the gap the function-scoped guard
    leaves open. Together the two fixtures ensure no registration — whether made
    inline in a test body or via a module-scoped setup fixture — survives past
    the module that created it, which is what `pytest-xdist --dist loadfile`
    (whole-file worker assignment) requires: the crash in
    `test_integration.py::test_all_effects_process_without_crash` (or
    `test_effects/test_registry.py`'s own leak guard) only happens if a leak
    survives past its own FILE's tests, and both fixtures close that off.
    """
    snapshot = dict(_REGISTRY)
    try:
        yield
    finally:
        _REGISTRY.clear()
        _REGISTRY.update(snapshot)


@pytest.fixture(scope="session", autouse=True)
def _isolate_bake_log_for_suite(tmp_path_factory):
    """F6: redirect the audio bake-log writer away from the real
    ~/.creatrix/audio-bake-log.jsonl for the ENTIRE test session.

    Without this, any test that exercises MixerPlayer.start()/stop() — even
    indirectly, not just tests that opt in via a dedicated fixture — appends
    real telemetry lines to the user's bake log. The 2026-07-02 audit found
    181 real entries were test-generated (microsecond durations, empty
    device), which would poison the 1-week/2h bake-gate clock
    (scripts/check_bake_gate.py). This is isolation AT THE WRITER
    (audio/bake_log.py:bake_log_path() honors CREATRIX_BAKE_LOG), applied
    once for the whole suite rather than per-test, so no test can forget it.

    Also sets CREATRIX_APP_MODE=test so any session that IS written (e.g. by
    a test that deliberately overrides CREATRIX_BAKE_LOG to inspect the
    writer) carries correct provenance — the gate excludes app_mode=="test"
    sessions from the real-usage count as defense in depth.
    """
    log_dir = tmp_path_factory.mktemp("bake-log-isolation")
    prev_log = os.environ.get("CREATRIX_BAKE_LOG")
    prev_mode = os.environ.get("CREATRIX_APP_MODE")
    os.environ["CREATRIX_BAKE_LOG"] = str(log_dir / "audio-bake-log.jsonl")
    os.environ["CREATRIX_APP_MODE"] = "test"
    yield
    if prev_log is None:
        os.environ.pop("CREATRIX_BAKE_LOG", None)
    else:
        os.environ["CREATRIX_BAKE_LOG"] = prev_log
    if prev_mode is None:
        os.environ.pop("CREATRIX_APP_MODE", None)
    else:
        os.environ["CREATRIX_APP_MODE"] = prev_mode


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
