"""Fast video header probing."""

import av


def probe(path: str) -> dict:
    """Probe video file for metadata. Fast — reads only headers."""
    try:
        container = av.open(path)
    except (av.error.FileNotFoundError, av.error.InvalidDataError) as e:
        return {"ok": False, "error": str(e)}

    if not container.streams.video:
        container.close()
        return {"ok": False, "error": "No video stream found"}

    stream = container.streams.video[0]
    result = {
        "ok": True,
        "width": stream.width,
        "height": stream.height,
        "fps": float(stream.average_rate) if stream.average_rate else 0.0,
        "duration_s": float(container.duration / av.time_base)
        if container.duration
        else 0.0,
        "codec": stream.codec_context.name,
        "has_audio": len(container.streams.audio) > 0,
        "frame_count": stream.frames or 0,
    }
    container.close()
    return result
