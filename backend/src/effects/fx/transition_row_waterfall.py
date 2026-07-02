"""Transition: Row Waterfall — horizontal rows fill top→down.

LAYER-TRANSITIONS.md #3 (Geometric Reveals). Same mechanism as
`transition_column_cascade` (see that module's docstring and
`docs/plans/transitions-pattern.md`) — sweeps rows instead of columns.
"""

import numpy as np

from effects.shared.transitions import (
    blend_with_mask,
    get_sidechain_rgb,
    reveal_mask_1d,
)

EFFECT_ID = "fx.transition_row_waterfall"
EFFECT_NAME = "Row Waterfall"
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
        "description": "Width of the anti-aliased blend band at the reveal boundary, as a fraction of frame height.",
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
    """Row Waterfall: reveal layer B in horizontal rows, top→down."""
    _ = (frame_index, seed, resolution, state_in)  # part of contract; unused

    # PLAY-005: clamp every numeric param at the trust boundary
    progress = max(0.0, min(1.0, float(params.get("progress", 0.0))))
    edge_softness = max(0.0, min(0.5, float(params.get("edge_softness", 0.04))))

    key_rgb = get_sidechain_rgb(frame, params)
    if key_rgb is None:
        return frame.copy(), None

    h, w = frame.shape[:2]
    alpha = frame[:, :, 3:4]

    y = np.arange(h, dtype=np.float32)
    pos = y / max(1, h - 1)  # 0 (top) .. 1 (bottom)
    mask_1d = reveal_mask_1d(pos, progress, edge_softness)
    mask = mask_1d.reshape(h, 1, 1)

    result_rgb = blend_with_mask(frame[:, :, :3], key_rgb, mask)
    return np.concatenate([result_rgb, alpha], axis=2), None
