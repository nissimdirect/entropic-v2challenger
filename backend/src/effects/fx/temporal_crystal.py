"""Temporal Crystal — time crystal pattern repeating at half the driving frequency."""

import numpy as np

EFFECT_ID = "fx.temporal_crystal"
EFFECT_NAME = "Temporal Crystal"
EFFECT_CATEGORY = "misc"

PARAMS: dict = {
    "period": {
        "type": "int",
        "min": 2,
        "max": 16,
        "default": 4,
        "label": "Period",
        "curve": "linear",
        "unit": "",
        "description": "Driving period in frames",
    },
    "transform": {
        "type": "choice",
        "options": ["invert", "rotate", "mirror"],
        "default": "invert",
        "label": "Transform",
        "description": "Transform applied at half-period",
    },
    "mix": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.5,
        "label": "Mix",
        "curve": "linear",
        "unit": "%",
        "description": "Blend between crystal pattern and original",
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
    """Time crystal — alternate transforms at half the driving frequency."""
    period = max(2, min(16, int(params.get("period", 4))))
    transform = str(params.get("transform", "invert"))
    mix = max(0.0, min(1.0, float(params.get("mix", 0.5))))

    h, w = frame.shape[:2]
    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]

    # Initialize or restore stored patterns
    if state_in is not None and "phase" in state_in:
        phase = state_in["phase"]
        pattern_a = state_in.get("pattern_a", rgb.copy())
        pattern_b = state_in.get("pattern_b")
        if pattern_a.shape != rgb.shape:
            pattern_a = rgb.copy()
            pattern_b = None
    else:
        phase = 0
        pattern_a = rgb.copy()
        pattern_b = None

    # Capture pattern at period boundaries
    if frame_index % period == 0:
        pattern_a = rgb.copy()
        if pattern_b is None:
            # Generate pattern_b by applying transform to pattern_a
            pattern_b = _apply_transform(pattern_a, transform)

    # At half-period, switch to transformed version
    half = period // 2
    cycle_pos = frame_index % period
    if cycle_pos < half:
        crystal = pattern_a
    else:
        if pattern_b is None:
            pattern_b = _apply_transform(pattern_a, transform)
        crystal = pattern_b

    # Mix with original
    result = rgb.astype(np.float32) * (1.0 - mix) + crystal.astype(np.float32) * mix
    result_rgb = np.clip(result, 0, 255).astype(np.uint8)

    state_out = {"phase": phase + 1, "pattern_a": pattern_a, "pattern_b": pattern_b}
    return np.concatenate([result_rgb, alpha], axis=2), state_out


def _apply_transform(img: np.ndarray, transform: str) -> np.ndarray:
    """Apply the specified transform to an image."""
    if transform == "invert":
        return 255 - img
    elif transform == "rotate":
        return np.rot90(img, 2)  # 180 degree rotation
    elif transform == "mirror":
        return np.fliplr(img)
    return img.copy()
