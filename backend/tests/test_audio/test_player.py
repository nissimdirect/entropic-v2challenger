"""Tests for audio playback engine."""

import time
import uuid
from pathlib import Path
from unittest.mock import patch

import av
import numpy as np
import pytest

from audio.player import AudioPlayer


@pytest.fixture(scope="module")
def audio_file_path():
    """Create a synthetic MP4 with stereo audio for playback tests."""
    fixture_dir = Path.home() / ".cache" / "entropic" / "test-fixtures"
    fixture_dir.mkdir(parents=True, exist_ok=True)
    path = str(fixture_dir / f"test_playback_{uuid.uuid4().hex[:8]}.mp4")

    container = av.open(path, mode="w")

    v_stream = container.add_stream("libx264", rate=30)
    v_stream.width = 320
    v_stream.height = 240
    v_stream.pix_fmt = "yuv420p"

    a_stream = container.add_stream("aac", rate=44100)
    a_stream.layout = "stereo"

    sample_rate = 44100
    duration_s = 2.0
    total_audio_samples = int(sample_rate * duration_s)
    frame_size = 1024

    video_frames = 60
    audio_frames_needed = (total_audio_samples + frame_size - 1) // frame_size

    for i in range(video_frames):
        frame = np.zeros((240, 320, 3), dtype=np.uint8)
        frame[:, :, 0] = int(255 * i / video_frames)
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


# --- Unit tests ---


@pytest.mark.smoke
def test_player_init(player):
    """AudioPlayer initializes without crash."""
    assert player.is_playing is False
    assert player.loaded is False
    assert player.position == 0
    assert player.volume == 1.0


@pytest.mark.smoke
def test_player_load(player, audio_file_path):
    """Load PCM from file → ready state."""
    result = player.load(audio_file_path)
    assert result["ok"] is True
    assert result["sample_rate"] == 44100
    assert result["channels"] == 2
    assert result["num_samples"] > 0
    assert result["duration_s"] > 0
    assert player.loaded is True


def test_player_load_no_audio(player):
    """Load video-only file → error."""
    # Create a temp video-only file
    fixture_dir = Path.home() / ".cache" / "entropic" / "test-fixtures"
    fixture_dir.mkdir(parents=True, exist_ok=True)
    path = str(fixture_dir / f"test_vo_{uuid.uuid4().hex[:8]}.mp4")

    container = av.open(path, mode="w")
    v_stream = container.add_stream("libx264", rate=30)
    v_stream.width = 320
    v_stream.height = 240
    v_stream.pix_fmt = "yuv420p"
    for i in range(30):
        frame = np.zeros((240, 320, 3), dtype=np.uint8)
        vf = av.VideoFrame.from_ndarray(frame, format="rgb24")
        for pkt in v_stream.encode(vf):
            container.mux(pkt)
    for pkt in v_stream.encode():
        container.mux(pkt)
    container.close()

    try:
        result = player.load(path)
        assert result["ok"] is False
        assert "No audio stream" in result["error"]
    finally:
        Path(path).unlink(missing_ok=True)


def test_player_play_without_load(player):
    """Play without loading → returns False."""
    assert player.play() is False


@pytest.mark.smoke
def test_player_play_pause(player, audio_file_path):
    """Play → is_playing True, pause → is_playing False."""
    player.load(audio_file_path)

    # Mock sounddevice to avoid actual audio output in CI
    with patch("sounddevice.OutputStream") as mock_stream_class:
        mock_instance = mock_stream_class.return_value
        mock_instance.start = lambda: None
        mock_instance.stop = lambda: None
        mock_instance.close = lambda: None

        assert player.play() is True
        assert player.is_playing is True

        assert player.pause() is True
        assert player.is_playing is False


def test_player_seek(player, audio_file_path):
    """Seek → position updates correctly."""
    player.load(audio_file_path)
    assert player.seek(1.0) is True
    expected_pos = int(1.0 * 44100)
    assert player.position == expected_pos
    assert abs(player.position_seconds - 1.0) < 0.001


def test_player_seek_without_load(player):
    """Seek without loading → returns False."""
    assert player.seek(1.0) is False


def test_player_seek_clamps(player, audio_file_path):
    """Seek beyond duration → clamps to end."""
    player.load(audio_file_path)
    player.seek(999.0)
    assert player.position <= player._samples.shape[0]

    player.seek(-5.0)
    assert player.position == 0


def test_player_volume(player):
    """Volume set/get works, clamps to [0, 1]."""
    player.set_volume(0.5)
    assert player.volume == 0.5

    player.set_volume(0.0)
    assert player.volume == 0.0

    player.set_volume(1.0)
    assert player.volume == 1.0

    # Clamp
    player.set_volume(-0.5)
    assert player.volume == 0.0

    player.set_volume(2.0)
    assert player.volume == 1.0


def test_player_duration(player, audio_file_path):
    """Duration reflects loaded audio."""
    assert player.duration_seconds == 0.0
    player.load(audio_file_path)
    assert 1.5 < player.duration_seconds < 3.0


def test_player_stop_resets(player, audio_file_path):
    """Stop resets position to 0."""
    player.load(audio_file_path)
    player.seek(1.0)
    assert player.position > 0
    player.stop()
    assert player.position == 0
    assert player.is_playing is False
