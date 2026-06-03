"""Grid Moire — true moiré via interference of two animated, distortable gratings.

Unlike a static grid overlay, this generates TWO periodic sinusoidal gratings at
slightly different frequency and/or angle; their product produces the beat
(moiré) pattern. The gratings can rotate, scroll infinitely (wrapping via sine
periodicity), drift (animated beating), warp (sinusoidal coordinate distortion),
and be phase-modulated by the source luma so the image itself contributes to the
interference. Pure function, deterministic in frame_index (no RNG state needed).
"""

import numpy as np

EFFECT_ID = "fx.grid_moire"
EFFECT_NAME = "Grid Moire"
EFFECT_CATEGORY = "codec_archaeology"

PARAMS: dict = {
    "grid_size": {
        "type": "int",
        "min": 2,
        "max": 128,
        "default": 8,
        "label": "Grid Size",
        "curve": "linear",
        "unit": "px",
        "description": "Base grating period (distance between lines)",
    },
    "angle": {
        "type": "float",
        "min": 0.0,
        "max": 360.0,
        "default": 0.0,
        "label": "Angle",
        "curve": "linear",
        "unit": "deg",
        "description": "Base rotation of the gratings",
    },
    "interference": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.7,
        "label": "Interference",
        "curve": "linear",
        "unit": "",
        "description": "0 = single grid overlay, 1 = full two-grid moiré beat",
    },
    "freq_ratio": {
        "type": "float",
        "min": 0.5,
        "max": 2.0,
        "default": 1.08,
        "label": "Freq Ratio",
        "curve": "linear",
        "unit": "x",
        "description": "Second grating period = grid_size × this. Small offsets (≈1.05) make slow, large moiré fringes.",
    },
    "angle_offset": {
        "type": "float",
        "min": 0.0,
        "max": 45.0,
        "default": 6.0,
        "label": "Angle Offset",
        "curve": "linear",
        "unit": "deg",
        "description": "Angle of the second grating relative to the first — angular moiré",
    },
    "sharpness": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.2,
        "label": "Sharpness",
        "curve": "linear",
        "unit": "",
        "description": "0 = smooth sine gratings, 1 = hard square grid",
    },
    "rotation_speed": {
        "type": "float",
        "min": -10.0,
        "max": 10.0,
        "default": 0.0,
        "label": "Rotation",
        "curve": "linear",
        "unit": "°/f",
        "description": "Spin the gratings over time (degrees per frame)",
    },
    "scroll_x": {
        "type": "float",
        "min": -20.0,
        "max": 20.0,
        "default": 0.0,
        "label": "Scroll X",
        "curve": "linear",
        "unit": "px/f",
        "description": "Infinite horizontal scroll (wraps seamlessly)",
    },
    "scroll_y": {
        "type": "float",
        "min": -20.0,
        "max": 20.0,
        "default": 0.0,
        "label": "Scroll Y",
        "curve": "linear",
        "unit": "px/f",
        "description": "Infinite vertical scroll (wraps seamlessly)",
    },
    "drift": {
        "type": "float",
        "min": 0.0,
        "max": 5.0,
        "default": 0.0,
        "label": "Drift",
        "curve": "linear",
        "unit": "px/f",
        "description": "Phase drift between the two gratings — animates the moiré beating in place",
    },
    "warp": {
        "type": "float",
        "min": 0.0,
        "max": 40.0,
        "default": 0.0,
        "label": "Warp",
        "curve": "linear",
        "unit": "px",
        "description": "Sinusoidal coordinate distortion — curves the gratings (and the moiré)",
    },
    "warp_freq": {
        "type": "float",
        "min": 0.5,
        "max": 10.0,
        "default": 2.0,
        "label": "Warp Freq",
        "curve": "linear",
        "unit": "cyc",
        "description": "Number of warp wave cycles across the frame",
    },
    "source_coupling": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.0,
        "label": "Source Couple",
        "curve": "linear",
        "unit": "",
        "description": "Image luma modulates grating phase — the image itself bends the moiré",
    },
    "opacity": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.6,
        "label": "Mix",
        "curve": "linear",
        "unit": "",
        "description": "Blend of the moiré pattern over the source",
    },
}


def _clampf(v, lo, hi, default):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return default
    if not np.isfinite(f):
        return default
    return max(lo, min(hi, f))


def _grating(coord: np.ndarray, period: float, sharpness: float) -> np.ndarray:
    """1-D sinusoidal grating in [0,1] along `coord`, optionally sharpened toward square."""
    s = 0.5 + 0.5 * np.sin((2.0 * np.pi / period) * coord)
    if sharpness > 0.0:
        # Push the sine toward a hard square wave by steep contrast around 0.5.
        k = 1.0 + sharpness * 24.0
        s = 1.0 / (1.0 + np.exp(-k * (s - 0.5)))
    return s


def apply(
    frame: np.ndarray,
    params: dict,
    state_in: dict | None = None,
    *,
    frame_index: int,
    seed: int,
    resolution: tuple[int, int],
) -> tuple[np.ndarray, dict | None]:
    """Render an interference moiré from two animated gratings and blend over the frame."""
    grid_size = int(_clampf(params.get("grid_size", 8), 2, 128, 8))
    angle = _clampf(params.get("angle", 0.0), 0.0, 360.0, 0.0)
    interference = _clampf(params.get("interference", 0.7), 0.0, 1.0, 0.7)
    freq_ratio = _clampf(params.get("freq_ratio", 1.08), 0.5, 2.0, 1.08)
    angle_offset = _clampf(params.get("angle_offset", 6.0), 0.0, 45.0, 6.0)
    sharpness = _clampf(params.get("sharpness", 0.2), 0.0, 1.0, 0.2)
    rotation_speed = _clampf(params.get("rotation_speed", 0.0), -10.0, 10.0, 0.0)
    scroll_x = _clampf(params.get("scroll_x", 0.0), -20.0, 20.0, 0.0)
    scroll_y = _clampf(params.get("scroll_y", 0.0), -20.0, 20.0, 0.0)
    drift = _clampf(params.get("drift", 0.0), 0.0, 5.0, 0.0)
    warp = _clampf(params.get("warp", 0.0), 0.0, 40.0, 0.0)
    warp_freq = _clampf(params.get("warp_freq", 2.0), 0.5, 10.0, 2.0)
    source_coupling = _clampf(params.get("source_coupling", 0.0), 0.0, 1.0, 0.0)
    opacity = _clampf(params.get("opacity", 0.6), 0.0, 1.0, 0.6)

    h, w = frame.shape[:2]
    rgb = frame[:, :, :3].astype(np.float32)
    alpha = frame[:, :, 3:4]

    fi = float(frame_index)
    cx, cy = w / 2.0, h / 2.0
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    xc = xx - cx + scroll_x * fi
    yc = yy - cy + scroll_y * fi

    # Sinusoidal coordinate warp (curves the gratings → curved moiré fringes).
    if warp > 0.0:
        kx = 2.0 * np.pi * warp_freq / max(1.0, h)
        ky = 2.0 * np.pi * warp_freq / max(1.0, w)
        xc = xc + warp * np.sin(ky * (yy - cy))
        yc = yc + warp * np.sin(kx * (xx - cx))

    # Source luma modulates grating phase — the image contributes to the interference.
    if source_coupling > 0.0:
        luma = rgb.mean(axis=2)
        phase = source_coupling * (luma / 255.0) * grid_size
        xc = xc + phase
        yc = yc + phase

    # Two gratings: A at `angle`, B at `angle + angle_offset`, both spun by rotation_speed.
    a1 = np.radians(angle + rotation_speed * fi)
    a2 = np.radians(angle + angle_offset + rotation_speed * fi)
    drift_off = drift * fi  # phase drift on grating B → animated beating

    # Project coords onto each grating's two axes (u = along, v = across) → 2-D grid.
    u1 = xc * np.cos(a1) - yc * np.sin(a1)
    v1 = xc * np.sin(a1) + yc * np.cos(a1)
    u2 = (xc * np.cos(a2) - yc * np.sin(a2)) + drift_off
    v2 = (xc * np.sin(a2) + yc * np.cos(a2)) + drift_off

    pA = float(grid_size)
    pB = max(1.0, grid_size * freq_ratio)
    gridA = _grating(u1, pA, sharpness) * _grating(v1, pA, sharpness)
    gridB = _grating(u2, pB, sharpness) * _grating(v2, pB, sharpness)

    # Interference: blend single-grid overlay (gridA) toward the two-grid product (the moiré beat).
    moire = (1.0 - interference) * gridA + interference * (gridA * gridB)
    moire = np.clip(moire, 0.0, 1.0)[:, :, np.newaxis]

    # Multiply the source by the moiré field (classic darkening interference), then mix by opacity.
    modulated = rgb * moire
    result = rgb * (1.0 - opacity) + modulated * opacity
    result_rgb = np.clip(result, 0, 255).astype(np.uint8)

    return np.concatenate([result_rgb, alpha], axis=2), None
