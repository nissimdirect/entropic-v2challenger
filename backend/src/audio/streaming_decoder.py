"""Streaming audio decoder for the multi-clip mixer.

The legacy decode_audio() function in decoder.py reads a whole file into RAM
as float32 (1-hour stereo 48kHz = ~1.4 GB). Unsustainable when N clips are
active simultaneously. StreamingDecoder opens a PyAV container once, decodes
only what the mixer asks for, and resamples + downmixes on the fly.

One instance per active clip. Destroy when clip leaves the lookahead window.
"""

from __future__ import annotations

import threading

import av
import numpy as np

PROJECT_SAMPLE_RATE = 48000
PROJECT_CHANNELS = 2  # stereo output


class StreamingDecoder:
    """Lazy, seekable audio decoder that yields stereo float32 at project rate.

    Use from a single thread per instance (PyAV containers are NOT re-entrant).
    Multiple instances on separate threads is safe.
    """

    def __init__(
        self,
        path: str,
        project_rate: int = PROJECT_SAMPLE_RATE,
    ) -> None:
        self._path = path
        self._project_rate = int(project_rate)
        self._lock = threading.Lock()
        self._container: av.container.InputContainer | None = None
        self._stream: av.audio.stream.AudioStream | None = None
        self._resampler: av.AudioResampler | None = None
        # Buffer of float32 stereo samples ready to hand out. Shape: (N, 2).
        self._buffer: np.ndarray = np.zeros((0, PROJECT_CHANNELS), dtype=np.float32)
        # Timeline offset (seconds) corresponding to buffer[0].
        self._buffer_start_s: float = 0.0
        # EOF marker: once set, further decode() calls return empty.
        self._exhausted = False
        self._open()

    # --- Lifecycle ---

    def _open(self) -> None:
        """Open the PyAV container and build the resampler. Idempotent."""
        with self._lock:
            if self._container is not None:
                return
            self._container = av.open(self._path)
            streams = self._container.streams.audio
            if not streams:
                self._container.close()
                self._container = None
                raise ValueError(f"No audio stream in {self._path}")
            self._stream = streams[0]
            # Downmix to stereo + resample to project_rate in a single pass
            self._resampler = av.AudioResampler(
                format="flt",
                layout="stereo",
                rate=self._project_rate,
            )
            self._buffer = np.zeros((0, PROJECT_CHANNELS), dtype=np.float32)
            self._buffer_start_s = 0.0
            self._exhausted = False

    def close(self) -> None:
        """Release the container. Idempotent — safe to call multiple times."""
        with self._lock:
            if self._container is not None:
                try:
                    self._container.close()
                except Exception:
                    pass
                self._container = None
            self._stream = None
            self._resampler = None
            self._buffer = np.zeros((0, PROJECT_CHANNELS), dtype=np.float32)
            self._buffer_start_s = 0.0
            self._exhausted = True

    def __enter__(self) -> "StreamingDecoder":
        return self

    def __exit__(self, *args: object) -> None:
        self.close()

    # --- Properties ---

    @property
    def path(self) -> str:
        return self._path

    @property
    def project_rate(self) -> int:
        return self._project_rate

    @property
    def is_closed(self) -> bool:
        return self._container is None

    # --- Read / seek ---

    def read(self, offset_s: float, n_samples: int) -> np.ndarray:
        """Return `n_samples` of stereo float32 starting at `offset_s`.

        Shape: (n_samples, 2). If the file ends before n_samples are available,
        trailing samples are silence (zeros).

        Seeking backwards or large forward jumps may require a PyAV seek +
        resampler flush, which is O(nearest-keyframe). Callers that scrub
        rapidly should throttle.
        """
        if self.is_closed:
            return np.zeros((n_samples, PROJECT_CHANNELS), dtype=np.float32)
        if not np.isfinite(offset_s) or offset_s < 0:
            offset_s = 0.0
        n_samples = max(0, int(n_samples))
        if n_samples == 0:
            return np.zeros((0, PROJECT_CHANNELS), dtype=np.float32)

        with self._lock:
            # Determine whether we need to seek.
            buf_end_s = self._buffer_start_s + (
                self._buffer.shape[0] / self._project_rate
            )
            # Acceptable: buffer covers [offset_s, offset_s + n/rate).
            needed_end_s = offset_s + n_samples / self._project_rate
            if offset_s < self._buffer_start_s or offset_s > buf_end_s + 0.05:
                # Need to seek. Drop buffer + reseek container.
                self._seek_locked(offset_s)
            # Decode until buffer covers the needed range or EOF.
            while (
                not self._exhausted
                and (self._buffer_start_s + self._buffer.shape[0] / self._project_rate)
                < needed_end_s
            ):
                self._decode_one_packet_locked()
            # Extract requested window from buffer.
            return self._extract_locked(offset_s, n_samples)

    def _seek_locked(self, offset_s: float) -> None:
        """Reset decoder state and seek container to ~offset_s. Caller holds lock."""
        assert self._container is not None and self._stream is not None
        # PyAV seek uses stream's time_base; use microsecond granularity.
        stream = self._stream
        tb = stream.time_base
        if tb is None:
            target_pts = 0
        else:
            target_pts = int(offset_s / float(tb))
        try:
            self._container.seek(
                target_pts, stream=stream, backward=True, any_frame=False
            )
        except av.error.FFmpegError:
            # Seek failed — rewind to start
            try:
                self._container.seek(0, stream=stream)
            except Exception:
                pass
        # Drop resampler state (new resampler to flush any pending PCM)
        self._resampler = av.AudioResampler(
            format="flt",
            layout="stereo",
            rate=self._project_rate,
        )
        self._buffer = np.zeros((0, PROJECT_CHANNELS), dtype=np.float32)
        self._buffer_start_s = max(0.0, offset_s)
        self._exhausted = False

    def _decode_one_packet_locked(self) -> None:
        """Decode one audio packet, resample, append to buffer. Caller holds lock."""
        assert self._container is not None and self._stream is not None
        assert self._resampler is not None
        try:
            packet = next(self._container.demux(self._stream))
        except StopIteration:
            self._exhausted = True
            return
        except Exception:
            self._exhausted = True
            return
        try:
            for frame in packet.decode():
                self._append_resampled_locked(frame)
        except Exception:
            self._exhausted = True

    def _append_resampled_locked(self, frame: av.audio.frame.AudioFrame) -> None:
        """Resample an AudioFrame to project format and append to buffer."""
        assert self._resampler is not None
        for resampled in self._resampler.resample(frame):
            arr = resampled.to_ndarray()  # planar: shape (2, samples) for stereo
            if arr.ndim == 2 and arr.shape[0] == PROJECT_CHANNELS:
                arr = arr.T  # (samples, 2)
            elif arr.ndim == 2 and arr.shape[0] == 1:
                arr = arr.reshape(-1, PROJECT_CHANNELS)
            elif arr.ndim == 1:
                arr = arr.reshape(-1, PROJECT_CHANNELS)
            if arr.dtype != np.float32:
                arr = arr.astype(np.float32)
            self._buffer = np.concatenate([self._buffer, arr], axis=0)

    def _extract_locked(self, offset_s: float, n_samples: int) -> np.ndarray:
        """Slice the requested window out of the buffer. Caller holds lock."""
        buf_len = self._buffer.shape[0]
        if buf_len == 0:
            return np.zeros((n_samples, PROJECT_CHANNELS), dtype=np.float32)
        start_idx = int(round((offset_s - self._buffer_start_s) * self._project_rate))
        start_idx = max(0, start_idx)
        end_idx = start_idx + n_samples
        if start_idx >= buf_len:
            return np.zeros((n_samples, PROJECT_CHANNELS), dtype=np.float32)
        if end_idx <= buf_len:
            out = self._buffer[start_idx:end_idx].copy()
        else:
            # Partial read: fill what we have, silence the rest
            out = np.zeros((n_samples, PROJECT_CHANNELS), dtype=np.float32)
            avail = buf_len - start_idx
            out[:avail] = self._buffer[start_idx:buf_len]
        # Trim buffer: keep 0.5s before current read for small back-scrubs
        keep_start_s = max(0.0, offset_s - 0.5)
        keep_idx = int((keep_start_s - self._buffer_start_s) * self._project_rate)
        if keep_idx > 0 and keep_idx < buf_len:
            self._buffer = self._buffer[keep_idx:]
            self._buffer_start_s += keep_idx / self._project_rate
        return out
