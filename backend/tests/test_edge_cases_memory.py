"""Edge case tests for cache encoding and shared memory writer."""

import os
import tempfile

import numpy as np
import pytest

from engine.cache import encode_mjpeg
from memory.writer import SharedMemoryWriter


@pytest.fixture
def shm_path():
    path = os.path.join(tempfile.mkdtemp(), "test_frames")
    yield path
    if os.path.exists(path):
        os.unlink(path)


# ---------------------------------------------------------------------------
# E1: Zero-dimension frames should not crash/segfault
# ---------------------------------------------------------------------------


class TestZeroDimensionFrame:
    """encode_mjpeg must raise ValueError (or handle gracefully) for 0-dim frames."""

    def test_zero_by_zero(self):
        frame = np.zeros((0, 0, 4), dtype=np.uint8)
        with pytest.raises((ValueError, SystemError)):
            encode_mjpeg(frame)

    def test_zero_height(self):
        frame = np.zeros((0, 100, 4), dtype=np.uint8)
        with pytest.raises((ValueError, SystemError)):
            encode_mjpeg(frame)

    def test_zero_width(self):
        frame = np.zeros((100, 0, 4), dtype=np.uint8)
        with pytest.raises((ValueError, SystemError)):
            encode_mjpeg(frame)


# ---------------------------------------------------------------------------
# E2: 4K frame fits in default 4MB slot
# ---------------------------------------------------------------------------


class TestFourKFrameFitsInSlot:
    """A realistic 4K RGBA frame encoded at quality=95 must fit in the 4MB default slot."""

    @staticmethod
    def _make_4k_gradient():
        """Build a 3840x2160 RGBA gradient (realistic, not all-black)."""
        frame = np.zeros((2160, 3840, 4), dtype=np.uint8)
        rows = np.linspace(0, 255, 2160, dtype=np.uint8)[:, None]
        cols = np.linspace(0, 255, 3840, dtype=np.uint8)[None, :]
        frame[:, :, 0] = rows  # red gradient top-to-bottom
        frame[:, :, 1] = cols  # green gradient left-to-right
        frame[:, :, 2] = 128  # constant blue channel
        frame[:, :, 3] = 255  # full alpha
        return frame

    def test_encoded_size_under_4mb(self):
        frame = self._make_4k_gradient()
        data = encode_mjpeg(frame, quality=95)
        four_mb = 4 * 1024 * 1024
        assert len(data) < four_mb, (
            f"4K JPEG at q95 is {len(data)} bytes ({len(data) / 1024 / 1024:.2f} MB), "
            f"exceeds 4MB slot"
        )

    def test_4k_write_through_shm(self, shm_path):
        frame = self._make_4k_gradient()
        w = SharedMemoryWriter(path=shm_path, ring_size=2)  # default 4MB slot
        idx = w.write_frame(frame, quality=95)
        assert idx == 0  # first frame written at index 0
        w.close()
