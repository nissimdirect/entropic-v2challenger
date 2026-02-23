"""V1: Shared Memory Throughput — write/read 300 1080p frames via mmap ring buffer."""

import os
import struct
import tempfile
import time

import numpy as np
import pytest

from memory.writer import HEADER_SIZE, SharedMemoryWriter


@pytest.fixture
def shm_path():
    path = os.path.join(tempfile.mkdtemp(), "test_frames")
    yield path
    if os.path.exists(path):
        os.unlink(path)


def _make_1080p_frame(rng):
    """Generate a random 1080p RGBA frame."""
    return rng.integers(0, 256, size=(1080, 1920, 4), dtype=np.uint8)


def test_v1_write_300_frames_throughput(shm_path):
    """Write 300 random 1080p RGBA frames. PASS: avg <33ms (>=30fps), P95 <50ms."""
    rng = np.random.default_rng(42)
    w = SharedMemoryWriter(path=shm_path, ring_size=4)

    times = []
    for _ in range(300):
        frame = _make_1080p_frame(rng)
        t0 = time.perf_counter()
        w.write_frame(frame)
        elapsed = (time.perf_counter() - t0) * 1000
        times.append(elapsed)

    w.close()

    avg_ms = sum(times) / len(times)
    p95 = sorted(times)[int(len(times) * 0.95) - 1]
    assert avg_ms < 33.0, f"Average write {avg_ms:.1f}ms exceeds 33ms budget (30fps)"
    assert p95 < 50.0, f"P95 write {p95:.1f}ms exceeds 50ms budget"


def test_v1_read_back_from_mmap(shm_path):
    """Write frames then read raw MJPEG data back from mmap, verify structure."""
    rng = np.random.default_rng(42)
    ring_size = 4
    w = SharedMemoryWriter(path=shm_path, ring_size=ring_size)

    # Write enough frames to fill the ring at least once
    num_frames = 8
    for _ in range(num_frames):
        frame = _make_1080p_frame(rng)
        w.write_frame(frame)

    # Read back from the mmap file directly (simulating C++ reader)
    with open(shm_path, "rb") as f:
        raw = f.read()

    # Verify header
    header = struct.unpack_from("<IIIIII", raw, 0)
    write_index, frame_count, slot_size, rs, width, height = header
    assert write_index == num_frames
    assert frame_count == num_frames
    assert rs == ring_size
    assert width == 1920
    assert height == 1080

    # Verify each slot has valid JPEG data
    for slot in range(ring_size):
        offset = HEADER_SIZE + (slot * slot_size)
        size = struct.unpack_from("<I", raw, offset)[0]
        assert size > 0, f"Slot {slot} has zero-length data"
        jpeg_data = raw[offset + 4 : offset + 4 + size]
        assert jpeg_data[:2] == b"\xff\xd8", f"Slot {slot} missing JPEG SOI marker"
        assert jpeg_data[-2:] == b"\xff\xd9", f"Slot {slot} missing JPEG EOI marker"

    w.close()
