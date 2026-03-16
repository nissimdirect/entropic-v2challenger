"""Lo-Fi Lens — cheap lens simulation with vignette, edge blur, and color fringing."""

import numpy as np
import cv2

EFFECT_ID = "fx.lo_fi_lens"
EFFECT_NAME = "Lo-Fi Lens"
EFFECT_CATEGORY = "optics"

PARAMS: dict = {
    "vignette": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.5,
        "label": "Vignette",
        "curve": "linear",
        "unit": "",
        "description": "Edge darkening strength",
    },
    "edge_blur": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.3,
        "label": "Edge Blur",
        "curve": "linear",
        "unit": "",
        "description": "Blur at the edges of the frame",
    },
    "fringe": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.2,
        "label": "Fringe",
        "curve": "linear",
        "unit": "",
        "description": "Color fringing at edges",
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
    """Cheap lens — vignette + edge blur + color fringe combined."""
    vignette = max(0.0, min(1.0, float(params.get("vignette", 0.5))))
    edge_blur = max(0.0, min(1.0, float(params.get("edge_blur", 0.3))))
    fringe = max(0.0, min(1.0, float(params.get("fringe", 0.2))))

    h, w = frame.shape[:2]
    rgb = frame[:, :, :3].astype(np.float32)
    alpha = frame[:, :, 3:4]

    # Radial distance from center
    cy, cx = h / 2.0, w / 2.0
    y_coords, x_coords = np.mgrid[0:h, 0:w].astype(np.float32)
    r = np.sqrt(((x_coords - cx) / cx) ** 2 + ((y_coords - cy) / cy) ** 2)
    r_norm = np.clip(r / np.sqrt(2), 0, 1)

    # Vignette: darken edges
    if vignette > 0.01:
        vig_mask = 1.0 - r_norm**2 * vignette
        vig_mask = np.clip(vig_mask, 0, 1)[:, :, np.newaxis]
        rgb = rgb * vig_mask

    result = np.clip(rgb, 0, 255).astype(np.uint8)

    # Edge blur: blend blurred version at edges
    if edge_blur > 0.01:
        ksize = max(3, int(edge_blur * 31) | 1)
        blurred = cv2.GaussianBlur(result, (ksize, ksize), 0)
        blur_mask = np.clip(r_norm * edge_blur * 2, 0, 1)[:, :, np.newaxis]
        result = (
            result.astype(np.float32) * (1 - blur_mask)
            + blurred.astype(np.float32) * blur_mask
        )
        result = np.clip(result, 0, 255).astype(np.uint8)

    # Color fringing: shift R and B channels slightly at edges
    if fringe > 0.01:
        shift_px = max(1, int(fringe * 8))
        r_ch = result[:, :, 0]
        g_ch = result[:, :, 1]
        b_ch = result[:, :, 2]
        # Shift red right, blue left
        r_shifted = np.roll(r_ch, shift_px, axis=1)
        b_shifted = np.roll(b_ch, -shift_px, axis=1)
        # Only apply fringe at edges using r_norm mask
        fringe_mask = np.clip(r_norm * 2 - 0.5, 0, 1)
        r_out = (
            r_ch.astype(np.float32) * (1 - fringe_mask)
            + r_shifted.astype(np.float32) * fringe_mask
        ).astype(np.uint8)
        b_out = (
            b_ch.astype(np.float32) * (1 - fringe_mask)
            + b_shifted.astype(np.float32) * fringe_mask
        ).astype(np.uint8)
        result = np.stack([r_out, g_ch, b_out], axis=2)

    return np.concatenate([result, alpha], axis=2), None
