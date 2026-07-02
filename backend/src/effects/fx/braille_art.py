"""Braille Art — convert video frames to braille unicode patterns rendered as images."""

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

EFFECT_ID = "fx.braille_art"
EFFECT_NAME = "Braille Art"
EFFECT_CATEGORY = "stylize"

# Braille dot positions: each char is a 2x4 grid (U+2800-U+28FF)
_BRAILLE_DOTS = [
    [0x01, 0x08],
    [0x02, 0x10],
    [0x04, 0x20],
    [0x40, 0x80],
]

PARAMS: dict = {
    "width": {
        "type": "int",
        "min": 10,
        "max": 200,
        "default": 60,
        "label": "Width",
        "curve": "linear",
        "unit": "chars",
        "description": "Braille character width (detail level)",
    },
    "threshold": {
        "type": "int",
        "min": 0,
        "max": 255,
        "default": 128,
        "label": "Threshold",
        "curve": "linear",
        "unit": "",
        "description": "Brightness cutoff for dot on/off",
    },
    "color_mode": {
        "type": "choice",
        "options": ["mono", "green", "amber"],
        "default": "mono",
        "label": "Color",
        "description": "Text color mode",
    },
    "invert": {
        "type": "choice",
        "options": ["false", "true"],
        "default": "false",
        "label": "Invert",
        "description": "Invert dot pattern",
    },
}

_MONO_FONTS = [
    "/System/Library/Fonts/Menlo.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf",
]

_font_cache: dict = {}


def _get_font(size: int):
    """Load a monospace font with braille support. Cached."""
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


def apply(
    frame: np.ndarray,
    params: dict,
    state_in: dict | None = None,
    *,
    frame_index: int,
    seed: int,
    resolution: tuple[int, int],
) -> tuple[np.ndarray, dict | None]:
    """Braille art — 2x4 pixel grid to braille unicode, rendered as image."""
    char_width = max(10, min(200, int(params.get("width", 60))))
    threshold = max(0, min(255, int(params.get("threshold", 128))))
    color_mode = str(params.get("color_mode", "mono"))
    do_invert = str(params.get("invert", "false")).lower() == "true"

    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]
    h, w = rgb.shape[:2]

    # Each braille char = 2 px wide x 4 px tall
    img_width = char_width * 2
    aspect = h / max(1, w)
    img_height_px = int(img_width * aspect)
    char_rows = max(1, (img_height_px + 3) // 4)
    img_height = char_rows * 4

    small = cv2.resize(rgb, (img_width, img_height), interpolation=cv2.INTER_AREA)
    gray = cv2.cvtColor(small, cv2.COLOR_RGB2GRAY)

    # Build braille lines
    lines = []
    for row in range(char_rows):
        line = ""
        for col in range(char_width):
            bits = 0
            for dy in range(4):
                for dx in range(2):
                    py = row * 4 + dy
                    px = col * 2 + dx
                    if py < img_height and px < img_width:
                        pixel_on = gray[py, px] > threshold
                        if do_invert:
                            pixel_on = not pixel_on
                        if pixel_on:
                            bits |= _BRAILLE_DOTS[dy][dx]
            line += chr(0x2800 + bits)
        lines.append(line)

    # Render text to image
    color_map = {
        "mono": (255, 255, 255),
        "green": (0, 255, 0),
        "amber": (255, 191, 0),
    }
    text_color = color_map.get(color_mode, (255, 255, 255))

    canvas = Image.new("RGB", (w, h), (0, 0, 0))
    if lines:
        draw = ImageDraw.Draw(canvas)
        num_lines = len(lines)
        max_line_len = max(len(line) for line in lines)

        font_size = max(6, min(int(h / num_lines * 0.85), int(w / max_line_len * 1.8)))
        font = _get_font(font_size)

        bbox = draw.textbbox((0, 0), "X", font=font)
        char_h = max(1, bbox[3] - bbox[1])
        line_spacing = int(char_h * 1.15)
        y_start = max(0, (h - num_lines * line_spacing) // 2)

        for row_idx, line in enumerate(lines):
            y_pos = y_start + row_idx * line_spacing
            if y_pos > h:
                break
            draw.text((2, y_pos), line, fill=text_color, font=font)

    result_rgb = np.array(canvas)
    return np.concatenate([result_rgb, alpha], axis=2), None
