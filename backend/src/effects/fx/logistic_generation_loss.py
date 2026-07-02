"""Logistic Generation Loss — recursive JPEG generation-loss driven by the logistic-map cascade.

The per-frame number of compression passes (and/or JPEG quality) is governed by an
iterated logistic map `x_{n+1} = r * x_n * (1 - x_n)`. In the stable regime (r < 3.0)
artifact level holds steady; cross 3.0 and it period-doubles; beyond ~3.57 the
trajectory enters chaos — artifact intensity flickers deterministically but
unpredictably. The compression decay literally lives in chaos theory.

Frankenstein recipe:
- `effects/fx/generation_loss.py` — N-pass JPEG encode/decode loop (cv2.imencode)
- `effects/fx/logistic_cascade.py` — iterated logistic-map kernel (1-D state here,
  not a per-pixel field)

State: a single float `x` in (0, 1) stepped each frame.
"""

import cv2
import numpy as np

EFFECT_ID = "fx.logistic_generation_loss"
EFFECT_NAME = "Logistic Generation Loss"
EFFECT_CATEGORY = "codec_archaeology"

PARAMS: dict = {
    "mode": {
        "type": "choice",
        "options": ["passes", "quality", "both"],
        "default": "passes",
        "label": "Mode",
        "description": (
            "How x drives the codec: passes (depth), quality (q sweep), or both"
        ),
    },
    "r": {
        "type": "float",
        "min": 1.0,
        "max": 4.0,
        "default": 3.95,
        "label": "R (Chaos)",
        "curve": "linear",
        "unit": "",
        "description": "Logistic map parameter — bifurcation at 3.0, chaos at 3.57+",
    },
    "max_passes": {
        "type": "int",
        "min": 1,
        "max": 30,
        "default": 8,
        "label": "Max Passes",
        "curve": "linear",
        "unit": "",
        "description": "Upper bound on JPEG encode/decode generations (when x=1)",
    },
    "min_passes": {
        "type": "int",
        "min": 0,
        "max": 30,
        "default": 1,
        "label": "Min Passes",
        "curve": "linear",
        "unit": "",
        "description": "Lower bound on JPEG generations (when x=0)",
    },
    "q_min": {
        "type": "int",
        "min": 5,
        "max": 95,
        "default": 15,
        "label": "Q Min",
        "curve": "linear",
        "unit": "",
        "description": "JPEG quality at x=1 (lower = more artifacts)",
    },
    "q_max": {
        "type": "int",
        "min": 5,
        "max": 95,
        "default": 85,
        "label": "Q Max",
        "curve": "linear",
        "unit": "",
        "description": "JPEG quality at x=0 (higher = cleaner)",
    },
    "iter_per_frame": {
        "type": "int",
        "min": 1,
        "max": 10,
        "default": 1,
        "label": "Iter/Frame",
        "curve": "linear",
        "unit": "",
        "description": "Logistic-map iterations per video frame",
    },
    "seed_x": {
        "type": "float",
        "min": 0.01,
        "max": 0.99,
        "default": 0.5,
        "label": "Seed X",
        "curve": "linear",
        "unit": "",
        "description": "Initial x value of the logistic map",
    },
    "intensity": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 1.0,
        "label": "Intensity",
        "curve": "linear",
        "unit": "%",
        "description": "Wet/dry blend between degraded and original",
    },
}

_VALID_MODES = ("passes", "quality", "both")


def _step_logistic(x: float, r: float, iters: int) -> float:
    """Iterate x <- r*x*(1-x), keeping x strictly inside (0, 1)."""
    for _ in range(iters):
        x = r * x * (1.0 - x)
        # PLAY-005: hard guard. r > 4 or numeric drift can push x out of [0,1].
        if not np.isfinite(x):
            x = 0.5
        if x <= 0.0:
            x = 1e-3
        elif x >= 1.0:
            x = 1.0 - 1e-3
    return float(x)


def apply(
    frame: np.ndarray,
    params: dict,
    state_in: dict | None = None,
    *,
    frame_index: int,
    seed: int,
    resolution: tuple[int, int],
) -> tuple[np.ndarray, dict | None]:
    """Recursive JPEG generation-loss with depth/quality driven by the logistic map."""
    # PLAY-005: clamp every numeric input from the trust boundary.
    mode = str(params.get("mode", "passes"))
    if mode not in _VALID_MODES:
        mode = "passes"

    r = max(1.0, min(4.0, float(params.get("r", 3.95))))
    max_passes = max(1, min(30, int(params.get("max_passes", 8))))
    min_passes = max(0, min(30, int(params.get("min_passes", 1))))
    if min_passes > max_passes:
        min_passes = max_passes
    q_min_raw = max(5, min(95, int(params.get("q_min", 15))))
    q_max_raw = max(5, min(95, int(params.get("q_max", 85))))
    # Allow swapped q range (user may want inverse mapping); keep both clamped.
    q_lo, q_hi = (
        (q_min_raw, q_max_raw) if q_min_raw <= q_max_raw else (q_max_raw, q_min_raw)
    )
    iter_per_frame = max(1, min(10, int(params.get("iter_per_frame", 1))))
    seed_x = float(params.get("seed_x", 0.5))
    if not np.isfinite(seed_x):
        seed_x = 0.5
    seed_x = max(0.01, min(0.99, seed_x))
    intensity = max(0.0, min(1.0, float(params.get("intensity", 1.0))))

    # Restore or initialize the logistic-map state.
    if state_in is not None and "x" in state_in:
        x = float(state_in.get("x", seed_x))
        if not np.isfinite(x) or x <= 0.0 or x >= 1.0:
            x = seed_x
    else:
        x = seed_x

    # Step the map this frame.
    x = _step_logistic(x, r, iter_per_frame)

    # Map x in [0,1] -> codec parameters.
    if mode == "quality":
        n_passes = max_passes  # fixed depth, x sweeps quality
        q = int(round(q_hi - x * (q_hi - q_lo)))
    elif mode == "both":
        span = max(0, max_passes - min_passes)
        n_passes = int(round(min_passes + x * span))
        q = int(round(q_hi - x * (q_hi - q_lo)))
    else:  # passes
        span = max(0, max_passes - min_passes)
        n_passes = int(round(min_passes + x * span))
        q = q_lo  # aggressive fixed quality so depth changes are visible

    n_passes = max(0, min(30, n_passes))
    q = max(5, min(95, q))

    state_out = {"x": x}

    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]

    if intensity <= 0.0 or n_passes <= 0:
        # Identity output — still update state so chaos trajectory advances.
        return frame.copy(), state_out

    # Recursive JPEG encode/decode (cv2 expects BGR ordering).
    current = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    encode_params = [cv2.IMWRITE_JPEG_QUALITY, q]
    for _ in range(n_passes):
        ok, buf = cv2.imencode(".jpg", current, encode_params)
        if not ok:
            break
        decoded = cv2.imdecode(buf, cv2.IMREAD_COLOR)
        if decoded is None:
            break
        current = decoded
    degraded = cv2.cvtColor(current, cv2.COLOR_BGR2RGB)

    if intensity >= 1.0:
        result_rgb = degraded
    else:
        blended = degraded.astype(np.float32) * intensity + rgb.astype(np.float32) * (
            1.0 - intensity
        )
        result_rgb = np.clip(blended, 0, 255).astype(np.uint8)

    return np.concatenate([result_rgb, alpha], axis=2), state_out
