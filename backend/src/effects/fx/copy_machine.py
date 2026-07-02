"""Copy Machine — multi-generation photocopy / duplication degradation.

Ports the user-tuned "COPY MACHINE" recipe (prototype:
popchaos-site/challengers/round4/p-punnett.html) to the numpy sidecar. One
effect instance = one machine; stack instances to build the punnett-style
chain. All Math.random() calls in the prototype are replaced with a seeded
RNG so renders are reproducible per (frame_index, seed).

Temporal semantics (the core of this effect):
  * feedback=false  -> stateless. Degradation intensity is driven purely by the
    `generation` param (0-120). Automate `generation` 0->N across a clip and the
    image degrades further as the video plays.
  * feedback=true   -> stateful. Each output frame is blended back in as the base
    for the next frame (true generation loss across a moving video). The prev
    output dominates (FEEDBACK_MIX) so accumulated toner/artifacts compound while
    fresh motion still bleeds in — this is what distinguishes feedback from freeze.
  * freeze=true     -> capture the current input frame once and keep degrading
    THAT held frame while video time advances. Composes with feedback (the held
    frame seeds the compounding chain).

Physical pipeline per pass (fixed, wraps the machine):
  optics resample (rot/scale/translate jitter) -> 1px box blur -> Levels S-curve
  crush (bp+14/wp-14) -> machine op -> toner-starvation streaks -> paper grain.

Machines: toner, photocopy (Sobel), spread, halftone (45deg dot screen), atkinson
(error diffusion; numba-accelerated when available), riso (2-plate pink/blue with
per-generation misregistration drift), fax (1-bit + scanline shift/dropout), ascii
(per-cell luminance -> glyph tile, grid coarsens with generation), and "random"
(a seeded per-pass/per-frame selector drawing from `random_pool`).

color_mode: "bw" keeps the classic mono ink; "color" restamps the source's own
chroma into the inked/screened regions (color-photocopy / CMY-ish look). riso is
inherently colored (bw desaturates it).
"""

import cv2
import numpy as np

from engine.determinism import make_rng

try:  # numba is optional; atkinson uses it when present (checked live: 0.65.1)
    from numba import njit

    _HAS_NUMBA = True
except Exception:  # pragma: no cover - exercised only when numba is absent
    _HAS_NUMBA = False

EFFECT_ID = "fx.copy_machine"
EFFECT_NAME = "Copy Machine"
EFFECT_CATEGORY = "codec_archaeology"

# Concrete machines the effect can run. The "random" selector draws from these.
_REAL_MACHINES = [
    "toner",
    "photocopy",
    "spread",
    "halftone",
    "atkinson",
    "riso",
    "fax",
    "ascii",
]
# Param options = the concrete machines plus the meta "random" selector.
MACHINES = _REAL_MACHINES + ["random"]

COLOR_MODES = ["bw", "color"]
GLYPH_SETS = ["classic", "blocks", "dense"]

# Fixed palette (from prototype): warm ink on warm paper.
_PAPER = np.array([242, 239, 230], dtype=np.float32)
_INK = np.array([23, 21, 15], dtype=np.float32)

# Mean-luminance below this => source reads as light-on-dark, so the pipeline is
# run inverted (in ink-space) and un-inverted, making the LIGHT spread.
_INVERT_LUM_THRESHOLD = 110.0

# In feedback mode, how much of the base is the previous output vs fresh input.
# High => strong generation-loss compounding; the (1 - mix) lets a moving video
# still enter, which is what makes feedback distinct from freeze.
_FEEDBACK_MIX = 0.8

# Hard cap on generations (recipe settled on 120).
_MAX_GEN = 120.0

# Distinct RNG namespace so machine-selection draws never collide with the
# per-pass pixel-noise RNG (which is keyed on the real pass index).
_RANDOM_NS = 0x5EED

# ASCII machine tuning.
_ASCII_MAX_CELL = 48  # cap effective cell so tiles/memory stay bounded
_ASCII_COARSEN = 1.5  # px added to the cell per generation unit (grid coarsens)
_ASCII_NOISE = 26.0  # per-cell luminance jitter (glyph selection wobble)
_ASCII_NOISE_GEN = 0.15  # extra jitter per generation unit

# Levels S-curve crush LUT: bp +14, wp -14 (window 227), smoothstep.
_CRUSH_T = np.clip((np.arange(256, dtype=np.float32) - 14.0) / 227.0, 0.0, 1.0)
_CRUSH_LUT = (
    (_CRUSH_T * _CRUSH_T * (3.0 - 2.0 * _CRUSH_T) * 255.0).clip(0, 255).astype(np.uint8)
)


PARAMS: dict = {
    "machine": {
        "type": "choice",
        "options": MACHINES,
        "default": "toner",
        "label": "Machine",
        "description": (
            "Duplication process to simulate. 'random' picks a machine per pass "
            "(stateless) or per frame (feedback) from a seeded RNG."
        ),
    },
    "random_pool": {
        "type": "string",
        "default": "",
        "label": "Random Pool",
        "description": (
            "When Machine='random', comma-separated subset to draw from "
            "(e.g. 'halftone,atkinson,ascii'). Empty = all machines."
        ),
    },
    "color_mode": {
        "type": "choice",
        "options": COLOR_MODES,
        "default": "bw",
        "label": "Color Mode",
        "description": (
            "'bw' = monochrome ink (luminance). 'color' = keep source chroma in "
            "the inked/screened regions (color photocopy / CMY-ish look)."
        ),
    },
    "cell_size": {
        "type": "int",
        "min": 2,
        "max": 48,
        "default": 6,
        "label": "ASCII Cell",
        "curve": "linear",
        "unit": "px",
        "description": (
            "ASCII glyph cell size in px. Coarsens further as Generation rises."
        ),
    },
    "glyph_set": {
        "type": "choice",
        "options": GLYPH_SETS,
        "default": "classic",
        "label": "Glyph Set",
        "description": "ASCII glyph ramp: classic chars, shade blocks, or a dense ramp.",
    },
    "generation": {
        "type": "float",
        "min": 0.0,
        "max": 120.0,
        "default": 12.0,
        "label": "Generation",
        "curve": "linear",
        "unit": "",
        "description": (
            "Degradation amount when feedback is off (number of copy passes). "
            "Automate 0->120 across a clip so decay grows as the video plays."
        ),
    },
    "feedback": {
        "type": "bool",
        "default": False,
        "label": "Feedback",
        "description": (
            "On: each output frame is fed back as the next frame's input "
            "(true generation loss across a moving video). Off: stateless, "
            "driven by Generation."
        ),
    },
    "freeze": {
        "type": "bool",
        "default": False,
        "label": "Freeze",
        "description": (
            "Capture the current frame once and keep degrading that held frame "
            "as time advances (rots in place). Composes with Feedback."
        ),
    },
    "invert": {
        "type": "bool",
        "default": False,
        "label": "Invert",
        "description": "Force ink-space inversion so light marks spread instead of dark.",
    },
    "invert_auto": {
        "type": "bool",
        "default": True,
        "label": "Auto Invert",
        "description": (
            "Auto-detect light-on-dark sources (low mean luminance) and invert so "
            "the light spreads. Overridden on by Invert."
        ),
    },
    "mix": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 1.0,
        "label": "Mix",
        "curve": "linear",
        "unit": "%",
        "description": "Blend between the degraded copy and the original.",
    },
}


# --------------------------------------------------------------------------- #
# small helpers
# --------------------------------------------------------------------------- #
def _truthy(v) -> bool:
    """Coerce a bool param that may arrive as bool / str / number."""
    if isinstance(v, bool):
        return v
    if isinstance(v, str):
        return v.strip().lower() in ("true", "1", "yes", "on")
    try:
        return float(v) != 0.0
    except (TypeError, ValueError):
        return False


def _seed_for(seed: int, frame_index: int, pass_index: int) -> int:
    """Deterministic per-(frame, pass) seed. Same inputs => same output."""
    s = int(seed) & 0xFFFFFFFF
    return (
        s * 1_000_003 + int(frame_index) * 7919 + int(pass_index) * 104729
    ) & 0xFFFFFFFF


def _lerp_u8(a: np.ndarray, b: np.ndarray, t: float) -> np.ndarray:
    """Weighted uint8 blend: a*(1-t) + b*t, clipped back to uint8."""
    out = a.astype(np.float32) * (1.0 - t) + b.astype(np.float32) * t
    return np.clip(out, 0, 255).astype(np.uint8)


def _luma(rgb: np.ndarray) -> np.ndarray:
    """Rec.601 luminance as float32 (H, W)."""
    f = rgb.astype(np.float32)
    return 0.299 * f[:, :, 0] + 0.587 * f[:, :, 1] + 0.114 * f[:, :, 2]


def _ink_or_paper(mask: np.ndarray) -> np.ndarray:
    """mask True => ink, False => paper. Returns uint8 (H, W, 3)."""
    return np.where(mask[:, :, None], _INK, _PAPER).astype(np.uint8)


def _parse_pool(random_pool) -> list[str]:
    """Parse the random_pool string into a validated machine list (defaults to all)."""
    if isinstance(random_pool, str) and random_pool.strip():
        wanted = [tok.strip().lower() for tok in random_pool.split(",")]
        pool = [m for m in wanted if m in _REAL_MACHINES]
        if pool:
            return pool
    return list(_REAL_MACHINES)


def _pick_random_machine(
    pool: list[str],
    seed: int,
    frame_index: int,
    pass_index: int,
    feedback: bool,
) -> str:
    """Deterministically choose a concrete machine from the pool.

    Reproducible for fixed (seed, frame/pass): feedback keys on frame_index so the
    machine drifts as the video plays; stateless keys on pass_index only (no
    frame_index) so the randomized chain is stable frame-to-frame (no flicker).
    """
    if feedback:
        key = _seed_for(seed, frame_index, _RANDOM_NS)
    else:
        key = _seed_for(seed, _RANDOM_NS, pass_index)
    idx = int(make_rng(key).integers(0, len(pool)))
    return pool[idx]


# --------------------------------------------------------------------------- #
# physical pipeline stages
# --------------------------------------------------------------------------- #
def _optics(
    rgb: np.ndarray, rng: np.random.Generator, border: np.ndarray
) -> np.ndarray:
    """Rotation/scale/translation jitter — the platen never registers perfectly."""
    h, w = rgb.shape[:2]
    angle = float(rng.random() * 0.7 - 0.35)  # degrees
    scale = float(0.995 + rng.random() * 0.012)
    tx = float(rng.random() * 4.0 - 2.0)
    ty = float(rng.random() * 4.0 - 2.0)
    m = cv2.getRotationMatrix2D((w / 2.0, h / 2.0), angle, scale)
    m[0, 2] += tx
    m[1, 2] += ty
    return cv2.warpAffine(
        rgb,
        m,
        (w, h),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=tuple(float(x) for x in border),
    )


def _crush(rgb: np.ndarray) -> np.ndarray:
    """Levels S-curve tonal crush via LUT."""
    return _CRUSH_LUT[rgb]


def _starve(rgb: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Toner-starvation streaks: per-column gain random walk lifts ink toward paper."""
    h, w = rgb.shape[:2]
    steps = rng.random(w) - 0.5
    gain = np.empty(w, dtype=np.float32)
    g = 1.0
    for x in range(w):
        g += float(steps[x]) * 0.06
        g = min(1.15, max(0.75, g))
        gain[x] = g
    lift = (1.0 - gain) * 127.0  # (w,)
    out = rgb.astype(np.float32) + lift[None, :, None]
    np.minimum(out, _PAPER[None, None, :], out=out)
    return np.clip(out, 0, 255).astype(np.uint8)


def _grain(rgb: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Paper grain: shared per-pixel luminance noise across channels."""
    h, w = rgb.shape[:2]
    n = (rng.random((h, w)).astype(np.float32) * 2.0 - 1.0) * 10.0
    out = rgb.astype(np.float32) + n[:, :, None]
    return np.clip(out, 0, 255).astype(np.uint8)


# --------------------------------------------------------------------------- #
# machines
# --------------------------------------------------------------------------- #
def _m_toner(rgb, rng, _gen, _cfg=None) -> np.ndarray:
    lum = _luma(rgb)
    noise = (rng.random(lum.shape).astype(np.float32) * 2.0 - 1.0) * 46.0
    return _ink_or_paper((lum + noise) < 150.0)


def _m_photocopy(rgb, rng, _gen, _cfg=None) -> np.ndarray:
    lum = _luma(rgb)
    gx = cv2.Sobel(lum, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(lum, cv2.CV_32F, 0, 1, ksize=3)
    mag = np.hypot(gx, gy)
    return _ink_or_paper((mag > 90.0) | (lum < 52.0))


def _m_spread(rgb, rng, gen, _cfg=None) -> np.ndarray:
    h, w = rgb.shape[:2]
    dx = rng.integers(0, 5, size=(h, w)) - 2
    dy = rng.integers(0, 5, size=(h, w)) - 2
    ys, xs = np.meshgrid(np.arange(h), np.arange(w), indexing="ij")
    src_y = np.clip(ys + dy, 0, h - 1)
    src_x = np.clip(xs + dx, 0, w - 1)
    displaced = rgb[src_y, src_x]
    return _m_toner(displaced, rng, gen)  # re-toner after diffusion (prototype parity)


def _m_halftone(rgb, rng, _gen, _cfg=None) -> np.ndarray:
    """45deg dot screen. Frequency scales with resolution (finer per generation)."""
    h, w = rgb.shape[:2]
    cell = max(2, round(w / 140.0))
    lum = _luma(rgb)
    dark = np.clip(1.0 - lum / 255.0, 0.0, 1.0)
    cos = sin = float(np.sqrt(0.5))
    ys, xs = np.meshgrid(
        np.arange(h, dtype=np.float32), np.arange(w, dtype=np.float32), indexing="ij"
    )
    # rotate pixel coords into screen space, snap to nearest lattice dot center
    u = xs * cos - ys * sin
    v = xs * sin + ys * cos
    uc = np.round(u / cell) * cell
    vc = np.round(v / cell) * cell
    dist = np.hypot(u - uc, v - vc)
    rr = (cell * 0.72) * np.sqrt(dark)
    mask = (dist <= rr) & (dark > 0.04)
    return _ink_or_paper(mask)


if _HAS_NUMBA:

    @njit(cache=True)
    def _atkinson_kernel(g, h, w):  # pragma: no cover - njit-compiled
        out = np.zeros((h, w), dtype=np.uint8)
        for y in range(h):
            for x in range(w):
                old = g[y, x]
                bw = 0.0 if old < 128.0 else 255.0
                err = (old - bw) / 8.0
                g[y, x] = bw
                if x + 1 < w:
                    g[y, x + 1] += err
                if x + 2 < w:
                    g[y, x + 2] += err
                if y + 1 < h:
                    if x > 0:
                        g[y + 1, x - 1] += err
                    g[y + 1, x] += err
                    if x + 1 < w:
                        g[y + 1, x + 1] += err
                if y + 2 < h:
                    g[y + 2, x] += err
                out[y, x] = 1 if bw == 0.0 else 0
        return out


def _atkinson_mask(lum: np.ndarray) -> np.ndarray:
    """Atkinson error diffusion -> bool ink mask (True = ink)."""
    h, w = lum.shape
    if _HAS_NUMBA:
        return _atkinson_kernel(lum.astype(np.float32).copy(), h, w).astype(bool)
    # Fallback (numba absent): diffuse at half resolution, then upscale. This is
    # an APPROXIMATION of true full-res Atkinson (documented in module header).
    scale = 2
    sh, sw = max(1, h // scale), max(1, w // scale)
    small = cv2.resize(lum, (sw, sh), interpolation=cv2.INTER_AREA).astype(np.float32)
    out = np.zeros((sh, sw), dtype=np.uint8)
    for y in range(sh):
        for x in range(sw):
            old = small[y, x]
            bw = 0.0 if old < 128.0 else 255.0
            err = (old - bw) / 8.0
            small[y, x] = bw
            if x + 1 < sw:
                small[y, x + 1] += err
            if x + 2 < sw:
                small[y, x + 2] += err
            if y + 1 < sh:
                if x > 0:
                    small[y + 1, x - 1] += err
                small[y + 1, x] += err
                if x + 1 < sw:
                    small[y + 1, x + 1] += err
            if y + 2 < sh:
                small[y + 2, x] += err
            out[y, x] = 1 if bw == 0.0 else 0
    return cv2.resize(out, (w, h), interpolation=cv2.INTER_NEAREST).astype(bool)


def _m_atkinson(rgb, rng, _gen, _cfg=None) -> np.ndarray:
    return _ink_or_paper(_atkinson_mask(_luma(rgb)))


def _m_riso(rgb, rng, gen, _cfg=None) -> np.ndarray:
    """2-plate risograph; misregistration offset drifts with generation."""
    h, w = rgb.shape[:2]
    g = np.clip(1.0 - _luma(rgb) / 255.0, 0.0, 1.0)
    pink = np.array([255.0, 72.0, 176.0], dtype=np.float32) / 255.0
    blue = np.array([0.0, 120.0, 191.0], dtype=np.float32) / 255.0
    ox = int(round((rng.random() * 2.0 - 1.0) * (1.0 + gen * 0.6)))
    oy = int(round((rng.random() * 2.0 - 1.0) * (1.0 + gen * 0.4)))
    # plate A (pink) at pixel; plate B (blue) at misregistered offset (edge-clamped)
    ys, xs = np.meshgrid(np.arange(h), np.arange(w), indexing="ij")
    qy = np.clip(ys + oy, 0, h - 1)
    qx = np.clip(xs + ox, 0, w - 1)
    a = np.clip(g * 1.5 - 0.08, 0.0, 1.0)
    b = np.clip(g[qy, qx] * 1.25 - 0.28, 0.0, 1.0)
    a = np.where(rng.random((h, w)) < 0.06, a * 0.3, a)
    b = np.where(rng.random((h, w)) < 0.06, b * 0.3, b)
    out = np.empty((h, w, 3), dtype=np.float32)
    for c in range(3):
        out[:, :, c] = (
            _PAPER[c] * (1.0 - a * (1.0 - pink[c])) * (1.0 - b * (1.0 - blue[c]))
        )
    return np.clip(out, 0, 255).astype(np.uint8)


def _m_fax(rgb, rng, _gen, _cfg=None) -> np.ndarray:
    """1-bit threshold with per-row scanline shift and dropout errors."""
    h, w = rgb.shape[:2]
    lum = _luma(rgb)
    base = _ink_or_paper(lum < 128.0)
    idx = np.arange(w)
    for y in range(h):
        if rng.random() < 0.05:
            off = int(rng.random() * 7) - 3
            src = np.clip(idx - off, 0, w - 1)
            base[y] = base[y][src]
        if rng.random() < 0.008:
            base[y] = _PAPER.astype(np.uint8)
    return base


# --------------------------------------------------------------------------- #
# ASCII machine
# --------------------------------------------------------------------------- #
# 8x8 base glyph bitmaps ('#' = ink stroke). "classic" uses recognizable ASCII
# chars ordered light->dark; "blocks" and "dense" are ordered-fill ramps.
_GLYPH_CLASSIC = [
    (
        "........",
        "........",
        "........",
        "........",
        "........",
        "........",
        "........",
        "........",
    ),  # ' '
    (
        "........",
        "........",
        "........",
        "........",
        "........",
        "...##...",
        "...##...",
        "........",
    ),  # '.'
    (
        "........",
        "...##...",
        "...##...",
        "........",
        "...##...",
        "...##...",
        "........",
        "........",
    ),  # ':'
    (
        "........",
        "...##...",
        "...##...",
        ".######.",
        ".######.",
        "...##...",
        "...##...",
        "........",
    ),  # '+'
    (
        "........",
        ".#.##.#.",
        "..####..",
        ".######.",
        ".######.",
        "..####..",
        ".#.##.#.",
        "........",
    ),  # '*'
    (
        ".#..#...",
        ".#..#...",
        "#######.",
        ".#..#...",
        "#######.",
        ".#..#...",
        ".#..#...",
        "........",
    ),  # '#'
    (
        ".######.",
        "#......#",
        "#.####.#",
        "#.#..#.#",
        "#.####.#",
        "#......#",
        ".######.",
        "........",
    ),  # '@'
]
_BAYER8 = (
    np.array(
        [
            [0, 48, 12, 60, 3, 51, 15, 63],
            [32, 16, 44, 28, 35, 19, 47, 31],
            [8, 56, 4, 52, 11, 59, 7, 55],
            [40, 24, 36, 20, 43, 27, 39, 23],
            [2, 50, 14, 62, 1, 49, 13, 61],
            [34, 18, 46, 30, 33, 17, 45, 29],
            [10, 58, 6, 54, 9, 57, 5, 53],
            [42, 26, 38, 22, 41, 25, 37, 21],
        ],
        dtype=np.float32,
    )
    / 64.0
)


def _bits(rows: tuple[str, ...]) -> np.ndarray:
    return np.array([[c == "#" for c in row] for row in rows], dtype=bool)


def _dither_ramp(levels: int) -> list[np.ndarray]:
    """Ordered-fill 8x8 glyphs: level i inks where Bayer < fill fraction."""
    return [(_BAYER8 < (i / (levels - 1))) for i in range(levels)]


# Base (8x8) glyph stacks per set, ordered light (few pixels) -> dark (many).
_GLYPH_BASE = {
    "classic": [_bits(g) for g in _GLYPH_CLASSIC],
    "blocks": _dither_ramp(5),
    "dense": _dither_ramp(10),
}
_GLYPH_CACHE: dict[tuple[str, int], np.ndarray] = {}


def _glyph_stack(glyph_set: str, cell: int) -> np.ndarray:
    """(n, cell, cell) bool tile stack for a set at a given cell size (cached)."""
    key = (glyph_set, cell)
    cached = _GLYPH_CACHE.get(key)
    if cached is not None:
        return cached
    base = _GLYPH_BASE.get(glyph_set, _GLYPH_BASE["classic"])
    tiles = np.stack(
        [
            cv2.resize(
                g.astype(np.uint8), (cell, cell), interpolation=cv2.INTER_NEAREST
            ).astype(bool)
            for g in base
        ]
    )
    _GLYPH_CACHE[key] = tiles
    return tiles


def _m_ascii(rgb, rng, gen, cfg=None) -> np.ndarray:
    """Per-cell luminance -> glyph tile. Cell coarsens as generation rises."""
    cfg = cfg or {}
    base_cell = int(cfg.get("cell_size", 6))
    glyph_set = cfg.get("glyph_set", "classic")
    h, w = rgb.shape[:2]
    # generation coarsens the grid; keep at least one cell on tiny frames
    eff_cell = int(np.clip(base_cell + round(gen * _ASCII_COARSEN), 2, _ASCII_MAX_CELL))
    eff_cell = max(1, min(eff_cell, h, w))
    gh, gw = h // eff_cell, w // eff_cell
    if gh < 1 or gw < 1:
        eff_cell = max(1, min(h, w))
        gh, gw = h // eff_cell, w // eff_cell
    ch, cw = gh * eff_cell, gw * eff_cell

    lum = _luma(rgb)[:ch, :cw]
    cell_mean = lum.reshape(gh, eff_cell, gw, eff_cell).mean(axis=(1, 3))
    noise = (rng.random((gh, gw)).astype(np.float32) * 2.0 - 1.0) * (
        _ASCII_NOISE * (1.0 + gen * _ASCII_NOISE_GEN)
    )
    val = np.clip(cell_mean + noise, 0.0, 255.0)

    stack = _glyph_stack(glyph_set, eff_cell)
    n = stack.shape[0]
    # darker cell -> denser glyph (higher index)
    idx = np.clip(((1.0 - val / 255.0) * (n - 1)).round().astype(int), 0, n - 1)
    cells = stack[idx]  # (gh, gw, cell, cell) bool
    grid = cells.transpose(0, 2, 1, 3).reshape(ch, cw)  # bool ink map

    out = np.empty((h, w, 3), dtype=np.uint8)
    out[:] = _PAPER.astype(np.uint8)
    ink = np.zeros((h, w), dtype=bool)
    ink[:ch, :cw] = grid
    out[ink] = _INK.astype(np.uint8)
    return out


_MACHINE_FNS = {
    "toner": _m_toner,
    "photocopy": _m_photocopy,
    "spread": _m_spread,
    "halftone": _m_halftone,
    "atkinson": _m_atkinson,
    "riso": _m_riso,
    "fax": _m_fax,
    "ascii": _m_ascii,
}


def _apply_color_mode(
    machine_out: np.ndarray, source_color: np.ndarray, machine: str, color_mode: str
) -> np.ndarray:
    """Map a mono machine output into color mode (or leave/desaturate as needed).

    color: restamp the source's own chroma into the inked/screened regions (a
    color-photocopy look; per-glyph/per-dot/per-edge tinting). riso is already a
    color process, so color leaves it and bw desaturates it.
    """
    if machine == "riso":
        if color_mode == "color":
            return machine_out
        g = _luma(machine_out).astype(np.uint8)
        return np.repeat(g[:, :, None], 3, axis=2)
    if color_mode != "color":
        return machine_out
    # All other machines emit ink[23,21,15] or paper[242,239,230]; threshold at
    # 128 recovers the ink mask cleanly. Ink regions take the source color.
    ink = _luma(machine_out) < 128.0
    return np.where(ink[:, :, None], source_color, _PAPER.astype(np.uint8)).astype(
        np.uint8
    )


def _physical_pass(
    rgb: np.ndarray,
    machine: str,
    rng: np.random.Generator,
    genlike: float,
    do_invert: bool,
    cfg: dict,
) -> np.ndarray:
    """One full copy pass. When do_invert, work in ink-space so light spreads."""
    work = (255 - rgb) if do_invert else rgb
    border = (255.0 - _PAPER) if do_invert else _PAPER
    work = _optics(work, rng, border)
    work = cv2.blur(work, (3, 3))
    work = _crush(work)
    source_color = work  # crushed color, used to re-tint in color mode
    machined = _MACHINE_FNS[machine](work, rng, genlike, cfg)
    machined = _apply_color_mode(machined, source_color, machine, cfg["color_mode"])
    work = _starve(machined, rng)
    work = _grain(work, rng)
    return (255 - work) if do_invert else work


# --------------------------------------------------------------------------- #
# effect entry point
# --------------------------------------------------------------------------- #
def apply(
    frame: np.ndarray,
    params: dict,
    state_in: dict | None = None,
    *,
    frame_index: int,
    seed: int,
    resolution: tuple[int, int],
) -> tuple[np.ndarray, dict | None]:
    """Apply the copy-machine degradation. See module docstring for temporal model."""
    assert frame.dtype == np.uint8, (
        f"copy_machine requires uint8 frames, got {frame.dtype}"
    )

    # --- trust boundary: clamp/validate every param at entry ---
    machine = params.get("machine", "toner")
    if not isinstance(machine, str) or machine not in MACHINES:
        machine = "toner"
    is_random = machine == "random"
    pool = _parse_pool(params.get("random_pool", "")) if is_random else []
    color_mode = params.get("color_mode", "bw")
    if color_mode not in COLOR_MODES:
        color_mode = "bw"
    glyph_set = params.get("glyph_set", "classic")
    if glyph_set not in GLYPH_SETS:
        glyph_set = "classic"
    try:
        cell_size = max(2, min(48, int(params.get("cell_size", 6))))
    except (TypeError, ValueError):
        cell_size = 6
    cfg = {"color_mode": color_mode, "glyph_set": glyph_set, "cell_size": cell_size}
    try:
        generation = max(0.0, min(_MAX_GEN, float(params.get("generation", 12.0))))
    except (TypeError, ValueError):
        generation = 12.0
    try:
        mix = max(0.0, min(1.0, float(params.get("mix", 1.0))))
    except (TypeError, ValueError):
        mix = 1.0
    feedback = _truthy(params.get("feedback", False))
    freeze = _truthy(params.get("freeze", False))
    invert = _truthy(params.get("invert", False))
    invert_auto = _truthy(params.get("invert_auto", True))

    def _machine_for(pass_index: int) -> str:
        if is_random:
            return _pick_random_machine(pool, seed, frame_index, pass_index, feedback)
        return machine

    has_alpha = frame.shape[2] >= 4
    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4] if has_alpha else None

    state = dict(state_in) if isinstance(state_in, dict) else {}

    # --- freeze: hold one input frame, keep degrading it ---
    if freeze:
        held = state.get("held")
        if not isinstance(held, np.ndarray) or held.shape != rgb.shape:
            held = rgb.copy()
            state["held"] = held
        source = held
    else:
        state.pop("held", None)
        source = rgb

    # --- invert decision (light-on-dark => spread the light) ---
    do_invert = invert or (
        invert_auto and float(_luma(source).mean()) < _INVERT_LUM_THRESHOLD
    )

    if feedback:
        prev = state.get("prev")
        if isinstance(prev, np.ndarray) and prev.shape == source.shape:
            base = _lerp_u8(source, prev, _FEEDBACK_MIX)
        else:
            base = source
        rng = make_rng(_seed_for(seed, frame_index, 0))
        # generation index grows with elapsed frames -> riso drift etc. accrue
        out = _physical_pass(
            base, _machine_for(0), rng, float(frame_index), do_invert, cfg
        )
        # Store a private copy so a downstream in-place mutation of `result`
        # (3-channel + mix==1.0 makes result alias `out`) can't corrupt state.
        state["prev"] = out.copy()
    else:
        state.pop("prev", None)  # symmetric with `held` cleanup; drop stale history
        # stateless: generation drives the number of copy passes
        out = source
        full = int(generation)
        frac = generation - full
        for p in range(full):
            rng = make_rng(_seed_for(seed, frame_index, p))
            out = _physical_pass(out, _machine_for(p), rng, float(p), do_invert, cfg)
        if frac > 1e-6:
            rng = make_rng(_seed_for(seed, frame_index, full))
            nxt = _physical_pass(
                out, _machine_for(full), rng, float(full), do_invert, cfg
            )
            out = _lerp_u8(out, nxt, frac)

    # --- blend with original ---
    if mix < 1.0:
        out = _lerp_u8(out, rgb, 1.0 - mix)

    result = np.concatenate([out, alpha], axis=2) if has_alpha else out
    # Only carry state when a stateful mode is active (parity with stateless effects).
    state_out = state if (feedback or freeze) else None
    return result, state_out
