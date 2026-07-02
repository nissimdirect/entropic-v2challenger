"""V7: Nuitka Build Test — validate compiled binary exists, is sane-sized, imports core modules, and serves ZMQ."""

import signal
import subprocess
import time
from pathlib import Path

import pytest
import zmq

BACKEND_DIR = Path(__file__).resolve().parents[2]
DIST_DIR = BACKEND_DIR / "main.dist"

# Nuitka standalone binary candidates (macOS may omit extension)
_BINARY_CANDIDATES = ["main.bin", "main"]


def _find_binary() -> Path | None:
    """Return the first existing binary candidate in main.dist/, or None."""
    if not DIST_DIR.exists():
        return None
    for name in _BINARY_CANDIDATES:
        p = DIST_DIR / name
        if p.exists():
            return p
    return None


nuitka_skip = pytest.mark.skipif(
    _find_binary() is None, reason="Nuitka build not available (binary not found)"
)


@nuitka_skip
def test_v7_nuitka_build_exists():
    """Verify main.dist/ exists and contains the compiled binary.
    PASS: binary file is present and non-empty."""
    assert DIST_DIR.is_dir(), "main.dist/ directory missing"
    binary = _find_binary()
    assert binary is not None, (
        f"Binary not found — checked {_BINARY_CANDIDATES}. "
        f"Contents: {sorted(p.name for p in DIST_DIR.iterdir())[:20]}"
    )
    assert binary.stat().st_size > 0, f"Binary {binary.name} is empty"


@nuitka_skip
def test_v7_binary_size_under_200mb():
    """Total size of main.dist/ must be under 200 MB.
    PASS: sum of all files < 200 MB."""
    total = sum(f.stat().st_size for f in DIST_DIR.rglob("*") if f.is_file())
    mb = total / (1024 * 1024)
    assert mb < 200, f"main.dist/ is {mb:.1f} MB — exceeds 200 MB budget"


@nuitka_skip
def test_v7_binary_imports_core_modules():
    """Run compiled binary with a one-liner to verify core imports.
    PASS: exit code 0 for importing pyzmq, numpy, av, PIL."""
    binary = _find_binary()
    import_script = (
        "import zmq; import numpy; import av; import PIL; "
        "print('OK: all core modules imported')"
    )
    result = subprocess.run(
        [str(binary), "-c", import_script],
        capture_output=True,
        text=True,
        timeout=30,
        cwd=str(DIST_DIR),
    )
    assert result.returncode == 0, (
        f"Binary failed to import core modules.\n"
        f"stdout: {result.stdout[:500]}\n"
        f"stderr: {result.stderr[:500]}"
    )
    assert "OK" in result.stdout, f"Unexpected output (imports): {result.stdout[:300]}"


@nuitka_skip
def test_v7_binary_runs_determinism():
    """Run determinism check via compiled binary.
    PASS: binary can execute determinism logic and exit 0."""
    binary = _find_binary()
    det_script = (
        "import hashlib, numpy as np; "
        "rng = np.random.default_rng(42); "
        "a = rng.integers(0, 256, (480, 640, 4), dtype=np.uint8); "
        "h1 = hashlib.sha256(a.tobytes()).hexdigest(); "
        "rng2 = np.random.default_rng(42); "
        "b = rng2.integers(0, 256, (480, 640, 4), dtype=np.uint8); "
        "h2 = hashlib.sha256(b.tobytes()).hexdigest(); "
        "assert h1 == h2, 'Determinism broken'; "
        "print('OK: determinism verified')"
    )
    result = subprocess.run(
        [str(binary), "-c", det_script],
        capture_output=True,
        text=True,
        timeout=30,
        cwd=str(DIST_DIR),
    )
    assert result.returncode == 0, (
        f"Determinism check failed.\n"
        f"stdout: {result.stdout[:500]}\n"
        f"stderr: {result.stderr[:500]}"
    )
    assert "OK" in result.stdout, (
        f"Unexpected output (determinism): {result.stdout[:300]}"
    )


@nuitka_skip
def test_v7_binary_zmq_smoke():
    """Start the compiled binary as a ZMQ server, ping it, verify response.
    PASS: binary starts, prints port/token, responds to ping, shuts down cleanly."""
    binary = _find_binary()
    assert binary is not None
    proc = subprocess.Popen(
        [str(binary)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        cwd=str(DIST_DIR),
    )
    try:
        port = None
        ping_port = None
        token = None
        deadline = time.monotonic() + 10

        assert proc.stdout is not None
        while time.monotonic() < deadline:
            line = proc.stdout.readline()
            if not line:
                time.sleep(0.1)
                continue
            line = line.strip()
            if line.startswith("ZMQ_PORT="):
                port = int(line.split("=")[1])
            elif line.startswith("ZMQ_PING_PORT="):
                ping_port = int(line.split("=")[1])
            elif line.startswith("ZMQ_TOKEN="):
                token = line.split("=")[1]
            if port and ping_port and token:
                break

        assert port is not None, "Binary did not print ZMQ_PORT"
        assert ping_port is not None, "Binary did not print ZMQ_PING_PORT"
        assert token is not None, "Binary did not print ZMQ_TOKEN"

        ctx = zmq.Context()
        sock = ctx.socket(zmq.REQ)
        sock.setsockopt(zmq.RCVTIMEO, 5000)
        sock.setsockopt(zmq.LINGER, 0)
        sock.connect(f"tcp://127.0.0.1:{ping_port}")

        sock.send_json({"cmd": "ping", "id": "nuitka-smoke", "_token": token})
        resp = sock.recv_json()

        assert isinstance(resp, dict)
        assert resp.get("status") == "alive", f"Unexpected ping response: {resp}"
        assert "uptime_s" in resp, f"Missing uptime_s in response: {resp}"

        sock.close()
        ctx.term()
    finally:
        proc.send_signal(signal.SIGTERM)
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()
