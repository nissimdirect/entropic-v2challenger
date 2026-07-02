"""Audio playback engine using sounddevice."""

import threading

import numpy as np
import sounddevice as sd

from audio.decoder import decode_audio


class AudioPlayer:
    """Plays decoded PCM audio through the system output device.

    Thread-safe — sounddevice callback runs on a separate thread.
    Controlled via play/pause/seek/volume methods.
    """

    def __init__(self) -> None:
        self._samples: np.ndarray | None = None
        self._sample_rate: int = 48000
        self._channels: int = 2
        self._position: int = 0  # Current sample offset
        self._volume: float = 1.0
        self._is_playing: bool = False
        self._stream: sd.OutputStream | None = None
        self._lock = threading.Lock()
        self._path: str | None = None

    @property
    def is_playing(self) -> bool:
        return self._is_playing

    @property
    def position(self) -> int:
        """Current playback position in samples."""
        return self._position

    @property
    def position_seconds(self) -> float:
        """Current playback position in seconds."""
        return self._position / self._sample_rate if self._sample_rate > 0 else 0.0

    @property
    def duration_seconds(self) -> float:
        """Total duration in seconds."""
        if self._samples is None:
            return 0.0
        return self._samples.shape[0] / self._sample_rate

    @property
    def volume(self) -> float:
        return self._volume

    @property
    def loaded(self) -> bool:
        return self._samples is not None

    def load(self, path: str) -> dict:
        """Decode audio from file and prepare for playback.

        Returns dict with ok, sample_rate, channels, duration_s, error.
        """
        self.stop()

        result = decode_audio(path)
        if not result["ok"]:
            return result

        self._samples = result["samples"]
        self._sample_rate = result["sample_rate"]
        self._channels = result["channels"]
        self._position = 0
        self._path = path

        return {
            "ok": True,
            "sample_rate": self._sample_rate,
            "channels": self._channels,
            "duration_s": result["duration_s"],
            "num_samples": self._samples.shape[0],
        }

    def play(self) -> bool:
        """Start or resume playback. Returns True if playback started."""
        if self._samples is None:
            return False

        with self._lock:
            if self._is_playing:
                return True

            if self._stream is None:
                self._stream = sd.OutputStream(
                    samplerate=self._sample_rate,
                    channels=self._channels,
                    dtype="float32",
                    callback=self._audio_callback,
                    blocksize=1024,
                )
            self._stream.start()
            self._is_playing = True
            return True

    def pause(self) -> bool:
        """Pause playback. Returns True if paused."""
        with self._lock:
            if not self._is_playing:
                return True
            if self._stream is not None:
                self._stream.stop()
            self._is_playing = False
            return True

    def stop(self) -> None:
        """Stop playback and reset position."""
        with self._lock:
            self._is_playing = False
            if self._stream is not None:
                self._stream.close()
                self._stream = None
            self._position = 0

    def seek(self, time_s: float) -> bool:
        """Seek to a position in seconds. Returns True if valid."""
        if self._samples is None:
            return False
        sample_pos = int(time_s * self._sample_rate)
        sample_pos = max(0, min(sample_pos, self._samples.shape[0]))
        self._position = sample_pos
        return True

    def set_volume(self, volume: float) -> None:
        """Set volume (0.0 to 1.0, clamped)."""
        self._volume = max(0.0, min(1.0, volume))

    def close(self) -> None:
        """Release all resources."""
        self.stop()
        self._samples = None
        self._path = None

    def _audio_callback(
        self,
        outdata: np.ndarray,
        frames: int,
        time_info: object,
        status: sd.CallbackFlags,
    ) -> None:
        """Sounddevice callback — runs on audio thread."""
        if self._samples is None or not self._is_playing:
            outdata.fill(0)
            return

        pos = self._position
        end = pos + frames
        total = self._samples.shape[0]

        if pos >= total:
            outdata.fill(0)
            self._is_playing = False
            return

        if end > total:
            # Partial fill at end of audio
            available = total - pos
            outdata[:available] = self._samples[pos:total] * self._volume
            outdata[available:] = 0
            self._position = total
            self._is_playing = False
        else:
            outdata[:] = self._samples[pos:end] * self._volume
            self._position = end
