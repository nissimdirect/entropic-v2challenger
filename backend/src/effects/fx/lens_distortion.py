"""Lens Distortion — fisheye, anamorphic, and coma optical distortions."""

import numpy as np
import cv2

EFFECT_ID = "fx.lens_distortion"
EFFECT_NAME = "Lens Distortion"
EFFECT_CATEGORY = "optics"

PARAMS: dict = {
    "mode": {
        "type": "choice",
        "options": ["fisheye", "anamorphic", "coma"],
        "default": "fisheye",
        "label": "Mode",
        "description": "Distortion type",
    },
    "k1": {
        "type": "float",
        "min": -1.0,
        "max": 1.0,
        "default": 0.5,
        "label": "K1",
        "curve": "linear",
        "unit": "",
        "description": "Primary radial distortion coefficient (fisheye)",
    },
    "k2": {
        "type": "float",
        "min": -0.5,
        "max": 0.5,
        "default": 0.1,
        "label": "K2",
        "curve": "linear",
        "unit": "",
        "description": "Secondary radial distortion coefficient (fisheye)",
    },
    "fov": {
        "type": "float",
        "min": 0.5,
        "max": 2.0,
        "default": 1.0,
        "label": "FOV",
        "curve": "linear",
        "unit": "",
        "description": "Field of view scaling (fisheye)",
    },
    "squeeze_ratio": {
        "type": "float",
        "min": 0.3,
        "max": 3.0,
        "default": 1.5,
        "label": "Squeeze Ratio",
        "curve": "linear",
        "unit": "",
        "description": "Horizontal squeeze factor (anamorphic)",
    },
    "bokeh_oval": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.3,
        "label": "Bokeh Oval",
        "curve": "linear",
        "unit": "",
        "description": "Oval bokeh strength (anamorphic)",
    },
    "coma_strength": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.3,
        "label": "Coma Strength",
        "curve": "linear",
        "unit": "",
        "description": "Off-axis comet tail strength (coma)",
    },
    "coma_angle": {
        "type": "float",
        "min": 0.0,
        "max": 360.0,
        "default": 45.0,
        "label": "Coma Angle",
        "curve": "linear",
        "unit": "deg",
        "description": "Direction of coma aberration (coma)",
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
    """Apply optical lens distortion — fisheye, anamorphic, or coma."""
    mode = str(params.get("mode", "fisheye"))
    h, w = frame.shape[:2]
    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]

    if mode == "anamorphic":
        result_rgb = _anamorphic(rgb, params, h, w)
    elif mode == "coma":
        result_rgb = _coma(rgb, params, h, w)
    else:
        result_rgb = _fisheye(rgb, params, h, w)

    return np.concatenate([result_rgb, alpha], axis=2), None


def _fisheye(rgb: np.ndarray, params: dict, h: int, w: int) -> np.ndarray:
    k1 = max(-1.0, min(1.0, float(params.get("k1", 0.5))))
    k2 = max(-0.5, min(0.5, float(params.get("k2", 0.1))))
    fov = max(0.5, min(2.0, float(params.get("fov", 1.0))))

    cx, cy = w / 2.0, h / 2.0
    y_coords, x_coords = np.mgrid[0:h, 0:w].astype(np.float32)
    x_norm = (x_coords - cx) / (cx * fov)
    y_norm = (y_coords - cy) / (cy * fov)
    r2 = x_norm**2 + y_norm**2
    r4 = r2**2
    distort = 1.0 + k1 * r2 + k2 * r4
    map_x = (x_norm * distort * cx + cx).astype(np.float32)
    map_y = (y_norm * distort * cy + cy).astype(np.float32)
    return cv2.remap(rgb, map_x, map_y, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)


def _anamorphic(rgb: np.ndarray, params: dict, h: int, w: int) -> np.ndarray:
    squeeze = max(0.3, min(3.0, float(params.get("squeeze_ratio", 1.5))))
    bokeh_oval = max(0.0, min(1.0, float(params.get("bokeh_oval", 0.3))))

    cx, cy = w / 2.0, h / 2.0
    y_coords, x_coords = np.mgrid[0:h, 0:w].astype(np.float32)
    x_norm = (x_coords - cx) / cx
    y_norm = (y_coords - cy) / cy
    # Squeeze horizontally
    x_squeezed = x_norm / squeeze
    map_x = (x_squeezed * cx + cx).astype(np.float32)
    map_y = y_coords.copy()

    result = cv2.remap(
        rgb, map_x, map_y, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT
    )

    # Oval bokeh: blur more horizontally at edges
    if bokeh_oval > 0.01:
        r = np.sqrt(x_norm**2 + y_norm**2)
        edge_mask = np.clip(r * bokeh_oval, 0, 1)
        ksize = max(3, int(bokeh_oval * 30) | 1)
        blurred = cv2.GaussianBlur(result, (ksize, ksize // 2 * 2 + 1), 0)
        mask3 = np.stack([edge_mask] * 3, axis=2).astype(np.float32)
        result = (
            result.astype(np.float32) * (1 - mask3) + blurred.astype(np.float32) * mask3
        )
        result = np.clip(result, 0, 255).astype(np.uint8)

    return result


def _coma(rgb: np.ndarray, params: dict, h: int, w: int) -> np.ndarray:
    strength = max(0.0, min(1.0, float(params.get("coma_strength", 0.3))))
    angle_deg = max(0.0, min(360.0, float(params.get("coma_angle", 45.0))))

    if strength < 0.01:
        return rgb.copy()

    angle_rad = np.deg2rad(angle_deg)
    dx = np.cos(angle_rad) * strength * 20
    dy = np.sin(angle_rad) * strength * 20

    cx, cy = w / 2.0, h / 2.0
    y_coords, x_coords = np.mgrid[0:h, 0:w].astype(np.float32)
    x_norm = (x_coords - cx) / cx
    y_norm = (y_coords - cy) / cy
    r = np.sqrt(x_norm**2 + y_norm**2)

    # Coma increases with distance from center
    map_x = (x_coords - dx * r**2).astype(np.float32)
    map_y = (y_coords - dy * r**2).astype(np.float32)

    return cv2.remap(rgb, map_x, map_y, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
