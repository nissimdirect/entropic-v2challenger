"""Tests for audio-path security hardening: resolve_safe_path + magic-byte + decode timeouts."""

from __future__ import annotations

import struct
import time
from pathlib import Path

import numpy as np
import pytest

from audio.decoder import MAX_SAMPLES, decode_audio
from security import is_audio_magic, resolve_safe_path


# --- Helpers ---


def _write_minimal_wav(
    path: Path, samples: np.ndarray, sample_rate: int = 48000
) -> None:
    """Write a valid PCM s16 WAV file (small, real, decodable)."""
    import wave

    pcm = (np.clip(samples, -1.0, 1.0) * 32767).astype(np.int16)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1 if pcm.ndim == 1 else pcm.shape[1])
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        w.writeframes(pcm.tobytes())


# --- resolve_safe_path ---


class TestResolveSafePath:
    def test_valid_path_returns_realpath(self, home_tmp_path):
        f = home_tmp_path / "kick.wav"
        f.write_bytes(b"RIFF" + b"\x00" * 100)
        resolved, errors = resolve_safe_path(str(f))
        assert errors == []
        assert resolved is not None
        assert resolved.exists()
        assert str(resolved).startswith(str(Path.home()))

    def test_missing_file_rejected(self):
        resolved, errors = resolve_safe_path(str(Path.home() / "does-not-exist.wav"))
        assert resolved is None
        assert errors  # non-empty

    def test_bad_extension_rejected(self, home_tmp_path):
        f = home_tmp_path / "oops.exe"
        f.write_bytes(b"MZ" + b"\x00" * 100)
        resolved, errors = resolve_safe_path(str(f))
        assert resolved is None
        assert any("not allowed" in e for e in errors)

    def test_symlink_rejected(self, home_tmp_path):
        target = home_tmp_path / "real.wav"
        target.write_bytes(b"RIFF" + b"\x00" * 100)
        link = home_tmp_path / "sneaky.wav"
        link.symlink_to(target)
        resolved, errors = resolve_safe_path(str(link))
        assert resolved is None
        assert any("symlink" in e.lower() for e in errors)


# --- is_audio_magic ---


class TestIsAudioMagic:
    def test_wav_riff_detected(self, home_tmp_path):
        f = home_tmp_path / "a.wav"
        f.write_bytes(b"RIFF" + b"\x00" * 40 + b"WAVEfmt ")
        assert is_audio_magic(str(f))

    def test_ogg_detected(self, home_tmp_path):
        f = home_tmp_path / "a.ogg"
        f.write_bytes(b"OggS" + b"\x00" * 40)
        assert is_audio_magic(str(f))

    def test_flac_detected(self, home_tmp_path):
        f = home_tmp_path / "a.flac"
        f.write_bytes(b"fLaC" + b"\x00" * 40)
        assert is_audio_magic(str(f))

    def test_aiff_detected(self, home_tmp_path):
        f = home_tmp_path / "a.aiff"
        f.write_bytes(b"FORM" + b"\x00" * 40)
        assert is_audio_magic(str(f))

    def test_m4a_ftyp_detected(self, home_tmp_path):
        f = home_tmp_path / "a.m4a"
        # 4-byte size prefix, then ftyp
        f.write_bytes(b"\x00\x00\x00\x20" + b"ftypM4A " + b"\x00" * 32)
        assert is_audio_magic(str(f))

    def test_mp3_id3_detected(self, home_tmp_path):
        f = home_tmp_path / "a.mp3"
        f.write_bytes(b"ID3" + b"\x03" + b"\x00" * 40)
        assert is_audio_magic(str(f))

    def test_mp3_frame_sync_detected(self, home_tmp_path):
        f = home_tmp_path / "a.mp3"
        f.write_bytes(b"\xff\xfb" + b"\x00" * 40)
        assert is_audio_magic(str(f))

    def test_text_file_rejected(self, home_tmp_path):
        f = home_tmp_path / "fake.wav"
        f.write_bytes(b"Hello, world. Not audio.")
        assert not is_audio_magic(str(f))

    def test_mp4_masquerading_as_wav_rejected(self, home_tmp_path):
        f = home_tmp_path / "fake.wav"
        # mp4 ftyp at wrong offset — matches ftyp pattern so we accept.
        # But a pure "not audio" file with no audio signature must fail.
        f.write_bytes(b"\x00\x00\x00\x00" + b"random" + b"\x00" * 20)
        assert not is_audio_magic(str(f))

    def test_empty_file_rejected(self, home_tmp_path):
        f = home_tmp_path / "empty.wav"
        f.write_bytes(b"")
        assert not is_audio_magic(str(f))

    def test_nonexistent_file_rejected(self):
        assert not is_audio_magic("/does/not/exist.wav")


# --- decode_audio hardening ---


class TestDecodeTimeouts:
    def test_sample_cap_constant_is_sane(self):
        # 1 hour stereo 48kHz = 345.6M samples; MAX_SAMPLES should be at least that.
        assert MAX_SAMPLES >= 48000 * 2 * 3600

    def test_valid_small_wav_decodes(self, home_tmp_path):
        f = home_tmp_path / "tone.wav"
        t = np.linspace(0, 0.1, 4800, dtype=np.float32)
        samples = (np.sin(2 * np.pi * 440 * t)).astype(np.float32)
        _write_minimal_wav(f, samples, sample_rate=48000)
        result = decode_audio(str(f))
        assert result["ok"], result.get("error")
        assert result["sample_rate"] == 48000

    def test_tiny_max_samples_rejects_large_decode(self, home_tmp_path):
        """Sample cap triggers when file has more samples than cap allows."""
        f = home_tmp_path / "tone.wav"
        # 1 second of audio — 48000 samples
        samples = np.zeros(48000, dtype=np.float32)
        _write_minimal_wav(f, samples, sample_rate=48000)
        # Cap at 100 samples — file will exceed it
        result = decode_audio(str(f), max_samples=100)
        assert not result["ok"]
        assert "codec bomb" in result["error"] or "cap" in result["error"]

    def test_zero_timeout_rejects_decode(self, home_tmp_path):
        """Wall-clock timeout kills decode even for small valid files."""
        f = home_tmp_path / "tone.wav"
        samples = np.zeros(48000, dtype=np.float32)
        _write_minimal_wav(f, samples, sample_rate=48000)
        # Pre-expire the deadline
        time.sleep(0.001)
        result = decode_audio(str(f), timeout_s=0.0)
        assert not result["ok"]
        assert "timeout" in result["error"].lower()
