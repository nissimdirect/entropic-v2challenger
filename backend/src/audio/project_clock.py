"""Project clock — monotonic wall-clock driven time source.

Drop-in replacement for AudioPlayer as the AVClock source. AudioPlayer derives
its position from decoded sample playback; ProjectClock derives its position
from time.monotonic() plus a playhead offset. Use this when audio is sourced
from a mixer (N tracks × N clips) rather than a single pre-decoded file.

Public surface matches AudioPlayer (duck-typed):
  - position_seconds (property)
  - is_playing (property)
  - duration_seconds (property)
  - volume (property)
  - play() / pause() / stop() / seek(time_s) / set_volume(v)
  - close()
"""

from __future__ import annotations

import threading
import time


class ProjectClock:
    """Monotonic wall-clock project playhead.

    Invariants:
    - position_seconds is ALWAYS finite, ALWAYS ≥ 0, ALWAYS ≤ duration_seconds.
    - Playback advances in real time when is_playing is True.
    - Duration is set externally (timeline extent); defaults to 0 (empty project).
    - All public methods are thread-safe.
    """

    def __init__(self, duration_s: float = 0.0) -> None:
        self._lock = threading.Lock()
        self._duration_s: float = max(
            0.0, float(duration_s) if _finite(duration_s) else 0.0
        )
        self._is_playing: bool = False
        # _paused_position_s: the playhead when _is_playing is False. When playing,
        # position = _paused_position_s + (monotonic() - _play_started_at).
        self._paused_position_s: float = 0.0
        self._play_started_at: float = 0.0
        self._volume: float = 1.0

    # --- Public properties (read-only) ---

    @property
    def position_seconds(self) -> float:
        """Current playhead, clamped to [0, duration]."""
        with self._lock:
            return self._position_locked()

    @property
    def is_playing(self) -> bool:
        with self._lock:
            return self._is_playing

    @property
    def duration_seconds(self) -> float:
        with self._lock:
            return self._duration_s

    @property
    def volume(self) -> float:
        with self._lock:
            return self._volume

    # --- Public mutators ---

    def play(self) -> bool:
        """Start advancing the playhead in real time. Idempotent."""
        with self._lock:
            if self._is_playing:
                return True
            self._play_started_at = time.monotonic()
            self._is_playing = True
            return True

    def pause(self) -> bool:
        """Freeze the playhead. Idempotent."""
        with self._lock:
            if not self._is_playing:
                return True
            # Snapshot current position and freeze
            self._paused_position_s = self._position_locked()
            self._is_playing = False
            return True

    def stop(self) -> None:
        """Pause and reset playhead to 0."""
        with self._lock:
            self._is_playing = False
            self._paused_position_s = 0.0
            self._play_started_at = 0.0

    def seek(self, time_s: float) -> bool:
        """Move the playhead to a specific time. Preserves play state."""
        if not _finite(time_s):
            return False
        with self._lock:
            clamped = max(0.0, min(self._duration_s, float(time_s)))
            self._paused_position_s = clamped
            if self._is_playing:
                self._play_started_at = time.monotonic()
            return True

    def set_volume(self, volume: float) -> None:
        """Set output volume. Clamped to [0, 1]. NaN/Inf rejected to 0."""
        if not _finite(volume):
            volume = 0.0
        with self._lock:
            self._volume = max(0.0, min(1.0, float(volume)))

    def set_duration(self, duration_s: float) -> None:
        """Update the project duration. Clamps playhead if it exceeds new duration."""
        if not _finite(duration_s):
            return
        with self._lock:
            self._duration_s = max(0.0, float(duration_s))
            # If playhead is past the new duration, clamp it.
            if self._paused_position_s > self._duration_s:
                self._paused_position_s = self._duration_s
            if self._is_playing and self._position_locked() >= self._duration_s:
                # Auto-pause at end of timeline.
                self._paused_position_s = self._duration_s
                self._is_playing = False

    def close(self) -> None:
        """Release resources (no-op for ProjectClock — compatibility with AudioPlayer)."""
        self.stop()

    # --- Internal helpers ---

    def _position_locked(self) -> float:
        """Compute current position. Caller must hold self._lock."""
        if not self._is_playing:
            return self._paused_position_s
        elapsed = time.monotonic() - self._play_started_at
        pos = self._paused_position_s + elapsed
        if pos >= self._duration_s:
            return self._duration_s
        return max(0.0, pos)


def _finite(x: float) -> bool:
    """True if x is a finite number (not NaN, not Inf)."""
    return (
        isinstance(x, (int, float))
        and x == x
        and x != float("inf")
        and x != float("-inf")
    )
