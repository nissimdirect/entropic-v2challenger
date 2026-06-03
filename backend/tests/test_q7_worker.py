"""PR #9 tests for the L worker — dispatcher unit + subprocess integration.

Two tiers:
  - smoke: dispatcher unit tests using mock loaders (fast, no subprocess)
  - integration: spawn the real worker as a subprocess + round-trip ZMQ
    encode requests (also smoke-marked when using mock; slow when using
    real DINOv2 download)

Per [[feedback_sdlc-verify-in-app-not-just-code]]: the integration tests
spawn the REAL worker process to validate the wire protocol + lifecycle,
not just the dispatcher's Python-level behavior.
"""

from __future__ import annotations

import base64
import os
import socket
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import pytest
import zmq

REPO_BACKEND = Path(__file__).resolve().parent.parent
SRC_DIR = REPO_BACKEND / "src"
SCRIPTS_DIR = REPO_BACKEND / "scripts"

if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))


# ---------------------------------------------------------------------------
# Unit tests — dispatcher with mock loaders
# ---------------------------------------------------------------------------


@pytest.mark.smoke
def test_dispatcher_constructs_clean():
    from q7_worker.dispatcher import Dispatcher

    d = Dispatcher(backend="mock")
    assert d.backend == "mock"
    assert d.stats.encode_count == 0
    assert d.stats.encode_errors == 0


@pytest.mark.smoke
def test_dispatcher_caches_loaders():
    from q7_worker.dispatcher import Dispatcher

    d = Dispatcher(backend="mock")
    a = d.get_loader("dinov2")
    b = d.get_loader("dinov2")
    assert a is b
    assert d.stats.cold_load_count == 1


@pytest.mark.smoke
def test_dispatcher_handle_encode_dinov2_image_list():
    from q7_worker.dispatcher import Dispatcher

    d = Dispatcher(backend="mock")
    frame = np.zeros((224, 224, 3), dtype=np.uint8).tolist()
    resp = d.handle_encode({"model": "dinov2", "image": frame})
    assert resp["ok"] is True
    assert resp["model"] == "dinov2"
    assert resp["embed_dim"] == 384
    assert len(resp["embedding"]) == 384
    assert d.stats.encode_count == 1


@pytest.mark.smoke
def test_dispatcher_handle_encode_dinov2_image_b64():
    from q7_worker.dispatcher import Dispatcher

    d = Dispatcher(backend="mock")
    frame = np.zeros((224, 224, 3), dtype=np.uint8)
    img_b64 = base64.b64encode(frame.tobytes()).decode("ascii")
    resp = d.handle_encode(
        {
            "model": "dinov2",
            "image_b64": img_b64,
            "height": 224,
            "width": 224,
        }
    )
    assert resp["ok"] is True
    assert resp["embed_dim"] == 384


@pytest.mark.smoke
def test_dispatcher_handle_encode_clip_text():
    from q7_worker.dispatcher import Dispatcher

    d = Dispatcher(backend="mock")
    resp = d.handle_encode({"model": "clip", "text": "a glitchy frame"})
    assert resp["ok"] is True
    assert resp["model"] == "clip"
    assert resp["embed_dim"] == 512


@pytest.mark.smoke
def test_dispatcher_handle_encode_clap_text():
    from q7_worker.dispatcher import Dispatcher

    d = Dispatcher(backend="mock")
    resp = d.handle_encode({"model": "clap", "text": "footsteps in snow"})
    assert resp["ok"] is True
    assert resp["embed_dim"] == 512


@pytest.mark.smoke
def test_dispatcher_handle_encode_clap_audio_b64():
    from q7_worker.dispatcher import Dispatcher

    d = Dispatcher(backend="mock")
    audio = np.zeros(48000 * 3, dtype=np.float32)
    audio_b64 = base64.b64encode(audio.tobytes()).decode("ascii")
    resp = d.handle_encode(
        {"model": "clap", "audio_b64": audio_b64, "sample_rate": 48000}
    )
    assert resp["ok"] is True
    assert resp["embed_dim"] == 512


@pytest.mark.smoke
def test_dispatcher_unknown_model_returns_error():
    from q7_worker.dispatcher import Dispatcher

    d = Dispatcher(backend="mock")
    resp = d.handle_encode({"model": "not_a_real_model", "image": [[[0, 0, 0]]]})
    assert resp["ok"] is False
    assert "unknown" in resp["error"].lower()
    assert d.stats.encode_errors == 1


@pytest.mark.smoke
def test_dispatcher_payload_decode_failure_returns_error():
    from q7_worker.dispatcher import Dispatcher

    d = Dispatcher(backend="mock")
    resp = d.handle_encode({"model": "dinov2"})  # missing image
    assert resp["ok"] is False
    assert "decode" in resp["error"].lower() or "missing" in resp["error"].lower()
    assert d.stats.encode_errors == 1


@pytest.mark.smoke
def test_dispatcher_backend_not_lit_clip_returns_error():
    """CLIP encode is still NotImplementedError in PR #6+; dispatcher surfaces gracefully."""
    from q7_worker.dispatcher import Dispatcher

    d = Dispatcher(backend="cpu")
    resp = d.handle_encode({"model": "clip", "text": "x"})
    assert resp["ok"] is False
    assert resp["error"] == "BACKEND_NOT_LIT"
    assert "detail" in resp
    assert d.stats.encode_errors == 1


@pytest.mark.smoke
def test_dispatcher_handle_stats():
    from q7_worker.dispatcher import Dispatcher

    d = Dispatcher(backend="mock")
    d.handle_encode(
        {"model": "dinov2", "image": np.zeros((224, 224, 3), dtype=np.uint8).tolist()}
    )
    stats = d.handle_stats()
    assert stats["ok"] is True
    assert stats["encode_count"] == 1
    assert "dinov2" in stats["loaded_backbones"]


# ---------------------------------------------------------------------------
# Integration tests — real worker subprocess + ZMQ round-trip
# (App-verification per [[feedback_sdlc-verify-in-app-not-just-code]])
# ---------------------------------------------------------------------------


def _find_free_port() -> int:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


@pytest.fixture
def worker_subprocess():
    """Spawn the real q7_worker as a subprocess on a random port."""
    port = _find_free_port()
    env = os.environ.copy()
    env["PYTHONPATH"] = f"{SRC_DIR}:{SCRIPTS_DIR}"
    proc = subprocess.Popen(
        [sys.executable, "-m", "q7_worker", "--port", str(port), "--backend", "cpu"],
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    # Wait for "listening" line on stderr (with timeout)
    deadline = time.monotonic() + 6.0
    started = False
    while time.monotonic() < deadline:
        if proc.poll() is not None:
            stderr = proc.stderr.read().decode() if proc.stderr else ""
            raise RuntimeError(f"worker exited early: {stderr}")
        # Quick port-bind check
        try:
            test_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            test_sock.settimeout(0.1)
            test_sock.connect(("127.0.0.1", port))
            test_sock.close()
            started = True
            break
        except (OSError, socket.timeout):
            time.sleep(0.05)
    if not started:
        proc.kill()
        raise RuntimeError("worker did not become ready in 6s")

    yield port, proc

    proc.terminate()
    try:
        proc.wait(timeout=3.0)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=2.0)


def _send_req(port: int, msg: dict, timeout_ms: int = 3000) -> dict:
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
def test_worker_subprocess_responds_to_ping(worker_subprocess):
    """App-verification: real worker process answers ping over ZMQ."""
    port, _ = worker_subprocess
    resp = _send_req(port, {"cmd": "ping", "id": "ping-1"})
    assert resp["ok"] is True
    assert resp["id"] == "ping-1"
    assert resp["schema"] == "q7-worker-v1"
    assert "version" in resp


@pytest.mark.smoke
def test_worker_subprocess_unknown_cmd_returns_error(worker_subprocess):
    port, _ = worker_subprocess
    resp = _send_req(port, {"cmd": "not-a-real-cmd", "id": "x"})
    assert resp["ok"] is False
    assert "unknown" in resp["error"].lower()


@pytest.mark.smoke
def test_worker_subprocess_stats_command(worker_subprocess):
    port, _ = worker_subprocess
    resp = _send_req(port, {"cmd": "stats", "id": "s1"})
    assert resp["ok"] is True
    assert resp["encode_count"] == 0
    assert resp["loaded_backbones"] == []


@pytest.mark.smoke
def test_worker_subprocess_shutdown_exits_clean(worker_subprocess):
    port, proc = worker_subprocess
    resp = _send_req(port, {"cmd": "shutdown", "id": "bye"})
    assert resp["ok"] is True
    # Process exits within 2s
    try:
        rc = proc.wait(timeout=2.0)
        assert rc == 0
    except subprocess.TimeoutExpired:
        pytest.fail("worker did not exit after shutdown cmd")


@pytest.mark.smoke
def test_worker_subprocess_encode_clip_backend_not_lit_graceful(worker_subprocess):
    """CLIP stub state should produce a clean error response, not crash worker."""
    port, _ = worker_subprocess
    resp = _send_req(
        port, {"cmd": "encode", "id": "e1", "payload": {"model": "clip", "text": "x"}}
    )
    assert resp["ok"] is False
    assert resp["error"] == "BACKEND_NOT_LIT"
    # Worker still alive — ping should work
    ping = _send_req(port, {"cmd": "ping", "id": "after-error"})
    assert ping["ok"] is True


def _torch_available() -> bool:
    try:
        import torch  # noqa: F401
        import transformers  # noqa: F401
        import huggingface_hub  # noqa: F401
    except ImportError:
        return False
    return True


@pytest.mark.slow
@pytest.mark.skipif(not _torch_available(), reason="real DINOv2 path requires torch")
def test_worker_subprocess_encode_real_dinov2_round_trip(worker_subprocess):
    """**App-verification:** spawn real worker, send real DINOv2 encode, get back 384-dim embedding."""
    port, _ = worker_subprocess
    frame = np.full((224, 224, 3), 128, dtype=np.uint8).tolist()
    resp = _send_req(
        port,
        {"cmd": "encode", "id": "e2", "payload": {"model": "dinov2", "image": frame}},
        timeout_ms=120_000,  # first call may download model
    )
    assert resp["ok"] is True
    assert resp["model"] == "dinov2"
    assert resp["embed_dim"] == 384
    assert len(resp["embedding"]) == 384
    assert resp["elapsed_ms"] > 0
    # Embedding is L2-normalized
    norm = float(np.linalg.norm(np.array(resp["embedding"])))
    assert 0.99 < norm < 1.01
