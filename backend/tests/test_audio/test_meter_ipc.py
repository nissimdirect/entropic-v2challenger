"""IPC handler tests for audio_meter — F-0516-6 phase 2 wiring.

Direct handler unit tests (no ZMQ socket). Verifies the handler:
- returns floor reading when no audio loaded
- returns valid reading from a known PCM window
- handles malformed positions gracefully
- returns finite values for downstream consumers
"""

from __future__ import annotations

from types import SimpleNamespace

import numpy as np
import pytest

from audio.meter import METER_FLOOR_DB

pytestmark = pytest.mark.smoke


class FakeAudioPlayer:
    """Minimal stub for AudioPlayer — enough for _handle_audio_meter."""

    def __init__(self, samples=None, position=0, sample_rate=48000):
        self.loaded = samples is not None
        self._samples = samples
        self._sample_rate = sample_rate
        self.position = position


def _make_handler_caller(audio_player):
    """Bind _handle_audio_meter to a stub-only instance.

    Avoids constructing the full ZMQServer (which spins up zmq sockets +
    sidecar state). Pulls the method off the class and calls it with a
    minimal self that has just `audio_player`.
    """
    from zmq_server import ZMQServer

    stub = SimpleNamespace(audio_player=audio_player)
    return lambda msg_id="t1": ZMQServer._handle_audio_meter(stub, {}, msg_id)


class TestAudioMeterIPC:
    def test_no_audio_loaded_returns_floor(self):
        call = _make_handler_caller(FakeAudioPlayer(samples=None))
        resp = call()
        assert resp["ok"] is True
        assert resp["rms_db"] == METER_FLOOR_DB
        assert resp["peak_db"] == METER_FLOOR_DB
        assert resp["clipped"] is False

    def test_silence_window_returns_floor(self):
        silent = np.zeros(48000, dtype=np.float32)
        call = _make_handler_caller(FakeAudioPlayer(samples=silent, position=1000))
        resp = call()
        assert resp["ok"] is True
        assert resp["rms_db"] == METER_FLOOR_DB
        assert resp["clipped"] is False

    def test_half_amplitude_window_reports_minus_6_dbfs(self):
        # 1024 constant samples at 0.5 → RMS = 0.5 → -6.02 dBFS,
        # peak = 0.5 → -6.02 dBFS, not clipped
        pcm = np.full(48000, 0.5, dtype=np.float32)
        call = _make_handler_caller(FakeAudioPlayer(samples=pcm, position=512))
        resp = call()
        assert resp["ok"] is True
        assert abs(resp["rms_db"] - (-6.02)) < 0.1
        assert abs(resp["peak_db"] - (-6.02)) < 0.1
        assert resp["clipped"] is False

    def test_full_scale_clips(self):
        pcm = np.full(48000, 1.0, dtype=np.float32)
        call = _make_handler_caller(FakeAudioPlayer(samples=pcm, position=512))
        resp = call()
        assert resp["ok"] is True
        assert resp["clipped"] is True

    def test_stereo_samples_handled(self):
        # Stereo: shape (samples, 2). compute_meter handles multichannel.
        pcm = np.full((48000, 2), 0.5, dtype=np.float32)
        call = _make_handler_caller(FakeAudioPlayer(samples=pcm, position=512))
        resp = call()
        assert resp["ok"] is True
        assert abs(resp["peak_db"] - (-6.02)) < 0.1

    def test_position_beyond_buffer_returns_floor(self):
        pcm = np.full(100, 0.5, dtype=np.float32)
        call = _make_handler_caller(FakeAudioPlayer(samples=pcm, position=10000))
        resp = call()
        # position past buffer → empty window → floor
        assert resp["ok"] is True
        assert resp["rms_db"] == METER_FLOOR_DB

    def test_returns_id_field(self):
        call = _make_handler_caller(FakeAudioPlayer(samples=None))
        resp = call(msg_id="my-id-123")
        assert resp["id"] == "my-id-123"
