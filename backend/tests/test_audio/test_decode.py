"""Tests for audio decoding via PyAV."""

import uuid
from pathlib import Path

import av
import numpy as np
import pytest

from audio.decoder import decode_audio
from video.ingest import probe


@pytest.fixture(scope="module")
def video_with_audio_path():
    """Create a synthetic MP4 with both video and AAC audio streams."""
    fixture_dir = Path.home() / ".cache" / "entropic" / "test-fixtures"
    fixture_dir.mkdir(parents=True, exist_ok=True)
    path = str(fixture_dir / f"test_av_{uuid.uuid4().hex[:8]}.mp4")

    container = av.open(path, mode="w")

    # Video stream: 2s at 30fps
    v_stream = container.add_stream("libx264", rate=30)
    v_stream.width = 320
    v_stream.height = 240
    v_stream.pix_fmt = "yuv420p"

    # Audio stream: 2s of 440Hz sine at 44100Hz stereo
    a_stream = container.add_stream("aac", rate=44100)
    a_stream.layout = "stereo"

    sample_rate = 44100
    duration_s = 2.0
    total_audio_samples = int(sample_rate * duration_s)
    frame_size = 1024  # AAC frame size

    video_frames = 60  # 2s at 30fps
    audio_frames_needed = (total_audio_samples + frame_size - 1) // frame_size

    # Generate video frames
    for i in range(video_frames):
        frame = np.zeros((240, 320, 3), dtype=np.uint8)
        frame[:, :, 0] = int(255 * i / video_frames)
        vf = av.VideoFrame.from_ndarray(frame, format="rgb24")
        for pkt in v_stream.encode(vf):
            container.mux(pkt)

    # Generate audio frames (440Hz sine wave)
    t = np.arange(total_audio_samples, dtype=np.float32) / sample_rate
    sine = (np.sin(2 * np.pi * 440 * t) * 0.5).astype(np.float32)
    stereo = np.stack([sine, sine])  # (2, samples) — planar stereo

    for i in range(audio_frames_needed):
        start = i * frame_size
        end = min(start + frame_size, total_audio_samples)
        chunk = stereo[:, start:end]
        # Pad last chunk if needed
        if chunk.shape[1] < frame_size:
            chunk = np.pad(chunk, ((0, 0), (0, frame_size - chunk.shape[1])))
        af = av.AudioFrame.from_ndarray(chunk, format="fltp", layout="stereo")
        af.sample_rate = sample_rate
        for pkt in a_stream.encode(af):
            container.mux(pkt)

    # Flush
    for pkt in v_stream.encode():
        container.mux(pkt)
    for pkt in a_stream.encode():
        container.mux(pkt)

    container.close()
    yield path
    Path(path).unlink(missing_ok=True)


@pytest.fixture(scope="module")
def video_only_path():
    """Create a synthetic MP4 with video only (no audio)."""
    fixture_dir = Path.home() / ".cache" / "entropic" / "test-fixtures"
    fixture_dir.mkdir(parents=True, exist_ok=True)
    path = str(fixture_dir / f"test_vo_{uuid.uuid4().hex[:8]}.mp4")

    container = av.open(path, mode="w")
    v_stream = container.add_stream("libx264", rate=30)
    v_stream.width = 320
    v_stream.height = 240
    v_stream.pix_fmt = "yuv420p"

    for i in range(60):
        frame = np.zeros((240, 320, 3), dtype=np.uint8)
        frame[:, :, 1] = 128
        vf = av.VideoFrame.from_ndarray(frame, format="rgb24")
        for pkt in v_stream.encode(vf):
            container.mux(pkt)
    for pkt in v_stream.encode():
        container.mux(pkt)

    container.close()
    yield path
    Path(path).unlink(missing_ok=True)


# --- Probe tests ---


@pytest.mark.smoke
def test_probe_reports_audio_metadata(video_with_audio_path):
    """Probe returns audio metadata when audio stream exists."""
    result = probe(video_with_audio_path)
    assert result["ok"] is True
    assert result["has_audio"] is True
    assert "audio" in result
    assert result["audio"]["sample_rate"] == 44100
    assert result["audio"]["channels"] == 2
    assert result["audio"]["codec"] == "aac"
    assert result["audio"]["duration_s"] > 0


@pytest.mark.smoke
def test_probe_no_audio_metadata(video_only_path):
    """Probe omits audio metadata when no audio stream."""
    result = probe(video_only_path)
    assert result["ok"] is True
    assert result["has_audio"] is False
    assert "audio" not in result


# --- Decode tests ---


@pytest.mark.smoke
def test_decode_mp4_with_aac(video_with_audio_path):
    """Decode MP4 with AAC audio → PCM float32 array with correct sample rate."""
    result = decode_audio(video_with_audio_path)
    assert result["ok"] is True
    assert result["sample_rate"] == 44100
    assert result["channels"] == 2
    assert result["samples"].dtype == np.float32
    assert result["samples"].shape[1] == 2  # stereo
    assert result["samples"].shape[0] > 0
    assert result["duration_s"] > 0


def test_decode_returns_reasonable_duration(video_with_audio_path):
    """Decoded duration should be close to the 2s source."""
    result = decode_audio(video_with_audio_path)
    assert result["ok"] is True
    assert 1.5 < result["duration_s"] < 3.0  # Allow codec padding


def test_decode_video_only_returns_error(video_only_path):
    """Video-only file → error response, no crash."""
    result = decode_audio(video_only_path)
    assert result["ok"] is False
    assert "No audio stream" in result["error"]


def test_decode_nonexistent_file():
    """Nonexistent file → error response."""
    result = decode_audio("/nonexistent/path/video.mp4")
    assert result["ok"] is False
    assert "error" in result


def test_decode_with_seek(video_with_audio_path):
    """Seek to timestamp → correct audio offset."""
    result_full = decode_audio(video_with_audio_path)
    result_seek = decode_audio(video_with_audio_path, start_s=1.0)

    assert result_seek["ok"] is True
    assert result_seek["samples"].shape[0] > 0
    # Seeked result should have fewer samples than full decode
    assert result_seek["samples"].shape[0] < result_full["samples"].shape[0]


def test_decode_with_duration_limit(video_with_audio_path):
    """Duration limiting returns fewer samples."""
    result_full = decode_audio(video_with_audio_path)
    result_limited = decode_audio(video_with_audio_path, duration_s=0.5)

    assert result_limited["ok"] is True
    assert result_limited["samples"].shape[0] < result_full["samples"].shape[0]
    assert result_limited["duration_s"] < result_full["duration_s"]


def test_decode_peak_within_range(video_with_audio_path):
    """Peak amplitude should be within [-1, 1] for float32 PCM."""
    result = decode_audio(video_with_audio_path)
    assert result["ok"] is True
    peak = float(np.abs(result["samples"]).max())
    assert 0.0 < peak <= 1.0


def test_decode_zero_duration_returns_empty(video_with_audio_path):
    """Duration of 0 returns empty array."""
    result = decode_audio(video_with_audio_path, duration_s=0.0)
    assert result["ok"] is True
    assert result["samples"].shape[0] == 0
    assert result["duration_s"] == 0.0
