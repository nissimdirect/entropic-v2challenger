"""Hue Shift effect — rotates the hue wheel in HSV space."""

import numpy as np

EFFECT_ID = "fx.hue_shift"
EFFECT_NAME = "Hue Shift"
EFFECT_CATEGORY = "color"

PARAMS: dict = {
    "amount": {
        "type": "float",
        "min": 0.0,
        "max": 360.0,
        "default": 180.0,
        "label": "Hue Rotation",
        "curve": "linear",
        "unit": "\u00b0",
        "description": "Hue rotation in degrees around the color wheel",
    }
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
    """Rotate hue by N degrees. Stateless."""
    amount = float(params.get("amount", 180.0))
    output = frame.copy()

    # Extract RGB, convert to HSV manually (no cv2 dependency required)
    rgb = output[:, :, :3].astype(np.float32) / 255.0
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]

    cmax = np.maximum(np.maximum(r, g), b)
    cmin = np.minimum(np.minimum(r, g), b)
    delta = cmax - cmin

    # Hue calculation
    hue = np.zeros_like(delta)
    mask_r = (cmax == r) & (delta > 0)
    mask_g = (cmax == g) & (delta > 0)
    mask_b = (cmax == b) & (delta > 0)

    hue[mask_r] = 60.0 * (((g[mask_r] - b[mask_r]) / delta[mask_r]) % 6)
    hue[mask_g] = 60.0 * (((b[mask_g] - r[mask_g]) / delta[mask_g]) + 2)
    hue[mask_b] = 60.0 * (((r[mask_b] - g[mask_b]) / delta[mask_b]) + 4)

    # Saturation
    sat = np.divide(delta, cmax, out=np.zeros_like(delta), where=cmax > 0)
    val = cmax

    # Rotate hue
    hue = (hue + amount) % 360.0

    # HSV back to RGB
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

    output[:, :, 0] = np.clip(r_out * 255, 0, 255).astype(np.uint8)
    output[:, :, 1] = np.clip(g_out * 255, 0, 255).astype(np.uint8)
    output[:, :, 2] = np.clip(b_out * 255, 0, 255).astype(np.uint8)

    return output, None
