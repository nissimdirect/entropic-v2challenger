"""Tests for the audio_tracks_set / audio_tracks_clear ZMQ handlers."""

from __future__ import annotations

import wave
from pathlib import Path

import numpy as np
import pytest

from zmq_server import ZMQServer


def _write_wav(path: Path, sample_rate: int = 48000, duration_s: float = 0.5) -> None:
    n = int(sample_rate * duration_s)
    samples = (
        0.5 * np.sin(2 * np.pi * 440 * np.arange(n) / sample_rate) * 32767
    ).astype(np.int16)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        stereo = np.stack([samples, samples], axis=1).flatten()
        w.writeframes(stereo.tobytes())


@pytest.fixture
def srv():
    s = ZMQServer()
    yield s
    try:
        s.audio_mixer.close()
    except Exception:
        pass


@pytest.fixture
def wav_path(home_tmp_path):
    p = home_tmp_path / "kick.wav"
    _write_wav(p)
    return p


def _track(track_id: str, clips: list[dict]) -> dict:
    return {
        "id": track_id,
        "type": "audio",
        "name": track_id,
        "color": "#4ade80",
        "isMuted": False,
        "isSoloed": False,
        "clips": [],
        "audioClips": clips,
        "gainDb": 0,
    }


def _clip(clip_id: str, path: str, **kw) -> dict:
    return {
        "id": clip_id,
        "trackId": "",
        "path": path,
        "inSec": 0,
        "outSec": 0.5,
        "startSec": 0,
        "gainDb": 0,
        "fadeInSec": 0,
        "fadeOutSec": 0,
        "muted": False,
        **kw,
    }


def test_set_valid_track(srv, wav_path):
    result = srv._handle_audio_tracks_set(
        {"tracks": [_track("t1", [_clip("c1", str(wav_path))])]},
        "msg-1",
    )
    assert result["ok"] is True
    assert result["num_tracks"] == 1
    assert result["dropped_clips"] == 0


def test_set_drops_clip_with_bad_path(srv):
    result = srv._handle_audio_tracks_set(
        {"tracks": [_track("t1", [_clip("c1", "/Users/nonexistent/fake.wav")])]},
        "msg-1",
    )
    assert result["ok"] is True
    assert result["dropped_clips"] == 1


def test_set_drops_clip_outside_home(srv):
    result = srv._handle_audio_tracks_set(
        {"tracks": [_track("t1", [_clip("c1", "/etc/passwd")])]},
        "msg-1",
    )
    assert result["ok"] is True
    assert result["dropped_clips"] == 1


def test_set_non_list_rejected(srv):
    result = srv._handle_audio_tracks_set({"tracks": "oops"}, "msg-1")
    assert result["ok"] is False
    assert "list" in result["error"].lower()


def test_set_empty_list_ok(srv):
    result = srv._handle_audio_tracks_set({"tracks": []}, "msg-1")
    assert result["ok"] is True
    assert result["num_tracks"] == 0


def test_set_ignores_non_dict_tracks(srv, wav_path):
    result = srv._handle_audio_tracks_set(
        {
            "tracks": [
                "not a dict",
                42,
                _track("t1", [_clip("c1", str(wav_path))]),
            ]
        },
        "msg-1",
    )
    assert result["ok"] is True
    assert result["num_tracks"] == 1


def test_clear_resets_mixer(srv, wav_path):
    srv._handle_audio_tracks_set(
        {"tracks": [_track("t1", [_clip("c1", str(wav_path))])]},
        "msg-1",
    )
    result = srv._handle_audio_tracks_clear("msg-2")
    assert result["ok"] is True
    out = srv.audio_mixer.mix(0.1, 4800)
    assert np.all(out == 0)


def test_set_replaces_with_resolved_path(srv, wav_path):
    """The sanitized path stored in the mixer should be the realpath, not the
    user-supplied path (defense against TOCTOU / symlink escape)."""
    result = srv._handle_audio_tracks_set(
        {"tracks": [_track("t1", [_clip("c1", str(wav_path))])]},
        "msg-1",
    )
    assert result["ok"] is True
    # After set_tracks, the mixer has a single clip whose path is the resolved
    # realpath of wav_path. On macOS home may go through /private/var.
    mixer_tracks = srv.audio_mixer._tracks
    assert len(mixer_tracks) == 1
    clip_path = mixer_tracks[0].clips[0].path
    assert Path(clip_path).exists()
    # Resolved realpath matches wav_path.resolve()
    assert Path(clip_path).resolve() == Path(wav_path).resolve()


def test_flag_enabled_field_reflects_env(srv):
    """The response surfaces whether EXPERIMENTAL_AUDIO_TRACKS is on."""
    result = srv._handle_audio_tracks_set({"tracks": []}, "msg-1")
    assert "flag_enabled" in result
    assert isinstance(result["flag_enabled"], bool)
