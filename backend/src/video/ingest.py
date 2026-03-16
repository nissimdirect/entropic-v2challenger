"""Fast video/image header probing."""

import logging
from pathlib import Path

import av

logger = logging.getLogger(__name__)

# Default duration for static images on the timeline (seconds)
IMAGE_DEFAULT_DURATION = 5.0


def probe(path: str) -> dict:
    """Probe video file for metadata. Fast — reads only headers."""
    try:
        container = av.open(path)
    except (av.error.FileNotFoundError, av.error.InvalidDataError) as e:
        logger.exception(f"Probe failed for {Path(path).name}")
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


def probe_image(path: str) -> dict:
    """Probe an image file for metadata. Returns dict matching probe() shape."""
    from PIL import Image

    from video.image_reader import MAX_IMAGE_DIMENSION

    try:
        img = Image.open(path)
    except Exception as e:
        logger.exception(f"Image probe failed for {Path(path).name}")
        return {"ok": False, "error": f"Failed to open image: {type(e).__name__}"}

    width, height = img.size
    img_format = img.format or "unknown"
    img.close()

    if width > MAX_IMAGE_DIMENSION or height > MAX_IMAGE_DIMENSION:
        return {
            "ok": False,
            "error": f"Image dimensions {width}x{height} exceed maximum "
            f"{MAX_IMAGE_DIMENSION}x{MAX_IMAGE_DIMENSION}",
        }

    return {
        "ok": True,
        "width": width,
        "height": height,
        "fps": 0,
        "duration_s": IMAGE_DEFAULT_DURATION,
        "codec": img_format.lower(),
        "has_audio": False,
        "frame_count": 0,
    }
