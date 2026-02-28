"""HSL Adjust effect — per-hue saturation/lightness adjustment."""

import math

import numpy as np

try:
    import cv2

    _HAS_CV2 = True
except ImportError:
    _HAS_CV2 = False

EFFECT_ID = "util.hsl_adjust"
EFFECT_NAME = "HSL Adjust"
EFFECT_CATEGORY = "util"

PARAMS: dict = {
    "target_hue": {
        "type": "choice",
        "options": [
            "all",
            "reds",
            "oranges",
            "yellows",
            "greens",
            "cyans",
            "blues",
            "purples",
            "magentas",
        ],
        "default": "all",
        "label": "Target Hue",
        "description": "Which hue range to affect",
    },
    "hue_shift": {
        "type": "float",
        "min": -180.0,
        "max": 180.0,
        "default": 0.0,
        "label": "Hue",
        "unit": "\u00b0",
        "curve": "linear",
        "description": "Rotate hue",
    },
    "saturation": {
        "type": "float",
        "min": -100.0,
        "max": 100.0,
        "default": 0.0,
        "label": "Saturation",
        "unit": "%",
        "curve": "linear",
        "description": "Adjust saturation",
    },
    "lightness": {
        "type": "float",
        "min": -100.0,
        "max": 100.0,
        "default": 0.0,
        "label": "Lightness",
        "unit": "%",
        "curve": "linear",
        "description": "Adjust lightness/value",
    },
}

# Hue ranges: (center_degrees, half_width_degrees)
HUE_RANGES = {
    "reds": (0.0, 30.0),
    "oranges": (30.0, 15.0),
    "yellows": (60.0, 15.0),
    "greens": (120.0, 30.0),
    "cyans": (180.0, 30.0),
    "blues": (240.0, 30.0),
    "purples": (270.0, 15.0),
    "magentas": (300.0, 30.0),
}


def _rgb_to_hsv(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Convert RGB [0,1] float to HSV. H in [0,360), S in [0,1], V in [0,1]."""
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]

    cmax = np.maximum(np.maximum(r, g), b)
    cmin = np.minimum(np.minimum(r, g), b)
    delta = cmax - cmin

    # Hue
    hue = np.zeros_like(delta)
    mask_r = (cmax == r) & (delta > 0)
    mask_g = (cmax == g) & (delta > 0)
    mask_b = (cmax == b) & (delta > 0)

    hue[mask_r] = 60.0 * (((g[mask_r] - b[mask_r]) / delta[mask_r]) % 6)
    hue[mask_g] = 60.0 * (((b[mask_g] - r[mask_g]) / delta[mask_g]) + 2)
    hue[mask_b] = 60.0 * (((r[mask_b] - g[mask_b]) / delta[mask_b]) + 4)

    # Saturation (safe divide: cmax=0 means achromatic, sat=0)
    safe_cmax = np.where(cmax > 0, cmax, 1.0)
    sat = np.where(cmax > 0, delta / safe_cmax, 0.0)
    val = cmax

    return hue, sat, val


def _hsv_to_rgb(hue: np.ndarray, sat: np.ndarray, val: np.ndarray) -> np.ndarray:
    """Convert HSV to RGB [0,1] float. H in [0,360), S in [0,1], V in [0,1]."""
    c = val * sat
    h_sector = hue / 60.0
    x = c * (1 - np.abs(h_sector % 2 - 1))
    m = val - c

    r_out = np.zeros_like(hue)
    g_out = np.zeros_like(hue)
    b_out = np.zeros_like(hue)

    s0 = (h_sector >= 0) & (h_sector < 1)
    s1 = (h_sector >= 1) & (h_sector < 2)
    s2 = (h_sector >= 2) & (h_sector < 3)
    s3 = (h_sector >= 3) & (h_sector < 4)
    s4 = (h_sector >= 4) & (h_sector < 5)
    s5 = (h_sector >= 5) & (h_sector < 6)

    r_out[s0] = c[s0]
    g_out[s0] = x[s0]
    r_out[s1] = x[s1]
    g_out[s1] = c[s1]
    g_out[s2] = c[s2]
    b_out[s2] = x[s2]
    g_out[s3] = x[s3]
    b_out[s3] = c[s3]
    r_out[s4] = x[s4]
    b_out[s4] = c[s4]
    r_out[s5] = c[s5]
    b_out[s5] = x[s5]

    r_out += m
    g_out += m
    b_out += m

    result = np.stack([r_out, g_out, b_out], axis=-1)
    return np.clip(result, 0, 1)


def _angular_distance(h1: np.ndarray, h2: float) -> np.ndarray:
    """Compute shortest angular distance in degrees (wrapping at 360)."""
    diff = np.abs(h1 - h2)
    return np.minimum(diff, 360.0 - diff)


def apply(
    frame: np.ndarray,
    params: dict,
    state_in: dict | None = None,
    *,
    frame_index: int,
    seed: int,
    resolution: tuple[int, int],
) -> tuple[np.ndarray, dict | None]:
    """Apply HSL adjustment. Stateless."""
    if frame.size == 0:
        return frame.copy(), None

    target_hue = str(params.get("target_hue", "all"))
    hue_shift = float(params.get("hue_shift", 0.0))
    if not math.isfinite(hue_shift):
        hue_shift = 0.0
    saturation = float(params.get("saturation", 0.0))
    if not math.isfinite(saturation):
        saturation = 0.0
    lightness = float(params.get("lightness", 0.0))
    if not math.isfinite(lightness):
        lightness = 0.0

    # Identity check
    if hue_shift == 0.0 and saturation == 0.0 and lightness == 0.0:
        return frame.copy(), None

    output = frame.copy()

    # Convert RGB to HSV — use cv2 (optimized C++) when available
    rgb = frame[:, :, :3]
    if _HAS_CV2:
        # cv2 float32 HSV: H in [0,360), S in [0,1], V in [0,1]
        rgb_f = rgb.astype(np.float32) / 255.0
        hsv = cv2.cvtColor(rgb_f, cv2.COLOR_RGB2HSV)
        hue, sat, val = hsv[:, :, 0], hsv[:, :, 1], hsv[:, :, 2]
    else:
        rgb_f = rgb.astype(np.float32) / 255.0
        hue, sat, val = _rgb_to_hsv(rgb_f)

    # Build hue mask
    if target_hue == "all":
        mask = np.ones_like(hue)
    elif target_hue in HUE_RANGES:
        center, half_width = HUE_RANGES[target_hue]
        dist = _angular_distance(hue, center)
        # Soft feathered mask: 1.0 inside half_width, fades to 0 at 2*half_width
        mask = np.clip(1.0 - (dist - half_width) / half_width, 0, 1)
    else:
        mask = np.ones_like(hue)

    # Apply hue shift (circular)
    hue = hue + hue_shift * mask
    hue = hue % 360.0

    # Apply saturation adjustment (multiplicative, -100 to +100 maps to 0x to 2x)
    sat_factor = 1.0 + (saturation / 100.0) * mask
    sat = sat * sat_factor
    sat = np.clip(sat, 0, 1)

    # Apply lightness adjustment (additive to value)
    val = val + (lightness / 100.0) * mask
    val = np.clip(val, 0, 1)

    # Convert back to RGB
    if _HAS_CV2:
        hsv_out = np.stack([hue, sat, val], axis=-1).astype(np.float32)
        new_rgb = cv2.cvtColor(hsv_out, cv2.COLOR_HSV2RGB)
        output[:, :, :3] = (np.clip(new_rgb, 0, 1) * 255).astype(np.uint8)
    else:
        new_rgb = _hsv_to_rgb(hue, sat, val)
        output[:, :, :3] = (new_rgb * 255).astype(np.uint8)

    return output, None
