"""Pixel Print Emulation — xerox, fax, and risograph print degradation."""

import numpy as np
import cv2

from engine.determinism import make_rng

EFFECT_ID = "fx.pixel_print_emulation"
EFFECT_NAME = "Pixel Print Emulation"
EFFECT_CATEGORY = "physics"

_RISOGRAPH_PALETTES = {
    "classic": ((0, 90, 180), (220, 50, 50)),
    "zine": ((0, 0, 0), (0, 160, 80)),
    "punk": ((230, 50, 130), (255, 220, 0)),
    "ocean": ((0, 60, 120), (0, 180, 180)),
    "sunset": ((200, 60, 20), (240, 160, 0)),
}

PARAMS: dict = {
    "mode": {
        "type": "choice",
        "options": ["xerox", "fax", "risograph"],
        "default": "xerox",
        "label": "Mode",
        "description": "Print type: xerox (copy loss), fax (thermal), risograph (drum print)",
    },
    "generations": {
        "type": "int",
        "min": 1,
        "max": 30,
        "default": 8,
        "label": "Generations",
        "description": "Copy generations to simulate (xerox)",
        "curve": "linear",
        "unit": "",
    },
    "contrast_gain": {
        "type": "float",
        "min": 1.0,
        "max": 1.5,
        "default": 1.15,
        "label": "Contrast Gain",
        "curve": "linear",
        "description": "Per-generation contrast crush (xerox)",
        "unit": "",
    },
    "noise_amount": {
        "type": "float",
        "min": 0.0,
        "max": 0.3,
        "default": 0.06,
        "label": "Noise",
        "curve": "linear",
        "description": "Per-generation noise (xerox/fax)",
        "unit": "",
    },
    "halftone_size": {
        "type": "int",
        "min": 2,
        "max": 8,
        "default": 4,
        "label": "Halftone Size",
        "description": "Dot screen size (xerox)",
        "curve": "linear",
        "unit": "",
    },
    "edge_fuzz": {
        "type": "float",
        "min": 0.0,
        "max": 4.0,
        "default": 1.5,
        "label": "Edge Fuzz",
        "curve": "linear",
        "description": "Edge blur per generation (xerox)",
        "unit": "",
    },
    "toner_skip": {
        "type": "float",
        "min": 0.0,
        "max": 0.2,
        "default": 0.05,
        "label": "Toner Skip",
        "curve": "linear",
        "description": "White gap probability (xerox)",
        "unit": "",
    },
    "registration_offset": {
        "type": "float",
        "min": 0.0,
        "max": 3.0,
        "default": 0.5,
        "label": "Registration Offset",
        "curve": "linear",
        "description": "Color channel misalignment (xerox) / layer offset (risograph)",
        "unit": "",
    },
    "toner_density": {
        "type": "float",
        "min": 0.3,
        "max": 1.5,
        "default": 1.0,
        "label": "Toner Density",
        "curve": "linear",
        "description": "Overall toner amount (xerox)",
        "unit": "",
    },
    "paper_feed": {
        "type": "float",
        "min": 0.0,
        "max": 2.0,
        "default": 0.3,
        "label": "Paper Feed",
        "curve": "linear",
        "description": "Vertical shift per generation (xerox)",
        "unit": "",
    },
    "style": {
        "type": "choice",
        "options": ["copy", "faded", "harsh", "zine"],
        "default": "copy",
        "label": "Style",
        "description": "Copier character preset (xerox)",
    },
    "scan_noise": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.3,
        "label": "Scan Noise",
        "curve": "linear",
        "description": "Horizontal scan line noise (fax)",
        "unit": "",
    },
    "toner_bleed": {
        "type": "float",
        "min": 0.0,
        "max": 5.0,
        "default": 2.0,
        "label": "Toner Bleed",
        "curve": "linear",
        "description": "Horizontal ink spread (fax)",
        "unit": "",
    },
    "paper_texture": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.4,
        "label": "Paper Texture",
        "curve": "linear",
        "description": "Paper grain visibility (fax)",
        "unit": "",
    },
    "compression_bands": {
        "type": "int",
        "min": 0,
        "max": 20,
        "default": 8,
        "label": "Compression Bands",
        "description": "Thermal head banding (fax)",
        "curve": "linear",
        "unit": "",
    },
    "thermal_fade": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.2,
        "label": "Thermal Fade",
        "curve": "linear",
        "description": "Vertical fade streaks (fax)",
        "unit": "",
    },
    "ink_bleed": {
        "type": "float",
        "min": 0.0,
        "max": 6.0,
        "default": 2.5,
        "label": "Ink Bleed",
        "curve": "linear",
        "description": "Ink spread into paper (risograph)",
        "unit": "",
    },
    "ink_coverage": {
        "type": "float",
        "min": 0.5,
        "max": 1.0,
        "default": 0.85,
        "label": "Ink Coverage",
        "curve": "linear",
        "description": "How much ink the drum lays down (risograph)",
        "unit": "",
    },
    "palette": {
        "type": "choice",
        "options": ["classic", "zine", "punk", "ocean", "sunset", "custom"],
        "default": "classic",
        "label": "Palette",
        "description": "Color preset (risograph)",
    },
    "num_colors": {
        "type": "int",
        "min": 1,
        "max": 3,
        "default": 2,
        "label": "Colors",
        "description": "Color separation layers (risograph)",
        "curve": "linear",
        "unit": "",
    },
    "boundary": {
        "type": "choice",
        "options": ["clamp", "wrap", "mirror", "black"],
        "default": "clamp",
        "label": "Boundary",
        "description": "Edge behavior",
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
    """Pixel print emulation — xerox, fax, risograph."""
    mode = str(params.get("mode", "xerox"))

    alpha = frame[:, :, 3:4].copy()

    if mode == "xerox":
        result = _apply_xerox(frame, params, seed, frame_index)
    elif mode == "fax":
        result = _apply_fax(frame, params, seed, frame_index)
    elif mode == "risograph":
        result = _apply_risograph(frame, params, seed)
    else:
        result = frame.copy()

    # Ensure RGBA
    if result.shape[2] == 3:
        result = np.concatenate([result, alpha], axis=2)
    else:
        result[:, :, 3:4] = alpha

    return result, None  # Stateless — no physics accumulation


def _apply_xerox(frame, params, seed, frame_index):
    h, w = frame.shape[:2]
    rng = make_rng(seed + frame_index)

    generations = max(1, min(30, int(params.get("generations", 8))))
    contrast_gain = max(1.0, min(1.5, float(params.get("contrast_gain", 1.15))))
    noise_amount = max(0.0, min(0.3, float(params.get("noise_amount", 0.06))))
    halftone_size = max(2, min(8, int(params.get("halftone_size", 4))))
    edge_fuzz = max(0.0, min(4.0, float(params.get("edge_fuzz", 1.5))))
    toner_skip = max(0.0, min(0.2, float(params.get("toner_skip", 0.05))))
    registration_offset = max(
        0.0, min(3.0, float(params.get("registration_offset", 0.5)))
    )
    toner_density = max(0.3, min(1.5, float(params.get("toner_density", 1.0))))
    paper_feed = max(0.0, min(2.0, float(params.get("paper_feed", 0.3))))
    style = str(params.get("style", "copy"))

    # Style presets
    if style == "faded":
        contrast_gain = min(contrast_gain, 1.08)
        noise_amount = max(noise_amount, 0.1)
        toner_skip = max(toner_skip, 0.12)
        edge_fuzz = max(edge_fuzz, 2.5)
    elif style == "harsh":
        contrast_gain = max(contrast_gain, 1.3)
        noise_amount = min(noise_amount, 0.03)
    elif style == "zine":
        contrast_gain = max(contrast_gain, 1.25)
        noise_amount = max(noise_amount, 0.08)
        halftone_size = max(6, halftone_size)
        toner_skip = max(toner_skip, 0.08)
        generations = max(generations, 12)

    # Scale generations with frame progress (use frame_index as proxy)
    progress = min(1.0, frame_index / 60.0)
    current_gens = max(1, int(generations * progress + 1))

    result = frame[:, :, :3].astype(np.float32)

    for gen in range(current_gens):
        gen_rng = make_rng(seed + gen * 7)

        mean = np.mean(result)
        effective_gain = contrast_gain * toner_density
        result = (result - mean) * effective_gain + mean

        noise = gen_rng.normal(0, noise_amount * 255, result.shape).astype(np.float32)
        result += noise

        if edge_fuzz > 0 and gen % 2 == 0:
            ksize = max(3, int(edge_fuzz) * 2 + 1)
            result = cv2.GaussianBlur(result, (ksize, ksize), edge_fuzz * 0.5)

        if registration_offset > 0:
            for c in range(3):
                shift_x = int(gen_rng.normal(0, registration_offset))
                shift_y = int(gen_rng.normal(0, registration_offset * 0.5))
                if shift_x != 0 or shift_y != 0:
                    result[:, :, c] = np.roll(result[:, :, c], shift_x, axis=1)
                    result[:, :, c] = np.roll(result[:, :, c], shift_y, axis=0)

        if paper_feed > 0:
            shift_y = int(gen_rng.normal(0, paper_feed))
            if shift_y != 0:
                result = np.roll(result, shift_y, axis=0)

        if toner_skip > 0:
            num_skips = int(toner_skip * w * h / 2000)
            for _ in range(num_skips):
                sx = int(gen_rng.integers(0, w))
                sy = int(gen_rng.integers(0, h))
                sw = int(gen_rng.integers(2, max(3, w // 30)))
                sh = int(gen_rng.integers(1, 3))
                result[sy : min(sy + sh, h), sx : min(sx + sw, w)] = 255.0

    if halftone_size >= 2:
        hs = halftone_size
        gray = np.mean(result, axis=2)
        dot_y = np.arange(h) % hs
        dot_x = np.arange(w) % hs
        dot_pattern = np.sqrt(
            (dot_y[:, None] - hs / 2) ** 2 + (dot_x[None, :] - hs / 2) ** 2
        )
        dot_threshold = (dot_pattern / (hs * 0.7)) * 255
        halftone_influence = progress * 0.3
        for c in range(3):
            channel = result[:, :, c]
            halftone = np.where(gray > dot_threshold, channel * 1.1, channel * 0.85)
            result[:, :, c] = (
                channel * (1.0 - halftone_influence) + halftone * halftone_influence
            )

    return np.clip(result, 0, 255).astype(np.uint8)


def _apply_fax(frame, params, seed, frame_index):
    h, w = frame.shape[:2]
    rng = make_rng(seed + frame_index)

    scan_noise = max(0.0, min(1.0, float(params.get("scan_noise", 0.3))))
    toner_bleed = max(0.0, min(5.0, float(params.get("toner_bleed", 2.0))))
    paper_texture = max(0.0, min(1.0, float(params.get("paper_texture", 0.4))))
    compression_bands = max(0, min(20, int(params.get("compression_bands", 8))))
    thermal_fade = max(0.0, min(1.0, float(params.get("thermal_fade", 0.2))))

    gray = np.mean(frame[:, :, :3].astype(np.float32), axis=2)

    if thermal_fade > 0:
        fade_cols = int(rng.integers(3, max(4, w // 20)))
        fade_pattern = np.ones(w, dtype=np.float32)
        for _ in range(fade_cols):
            col = int(rng.integers(0, w))
            fade_w = int(rng.integers(5, max(6, w // 8)))
            x = np.arange(w, dtype=np.float32)
            fade_pattern *= 1.0 - thermal_fade * np.exp(-((x - col) ** 2) / (fade_w**2))
        gray *= fade_pattern[None, :]

    if scan_noise > 0:
        for row in range(h):
            if rng.random() < scan_noise * 0.3:
                shift = int(rng.integers(-3, 4))
                gray[row] = np.roll(gray[row], shift)
                gray[row] += rng.normal(0, scan_noise * 30, w).astype(np.float32)

    if compression_bands > 0:
        band_h = max(1, h // compression_bands)
        for band in range(compression_bands):
            y0 = band * band_h
            y1 = min(y0 + band_h, h)
            band_offset = float(rng.normal(0, 8))
            gray[y0:y1] += band_offset

    if toner_bleed > 0:
        ksize = max(3, int(toner_bleed * 2) | 1)
        kernel = np.zeros((1, ksize), dtype=np.float32)
        kernel[0] = 1.0 / ksize
        gray = cv2.filter2D(gray, -1, kernel)

    if paper_texture > 0:
        paper = rng.normal(245, paper_texture * 15, (h, w)).astype(np.float32)
        paper_mask = np.clip(gray / 255.0, 0, 1)
        gray = gray * (1.0 - paper_mask * 0.3) + paper * paper_mask * 0.3

    result = np.zeros((h, w, 3), dtype=np.float32)
    gray = np.clip(gray, 0, 255)
    result[:, :, 0] = gray * 0.95
    result[:, :, 1] = gray * 0.92
    result[:, :, 2] = gray * 0.88

    return np.clip(result, 0, 255).astype(np.uint8)


def _apply_risograph(frame, params, seed):
    h, w = frame.shape[:2]
    rng = make_rng(seed)

    ink_bleed = max(0.0, min(6.0, float(params.get("ink_bleed", 2.5))))
    registration_offset = max(0, min(10, int(params.get("registration_offset", 3))))
    paper_grain = max(0.0, min(1.0, float(params.get("paper_texture", 0.3))))
    ink_coverage = max(0.5, min(1.0, float(params.get("ink_coverage", 0.85))))
    num_colors = max(1, min(3, int(params.get("num_colors", 2))))
    palette = str(params.get("palette", "classic"))

    if palette in _RISOGRAPH_PALETTES:
        color_a, color_b = _RISOGRAPH_PALETTES[palette]
    else:
        color_a, color_b = (0, 90, 180), (220, 50, 50)

    gray = np.mean(frame[:, :, :3].astype(np.float32), axis=2) / 255.0

    paper = np.ones((h, w, 3), dtype=np.float32) * 240
    if paper_grain > 0:
        grain = rng.normal(0, paper_grain * 20, (h, w)).astype(np.float32)
        for c in range(3):
            paper[:, :, c] += grain

    result = paper.copy()

    colors = [list(color_a)]
    if num_colors >= 2:
        colors.append(list(color_b))
    if num_colors >= 3:
        colors.append(
            [
                255 - (color_a[0] + color_b[0]) // 2,
                255 - (color_a[1] + color_b[1]) // 2,
                255 - (color_a[2] + color_b[2]) // 2,
            ]
        )

    for layer_idx, ink_color in enumerate(colors):
        if layer_idx == 0:
            layer_mask = np.clip(1.0 - gray, 0, 1)
        elif layer_idx == 1:
            layer_mask = np.clip(gray * 2 - 0.3, 0, 1) * np.clip(1.5 - gray * 2, 0, 1)
        else:
            layer_mask = np.clip(gray - 0.5, 0, 1) * 2

        layer_mask *= ink_coverage

        if ink_bleed > 0:
            ksize = max(3, int(ink_bleed * 2) | 1)
            layer_mask = cv2.GaussianBlur(layer_mask, (ksize, ksize), ink_bleed * 0.5)

        if registration_offset > 0 and layer_idx > 0:
            ox = int(rng.integers(-registration_offset, registration_offset + 1))
            oy = int(rng.integers(-registration_offset, registration_offset + 1))
            layer_mask = np.roll(np.roll(layer_mask, ox, axis=1), oy, axis=0)

        ink_noise = rng.normal(1.0, 0.08, (h, w)).astype(np.float32)
        layer_mask *= ink_noise

        for c in range(3):
            ink_value = ink_color[c] / 255.0
            result[:, :, c] *= 1.0 - layer_mask * (1.0 - ink_value)

    return np.clip(result, 0, 255).astype(np.uint8)
