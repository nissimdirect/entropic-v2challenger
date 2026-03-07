"""Reaction Diffusion — Gray-Scott model evolving over frames."""

import numpy as np
from scipy.signal import convolve2d

EFFECT_ID = "fx.reaction_diffusion"
EFFECT_NAME = "Reaction Diffusion"
EFFECT_CATEGORY = "emergent"

PARAMS: dict = {
    "feed_rate": {
        "type": "float",
        "min": 0.01,
        "max": 0.08,
        "default": 0.055,
        "label": "Feed Rate",
        "curve": "linear",
        "unit": "",
        "description": "Feed rate (f) — controls pattern type",
    },
    "kill_rate": {
        "type": "float",
        "min": 0.04,
        "max": 0.07,
        "default": 0.062,
        "label": "Kill Rate",
        "curve": "linear",
        "unit": "",
        "description": "Kill rate (k) — controls pattern type",
    },
    "diffusion_a": {
        "type": "float",
        "min": 0.5,
        "max": 1.5,
        "default": 1.0,
        "label": "Diffusion A",
        "curve": "linear",
        "unit": "",
        "description": "Diffusion rate for chemical A",
    },
    "diffusion_b": {
        "type": "float",
        "min": 0.1,
        "max": 0.8,
        "default": 0.5,
        "label": "Diffusion B",
        "curve": "linear",
        "unit": "",
        "description": "Diffusion rate for chemical B",
    },
    "steps_per_frame": {
        "type": "int",
        "min": 1,
        "max": 20,
        "default": 5,
        "label": "Steps/Frame",
        "curve": "linear",
        "unit": "",
        "description": "Simulation steps per video frame",
    },
    "mix": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.5,
        "label": "Mix",
        "curve": "linear",
        "unit": "%",
        "description": "Blend between RD pattern and original",
    },
}

# Laplacian kernel for diffusion
_LAPLACIAN = np.array(
    [[0.05, 0.2, 0.05], [0.2, -1.0, 0.2], [0.05, 0.2, 0.05]], dtype=np.float32
)


def apply(
    frame: np.ndarray,
    params: dict,
    state_in: dict | None = None,
    *,
    frame_index: int,
    seed: int,
    resolution: tuple[int, int],
) -> tuple[np.ndarray, dict | None]:
    """Gray-Scott reaction-diffusion evolving across frames."""
    f = max(0.01, min(0.08, float(params.get("feed_rate", 0.055))))
    k = max(0.04, min(0.07, float(params.get("kill_rate", 0.062))))
    da = max(0.5, min(1.5, float(params.get("diffusion_a", 1.0))))
    db = max(0.1, min(0.8, float(params.get("diffusion_b", 0.5))))
    steps = max(1, min(20, int(params.get("steps_per_frame", 5))))
    mix = max(0.0, min(1.0, float(params.get("mix", 0.5))))

    h, w = frame.shape[:2]
    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]

    # Initialize or restore state
    if state_in is not None and "A" in state_in and "B" in state_in:
        A = state_in["A"]
        B = state_in["B"]
        # Handle resolution changes
        if A.shape != (h, w):
            A = np.ones((h, w), dtype=np.float32)
            B = np.zeros((h, w), dtype=np.float32)
    else:
        A = np.ones((h, w), dtype=np.float32)
        B = np.zeros((h, w), dtype=np.float32)
        # Seed B from frame brightness
        luma = (
            0.299 * rgb[:, :, 0].astype(np.float32)
            + 0.587 * rgb[:, :, 1].astype(np.float32)
            + 0.114 * rgb[:, :, 2].astype(np.float32)
        ) / 255.0
        # Use bright spots as seed regions for B
        B[luma > 0.5] = 1.0

    # Run simulation steps
    for _ in range(steps):
        lap_a = convolve2d(A, _LAPLACIAN, mode="same", boundary="wrap")
        lap_b = convolve2d(B, _LAPLACIAN, mode="same", boundary="wrap")
        abb = A * B * B
        A_new = A + da * lap_a - abb + f * (1.0 - A)
        B_new = B + db * lap_b + abb - (k + f) * B
        A = np.clip(A_new, 0.0, 1.0)
        B = np.clip(B_new, 0.0, 1.0)

    # Visualize: B concentration as grayscale pattern
    pattern = (B * 255).astype(np.float32)
    pattern_rgb = np.stack([pattern, pattern, pattern], axis=2)

    # Mix with original
    original_f = rgb.astype(np.float32)
    result = pattern_rgb * mix + original_f * (1.0 - mix)
    result_rgb = np.clip(result, 0, 255).astype(np.uint8)

    state_out = {"A": A, "B": B}
    return np.concatenate([result_rgb, alpha], axis=2), state_out
