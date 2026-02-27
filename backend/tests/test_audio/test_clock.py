"""Tests for A/V sync clock."""

import math
import uuid
from pathlib import Path

import av
import numpy as np
import pytest

from audio.clock import AVClock
from audio.player import AudioPlayer


@pytest.fixture(scope="module")
def audio_file_path():
    """Create a synthetic MP4 with stereo audio for clock tests."""
    fixture_dir = Path.home() / ".cache" / "entropic" / "test-fixtures"
    fixture_dir.mkdir(parents=True, exist_ok=True)
    path = str(fixture_dir / f"test_clock_{uuid.uuid4().hex[:8]}.mp4")

    container = av.open(path, mode="w")

    v_stream = container.add_stream("libx264", rate=30)
    v_stream.width = 320
    v_stream.height = 240
    v_stream.pix_fmt = "yuv420p"

    a_stream = container.add_stream("aac", rate=44100)
    a_stream.layout = "stereo"

    sample_rate = 44100
    duration_s = 3.0
    total_audio_samples = int(sample_rate * duration_s)
    frame_size = 1024

    video_frames = 90  # 3s at 30fps
    audio_frames_needed = (total_audio_samples + frame_size - 1) // frame_size

    for i in range(video_frames):
        frame = np.zeros((240, 320, 3), dtype=np.uint8)
        vf = av.VideoFrame.from_ndarray(frame, format="rgb24")
        for pkt in v_stream.encode(vf):
            container.mux(pkt)

    t = np.arange(total_audio_samples, dtype=np.float32) / sample_rate
    sine = (np.sin(2 * np.pi * 440 * t) * 0.5).astype(np.float32)
    stereo = np.stack([sine, sine])

    for i in range(audio_frames_needed):
        start = i * frame_size
        end = min(start + frame_size, total_audio_samples)
        chunk = stereo[:, start:end]
        if chunk.shape[1] < frame_size:
            chunk = np.pad(chunk, ((0, 0), (0, frame_size - chunk.shape[1])))
        af = av.AudioFrame.from_ndarray(chunk, format="fltp", layout="stereo")
        af.sample_rate = sample_rate
        for pkt in a_stream.encode(af):
            container.mux(pkt)

    for pkt in v_stream.encode():
        container.mux(pkt)
    for pkt in a_stream.encode():
        container.mux(pkt)

    container.close()
    yield path
    Path(path).unlink(missing_ok=True)


@pytest.fixture
def player():
    """Create a fresh AudioPlayer instance."""
    p = AudioPlayer()
    yield p
    p.close()


@pytest.fixture
def clock(player):
    """Create an AVClock wrapping the player."""
    return AVClock(player)


# --- Unit tests ---


@pytest.mark.smoke
def test_clock_init(clock):
    """AVClock initializes with default fps=30."""
    assert clock.fps == 30.0
    assert clock.audio_time_s == 0.0
    assert clock.target_frame_index == 0
    assert clock.is_playing is False


@pytest.mark.smoke
def test_clock_target_frame_at_time_zero(clock):
    """At time=0, target frame is 0."""
    assert clock.target_frame_index == 0


def test_clock_target_frame_after_seek(clock, player, audio_file_path):
    """After seeking audio to 1.0s at 30fps, target frame is 30."""
    player.load(audio_file_path)
    player.seek(1.0)
    assert clock.target_frame_index == math.floor(1.0 * 30.0)


def test_clock_target_frame_different_fps(clock, player, audio_file_path):
    """At 24fps, 1.0s → frame 24."""
    player.load(audio_file_path)
    player.seek(1.0)
    clock.set_fps(24.0)
    assert clock.target_frame_index == math.floor(1.0 * 24.0)


def test_clock_set_fps(clock):
    """set_fps updates and clamps correctly."""
    clock.set_fps(60.0)
    assert clock.fps == 60.0

    clock.set_fps(0.5)
    assert clock.fps == 1.0  # clamped to min

    clock.set_fps(300.0)
    assert clock.fps == 240.0  # clamped to max


def test_clock_sync_state_no_audio(clock):
    """sync_state with no audio loaded returns safe defaults."""
    state = clock.sync_state()
    assert state["audio_time_s"] == 0.0
    assert state["target_frame"] == 0
    assert state["is_playing"] is False
    assert state["duration_s"] == 0.0
    assert state["fps"] == 30.0
    assert state["total_frames"] == 0
    assert "volume" in state


def test_clock_sync_state_with_audio(clock, player, audio_file_path):
    """sync_state after load and seek returns correct values."""
    player.load(audio_file_path)
    player.seek(1.5)
    clock.set_fps(30.0)

    state = clock.sync_state()
    assert abs(state["audio_time_s"] - 1.5) < 0.01
    assert state["target_frame"] == math.floor(1.5 * 30.0)
    assert state["is_playing"] is False
    assert state["duration_s"] > 2.0
    assert state["fps"] == 30.0
    assert state["total_frames"] > 0


def test_clock_total_frames(clock, player, audio_file_path):
    """total_frames reflects duration * fps."""
    player.load(audio_file_path)
    clock.set_fps(30.0)
    expected = math.ceil(player.duration_seconds * 30.0)
    assert clock.total_frames == expected
