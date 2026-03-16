"""Medical Imaging — xray, ultrasound, mri, ct_windowing, pet_scan, microscope."""

import numpy as np
import cv2

from engine.determinism import make_rng

EFFECT_ID = "fx.medical_imaging"
EFFECT_NAME = "Medical Imaging"
EFFECT_CATEGORY = "medical"

PARAMS: dict = {
    "mode": {
        "type": "choice",
        "options": [
            "xray",
            "ultrasound",
            "mri",
            "ct_windowing",
            "pet_scan",
            "microscope",
        ],
        "default": "xray",
        "label": "Mode",
        "description": "Medical imaging modality",
    },
    "exposure": {
        "type": "float",
        "min": 0.5,
        "max": 3.0,
        "default": 1.0,
        "label": "Exposure",
        "curve": "linear",
        "unit": "",
        "description": "X-ray exposure level",
    },
    "scatter": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.2,
        "label": "Scatter",
        "curve": "linear",
        "unit": "",
        "description": "X-ray scatter noise",
    },
    "frequency_mhz": {
        "type": "float",
        "min": 1.0,
        "max": 15.0,
        "default": 5.0,
        "label": "Frequency",
        "curve": "linear",
        "unit": "MHz",
        "description": "Ultrasound transducer frequency",
    },
    "depth_cm": {
        "type": "float",
        "min": 5.0,
        "max": 30.0,
        "default": 15.0,
        "label": "Depth",
        "curve": "linear",
        "unit": "cm",
        "description": "Ultrasound imaging depth",
    },
    "gain": {
        "type": "float",
        "min": 0.5,
        "max": 3.0,
        "default": 1.5,
        "label": "Gain",
        "curve": "linear",
        "unit": "",
        "description": "Ultrasound gain",
    },
    "weighting": {
        "type": "choice",
        "options": ["T1", "T2", "PD"],
        "default": "T1",
        "label": "Weighting",
        "description": "MRI weighting type",
    },
    "field_strength": {
        "type": "float",
        "min": 0.5,
        "max": 3.0,
        "default": 1.5,
        "label": "Field Strength",
        "curve": "linear",
        "unit": "T",
        "description": "MRI field strength",
    },
    "window_width": {
        "type": "float",
        "min": 0.1,
        "max": 1.0,
        "default": 0.5,
        "label": "Window Width",
        "curve": "linear",
        "unit": "",
        "description": "CT window width",
    },
    "window_center": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.5,
        "label": "Window Center",
        "curve": "linear",
        "unit": "",
        "description": "CT window center",
    },
    "uptake_threshold": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.3,
        "label": "Uptake Threshold",
        "curve": "linear",
        "unit": "",
        "description": "PET scan uptake threshold",
    },
    "decay_time": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.5,
        "label": "Decay Time",
        "curve": "linear",
        "unit": "",
        "description": "PET radiotracer decay",
    },
    "magnification": {
        "type": "float",
        "min": 1.0,
        "max": 10.0,
        "default": 4.0,
        "label": "Magnification",
        "curve": "linear",
        "unit": "x",
        "description": "Microscope magnification",
    },
    "stain_type": {
        "type": "choice",
        "options": ["HE", "PAS", "Giemsa"],
        "default": "HE",
        "label": "Stain Type",
        "description": "Histological stain",
    },
}


def _to_gray(rgb: np.ndarray) -> np.ndarray:
    """Convert RGB to grayscale float32 0-1."""
    return (
        0.299 * rgb[:, :, 0].astype(np.float32)
        + 0.587 * rgb[:, :, 1].astype(np.float32)
        + 0.114 * rgb[:, :, 2].astype(np.float32)
    ) / 255.0


def _gray_to_rgb(gray: np.ndarray) -> np.ndarray:
    """Convert float32 grayscale to uint8 RGB."""
    g = np.clip(gray * 255, 0, 255).astype(np.uint8)
    return np.stack([g, g, g], axis=2)


def apply(
    frame: np.ndarray,
    params: dict,
    state_in: dict | None = None,
    *,
    frame_index: int,
    seed: int,
    resolution: tuple[int, int],
) -> tuple[np.ndarray, dict | None]:
    """Apply medical imaging simulation."""
    mode = str(params.get("mode", "xray"))
    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]
    rng = make_rng(seed)

    if mode == "ultrasound":
        result_rgb = _ultrasound(rgb, params, rng)
    elif mode == "mri":
        result_rgb = _mri(rgb, params, rng)
    elif mode == "ct_windowing":
        result_rgb = _ct_windowing(rgb, params)
    elif mode == "pet_scan":
        result_rgb = _pet_scan(rgb, params, rng)
    elif mode == "microscope":
        result_rgb = _microscope(rgb, params, rng)
    else:
        result_rgb = _xray(rgb, params, rng)

    return np.concatenate([result_rgb, alpha], axis=2), None


def _xray(rgb: np.ndarray, params: dict, rng: np.random.Generator) -> np.ndarray:
    exposure = max(0.5, min(3.0, float(params.get("exposure", 1.0))))
    scatter = max(0.0, min(1.0, float(params.get("scatter", 0.2))))

    gray = _to_gray(rgb)
    # Invert (bones appear bright)
    inv = 1.0 - gray
    inv = np.clip(inv * exposure, 0, 1)
    # Edge enhancement for bone structure
    edges = cv2.Laplacian(inv, cv2.CV_32F)
    inv = inv + np.abs(edges) * 0.3
    # Poisson-like scatter noise
    if scatter > 0.01:
        noise = rng.standard_normal(inv.shape).astype(np.float32) * scatter * 0.15
        inv = inv + noise
    return _gray_to_rgb(np.clip(inv, 0, 1))


def _ultrasound(rgb: np.ndarray, params: dict, rng: np.random.Generator) -> np.ndarray:
    freq = max(1.0, min(15.0, float(params.get("frequency_mhz", 5.0))))
    depth = max(5.0, min(30.0, float(params.get("depth_cm", 15.0))))
    gain_val = max(0.5, min(3.0, float(params.get("gain", 1.5))))

    h, w = rgb.shape[:2]
    gray = _to_gray(rgb) * gain_val

    # Depth attenuation (deeper = darker)
    depth_atten = np.linspace(1.0, 0.3, h, dtype=np.float32)[:, np.newaxis]
    gray = gray * depth_atten

    # Rayleigh speckle noise (characteristic of ultrasound)
    speckle_scale = 0.3 / max(freq / 5.0, 0.5)
    speckle = rng.rayleigh(scale=speckle_scale, size=gray.shape).astype(np.float32)
    gray = gray * (1.0 + speckle)

    # Fan-shaped mask
    cy, cx = 0, w // 2
    y_coords, x_coords = np.mgrid[0:h, 0:w].astype(np.float32)
    angle = np.arctan2(y_coords - cy, x_coords - cx)
    fan_half = np.deg2rad(40 + depth)
    fan_center = np.pi / 2
    fan_mask = np.abs(angle - fan_center) < fan_half
    gray = gray * fan_mask.astype(np.float32)

    return _gray_to_rgb(np.clip(gray, 0, 1))


def _mri(rgb: np.ndarray, params: dict, rng: np.random.Generator) -> np.ndarray:
    weighting = str(params.get("weighting", "T1"))
    field = max(0.5, min(3.0, float(params.get("field_strength", 1.5))))

    gray = _to_gray(rgb)

    # Different weightings emphasize different tissue contrasts
    if weighting == "T2":
        # T2: fluid appears bright
        gray = gray**0.7
    elif weighting == "PD":
        # Proton density: moderate contrast
        gray = gray**0.9
    else:
        # T1: fat appears bright, fluid dark
        gray = 1.0 - gray**1.3

    gray = np.clip(gray * (0.7 + field * 0.2), 0, 1)

    # Rician noise (MRI characteristic)
    noise_level = 0.05 / max(field, 0.5)
    real_part = gray + rng.standard_normal(gray.shape).astype(np.float32) * noise_level
    imag_part = rng.standard_normal(gray.shape).astype(np.float32) * noise_level
    gray = np.sqrt(real_part**2 + imag_part**2)

    return _gray_to_rgb(np.clip(gray, 0, 1))


def _ct_windowing(rgb: np.ndarray, params: dict) -> np.ndarray:
    ww = max(0.1, min(1.0, float(params.get("window_width", 0.5))))
    wc = max(0.0, min(1.0, float(params.get("window_center", 0.5))))

    gray = _to_gray(rgb)
    low = wc - ww / 2.0
    high = wc + ww / 2.0
    gray = (gray - low) / max(high - low, 0.001)
    return _gray_to_rgb(np.clip(gray, 0, 1))


def _pet_scan(rgb: np.ndarray, params: dict, rng: np.random.Generator) -> np.ndarray:
    threshold = max(0.0, min(1.0, float(params.get("uptake_threshold", 0.3))))
    decay = max(0.0, min(1.0, float(params.get("decay_time", 0.5))))

    gray = _to_gray(rgb)
    # Threshold for uptake regions
    uptake = np.clip((gray - threshold) / max(1.0 - threshold, 0.001), 0, 1)
    uptake = uptake * (1.0 - decay * 0.5)

    # Poisson noise
    noise = rng.standard_normal(uptake.shape).astype(np.float32) * 0.1
    uptake = np.clip(uptake + noise, 0, 1)

    # Hot colormap: black -> red -> yellow -> white
    r = np.clip(uptake * 3.0, 0, 1)
    g = np.clip(uptake * 3.0 - 1.0, 0, 1)
    b = np.clip(uptake * 3.0 - 2.0, 0, 1)
    result = np.stack([r, g, b], axis=2)
    return np.clip(result * 255, 0, 255).astype(np.uint8)


def _microscope(rgb: np.ndarray, params: dict, rng: np.random.Generator) -> np.ndarray:
    mag = max(1.0, min(10.0, float(params.get("magnification", 4.0))))
    stain = str(params.get("stain_type", "HE"))

    gray = _to_gray(rgb)

    # Stain color LUTs
    if stain == "PAS":
        r_lut = np.clip(0.9 - gray * 0.4, 0, 1)
        g_lut = np.clip(0.3 + gray * 0.4, 0, 1)
        b_lut = np.clip(0.6 - gray * 0.3, 0, 1)
    elif stain == "Giemsa":
        r_lut = np.clip(0.5 + gray * 0.3, 0, 1)
        g_lut = np.clip(0.3 + gray * 0.2, 0, 1)
        b_lut = np.clip(0.7 + gray * 0.2, 0, 1)
    else:  # H&E
        r_lut = np.clip(0.8 + gray * 0.2, 0, 1)
        g_lut = np.clip(0.4 + gray * 0.4, 0, 1)
        b_lut = np.clip(0.7 - gray * 0.3, 0, 1)

    # Shot noise (higher mag = more visible)
    noise_scale = 0.03 * mag / 4.0
    r_lut = r_lut + rng.standard_normal(gray.shape).astype(np.float32) * noise_scale
    g_lut = g_lut + rng.standard_normal(gray.shape).astype(np.float32) * noise_scale
    b_lut = b_lut + rng.standard_normal(gray.shape).astype(np.float32) * noise_scale

    result = np.stack([r_lut, g_lut, b_lut], axis=2)
    return np.clip(result * 255, 0, 255).astype(np.uint8)
