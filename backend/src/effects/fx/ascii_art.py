"""ASCII Art — convert video frames to ASCII characters rendered back as images."""

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

EFFECT_ID = "fx.ascii_art"
EFFECT_NAME = "ASCII Art"
EFFECT_CATEGORY = "stylize"

_CHARSETS = {
    "basic": " .:-=+*#%@",
    "dense": " .'`^\",:;Il!i><~+_-?][}{1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
    "block": " ░▒▓█",
    "binary": "01",
    "katakana": " ｦｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ",
    "dots": " ⠁⠂⠃⠄⠅⠆⠇⡀⡁⣀⣁⣂⣃⣄⣅⣆⣇⣏⣟⣿",
}

PARAMS: dict = {
    "charset": {
        "type": "choice",
        "options": list(_CHARSETS.keys()),
        "default": "basic",
        "label": "Charset",
        "description": "Character set for rendering",
    },
    "width": {
        "type": "int",
        "min": 20,
        "max": 200,
        "default": 80,
        "label": "Width",
        "curve": "linear",
        "unit": "chars",
        "description": "ASCII width in characters (detail level)",
    },
    "color_mode": {
        "type": "choice",
        "options": ["mono", "green", "amber", "original"],
        "default": "mono",
        "label": "Color",
        "description": "Text color mode",
    },
    "invert": {
        "type": "choice",
        "options": ["false", "true"],
        "default": "false",
        "label": "Invert",
        "description": "Swap light/dark character mapping",
    },
}

_MONO_FONTS = [
    "/System/Library/Fonts/Menlo.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf",
]


_font_cache: dict[int, ImageFont.FreeTypeFont] = {}


def _get_font(size: int):
    """Try to load a monospace font, fall back to default. Results are cached."""
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
    """ASCII art — luminance-to-character mapping rendered back as image."""
    charset_name = str(params.get("charset", "basic"))
    ascii_width = max(20, min(200, int(params.get("width", 80))))
    color_mode = str(params.get("color_mode", "mono"))
    do_invert = str(params.get("invert", "false")).lower() == "true"

    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]
    h, w = rgb.shape[:2]

    chars = _CHARSETS.get(charset_name, _CHARSETS["basic"])
    if do_invert:
        chars = chars[::-1]
    num_chars = len(chars)

    # Compute target height preserving aspect ratio
    ascii_height = max(1, int(ascii_width * (h / w) * 0.55))

    # Downscale frame
    small = cv2.resize(rgb, (ascii_width, ascii_height), interpolation=cv2.INTER_AREA)
    gray = cv2.cvtColor(small, cv2.COLOR_RGB2GRAY).astype(np.float32)

    # Map pixels to characters
    lines = []
    for y in range(ascii_height):
        row = ""
        for x in range(ascii_width):
            idx = min(int(gray[y, x] / 256 * num_chars), num_chars - 1)
            row += chars[idx]
        lines.append(row)

    # Color settings
    color_map = {
        "mono": (255, 255, 255),
        "green": (0, 255, 0),
        "amber": (255, 191, 0),
    }

    # Render with Pillow (supports Unicode charsets)
    bg = (0, 0, 0)
    canvas = Image.new("RGB", (w, h), bg)
    if not lines:
        result_rgb = np.array(canvas)
    else:
        draw = ImageDraw.Draw(canvas)
        num_lines = len(lines)
        max_line_len = max(len(line) for line in lines)

        font_size = max(6, min(int(h / num_lines * 0.85), int(w / max_line_len * 1.8)))
        font = _get_font(font_size)

        bbox = draw.textbbox((0, 0), "X", font=font)
        char_h = max(1, bbox[3] - bbox[1])
        char_w = max(1, bbox[2] - bbox[0])
        line_spacing = int(char_h * 1.15)
        y_start = max(0, (h - num_lines * line_spacing) // 2)

        if color_mode == "original":
            # Per-character color from source image
            for row_idx, line in enumerate(lines):
                y_pos = y_start + row_idx * line_spacing
                if y_pos > h:
                    break
                for col_idx, ch in enumerate(line):
                    if ch == " ":
                        continue
                    src_y = min(row_idx, small.shape[0] - 1)
                    src_x = min(col_idx, small.shape[1] - 1)
                    c = tuple(int(v) for v in small[src_y, src_x])
                    x_pos = 2 + col_idx * char_w
                    if x_pos < w:
                        draw.text((x_pos, y_pos), ch, fill=c, font=font)
        else:
            text_color = color_map.get(color_mode, (255, 255, 255))
            for row_idx, line in enumerate(lines):
                y_pos = y_start + row_idx * line_spacing
                if y_pos > h:
                    break
                draw.text((2, y_pos), line, fill=text_color, font=font)

        result_rgb = np.array(canvas)

    output = np.concatenate([result_rgb, alpha], axis=2)
    return output, None
