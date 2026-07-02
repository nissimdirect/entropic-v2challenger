"""CellularPixelSort — pixelsort whose threshold mask is a Conway-style CA field.

Frankenstein of `pixelsort.py` (composite-key argsort) and `cellular_automata.py`
(B/S CA step). Living sort territories: live cells sort, dead cells hold; as the
CA evolves frame-to-frame, sorted regions migrate, divide, and die organically.

Algorithm:
  1. Maintain `state["ca_grid"]` — boolean grid (downsampled by `ca_scale`).
  2. Each frame: step CA forward `ca_steps_per_frame` iterations under selected rule.
  3. Upsample CA mask to frame resolution via nearest-neighbor (preserves chunky look).
  4. For each row (or column, per `direction`): collect contiguous "alive" runs,
     argsort each by chosen key (luminance / hue / saturation / R/G/B).
  5. Write sorted runs back; non-mask pixels untouched.
  6. Auto-reseed when CA collapses (zero-alive) or `reseed_interval` triggers.

State:
  - `ca_grid`: int32 (h_ds, w_ds) boolean CA state at downsampled resolution
  - `ca_age`: int frames since last reseed
"""

import numpy as np
from scipy.signal import convolve2d

EFFECT_ID = "fx.cellular_pixel_sort"
EFFECT_NAME = "Cellular Pixel Sort"
EFFECT_CATEGORY = "glitch"

PARAMS: dict = {
    "direction": {
        "type": "choice",
        "options": ["horizontal", "vertical"],
        "default": "horizontal",
        "label": "Direction",
        "description": "Sort direction — horizontal sorts rows, vertical sorts columns",
    },
    "sort_key": {
        "type": "choice",
        "options": ["luminance", "hue", "saturation", "red", "green", "blue"],
        "default": "luminance",
        "label": "Sort Key",
        "description": "Which channel/property determines sort order within a live run",
    },
    "reverse": {
        "type": "bool",
        "default": False,
        "label": "Reverse",
        "description": "Reverse sort order (descending instead of ascending)",
    },
    "ca_rule": {
        "type": "choice",
        "options": ["life", "highlife", "seeds", "daynight", "replicator"],
        "default": "life",
        "label": "CA Rule",
        "description": "Cellular automaton rule (Conway B3/S23, HighLife B36/S23, Seeds B2/S, Day&Night, Replicator)",
    },
    "ca_steps_per_frame": {
        "type": "int",
        "min": 1,
        "max": 8,
        "default": 1,
        "label": "Steps/Frame",
        "curve": "linear",
        "unit": "",
        "description": "CA iterations per video frame — more = faster colony evolution",
    },
    "ca_scale": {
        "type": "int",
        "min": 1,
        "max": 8,
        "default": 4,
        "label": "Cell Size",
        "curve": "linear",
        "unit": "x",
        "description": "Downsample factor for CA grid — larger = chunkier visible cells",
    },
    "seed_density": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.4,
        "label": "Seed Density",
        "curve": "linear",
        "unit": "%",
        "description": "Initial alive ratio when CA grid is empty or reseeded",
    },
    "reseed_interval": {
        "type": "int",
        "min": 0,
        "max": 999,
        "default": 0,
        "label": "Reseed Interval",
        "curve": "linear",
        "unit": "f",
        "description": "Frames between forced reseeds (0 = only auto-reseed when colony dies)",
    },
    "mix": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 1.0,
        "label": "Mix",
        "curve": "linear",
        "unit": "%",
        "description": "Blend between sorted output and original frame",
    },
}

# 8-neighborhood kernel (matches cellular_automata.py)
_NEIGHBOR_KERNEL = np.array([[1, 1, 1], [1, 0, 1], [1, 1, 1]], dtype=np.int32)

_VALID_RULES = {"life", "highlife", "seeds", "daynight", "replicator"}
_VALID_DIRECTIONS = {"horizontal", "vertical"}
_VALID_SORT_KEYS = {"luminance", "hue", "saturation", "red", "green", "blue"}


def _step_ca(grid: np.ndarray, rule: str) -> np.ndarray:
    """One CA step under the chosen B/S rule. Grid is int32 binary."""
    n = convolve2d(grid, _NEIGHBOR_KERNEL, mode="same", boundary="wrap")
    alive = grid == 1
    dead = ~alive
    if rule == "highlife":
        # B36/S23
        birth = ((n == 3) | (n == 6)) & dead
        survive = ((n == 2) | (n == 3)) & alive
    elif rule == "seeds":
        # B2/S — no survival
        birth = (n == 2) & dead
        survive = np.zeros_like(grid, dtype=bool)
    elif rule == "daynight":
        # B3678/S34678 — symmetric "Day & Night"
        birth = ((n == 3) | (n == 6) | (n == 7) | (n == 8)) & dead
        survive = ((n == 3) | (n == 4) | (n == 6) | (n == 7) | (n == 8)) & alive
    elif rule == "replicator":
        # B1357/S1357 — chaotic copier
        odd = (n == 1) | (n == 3) | (n == 5) | (n == 7)
        birth = odd & dead
        survive = odd & alive
    else:
        # Conway's Game of Life B3/S23 (default)
        birth = (n == 3) & dead
        survive = ((n == 2) | (n == 3)) & alive
    return (birth | survive).astype(np.int32)


def _seed_grid(
    h_ds: int, w_ds: int, density: float, seed: int, frame_index: int, age: int
) -> np.ndarray:
    """Random binary grid at downsampled resolution.

    Mixes user seed + frame_index + age so each reseed jitters the colony,
    keeping audio-driven reseed onsets visually distinct.
    """
    rng = np.random.default_rng((int(seed) ^ int(frame_index) ^ int(age)) & 0xFFFFFFFF)
    return (rng.random((h_ds, w_ds)) < density).astype(np.int32)


def _upsample_nearest(mask_ds: np.ndarray, h: int, w: int) -> np.ndarray:
    """Nearest-neighbor upsample of a downsampled boolean grid to (h, w).

    Preserves the chunky cell appearance — no smoothing. Uses np.repeat which
    is O(N) and contiguous-friendly.
    """
    h_ds, w_ds = mask_ds.shape
    if h_ds == h and w_ds == w:
        return mask_ds.astype(bool)
    # Repeat each cell along both axes, then crop to exact (h, w).
    sy = max(1, h // h_ds)
    sx = max(1, w // w_ds)
    big = np.repeat(np.repeat(mask_ds, sy, axis=0), sx, axis=1)
    # Pad/crop in case integer scale doesn't tile exactly.
    bh, bw = big.shape
    if bh < h or bw < w:
        # Right/bottom pad with zeros (rare path; happens for non-integer ratios).
        pad_h = max(0, h - bh)
        pad_w = max(0, w - bw)
        big = np.pad(big, ((0, pad_h), (0, pad_w)), mode="edge")
    return big[:h, :w].astype(bool)


def _compute_sort_key(rgb: np.ndarray, key: str) -> np.ndarray:
    """Return float32 (h, w) sort-key field for the chosen mode."""
    r = rgb[:, :, 0].astype(np.float32)
    g = rgb[:, :, 1].astype(np.float32)
    b = rgb[:, :, 2].astype(np.float32)
    if key == "red":
        return r
    if key == "green":
        return g
    if key == "blue":
        return b
    if key == "saturation":
        # HSV saturation = (max - min) / max  (with max==0 → 0)
        mx = np.maximum(np.maximum(r, g), b)
        mn = np.minimum(np.minimum(r, g), b)
        sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1.0), 0.0)
        return sat * 255.0  # scale to ~0..255 range so composite key shape matches
    if key == "hue":
        # HSV hue ∈ [0, 360) — coarse but cheap. Scaled to 0..255 for composite key.
        mx = np.maximum(np.maximum(r, g), b)
        mn = np.minimum(np.minimum(r, g), b)
        delta = mx - mn
        hue = np.zeros_like(mx)
        # safe divide
        nz = delta > 0
        # red is max
        rmask = nz & (mx == r)
        gmask = nz & (mx == g)
        bmask = nz & (mx == b)
        with np.errstate(invalid="ignore", divide="ignore"):
            hue = np.where(rmask, ((g - b) / np.maximum(delta, 1.0)) % 6.0, hue)
            hue = np.where(gmask, ((b - r) / np.maximum(delta, 1.0)) + 2.0, hue)
            hue = np.where(bmask, ((r - g) / np.maximum(delta, 1.0)) + 4.0, hue)
        # 0..6 → 0..255
        return (hue / 6.0) * 255.0
    # luminance (default)
    return 0.299 * r + 0.587 * g + 0.114 * b


def apply(
    frame: np.ndarray,
    params: dict,
    state_in: dict | None = None,
    *,
    frame_index: int,
    seed: int,
    resolution: tuple[int, int],
) -> tuple[np.ndarray, dict | None]:
    """CellularPixelSort: pixelsort gated by Conway-style CA mask."""
    # PLAY-005: clamp every numeric param at trust boundary
    direction = str(params.get("direction", "horizontal"))
    if direction not in _VALID_DIRECTIONS:
        direction = "horizontal"
    sort_key = str(params.get("sort_key", "luminance"))
    if sort_key not in _VALID_SORT_KEYS:
        sort_key = "luminance"
    reverse = bool(params.get("reverse", False))
    ca_rule = str(params.get("ca_rule", "life"))
    if ca_rule not in _VALID_RULES:
        ca_rule = "life"
    ca_steps = max(1, min(8, int(params.get("ca_steps_per_frame", 1))))
    ca_scale = max(1, min(8, int(params.get("ca_scale", 4))))
    seed_density = max(0.0, min(1.0, float(params.get("seed_density", 0.4))))
    reseed_interval = max(0, min(999, int(params.get("reseed_interval", 0))))
    mix = max(0.0, min(1.0, float(params.get("mix", 1.0))))

    h, w = frame.shape[:2]
    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]

    # Downsampled CA dimensions (at least 2x2 so CA is meaningful)
    h_ds = max(2, h // ca_scale)
    w_ds = max(2, w // ca_scale)

    # Initialize on first call OR when CA shape no longer matches downsample target.
    if state_in is None:
        # First-frame passthrough — seed state, return frame unchanged.
        # Pattern matches fx.reaction_mosh: stateful effects need a baseline before
        # the first transformation so state-driven evolution is well-defined.
        ca_grid = _seed_grid(h_ds, w_ds, seed_density, seed, frame_index, 0)
        return frame.copy(), {"ca_grid": ca_grid, "ca_age": 0}

    ca_grid = state_in.get("ca_grid")
    ca_age = int(state_in.get("ca_age", 0))
    needs_reseed = (
        ca_grid is None
        or not isinstance(ca_grid, np.ndarray)
        or ca_grid.shape != (h_ds, w_ds)
    )
    if needs_reseed:
        ca_grid = _seed_grid(h_ds, w_ds, seed_density, seed, frame_index, ca_age)
        ca_age = 0

    # Forced reseed by interval (e.g. audio-driven onset → reseed_interval=1)
    if reseed_interval > 0 and ca_age >= reseed_interval:
        ca_grid = _seed_grid(h_ds, w_ds, seed_density, seed, frame_index, ca_age)
        ca_age = 0

    # Step CA forward
    for _ in range(ca_steps):
        ca_grid = _step_ca(ca_grid, ca_rule)

    # Auto-reseed on collapse (zero-alive) so the effect doesn't go silent.
    if not ca_grid.any():
        ca_grid = _seed_grid(h_ds, w_ds, seed_density, seed, frame_index, ca_age)
        ca_age = 0

    ca_age += 1

    # Upsample mask to frame resolution
    mask = _upsample_nearest(ca_grid.astype(bool), h, w)

    # If mask is all-False (shouldn't happen post-collapse-guard, but be safe),
    # fall back to identity scaled by mix.
    if not mask.any():
        out_rgb = (
            rgb.astype(np.float32) * mix + rgb.astype(np.float32) * (1.0 - mix)
        ).astype(np.uint8)
        return (
            np.concatenate([out_rgb, alpha], axis=2),
            {"ca_grid": ca_grid, "ca_age": ca_age},
        )

    # Compute sort-key field once for the whole frame
    keys = _compute_sort_key(rgb, sort_key)  # float32 (h, w), 0..255-ish

    # Work on a contiguous copy; treat vertical as horizontal via transpose
    work = rgb.copy()
    mask_w = mask
    keys_w = keys
    if direction == "vertical":
        work = np.ascontiguousarray(work.transpose(1, 0, 2))
        mask_w = np.ascontiguousarray(mask.T)
        keys_w = np.ascontiguousarray(keys.T)

    # Composite-key argsort (same trick as pixelsort.py): segment_id * 256 + key
    # ensures argsort never crosses run boundaries.
    transitions = np.diff(mask_w.astype(np.int8), axis=1, prepend=0)
    segment_ids = np.cumsum(transitions == 1, axis=1) * mask_w  # (H, W)

    if reverse:
        composite = segment_ids.astype(np.float64) * 256.0 + (
            255.0 - keys_w.astype(np.float64)
        )
    else:
        composite = segment_ids.astype(np.float64) * 256.0 + keys_w.astype(np.float64)

    # Per-row gather/argsort/scatter — only rows that have at least one alive cell.
    rows_with_mask = np.where(np.any(mask_w, axis=1))[0]
    for row_idx in rows_with_mask:
        indices = np.where(mask_w[row_idx])[0]
        order = np.argsort(composite[row_idx, indices])
        work[row_idx, indices] = work[row_idx, indices[order]]

    if direction == "vertical":
        sorted_rgb = work.transpose(1, 0, 2).copy()
    else:
        sorted_rgb = work

    # Mix with original
    if mix >= 1.0:
        out_rgb = sorted_rgb
    else:
        out_rgb = (
            (sorted_rgb.astype(np.float32) * mix + rgb.astype(np.float32) * (1.0 - mix))
            .clip(0, 255)
            .astype(np.uint8)
        )

    result = np.concatenate([out_rgb, alpha], axis=2)
    return result, {"ca_grid": ca_grid, "ca_age": ca_age}
