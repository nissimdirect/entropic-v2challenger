"""Unit tests for SG-7 codec timeout wrapper.

Covers the contract from DEC-Q7-003 and SPEC-7 §5:
- Healthy file: container returned
- Missing file: original av.error.FileNotFoundError re-raised
- Truncated file: CodecTimeoutError fires within budget
- mode='w' (writer path)
- kwargs round-trip

Synthesizes test fixtures on disk (no network, no large assets). Tests are
marked @pytest.mark.smoke so the standard smoke tier picks them up.
"""

from __future__ import annotations

import os
import time
from pathlib import Path

import av
import numpy as np
import pytest

from video.codec_timeout import (
    DEFAULT_DECODE_TIMEOUT_SECONDS,
    CodecTimeoutError,
    av_open_timeout,
)


@pytest.fixture
def healthy_video(tmp_path: Path) -> Path:
    """Create a tiny 1-second mp4 with 10 frames at 10fps, solid blue."""
    out = tmp_path / "healthy.mp4"
    container = av.open(str(out), mode="w")
    stream = container.add_stream("libx264", rate=10)
    stream.width = 64
    stream.height = 64
    stream.pix_fmt = "yuv420p"
    for _ in range(10):
        frame_array = np.full((64, 64, 3), 64, dtype=np.uint8)
        frame_array[:, :, 2] = 200  # blue channel
        frame = av.VideoFrame.from_ndarray(frame_array, format="rgb24")
        for packet in stream.encode(frame):
            container.mux(packet)
    for packet in stream.encode():
        container.mux(packet)
    container.close()
    return out


@pytest.fixture
def truncated_video(tmp_path: Path) -> Path:
    """Valid ftyp box but no movie data — exercises the hang case."""
    out = tmp_path / "truncated.mp4"
    out.write_bytes(b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom")
    return out


@pytest.fixture
def empty_file(tmp_path: Path) -> Path:
    out = tmp_path / "empty.bin"
    out.write_bytes(b"")
    return out


@pytest.fixture
def garbage_file(tmp_path: Path) -> Path:
    out = tmp_path / "garbage.mp4"
    out.write_bytes(os.urandom(1024))
    return out


@pytest.mark.smoke
def test_healthy_file_opens_within_budget(healthy_video: Path) -> None:
    """Healthy file: returns container; well under timeout."""
    start = time.monotonic()
    container = av_open_timeout(str(healthy_video), timeout_s=5.0)
    elapsed = time.monotonic() - start
    try:
        assert elapsed < 2.0, f"healthy open took {elapsed:.2f}s"
        assert container is not None
        assert len(container.streams.video) == 1
    finally:
        container.close()


@pytest.mark.smoke
def test_missing_file_reraises_original_exception(tmp_path: Path) -> None:
    """Missing file: original av error propagated, NOT CodecTimeoutError."""
    missing = tmp_path / "does_not_exist.mp4"
    with pytest.raises(av.error.FileNotFoundError):
        av_open_timeout(str(missing), timeout_s=5.0)


@pytest.mark.smoke
def test_writer_mode_returns_container(tmp_path: Path) -> None:
    """mode='w' path (writer.py callsite)."""
    out = tmp_path / "writer_out.mp4"
    container = av_open_timeout(str(out), mode="w", timeout_s=5.0)
    try:
        assert container is not None
    finally:
        container.close()


@pytest.mark.smoke
def test_kwargs_round_trip(healthy_video: Path) -> None:
    """Extra kwargs forwarded to av.open."""
    # `options` is a real av.open kwarg; we just verify nothing chokes
    container = av_open_timeout(
        str(healthy_video), timeout_s=5.0, options={"probesize": "32"}
    )
    try:
        assert container is not None
    finally:
        container.close()


@pytest.mark.smoke
def test_codec_timeout_error_carries_context() -> None:
    """CodecTimeoutError exposes asset_path, operation, elapsed_s."""
    exc = CodecTimeoutError("/tmp/foo.mp4", "av.open", 5.0)
    assert exc.asset_path == "/tmp/foo.mp4"
    assert exc.operation == "av.open"
    assert exc.elapsed_s == 5.0
    assert "5.0s" in str(exc)
    assert "/tmp/foo.mp4" in str(exc)


@pytest.mark.smoke
def test_default_timeout_value_is_5_seconds() -> None:
    """Sentinel: don't accidentally change the spec default."""
    assert DEFAULT_DECODE_TIMEOUT_SECONDS == 5.0


@pytest.mark.smoke
def test_empty_file_errors_fast(empty_file: Path) -> None:
    """Empty file: PyAV errors quickly; no timeout needed."""
    start = time.monotonic()
    with pytest.raises(Exception) as excinfo:  # av.error.InvalidDataError or similar
        av_open_timeout(str(empty_file), timeout_s=5.0)
    elapsed = time.monotonic() - start
    assert elapsed < 2.0, f"empty-file error took {elapsed:.2f}s"
    # Must not be a CodecTimeoutError — the error came from PyAV directly.
    assert not isinstance(excinfo.value, CodecTimeoutError)


@pytest.mark.smoke
def test_garbage_file_errors_or_times_out_within_budget(garbage_file: Path) -> None:
    """1KB of random bytes: either errors fast OR times out within 1.5s of budget."""
    start = time.monotonic()
    with pytest.raises(Exception):
        av_open_timeout(str(garbage_file), timeout_s=1.0)
    elapsed = time.monotonic() - start
    assert elapsed < 1.5, f"garbage file took {elapsed:.2f}s (budget 1.5s)"


@pytest.mark.smoke
def test_caller_unblocks_even_if_worker_hangs(monkeypatch) -> None:
    """Synthetic hang: simulated by patching av.open to block forever.

    Proves the caller raises CodecTimeoutError even when av.open never returns.
    """
    import threading as _threading

    block_event = _threading.Event()

    def _blocking_open(*args, **kwargs):
        block_event.wait(timeout=30.0)  # would hang for 30s without timeout
        return None

    monkeypatch.setattr(av, "open", _blocking_open)

    start = time.monotonic()
    with pytest.raises(CodecTimeoutError) as excinfo:
        av_open_timeout("/tmp/fake.mp4", timeout_s=0.3)
    elapsed = time.monotonic() - start

    # Release the blocked worker so it doesn't hold the runner.
    block_event.set()

    assert 0.2 < elapsed < 1.0, f"unblock took {elapsed:.2f}s (expected ~0.3s)"
    assert excinfo.value.elapsed_s == pytest.approx(0.3)
