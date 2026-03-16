"""Erosion Sim — simulated hydraulic erosion on frame heightmap."""

import numpy as np

from engine.determinism import make_rng

EFFECT_ID = "fx.erosion_sim"
EFFECT_NAME = "Erosion Sim"
EFFECT_CATEGORY = "misc"

PARAMS: dict = {
    "rain_rate": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.3,
        "label": "Rain Rate",
        "curve": "linear",
        "unit": "",
        "description": "Amount of water added per frame",
    },
    "erosion_strength": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.5,
        "label": "Erosion",
        "curve": "linear",
        "unit": "",
        "description": "How aggressively terrain erodes",
    },
    "deposition": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.3,
        "label": "Deposition",
        "curve": "linear",
        "unit": "",
        "description": "Rate of sediment deposition",
    },
    "steps_per_frame": {
        "type": "int",
        "min": 1,
        "max": 10,
        "default": 3,
        "label": "Steps/Frame",
        "curve": "linear",
        "unit": "",
        "description": "Erosion iterations per video frame",
    },
    "mix": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.5,
        "label": "Mix",
        "curve": "linear",
        "unit": "%",
        "description": "Blend between eroded and original",
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
    """Hydraulic erosion simulation on frame brightness as heightmap."""
    rain_rate = max(0.0, min(1.0, float(params.get("rain_rate", 0.3))))
    erosion_str = max(0.0, min(1.0, float(params.get("erosion_strength", 0.5))))
    deposition = max(0.0, min(1.0, float(params.get("deposition", 0.3))))
    steps = max(1, min(10, int(params.get("steps_per_frame", 3))))
    mix = max(0.0, min(1.0, float(params.get("mix", 0.5))))

    h, w = frame.shape[:2]
    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]
    rng = make_rng(seed + frame_index)

    # Initialize or restore heightmap
    if state_in is not None and "heightmap" in state_in:
        heightmap = state_in["heightmap"]
        water = state_in.get("water", np.zeros((h, w), dtype=np.float32))
        if heightmap.shape != (h, w):
            heightmap = None
    else:
        heightmap = None

    if heightmap is None:
        luma = (
            0.299 * rgb[:, :, 0].astype(np.float32)
            + 0.587 * rgb[:, :, 1].astype(np.float32)
            + 0.114 * rgb[:, :, 2].astype(np.float32)
        ) / 255.0
        heightmap = luma.copy()
        water = np.zeros((h, w), dtype=np.float32)

    for _ in range(steps):
        # Add rain
        water += rain_rate * 0.01 * rng.random((h, w)).astype(np.float32)

        # Compute gradient (height + water)
        total = heightmap + water
        # Flow to lowest neighbor using shifted arrays
        pad = np.pad(total, 1, mode="edge")
        diffs = np.zeros((h, w, 4), dtype=np.float32)
        diffs[:, :, 0] = total - pad[:-2, 1:-1]  # up
        diffs[:, :, 1] = total - pad[2:, 1:-1]  # down
        diffs[:, :, 2] = total - pad[1:-1, :-2]  # left
        diffs[:, :, 3] = total - pad[1:-1, 2:]  # right

        # Only flow downhill
        diffs = np.maximum(diffs, 0)
        flow_sum = diffs.sum(axis=2)
        flow_sum = np.where(flow_sum > 0, flow_sum, 1.0)

        # Transfer water and erode
        outflow = np.minimum(water, flow_sum * 0.25)
        water -= outflow

        # Erosion: remove terrain where water flows
        erode_amount = outflow * erosion_str * 0.1
        heightmap -= erode_amount
        heightmap = np.clip(heightmap, 0, 1)

        # Deposition: add back some sediment where water pools
        deposit_amount = water * deposition * 0.05
        heightmap += deposit_amount
        heightmap = np.clip(heightmap, 0, 1)

        # Evaporation
        water *= 0.95

    # Convert heightmap back to RGB
    eroded_gray = np.clip(heightmap * 255, 0, 255).astype(np.float32)
    eroded_rgb = np.stack([eroded_gray, eroded_gray, eroded_gray], axis=2)

    # Mix with original
    result = eroded_rgb * mix + rgb.astype(np.float32) * (1.0 - mix)
    result_rgb = np.clip(result, 0, 255).astype(np.uint8)

    state_out = {"heightmap": heightmap, "water": water}
    return np.concatenate([result_rgb, alpha], axis=2), state_out
