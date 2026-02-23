"""Tests for shared memory ring buffer writer."""

import os
import struct
import tempfile

import numpy as np
import pytest

from memory.writer import HEADER_SIZE, SharedMemoryWriter


@pytest.fixture
def shm_path():
    path = os.path.join(tempfile.mkdtemp(), "test_frames")
    yield path
    if os.path.exists(path):
        os.unlink(path)


def _make_frame(r=128, g=64, b=32):
    frame = np.zeros((720, 1280, 4), dtype=np.uint8)
    frame[:, :, 0] = r
    frame[:, :, 1] = g
    frame[:, :, 2] = b
    frame[:, :, 3] = 255
    return frame


def test_write_frames_have_jpeg_headers(shm_path):
    w = SharedMemoryWriter(path=shm_path, ring_size=4)
    for i in range(4):
        w.write_frame(_make_frame(r=i * 60))

    # Read raw file and check JPEG headers in each slot
    with open(shm_path, "rb") as f:
        raw = f.read()

    for slot in range(4):
        offset = HEADER_SIZE + (slot * w.slot_size)
        size = struct.unpack_from("<I", raw, offset)[0]
        assert size > 0
        jpeg_data = raw[offset + 4 : offset + 4 + size]
        assert jpeg_data[:2] == b"\xff\xd8", f"Slot {slot} missing JPEG header"

    w.close()


def test_write_index_wraps(shm_path):
    w = SharedMemoryWriter(path=shm_path, ring_size=4)
    frame = _make_frame()
    for _ in range(10):
        w.write_frame(frame)
    assert w.write_index == 10
    # Header should reflect write_index=10
    header = struct.unpack_from("<IIIIII", w.buf, 0)
    assert header[0] == 10  # write_index
    assert header[1] == 10  # frame_count
    w.close()


def test_stale_file_replaced(shm_path):
    # Write some garbage to simulate a stale file
    os.makedirs(os.path.dirname(shm_path), exist_ok=True)
    with open(shm_path, "wb") as f:
        f.write(b"stale data" * 100)

    w = SharedMemoryWriter(path=shm_path, ring_size=4)
    # Should be a fresh file, header zeroed
    header = struct.unpack_from("<IIIIII", w.buf, 0)
    assert header[0] == 0  # write_index
    assert header[1] == 0  # frame_count
    w.close()


def test_oversized_frame_raises(shm_path):
    # Use tiny slot size to trigger overflow
    w = SharedMemoryWriter(path=shm_path, ring_size=2, slot_size=1024)
    frame = _make_frame()  # 720p will compress to way more than 1KB
    with pytest.raises(ValueError, match="exceeds"):
        w.write_frame(frame)
    w.close()
