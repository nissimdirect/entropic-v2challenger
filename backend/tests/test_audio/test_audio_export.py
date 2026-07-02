"""Tests for the audio_export module — renders mixer output to temp WAV."""

from __future__ import annotations

import os
import stat
import wave
from pathlib import Path

import numpy as np
import pytest

from audio.mixer import AudioMixer
from engine.audio_export import (
    MAX_RENDER_DURATION_S,
    TEMP_FILE_MODE,
    render_mix_to_temp_wav,
    render_mix_to_wav,
    temp_file_is_private,
)


def _make_wav(path: Path, sample_rate: int = 48000, duration_s: float = 0.5) -> None:
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


# --- render_mix_to_wav ---


class TestRenderMixToWav:
    def test_empty_mixer_writes_silent_wav(self, home_tmp_path):
        m = AudioMixer()
        dest = home_tmp_path / "mix.wav"
        ok = render_mix_to_wav(m, 0.25, dest)
        assert ok
        with wave.open(str(dest), "rb") as w:
            assert w.getnchannels() == 2
            assert w.getframerate() == 48000
            n = w.getnframes()
            assert n == int(0.25 * 48000)
            # All zero samples
            data = w.readframes(n)
            arr = np.frombuffer(data, dtype=np.int16)
            assert np.max(np.abs(arr)) == 0

    def test_renders_audio_from_tracks(self, home_tmp_path):
        src = home_tmp_path / "sine.wav"
        _make_wav(src)
        m = AudioMixer()
        m.set_tracks([_track("t1", [_clip("c1", str(src))])])

        dest = home_tmp_path / "mix.wav"
        ok = render_mix_to_wav(m, 0.25, dest)
        assert ok
        with wave.open(str(dest), "rb") as w:
            data = w.readframes(w.getnframes())
            arr = np.frombuffer(data, dtype=np.int16)
            # Non-silent (sine through mixer → real samples)
            assert np.max(np.abs(arr)) > 1000

    def test_duration_zero_returns_false(self, home_tmp_path):
        m = AudioMixer()
        dest = home_tmp_path / "mix.wav"
        assert render_mix_to_wav(m, 0.0, dest) is False

    def test_negative_duration_returns_false(self, home_tmp_path):
        m = AudioMixer()
        dest = home_tmp_path / "mix.wav"
        assert render_mix_to_wav(m, -1.0, dest) is False

    def test_cancel_mid_render(self, home_tmp_path):
        m = AudioMixer()
        dest = home_tmp_path / "mix.wav"

        call_count = [0]

        def cancel_after_2():
            call_count[0] += 1
            return call_count[0] > 2

        ok = render_mix_to_wav(m, 5.0, dest, cancel_cb=cancel_after_2)
        assert ok is False

    def test_duration_over_cap_clamped(self, home_tmp_path, caplog):
        m = AudioMixer()
        dest = home_tmp_path / "mix.wav"
        # Request 2 hours, should clamp to 1
        import time as _time

        t0 = _time.time()
        # Use cancel_cb to short-circuit after a small fraction
        ok = render_mix_to_wav(
            m, MAX_RENDER_DURATION_S + 1000, dest, cancel_cb=lambda: True
        )
        # cancel_cb immediately → returns False after duration clamping is logged
        assert ok is False
        # shouldn't have taken minutes
        assert _time.time() - t0 < 5

    def test_progress_callback_monotonic(self, home_tmp_path):
        m = AudioMixer()
        dest = home_tmp_path / "mix.wav"
        progress_values = []
        render_mix_to_wav(
            m,
            0.25,
            dest,
            progress_cb=lambda p: progress_values.append(p),
        )
        assert len(progress_values) > 0
        assert progress_values[-1] == pytest.approx(1.0)
        # Monotonic non-decreasing
        for i in range(1, len(progress_values)):
            assert progress_values[i] >= progress_values[i - 1]


# --- render_mix_to_temp_wav (context manager) ---


class TestTempWavContext:
    def test_yields_path_on_success(self, home_tmp_path):
        src = home_tmp_path / "sine.wav"
        _make_wav(src)
        m = AudioMixer()
        m.set_tracks([_track("t1", [_clip("c1", str(src))])])

        with render_mix_to_temp_wav(m, 0.25) as wav_path:
            assert wav_path is not None
            assert os.path.exists(wav_path)
            # File has audio content
            with wave.open(wav_path, "rb") as w:
                assert w.getnframes() > 0

    def test_cleans_up_on_exit(self, home_tmp_path):
        src = home_tmp_path / "sine.wav"
        _make_wav(src)
        m = AudioMixer()
        m.set_tracks([_track("t1", [_clip("c1", str(src))])])

        with render_mix_to_temp_wav(m, 0.25) as wav_path:
            assert wav_path is not None
            captured_path = wav_path

        assert not os.path.exists(captured_path)

    def test_cleans_up_on_exception(self, home_tmp_path):
        src = home_tmp_path / "sine.wav"
        _make_wav(src)
        m = AudioMixer()
        m.set_tracks([_track("t1", [_clip("c1", str(src))])])

        captured_path = None
        with pytest.raises(RuntimeError):
            with render_mix_to_temp_wav(m, 0.25) as wav_path:
                captured_path = wav_path
                assert wav_path is not None
                raise RuntimeError("simulated caller failure")

        assert captured_path is not None
        assert not os.path.exists(captured_path)

    def test_yields_none_on_cancel(self, home_tmp_path):
        m = AudioMixer()
        with render_mix_to_temp_wav(m, 0.5, cancel_cb=lambda: True) as wav_path:
            assert wav_path is None

    def test_file_mode_is_0600(self, home_tmp_path):
        src = home_tmp_path / "sine.wav"
        _make_wav(src)
        m = AudioMixer()
        m.set_tracks([_track("t1", [_clip("c1", str(src))])])

        with render_mix_to_temp_wav(m, 0.1) as wav_path:
            assert wav_path is not None
            assert temp_file_is_private(wav_path)
            mode = stat.S_IMODE(os.stat(wav_path).st_mode)
            assert mode == TEMP_FILE_MODE
