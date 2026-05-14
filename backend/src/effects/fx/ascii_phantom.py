"""ASCII Phantom — recursive ASCII collapse.

Frankenstein #2 of 30. Stacks `ascii_art.py`'s pixel-to-glyph encoder with
`generation_loss.py`'s N-pass recursive degradation. Each pass converts the
current frame to ASCII text, renders that text back to a raster, then feeds
the raster as the input for the next pass. After 3-5 passes the image
collapses into a stable typographic basin.

Frankenstein recipe:
- Body: `ascii_art.py` (luminance → glyph mapping with selectable charset)
- Spine: `generation_loss.py` (N-pass recursion architecture)
- Twist: codec is ASCII, not JPEG. Each pass shrinks information toward the
  glyph attractor instead of toward block artifacts.

PLAY-005: clamp every numeric param at the trust boundary.
"""

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

EFFECT_ID = "fx.ascii_phantom"
EFFECT_NAME = "ASCII Phantom"
EFFECT_CATEGORY = "stylize"

_CHARSETS = {
    "binary": " #",
    "sparse": " .:#@",
    "standard": " .,:;ox%#@",
    "dense": " .'`^\",:;Il!i><~+_-?][}{1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
}

PARAMS: dict = {
    "passes": {
        "type": "int",
        "min": 1,
        "max": 8,
        "default": 3,
        "label": "Passes",
        "curve": "linear",
        "unit": "",
        "description": "Recursive ASCII iterations — more = deeper typographic collapse",
    },
    "glyph_size": {
        "type": "int",
        "min": 4,
        "max": 32,
        "default": 8,
        "label": "Glyph Size",
        "curve": "linear",
        "unit": "px",
        "description": "Pixel block per glyph; smaller = denser, slower to collapse",
    },
    "charset": {
        "type": "choice",
        "options": list(_CHARSETS.keys()),
        "default": "standard",
        "label": "Charset",
        "description": "Character ramp (light → dark)",
    },
    "color_mode": {
        "type": "choice",
        "options": ["mono", "preserve", "green", "amber"],
        "default": "preserve",
        "label": "Color",
        "description": "mono = white text on black; preserve = sample source color",
    },
    "progressive_collapse": {
        "type": "choice",
        "options": ["false", "true"],
        "default": "false",
        "label": "Progressive Collapse",
        "description": "Each pass narrows the charset toward binary",
    },
    "degrade": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.0,
        "label": "Degrade",
        "curve": "linear",
        "unit": "%",
        "description": "JPEG quality drop between passes (0 = clean, 1 = brutal)",
    },
    "mix": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 1.0,
        "label": "Mix",
        "curve": "linear",
        "unit": "%",
        "description": "Blend between phantom and original",
    },
}

_MONO_FONTS = [
    "/System/Library/Fonts/Menlo.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf",
]

# Cache by (font_size, charset_string) → dict of pre-rasterized glyph bitmaps.
_glyph_atlas_cache: dict[tuple[int, str], dict[str, np.ndarray]] = {}
_font_cache: dict[int, ImageFont.ImageFont] = {}


def _get_font(size: int):
    """Load a monospace font. Cached. Falls back to PIL default."""
    if size in _font_cache:
        return _font_cache[size]
    for fp in _MONO_FONTS:
        try:
            font = ImageFont.truetype(fp, size)
            _font_cache[size] = font
            return font
        except (OSError, IOError):
            continue
    font = ImageFont.load_default()
    _font_cache[size] = font
    return font


def _build_glyph_atlas(
    chars: str, font_size: int
) -> tuple[dict[str, np.ndarray], int, int]:
    """Pre-rasterize each glyph to a small grayscale bitmap. Cached."""
    key = (font_size, chars)
    if key in _glyph_atlas_cache:
        atlas = _glyph_atlas_cache[key]
        # All glyphs share dims by construction
        any_glyph = next(iter(atlas.values()))
        return atlas, any_glyph.shape[0], any_glyph.shape[1]

    font = _get_font(font_size)
    # Measure cell using 'M' (widest typical mono glyph) — clamp tiny sizes
    probe = Image.new("L", (font_size * 2, font_size * 2), 0)
    d = ImageDraw.Draw(probe)
    bbox = d.textbbox((0, 0), "M", font=font)
    cell_w = max(1, bbox[2] - bbox[0])
    cell_h = max(1, bbox[3] - bbox[1])

    atlas: dict[str, np.ndarray] = {}
    for ch in chars:
        canvas = Image.new("L", (cell_w, cell_h), 0)
        draw = ImageDraw.Draw(canvas)
        draw.text((0, -bbox[1]), ch, fill=255, font=font)
        atlas[ch] = (np.asarray(canvas, dtype=np.uint8) / 255.0).astype(np.float32)
    _glyph_atlas_cache[key] = atlas
    return atlas, cell_h, cell_w


def _render_pass(
    rgb: np.ndarray, charset_str: str, glyph_size: int, color_mode: str
) -> np.ndarray:
    """Single ASCII pass: image → ASCII grid → render back to image."""
    h, w = rgb.shape[:2]
    if len(charset_str) < 2:
        charset_str = "  #"  # guard: empty/single-char input
    num_chars = len(charset_str)

    # Build glyph atlas at requested cell pixel size.
    # Use ~glyph_size as the font size; cell dims auto-derived.
    atlas, cell_h, cell_w = _build_glyph_atlas(charset_str, glyph_size)

    # Grid dimensions — how many glyphs fit
    grid_w = max(1, w // cell_w)
    grid_h = max(1, h // cell_h)

    # Downsample frame to grid resolution for char selection
    small = cv2.resize(rgb, (grid_w, grid_h), interpolation=cv2.INTER_AREA)
    gray = cv2.cvtColor(small, cv2.COLOR_RGB2GRAY).astype(np.float32)

    # Map each cell to a char index
    idx = np.clip((gray / 256.0 * num_chars).astype(np.int32), 0, num_chars - 1)

    # Build output canvas matching original frame size
    canvas = np.zeros((h, w, 3), dtype=np.float32)

    # For each char in the set, paint ALL cells with that char in one mask blit.
    # Numpy-vectorized blit avoids per-cell PIL.text() (the perf killer).
    for ci, ch in enumerate(charset_str):
        glyph = atlas[ch]  # (cell_h, cell_w) float32 in [0,1]
        if glyph.sum() <= 0.0:
            continue
        ys, xs = np.where(idx == ci)
        if ys.size == 0:
            continue
        for cy, cx in zip(ys, xs):
            y0 = cy * cell_h
            x0 = cx * cell_w
            y1 = min(y0 + cell_h, h)
            x1 = min(x0 + cell_w, w)
            gh = y1 - y0
            gw = x1 - x0
            mask = glyph[:gh, :gw, np.newaxis]  # (gh, gw, 1)

            if color_mode == "preserve":
                color = small[cy, cx, :3].astype(np.float32)  # (3,)
            elif color_mode == "green":
                color = np.array([0.0, 255.0, 0.0], dtype=np.float32)
            elif color_mode == "amber":
                color = np.array([255.0, 191.0, 0.0], dtype=np.float32)
            else:  # mono
                color = np.array([255.0, 255.0, 255.0], dtype=np.float32)

            canvas[y0:y1, x0:x1, :] = mask * color[np.newaxis, np.newaxis, :]

    return np.clip(canvas, 0, 255).astype(np.uint8)


def _degrade_jpeg(rgb: np.ndarray, strength: float) -> np.ndarray:
    """Apply a JPEG round-trip at quality scaled by strength (0=skip, 1=brutal)."""
    if strength <= 0.0:
        return rgb
    # strength=0 → q=95, strength=1 → q=5
    quality = int(95 - strength * 90)
    quality = max(1, min(95, quality))
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    _, buf = cv2.imencode(".jpg", bgr, [cv2.IMWRITE_JPEG_QUALITY, quality])
    decoded = cv2.imdecode(buf, cv2.IMREAD_COLOR)
    return cv2.cvtColor(decoded, cv2.COLOR_BGR2RGB)


def apply(
    frame: np.ndarray,
    params: dict,
    state_in: dict | None = None,
    *,
    frame_index: int,
    seed: int,
    resolution: tuple[int, int],
) -> tuple[np.ndarray, dict | None]:
    """Recursive ASCII collapse — N passes of image→ASCII→image."""
    # PLAY-005: clamp every numeric param at the trust boundary.
    passes = max(1, min(8, int(params.get("passes", 3))))
    glyph_size = max(4, min(32, int(params.get("glyph_size", 8))))
    charset_name = str(params.get("charset", "standard"))
    color_mode = str(params.get("color_mode", "preserve"))
    progressive = str(params.get("progressive_collapse", "false")).lower() == "true"
    degrade = max(0.0, min(1.0, float(params.get("degrade", 0.0))))
    mix = max(0.0, min(1.0, float(params.get("mix", 1.0))))

    if charset_name not in _CHARSETS:
        charset_name = "standard"
    if color_mode not in {"mono", "preserve", "green", "amber"}:
        color_mode = "preserve"

    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]

    base_charset = _CHARSETS[charset_name]
    current = rgb

    for pass_idx in range(passes):
        # Progressive collapse: shrink charset each pass toward "binary"
        if progressive and passes > 1:
            # Linear ramp from full → binary endpoints
            # remaining = max(2, len(base) * (1 - i/(N-1)))
            t = pass_idx / max(1, passes - 1)
            keep = max(2, int(round(len(base_charset) * (1.0 - t * 0.85))))
            # Sample evenly across the ramp
            step = max(1, len(base_charset) // keep)
            this_charset = base_charset[::step][:keep]
            if len(this_charset) < 2:
                this_charset = _CHARSETS["binary"]
        else:
            this_charset = base_charset

        current = _render_pass(current, this_charset, glyph_size, color_mode)

        # Optional degrade between passes (not after the last pass)
        if degrade > 0.0 and pass_idx < passes - 1:
            current = _degrade_jpeg(current, degrade)

    # Final blend with original
    if mix < 1.0:
        result = current.astype(np.float32) * mix + rgb.astype(np.float32) * (1.0 - mix)
        result_rgb = np.clip(result, 0, 255).astype(np.uint8)
    else:
        result_rgb = current

    _ = (frame_index, seed, resolution, state_in)  # contract; not used
    return np.concatenate([result_rgb, alpha], axis=2), None
