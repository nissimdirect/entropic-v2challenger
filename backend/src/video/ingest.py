"""Fast video/image header probing and thumbnail generation."""

import base64
import io
import logging
from pathlib import Path

import av
import cv2
import numpy as np

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
    fps = float(stream.average_rate) if stream.average_rate else 0.0
    if container.duration:
        duration_s = float(container.duration / av.time_base)
    else:
        duration_s = 0.0
    # MKV and some containers don't store frame count in headers —
    # fall back to duration * fps (same logic as VideoReader)
    frame_count = stream.frames or (int(duration_s * fps) if fps > 0 else 0)
    result = {
        "ok": True,
        "width": stream.width,
        "height": stream.height,
        "fps": fps,
        "duration_s": duration_s,
        "codec": stream.codec_context.name,
        "has_audio": has_audio,
        "frame_count": frame_count,
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


# -- Thumbnail generation --

# Limits
_MAX_THUMBNAIL_COUNT = 64
_THUMBNAIL_HEIGHT = 40
_THUMBNAIL_JPEG_QUALITY = 60


def generate_thumbnails(path: str, count: int = 8) -> dict:
    """Generate evenly-spaced thumbnail frames for a video clip.

    Returns {"ok": True, "thumbnails": [{"time": float, "data": str}, ...]}
    where *data* is a base64 JPEG string.
    """
    from video.reader import VideoReader

    count = max(1, min(int(count), _MAX_THUMBNAIL_COUNT))

    try:
        reader = VideoReader(path)
    except Exception as e:
        logger.exception(f"Thumbnail reader failed for {Path(path).name}")
        return {"ok": False, "error": f"Failed to open video: {type(e).__name__}"}

    try:
        if reader.duration <= 0 or reader.frame_count <= 0:
            return {"ok": False, "error": "Cannot generate thumbnails: zero duration"}

        # Compute evenly-spaced frame indices (exclude very last frame to
        # avoid seek-past-end in some containers)
        step = max(1, reader.frame_count // count)
        indices = [i * step for i in range(count) if i * step < reader.frame_count]

        thumbnails: list[dict] = []
        for frame_idx in indices:
            try:
                frame_rgba = reader.decode_frame(frame_idx)
            except (IndexError, StopIteration):
                # Some MKV containers have gaps — skip silently
                continue

            # RGBA -> RGB (JPEG has no alpha)
            frame_rgb = frame_rgba[:, :, :3]

            # Resize to thumbnail height, preserve aspect ratio
            h, w = frame_rgb.shape[:2]
            if h <= 0:
                continue
            new_h = _THUMBNAIL_HEIGHT
            new_w = max(1, int(w * new_h / h))
            thumb = cv2.resize(frame_rgb, (new_w, new_h), interpolation=cv2.INTER_AREA)

            # Encode to JPEG
            ok, buf = cv2.imencode(
                ".jpg",
                cv2.cvtColor(thumb, cv2.COLOR_RGB2BGR),
                [cv2.IMWRITE_JPEG_QUALITY, _THUMBNAIL_JPEG_QUALITY],
            )
            if not ok:
                continue

            time_s = round(frame_idx / reader.fps, 4)
            thumbnails.append(
                {
                    "time": time_s,
                    "data": base64.b64encode(buf.tobytes()).decode("ascii"),
                }
            )

        return {"ok": True, "thumbnails": thumbnails}
    finally:
        reader.close()
