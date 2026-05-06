"""Edge Pixel Wind — Sobel-tangent flow as displacement field.

Edges become wind currents: pixels stream tangent to the contours they live
near. Even on a still frame, the image gets self-derived motion that traces
its own structure.

Frankenstein recipe:
- `effects/fx/edge_detect.py` — Sobel gx/gy gradient
- `effects/fx/flow_distort.py` — vector-field warp with intensity/smooth
- `effects/shared/displacement.py::remap_frame` — boundary-aware sample
- Optional accumulator (state["acc_dx"], state["acc_dy"]) for persistent advection

Algorithm:
    1. Sobel gx, gy on luma
    2. Tangent flow: (-gy, gx) — perpendicular to gradient = ALONG edges
    3. Edge magnitude as flow strength mask
    4. Gaussian-smooth tangent field
    5. Optional persistence: acc = acc * persistence + dx
    6. remap_frame with boundary mode

PLAY-005: every numeric param clamps at the trust boundary.
"""

import cv2
import numpy as np

from effects.shared.displacement import remap_frame

EFFECT_ID = "fx.edge_pixel_wind"
EFFECT_NAME = "Edge Pixel Wind"
EFFECT_CATEGORY = "destruction"

PARAMS: dict = {
    "strength_px": {
        "type": "float",
        "min": 0.0,
        "max": 50.0,
        "default": 10.0,
        "label": "Wind Strength",
        "curve": "linear",
        "unit": "px",
        "description": "Max pixel displacement magnitude along edges",
    },
    "smoothing_sigma": {
        "type": "float",
        "min": 0.0,
        "max": 10.0,
        "default": 2.0,
        "label": "Smoothing",
        "curve": "linear",
        "unit": "px",
        "description": "Gaussian blur sigma applied to the tangent field",
    },
    "edge_threshold": {
        "type": "float",
        "min": 0.0,
        "max": 0.5,
        "default": 0.05,
        "label": "Edge Threshold",
        "curve": "linear",
        "unit": "",
        "description": "Below this normalized magnitude, no flow is applied",
    },
    "accumulate": {
        "type": "bool",
        "default": False,
        "label": "Accumulate",
        "description": "Persistent advection — pixels drift further over time",
    },
    "persistence": {
        "type": "float",
        "min": 0.0,
        "max": 0.99,
        "default": 0.7,
        "label": "Persistence",
        "curve": "linear",
        "unit": "",
        "description": "Accumulator decay per frame (accumulate mode only)",
    },
    "boundary_mode": {
        "type": "choice",
        "options": ["clamp", "wrap", "mirror", "black"],
        "default": "clamp",
        "label": "Boundary Mode",
        "description": "Edge-of-frame sampling behavior",
    },
    "intensity": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 1.0,
        "label": "Intensity",
        "curve": "linear",
        "unit": "%",
        "description": "Wet/dry — blend between displaced output and original",
    },
}

# Hard cap on accumulator magnitude — prevents runaway drift in long sequences
_ACC_CLAMP_PX = 100.0


def _luma(rgb: np.ndarray) -> np.ndarray:
    """BT.601 luma in float32 [0..255]."""
    return (
        0.299 * rgb[:, :, 0].astype(np.float32)
        + 0.587 * rgb[:, :, 1].astype(np.float32)
        + 0.114 * rgb[:, :, 2].astype(np.float32)
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
    """EdgePixelWind: tangent-flow displacement driven by Sobel edges."""
    # PLAY-005: clamp every numeric param at the trust boundary
    strength_px = max(0.0, min(50.0, float(params.get("strength_px", 10.0))))
    smoothing_sigma = max(0.0, min(10.0, float(params.get("smoothing_sigma", 2.0))))
    edge_threshold = max(0.0, min(0.5, float(params.get("edge_threshold", 0.05))))
    accumulate = bool(params.get("accumulate", False))
    persistence = max(0.0, min(0.99, float(params.get("persistence", 0.7))))
    boundary_mode = str(params.get("boundary_mode", "clamp"))
    if boundary_mode not in {"clamp", "wrap", "mirror", "black"}:
        boundary_mode = "clamp"
    intensity = max(0.0, min(1.0, float(params.get("intensity", 1.0))))

    _ = (frame_index, seed, resolution)  # part of contract; not used here

    h, w = frame.shape[:2]
    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]

    # Luma -> Sobel gradient
    gray = _luma(rgb)
    gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)

    # Magnitude (edge mask) and tangent vectors (perpendicular to gradient)
    magnitude = np.sqrt(gx * gx + gy * gy) + 1e-8
    tx = -gy / magnitude
    ty = gx / magnitude

    # Optional Gaussian smoothing of tangent field
    if smoothing_sigma > 0.0:
        ksize = max(3, int(smoothing_sigma * 2) * 2 + 1)
        tx = cv2.GaussianBlur(tx, (ksize, ksize), smoothing_sigma)
        ty = cv2.GaussianBlur(ty, (ksize, ksize), smoothing_sigma)

    # Normalize edge magnitude to [0..1] and apply threshold gate
    mag_max = float(np.max(magnitude))
    if mag_max > 1e-6:
        edge_mask = magnitude / mag_max
    else:
        edge_mask = np.zeros_like(magnitude)
    edge_mask = np.where(edge_mask < edge_threshold, 0.0, edge_mask).astype(np.float32)

    # Frame-step displacement
    dx = (tx * edge_mask * strength_px).astype(np.float32)
    dy = (ty * edge_mask * strength_px).astype(np.float32)

    # Optional accumulator — persistent advection.
    state_out: dict | None = None
    if accumulate:
        # Initialize or restore accumulator buffers; reset on dim change.
        if (
            state_in is None
            or state_in.get("acc_dx") is None
            or state_in.get("acc_dy") is None
            or state_in["acc_dx"].shape != (h, w)
        ):
            acc_dx = np.zeros((h, w), dtype=np.float32)
            acc_dy = np.zeros((h, w), dtype=np.float32)
        else:
            acc_dx = state_in["acc_dx"]
            acc_dy = state_in["acc_dy"]

        acc_dx = (acc_dx * persistence + dx).astype(np.float32)
        acc_dy = (acc_dy * persistence + dy).astype(np.float32)
        # Hard clamp on accumulator magnitude to prevent runaway drift
        np.clip(acc_dx, -_ACC_CLAMP_PX, _ACC_CLAMP_PX, out=acc_dx)
        np.clip(acc_dy, -_ACC_CLAMP_PX, _ACC_CLAMP_PX, out=acc_dy)

        dx, dy = acc_dx, acc_dy
        state_out = {"acc_dx": acc_dx, "acc_dy": acc_dy}
    elif state_in is not None and (
        state_in.get("acc_dx") is not None or state_in.get("acc_dy") is not None
    ):
        # User toggled accumulator off mid-clip — drop the buffers.
        state_out = None

    # If strength is zero, skip the remap entirely (pure identity short-circuit)
    if strength_px == 0.0:
        return frame.copy(), state_out

    warped = remap_frame(frame, dx, dy, boundary=boundary_mode)

    # Wet/dry mix
    if intensity >= 1.0:
        result_rgb = warped[:, :, :3]
    else:
        cur_f = rgb.astype(np.float32)
        warped_f = warped[:, :, :3].astype(np.float32)
        out_rgb = warped_f * intensity + cur_f * (1.0 - intensity)
        result_rgb = np.clip(out_rgb, 0, 255).astype(np.uint8)

    result = np.concatenate([result_rgb, alpha], axis=2)
    return result, state_out
