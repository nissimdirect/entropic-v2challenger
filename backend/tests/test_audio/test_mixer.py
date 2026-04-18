"""Tests for AudioMixer — multi-clip sum with envelope + gain + safety."""

from __future__ import annotations

import wave
from pathlib import Path

import numpy as np
import pytest

from audio.mixer import (
    MAX_ACTIVE_CLIPS,
    MIN_DECLICK_SEC,
    OUTPUT_PEAK_CEILING,
    AudioMixer,
    normalize_clip,
    normalize_track,
)


# --- Fixtures ---


def _write_wav(
    path: Path, samples: np.ndarray, sample_rate: int, channels: int
) -> None:
    pcm = (np.clip(samples, -1.0, 1.0) * 32767).astype(np.int16)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(channels)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        w.writeframes(pcm.tobytes())


def _sine(
    duration_s: float, freq: float, rate: int, channels: int, amp: float = 0.5
) -> np.ndarray:
    n = int(duration_s * rate)
    t = np.arange(n) / rate
    sig = (amp * np.sin(2 * np.pi * freq * t)).astype(np.float32)
    if channels == 1:
        return sig
    return np.stack([sig] * channels, axis=1)


def _dc(duration_s: float, value: float, rate: int, channels: int) -> np.ndarray:
    """Flat DC signal — useful for checking envelope math."""
    n = int(duration_s * rate)
    sig = np.full(n, value, dtype=np.float32)
    if channels == 1:
        return sig
    return np.stack([sig] * channels, axis=1)


@pytest.fixture
def dc_wav(home_tmp_path):
    """0.5s of flat 0.5 DC stereo at 48 kHz."""
    path = home_tmp_path / "dc.wav"
    _write_wav(path, _dc(0.5, 0.5, 48000, 2), 48000, 2)
    return path


@pytest.fixture
def sine_wav(home_tmp_path):
    """0.5s of 440Hz sine at 0.5 amplitude, stereo 48kHz."""
    path = home_tmp_path / "sine.wav"
    _write_wav(path, _sine(0.5, 440.0, 48000, 2), 48000, 2)
    return path


def _make_track(
    track_id: str,
    clips: list[dict],
    gain_db: float = 0.0,
    is_muted: bool = False,
    is_soloed: bool = False,
) -> dict:
    return {
        "id": track_id,
        "type": "audio",
        "name": track_id,
        "color": "#4ade80",
        "isMuted": is_muted,
        "isSoloed": is_soloed,
        "clips": [],
        "audioClips": clips,
        "gainDb": gain_db,
    }


def _make_clip(
    clip_id: str,
    path: str,
    *,
    start_sec: float = 0.0,
    out_sec: float = 0.5,
    in_sec: float = 0.0,
    gain_db: float = 0.0,
    fade_in_sec: float = 0.0,
    fade_out_sec: float = 0.0,
    muted: bool = False,
) -> dict:
    return {
        "id": clip_id,
        "trackId": "",
        "path": path,
        "inSec": in_sec,
        "outSec": out_sec,
        "startSec": start_sec,
        "gainDb": gain_db,
        "fadeInSec": fade_in_sec,
        "fadeOutSec": fade_out_sec,
        "muted": muted,
    }


# --- Normalization ---


class TestNormalize:
    def test_valid_clip(self):
        raw = _make_clip("c1", "/tmp/a.wav")
        c = normalize_clip(raw, "t1")
        assert c is not None
        assert c.clip_id == "c1"
        assert c.track_id == "t1"

    def test_nan_gain_clamped_to_zero(self):
        raw = _make_clip("c1", "/tmp/a.wav", gain_db=float("nan"))
        c = normalize_clip(raw, "t1")
        assert c is not None and c.gain_db == 0.0

    def test_inf_gain_clamped_to_zero(self):
        raw = _make_clip("c1", "/tmp/a.wav", gain_db=float("inf"))
        c = normalize_clip(raw, "t1")
        assert c is not None and c.gain_db == 0.0

    def test_gain_over_max_clamped(self):
        raw = _make_clip("c1", "/tmp/a.wav", gain_db=99.0)
        c = normalize_clip(raw, "t1")
        assert c is not None and c.gain_db == 6.0

    def test_zero_length_clip_rejected(self):
        raw = _make_clip("c1", "/tmp/a.wav", in_sec=0.5, out_sec=0.5)
        assert normalize_clip(raw, "t1") is None

    def test_inverted_clip_rejected(self):
        raw = _make_clip("c1", "/tmp/a.wav", in_sec=2.0, out_sec=1.0)
        assert normalize_clip(raw, "t1") is None

    def test_missing_path_rejected(self):
        raw = _make_clip("c1", "/tmp/a.wav")
        raw.pop("path")
        assert normalize_clip(raw, "t1") is None

    def test_fade_in_clamped_to_clip_duration(self):
        raw = _make_clip("c1", "/tmp/a.wav", out_sec=1.0, fade_in_sec=99.0)
        c = normalize_clip(raw, "t1")
        assert c is not None and c.fade_in_sec <= 1.0

    def test_fade_out_clamped_to_remaining(self):
        raw = _make_clip(
            "c1", "/tmp/a.wav", out_sec=1.0, fade_in_sec=0.5, fade_out_sec=99.0
        )
        c = normalize_clip(raw, "t1")
        assert c is not None and (c.fade_in_sec + c.fade_out_sec) <= 1.0

    def test_non_audio_track_rejected(self):
        t = _make_track("t1", [])
        t["type"] = "video"
        assert normalize_track(t) is None

    def test_audio_track_with_clips(self):
        clips = [_make_clip("c1", "/tmp/a.wav")]
        t = _make_track("t1", clips)
        nt = normalize_track(t)
        assert nt is not None
        assert len(nt.clips) == 1

    def test_audio_track_missing_audioclips_becomes_empty(self):
        t = _make_track("t1", [])
        t.pop("audioClips")
        nt = normalize_track(t)
        assert nt is not None and nt.clips == []


# --- State ---


class TestSetTracksState:
    def test_empty_state(self, home_tmp_path):
        m = AudioMixer()
        m.set_tracks([])
        out = m.mix(0.0, 4800)
        assert out.shape == (4800, 2)
        assert np.all(out == 0)

    def test_set_tracks_replaces(self, dc_wav):
        m = AudioMixer()
        m.set_tracks([_make_track("t1", [_make_clip("c1", str(dc_wav))])])
        m.set_tracks([])  # clear
        out = m.mix(0.1, 4800)
        assert np.all(out == 0)

    def test_non_list_input_ignored(self, dc_wav):
        m = AudioMixer()
        m.set_tracks([_make_track("t1", [_make_clip("c1", str(dc_wav))])])
        m.set_tracks("not a list")  # type: ignore[arg-type]
        # Still has previous state
        out = m.mix(0.1, 4800)
        assert np.any(np.abs(out) > 0.0)


# --- Mix basic ---


class TestMixBasic:
    def test_dc_clip_produces_signal(self, dc_wav):
        m = AudioMixer()
        m.set_tracks([_make_track("t1", [_make_clip("c1", str(dc_wav))])])
        out = m.mix(0.1, 4800)
        # Middle of clip, past de-click ramp — should be ~0.5 (DC passes through)
        peak = float(np.max(np.abs(out)))
        assert peak > 0.3
        assert peak <= OUTPUT_PEAK_CEILING + 1e-6

    def test_outside_clip_range_is_silent(self, dc_wav):
        m = AudioMixer()
        m.set_tracks([_make_track("t1", [_make_clip("c1", str(dc_wav), out_sec=0.5)])])
        out = m.mix(1.0, 4800)  # well past 0.5s end
        assert np.all(out == 0)

    def test_two_overlapping_clips_sum_limited(self, dc_wav):
        """Two +0dBFS clips (at source amp 0.5) overlapping should NOT exceed ceiling."""
        m = AudioMixer()
        m.set_tracks(
            [
                _make_track("t1", [_make_clip("c1", str(dc_wav))]),
                _make_track("t2", [_make_clip("c2", str(dc_wav))]),
            ]
        )
        out = m.mix(0.2, 4800)  # past de-click
        peak = float(np.max(np.abs(out)))
        assert peak <= OUTPUT_PEAK_CEILING + 1e-6, f"limiter breached: peak={peak}"


# --- Envelopes ---


class TestEnvelope:
    def test_declick_enforced_on_entry_with_zero_fade(self, dc_wav):
        """Even with fadeInSec=0, the first 5ms ramps from 0 to 1."""
        m = AudioMixer()
        m.set_tracks(
            [_make_track("t1", [_make_clip("c1", str(dc_wav), fade_in_sec=0.0)])]
        )
        # Sample the first 5ms
        out = m.mix(0.0, int(MIN_DECLICK_SEC * 48000))
        # First sample should be near zero (ramp start)
        first_peak = float(np.max(np.abs(out[:5])))
        assert first_peak < 0.1, f"expected near-zero start, got {first_peak}"
        # Last sample should approach 0.5 (full amplitude)
        last_peak = float(np.max(np.abs(out[-5:])))
        assert last_peak > 0.3

    def test_user_fade_in_compounds_with_declick(self, dc_wav):
        """A 0.1s fade-in should produce ramp from 0 to full over 0.1s."""
        m = AudioMixer()
        m.set_tracks(
            [_make_track("t1", [_make_clip("c1", str(dc_wav), fade_in_sec=0.1)])]
        )
        n = int(0.1 * 48000)
        out = m.mix(0.0, n)
        start_peak = float(np.max(np.abs(out[:100])))
        end_peak = float(np.max(np.abs(out[-100:])))
        assert start_peak < 0.05
        assert end_peak > 0.3

    def test_user_fade_out_ramp_at_end(self, dc_wav):
        """Fade-out over last 0.1s of a 0.5s clip."""
        m = AudioMixer()
        m.set_tracks(
            [_make_track("t1", [_make_clip("c1", str(dc_wav), fade_out_sec=0.1)])]
        )
        n = int(0.1 * 48000)
        out = m.mix(0.4, n)  # last 100ms
        head_peak = float(np.max(np.abs(out[:100])))
        tail_peak = float(np.max(np.abs(out[-100:])))
        # Head of fade-out is still loud
        assert head_peak > 0.3
        # Tail near zero
        assert tail_peak < 0.05


# --- Gain ---


class TestGain:
    def test_clip_gain_neg_inf_muted(self, dc_wav):
        """-60 dB (minimum) reduces output but isn't silent (-60 dB ≈ 0.001 × 0.5 ≈ 0.0005)."""
        m = AudioMixer()
        m.set_tracks([_make_track("t1", [_make_clip("c1", str(dc_wav), gain_db=-60)])])
        out = m.mix(0.1, 4800)
        peak = float(np.max(np.abs(out)))
        assert peak < 0.01

    def test_track_gain_multiplies_clip_gain(self, dc_wav):
        """Track +6dB and clip +6dB ≈ output 4× source (but limiter caps to ceiling)."""
        m = AudioMixer()
        m.set_tracks(
            [_make_track("t1", [_make_clip("c1", str(dc_wav), gain_db=6)], gain_db=6)]
        )
        out = m.mix(0.1, 4800)
        peak = float(np.max(np.abs(out)))
        # Would be 0.5 × 2 × 2 = 2.0 uncapped; limiter brings it down.
        assert peak <= OUTPUT_PEAK_CEILING + 1e-6


# --- Mute / solo ---


class TestMuteAndSolo:
    def test_muted_track_silent(self, dc_wav):
        m = AudioMixer()
        m.set_tracks(
            [_make_track("t1", [_make_clip("c1", str(dc_wav))], is_muted=True)]
        )
        out = m.mix(0.1, 4800)
        assert np.all(out == 0)

    def test_muted_clip_silent(self, dc_wav):
        m = AudioMixer()
        m.set_tracks([_make_track("t1", [_make_clip("c1", str(dc_wav), muted=True)])])
        out = m.mix(0.1, 4800)
        assert np.all(out == 0)

    def test_solo_silences_non_solo_tracks(self, dc_wav):
        m = AudioMixer()
        m.set_tracks(
            [
                _make_track("t1", [_make_clip("c1", str(dc_wav))]),
                _make_track("t2", [_make_clip("c2", str(dc_wav))], is_soloed=True),
            ]
        )
        active = m.get_active_clips(0.2)
        assert len(active) == 1
        assert active[0][0].track_id == "t2"


# --- Active-clip cap ---


class TestCap:
    def test_cap_at_max_active_clips(self, dc_wav):
        """Create 20 tracks each with a clip at t=0. Only MAX_ACTIVE_CLIPS should play."""
        tracks = [
            _make_track(f"t{i}", [_make_clip(f"c{i}", str(dc_wav))]) for i in range(20)
        ]
        m = AudioMixer()
        m.set_tracks(tracks)
        active = m.get_active_clips(0.2)
        assert len(active) == MAX_ACTIVE_CLIPS


# --- Structural safety ---


class TestSafety:
    def test_missing_audio_file_silent_not_crash(self, home_tmp_path):
        """Clip with a path that fails to open → mixer logs and skips, outputs silence."""
        m = AudioMixer()
        m.set_tracks(
            [
                _make_track(
                    "t1",
                    [_make_clip("c1", str(home_tmp_path / "does-not-exist.wav"))],
                )
            ]
        )
        out = m.mix(0.1, 4800)
        assert out.shape == (4800, 2)
        assert np.all(out == 0)

    def test_close_releases_decoders(self, dc_wav):
        m = AudioMixer()
        m.set_tracks([_make_track("t1", [_make_clip("c1", str(dc_wav))])])
        m.mix(0.1, 4800)  # ensures decoder is created
        m.close()
        # After close, mix with same tracks returns silence (state cleared)
        out = m.mix(0.1, 4800)
        assert np.all(out == 0)

    def test_negative_start_time_clamped(self, dc_wav):
        m = AudioMixer()
        m.set_tracks([_make_track("t1", [_make_clip("c1", str(dc_wav))])])
        out = m.mix(-5.0, 1024)
        assert out.shape == (1024, 2)
        # Should not crash and behaves as t=0
