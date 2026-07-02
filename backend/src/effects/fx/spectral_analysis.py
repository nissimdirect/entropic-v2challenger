"""Spectral Analysis — spectral_paint, harmonic_percussive, and wavelet_split modes."""

import numpy as np
import cv2

EFFECT_ID = "fx.spectral_analysis"
EFFECT_NAME = "Spectral Analysis"
EFFECT_CATEGORY = "misc"

PARAMS: dict = {
    "mode": {
        "type": "choice",
        "options": ["spectral_paint", "harmonic_percussive", "wavelet_split"],
        "default": "spectral_paint",
        "label": "Mode",
        "description": "Spectral analysis type",
    },
    "mix": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.5,
        "label": "Mix",
        "curve": "linear",
        "unit": "%",
        "description": "Blend with original (spectral_paint)",
    },
    "h_kernel": {
        "type": "int",
        "min": 3,
        "max": 31,
        "default": 11,
        "label": "H Kernel",
        "curve": "linear",
        "unit": "",
        "description": "Horizontal median kernel for harmonic separation",
    },
    "p_kernel": {
        "type": "int",
        "min": 3,
        "max": 31,
        "default": 11,
        "label": "P Kernel",
        "curve": "linear",
        "unit": "",
        "description": "Vertical median kernel for percussive separation",
    },
    "component": {
        "type": "choice",
        "options": ["harmonic", "percussive", "both"],
        "default": "both",
        "label": "Component",
        "description": "Which component to show (harmonic_percussive)",
    },
    "levels": {
        "type": "int",
        "min": 1,
        "max": 5,
        "default": 3,
        "label": "Levels",
        "curve": "linear",
        "unit": "",
        "description": "Number of wavelet decomposition levels",
    },
    "detail_boost": {
        "type": "float",
        "min": 1.0,
        "max": 5.0,
        "default": 2.0,
        "label": "Detail Boost",
        "curve": "linear",
        "unit": "",
        "description": "Detail enhancement factor (wavelet_split)",
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
    """Apply spectral analysis visualization."""
    mode = str(params.get("mode", "spectral_paint"))
    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]

    if mode == "harmonic_percussive":
        result_rgb = _harmonic_percussive(rgb, params)
    elif mode == "wavelet_split":
        result_rgb = _wavelet_split(rgb, params)
    else:
        result_rgb = _spectral_paint(rgb, params)

    return np.concatenate([result_rgb, alpha], axis=2), None


def _spectral_paint(rgb: np.ndarray, params: dict) -> np.ndarray:
    mix = max(0.0, min(1.0, float(params.get("mix", 0.5))))

    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY).astype(np.float32)

    # 2D FFT
    f_shift = np.fft.fftshift(np.fft.fft2(gray))
    magnitude = np.log1p(np.abs(f_shift))
    mag_norm = magnitude / max(magnitude.max(), 1.0)

    h, w = gray.shape
    cy, cx = h // 2, w // 2
    y_coords, x_coords = np.mgrid[0:h, 0:w].astype(np.float32)
    r = np.sqrt((x_coords - cx) ** 2 + (y_coords - cy) ** 2)
    max_r = np.sqrt(cx**2 + cy**2)
    r_norm = r / max(max_r, 1.0)

    # Color-code: low freq = red, mid = green, high = blue
    red = np.clip(1.0 - r_norm * 3, 0, 1) * mag_norm
    green = np.clip(1.0 - np.abs(r_norm - 0.33) * 6, 0, 1) * mag_norm
    blue = np.clip(r_norm * 3 - 1.5, 0, 1) * mag_norm

    spectral = np.stack([red, green, blue], axis=2) * 255.0

    result = rgb.astype(np.float32) * (1.0 - mix) + spectral * mix
    return np.clip(result, 0, 255).astype(np.uint8)


def _harmonic_percussive(rgb: np.ndarray, params: dict) -> np.ndarray:
    h_kernel = max(3, min(31, int(params.get("h_kernel", 11)))) | 1
    p_kernel = max(3, min(31, int(params.get("p_kernel", 11)))) | 1
    component = str(params.get("component", "both"))

    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY).astype(np.float32)

    # 2D FFT
    f = np.fft.fft2(gray)
    magnitude = np.abs(f)

    # Normalize magnitude to uint8 for medianBlur, then scale back
    mag_max = magnitude.max()
    if mag_max > 0:
        mag_u8 = np.clip(magnitude / mag_max * 255, 0, 255).astype(np.uint8)
    else:
        mag_u8 = np.zeros_like(magnitude, dtype=np.uint8)

    # Harmonic: horizontal median filter on magnitude (smooth horizontal = tonal)
    harmonic_u8 = cv2.medianBlur(mag_u8, h_kernel)
    harmonic_mag = harmonic_u8.astype(np.float32) / 255.0 * mag_max
    # Percussive: vertical median filter
    percussive_u8 = cv2.medianBlur(mag_u8, p_kernel)
    percussive_mag = percussive_u8.astype(np.float32) / 255.0 * mag_max

    # Soft masking
    total = harmonic_mag + percussive_mag + 1e-10
    h_mask = harmonic_mag / total
    p_mask = percussive_mag / total

    phase = np.angle(f)

    if component == "harmonic":
        result_mag = magnitude * h_mask
    elif component == "percussive":
        result_mag = magnitude * p_mask
    else:
        # Show both side by side in different color channels
        h_img = np.abs(np.fft.ifft2(result_mag_from(magnitude, h_mask, phase)))
        p_img = np.abs(np.fft.ifft2(result_mag_from(magnitude, p_mask, phase)))
        h_norm = np.clip(h_img / max(h_img.max(), 1.0) * 255, 0, 255).astype(np.uint8)
        p_norm = np.clip(p_img / max(p_img.max(), 1.0) * 255, 0, 255).astype(np.uint8)
        zeros = np.zeros_like(h_norm, dtype=np.uint8)
        return np.stack([h_norm, zeros, p_norm], axis=2)

    reconstructed = np.fft.ifft2(result_mag * np.exp(1j * phase))
    result_img = np.abs(reconstructed)
    result_norm = np.clip(result_img / max(result_img.max(), 1.0) * 255, 0, 255).astype(
        np.uint8
    )
    return np.stack([result_norm, result_norm, result_norm], axis=2)


def result_mag_from(
    magnitude: np.ndarray, mask: np.ndarray, phase: np.ndarray
) -> np.ndarray:
    """Helper to reconstruct from masked magnitude and phase."""
    return magnitude * mask * np.exp(1j * phase)


def _wavelet_split(rgb: np.ndarray, params: dict) -> np.ndarray:
    levels = max(1, min(5, int(params.get("levels", 3))))
    detail_boost = max(1.0, min(5.0, float(params.get("detail_boost", 2.0))))

    result = rgb.astype(np.float32)
    current = result.copy()
    details = []

    # Successive Gaussian blur subtraction (Laplacian pyramid)
    for i in range(levels):
        ksize = max(3, (2 * (i + 1) + 1) * 2 + 1)
        ksize = min(ksize, 31) | 1
        blurred = cv2.GaussianBlur(current, (ksize, ksize), 0)
        detail = current - blurred
        details.append(detail)
        current = blurred

    # Reconstruct with boosted details
    reconstructed = current
    for detail in reversed(details):
        reconstructed = reconstructed + detail * detail_boost

    return np.clip(reconstructed, 0, 255).astype(np.uint8)
