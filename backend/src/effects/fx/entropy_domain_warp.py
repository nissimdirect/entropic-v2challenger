"""Entropy Domain Warp — domain-warp distortion gated by per-pixel entropy.

The image self-distorts where it's busy and holds still where it's calm.
Local Shannon entropy (computed per-block, bilinearly upsampled) modulates
the magnitude of a fractal-noise displacement field. High-entropy regions
(faces, text, edges) warp violently; low-entropy regions (sky, walls) sit
still. Inverse mode flips the relationship: flat regions warp, busy regions
stay pristine.

Frankenstein recipe:
- `effects/fx/domain_warp.py` — fractal-noise displacement field + remap
- `effects/fx/entropy_map.py` — per-block Shannon entropy from luma histogram
- `effects/shared/displacement.py::remap_frame` — boundary-aware coordinate remap
- `effects/shared/noise_generators.py::fractal_noise_2d` — deterministic warp field
"""

import numpy as np

from effects.shared.displacement import remap_frame
from effects.shared.noise_generators import fractal_noise_2d

EFFECT_ID = "fx.entropy_domain_warp"
EFFECT_NAME = "Entropy Domain Warp"
EFFECT_CATEGORY = "warping"

PARAMS: dict = {
    "intensity": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.5,
        "label": "Intensity",
        "curve": "linear",
        "unit": "%",
        "description": "Master warp depth (0 = no warp, 1 = full warp at high-entropy pixels)",
    },
    "max_offset_px": {
        "type": "float",
        "min": 1.0,
        "max": 100.0,
        "default": 20.0,
        "label": "Max Offset",
        "curve": "linear",
        "unit": "px",
        "description": "Maximum displacement at full intensity",
    },
    "noise_scale": {
        "type": "float",
        "min": 10.0,
        "max": 200.0,
        "default": 60.0,
        "label": "Noise Scale",
        "curve": "linear",
        "unit": "px",
        "description": "Spatial size of warp-noise features",
    },
    "noise_octaves": {
        "type": "int",
        "min": 1,
        "max": 6,
        "default": 3,
        "label": "Noise Octaves",
        "curve": "linear",
        "unit": "",
        "description": "Fractal noise layers (more = richer detail)",
    },
    "entropy_block": {
        "type": "int",
        "min": 4,
        "max": 32,
        "default": 8,
        "label": "Entropy Block",
        "curve": "linear",
        "unit": "px",
        "description": "Block size for entropy computation (smaller = finer mask)",
    },
    "entropy_curve": {
        "type": "float",
        "min": 0.5,
        "max": 4.0,
        "default": 1.5,
        "label": "Entropy Curve",
        "curve": "linear",
        "unit": "",
        "description": "Gamma on entropy mask (higher = sharper boundary between warped/still)",
    },
    "mode": {
        "type": "choice",
        "options": ["forward", "inverse"],
        "default": "forward",
        "label": "Mode",
        "description": "forward = busy regions warp; inverse = flat regions warp",
    },
    "time_evolve": {
        "type": "float",
        "min": 0.0,
        "max": 5.0,
        "default": 1.0,
        "label": "Time Evolve",
        "curve": "linear",
        "unit": "",
        "description": "Animation speed of the warp field (0 = frozen)",
    },
    "temporal_smooth": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.3,
        "label": "Temporal Smooth",
        "curve": "linear",
        "unit": "%",
        "description": "Smooth entropy mask across frames (0 = none, 1 = max)",
    },
    "boundary_mode": {
        "type": "choice",
        "options": ["clamp", "wrap", "mirror", "black"],
        "default": "mirror",
        "label": "Boundary",
        "description": "Edge behavior when displacement samples outside the frame",
    },
}


def _block_entropy_mask(luma: np.ndarray, block_size: int) -> np.ndarray:
    """Compute per-block Shannon entropy of an 8-bit luma image, return per-pixel mask in [0,1].

    Block-tiled (no bilinear upsample for now — matches entropy_map.py convention).
    """
    h, w = luma.shape
    pad_h = (block_size - h % block_size) % block_size
    pad_w = (block_size - w % block_size) % block_size
    luma_padded = (
        np.pad(luma, ((0, pad_h), (0, pad_w)), mode="edge")
        if (pad_h or pad_w)
        else luma
    )
    ph, pw = luma_padded.shape
    nby, nbx = ph // block_size, pw // block_size
    blocks = luma_padded.reshape(nby, block_size, nbx, block_size).transpose(0, 2, 1, 3)
    flat_blocks = blocks.reshape(nby, nbx, -1)  # (nby, nbx, bs*bs)

    entropy_vals = np.zeros((nby, nbx), dtype=np.float32)
    for i in range(nby):
        for j in range(nbx):
            values = flat_blocks[i, j]
            hist, _ = np.histogram(values, bins=256, range=(0, 256))
            probs = hist[hist > 0].astype(np.float32)
            if probs.size == 0:
                entropy_vals[i, j] = 0.0
                continue
            probs = probs / probs.sum()
            entropy_vals[i, j] = float(-np.sum(probs * np.log2(probs)))

    # Normalize: max entropy for 8-bit is log2(256) = 8.0
    entropy_vals = np.clip(entropy_vals / 8.0, 0.0, 1.0)
    # Tile back to padded shape, then crop to (h, w)
    entropy_tiled = np.repeat(
        np.repeat(entropy_vals, block_size, axis=0), block_size, axis=1
    )
    return entropy_tiled[:h, :w].astype(np.float32)


def apply(
    frame: np.ndarray,
    params: dict,
    state_in: dict | None = None,
    *,
    frame_index: int,
    seed: int,
    resolution: tuple[int, int],
) -> tuple[np.ndarray, dict | None]:
    """Apply entropy-gated domain warp.

    Algorithm:
        1. luma = rgb_to_luma(frame)
        2. mask = block_entropy(luma) ** entropy_curve, optionally inverted, optionally temporally smoothed
        3. (dx, dy) = fractal_noise_2d × max_offset_px × intensity × mask
        4. result = remap_frame(frame, dx, dy, boundary_mode)

    State (when temporal_smooth > 0):
        prev_mask: H×W float32 — last frame's entropy mask for EMA smoothing
    """
    # PLAY-005: clamp every numeric param at the trust boundary
    intensity = max(0.0, min(1.0, float(params.get("intensity", 0.5))))
    max_offset_px = max(1.0, min(100.0, float(params.get("max_offset_px", 20.0))))
    noise_scale = max(10.0, min(200.0, float(params.get("noise_scale", 60.0))))
    noise_octaves = max(1, min(6, int(params.get("noise_octaves", 3))))
    entropy_block = max(4, min(32, int(params.get("entropy_block", 8))))
    entropy_curve = max(0.5, min(4.0, float(params.get("entropy_curve", 1.5))))
    time_evolve = max(0.0, min(5.0, float(params.get("time_evolve", 1.0))))
    temporal_smooth = max(0.0, min(1.0, float(params.get("temporal_smooth", 0.3))))

    mode = str(params.get("mode", "forward"))
    if mode not in {"forward", "inverse"}:
        mode = "forward"

    boundary_mode = str(params.get("boundary_mode", "mirror"))
    if boundary_mode not in {"clamp", "wrap", "mirror", "black"}:
        boundary_mode = "mirror"

    h, w = frame.shape[:2]
    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4] if frame.shape[2] == 4 else None

    # Identity short-circuit — saves an entropy pass on disabled effect
    if intensity <= 0.0:
        # Still maintain state shape on dim-change so downstream toggles work cleanly
        if state_in is not None and state_in.get("prev_mask") is not None:
            pm = state_in["prev_mask"]
            if pm.shape == (h, w):
                return frame.copy(), {"prev_mask": pm}
        return frame.copy(), None

    # 1. Luma from RGB (Rec. 601)
    luma = (
        0.299 * rgb[:, :, 0].astype(np.float32)
        + 0.587 * rgb[:, :, 1].astype(np.float32)
        + 0.114 * rgb[:, :, 2].astype(np.float32)
    )
    # _block_entropy_mask expects 0..255 integer-range luma but works on float
    mask = _block_entropy_mask(luma.astype(np.uint8), entropy_block)

    # 2. Apply entropy curve (gamma)
    mask = np.power(np.clip(mask, 0.0, 1.0), entropy_curve)
    # NaN guard (PLAY-005): np.power on bad input could produce NaN
    if not np.all(np.isfinite(mask)):
        mask = np.nan_to_num(mask, nan=0.0, posinf=1.0, neginf=0.0)
    mask = np.clip(mask, 0.0, 1.0).astype(np.float32)

    # 3. Inverse mode: flat regions warp, busy ones stay still
    if mode == "inverse":
        mask = 1.0 - mask

    # 4. Temporal smoothing via state (EMA)
    state_out: dict | None = None
    if temporal_smooth > 0.0:
        prev_mask = None
        if state_in is not None:
            pm = state_in.get("prev_mask")
            if pm is not None and pm.shape == (h, w):
                prev_mask = pm.astype(np.float32)
        if prev_mask is not None:
            mask = (
                temporal_smooth * prev_mask + (1.0 - temporal_smooth) * mask
            ).astype(np.float32)
        state_out = {"prev_mask": mask.copy()}

    # 5. Generate fractal-noise displacement, animated by frame_index × time_evolve
    time_seed = int(seed) + int(frame_index * time_evolve * 100)
    dx = fractal_noise_2d(
        h, w, octaves=noise_octaves, base_scale=noise_scale, seed=time_seed
    )
    dy = fractal_noise_2d(
        h,
        w,
        octaves=noise_octaves,
        base_scale=noise_scale,
        seed=time_seed + 50000,
    )
    # Center [0,1] noise around 0 → [-1, 1], then scale by max_offset × intensity × mask
    dx = (dx - 0.5) * 2.0
    dy = (dy - 0.5) * 2.0
    scale_field = (mask * max_offset_px * intensity).astype(np.float32)
    dx_warp = (dx * scale_field).astype(np.float32)
    dy_warp = (dy * scale_field).astype(np.float32)

    # NaN guard before remap
    if not (np.all(np.isfinite(dx_warp)) and np.all(np.isfinite(dy_warp))):
        dx_warp = np.nan_to_num(dx_warp, nan=0.0, posinf=0.0, neginf=0.0)
        dy_warp = np.nan_to_num(dy_warp, nan=0.0, posinf=0.0, neginf=0.0)

    # 6. Apply via shared remap
    if alpha is not None:
        result = remap_frame(frame, dx_warp, dy_warp, boundary=boundary_mode)
    else:
        result = remap_frame(frame, dx_warp, dy_warp, boundary=boundary_mode)

    return result, state_out
