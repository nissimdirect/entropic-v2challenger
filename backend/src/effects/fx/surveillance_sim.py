"""Surveillance Sim — surveillance camera, night vision, and infrared thermal modes."""

import numpy as np

from engine.determinism import make_rng

EFFECT_ID = "fx.surveillance_sim"
EFFECT_NAME = "Surveillance Sim"
EFFECT_CATEGORY = "surveillance"

PARAMS: dict = {
    "mode": {
        "type": "choice",
        "options": ["surveillance_cam", "night_vision", "infrared_thermal"],
        "default": "surveillance_cam",
        "label": "Mode",
        "description": "Surveillance simulation mode",
    },
    "timestamp_overlay": {
        "type": "choice",
        "options": ["true", "false"],
        "default": "true",
        "label": "Timestamp",
        "description": "Show timestamp overlay (surveillance mode)",
    },
    "interlace": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.3,
        "label": "Interlace",
        "curve": "linear",
        "unit": "%",
        "description": "Interlacing artifact strength (surveillance mode)",
    },
    "vignette": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.5,
        "label": "Vignette",
        "curve": "linear",
        "unit": "%",
        "description": "Edge darkening (surveillance mode)",
    },
    "gain": {
        "type": "float",
        "min": 1.0,
        "max": 5.0,
        "default": 2.0,
        "label": "Gain",
        "curve": "linear",
        "unit": "x",
        "description": "Light amplification (night vision mode)",
    },
    "bloom": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.3,
        "label": "Bloom",
        "curve": "linear",
        "unit": "%",
        "description": "Bright area glow (night vision mode)",
    },
    "tube_distortion": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.2,
        "label": "Tube Distortion",
        "curve": "linear",
        "unit": "%",
        "description": "Image intensifier tube noise (night vision mode)",
    },
    "temperature_range": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.5,
        "label": "Temp Range",
        "curve": "linear",
        "unit": "%",
        "description": "Temperature sensitivity (infrared mode)",
    },
    "palette": {
        "type": "choice",
        "options": ["iron", "rainbow", "gray"],
        "default": "iron",
        "label": "Palette",
        "description": "Thermal color palette (infrared mode)",
    },
}


def _apply_surveillance(
    rgb: np.ndarray, params: dict, rng: np.random.Generator, frame_index: int
) -> np.ndarray:
    """Desaturated green-tint CCTV look with scanlines."""
    h, w = rgb.shape[:2]
    interlace = max(0.0, min(1.0, float(params.get("interlace", 0.3))))
    vignette_amt = max(0.0, min(1.0, float(params.get("vignette", 0.5))))
    show_ts = str(params.get("timestamp_overlay", "true")) == "true"

    # Desaturate and green-tint
    luma = (
        0.299 * rgb[:, :, 0].astype(np.float32)
        + 0.587 * rgb[:, :, 1].astype(np.float32)
        + 0.114 * rgb[:, :, 2].astype(np.float32)
    )
    result = np.zeros((h, w, 3), dtype=np.float32)
    result[:, :, 0] = luma * 0.7  # Slightly less red
    result[:, :, 1] = luma * 0.9  # More green
    result[:, :, 2] = luma * 0.6  # Less blue

    # Interlacing: darken every other row
    if interlace > 0:
        scanline_mask = np.ones((h, 1, 1), dtype=np.float32)
        offset = frame_index % 2
        scanline_mask[offset::2] = 1.0 - interlace * 0.5
        result *= scanline_mask

    # Vignette
    if vignette_amt > 0:
        y_coords = np.linspace(-1, 1, h).reshape(-1, 1)
        x_coords = np.linspace(-1, 1, w).reshape(1, -1)
        dist = np.sqrt(y_coords**2 + x_coords**2)
        vig = 1.0 - np.clip(dist * vignette_amt, 0, 1)
        result *= vig[:, :, np.newaxis]

    # Noise
    noise = rng.normal(0, 8, (h, w, 1)).astype(np.float32)
    result += noise

    # Timestamp overlay: white rectangle in top-left
    if show_ts:
        ts_h, ts_w = min(16, h), min(120, w)
        result[:ts_h, :ts_w, :] = np.clip(result[:ts_h, :ts_w, :] * 0.3 + 180, 0, 255)

    return result


def _apply_night_vision(
    rgb: np.ndarray, params: dict, rng: np.random.Generator
) -> np.ndarray:
    """Green phosphor night vision intensifier look."""
    h, w = rgb.shape[:2]
    gain = max(1.0, min(5.0, float(params.get("gain", 2.0))))
    bloom_amt = max(0.0, min(1.0, float(params.get("bloom", 0.3))))
    tube = max(0.0, min(1.0, float(params.get("tube_distortion", 0.2))))

    # Luminance with gain
    luma = (
        0.299 * rgb[:, :, 0].astype(np.float32)
        + 0.587 * rgb[:, :, 1].astype(np.float32)
        + 0.114 * rgb[:, :, 2].astype(np.float32)
    ) * gain

    # Green phosphor LUT
    result = np.zeros((h, w, 3), dtype=np.float32)
    result[:, :, 0] = luma * 0.1  # Minimal red
    result[:, :, 1] = luma * 1.0  # Full green
    result[:, :, 2] = luma * 0.1  # Minimal blue

    # Bloom: add blurred bright areas
    if bloom_amt > 0:
        bright_mask = np.clip((luma - 180) / 75.0, 0, 1)
        bloom_layer = bright_mask * bloom_amt * 80
        result[:, :, 1] += bloom_layer

    # Tube noise (intensifier grain)
    if tube > 0:
        noise = rng.normal(0, tube * 25, (h, w)).astype(np.float32)
        result[:, :, 0] += noise * 0.1
        result[:, :, 1] += noise
        result[:, :, 2] += noise * 0.1

    return result


def _iron_palette(t: np.ndarray) -> np.ndarray:
    """Iron thermal palette: black -> purple -> red -> yellow -> white."""
    h, w = t.shape
    result = np.zeros((h, w, 3), dtype=np.float32)
    result[:, :, 0] = np.clip(t * 3.0, 0, 1) * 255  # Red ramps early
    result[:, :, 1] = np.clip((t - 0.4) * 2.5, 0, 1) * 255  # Green mid
    result[:, :, 2] = np.clip((t - 0.7) * 3.3, 0, 1) * 255  # Blue late
    return result


def _rainbow_palette(t: np.ndarray) -> np.ndarray:
    """Rainbow thermal palette."""
    h, w = t.shape
    result = np.zeros((h, w, 3), dtype=np.float32)
    # Approximate rainbow: blue -> cyan -> green -> yellow -> red
    result[:, :, 0] = np.clip(np.abs(t * 3.0 - 1.5) - 0.5, 0, 1) * 255
    result[:, :, 1] = np.clip(1.0 - np.abs(t * 3.0 - 1.5), 0, 1) * 255
    result[:, :, 2] = np.clip(1.0 - (t * 2.0), 0, 1) * 255
    return result


def _apply_infrared(
    rgb: np.ndarray, params: dict, rng: np.random.Generator
) -> np.ndarray:
    """Infrared thermal camera simulation."""
    h, w = rgb.shape[:2]
    temp_range = max(0.0, min(1.0, float(params.get("temperature_range", 0.5))))
    palette = str(params.get("palette", "iron"))

    # Convert to grayscale "temperature"
    luma = (
        0.299 * rgb[:, :, 0].astype(np.float32)
        + 0.587 * rgb[:, :, 1].astype(np.float32)
        + 0.114 * rgb[:, :, 2].astype(np.float32)
    ) / 255.0

    # Adjust temperature range (contrast around midpoint)
    mid = 0.5
    t = mid + (luma - mid) * (1.0 + temp_range * 3.0)
    t = np.clip(t, 0.0, 1.0)

    # Apply thermal palette
    if palette == "rainbow":
        result = _rainbow_palette(t)
    elif palette == "gray":
        g = t * 255
        result = np.stack([g, g, g], axis=2)
    else:  # iron
        result = _iron_palette(t)

    # Thermal noise
    noise = rng.normal(0, 3, (h, w, 1)).astype(np.float32)
    result += noise

    return result


def apply(
    frame: np.ndarray,
    params: dict,
    state_in: dict | None = None,
    *,
    frame_index: int,
    seed: int,
    resolution: tuple[int, int],
) -> tuple[np.ndarray, dict | None]:
    """Simulate surveillance, night vision, or infrared thermal camera."""
    mode = str(params.get("mode", "surveillance_cam"))
    rng = make_rng(seed + frame_index)

    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]

    if mode == "night_vision":
        result = _apply_night_vision(rgb, params, rng)
    elif mode == "infrared_thermal":
        result = _apply_infrared(rgb, params, rng)
    else:  # surveillance_cam
        result = _apply_surveillance(rgb, params, rng, frame_index)

    result_rgb = np.clip(result, 0, 255).astype(np.uint8)
    return np.concatenate([result_rgb, alpha], axis=2), None
