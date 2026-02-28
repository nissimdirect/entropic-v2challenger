"""Fast video header probing."""

import logging

import av

logger = logging.getLogger(__name__)


def probe(path: str) -> dict:
    """Probe video file for metadata. Fast — reads only headers."""
    try:
        container = av.open(path)
    except (av.error.FileNotFoundError, av.error.InvalidDataError) as e:
        logger.exception(f"Probe failed for {path}")
        return {"ok": False, "error": f"Failed to open video: {type(e).__name__}"}

    if not container.streams.video:
        container.close()
        return {"ok": False, "error": "No video stream found"}

    stream = container.streams.video[0]
    has_audio = len(container.streams.audio) > 0
    result = {
        "ok": True,
        "width": stream.width,
        "height": stream.height,
        "fps": float(stream.average_rate) if stream.average_rate else 0.0,
        "duration_s": float(container.duration / av.time_base)
        if container.duration
        else 0.0,
        "codec": stream.codec_context.name,
        "has_audio": has_audio,
        "frame_count": stream.frames or 0,
    }

    if has_audio:
        audio_stream = container.streams.audio[0]
        result["audio"] = {
            "sample_rate": audio_stream.rate,
            "channels": audio_stream.channels,
            "codec": audio_stream.codec_context.name,
            "duration_s": float(audio_stream.duration * audio_stream.time_base)
            if audio_stream.duration
            else result["duration_s"],
        }

    container.close()
    return result
