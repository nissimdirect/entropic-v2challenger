"""False Color — map grayscale luminance to a false-color palette."""

import cv2
import numpy as np

EFFECT_ID = "fx.false_color"
EFFECT_NAME = "False Color"
EFFECT_CATEGORY = "enhance"

PARAMS: dict = {
    "colormap": {
        "type": "choice",
        "options": [
            "jet",
            "hot",
            "cool",
            "spring",
            "summer",
            "autumn",
            "winter",
            "bone",
            "ocean",
            "rainbow",
            "turbo",
            "inferno",
            "magma",
            "plasma",
            "viridis",
        ],
        "default": "jet",
        "label": "Colormap",
        "description": "Color palette to apply",
    },
}

_COLORMAP_LUT = {
    "jet": cv2.COLORMAP_JET,
    "hot": cv2.COLORMAP_HOT,
    "cool": cv2.COLORMAP_COOL,
    "spring": cv2.COLORMAP_SPRING,
    "summer": cv2.COLORMAP_SUMMER,
    "autumn": cv2.COLORMAP_AUTUMN,
    "winter": cv2.COLORMAP_WINTER,
    "bone": cv2.COLORMAP_BONE,
    "ocean": cv2.COLORMAP_OCEAN,
    "rainbow": cv2.COLORMAP_RAINBOW,
    "turbo": cv2.COLORMAP_TURBO,
    "inferno": cv2.COLORMAP_INFERNO,
    "magma": cv2.COLORMAP_MAGMA,
    "plasma": cv2.COLORMAP_PLASMA,
    "viridis": cv2.COLORMAP_VIRIDIS,
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
    """Map luminance to false-color palette — thermal/scientific visualization."""
    colormap = str(params.get("colormap", "jet"))
    cmap = _COLORMAP_LUT.get(colormap, cv2.COLORMAP_JET)

    alpha = frame[:, :, 3:4]
    gray = np.mean(frame[:, :, :3], axis=2).astype(np.uint8)

    # applyColorMap returns BGR
    colored_bgr = cv2.applyColorMap(gray, cmap)
    colored_rgb = cv2.cvtColor(colored_bgr, cv2.COLOR_BGR2RGB)

    output = np.concatenate([colored_rgb, alpha], axis=2)
    return output, None
