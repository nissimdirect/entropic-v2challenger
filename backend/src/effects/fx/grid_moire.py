"""Grid Moire — interference of TWO independently animated, liquify-able meshes.

Two meshes (A and B), each with its own size, angle, rotation, scroll, and
liquify (turbulent domain-warp) controls. Their interference beat is the moiré.
A brightness-preserving blend keeps fringes visible (no black collapse). Pure
function, deterministic in frame_index.
"""

import numpy as np

EFFECT_ID = "fx.grid_moire"
EFFECT_NAME = "Grid Moire"
EFFECT_CATEGORY = "generator"


def _mesh_params(prefix: str, size_def: int, angle_def: float) -> dict:
    p = prefix
    label = prefix.upper().rstrip("_")
    return {
        f"{p}size": {
            "type": "int",
            "min": 2,
            "max": 128,
            "default": size_def,
            "label": f"{label} Size",
            "curve": "linear",
            "unit": "px",
            "description": f"Mesh {label} grating period",
        },
        f"{p}angle": {
            "type": "float",
            "min": 0.0,
            "max": 360.0,
            "default": angle_def,
            "label": f"{label} Angle",
            "curve": "linear",
            "unit": "deg",
            "description": f"Mesh {label} base rotation",
        },
        f"{p}rotate": {
            "type": "float",
            "min": -15.0,
            "max": 15.0,
            "default": 0.0,
            "label": f"{label} Rotate",
            "curve": "linear",
            "unit": "°/f",
            "description": f"Mesh {label} spin over time",
        },
        f"{p}scroll_x": {
            "type": "float",
            "min": -30.0,
            "max": 30.0,
            "default": 0.0,
            "label": f"{label} Scroll X",
            "curve": "linear",
            "unit": "px/f",
            "description": f"Mesh {label} horizontal scroll (infinite, wraps)",
        },
        f"{p}scroll_y": {
            "type": "float",
            "min": -30.0,
            "max": 30.0,
            "default": 0.0,
            "label": f"{label} Scroll Y",
            "curve": "linear",
            "unit": "px/f",
            "description": f"Mesh {label} vertical scroll (infinite, wraps)",
        },
        f"{p}liquify": {
            "type": "float",
            "min": 0.0,
            "max": 60.0,
            "default": 0.0,
            "label": f"{label} Liquify",
            "curve": "linear",
            "unit": "px",
            "description": f"Mesh {label} turbulent flow distortion (Photoshop-liquify feel)",
        },
        f"{p}liquify_speed": {
            "type": "float",
            "min": 0.0,
            "max": 5.0,
            "default": 1.0,
            "label": f"{label} Liq Speed",
            "curve": "linear",
            "unit": "x",
            "description": f"Mesh {label} liquify flow animation speed",
        },
    }


PARAMS: dict = {
    "interference": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 1.0,
        "label": "Interference",
        "curve": "linear",
        "unit": "",
        "description": "0 = single mesh overlay, 1 = full two-mesh moiré beat",
    },
    "sharpness": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.0,
        "label": "Sharpness",
        "curve": "linear",
        "unit": "",
        "description": "0 = smooth sine gratings, 1 = hard square grid",
    },
    "opacity": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.85,
        "label": "Mix",
        "curve": "linear",
        "unit": "",
        "description": "Strength of the moiré over the source",
    },
    "source_coupling": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.0,
        "label": "Source Couple",
        "curve": "linear",
        "unit": "",
        "description": "Image luma bends the mesh phase — the image contributes to the moiré",
    },
    **_mesh_params("a_", 12, 0.0),
    **_mesh_params("b_", 13, 6.0),
}


def _clampf(v, lo, hi, default):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return default
    if not np.isfinite(f):
        return default
    return max(lo, min(hi, f))


def _grating(coord: np.ndarray, period: float, sharpness: float) -> np.ndarray:
    """Sinusoidal grating in [-1, 1], optionally pushed toward a square wave."""
    s = np.sin((2.0 * np.pi / period) * coord)
    if sharpness > 0.0:
        k = 1.0 + sharpness * 8.0
        s = np.tanh(k * s) / np.tanh(k)
    return s


def _liquify(xc: np.ndarray, yc: np.ndarray, amount: float, t: float):
    """Turbulent domain-warp displacement (cheap layered-sine flow, animated by t)."""
    s = 1.0 / 22.0  # spatial flow scale (cycles per ~22px)
    # Cross-terms (sin inside sin) make the flow swirl/turbulent like a liquify brush.
    dx = np.sin(s * yc + t) + 0.5 * np.sin(
        2.1 * s * yc - 1.3 * t + 0.7 * np.sin(s * xc)
    )
    dy = np.sin(s * xc - 0.9 * t) + 0.5 * np.sin(
        1.9 * s * xc + 1.7 * t + 0.7 * np.sin(s * yc)
    )
    return amount * dx, amount * dy


def _mesh(xx, yy, cx, cy, prefix, params, fi, sharpness, source_phase):
    """Build a mesh's two grating fields (gx, gy in [-1,1]) with its own motion + liquify."""
    p = prefix
    size = max(2.0, _clampf(params.get(f"{p}size", 12), 2, 128, 12))
    angle = _clampf(params.get(f"{p}angle", 0.0), 0.0, 360.0, 0.0)
    rotate = _clampf(params.get(f"{p}rotate", 0.0), -15.0, 15.0, 0.0)
    sx = _clampf(params.get(f"{p}scroll_x", 0.0), -30.0, 30.0, 0.0)
    sy = _clampf(params.get(f"{p}scroll_y", 0.0), -30.0, 30.0, 0.0)
    liquify = _clampf(params.get(f"{p}liquify", 0.0), 0.0, 60.0, 0.0)
    liq_speed = _clampf(params.get(f"{p}liquify_speed", 1.0), 0.0, 5.0, 1.0)

    xc = xx - cx + sx * fi + source_phase
    yc = yy - cy + sy * fi + source_phase
    if liquify > 0.0:
        dx, dy = _liquify(xc, yc, liquify, liq_speed * fi * 0.1)
        xc = xc + dx
        yc = yc + dy

    ang = np.radians(angle + rotate * fi)
    u = xc * np.cos(ang) - yc * np.sin(ang)
    v = xc * np.sin(ang) + yc * np.cos(ang)
    return _grating(u, size, sharpness), _grating(v, size, sharpness)


def apply(
    frame: np.ndarray,
    params: dict,
    state_in: dict | None = None,
    *,
    frame_index: int,
    seed: int,
    resolution: tuple[int, int],
) -> tuple[np.ndarray, dict | None]:
    """Render the interference moiré of two independent meshes; blend brightness-preserving."""
    interference = _clampf(params.get("interference", 1.0), 0.0, 1.0, 1.0)
    sharpness = _clampf(params.get("sharpness", 0.0), 0.0, 1.0, 0.0)
    opacity = _clampf(params.get("opacity", 0.85), 0.0, 1.0, 0.85)
    source_coupling = _clampf(params.get("source_coupling", 0.0), 0.0, 1.0, 0.0)

    h, w = frame.shape[:2]
    rgb = frame[:, :, :3].astype(np.float32)
    alpha = frame[:, :, 3:4]

    fi = float(frame_index)
    cx, cy = w / 2.0, h / 2.0
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)

    source_phase = 0.0
    if source_coupling > 0.0:
        source_phase = source_coupling * (rgb.mean(axis=2) / 255.0) * 16.0

    gxA, gyA = _mesh(xx, yy, cx, cy, "a_", params, fi, sharpness, source_phase)
    gxB, gyB = _mesh(xx, yy, cx, cy, "b_", params, fi, sharpness, source_phase)

    # Mesh A as a [0,1] lattice (overlay mode); two-mesh interference beat (moiré mode).
    gridA01 = (0.5 + 0.5 * gxA) * (0.5 + 0.5 * gyA)
    beat = 0.5 * (gxA * gxB + gyA * gyB)  # [-1, 1], mean ~0
    moire = 0.5 + 0.5 * beat  # [0, 1], mean ~0.5 → stays visible
    field = (1.0 - interference) * gridA01 + interference * moire
    field = np.clip(field, 0.0, 1.0)[:, :, np.newaxis]

    # Brightness-preserving blend: field=1 keeps the source, field=0 darkens by `opacity`.
    result = rgb * (1.0 - opacity * (1.0 - field))
    result_rgb = np.clip(result, 0, 255).astype(np.uint8)
    return np.concatenate([result_rgb, alpha], axis=2), None
