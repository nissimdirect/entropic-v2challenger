"""V3: PyAV Write Test — encode frames and verify output."""

import os
import subprocess
import tempfile

import numpy as np

from video.reader import VideoReader
from video.writer import VideoWriter


def test_write_300_frames_valid_output():
    """Write 300 synthetic 720p frames, verify output plays correctly."""
    path = tempfile.mktemp(suffix=".mp4")
    try:
        w = VideoWriter(path, 1280, 720, fps=30)
        for i in range(300):
            frame = np.zeros((720, 1280, 4), dtype=np.uint8)
            frame[:, :, 0] = int(255 * i / 300)
            frame[:, :, 1] = int(128 * (1 - i / 300))
            frame[:, :, 2] = 64
            frame[:, :, 3] = 255
            w.write_frame(frame)
        w.close()

        # Verify file exists and has reasonable size
        assert os.path.exists(path)
        size = os.path.getsize(path)
        assert size > 1000, f"Output file suspiciously small: {size} bytes"

        # Verify readable by PyAV
        r = VideoReader(path)
        assert r.width == 1280
        assert r.height == 720
        assert abs(r.duration - 10.0) < 1.0  # 300 frames at 30fps = 10s

        # Decode a few frames to verify
        f0 = r.decode_frame(0)
        assert f0.shape == (720, 1280, 4)
        f299 = r.decode_frame(299)
        assert f299.shape == (720, 1280, 4)
        r.close()

        # Verify with ffprobe if available
        try:
            result = subprocess.run(
                [
                    "ffprobe",
                    "-v",
                    "error",
                    "-show_entries",
                    "format=duration",
                    "-of",
                    "default=noprint_wrappers=1:nokey=1",
                    path,
                ],
                capture_output=True,
                text=True,
                timeout=10,
            )
            if result.returncode == 0:
                duration = float(result.stdout.strip())
                assert abs(duration - 10.0) < 1.0
        except FileNotFoundError:
            pass  # ffprobe not installed, skip external validation

    finally:
        if os.path.exists(path):
            os.unlink(path)
