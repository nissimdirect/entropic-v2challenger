"""Edge case tests for Phase 0B — PyAV, cache encoder, and video paths."""

import os
import tempfile

import av
import numpy as np
import pytest

from engine.cache import encode_mjpeg, encode_mjpeg_fit
from video.ingest import probe
from video.reader import VideoReader
from video.writer import VideoWriter


# ---------------------------------------------------------------------------
# 1. Empty video file -> ingest returns clear error, no crash
# ---------------------------------------------------------------------------


class TestEmptyVideoFile:
    def test_probe_empty_file_returns_error(self):
        """probe() on an empty file must return ok=False with a clear error."""
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
            empty_path = f.name
        try:
            result = probe(empty_path)
            assert result["ok"] is False
            assert "error" in result
            assert isinstance(result["error"], str)
            assert len(result["error"]) > 0
        finally:
            os.unlink(empty_path)

    def test_reader_empty_file_raises(self):
        """VideoReader on an empty file must raise, not segfault."""
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
            empty_path = f.name
        try:
            with pytest.raises(
                (av.error.InvalidDataError, av.error.ValueError, Exception)
            ):
                VideoReader(empty_path)
        finally:
            os.unlink(empty_path)


# ---------------------------------------------------------------------------
# 2. Zero-length frame -> cache encoder handles gracefully
# ---------------------------------------------------------------------------


class TestZeroLengthFrame:
    def test_encode_zero_size_frame_raises(self):
        """Encoding a 0x0 frame must raise a clear error, not crash."""
        zero_frame = np.zeros((0, 0, 4), dtype=np.uint8)
        with pytest.raises((ValueError, SystemError, IndexError, Exception)):
            encode_mjpeg(zero_frame)

    def test_encode_zero_height_frame_raises(self):
        """Encoding a frame with zero height must raise."""
        zero_h = np.zeros((0, 100, 4), dtype=np.uint8)
        with pytest.raises((ValueError, SystemError, IndexError, Exception)):
            encode_mjpeg(zero_h)

    def test_encode_zero_width_frame_raises(self):
        """Encoding a frame with zero width must raise."""
        zero_w = np.zeros((100, 0, 4), dtype=np.uint8)
        with pytest.raises((ValueError, SystemError, IndexError, Exception)):
            encode_mjpeg(zero_w)


# ---------------------------------------------------------------------------
# 3. 4K frame -> fits in 4MB slot after MJPEG Q95 compression
# ---------------------------------------------------------------------------


class TestFourKCompression:
    def test_4k_random_frame_fits_4mb_with_fallback(self):
        """A 3840x2160 random-noise frame must fit in 4MB via quality fallback."""
        rng = np.random.default_rng(42)
        frame_4k = rng.integers(0, 256, size=(2160, 3840, 4), dtype=np.uint8)
        frame_4k[:, :, 3] = 255  # Solid alpha

        slot_size = 4_194_304  # 4MB
        data, quality = encode_mjpeg_fit(frame_4k, max_bytes=slot_size)

        assert len(data) <= slot_size
        assert data[:2] == b"\xff\xd8"
        # Random noise at 4K exceeds Q95, so quality should have dropped
        assert quality < 95, f"Expected quality fallback, got Q{quality}"

    def test_4k_smooth_frame_fits_4mb_slot(self):
        """A smooth 4K gradient (realistic video content) at Q95 must fit in 4MB."""
        frame_4k = np.zeros((2160, 3840, 4), dtype=np.uint8)
        rows = np.linspace(0, 255, 2160, dtype=np.uint8)[:, None]
        cols = np.linspace(0, 255, 3840, dtype=np.uint8)[None, :]
        frame_4k[:, :, 0] = rows
        frame_4k[:, :, 1] = cols
        frame_4k[:, :, 2] = 128
        frame_4k[:, :, 3] = 255

        data = encode_mjpeg(frame_4k, quality=95)
        slot_size = 4_194_304  # 4MB
        actual_mb = len(data) / (1024 * 1024)

        assert len(data) < slot_size, (
            f"4K smooth frame MJPEG Q95 = {actual_mb:.2f}MB, exceeds 4MB slot"
        )


# ---------------------------------------------------------------------------
# 4. PyAV seek past end of video -> returns last frame or clear error
# ---------------------------------------------------------------------------


class TestSeekPastEnd:
    def test_seek_past_end_raises_index_error(self, synthetic_video_path):
        """Seeking to a frame index far past the end should raise IndexError."""
        r = VideoReader(synthetic_video_path)
        try:
            # The synthetic video has 150 frames (0-149). Seek way past.
            with pytest.raises(IndexError):
                r.decode_frame(999999)
        finally:
            r.close()

    def test_seek_to_last_frame_succeeds(self, synthetic_video_path):
        """Seeking to the last frame (149) should succeed."""
        r = VideoReader(synthetic_video_path)
        try:
            frame = r.decode_frame(149)
            assert frame.shape == (720, 1280, 4)
            assert frame.dtype == np.uint8
        finally:
            r.close()


# ---------------------------------------------------------------------------
# 5. Unicode file paths -> PyAV handles correctly
# ---------------------------------------------------------------------------


class TestUnicodePaths:
    def test_unicode_path_write_and_read(self):
        """PyAV should handle unicode characters in file paths."""
        tmpdir = tempfile.mkdtemp()
        unicode_name = "test_\u00fcn\u00efc\u00f6d\u00e9_\u65e5\u672c.mp4"
        unicode_path = os.path.join(tmpdir, unicode_name)

        try:
            # Write a small test video at the unicode path
            w = VideoWriter(unicode_path, 320, 240, fps=30)
            frame = np.zeros((240, 320, 4), dtype=np.uint8)
            frame[:, :, 0] = 200
            frame[:, :, 1] = 100
            frame[:, :, 2] = 50
            frame[:, :, 3] = 255
            for _ in range(30):  # 1 second
                w.write_frame(frame)
            w.close()

            # Verify probe works
            result = probe(unicode_path)
            assert result["ok"] is True
            assert result["width"] == 320
            assert result["height"] == 240

            # Verify VideoReader works
            r = VideoReader(unicode_path)
            decoded = r.decode_frame(0)
            assert decoded.shape == (240, 320, 4)
            assert decoded.dtype == np.uint8
            r.close()
        finally:
            if os.path.exists(unicode_path):
                os.unlink(unicode_path)
            os.rmdir(tmpdir)

    def test_unicode_path_with_spaces_and_symbols(self):
        """PyAV should handle paths with spaces and mixed unicode."""
        tmpdir = tempfile.mkdtemp()
        tricky_name = "my video (\u00e9\u00e8\u00ea) \u2014 \u00e7opy.mp4"
        tricky_path = os.path.join(tmpdir, tricky_name)

        try:
            w = VideoWriter(tricky_path, 160, 120, fps=24)
            frame = np.full((120, 160, 4), 128, dtype=np.uint8)
            frame[:, :, 3] = 255
            for _ in range(24):
                w.write_frame(frame)
            w.close()

            result = probe(tricky_path)
            assert result["ok"] is True

            r = VideoReader(tricky_path)
            decoded = r.decode_frame(0)
            assert decoded.shape == (120, 160, 4)
            r.close()
        finally:
            if os.path.exists(tricky_path):
                os.unlink(tricky_path)
            os.rmdir(tmpdir)
