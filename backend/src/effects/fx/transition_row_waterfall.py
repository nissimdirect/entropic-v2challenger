"""Transition: Row Waterfall — horizontal rows fill top to bottom.

Spec: docs/addendums/LAYER-TRANSITIONS.md, "Geometric Reveals" #3 (of 53).
Pattern-establisher for the transitions content sprint (ROADMAP.md §2.5
decision 2 / PD.13). Same contract adaptation as `fx.transition_column_cascade`
(see that module's docstring for the full rationale), applied along the row
axis instead of the column axis: frame_a = solid black stand-in, frame_b =
the incoming frame, progress derived from frame_index / duration_frames until
real two-layer compositing lands.
"""

import numpy as np

EFFECT_ID = "fx.transition_row_waterfall"
EFFECT_NAME = "Row Waterfall"
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
            "Frames for the waterfall to fully reveal. progress = "
            "frame_index / duration_frames, clamped to 1.0."
        ),
    },
    "rows": {
        "type": "int",
        "min": 2,
        "max": 200,
        "default": 40,
        "label": "Rows",
        "curve": "linear",
        "unit": "",
        "description": "Number of horizontal waterfall rows.",
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
    """Horizontal rows fill top to bottom as progress advances."""
    duration_frames = max(1, min(600, int(params.get("duration_frames", 30))))
    rows = max(2, min(200, int(params.get("rows", 40))))

    h, w = frame.shape[:2]
    progress = max(0.0, min(1.0, float(frame_index) / float(duration_frames)))

    rgb_b = frame[:, :, :3].astype(np.float64)
    rgb_a = np.zeros_like(rgb_b)  # solid black "outgoing" layer
    alpha_channel = frame[:, :, 3]

    # Each pixel row maps to one of `rows` waterfall buckets, top to bottom.
    # A bucket's local reveal ramps 0->1 over its slice of `progress`.
    row_idx = np.clip(
        (np.arange(h, dtype=np.float64) * rows / max(1, h)).astype(np.int64),
        0,
        rows - 1,
    )
    local_progress = np.clip(progress * rows - row_idx, 0.0, 1.0)  # (h,)
    blend = local_progress.reshape(h, 1, 1)

    rgb_result = rgb_a * (1.0 - blend) + rgb_b * blend
    rgb_result = np.clip(rgb_result, 0, 255).astype(np.uint8)

    result = np.dstack([rgb_result, alpha_channel])
    return result, None
