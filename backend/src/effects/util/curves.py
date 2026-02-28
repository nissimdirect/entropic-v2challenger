"""Curves effect — Bezier curve LUT generation with per-channel mode."""

import json
import numpy as np

EFFECT_ID = "util.curves"
EFFECT_NAME = "Curves"
EFFECT_CATEGORY = "util"

PARAMS: dict = {
    "points": {
        "type": "float",
        "min": 0,
        "max": 255,
        "default": 0,
        "label": "Control Points",
        "curve": "linear",
        "unit": "",
        "description": "Bezier control points as JSON [[x,y],...] — overridden by custom UI",
    },
    "channel": {
        "type": "choice",
        "options": ["master", "r", "g", "b", "a"],
        "default": "master",
        "label": "Channel",
        "description": "Which channel to apply curve to",
    },
    "interpolation": {
        "type": "choice",
        "options": ["cubic", "linear"],
        "default": "cubic",
        "label": "Interpolation",
        "description": "Curve interpolation method",
    },
}

# Default identity curve
_IDENTITY_POINTS: list[list[float]] = [
    [0, 0],
    [64, 64],
    [128, 128],
    [192, 192],
    [255, 255],
]

CHANNEL_MAP = {"r": 0, "g": 1, "b": 2, "a": 3}


def _parse_points(raw) -> list[list[float]]:
    """Parse control points from various input formats."""
    if isinstance(raw, str):
        try:
            pts = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return list(_IDENTITY_POINTS)
    elif isinstance(raw, list):
        pts = raw
    else:
        return list(_IDENTITY_POINTS)

    if not pts or not isinstance(pts, list):
        return list(_IDENTITY_POINTS)

    # Validate each point is [x, y]
    valid = []
    for p in pts:
        if isinstance(p, (list, tuple)) and len(p) >= 2:
            valid.append([float(p[0]), float(p[1])])
    if len(valid) < 2:
        return list(_IDENTITY_POINTS)

    return valid


def _build_lut(points: list[list[float]], interpolation: str) -> np.ndarray:
    """Build a 256-entry LUT from control points."""
    # Sort by x, deduplicate x values (keep last)
    points = sorted(points, key=lambda p: p[0])
    seen_x: dict[float, float] = {}
    for p in points:
        seen_x[p[0]] = p[1]
    points = [[x, y] for x, y in seen_x.items()]

    # Ensure endpoints
    if points[0][0] > 0:
        points.insert(0, [0.0, points[0][1]])
    if points[-1][0] < 255:
        points.append([255.0, points[-1][1]])

    xs = np.array([p[0] for p in points])
    ys = np.array([p[1] for p in points])

    x_out = np.arange(256, dtype=np.float64)

    if interpolation == "cubic" and len(points) >= 3:
        try:
            from scipy.interpolate import PchipInterpolator

            interp = PchipInterpolator(xs, ys)
            lut = interp(x_out)
        except ImportError:
            # Fallback to linear if scipy unavailable
            lut = np.interp(x_out, xs, ys)
    else:
        lut = np.interp(x_out, xs, ys)

    return np.clip(lut, 0, 255).astype(np.uint8)


def apply(
    frame: np.ndarray,
    params: dict,
    state_in: dict | None = None,
    *,
    frame_index: int,
    seed: int,
    resolution: tuple[int, int],
) -> tuple[np.ndarray, dict | None]:
    """Apply curves adjustment. Stateless."""
    if frame.size == 0:
        return frame.copy(), None

    raw_points = params.get("points", _IDENTITY_POINTS)
    channel = str(params.get("channel", "master"))
    interpolation = str(params.get("interpolation", "cubic"))

    points = _parse_points(raw_points)
    lut = _build_lut(points, interpolation)

    # Identity check — if LUT is identity, skip
    identity = np.arange(256, dtype=np.uint8)
    if np.array_equal(lut, identity):
        return frame.copy(), None

    output = frame.copy()

    if channel == "master":
        # Apply to R, G, B (preserve alpha)
        output[:, :, :3] = np.take(lut, frame[:, :, :3])
    elif channel in CHANNEL_MAP:
        ch = CHANNEL_MAP[channel]
        output[:, :, ch] = np.take(lut, frame[:, :, ch])

    return output, None
