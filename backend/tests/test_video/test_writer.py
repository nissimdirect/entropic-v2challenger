"""Tests for PyAV video writer."""

import tempfile
import os

import numpy as np

from video.reader import VideoReader
from video.writer import VideoWriter


def test_write_and_read_back_30_frames():
    path = tempfile.mktemp(suffix=".mp4")
    try:
        w = VideoWriter(path, 640, 480, fps=30)
        for i in range(30):
            frame = np.zeros((480, 640, 4), dtype=np.uint8)
            frame[:, :, 0] = int(255 * i / 30)
            frame[:, :, 3] = 255
            w.write_frame(frame)
        w.close()

        r = VideoReader(path)
        assert r.width == 640
        assert r.height == 480
        # Decode first and last frame to verify readability
        f0 = r.decode_frame(0)
        assert f0.shape == (480, 640, 4)
        f29 = r.decode_frame(29)
        assert f29.shape == (480, 640, 4)
        r.close()
    finally:
        if os.path.exists(path):
            os.unlink(path)
