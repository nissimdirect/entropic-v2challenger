"""Reaction Mosh — datamosh × Gray-Scott reaction-diffusion.

Glitch that decays/grows organically. The Gray-Scott B field gates how much
of the previous frame leaks through into the current one — high-B regions
mosh, low-B regions stay clean. As the PDE evolves, the mosh territories
drift and bloom like a chemical reaction.

Frankenstein recipe:
- `effects/fx/datamosh.py` — frame-buffer carry + per-pixel blend
- `effects/fx/reaction_diffusion.py` — Gray-Scott U/V fields seeded from luma
- combination: V (or 1-A in some Gray-Scott parameterizations) becomes the
  per-pixel mosh-strength mask
"""

import numpy as np
from scipy.ndimage import convolve

EFFECT_ID = "fx.reaction_mosh"
EFFECT_NAME = "Reaction Mosh"
EFFECT_CATEGORY = "destruction"

PARAMS: dict = {
    "intensity": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.6,
        "label": "Intensity",
        "curve": "linear",
        "unit": "%",
        "description": "Master mosh blend strength — higher = more previous-frame leakage in B-active regions",
    },
    "feed_rate": {
        "type": "float",
        "min": 0.01,
        "max": 0.08,
        "default": 0.055,
        "label": "Feed Rate",
        "curve": "linear",
        "unit": "",
        "description": "Gray-Scott f — controls Turing-pattern type (spots, stripes, labyrinths)",
    },
    "kill_rate": {
        "type": "float",
        "min": 0.04,
        "max": 0.07,
        "default": 0.062,
        "label": "Kill Rate",
        "curve": "linear",
        "unit": "",
        "description": "Gray-Scott k — controls Turing-pattern type",
    },
    "diffusion_a": {
        "type": "float",
        "min": 0.5,
        "max": 1.5,
        "default": 1.0,
        "label": "Diffusion A",
        "curve": "linear",
        "unit": "",
        "description": "Diffusion rate for activator (chemical A)",
    },
    "diffusion_b": {
        "type": "float",
        "min": 0.1,
        "max": 0.8,
        "default": 0.5,
        "label": "Diffusion B",
        "curve": "linear",
        "unit": "",
        "description": "Diffusion rate for inhibitor (chemical B)",
    },
    "pde_steps_per_frame": {
        "type": "int",
        "min": 1,
        "max": 10,
        "default": 3,
        "label": "PDE Steps/Frame",
        "curve": "linear",
        "unit": "",
        "description": "Gray-Scott iterations per video frame — more = faster pattern evolution",
    },
    "seed_pattern": {
        "type": "choice",
        "options": ["luma", "center", "edges", "random"],
        "default": "luma",
        "label": "Seed Pattern",
        "description": "How to seed the initial B field from the first frame",
    },
}

# 5-point laplacian with diagonal weighting (matches reaction_diffusion.py)
_LAPLACIAN = np.array(
    [[0.05, 0.20, 0.05], [0.20, -1.00, 0.20], [0.05, 0.20, 0.05]],
    dtype=np.float32,
)


def _seed_b_field(rgb: np.ndarray, mode: str, seed: int) -> np.ndarray:
    """Build initial B field from the first frame per the chosen seed pattern."""
    h, w = rgb.shape[:2]
    luma = (
        0.299 * rgb[:, :, 0].astype(np.float32)
        + 0.587 * rgb[:, :, 1].astype(np.float32)
        + 0.114 * rgb[:, :, 2].astype(np.float32)
    ) / 255.0

    B = np.zeros((h, w), dtype=np.float32)
    if mode == "luma":
        B[luma > 0.5] = 1.0
    elif mode == "center":
        cy, cx = h // 2, w // 2
        r = max(4, min(h, w) // 8)
        yy, xx = np.ogrid[:h, :w]
        B[(yy - cy) ** 2 + (xx - cx) ** 2 <= r * r] = 1.0
    elif mode == "edges":
        # B = high-gradient regions
        gy = np.abs(np.diff(luma, axis=0, prepend=luma[:1]))
        gx = np.abs(np.diff(luma, axis=1, prepend=luma[:, :1]))
        edge = np.sqrt(gx * gx + gy * gy)
        B[edge > np.quantile(edge, 0.85)] = 1.0
    else:  # random
        rng = np.random.default_rng(int(seed) & 0xFFFFFFFF)
        B = (rng.random((h, w)) > 0.5).astype(np.float32)
    return B


def apply(
    frame: np.ndarray,
    params: dict,
    state_in: dict | None = None,
    *,
    frame_index: int,
    seed: int,
    resolution: tuple[int, int],
) -> tuple[np.ndarray, dict | None]:
    """ReactionMosh: glitch that decays/grows organically."""
    # PLAY-005: clamp every numeric param at the trust boundary
    intensity = max(0.0, min(1.0, float(params.get("intensity", 0.6))))
    f = max(0.01, min(0.08, float(params.get("feed_rate", 0.055))))
    k = max(0.04, min(0.07, float(params.get("kill_rate", 0.062))))
    da = max(0.5, min(1.5, float(params.get("diffusion_a", 1.0))))
    db = max(0.1, min(0.8, float(params.get("diffusion_b", 0.5))))
    steps = max(1, min(10, int(params.get("pde_steps_per_frame", 3))))
    seed_mode = str(params.get("seed_pattern", "luma"))
    if seed_mode not in {"luma", "center", "edges", "random"}:
        seed_mode = "luma"

    h, w = frame.shape[:2]
    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]

    # Initialize on first call OR when resolution changed.
    if state_in is None:
        needs_init = True
    else:
        a = state_in.get("A")
        b = state_in.get("B")
        pf = state_in.get("prev_frame")
        needs_init = (
            a is None
            or b is None
            or pf is None
            or a.shape != (h, w)
            or pf.shape[:2] != (h, w)
        )
    if needs_init:
        A = np.ones((h, w), dtype=np.float32)
        B = _seed_b_field(rgb, seed_mode, seed)
        state_out = {
            "A": A,
            "B": B,
            "prev_frame": rgb.copy(),
        }
        return frame.copy(), state_out

    assert state_in is not None  # narrowed above
    A = state_in["A"]
    B = state_in["B"]
    prev_frame = state_in["prev_frame"]
    _ = (frame_index, resolution)  # part of contract; not used here

    # Step Gray-Scott PDE forward
    for _ in range(steps):
        lap_a = convolve(A, _LAPLACIAN, mode="wrap")
        lap_b = convolve(B, _LAPLACIAN, mode="wrap")
        abb = A * B * B
        A_new = A + da * lap_a - abb + f * (1.0 - A)
        B_new = B + db * lap_b + abb - (k + f) * B
        A = np.clip(A_new, 0.0, 1.0)
        B = np.clip(B_new, 0.0, 1.0)

    # Per-pixel mosh strength — B-active = mosh, B-quiescent = clean.
    mosh_strength = (B * intensity)[:, :, np.newaxis].astype(np.float32)  # (h, w, 1)

    cur_f = rgb.astype(np.float32)
    prev_f = prev_frame.astype(np.float32)
    out_rgb = cur_f * (1.0 - mosh_strength) + prev_f * mosh_strength

    state_out = {
        "A": A,
        "B": B,
        "prev_frame": rgb.copy(),
    }
    result = np.concatenate([np.clip(out_rgb, 0, 255).astype(np.uint8), alpha], axis=2)
    return result, state_out
