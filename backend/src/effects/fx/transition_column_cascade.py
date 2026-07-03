"""Transition: Column Cascade — vertical columns fill left to right.

Spec: docs/addendums/LAYER-TRANSITIONS.md, "Geometric Reveals" #1 (of 53).
Pattern-establisher for the transitions content sprint (ROADMAP.md §2.5
decision 2 / PD.13 — "first 3 establish the pattern, remainder = batch work").

Contract note: the addendum's target architecture is a two-layer signature
(`frame_a, frame_b, params, progress, state_in -> result, state_out`), but
real layer-to-layer compositing doesn't exist yet in this codebase (it is
gated on Phase 5 / B5 composite-tree work per ROADMAP.md §2.5). Until then,
this transition runs inside the EXISTING single-frame effect contract used by
every other `fx.*` effect:

  - `frame_b` (the "incoming" layer) = the `frame` argument passed in.
  - `frame_a` (the "outgoing" layer) = solid black, standing in for "nothing
    revealed yet". Alpha is carried through unchanged from the source frame
    so the transition only affects color, not transparency.
  - `progress` = `frame_index / duration_frames`, clamped to [0, 1] — driven
    by the existing per-frame render loop instead of a real second layer.

This is deterministic and produces a genuinely visible reveal at defaults.
When real two-layer compositing lands, `frame_a` becomes a second real input
and `progress` threads through from the compositor instead of frame_index.
"""

import numpy as np

EFFECT_ID = "fx.transition_column_cascade"
EFFECT_NAME = "Column Cascade"
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
    """Vertical columns fill left to right as progress advances."""
    duration_frames = max(1, min(600, int(params.get("duration_frames", 30))))
    columns = max(2, min(200, int(params.get("columns", 40))))

    h, w = frame.shape[:2]
    progress = max(0.0, min(1.0, float(frame_index) / float(duration_frames)))

    rgb_b = frame[:, :, :3].astype(np.float64)
    rgb_a = np.zeros_like(rgb_b)  # solid black "outgoing" layer
    alpha_channel = frame[:, :, 3]

    # Each pixel column maps to one of `columns` cascade buckets, left to
    # right. A bucket's local reveal ramps 0->1 over its slice of `progress`.
    col_idx = np.clip(
        (np.arange(w, dtype=np.float64) * columns / max(1, w)).astype(np.int64),
        0,
        columns - 1,
    )
    local_progress = np.clip(progress * columns - col_idx, 0.0, 1.0)  # (w,)
    blend = local_progress.reshape(1, w, 1)

    rgb_result = rgb_a * (1.0 - blend) + rgb_b * blend
    rgb_result = np.clip(rgb_result, 0, 255).astype(np.uint8)

    result = np.dstack([rgb_result, alpha_channel])
    return result, None
