"""MJPEG encoding/decoding for shared memory transport."""

import io
import numpy as np
from PIL import Image


def encode_mjpeg(frame: np.ndarray, quality: int = 95) -> bytes:
    """Encode RGBA frame to MJPEG bytes. Drops alpha (JPEG is RGB only)."""
    img = Image.fromarray(frame[:, :, :3])  # RGBA → RGB
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality)
    return buf.getvalue()


def decode_mjpeg(data: bytes) -> np.ndarray:
    """Decode MJPEG bytes back to RGB numpy array."""
    img = Image.open(io.BytesIO(data))
    return np.array(img)
