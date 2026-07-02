"""Transition: Column Cascade Reverse — vertical columns fill right to left.

Spec: docs/addendums/LAYER-TRANSITIONS.md, "Geometric Reveals" #2 (of 53).
Pattern-establisher for the transitions content sprint (ROADMAP.md §2.5
decision 2 / PD.13). Mirrors `fx.transition_column_cascade` — see that
module's docstring for the full contract-adaptation rationale (frame_a =
solid black stand-in, frame_b = the incoming frame, progress derived from
frame_index / duration_frames until real two-layer compositing lands).
"""

import numpy as np

EFFECT_ID = "fx.transition_column_cascade_reverse"
EFFECT_NAME = "Column Cascade Reverse"
EFFECT_CATEGORY = "transition"

PARAMS: dict = {
    "duration_frames": {
        "type": "int",
        "min": 1,
        "max": 600,
        "default": 30,
        "label": "Duration (frames)",
        "curve": "linear",
        "unit": "frames",
        "description": (
            "Frames for the cascade to fully reveal. progress = "
            "frame_index / duration_frames, clamped to 1.0."
        ),
    },
    "columns": {
        "type": "int",
        "min": 2,
        "max": 200,
        "default": 40,
        "label": "Columns",
        "curve": "linear",
        "unit": "",
        "description": "Number of vertical cascade columns.",
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
    """Vertical columns fill right to left as progress advances."""
    duration_frames = max(1, min(600, int(params.get("duration_frames", 30))))
    columns = max(2, min(200, int(params.get("columns", 40))))

    h, w = frame.shape[:2]
    progress = max(0.0, min(1.0, float(frame_index) / float(duration_frames)))

    rgb_b = frame[:, :, :3].astype(np.float64)
    rgb_a = np.zeros_like(rgb_b)  # solid black "outgoing" layer
    alpha_channel = frame[:, :, 3]

    # Same bucket mapping as the forward cascade, but the reveal order is
    # reversed: the rightmost column is bucket 0 (reveals first).
    col_idx = np.clip(
        (np.arange(w, dtype=np.float64) * columns / max(1, w)).astype(np.int64),
        0,
        columns - 1,
    )
    rev_idx = (columns - 1) - col_idx
    local_progress = np.clip(progress * columns - rev_idx, 0.0, 1.0)  # (w,)
    blend = local_progress.reshape(1, w, 1)

    rgb_result = rgb_a * (1.0 - blend) + rgb_b * blend
    rgb_result = np.clip(rgb_result, 0, 255).astype(np.uint8)

    result = np.dstack([rgb_result, alpha_channel])
    return result, None
