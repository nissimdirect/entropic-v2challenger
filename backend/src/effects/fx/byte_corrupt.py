"""Byte Corrupt — JPEG data bending creates authentic codec-level glitch artifacts."""

import io

import numpy as np
from PIL import Image

from engine.determinism import make_rng

EFFECT_ID = "fx.byte_corrupt"
EFFECT_NAME = "Byte Corrupt"
EFFECT_CATEGORY = "destruction"

PARAMS: dict = {
    "amount": {
        "type": "int",
        "min": 1,
        "max": 2000,
        "default": 100,
        "label": "Amount",
        "curve": "linear",
        "unit": "count",
        "description": "Number of bytes to corrupt in JPEG data",
    },
    "jpeg_quality": {
        "type": "int",
        "min": 1,
        "max": 95,
        "default": 40,
        "label": "JPEG Quality",
        "curve": "linear",
        "unit": "%",
        "description": "Intermediate JPEG quality — lower = more base artifacts",
    },
}


def apply(
    frame: np.ndarray,
    params: dict,
    state_in: dict | None = None,
    *,
    frame_index: int,
    seed: int,
    resolution: tuple[int, int],
) -> tuple[np.ndarray, dict | None]:
    """Corrupt JPEG data bytes to create authentic glitch artifacts."""
    amount = max(1, min(2000, int(params.get("amount", 100))))
    jpeg_quality = max(1, min(95, int(params.get("jpeg_quality", 40))))
    rng = make_rng(seed)

    # Work on RGB only (PIL doesn't handle RGBA JPEG)
    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]
    img = Image.fromarray(rgb)

    # Save to memory buffer as JPEG
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=jpeg_quality)
    data = bytearray(buf.getvalue())

    if len(data) < 100:
        return frame.copy(), None

    # Get the JPEG-compressed version first
    buf_clean = io.BytesIO(bytes(data))
    jpeg_frame = np.array(Image.open(buf_clean).convert("RGB"))

    # Find SOS marker — corruption after this affects image data
    sos_pos = bytes(data).find(b"\xff\xda")
    safe_start = max(20, sos_pos + 12) if sos_pos > 0 else 20
    safe_end = len(data) - 2

    # Try byte corruption with multiple attempts
    for attempt in range(3):
        corrupted_data = bytearray(data)
        corrupt_amount = amount * (attempt + 1)

        for _ in range(corrupt_amount):
            pos = int(rng.integers(safe_start, safe_end))
            strategy = int(rng.integers(0, 5))
            if strategy == 0:
                corrupted_data[pos] = int(rng.integers(0, 256))
            elif strategy == 1:
                corrupted_data[pos] = corrupted_data[pos] ^ 0xFF
            elif strategy == 2:
                corrupted_data[pos] = 0
            elif strategy == 3:
                corrupted_data[pos] = 255
            else:
                if pos + 1 < safe_end:
                    corrupted_data[pos], corrupted_data[pos + 1] = (
                        corrupted_data[pos + 1],
                        corrupted_data[pos],
                    )

        try:
            buf2 = io.BytesIO(bytes(corrupted_data))
            corrupted = Image.open(buf2)
            corrupted.load()
            result_rgb = np.array(corrupted.convert("RGB"))
            if result_rgb.shape[:2] == frame.shape[:2]:
                output = np.concatenate([result_rgb, alpha], axis=2)
                return output, None
        except Exception:
            continue

    # Fallback: return JPEG-compressed version
    if jpeg_frame.shape[:2] == frame.shape[:2]:
        output = np.concatenate([jpeg_frame, alpha], axis=2)
        return output, None
    return frame.copy(), None
