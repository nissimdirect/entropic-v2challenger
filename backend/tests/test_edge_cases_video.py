"""Edge case tests for video ingest and reader modules."""

import os
import tempfile

import av
import numpy as np
import pytest

from video.ingest import probe
from video.reader import VideoReader


# ---------------------------------------------------------------------------
# N1: Empty (0-byte) video file
# ---------------------------------------------------------------------------


def test_ingest_empty_video_file(tmp_path):
    """probe() on a 0-byte .mp4 file should return ok=False, no crash."""
    empty_file = tmp_path / "empty.mp4"
    empty_file.write_bytes(b"")
    result = probe(str(empty_file))
    assert result["ok"] is False
    assert "error" in result


# ---------------------------------------------------------------------------
# N2: Non-video file disguised as .mp4
# ---------------------------------------------------------------------------


def test_ingest_non_video_file(tmp_path):
    """probe() on a text file renamed to .mp4 should return ok=False."""
    fake_video = tmp_path / "fake.mp4"
    fake_video.write_text("not a video")
    result = probe(str(fake_video))
    assert result["ok"] is False
    assert "error" in result


# ---------------------------------------------------------------------------
# N3: Seek past end of video
# ---------------------------------------------------------------------------


def test_seek_past_end_of_video(synthetic_video_path):
    """decode_frame() with an index far beyond frame count should raise IndexError."""
    r = VideoReader(synthetic_video_path)
    with pytest.raises(IndexError):
        r.decode_frame(9999)
    r.close()


# ---------------------------------------------------------------------------
# N4: Negative frame index
# ---------------------------------------------------------------------------


def test_seek_negative_frame_index(synthetic_video_path):
    """decode_frame(-1) should not segfault. Actual behavior: returns a frame (graceful)."""
    r = VideoReader(synthetic_video_path)
    # Negative index seeks to negative time which gets clamped — returns a valid frame
    frame = r.decode_frame(-1)
    assert frame.shape == (720, 1280, 4)
    assert frame.dtype.name == "uint8"
    r.close()


# ---------------------------------------------------------------------------
# E3: Unicode file path
# ---------------------------------------------------------------------------


def test_unicode_file_path():
    """probe() and VideoReader should handle unicode characters in paths."""
    from video.writer import VideoWriter

    # Create a temp directory with unicode chars in the filename
    unicode_dir = tempfile.mkdtemp(prefix="entropic_тест_视频_")
    unicode_path = os.path.join(unicode_dir, "тест_视频.mp4")
    try:
        w = VideoWriter(unicode_path, 320, 240, fps=30)
        frame = np.zeros((240, 320, 4), dtype=np.uint8)
        frame[:, :, 3] = 255
        for _ in range(30):
            w.write_frame(frame)
        w.close()

        # probe should succeed
        result = probe(unicode_path)
        assert result["ok"] is True
        assert result["width"] == 320
        assert result["height"] == 240

        # VideoReader should open and decode
        r = VideoReader(unicode_path)
        f = r.decode_frame(0)
        assert f.shape == (240, 320, 4)
        r.close()
    finally:
        os.unlink(unicode_path)
        os.rmdir(unicode_dir)


# ---------------------------------------------------------------------------
# E4: Audio-only container (no video stream)
# ---------------------------------------------------------------------------


def test_video_audio_only_no_video_stream():
    """probe() on an audio-only file should return ok=False with 'No video stream found'."""
    audio_path = tempfile.mktemp(suffix=".mp4")
    try:
        # Create an audio-only container using PyAV
        container = av.open(audio_path, mode="w")
        stream = container.add_stream("aac", rate=44100)
        stream.layout = "stereo"
        # Write silence frames using numpy arrays
        for _ in range(10):
            # fltp format = float32 planar, 2 channels, 1024 samples
            samples = np.zeros((2, 1024), dtype=np.float32)
            audio_frame = av.AudioFrame.from_ndarray(
                samples, format="fltp", layout="stereo"
            )
            audio_frame.rate = 44100
            audio_frame.sample_rate = 44100
            for packet in stream.encode(audio_frame):
                container.mux(packet)
        # Flush
        for packet in stream.encode():
            container.mux(packet)
        container.close()

        result = probe(audio_path)
        assert result["ok"] is False
        assert result["error"] == "No video stream found"
    finally:
        if os.path.exists(audio_path):
            os.unlink(audio_path)
