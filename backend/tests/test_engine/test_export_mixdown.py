"""Integration tests for ExportManager's mixdown decision logic.

Verifies that when EXPERIMENTAL_AUDIO_TRACKS is on AND the injected
AudioMixer holds at least one clip, the export wraps mux through
render_mix_to_temp_wav. Other paths fall through to the legacy source-video
audio mux.
"""

from __future__ import annotations

import wave
from pathlib import Path
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from audio.mixer import AudioMixer
from engine.export import ExportManager


def _make_wav(path: Path) -> None:
    rate = 48000
    n = int(0.5 * rate)
    samples = (0.5 * np.sin(2 * np.pi * 440 * np.arange(n) / rate) * 32767).astype(
        np.int16
    )
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(rate)
        stereo = np.stack([samples, samples], axis=1).flatten()
        w.writeframes(stereo.tobytes())


def _audio_track_payload(clip_path: str) -> list[dict]:
    return [
        {
            "id": "t1",
            "type": "audio",
            "name": "A",
            "color": "#4ade80",
            "isMuted": False,
            "isSoloed": False,
            "clips": [],
            "audioClips": [
                {
                    "id": "c1",
                    "trackId": "t1",
                    "path": clip_path,
                    "inSec": 0,
                    "outSec": 0.5,
                    "startSec": 0,
                    "gainDb": 0,
                    "fadeInSec": 0,
                    "fadeOutSec": 0,
                    "muted": False,
                }
            ],
            "gainDb": 0,
        }
    ]


class TestHasAudioTracks:
    def test_no_mixer_returns_false(self):
        em = ExportManager(audio_mixer=None, experimental_audio_tracks=True)
        assert em._has_audio_tracks() is False

    def test_empty_mixer_returns_false(self):
        em = ExportManager(audio_mixer=AudioMixer(), experimental_audio_tracks=True)
        assert em._has_audio_tracks() is False

    def test_mixer_with_clips_returns_true(self, home_tmp_path):
        src = home_tmp_path / "sine.wav"
        _make_wav(src)
        mixer = AudioMixer()
        mixer.set_tracks(_audio_track_payload(str(src)))
        em = ExportManager(audio_mixer=mixer, experimental_audio_tracks=True)
        assert em._has_audio_tracks() is True


class TestConstructorDefaults:
    def test_defaults_are_conservative(self):
        """ExportManager with no args must behave exactly like pre-PR-3."""
        em = ExportManager()
        assert em._audio_mixer is None
        assert em._experimental_audio_tracks is False
        assert em._has_audio_tracks() is False

    def test_flag_without_mixer_does_not_crash(self):
        em = ExportManager(experimental_audio_tracks=True)
        assert em._has_audio_tracks() is False


class TestMixdownPath:
    """Verify the mux call site routes to the mixdown WAV when flag+mixer qualify."""

    def test_flag_off_uses_source_video_mux(self, home_tmp_path):
        """When flag is off, the mux call receives the source video path."""
        src = home_tmp_path / "sine.wav"
        _make_wav(src)
        mixer = AudioMixer()
        mixer.set_tracks(_audio_track_payload(str(src)))
        em = ExportManager(audio_mixer=mixer, experimental_audio_tracks=False)

        with patch.object(ExportManager, "_mux_audio") as mux:
            # Simulate the decision branch directly — the full export pipeline
            # is out of scope; we only care which input_path is forwarded.
            em._perform_audio_mux(
                mux,
                input_path="/original/video.mp4",
                output_path="/out.mp4",
                start_frame=0,
                end_frame=30,
                source_fps=30.0,
            )
            mux.assert_called_once()
            args = mux.call_args[0]
            assert args[0] == "/original/video.mp4"

    def test_flag_on_with_tracks_uses_mixdown(self, home_tmp_path):
        """When flag on + mixer has tracks, mux receives a temp WAV path."""
        src = home_tmp_path / "sine.wav"
        _make_wav(src)
        mixer = AudioMixer()
        mixer.set_tracks(_audio_track_payload(str(src)))
        em = ExportManager(audio_mixer=mixer, experimental_audio_tracks=True)

        captured_paths: list[str] = []

        def capture_mux(path, *args, **kw):
            captured_paths.append(path)

        with patch.object(ExportManager, "_mux_audio", side_effect=capture_mux):
            em._perform_audio_mux(
                ExportManager._mux_audio,
                input_path="/original/video.mp4",
                output_path="/out.mp4",
                start_frame=0,
                end_frame=30,
                source_fps=30.0,
            )

        assert len(captured_paths) == 1
        # The path MUST NOT be the original video — mux ran against a mixdown WAV.
        assert captured_paths[0] != "/original/video.mp4"
        assert captured_paths[0].endswith(".wav")

    def test_flag_on_but_no_tracks_falls_back(self, home_tmp_path):
        """Flag on but mixer is empty → legacy source-video mux path."""
        em = ExportManager(audio_mixer=AudioMixer(), experimental_audio_tracks=True)
        with patch.object(ExportManager, "_mux_audio") as mux:
            em._perform_audio_mux(
                mux,
                input_path="/original/video.mp4",
                output_path="/out.mp4",
                start_frame=0,
                end_frame=30,
                source_fps=30.0,
            )
            mux.assert_called_once()
            assert mux.call_args[0][0] == "/original/video.mp4"
