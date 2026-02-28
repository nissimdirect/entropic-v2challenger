"""Color Balance effect — Shadow/Midtone/Highlight color wheels."""

import numpy as np

EFFECT_ID = "util.color_balance"
EFFECT_NAME = "Color Balance"
EFFECT_CATEGORY = "util"

PARAMS: dict = {
    "shadows_r": {
        "type": "float",
        "min": -100,
        "max": 100,
        "default": 0,
        "label": "Shadows Red",
        "unit": "",
        "curve": "linear",
        "description": "Red offset in shadows",
    },
    "shadows_g": {
        "type": "float",
        "min": -100,
        "max": 100,
        "default": 0,
        "label": "Shadows Green",
        "unit": "",
        "curve": "linear",
        "description": "Green offset in shadows",
    },
    "shadows_b": {
        "type": "float",
        "min": -100,
        "max": 100,
        "default": 0,
        "label": "Shadows Blue",
        "unit": "",
        "curve": "linear",
        "description": "Blue offset in shadows",
    },
    "midtones_r": {
        "type": "float",
        "min": -100,
        "max": 100,
        "default": 0,
        "label": "Midtones Red",
        "unit": "",
        "curve": "linear",
        "description": "Red offset in midtones",
    },
    "midtones_g": {
        "type": "float",
        "min": -100,
        "max": 100,
        "default": 0,
        "label": "Midtones Green",
        "unit": "",
        "curve": "linear",
        "description": "Green offset in midtones",
    },
    "midtones_b": {
        "type": "float",
        "min": -100,
        "max": 100,
        "default": 0,
        "label": "Midtones Blue",
        "unit": "",
        "curve": "linear",
        "description": "Blue offset in midtones",
    },
    "highlights_r": {
        "type": "float",
        "min": -100,
        "max": 100,
        "default": 0,
        "label": "Highlights Red",
        "unit": "",
        "curve": "linear",
        "description": "Red offset in highlights",
    },
    "highlights_g": {
        "type": "float",
        "min": -100,
        "max": 100,
        "default": 0,
        "label": "Highlights Green",
        "unit": "",
        "curve": "linear",
        "description": "Green offset in highlights",
    },
    "highlights_b": {
        "type": "float",
        "min": -100,
        "max": 100,
        "default": 0,
        "label": "Highlights Blue",
        "unit": "",
        "curve": "linear",
        "description": "Blue offset in highlights",
    },
    "preserve_luma": {
        "type": "bool",
        "default": True,
        "label": "Preserve Luminosity",
        "description": "Restore original brightness after color shift",
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
    """Apply three-way color balance. Stateless."""
    if frame.size == 0:
        return frame.copy(), None

    shadows_r = float(params.get("shadows_r", 0))
    shadows_g = float(params.get("shadows_g", 0))
    shadows_b = float(params.get("shadows_b", 0))
    midtones_r = float(params.get("midtones_r", 0))
    midtones_g = float(params.get("midtones_g", 0))
    midtones_b = float(params.get("midtones_b", 0))
    highlights_r = float(params.get("highlights_r", 0))
    highlights_g = float(params.get("highlights_g", 0))
    highlights_b = float(params.get("highlights_b", 0))
    preserve_luma = bool(params.get("preserve_luma", True))

    # Identity check
    all_zero = all(
        v == 0
        for v in [
            shadows_r,
            shadows_g,
            shadows_b,
            midtones_r,
            midtones_g,
            midtones_b,
            highlights_r,
            highlights_g,
            highlights_b,
        ]
    )
    if all_zero:
        return frame.copy(), None

    rgb = frame[:, :, :3].astype(np.float32)

    # Compute luminance for tonal masks
    luma = 0.299 * rgb[:, :, 0] + 0.587 * rgb[:, :, 1] + 0.114 * rgb[:, :, 2]

    # Build smooth tonal masks
    shadow_mask = np.clip((170.0 - luma) / 170.0, 0, 1) ** 1.5
    highlight_mask = np.clip((luma - 85.0) / 170.0, 0, 1) ** 1.5
    midtone_mask = np.clip(1.0 - shadow_mask - highlight_mask, 0, 1)

    # Scale offsets: -100..+100 maps to -128..+128 pixel value shift
    scale = 128.0 / 100.0

    for ch_idx, (sh, mi, hi) in enumerate(
        [
            (shadows_r, midtones_r, highlights_r),
            (shadows_g, midtones_g, highlights_g),
            (shadows_b, midtones_b, highlights_b),
        ]
    ):
        offset = (
            sh * scale * shadow_mask
            + mi * scale * midtone_mask
            + hi * scale * highlight_mask
        )
        rgb[:, :, ch_idx] += offset

    rgb = np.clip(rgb, 0, 255)

    # Preserve luminosity
    if preserve_luma:
        new_luma = 0.299 * rgb[:, :, 0] + 0.587 * rgb[:, :, 1] + 0.114 * rgb[:, :, 2]
        # Avoid division by zero
        safe_new = np.where(new_luma > 0, new_luma, 1.0)
        ratio = luma / safe_new
        ratio = ratio[:, :, np.newaxis]
        rgb = rgb * ratio
        rgb = np.clip(rgb, 0, 255)

    output = frame.copy()
    output[:, :, :3] = rgb.astype(np.uint8)

    return output, None
