"""Tests for MixerPlayer — PortAudio output stream wrapper.

Uses a MockOutputStream to avoid opening a real audio device in CI.
"""

from __future__ import annotations

import numpy as np
import pytest

from audio import mixer_player as mp_mod
from audio.mixer import AudioMixer
from audio.mixer_player import MixerPlayer
from audio.project_clock import ProjectClock


class _FakeStream:
    """Stand-in for sd.OutputStream that records callback invocations."""

    def __init__(
        self, *, samplerate: int, channels: int, dtype: str, callback, blocksize: int
    ) -> None:
        self.samplerate = samplerate
        self.channels = channels
        self.dtype = dtype
        self.callback = callback
        self.blocksize = blocksize
        self.started = False
        self.stopped = False
        self.closed = False

    def start(self) -> None:
        self.started = True

    def stop(self) -> None:
        self.stopped = True

    def close(self) -> None:
        self.closed = True


class _FakeSD:
    """Stand-in for the `sounddevice` module — captures the last-created stream."""

    def __init__(self) -> None:
        self.last_stream: _FakeStream | None = None

    def OutputStream(self, **kw) -> _FakeStream:  # noqa: N802 — mimics sd API
        self.last_stream = _FakeStream(**kw)
        return self.last_stream


@pytest.fixture
def fake_sd(monkeypatch):
    fake = _FakeSD()
    monkeypatch.setattr(mp_mod, "sd", fake)
    return fake


# --- Construction + lifecycle ---


class TestLifecycle:
    def test_construction_is_device_free(self, fake_sd):
        # Constructing a MixerPlayer should NOT open a stream.
        mixer = AudioMixer()
        clock = ProjectClock()
        p = MixerPlayer(mixer, clock)
        assert not p.is_running
        assert fake_sd.last_stream is None

    def test_start_opens_stream(self, fake_sd):
        mixer = AudioMixer()
        clock = ProjectClock()
        p = MixerPlayer(mixer, clock)
        ok = p.start()
        assert ok is True
        assert p.is_running
        assert fake_sd.last_stream is not None
        assert fake_sd.last_stream.started is True

    def test_start_is_idempotent(self, fake_sd):
        p = MixerPlayer(AudioMixer(), ProjectClock())
        p.start()
        first_stream = fake_sd.last_stream
        p.start()
        # Should NOT create a second stream
        assert fake_sd.last_stream is first_stream

    def test_stop_does_not_close(self, fake_sd):
        p = MixerPlayer(AudioMixer(), ProjectClock())
        p.start()
        p.stop()
        assert not p.is_running
        assert fake_sd.last_stream.stopped is True
        assert fake_sd.last_stream.closed is False

    def test_close_releases_stream(self, fake_sd):
        p = MixerPlayer(AudioMixer(), ProjectClock())
        p.start()
        p.close()
        assert not p.is_running
        assert fake_sd.last_stream.closed is True

    def test_close_is_idempotent(self, fake_sd):
        p = MixerPlayer(AudioMixer(), ProjectClock())
        p.start()
        p.close()
        p.close()  # no raise
        assert not p.is_running

    def test_start_when_sd_unavailable_returns_false(self, monkeypatch):
        monkeypatch.setattr(mp_mod, "sd", None)
        p = MixerPlayer(AudioMixer(), ProjectClock())
        assert p.start() is False
        assert not p.is_running


# --- Callback contract ---


class TestCallback:
    def test_callback_pulls_from_mixer_at_clock_position(self, fake_sd):
        mixer = AudioMixer()
        clock = ProjectClock()
        clock.seek(0.0)
        p = MixerPlayer(mixer, clock, blocksize=256)
        p.start()
        cb = fake_sd.last_stream.callback

        out = np.zeros((256, 2), dtype=np.float32)
        # Call the sounddevice callback as it would be invoked on the audio thread
        cb(out, 256, None, None)

        # With empty mixer, output is silence.
        assert np.all(out == 0.0)

    def test_callback_silences_on_mixer_exception(self, fake_sd, monkeypatch):
        mixer = AudioMixer()
        clock = ProjectClock()
        p = MixerPlayer(mixer, clock, blocksize=256)
        p.start()

        # Force mixer.mix to raise
        def broken(*args, **kw):
            raise RuntimeError("simulated mixer failure")

        monkeypatch.setattr(mixer, "mix", broken)

        out = np.ones((256, 2), dtype=np.float32)  # start with non-zero
        fake_sd.last_stream.callback(out, 256, None, None)
        # Output should be zeroed (graceful fallback, no audio-thread death)
        assert np.all(out == 0.0)

    def test_callback_zero_pads_short_mixer_output(self, fake_sd, monkeypatch):
        mixer = AudioMixer()
        clock = ProjectClock()
        p = MixerPlayer(mixer, clock, blocksize=256)
        p.start()

        def short_mix(t_start_s, n_samples):
            # Return only 100 samples instead of 256
            return np.full((100, 2), 0.5, dtype=np.float32)

        monkeypatch.setattr(mixer, "mix", short_mix)

        out = np.zeros((256, 2), dtype=np.float32)
        fake_sd.last_stream.callback(out, 256, None, None)
        # First 100 samples should have signal; rest zero
        assert np.allclose(out[:100], 0.5)
        assert np.all(out[100:] == 0.0)


# --- Status / observability counters ---


class TestStatusCounters:
    def test_underflow_counter_increments_on_truthy_status(self, fake_sd):
        p = MixerPlayer(AudioMixer(), ProjectClock(), blocksize=64)
        p.start()
        out = np.zeros((64, 2), dtype=np.float32)

        class _Truthy:
            def __bool__(self):
                return True

        assert p.underflow_count == 0
        fake_sd.last_stream.callback(out, 64, None, _Truthy())
        assert p.underflow_count == 1
        fake_sd.last_stream.callback(out, 64, None, _Truthy())
        assert p.underflow_count == 2

    def test_underflow_counter_stays_zero_on_falsy_status(self, fake_sd):
        p = MixerPlayer(AudioMixer(), ProjectClock(), blocksize=64)
        p.start()
        out = np.zeros((64, 2), dtype=np.float32)

        class _Falsy:
            def __bool__(self):
                return False

        fake_sd.last_stream.callback(out, 64, None, _Falsy())
        fake_sd.last_stream.callback(out, 64, None, None)
        assert p.underflow_count == 0

    def test_callback_error_counter_increments(self, fake_sd, monkeypatch):
        mixer = AudioMixer()
        p = MixerPlayer(mixer, ProjectClock(), blocksize=64)
        p.start()

        def boom(*a, **kw):
            raise RuntimeError("boom")

        monkeypatch.setattr(mixer, "mix", boom)
        out = np.ones((64, 2), dtype=np.float32)
        assert p.callback_error_count == 0
        fake_sd.last_stream.callback(out, 64, None, None)
        assert p.callback_error_count == 1
        assert np.all(out == 0)  # fallback silence


# --- ZMQ integration via project_clock_play ---


class TestZMQIntegration:
    """Verify the server wires project_clock_play → mixer_player.start when flag ON."""

    def test_flag_off_does_not_start_mixer(self, fake_sd, monkeypatch):
        monkeypatch.delenv("EXPERIMENTAL_AUDIO_TRACKS", raising=False)
        from zmq_server import ZMQServer

        srv = ZMQServer()
        try:
            assert srv._experimental_audio_tracks is False
            result = srv._handle_project_clock_play("msg-1")
            assert result["ok"] is True
            # Mixer player should NOT be running (legacy path)
            assert srv.mixer_player.is_running is False
            assert result.get("mixer_started") is False
        finally:
            srv.mixer_player.close()

    def test_flag_on_starts_mixer(self, fake_sd, monkeypatch):
        monkeypatch.setenv("EXPERIMENTAL_AUDIO_TRACKS", "true")
        from zmq_server import ZMQServer

        srv = ZMQServer()
        try:
            assert srv._experimental_audio_tracks is True
            result = srv._handle_project_clock_play("msg-1")
            assert result["ok"] is True
            assert result.get("mixer_started") is True
            assert srv.mixer_player.is_running is True
        finally:
            srv.mixer_player.close()

    def test_flag_on_pause_stops_mixer(self, fake_sd, monkeypatch):
        monkeypatch.setenv("EXPERIMENTAL_AUDIO_TRACKS", "true")
        from zmq_server import ZMQServer

        srv = ZMQServer()
        try:
            srv._handle_project_clock_play("msg-1")
            assert srv.mixer_player.is_running is True
            srv._handle_project_clock_pause("msg-2")
            assert srv.mixer_player.is_running is False
        finally:
            srv.mixer_player.close()
