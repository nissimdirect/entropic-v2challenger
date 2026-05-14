"""Torn Edges — Photoshop-style threshold with oscillating balance + tear character.

Mimics Photoshop's Filter > Sketch > Torn Edges, with three extensions:
- Oscillating image_balance via frame-index-driven LFO (fps-independent, deterministic)
- Greyscale (luminance) or per-channel RGB threshold modes
- 2D value-noise displacement for authentic paper-fiber tear character

Stacking two instances with different seeds produces layered tears (intentional).
"""

import numpy as np

EFFECT_ID = "fx.torn_edges"
EFFECT_NAME = "Torn Edges"
EFFECT_CATEGORY = "texture"

# Hard safety caps (seizure compliance + resource limits)
# osc_rate UI knob is 0-1; internally maps to 0-_MAX_OSC_RATE_CPF cycles per frame.
# 0.15 cpf = 4.5 Hz at 30fps — below the medical photosensitive seizure threshold.
_MAX_OSC_RATE_CPF = 0.15
_MAX_KERNEL = 31

PARAMS: dict = {
    "image_balance": {
        "type": "float",
        "min": 0.0,
        "max": 50.0,
        "default": 25.0,
        "curve": "linear",
        "unit": "",
        "label": "Image Balance",
        "description": "Threshold position (0=all white, 50=all black)",
    },
    "smoothness": {
        "type": "int",
        "min": 1,
        "max": 15,
        "default": 5,
        "curve": "linear",
        "unit": "",
        "label": "Smoothness",
        "description": "Pre-blur kernel — controls edge anti-aliasing of the threshold",
    },
    "tear_scale": {
        "type": "int",
        "min": 3,
        "max": 200,
        "default": 25,
        "curve": "exponential",
        "unit": "px",
        "label": "Tear Scale",
        "description": "Feature size of tear noise — 3=riso speckle, 25=torn paper, 150=heavy pulp",
    },
    "contrast": {
        "type": "int",
        "min": 1,
        "max": 25,
        "default": 18,
        "curve": "linear",
        "unit": "",
        "label": "Contrast",
        "description": "Edge softness — low=anti-aliased, high=hard binary",
    },
    "greyscale": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 1.0,
        "curve": "linear",
        "unit": "",
        "label": "Greyscale",
        "description": "0 = per-channel RGB threshold (chaotic color); 1 = luminance threshold (B/W); blend between",
    },
    "osc_rate": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.0,
        "curve": "exponential",
        "unit": "",
        "label": "Osc Rate",
        "description": "Modulation speed for image_balance (0=static). Hard-capped for seizure compliance.",
    },
    "osc_depth": {
        "type": "float",
        "min": 0.0,
        "max": 25.0,
        "default": 0.0,
        "curve": "linear",
        "unit": "",
        "label": "Osc Depth",
        "description": "How far the oscillator swings image_balance",
    },
    "osc_shape": {
        "type": "choice",
        "options": ["sine", "triangle", "square"],
        "default": "sine",
        "label": "Osc Shape",
        "description": "LFO waveform shape",
    },
}


def _oscillate(rate_unit: float, depth: float, shape: str, frame_index: int) -> float:
    """Frame-index-driven LFO. Pure, deterministic, fps-independent.

    rate_unit in [0,1] maps to [0, _MAX_OSC_RATE_CPF] cycles per frame.
    Returns the additive offset for image_balance.
    """
    if rate_unit <= 0.0 or depth <= 0.0:
        return 0.0
    rate_cpf = min(max(rate_unit, 0.0), 1.0) * _MAX_OSC_RATE_CPF
    phase = 2.0 * np.pi * rate_cpf * frame_index
    if shape == "triangle":
        p = (phase / (2.0 * np.pi)) % 1.0
        wave = 4.0 * abs(p - 0.5) - 1.0
    elif shape == "square":
        wave = 1.0 if np.sin(phase) >= 0 else -1.0
    else:
        wave = float(np.sin(phase))
    return wave * depth


def _value_noise_2d(h: int, w: int, scale: int, rng: np.random.Generator) -> np.ndarray:
    """Cheap 2D value noise: low-res random field upsampled with bicubic interp.

    Produces smooth, paper-fiber-like noise for threshold-boundary displacement —
    which is what makes the output look TORN (long jagged strokes), not FUZZY
    (high-freq per-pixel dither).
    """
    import cv2

    scale = max(2, int(scale))
    low_h = max(2, h // scale)
    low_w = max(2, w // scale)
    low = rng.uniform(-1.0, 1.0, size=(low_h, low_w)).astype(np.float32)
    return cv2.resize(low, (w, h), interpolation=cv2.INTER_CUBIC)


def apply(
    frame: np.ndarray,
    params: dict,
    state_in: dict | None = None,
    *,
    frame_index: int,
    seed: int,
    resolution: tuple[int, int],
) -> tuple[np.ndarray, dict | None]:
    """Torn-edges threshold with oscillation and tear displacement. Stateless."""
    import cv2

    # === Frame contract: uint8 only (HDR/float frames not supported) ===
    assert frame.dtype == np.uint8, (
        f"torn_edges requires uint8 frames, got {frame.dtype}"
    )

    # === Trust boundary: clamp every numeric param at entry ===
    image_balance = max(0.0, min(50.0, float(params.get("image_balance", 25.0))))
    smoothness = max(1, min(15, int(params.get("smoothness", 5))))
    tear_scale_param = max(3, min(200, int(params.get("tear_scale", 25))))
    contrast = max(1, min(25, int(params.get("contrast", 18))))
    # Greyscale: now a 0-1 mix (was bool). Accept legacy bool values for
    # backward compat with any projects saved against the previous schema.
    _gs = params.get("greyscale", 1.0)
    if isinstance(_gs, bool):
        greyscale_mix = 1.0 if _gs else 0.0
    else:
        try:
            greyscale_mix = max(0.0, min(1.0, float(_gs)))
        except (TypeError, ValueError):
            greyscale_mix = 1.0
    try:
        osc_rate = max(0.0, min(1.0, float(params.get("osc_rate", 0.0))))
    except (TypeError, ValueError):
        osc_rate = 0.0
    try:
        osc_depth = max(0.0, min(25.0, float(params.get("osc_depth", 0.0))))
    except (TypeError, ValueError):
        osc_depth = 0.0
    osc_shape = params.get("osc_shape", "sine")
    if osc_shape not in ("sine", "triangle", "square"):
        osc_shape = "sine"

    # === Oscillated balance ===
    osc_offset = _oscillate(osc_rate, osc_depth, osc_shape, int(frame_index))
    balance_eff = max(0.0, min(50.0, image_balance + osc_offset))

    # === Pre-blur (separable Gaussian; capped kernel for resource safety) ===
    kernel = min(_MAX_KERNEL, 2 * smoothness + 1)
    if kernel < 3:
        kernel = 3
    sigma = smoothness * 0.7
    rgb = frame[:, :, :3]
    blurred = cv2.GaussianBlur(
        rgb, (kernel, kernel), sigma, borderType=cv2.BORDER_REPLICATE
    )
    blurred_f = blurred.astype(np.float32)

    # === Tear-displacement noise (value noise, not per-pixel) ===
    # Boils only when oscillation is actually active (BOTH rate AND depth nonzero).
    # Gating on rate alone causes off-axis strobing when user sets rate but
    # leaves depth at default 0 (HT-1/HT-2 from red-team pass).
    rng_seed_base = int(seed) & 0xFFFFFFFF
    if osc_rate > 0.0 and osc_depth > 0.0:
        rng_seed = (rng_seed_base * 1_000_003 + int(frame_index)) & 0xFFFFFFFF
    else:
        rng_seed = rng_seed_base
    rng = np.random.default_rng(rng_seed)
    h, w = blurred_f.shape[:2]
    # tear_amp = luminance shift magnitude (boundary wander distance).
    # tear_scale is a user-controlled param (3-200px) so the full visual range
    # from risograph speckle through torn paper to heavy pulp is reachable
    # independently of smoothness. Tuned from visual UAT 2026-05-14.
    tear_amp = (16.0 - smoothness) * 2.5
    tear_scale = tear_scale_param
    noise_field = _value_noise_2d(h, w, tear_scale, rng) * tear_amp

    # === Threshold ===
    t = balance_eff * 5.1  # map balance (0-50) → luminance cutoff (0-255)
    k = contrast * 0.15

    # Unified threshold path: lerp per-channel input toward luma by greyscale_mix.
    # mix=0 → each channel keeps its own value (chaotic per-channel threshold).
    # mix=1 → all channels see luma (pure B/W).
    # in between → smooth blend (e.g. partial desaturation with torn edges).
    # Noise applied as shared luminance shift across channels so tear strokes
    # stay coherent — same as the prior color-mode behavior.
    luma = (
        0.299 * blurred_f[:, :, 0]
        + 0.587 * blurred_f[:, :, 1]
        + 0.114 * blurred_f[:, :, 2]
    )
    luma_3 = luma[:, :, np.newaxis]
    effective_input = blurred_f * (1.0 - greyscale_mix) + luma_3 * greyscale_mix
    x = effective_input + noise_field[:, :, np.newaxis]
    exponent = np.clip(-(x - t) * k, -50.0, 50.0)
    mask = 1.0 / (1.0 + np.exp(exponent))
    mask = np.nan_to_num(mask, nan=0.0, posinf=1.0, neginf=0.0)
    result_rgb = np.clip(mask * 255.0, 0, 255).astype(np.uint8)

    # === Preserve alpha (or pass through 3-channel) ===
    if frame.shape[2] >= 4:
        output = np.concatenate([result_rgb, frame[:, :, 3:4]], axis=2)
    else:
        output = result_rgb
    return output, None
