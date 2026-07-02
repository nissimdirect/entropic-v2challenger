"""PortAudio output for the multi-track mixer.

MixerPlayer owns a sounddevice output stream whose callback pulls samples
from `mixer.mix(clock.position_seconds, n)` in real time. Used when the
EXPERIMENTAL_AUDIO_TRACKS flag is on; when off, legacy AudioPlayer remains
the output device.

Construction is audio-device-free — open() is what actually touches PortAudio
so that unit tests can construct and introspect a MixerPlayer without an
output device. Real tests that need audio should mock sounddevice.
"""

from __future__ import annotations

import logging
import threading

import numpy as np

try:
    import sounddevice as sd
except Exception:  # pragma: no cover — sd may not be importable in headless CI
    sd = None  # type: ignore[assignment]

from audio import bake_log
from audio.mixer import AudioMixer
from audio.project_clock import ProjectClock
from audio.streaming_decoder import PROJECT_CHANNELS, PROJECT_SAMPLE_RATE

log = logging.getLogger(__name__)


class MixerPlayer:
    """Drives a PortAudio output stream from the AudioMixer.

    Lifecycle:
        m = MixerPlayer(mixer, clock)     # construction is cheap — no device open
        m.start()                         # opens stream, starts callback
        m.stop()                          # stops stream (idempotent)
        m.close()                         # releases stream (idempotent)

    The callback reads the current project clock position on every call and
    asks the mixer for `frames` stereo samples. If the clock is paused, the
    mixer still returns audio for that offset (usually silence), but the
    clock doesn't advance — so playback stalls instead of drifting.
    """

    def __init__(
        self,
        mixer: AudioMixer,
        clock: ProjectClock,
        sample_rate: int = PROJECT_SAMPLE_RATE,
        blocksize: int = 1024,
    ) -> None:
        self._mixer = mixer
        self._clock = clock
        self._sample_rate = int(sample_rate)
        self._blocksize = int(blocksize)
        self._stream: object | None = None  # sd.OutputStream when open
        self._lock = threading.Lock()
        self._is_running = False
        self._underflow_count = 0
        self._callback_error_count = 0
        # --- Bake-session logging state (PD.1, additive, fail-silent) ---
        self._bake_ts_start: str | None = None
        self._bake_error_baseline = 0
        self._bake_device = ""

    # --- Properties ---

    @property
    def is_running(self) -> bool:
        with self._lock:
            return self._is_running

    @property
    def sample_rate(self) -> int:
        return self._sample_rate

    # --- Lifecycle ---

    def start(self) -> bool:
        """Open the PortAudio stream and begin the callback loop.

        Returns True if started (or already running), False if sounddevice
        is unavailable or opening fails.
        """
        if sd is None:
            log.warning("MixerPlayer.start: sounddevice unavailable, skipping")
            return False
        with self._lock:
            if self._is_running and self._stream is not None:
                return True
            try:
                self._stream = sd.OutputStream(
                    samplerate=self._sample_rate,
                    channels=PROJECT_CHANNELS,
                    dtype="float32",
                    callback=self._callback,
                    blocksize=self._blocksize,
                )
                self._stream.start()
                self._is_running = True
                self._begin_bake_session()
                return True
            except Exception as e:
                log.warning("MixerPlayer.start: failed to open stream: %s", e)
                self._stream = None
                self._is_running = False
                return False

    def stop(self) -> None:
        """Stop the stream without releasing resources. Idempotent."""
        with self._lock:
            if self._stream is not None:
                try:
                    self._stream.stop()
                except Exception as e:
                    log.warning("MixerPlayer.stop: %s", e)
            self._is_running = False
            self._end_bake_session()

    def close(self) -> None:
        """Release the stream. Idempotent."""
        with self._lock:
            if self._stream is not None:
                try:
                    self._stream.close()
                except Exception as e:
                    log.warning("MixerPlayer.close: %s", e)
                self._stream = None
            self._is_running = False

    # --- Bake-session logging (PD.1) ---

    def _begin_bake_session(self) -> None:
        """Capture session start state for the bake log. Fail-silent.

        Records ts_start, the device name, and the callback-error baseline so
        ``_end_bake_session`` can emit the per-session delta. Any failure here is
        swallowed — it must never break stream startup.
        """
        try:
            self._bake_ts_start = bake_log.now_iso()
            self._bake_error_baseline = self._callback_error_count
            self._bake_device = self._query_device_name()
        except Exception:  # pragma: no cover — defensive, must never raise
            self._bake_ts_start = None

    def _end_bake_session(self) -> None:
        """Append one bake-log line for the just-ended session. Fail-silent.

        No-op if no session was started (``stop()`` is idempotent and may be
        called when not running). All I/O is swallowed by ``bake_log``.
        """
        try:
            ts_start = self._bake_ts_start
            if ts_start is None:
                return
            self._bake_ts_start = None  # consume so a double-stop logs once
            ts_end = bake_log.now_iso()
            duration_s = self._iso_delta_seconds(ts_start, ts_end)
            errors = max(0, self._callback_error_count - self._bake_error_baseline)
            bake_log.append_session(
                ts_start=ts_start,
                ts_end=ts_end,
                duration_s=duration_s,
                device=self._bake_device,
                callback_errors=errors,
                flag_on=self._read_flag_on(),
                app_mode=self._read_app_mode(),
            )
        except Exception:  # pragma: no cover — defensive, must never raise
            pass

    @staticmethod
    def _iso_delta_seconds(ts_start: str, ts_end: str) -> float:
        try:
            from datetime import datetime

            return max(
                0.0,
                (
                    datetime.fromisoformat(ts_end) - datetime.fromisoformat(ts_start)
                ).total_seconds(),
            )
        except Exception:
            return 0.0

    @staticmethod
    def _query_device_name() -> str:
        """Best-effort sounddevice default-output device name. Fail-silent."""
        try:
            if sd is None:
                return ""
            default = sd.default.device
            idx = default[1] if isinstance(default, (list, tuple)) else default
            info = sd.query_devices(idx)
            return str(info.get("name", "")) if isinstance(info, dict) else str(info)
        except Exception:
            return ""

    @staticmethod
    def _read_flag_on() -> bool:
        """Read EXPERIMENTAL_AUDIO_TRACKS for the bake-log line. Fail-silent.

        MixerPlayer only runs on the multi-track (flag-on) path, but reading the
        env directly keeps the log honest if that ever changes.
        """
        try:
            import os

            val = os.environ.get("EXPERIMENTAL_AUDIO_TRACKS", "").strip().lower()
            return val in ("true", "1", "yes", "on")
        except Exception:
            return True

    @staticmethod
    def _read_app_mode() -> str:
        """Read the CREATRIX_APP_MODE provenance tag for the bake-log line.

        Fail-silent — defaults to "unknown" via bake_log.resolve_app_mode()
        on any error, matching the fail-silent contract of the rest of this
        logging path.
        """
        try:
            return bake_log.resolve_app_mode()
        except Exception:  # pragma: no cover — defensive, must never raise
            return "unknown"

    # --- Observability ---

    @property
    def underflow_count(self) -> int:
        """Monotonic count of audio-thread underflows observed in the callback.

        PortAudio raises an output_underflow flag when the previous callback
        didn't fill the buffer in time (the audio thread missed its deadline).
        A non-zero count after a long session is an early-warning signal that
        the mixer is getting close to the per-callback budget.
        """
        return self._underflow_count

    @property
    def callback_error_count(self) -> int:
        """Monotonic count of exceptions caught in _callback. Non-zero means
        the audio thread fell back to silence at least once."""
        return self._callback_error_count

    # --- Callback ---

    def _callback(
        self,
        outdata: np.ndarray,
        frames: int,
        time_info: object,
        status: object,
    ) -> None:
        """sounddevice callback. Runs on the audio thread.

        Never raises — exceptions are caught and the output is zeroed so the
        audio thread cannot die. Status flags (output_underflow etc.) are
        tallied but do not alter output.
        """
        # PortAudio status reporting. sd.CallbackFlags implements __bool__ so
        # truthy means at least one flag is set.
        try:
            if status:
                # output_underflow is the main one that matters for us;
                # sd.CallbackFlags has attributes like .output_underflow but
                # simpler + portable: any truthy status counts as an underrun
                # event for tally purposes.
                self._underflow_count += 1
        except Exception:
            pass

        try:
            position = self._clock.position_seconds
            samples = self._mixer.mix(position, frames)
            if samples.shape[0] >= frames:
                outdata[:] = samples[:frames]
            else:
                # Partial buffer (shouldn't happen — mixer always returns
                # exactly `frames`). Zero-pad to stay within deadline.
                outdata.fill(0)
                outdata[: samples.shape[0]] = samples
        except Exception as e:
            # Never let the audio thread die — fall back to silence.
            self._callback_error_count += 1
            log.exception("MixerPlayer.callback error: %s", e)
            outdata.fill(0)
