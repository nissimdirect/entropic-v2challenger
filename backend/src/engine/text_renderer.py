"""Text renderer — rasterizes text configuration to RGBA frames using Pillow.

Renders text with font, size, color, position, stroke, shadow, and alignment.
Supports 8 animation presets with grippable duration curves.
Frame cache: skip re-render when config is unchanged between frames.
"""

import hashlib
import json
import logging
import os
import platform
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

logger = logging.getLogger(__name__)

# --- Font enumeration (system fonts only, no matplotlib) ---

_MACOS_FONT_DIRS = [
    "/System/Library/Fonts/",
    "/Library/Fonts/",
    os.path.expanduser("~/Library/Fonts/"),
]

_LINUX_FONT_DIRS = [
    "/usr/share/fonts/",
    "/usr/local/share/fonts/",
    os.path.expanduser("~/.fonts/"),
]


@lru_cache(maxsize=1)
def list_system_fonts() -> list[dict]:
    """Enumerate system fonts. Returns list of {name, path, style}.

    Handles .ttf, .otf, and .ttc (font collections) on macOS.
    Cached — fonts don't change during a session.
    """
    fonts: list[dict] = []
    seen_names: set[str] = set()

    if platform.system() == "Darwin":
        dirs = _MACOS_FONT_DIRS
    else:
        dirs = _LINUX_FONT_DIRS

    for font_dir in dirs:
        p = Path(font_dir)
        if not p.exists():
            continue
        for f in p.rglob("*"):
            if f.suffix.lower() not in (".ttf", ".otf", ".ttc"):
                continue
            try:
                font = ImageFont.truetype(str(f), 12)
                name = font.getname()[0]
                style = font.getname()[1]
                if name not in seen_names:
                    fonts.append(
                        {
                            "name": name,
                            "path": str(f),
                            "style": style,
                        }
                    )
                    seen_names.add(name)
            except Exception:
                continue  # Skip unreadable fonts

    fonts.sort(key=lambda x: x["name"].lower())
    return fonts


# --- Validated font lookup ---

# Build an allowlist of known font paths at startup
_ALLOWED_FONT_PATHS: set[str] | None = None


def _get_allowed_font_paths() -> set[str]:
    """Return set of validated system font file paths."""
    global _ALLOWED_FONT_PATHS
    if _ALLOWED_FONT_PATHS is None:
        _ALLOWED_FONT_PATHS = {f["path"] for f in list_system_fonts()}
    return _ALLOWED_FONT_PATHS


def _resolve_font(font_family: str, font_size: int) -> ImageFont.FreeTypeFont:
    """Resolve font family name to a validated system font.

    Never passes raw user paths to ImageFont.truetype() — looks up
    font_family against enumerated font list only.
    """
    fonts = list_system_fonts()
    for f in fonts:
        if f["name"].lower() == font_family.lower():
            return ImageFont.truetype(f["path"], font_size)

    # Fallback: try to find a partial match
    for f in fonts:
        if font_family.lower() in f["name"].lower():
            return ImageFont.truetype(f["path"], font_size)

    # Ultimate fallback: first available system font, or Pillow default
    if fonts:
        return ImageFont.truetype(fonts[0]["path"], font_size)
    return ImageFont.load_default(size=max(8, font_size))


# --- Animation presets ---

ANIMATION_PRESETS = [
    "none",
    "fade_in",
    "fade_out",
    "scale_up",
    "slide_left",
    "slide_up",
    "typewriter",
    "bounce",
]


def _apply_animation(
    preset: str,
    frame_index: int,
    fps: float,
    duration_frames: int,
    text: str,
    position: tuple[int, int],
    opacity: float,
    resolution: tuple[int, int] = (1920, 1080),
) -> tuple[tuple[int, int], float, float, int]:
    """Apply animation preset. Returns (position, opacity, scale, visible_chars).

    Args:
        preset: Animation name from ANIMATION_PRESETS.
        frame_index: Current frame within the clip.
        fps: Project FPS.
        duration_frames: Total frames for the animation.
        text: Full text string.
        position: (x, y) base position.
        opacity: Base opacity (0-1).

    Returns:
        (position, opacity, scale, visible_chars)
    """
    if duration_frames <= 0:
        duration_frames = 1
    t = min(frame_index / duration_frames, 1.0)  # 0..1 progress

    x, y = position
    scale = 1.0
    visible_chars = len(text)

    if preset == "none":
        pass
    elif preset == "fade_in":
        opacity *= t
    elif preset == "fade_out":
        opacity *= 1.0 - t
    elif preset == "scale_up":
        scale = 0.5 + 0.5 * t
    elif preset == "slide_left":
        # Slide in from right edge
        x = int(x + (resolution[0] * (1.0 - t)))
    elif preset == "slide_up":
        # Slide up from below
        y = int(y + (resolution[1] * (1.0 - t)))
    elif preset == "typewriter":
        visible_chars = max(1, int(len(text) * t))
    elif preset == "bounce":
        # Damped bounce
        import math

        bounce_t = 1.0 - abs(math.sin(t * math.pi * 3)) * (1.0 - t) * 0.3
        y = int(y * bounce_t)

    return (x, y), opacity, scale, visible_chars


# --- Frame cache (thread-safe: export thread + preview thread both call render_text_frame) ---

import threading

_frame_cache: dict[str, np.ndarray] = {}
_frame_cache_lock = threading.Lock()
_MAX_CACHE_SIZE = 8  # ~64 MB at 1080p, ~250 MB at 4K


def _config_hash(text_config: dict, resolution: tuple[int, int]) -> str:
    """Compute a stable hash for a text config + resolution."""
    # Exclude frame_index from hash — animation varies per frame
    key_data = json.dumps(text_config, sort_keys=True) + str(resolution)
    return hashlib.md5(key_data.encode()).hexdigest()


def _config_hash_with_frame(
    text_config: dict, resolution: tuple[int, int], frame_index: int
) -> str:
    """Hash including frame index — for animated text."""
    key_data = (
        json.dumps(text_config, sort_keys=True) + str(resolution) + str(frame_index)
    )
    return hashlib.md5(key_data.encode()).hexdigest()


# --- Main render function ---


def render_text_frame(
    text_config: dict,
    resolution: tuple[int, int],
    frame_index: int = 0,
    fps: float = 30.0,
) -> np.ndarray:
    """Render a text configuration to an RGBA numpy frame.

    Args:
        text_config: {
            text: str,
            font_family: str,
            font_size: int (default 48),
            color: str (hex, e.g. "#ffffff"),
            position: [x, y] (pixels from top-left),
            alignment: "left" | "center" | "right" (default "left"),
            opacity: float (0-1, default 1.0),
            stroke_width: int (default 0),
            stroke_color: str (hex, default "#000000"),
            shadow_offset: [x, y] (default [0, 0]),
            shadow_color: str (hex, default "#00000080"),
            animation: str (preset name, default "none"),
            animation_duration: float (seconds, default 1.0),
        }
        resolution: (width, height).
        frame_index: Current frame number.
        fps: Frames per second.

    Returns:
        RGBA uint8 numpy array (H, W, 4).
    """
    width, height = resolution
    text = str(text_config.get("text", ""))
    if not text:
        return np.zeros((height, width, 4), dtype=np.uint8)

    animation = str(text_config.get("animation", "none"))
    has_animation = animation != "none"

    # Check cache (static text = config-only hash, animated = config+frame hash)
    if has_animation:
        cache_key = _config_hash_with_frame(text_config, resolution, frame_index)
    else:
        cache_key = _config_hash(text_config, resolution)

    with _frame_cache_lock:
        if cache_key in _frame_cache:
            return _frame_cache[cache_key]

    # Parse config with guards
    font_family = str(text_config.get("font_family", "Helvetica"))
    font_size = max(8, min(2000, int(text_config.get("font_size", 48))))
    color_hex = str(text_config.get("color", "#ffffff"))
    pos = text_config.get("position", [width // 2, height // 2])
    alignment = str(text_config.get("alignment", "left"))
    opacity = float(text_config.get("opacity", 1.0))
    stroke_width = int(text_config.get("stroke_width", 0))
    stroke_color = str(text_config.get("stroke_color", "#000000"))
    shadow_offset = text_config.get("shadow_offset", [0, 0])
    animation_duration = float(text_config.get("animation_duration", 1.0))

    # Animation
    duration_frames = max(1, int(animation_duration * fps))
    position, opacity, scale, visible_chars = _apply_animation(
        animation,
        frame_index,
        fps,
        duration_frames,
        text,
        (int(pos[0]), int(pos[1])),
        opacity,
        resolution,
    )
    display_text = text[:visible_chars]

    if opacity <= 0:
        result = np.zeros((height, width, 4), dtype=np.uint8)
        _cache_frame(cache_key, result)
        return result

    # Create transparent canvas
    img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Resolve font (scaled if animation applies scale)
    scaled_size = max(8, int(font_size * scale))
    font = _resolve_font(font_family, scaled_size)

    # Parse colors
    text_color = _parse_color_with_opacity(color_hex, opacity)
    shadow_color_parsed = _parse_color_with_opacity(
        str(text_config.get("shadow_color", "#000000")),
        opacity * 0.5,
    )
    stroke_color_parsed = _parse_hex_color(stroke_color)

    # Draw shadow
    sx, sy = int(shadow_offset[0]), int(shadow_offset[1])
    if sx != 0 or sy != 0:
        shadow_pos = (position[0] + sx, position[1] + sy)
        draw.text(
            shadow_pos,
            display_text,
            fill=shadow_color_parsed,
            font=font,
            anchor=_alignment_anchor(alignment),
        )

    # Draw text with stroke
    draw.text(
        position,
        display_text,
        fill=text_color,
        font=font,
        stroke_width=stroke_width,
        stroke_fill=stroke_color_parsed,
        anchor=_alignment_anchor(alignment),
    )

    result = np.array(img, dtype=np.uint8)
    _cache_frame(cache_key, result)
    return result


def _alignment_anchor(alignment: str) -> str:
    """Convert alignment to Pillow text anchor."""
    if alignment == "center":
        return "mt"  # middle-top
    elif alignment == "right":
        return "rt"  # right-top
    return "lt"  # left-top (default)


def _parse_hex_color(hex_str: str) -> tuple[int, int, int, int]:
    """Parse hex color string to RGBA tuple."""
    hex_str = hex_str.lstrip("#")
    if len(hex_str) == 6:
        r, g, b = int(hex_str[0:2], 16), int(hex_str[2:4], 16), int(hex_str[4:6], 16)
        return (r, g, b, 255)
    elif len(hex_str) == 8:
        r, g, b, a = (
            int(hex_str[0:2], 16),
            int(hex_str[2:4], 16),
            int(hex_str[4:6], 16),
            int(hex_str[6:8], 16),
        )
        return (r, g, b, a)
    return (255, 255, 255, 255)


def _parse_color_with_opacity(
    hex_str: str, opacity: float
) -> tuple[int, int, int, int]:
    """Parse hex color and apply opacity multiplier."""
    r, g, b, a = _parse_hex_color(hex_str)
    a = int(a * max(0.0, min(1.0, opacity)))
    return (r, g, b, a)


def _cache_frame(key: str, frame: np.ndarray):
    """Cache a rendered frame, evicting oldest if over limit."""
    with _frame_cache_lock:
        if len(_frame_cache) >= _MAX_CACHE_SIZE:
            oldest_key = next(iter(_frame_cache))
            del _frame_cache[oldest_key]
        _frame_cache[key] = frame


def clear_text_cache():
    """Clear the text frame cache."""
    with _frame_cache_lock:
        _frame_cache.clear()
