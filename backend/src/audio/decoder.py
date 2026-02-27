"""Audio decoding via PyAV — extracts PCM float32 from video containers."""

import av
import numpy as np


def decode_audio(
    path: str, start_s: float = 0.0, duration_s: float | None = None
) -> dict:
    """Decode audio from a video/audio container to PCM float32.

    Args:
        path: Path to the media file.
        start_s: Start time in seconds (0.0 = beginning).
        duration_s: Duration to decode in seconds (None = entire stream).

    Returns:
        dict with keys:
            ok: bool
            samples: np.ndarray of shape (num_samples, channels) float32, or None on error
            sample_rate: int
            channels: int
            duration_s: float (actual decoded duration)
            error: str (only if ok=False)
    """
    try:
        container = av.open(path)
    except (av.error.FileNotFoundError, av.error.InvalidDataError) as e:
        return {"ok": False, "error": str(e)}

    if not container.streams.audio:
        container.close()
        return {"ok": False, "error": "No audio stream found"}

    stream = container.streams.audio[0]
    sample_rate = stream.rate
    channels = stream.channels

    # Seek if start_s > 0
    if start_s > 0:
        # PyAV seek uses the stream's time_base
        target_pts = int(start_s / stream.time_base)
        container.seek(target_pts, stream=stream)

    # Compute end time for duration limiting
    end_s = start_s + duration_s if duration_s is not None else float("inf")

    chunks: list[np.ndarray] = []
    total_samples = 0

    for frame in container.decode(audio=0):
        # Compute frame time
        if frame.pts is not None:
            frame_time = float(frame.pts * stream.time_base)
        else:
            frame_time = total_samples / sample_rate + start_s

        # Stop if we've passed end time
        if frame_time >= end_s:
            break

        # Convert to float32 planar → interleaved
        arr = frame.to_ndarray()  # shape: (channels, samples) float32 or similar

        # PyAV returns (channels, samples) for planar formats, (1, samples*channels) for packed
        if arr.ndim == 2 and arr.shape[0] == channels:
            # Planar: transpose to (samples, channels)
            arr = arr.T
        elif arr.ndim == 2 and arr.shape[0] == 1:
            # Packed: reshape to (samples, channels)
            arr = arr.reshape(-1, channels)
        else:
            arr = arr.reshape(-1, channels)

        # Ensure float32
        if arr.dtype != np.float32:
            if np.issubdtype(arr.dtype, np.integer):
                info = np.iinfo(arr.dtype)
                arr = arr.astype(np.float32) / max(abs(info.min), abs(info.max))
            else:
                arr = arr.astype(np.float32)

        chunks.append(arr)
        total_samples += arr.shape[0]

    container.close()

    if not chunks:
        return {
            "ok": True,
            "samples": np.empty((0, channels), dtype=np.float32),
            "sample_rate": sample_rate,
            "channels": channels,
            "duration_s": 0.0,
        }

    samples = np.concatenate(chunks, axis=0)
    decoded_duration = samples.shape[0] / sample_rate

    return {
        "ok": True,
        "samples": samples,
        "sample_rate": sample_rate,
        "channels": channels,
        "duration_s": round(decoded_duration, 6),
    }
