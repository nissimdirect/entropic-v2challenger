"""Histogram Attractor — tone curve traced by a strange-attractor orbit.

Tonal grading that breathes chaos. Lorenz/Rossler/Thomas/Aizawa solver steps
each frame; (x, y, z) become 3 control points of a cubic-spline tone curve.
Apply curve as a 256-entry LUT (Luma mode = single curve via luma scale,
PerChannel mode = independent R/G/B curves driven by the same orbit).

Frankenstein recipe:
- `effects/fx/histogram_eq.py` — per-channel LUT pattern
- `effects/fx/strange_attractor.py` — Lorenz/Rossler/Thomas solver bodies
- New: cubic-spline curve builder + monotone enforcement

Algorithm:
1. Maintain `state["pos"]` — single attractor position in R^3.
2. Each frame: integrate forward `steps_per_frame` Euler steps at `dt`.
3. Squash via tanh into [-1, 1], remap to control-point Y values around
   (0.25, 0.5, 0.75) with per-band swing scales.
4. Build a 5-knot cubic spline through (0,0), (0.25, p_sh), (0.5, p_mid),
   (0.75, p_hi), (1,1) and bake into a 256-entry uint8 LUT.
5. Apply LUT per-channel or via luma scale; mix with original.
"""

import numpy as np

EFFECT_ID = "fx.histogram_attractor"
EFFECT_NAME = "Histogram Attractor"
EFFECT_CATEGORY = "color"

PARAMS: dict = {
    "attractor": {
        "type": "choice",
        "options": ["lorenz", "rossler", "thomas", "aizawa"],
        "default": "lorenz",
        "label": "Attractor",
        "description": "Which strange attractor drives the tone curve",
    },
    "mode": {
        "type": "choice",
        "options": ["luminance", "per_channel"],
        "default": "luminance",
        "label": "Mode",
        "description": "Single luma curve, or independent R/G/B curves",
    },
    "shadow_swing": {
        "type": "float",
        "min": 0.0,
        "max": 0.4,
        "default": 0.15,
        "label": "Shadow Swing",
        "curve": "linear",
        "unit": "",
        "description": "Max shadow lift/crush from attractor x",
    },
    "mid_swing": {
        "type": "float",
        "min": 0.0,
        "max": 0.4,
        "default": 0.15,
        "label": "Mid Swing",
        "curve": "linear",
        "unit": "",
        "description": "Max midtone drift from attractor y",
    },
    "high_swing": {
        "type": "float",
        "min": 0.0,
        "max": 0.4,
        "default": 0.15,
        "label": "High Swing",
        "curve": "linear",
        "unit": "",
        "description": "Max highlight bloom/crush from attractor z",
    },
    "dt": {
        "type": "float",
        "min": 0.001,
        "max": 0.05,
        "default": 0.01,
        "label": "Solver dt",
        "curve": "linear",
        "unit": "",
        "description": "Per-step solver dt — bigger = faster drift",
    },
    "steps_per_frame": {
        "type": "int",
        "min": 1,
        "max": 10,
        "default": 3,
        "label": "Steps/Frame",
        "curve": "linear",
        "unit": "",
        "description": "Solver steps per video frame",
    },
    "monotone_enforce": {
        "type": "bool",
        "default": True,
        "label": "Monotone Enforce",
        "description": "Force the tone curve to be non-decreasing",
    },
    "mix": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 1.0,
        "label": "Mix",
        "curve": "linear",
        "unit": "%",
        "description": "Wet/dry blend with original frame",
    },
}


# --- Solvers (single-point versions of strange_attractor.py) ---


def _lorenz(p: np.ndarray, dt: float) -> np.ndarray:
    sigma, rho, beta = 10.0, 28.0, 8.0 / 3.0
    x, y, z = p
    return p + np.array(
        [sigma * (y - x) * dt, (x * (rho - z) - y) * dt, (x * y - beta * z) * dt],
        dtype=np.float64,
    )


def _rossler(p: np.ndarray, dt: float) -> np.ndarray:
    a, b, c = 0.2, 0.2, 5.7
    x, y, z = p
    return p + np.array(
        [(-y - z) * dt, (x + a * y) * dt, (b + z * (x - c)) * dt],
        dtype=np.float64,
    )


def _thomas(p: np.ndarray, dt: float) -> np.ndarray:
    b = 0.208186
    x, y, z = p
    return p + np.array(
        [(np.sin(y) - b * x) * dt, (np.sin(z) - b * y) * dt, (np.sin(x) - b * z) * dt],
        dtype=np.float64,
    )


def _aizawa(p: np.ndarray, dt: float) -> np.ndarray:
    a, b, c, d, e, f = 0.95, 0.7, 0.6, 3.5, 0.25, 0.1
    x, y, z = p
    dx = ((z - b) * x - d * y) * dt
    dy = (d * x + (z - b) * y) * dt
    dz = (c + a * z - (z**3) / 3.0 - (x**2 + y**2) * (1.0 + e * z) + f * z * x**3) * dt
    return p + np.array([dx, dy, dz], dtype=np.float64)


_SOLVERS = {
    "lorenz": _lorenz,
    "rossler": _rossler,
    "thomas": _thomas,
    "aizawa": _aizawa,
}


# Aizawa attractors orbit at smaller magnitudes; rest hit ±20-30 routinely.
# Squashing via tanh(scale * coord) gives a smooth bounded value in (-1, 1).
_SQUASH_SCALE = {
    "lorenz": 0.05,
    "rossler": 0.08,
    "thomas": 0.3,
    "aizawa": 0.6,
}


def _seed_pos(attractor: str) -> np.ndarray:
    """Initial position in each attractor's basin of attraction."""
    seeds = {
        "lorenz": np.array([0.1, 0.0, 0.0], dtype=np.float64),
        "rossler": np.array([1.0, 1.0, 1.0], dtype=np.float64),
        "thomas": np.array([1.0, 0.0, 0.0], dtype=np.float64),
        "aizawa": np.array([0.1, 0.0, 0.0], dtype=np.float64),
    }
    return seeds.get(attractor, seeds["lorenz"]).copy()


def _build_lut(p_sh: float, p_mid: float, p_hi: float, monotone: bool) -> np.ndarray:
    """Build a 256-entry uint8 LUT from 5 knots via cubic-Hermite interpolation.

    Knots: (0,0), (0.25, p_sh), (0.5, p_mid), (0.75, p_hi), (1,1).
    Uses scipy.interpolate.CubicSpline if available, else falls back to a
    monotone Catmull-Rom to keep the dependency footprint minimal.
    """
    knots_x = np.array([0.0, 0.25, 0.5, 0.75, 1.0], dtype=np.float64)
    knots_y = np.array([0.0, p_sh, p_mid, p_hi, 1.0], dtype=np.float64)

    if monotone:
        # Force ys to be non-decreasing with a tiny epsilon between knots.
        for i in range(1, len(knots_y)):
            if knots_y[i] < knots_y[i - 1] + 1e-4:
                knots_y[i] = knots_y[i - 1] + 1e-4
        knots_y = np.clip(knots_y, 0.0, 1.0)

    xs = np.linspace(0.0, 1.0, 256, dtype=np.float64)

    try:
        from scipy.interpolate import CubicSpline

        cs = CubicSpline(knots_x, knots_y, bc_type="natural")
        ys = cs(xs)
    except Exception:
        # Fallback: piecewise cubic Hermite via numpy only.
        ys = np.interp(xs, knots_x, knots_y)
        # 3-tap smooth (one pass) so it's not pure linear in the fallback.
        ys = np.convolve(ys, np.array([0.25, 0.5, 0.25]), mode="same")

    if monotone:
        # Enforce monotone non-decreasing on the LUT itself.
        ys = np.maximum.accumulate(ys)

    ys = np.clip(ys * 255.0, 0.0, 255.0)
    return ys.astype(np.uint8)


def apply(
    frame: np.ndarray,
    params: dict,
    state_in: dict | None = None,
    *,
    frame_index: int,
    seed: int,
    resolution: tuple[int, int],
) -> tuple[np.ndarray, dict | None]:
    """Apply attractor-driven tone curve to the frame."""
    # PLAY-001 / PLAY-005: clamp every numeric param at the trust boundary.
    attractor = str(params.get("attractor", "lorenz"))
    if attractor not in _SOLVERS:
        attractor = "lorenz"

    mode = str(params.get("mode", "luminance"))
    if mode not in ("luminance", "per_channel"):
        mode = "luminance"

    sh_sw = max(0.0, min(0.4, float(params.get("shadow_swing", 0.15))))
    mid_sw = max(0.0, min(0.4, float(params.get("mid_swing", 0.15))))
    hi_sw = max(0.0, min(0.4, float(params.get("high_swing", 0.15))))
    dt = max(0.001, min(0.05, float(params.get("dt", 0.01))))
    steps = max(1, min(10, int(params.get("steps_per_frame", 3))))
    monotone = bool(params.get("monotone_enforce", True))
    mix = max(0.0, min(1.0, float(params.get("mix", 1.0))))

    # IDENTITY_BY_DEFAULT (stateful): zero swings + mix=0 means no-op,
    # but we still seed state on the first call so subsequent frames work.
    h, w = frame.shape[:2]
    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]
    _ = (frame_index, seed, resolution)  # part of contract; unused here

    # Initialize or restore solver state.
    if (
        state_in is None
        or "pos" not in state_in
        or state_in.get("attractor") != attractor
    ):
        pos = _seed_pos(attractor)
    else:
        pos = np.asarray(state_in["pos"], dtype=np.float64).copy()
        if pos.shape != (3,) or not np.all(np.isfinite(pos)):
            pos = _seed_pos(attractor)

    # Step solver forward.
    solver = _SOLVERS[attractor]
    for _ in range(steps):
        pos = solver(pos, dt)
        # Hard clamp magnitude so Rossler etc. cannot blow up.
        if not np.all(np.isfinite(pos)) or np.linalg.norm(pos) > 1e3:
            pos = _seed_pos(attractor)
            break

    # Squash to [-1, 1] then map to control-point Y values.
    scale = _SQUASH_SCALE.get(attractor, 0.05)
    sx, sy, sz = np.tanh(scale * pos)

    state_out = {"pos": pos, "attractor": attractor}

    # IDENTITY_BY_DEFAULT short-circuit: if all swings are zero AND mix is 0,
    # there's literally nothing to do — return input verbatim. We still keep
    # the solver state so the curve evolves even when the user re-enables.
    if mix <= 0.0 or (sh_sw == 0.0 and mid_sw == 0.0 and hi_sw == 0.0):
        return frame.copy(), state_out

    p_sh = float(np.clip(0.25 + sx * sh_sw, 0.0, 1.0))
    p_mid = float(np.clip(0.5 + sy * mid_sw, 0.0, 1.0))
    p_hi = float(np.clip(0.75 + sz * hi_sw, 0.0, 1.0))

    if mode == "per_channel":
        # Drive R, G, B from x, y, z by reusing the same orbit (visual color
        # split that still inherits the attractor's signature).
        lut_r = _build_lut(p_sh, p_mid, p_hi, monotone)
        lut_g = _build_lut(
            float(np.clip(0.25 + sy * sh_sw, 0.0, 1.0)),
            float(np.clip(0.5 + sz * mid_sw, 0.0, 1.0)),
            float(np.clip(0.75 + sx * hi_sw, 0.0, 1.0)),
            monotone,
        )
        lut_b = _build_lut(
            float(np.clip(0.25 + sz * sh_sw, 0.0, 1.0)),
            float(np.clip(0.5 + sx * mid_sw, 0.0, 1.0)),
            float(np.clip(0.75 + sy * hi_sw, 0.0, 1.0)),
            monotone,
        )
        out = np.empty_like(rgb)
        out[..., 0] = lut_r[rgb[..., 0]]
        out[..., 1] = lut_g[rgb[..., 1]]
        out[..., 2] = lut_b[rgb[..., 2]]
    else:  # luminance
        lut = _build_lut(p_sh, p_mid, p_hi, monotone)
        # Apply via luma-scale: keeps hue stable, only the brightness curve
        # changes. luma in [0..255], scale = new/old where old > 0.
        rgb_f = rgb.astype(np.float32)
        luma = 0.299 * rgb_f[..., 0] + 0.587 * rgb_f[..., 1] + 0.114 * rgb_f[..., 2]
        luma_idx = np.clip(luma, 0.0, 255.0).astype(np.uint8)
        new_luma = lut[luma_idx].astype(np.float32)
        # Avoid div by zero: when luma==0, use new_luma directly as bias.
        scale_arr = np.where(luma > 1.0, new_luma / np.maximum(luma, 1.0), 1.0)
        out_f = rgb_f * scale_arr[..., None]
        # Where original luma is ~0, just set RGB to new_luma flat (gray lift).
        zero_mask = luma <= 1.0
        if zero_mask.any():
            out_f[zero_mask] = new_luma[zero_mask, None]
        out = np.clip(out_f, 0.0, 255.0).astype(np.uint8)

    if mix < 1.0:
        blended = rgb.astype(np.float32) * (1.0 - mix) + out.astype(np.float32) * mix
        out = np.clip(blended, 0.0, 255.0).astype(np.uint8)

    return np.concatenate([out, alpha], axis=2), state_out
