"""Tests for ProjectClock — monotonic wall-clock project playhead."""

from __future__ import annotations

import time

from audio.project_clock import ProjectClock


class TestInitialState:
    def test_defaults(self):
        c = ProjectClock()
        assert c.position_seconds == 0.0
        assert not c.is_playing
        assert c.duration_seconds == 0.0
        assert c.volume == 1.0

    def test_with_duration(self):
        c = ProjectClock(duration_s=10.0)
        assert c.duration_seconds == 10.0

    def test_nan_duration_rejected(self):
        c = ProjectClock(duration_s=float("nan"))
        assert c.duration_seconds == 0.0

    def test_negative_duration_clamped(self):
        c = ProjectClock(duration_s=-5.0)
        assert c.duration_seconds == 0.0


class TestPlayPause:
    def test_play_is_idempotent(self):
        c = ProjectClock(duration_s=60)
        c.play()
        c.play()
        assert c.is_playing

    def test_pause_is_idempotent(self):
        c = ProjectClock(duration_s=60)
        c.pause()
        assert not c.is_playing
        c.pause()
        assert not c.is_playing

    def test_play_advances_position(self):
        c = ProjectClock(duration_s=60)
        c.play()
        time.sleep(0.05)
        pos = c.position_seconds
        assert pos > 0.02
        assert pos < 0.15  # generous for scheduler jitter

    def test_pause_freezes_position(self):
        c = ProjectClock(duration_s=60)
        c.play()
        time.sleep(0.03)
        c.pause()
        frozen = c.position_seconds
        time.sleep(0.05)
        assert c.position_seconds == frozen

    def test_play_resumes_from_frozen(self):
        c = ProjectClock(duration_s=60)
        c.play()
        time.sleep(0.03)
        c.pause()
        frozen = c.position_seconds
        c.play()
        time.sleep(0.03)
        assert c.position_seconds > frozen


class TestSeek:
    def test_seek_while_paused(self):
        c = ProjectClock(duration_s=60)
        c.seek(15.0)
        assert c.position_seconds == 15.0
        assert not c.is_playing

    def test_seek_while_playing_preserves_play_state(self):
        c = ProjectClock(duration_s=60)
        c.play()
        c.seek(20.0)
        assert c.is_playing
        # Advances from seek point
        pos_after_seek = c.position_seconds
        assert pos_after_seek >= 20.0
        assert pos_after_seek < 20.2

    def test_seek_past_duration_clamps(self):
        c = ProjectClock(duration_s=10)
        c.seek(999)
        assert c.position_seconds == 10

    def test_seek_negative_clamps_to_zero(self):
        c = ProjectClock(duration_s=60)
        c.seek(-5)
        assert c.position_seconds == 0.0

    def test_seek_nan_rejected(self):
        c = ProjectClock(duration_s=60)
        c.seek(30)
        assert c.seek(float("nan")) is False
        assert c.position_seconds == 30.0  # unchanged


class TestVolume:
    def test_default_volume(self):
        assert ProjectClock().volume == 1.0

    def test_set_volume_clamps(self):
        c = ProjectClock()
        c.set_volume(0.5)
        assert c.volume == 0.5
        c.set_volume(2.0)
        assert c.volume == 1.0
        c.set_volume(-0.1)
        assert c.volume == 0.0

    def test_nan_volume_rejected_to_zero(self):
        c = ProjectClock()
        c.set_volume(float("nan"))
        assert c.volume == 0.0


class TestDurationBehavior:
    def test_auto_pause_at_end_of_timeline(self):
        c = ProjectClock(duration_s=0.05)
        c.play()
        time.sleep(0.08)
        # Trigger the auto-pause check by touching set_duration with same value
        c.set_duration(0.05)
        assert not c.is_playing
        assert c.position_seconds == 0.05

    def test_set_duration_clamps_playhead_if_shrunk(self):
        c = ProjectClock(duration_s=60)
        c.seek(50)
        c.set_duration(30)
        assert c.position_seconds == 30
        assert c.duration_seconds == 30

    def test_position_never_exceeds_duration(self):
        c = ProjectClock(duration_s=0.05)
        c.play()
        time.sleep(0.15)  # play past end
        assert c.position_seconds <= 0.05


class TestStopReset:
    def test_stop_pauses_and_zeroes(self):
        c = ProjectClock(duration_s=60)
        c.seek(20)
        c.play()
        c.stop()
        assert not c.is_playing
        assert c.position_seconds == 0.0

    def test_close_is_noop_safe(self):
        c = ProjectClock(duration_s=60)
        c.close()  # should not raise
        c.close()  # idempotent


class TestDuckTypingAgainstAudioPlayer:
    """ProjectClock must match AudioPlayer's public surface used by AVClock."""

    def test_has_required_attrs(self):
        c = ProjectClock()
        assert hasattr(c, "position_seconds")
        assert hasattr(c, "is_playing")
        assert hasattr(c, "duration_seconds")
        assert hasattr(c, "volume")
        assert callable(c.play)
        assert callable(c.pause)
        assert callable(c.seek)
        assert callable(c.set_volume)
        assert callable(c.stop)
        assert callable(c.close)
