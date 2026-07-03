"""3D Extrude + Spin ("The Object") — lifts a 2D source into a spinning 3D
object and photocopies it in discrete generations with true feedback loss.

Port of the signed-off browser prototype
``popchaos-site/challengers/round4/s-3d.html``. Per ADR
``docs/decisions/3d-extrude-spin-render-stage.md`` this runs server-side in the
sidecar (the export path is Python-only) and the GLSL xerox shader is ported to
vectorized numpy/OpenCV rather than run on a GPU — no moderngl/GL context, so it
imports and runs on headless CI.

All tuned constants (extrude depth, spin rate, edge accel, tempo curve, feed
ramp, machine noise gains) are canon from the prototype and must not be
"cleaned up".
"""

from __future__ import annotations

import numpy as np
import cv2

from engine.determinism import make_rng

EFFECT_ID = "fx.extrude_spin"
EFFECT_NAME = "3D Extrude + Spin"
EFFECT_CATEGORY = "physics"

# --- Canon constants (prototype) -------------------------------------------
_SPIN_RATE = 0.00055  # rad/ms base
_LOOP_MAX = 120  # generations before the tempo curve turns around
_INK = np.array([242, 239, 230], np.float32)  # #F2EFE6 mark
_BG = np.array([10, 10, 10], np.float32)  # #0A0A0A paper
_MAX_PRINTS = 20000  # safety bound on the schedule walk

_MACHINES = ["toner", "bayer", "halftone", "sobel", "ascii", "random"]
_CONSTRUCTIONS = ["extrude", "voxels", "points", "planes"]
_COLOR_MODES = ["bw", "color"]
_END_BEHAVIORS = ["pingpong", "stop", "rebirth"]

# 5x5 bitmap glyphs (movAX13h float masks, decoded low bit = top-left).
_GLYPH_MASKS = [
    0.0,  # blank
    131072.0,  # .
    131200.0,  # :
    145536.0,  # +
    332096.0,  # *
    469440.0,  # o
    16236015.0,  # block
]

PARAMS: dict = {
    "construction": {
        "type": "choice",
        "options": _CONSTRUCTIONS,
        "default": "extrude",
        "label": "Construction",
        "description": "How the 2D mark is lifted into 3D: solid extrude, voxel cubes, point dust, or stacked planes",
    },
    "machine": {
        "type": "choice",
        "options": _MACHINES,
        "default": "toner",
        "label": "Machine",
        "description": "Photocopy machine: toner threshold, Bayer dither, halftone dots, Sobel edges, ASCII glyphs, or random-per-print",
    },
    "generations": {
        "type": "int",
        "min": 8,
        "max": 120,
        "default": 120,
        "label": "Generations",
        "description": "Copies before the degradation ramp turns around",
        "curve": "linear",
        "unit": "",
    },
    "spin_rate": {
        "type": "float",
        "min": 0.0,
        "max": 4.0,
        "default": 1.0,
        "label": "Spin Rate",
        "description": "Multiplier on the base spin (1.0 = prototype)",
        "curve": "linear",
        "unit": "x",
    },
    "edge_accel": {
        "type": "float",
        "min": 0.0,
        "max": 3.0,
        "default": 1.15,
        "label": "Edge Accel",
        "description": "Edge-on speed boost (0 = constant spin, 1.15 = ~2x at edge, prototype)",
        "curve": "linear",
        "unit": "",
    },
    "feed_base": {
        "type": "float",
        "min": 0.0,
        "max": 0.9,
        "default": 0.30,
        "label": "Feedback Base",
        "description": "Ghost opacity of the previous print at generation 0",
        "curve": "linear",
        "unit": "",
    },
    "feed_ramp": {
        "type": "float",
        "min": 0.0,
        "max": 0.9,
        "default": 0.18,
        "label": "Feedback Ramp",
        "description": "Extra ghost opacity added by the end of the degradation ramp",
        "curve": "linear",
        "unit": "",
    },
    "end_behavior": {
        "type": "choice",
        "options": _END_BEHAVIORS,
        "default": "pingpong",
        "label": "End Behavior",
        "description": "At max generation: ping-pong (decay<->heal), stop, or rebirth (reset to fresh)",
    },
    "color_mode": {
        "type": "choice",
        "options": _COLOR_MODES,
        "default": "bw",
        "label": "Color",
        "description": "Black & white, or tint the mark from the source's chroma",
    },
    "invert": {
        "type": "bool",
        "default": False,
        "label": "Invert",
        "description": "Swap ink and paper (dark mark on light)",
    },
    "camera_distance": {
        "type": "float",
        "min": 2.2,
        "max": 12.0,
        "default": 7.0,
        "label": "Camera Distance",
        "description": "Perspective distance to the object",
        "curve": "linear",
        "unit": "",
    },
    "ms_per_frame": {
        "type": "float",
        "min": 8.0,
        "max": 100.0,
        "default": 33.333,
        "label": "ms / Frame",
        "description": "Timeline mapping used to drive the spin and the print cadence (33.33 = 30fps)",
        "curve": "linear",
        "unit": "ms",
    },
}

# 1080p working-buffer cap (spec). Object raster happens at <= this, then the
# result is resized to the input frame's shape so output shape == input shape.
_CAP_W, _CAP_H = 1920, 1080


# ---------------------------------------------------------------------------
# Source -> ink mask + 3D construction
# ---------------------------------------------------------------------------
def _ink_mask(frame: np.ndarray) -> np.ndarray:
    """Threshold + 1px dilate the luminance to protect thin strokes."""
    rgb = frame[:, :, :3].astype(np.float32)
    lum = rgb[:, :, 0] * 0.299 + rgb[:, :, 1] * 0.587 + rgb[:, :, 2] * 0.114
    ink = (lum > 110).astype(np.uint8) * 255
    ink = cv2.dilate(ink, np.ones((3, 3), np.uint8), iterations=1)
    return ink


def _build_geometry(ink: np.ndarray, construction: str) -> dict:
    """Return a construction-specific geometry payload in object space.

    Object space: the mask is mapped to x,y in roughly [-1, 1] (y up); z carries
    depth. Point-based constructions return an (N,3) array; slab constructions
    return a stack of z depths (the mask itself is warped per depth at raster).
    """
    h, w = ink.shape
    ys, xs = np.nonzero(ink)
    if xs.size == 0:  # degenerate source: single center point so raster is defined
        return {"kind": "points", "pts": np.zeros((1, 3), np.float32), "splat": 1}

    def to_obj(px, py):
        # pixel -> object space, y up, unit-ish square
        return (px / w - 0.5) * 2.0, (0.5 - py / h) * 2.0

    if construction == "points":
        # every ~2px ink pixel a particle, z-jitter +-0.22 (prototype)
        sel = slice(None, None, 2)
        xr, yr = xs[sel], ys[sel]
        ox, oy = to_obj(xr, yr)
        rng = np.random.default_rng(1)  # geometry jitter is fixed (not per-frame)
        oz = (rng.random(ox.shape) - 0.5) * 0.44
        pts = np.stack([ox, oy, oz], axis=1).astype(np.float32)
        return {"kind": "points", "pts": pts, "splat": 1}

    if construction == "voxels":
        # sample ink into a grid, step 7px -> cubes; z-jitter +-0.06
        step = max(2, round(7 * w / 520))
        grid = ink[::step, ::step]
        gy, gx = np.nonzero(grid)
        px, py = gx * step, gy * step
        ox, oy = to_obj(px, py)
        rng = np.random.default_rng(2)
        oz = (rng.random(ox.shape) - 0.5) * 0.12
        pts = np.stack([ox, oy, oz], axis=1).astype(np.float32)
        splat = max(2, round(step * 1.8))
        return {"kind": "voxels", "pts": pts, "splat": splat, "z_depth": 0.18}

    # slab constructions: extrude (dense) or planes (14 slices)
    n_slices = 22 if construction == "extrude" else 14
    depth = (
        16.0 / 520.0 * 2.0 * (n_slices / 22.0)
    )  # ~prototype extrude depth in object units
    zs = np.linspace(-depth, depth, n_slices).astype(np.float32)
    return {"kind": "slab", "mask": ink, "zs": zs}


# ---------------------------------------------------------------------------
# 3D transform + projection
# ---------------------------------------------------------------------------
def _rot_matrix(ry: float, rx: float) -> np.ndarray:
    cy, sy = np.cos(ry), np.sin(ry)
    cx, sx = np.cos(rx), np.sin(rx)
    Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]], np.float32)
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]], np.float32)
    return Rx @ Ry


def _project(pts: np.ndarray, R: np.ndarray, cam: float, W: int, H: int, scale: float):
    """Rotate object-space pts by R, perspective-project to pixel coords."""
    p = pts @ R.T
    denom = np.maximum(cam - p[:, 2], 0.05)
    f = 2.2  # focal-ish; tuned so the object fills the frame with scale below
    sx = f * p[:, 0] / denom
    sy = f * p[:, 1] / denom
    cx = W * 0.5 + sx * scale
    cy = H * 0.5 - sy * scale
    return cx, cy, p[:, 2]


def _render_scene(
    geom: dict, ry: float, rx: float, cam: float, W: int, H: int
) -> np.ndarray:
    """Rasterize the spinning object into a float32 intensity buffer (0..1, HxW).

    Depth shades the mark (MeshStandard-ish): nearer facets brighter.
    """
    scene = np.zeros((H, W), np.float32)
    R = _rot_matrix(ry, rx)
    scale = min(W, H) * 0.36

    if geom["kind"] == "slab":
        mask = (geom["mask"] > 0).astype(np.float32)
        mh, mw = mask.shape
        src_corners = np.array([[0, 0], [mw, 0], [mw, mh], [0, mh]], np.float32)
        # object-space corners of a unit square, y up
        base = np.array([[-1, 1], [1, 1], [1, -1], [-1, -1]], np.float32)
        for z in geom["zs"]:
            corners3d = np.column_stack([base, np.full(4, z, np.float32)])
            cx, cy, cz = _project(corners3d, R, cam, W, H, scale)
            dst = np.column_stack([cx, cy]).astype(np.float32)
            try:
                M = cv2.getPerspectiveTransform(src_corners, dst)
            except cv2.error:
                continue
            warped = cv2.warpPerspective(mask, M, (W, H), flags=cv2.INTER_LINEAR)
            shade = float(np.clip(0.55 + 0.45 * (cz.mean() / 2.0 + 0.5), 0.2, 1.0))
            np.maximum(scene, warped * shade, out=scene)
        return np.clip(scene, 0.0, 1.0)

    # point / voxel splatting
    pts = geom["pts"]
    z_depth = geom.get("z_depth", 0.0)
    if z_depth:  # voxels: front and back face so depth reads on spin
        front = pts.copy()
        front[:, 2] += z_depth
        back = pts.copy()
        back[:, 2] -= z_depth
        pts = np.concatenate([front, back], axis=0)
    cx, cy, cz = _project(pts, R, cam, W, H, scale)
    order = np.argsort(cz)  # painter's: far first
    cx, cy, cz = cx[order], cy[order], cz[order]
    ix = np.round(cx).astype(np.int64)
    iy = np.round(cy).astype(np.int64)
    valid = (ix >= 0) & (ix < W) & (iy >= 0) & (iy < H)
    ix, iy, cz = ix[valid], iy[valid], cz[valid]
    shade = np.clip(0.55 + 0.45 * (cz / 2.0 + 0.5), 0.2, 1.0).astype(np.float32)
    splat = geom.get("splat", 1)
    if splat <= 1:
        scene[iy, ix] = np.maximum(scene[iy, ix], shade)
    else:
        r = splat // 2
        for dx in range(-r, r + 1):
            for dy in range(-r, r + 1):
                jx = np.clip(ix + dx, 0, W - 1)
                jy = np.clip(iy + dy, 0, H - 1)
                np.maximum.at(scene, (jy, jx), shade)
    return np.clip(scene, 0.0, 1.0)


# ---------------------------------------------------------------------------
# Tempo curve + spin schedule (pure function of frame time)
# ---------------------------------------------------------------------------
def _delay_at(gen: int, generations: int) -> float:
    t = min(1.0, gen / generations)
    return 140.0 - 70.0 * t * t - 25.0 * (t**8)


def _gen_after(gen: int, direction: int, generations: int, end_behavior: str):
    """Advance the generation counter one print, honoring end behavior."""
    gen += direction
    if gen >= generations:
        if end_behavior == "pingpong":
            gen, direction = generations, -1
        elif end_behavior == "rebirth":
            gen, direction = 0, 1
        else:  # stop
            gen, direction = generations, 0
    elif gen <= 0:
        gen, direction = 0, 1
    return gen, direction


def _print_state_at(time_ms: float, params: dict):
    """Walk the print schedule from t=0 to time_ms, integrating the spin.

    Returns (print_no, gen, ry, rx, fire_time_ms) for the print currently on
    screen at ``time_ms`` (the last print whose fire time <= time_ms).
    Deterministic function of time_ms + params only.
    """
    generations = int(params.get("generations", 120))
    spin_mult = float(params.get("spin_rate", 1.0))
    edge = float(params.get("edge_accel", 1.15))
    end_behavior = str(params.get("end_behavior", "pingpong"))

    ang = 0.0  # spin angle, integrated in ms
    t = 0.0  # time of the current print
    gen = 0
    direction = 1
    print_no = 0
    while print_no < _MAX_PRINTS:
        next_t = t + _delay_at(gen, generations)
        if next_t > time_ms:
            break
        # integrate the angle across this print's dwell, edge-dependent speed
        dt = next_t - t
        steps = max(1, int(dt / 8.0))
        sub = dt / steps
        for _ in range(steps):
            side = np.sin(ang) ** 2
            ang += sub * _SPIN_RATE * spin_mult * (0.85 + edge * side)
        t = next_t
        gen, direction = _gen_after(gen, direction, generations, end_behavior)
        print_no += 1
    rx = float(np.sin(t * 0.00021) * 0.14)
    return print_no, gen, float(ang), rx, t


# ---------------------------------------------------------------------------
# Machines (numpy port of the GLSL xerox shader)
# ---------------------------------------------------------------------------
def _bayer4() -> np.ndarray:
    return np.array(
        [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]], np.float32
    )


def _machine(
    name: str, L: np.ndarray, g: float, rng: np.random.Generator
) -> np.ndarray:
    """Apply one photocopy machine to composited luminance L (0..1) -> 0/1."""
    H, W = L.shape
    if name == "toner":
        n = (rng.random((H, W)).astype(np.float32) - 0.5) * (0.18 + g * 0.9)
        o = (L + n > 0.42).astype(np.float32)
    elif name == "bayer":
        cell = 1.0 + g * 2.0
        m = _bayer4()
        thr = (m + 1.0) / 17.0
        big = np.kron(
            thr, np.ones((int(round(4 * cell)), int(round(4 * cell))), np.float32)
        )
        tile = np.tile(
            big,
            (int(np.ceil(H / big.shape[0])) + 1, int(np.ceil(W / big.shape[1])) + 1),
        )
        thr_full = tile[:H, :W]
        noise = (rng.random((H, W)).astype(np.float32) - 0.5) * g * 0.35
        o = (L + noise > thr_full).astype(np.float32)
    elif name == "halftone":
        s = np.pi / (4.0 + g * 10.0)
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        qx = xx * 0.7071 - yy * 0.7071
        qy = xx * 0.7071 + yy * 0.7071
        pat = (np.sin(qx * s) * np.sin(qy * s)) * 4.0
        o = (L * (1.0 + g * 0.4) + pat * 0.25 - 0.25 > 0.5).astype(np.float32)
    elif name == "sobel":
        gx = cv2.Sobel(L, cv2.CV_32F, 1, 0, ksize=3)
        gy = cv2.Sobel(L, cv2.CV_32F, 0, 1, ksize=3)
        e = np.sqrt(gx * gx + gy * gy)
        o = (e > max(0.02, 0.25 - g * 0.12)).astype(np.float32)
    elif name == "ascii":
        o = _machine_ascii(L, g, rng)
    else:
        o = (L > 0.42).astype(np.float32)

    # toner starvation flicker at high generation (per-column dropout)
    if g > 0.0:
        col_drop = rng.random(W).astype(np.float32) < g * 0.10
        o[:, col_drop] *= 0.35
    return o


def _machine_ascii(L: np.ndarray, g: float, rng: np.random.Generator) -> np.ndarray:
    H, W = L.shape
    cell_px = max(2, int(round(7.0 * (1.0 + g * 0.6))))
    gh = max(1, H // cell_px)
    gw = max(1, W // cell_px)
    cl = cv2.resize(L, (gw, gh), interpolation=cv2.INTER_AREA)
    cl = np.power(np.clip(cl, 0, 1), 0.8)
    cl = cl + (rng.random((gh, gw)).astype(np.float32) - 0.5) * g * 0.22
    # luminance -> glyph index (blank..block)
    idx = np.zeros((gh, gw), np.int64)
    idx[cl > 0.12] = 1
    idx[cl > 0.24] = 2
    idx[cl > 0.38] = 3
    idx[cl > 0.55] = 4
    idx[cl > 0.72] = 5
    idx[cl > 0.90] = 6
    # decode glyph masks -> (7,5,5) bit table
    glyphs = np.zeros((len(_GLYPH_MASKS), 5, 5), np.float32)
    for gi, mask in enumerate(_GLYPH_MASKS):
        for row in range(5):
            for col in range(5):
                bit = col + 5 * (4 - row)
                if mask > 0 and (int(mask) >> bit) & 1:
                    glyphs[gi, row, col] = 1.0
    cell_bmp = glyphs[idx]  # (gh, gw, 5, 5)
    bmp = cell_bmp.transpose(0, 2, 1, 3).reshape(gh * 5, gw * 5)
    out = cv2.resize(bmp, (gw * cell_px, gh * cell_px), interpolation=cv2.INTER_NEAREST)
    full = np.zeros((H, W), np.float32)
    full[: out.shape[0], : out.shape[1]] = out[:H, :W]
    return full


# ---------------------------------------------------------------------------
# Compose one print: fresh scene + feedback -> machine -> color
# ---------------------------------------------------------------------------
def _compose_print(geom, params, ry, rx, gen, print_no, prev_print, seed, W, H):
    """Produce one print's machine output (float 0..1, HxW) and return it."""
    generations = int(params.get("generations", 120))
    g = min(1.0, gen / generations)
    cam = float(params.get("camera_distance", 7.0))
    machine = str(params.get("machine", "toner"))
    feed_base = float(params.get("feed_base", 0.30))
    feed_ramp = float(params.get("feed_ramp", 0.18))

    fresh = _render_scene(geom, ry, rx, cam, W, H)
    feed = feed_base + g * feed_ramp
    if prev_print is not None and prev_print.shape == fresh.shape:
        composited = np.maximum(fresh, prev_print * feed)
    else:
        composited = fresh

    # noise re-seeds PER PRINT, frozen between prints
    rng = make_rng((int(seed) ^ (print_no * 2654435761)) & 0x7FFFFFFF)
    if machine == "random":
        pool = _MACHINES[:-1]
        machine = pool[int(rng.integers(0, len(pool)))]
    return _machine(machine, composited, g, rng)


def _colorize(o: np.ndarray, params: dict, tint: np.ndarray) -> np.ndarray:
    """Map the 0..1 machine output to an RGB frame (paper/ink), honoring color+invert."""
    color_mode = str(params.get("color_mode", "bw"))
    invert = bool(params.get("invert", False))
    ink = tint if color_mode == "color" else _INK
    o3 = o[:, :, None]
    rgb = _BG[None, None, :] * (1.0 - o3) + ink[None, None, :] * o3
    if invert:
        rgb = 255.0 - rgb
    return np.clip(rgb, 0, 255).astype(np.uint8)


# ---------------------------------------------------------------------------
# Effect entry point
# ---------------------------------------------------------------------------
def apply(
    frame: np.ndarray,
    params: dict,
    state_in: dict | None = None,
    *,
    frame_index: int,
    seed: int,
    resolution: tuple[int, int],
) -> tuple[np.ndarray, dict | None]:
    """Render the spinning, degrading 3D object for this frame.

    The mesh spins continuously but the screen updates only on the tempo curve:
    consecutive frames inside one print are byte-identical (frozen), and the
    image changes only at print boundaries. The previous print re-enters the
    next print's input (true generation loss) via threaded state.
    """
    H, W = frame.shape[:2]
    # working buffer capped to 1080p; result resized back to input shape
    if W > _CAP_W or H > _CAP_H:
        s = min(_CAP_W / W, _CAP_H / H)
        wW, wH = max(1, int(W * s)), max(1, int(H * s))
    else:
        wW, wH = W, H

    ms_per_frame = float(params.get("ms_per_frame", 33.333))
    time_now = frame_index * ms_per_frame
    print_no, gen, ry, rx, _fire = _print_state_at(time_now, params)

    # Reuse cached geometry / feedback across frames when the source is unchanged.
    construction = str(params.get("construction", "extrude"))
    geom = None
    prev_print = None
    last_print_no = -1
    last_output = None
    src_sig = (int(frame[:, :, :3].sum()), W, H, construction)
    if state_in is not None and state_in.get("src_sig") == src_sig:
        geom = state_in.get("geom")
        prev_print = state_in.get("prev_print")
        last_print_no = state_in.get("last_print_no", -1)
        last_output = state_in.get("last_output")

    if geom is None:
        ink = _ink_mask(
            cv2.resize(frame, (wW, wH), interpolation=cv2.INTER_AREA)
            if (wW, wH) != (W, H)
            else frame
        )
        geom = _build_geometry(ink, construction)

    # Between prints: nothing changed on screen — re-emit the frozen last print.
    if print_no == last_print_no and last_output is not None:
        return last_output.copy(), state_in

    # A new print comes off the machine.
    o = _compose_print(geom, params, ry, rx, gen, print_no, prev_print, seed, wW, wH)
    tint = _INK
    if str(params.get("color_mode", "bw")) == "color":
        rgb = frame[:, :, :3].reshape(-1, 3).astype(np.float32)
        lum = rgb @ np.array([0.299, 0.587, 0.114], np.float32)
        mark = rgb[lum > 110]
        tint = mark.mean(axis=0).astype(np.float32) if mark.size else _INK
    out_rgb = _colorize(o, params, tint)
    if (wW, wH) != (W, H):
        out_rgb = cv2.resize(out_rgb, (W, H), interpolation=cv2.INTER_LINEAR)
    output = np.dstack([out_rgb, np.full((H, W), 255, np.uint8)])

    state_out = {
        "src_sig": src_sig,
        "geom": geom,
        "prev_print": o,  # this print feeds the next print
        "last_print_no": print_no,
        "last_output": output,
    }
    return output, state_out
