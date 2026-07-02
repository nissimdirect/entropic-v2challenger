"""Transition: Column Cascade — vertical columns fill left→right.

LAYER-TRANSITIONS.md #1 (Geometric Reveals). First of the 53-transition
content sprint (ROADMAP.md §2.5 decision 2) — establishes the shared
mechanism used by the remaining transitions: see
`docs/plans/transitions-pattern.md`.

Mechanism: a `transition` effect reads the incoming layer via the existing
`_sidechain_frame` convention (backend/src/effects/fx/sidechain_cross_blend.py)
and reveals it column-by-column as `progress` sweeps 0→1, using
`effects/shared/transitions.reveal_mask_1d` for the anti-aliased boundary.

No `_sidechain_frame` present (e.g. this transition isn't wired to a second
layer, or a test/oracle calls `apply()` directly) -> identity passthrough.
This mirrors the IDENTITY_BY_DEFAULT sidechain convention in
backend/tests/test_all_effects.py.
"""

import numpy as np

from effects.shared.transitions import (
    blend_with_mask,
    get_sidechain_rgb,
    reveal_mask_1d,
)

EFFECT_ID = "fx.transition_column_cascade"
EFFECT_NAME = "Column Cascade"
EFFECT_CATEGORY = "transition"

PARAMS: dict = {
    "progress": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.0,
        "label": "Progress",
        "curve": "linear",
        "unit": "%",
        "description": "Reveal position: 0 = layer A only, 1 = fully replaced by layer B (sidechain input).",
    },
    "edge_softness": {
        "type": "float",
        "min": 0.0,
        "max": 0.5,
        "default": 0.04,
        "label": "Edge Softness",
        "curve": "linear",
        "unit": "",
        "description": "Width of the anti-aliased blend band at the reveal boundary, as a fraction of frame width.",
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
    """Column Cascade: reveal layer B in vertical columns, left→right."""
    _ = (frame_index, seed, resolution, state_in)  # part of contract; unused

    # PLAY-005: clamp every numeric param at the trust boundary
    progress = max(0.0, min(1.0, float(params.get("progress", 0.0))))
    edge_softness = max(0.0, min(0.5, float(params.get("edge_softness", 0.04))))

    key_rgb = get_sidechain_rgb(frame, params)
    if key_rgb is None:
        return frame.copy(), None

    h, w = frame.shape[:2]
    alpha = frame[:, :, 3:4]

    x = np.arange(w, dtype=np.float32)
    pos = x / max(1, w - 1)  # 0 (left) .. 1 (right)
    mask_1d = reveal_mask_1d(pos, progress, edge_softness)
    mask = mask_1d.reshape(1, w, 1)

    result_rgb = blend_with_mask(frame[:, :, :3], key_rgb, mask)
    return np.concatenate([result_rgb, alpha], axis=2), None
