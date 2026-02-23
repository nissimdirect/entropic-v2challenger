"""MJPEG encoding/decoding for shared memory transport."""

import io
import numpy as np
from PIL import Image

DEFAULT_SLOT_SIZE = 4 * 1024 * 1024  # 4MB
QUALITY_FALLBACK_CHAIN = (95, 85, 75, 65, 50)


def encode_mjpeg(frame: np.ndarray, quality: int = 95) -> bytes:
    """Encode RGBA frame to MJPEG bytes. Drops alpha (JPEG is RGB only)."""
    img = Image.fromarray(frame[:, :, :3])  # RGBA → RGB
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality)
    return buf.getvalue()


def encode_mjpeg_fit(
    frame: np.ndarray,
    max_bytes: int = DEFAULT_SLOT_SIZE,
    quality_chain: tuple[int, ...] = QUALITY_FALLBACK_CHAIN,
) -> tuple[bytes, int]:
    """Encode RGBA frame, reducing quality until it fits in max_bytes.

    Tries each quality in quality_chain (default: 95, 85, 75, 65, 50).
    Returns (jpeg_bytes, quality_used).
    Raises ValueError if the frame exceeds max_bytes at the lowest quality.
    """
    if not quality_chain:
        raise ValueError("quality_chain must not be empty")
    data = b""
    for q in quality_chain:
        data = encode_mjpeg(frame, quality=q)
        if len(data) <= max_bytes:
            return data, q
    raise ValueError(
        f"MJPEG frame ({len(data)} bytes) exceeds {max_bytes} bytes "
        f"even at quality {quality_chain[-1]}"
    )


def decode_mjpeg(data: bytes) -> np.ndarray:
    """Decode MJPEG bytes back to RGB numpy array."""
    img = Image.open(io.BytesIO(data))
    return np.array(img)
