"""A/V sync clock — audio is master, video is slave."""

import math
from typing import Union

from audio.player import AudioPlayer
from audio.project_clock import ProjectClock

ClockSource = Union[AudioPlayer, ProjectClock]


class AVClock:
    """Decoupled A/V clock that derives video frame position from a time source.

    Audio runs on a real-time thread and never waits for video.
    Video queries this clock to know which frame to display.
    If video can't keep up, it holds the previous frame — audio never stutters.

    The clock source may be either an AudioPlayer (legacy singleton-bed path)
    or a ProjectClock (multi-track path, driven by time.monotonic() rather than
    decoded samples). Both expose the same duck-typed surface:
    position_seconds, is_playing, duration_seconds, volume.
    """

    def __init__(self, player: ClockSource) -> None:
        self._player: ClockSource = player
        self._fps: float = 30.0
        self._video_frame_count: int | None = None

    @property
    def fps(self) -> float:
        return self._fps

    def set_fps(self, fps: float) -> None:
        """Set video frame rate. Clamps to [1.0, 240.0]."""
        self._fps = max(1.0, min(240.0, fps))

    def set_video_frame_count(self, count: int) -> None:
        """Set the actual video frame count from probe/ingest.

        Used to clamp target_frame_index so it never exceeds the
        video's real frame count (audio duration can be slightly longer).
        """
        self._video_frame_count = count if count > 0 else None

    @property
    def audio_time_s(self) -> float:
        """Current audio playback position in seconds."""
        return self._player.position_seconds

    @property
    def target_frame_index(self) -> int:
        """Video frame index that should be displayed now.

        floor(audio_time * fps), clamped to video frame count.
        Audio duration can exceed video duration by 1-2 frames in some containers.
        """
        raw = math.floor(self.audio_time_s * self._fps)
        if self._video_frame_count is not None and raw >= self._video_frame_count:
            return self._video_frame_count - 1
        return raw

    @property
    def is_playing(self) -> bool:
        return self._player.is_playing

    @property
    def duration_s(self) -> float:
        return self._player.duration_seconds

    @property
    def total_frames(self) -> int:
        """Total video frames based on audio duration and fps."""
        return math.ceil(self.duration_s * self._fps)

    def sync_state(self) -> dict:
        """Full sync state for Electron to consume via ZMQ.

        Returns dict with everything needed to render the correct frame.
        """
        return {
            "audio_time_s": round(self.audio_time_s, 6),
            "target_frame": self.target_frame_index,
            "total_frames": self.total_frames,
            "is_playing": self.is_playing,
            "duration_s": round(self.duration_s, 6),
            "fps": self._fps,
            "volume": self._player.volume,
        }
