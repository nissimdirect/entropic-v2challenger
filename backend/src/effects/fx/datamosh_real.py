"""Datamosh Real — JPEG byte corruption simulating P-frame artifacts."""

import io

import numpy as np
from PIL import Image

from engine.determinism import make_rng

EFFECT_ID = "fx.datamosh_real"
EFFECT_NAME = "Datamosh Real"
EFFECT_CATEGORY = "destruction"

PARAMS: dict = {
    "intensity": {
        "type": "float",
        "min": 0.1,
        "max": 5.0,
        "default": 1.0,
        "label": "Intensity",
        "curve": "exponential",
        "unit": "x",
        "description": "Controls JPEG quality degradation (higher = worse quality)",
    },
    "corruption": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.3,
        "label": "Corruption",
        "curve": "linear",
        "unit": "%",
        "description": "Fraction of encoded bytes to corrupt",
    },
}

# JPEG header markers to avoid corrupting
_JPEG_HEADER_SIZE = 600


def apply(
    frame: np.ndarray,
    params: dict,
    state_in: dict | None = None,
    *,
    frame_index: int,
    seed: int,
    resolution: tuple[int, int],
) -> tuple[np.ndarray, dict | None]:
    """Encode to JPEG, corrupt bytes, decode back."""
    intensity = max(0.1, min(5.0, float(params.get("intensity", 1.0))))
    corruption = max(0.0, min(1.0, float(params.get("corruption", 0.3))))

    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]
    rng = make_rng(seed + frame_index)

    # JPEG quality inversely proportional to intensity
    quality = max(1, min(95, int(60 / intensity)))

    # Encode to JPEG
    img = Image.fromarray(rgb)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality)
    data = bytearray(buf.getvalue())

    # Corrupt bytes in the scan data (skip header)
    if corruption > 0 and len(data) > _JPEG_HEADER_SIZE + 10:
        scan_start = _JPEG_HEADER_SIZE
        scan_end = len(data) - 2  # Preserve EOI marker
        scan_len = scan_end - scan_start
        num_corrupt = max(1, int(scan_len * corruption * 0.1))

        positions = rng.integers(scan_start, scan_end, size=num_corrupt)
        replacements = rng.integers(0, 256, size=num_corrupt, dtype=np.uint8)
        for pos, val in zip(positions, replacements):
            data[int(pos)] = int(val)

    # Decode back
    try:
        buf2 = io.BytesIO(bytes(data))
        result_img = Image.open(buf2)
        result_rgb = np.array(result_img.convert("RGB"))
        # Handle potential size mismatch from corruption
        if result_rgb.shape[:2] != (frame.shape[0], frame.shape[1]):
            import cv2

            result_rgb = cv2.resize(result_rgb, (frame.shape[1], frame.shape[0]))
    except Exception:
        # If decode fails due to corruption, fall back to heavy JPEG compression only
        buf3 = io.BytesIO()
        img.save(buf3, format="JPEG", quality=max(1, quality))
        buf3.seek(0)
        result_rgb = np.array(Image.open(buf3).convert("RGB"))

    return np.concatenate([result_rgb, alpha], axis=2), None
