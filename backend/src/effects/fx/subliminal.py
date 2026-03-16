"""Subliminal effect — 3-mode hidden content embedding.

Modes:
  - flash_insert: Probabilistic frame replacement with opacity blend.
  - channel_embed: LSB embedding in selected RGB channel.
  - second_source: Granular spray of source fragments at seeded positions.

Accepts text, image, or video as subliminal source.
Uses seeded RNG for deterministic output.
"""

import logging

import numpy as np

EFFECT_ID = "fx.subliminal"
EFFECT_NAME = "Subliminal"
EFFECT_CATEGORY = "creative"

logger = logging.getLogger(__name__)

PARAMS: dict = {
    "mode": {
        "type": "choice",
        "options": ["flash_insert", "channel_embed", "second_source"],
        "default": "flash_insert",
        "label": "Mode",
        "description": "Subliminal embedding method",
    },
    "source_type": {
        "type": "choice",
        "options": ["text", "image", "video"],
        "default": "text",
        "label": "Source Type",
        "description": "Type of subliminal content",
    },
    "source_text": {
        "type": "string",
        "default": "OBEY",
        "label": "Source Text",
        "description": "Text to embed (when source_type=text)",
    },
    "source_path": {
        "type": "string",
        "default": "",
        "label": "Source Path",
        "description": "Path to image/video source (when source_type=image/video)",
    },
    "probability": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.05,
        "label": "Flash Probability",
        "curve": "linear",
        "unit": "",
        "description": "Per-frame probability of flash_insert trigger",
    },
    "opacity": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.3,
        "label": "Blend Opacity",
        "curve": "linear",
        "unit": "",
        "description": "Opacity of subliminal content when visible",
    },
    "channel": {
        "type": "choice",
        "options": ["r", "g", "b"],
        "default": "b",
        "label": "Embed Channel",
        "description": "RGB channel for LSB embedding (channel_embed mode)",
    },
    "bits": {
        "type": "int",
        "min": 1,
        "max": 4,
        "default": 1,
        "label": "Embed Bits",
        "curve": "linear",
        "unit": "bits",
        "description": "Number of LSBs to use for embedding (1-4)",
    },
    "spray_count": {
        "type": "int",
        "min": 1,
        "max": 100,
        "default": 16,
        "label": "Spray Count",
        "curve": "linear",
        "unit": "",
        "description": "Number of source fragments for second_source mode",
    },
    "spray_size": {
        "type": "float",
        "min": 0.01,
        "max": 0.5,
        "default": 0.1,
        "label": "Spray Size",
        "curve": "linear",
        "unit": "",
        "description": "Size of each spray fragment as fraction of frame",
    },
}


def _get_source_frame(
    params: dict,
    resolution: tuple[int, int],
    frame_index: int,
    state_in: dict | None,
) -> tuple[np.ndarray | None, dict | None]:
    """Get the subliminal source frame based on source_type.

    Returns (source_frame, updated_state).
    """
    source_type = str(params.get("source_type", "text"))
    width, height = resolution

    if source_type == "text":
        # Render text using text_renderer
        from engine.text_renderer import render_text_frame

        text = str(params.get("source_text", "OBEY"))
        text_config = {
            "text": text,
            "font_family": "Helvetica",
            "font_size": max(24, height // 8),
            "color": "#ffffff",
            "position": [width // 2, height // 2],
            "alignment": "center",
        }
        return render_text_frame(text_config, resolution), state_in

    elif source_type == "image":
        source_path = str(params.get("source_path", ""))
        if not source_path:
            return None, state_in
        from security import validate_upload
        from video.image_reader import ImageReader, is_image_file

        errors = validate_upload(source_path)
        if errors:
            return None, state_in
        if not is_image_file(source_path):
            return None, state_in
        # Cache ImageReader in state
        state = state_in or {}
        if "image_reader" not in state:
            try:
                state["image_reader"] = ImageReader(source_path)
            except Exception:
                return None, state
        reader = state["image_reader"]
        frame = reader.decode_frame(0)
        # Resize to match resolution if needed
        if frame.shape[1] != width or frame.shape[0] != height:
            import cv2

            frame = cv2.resize(frame, (width, height), interpolation=cv2.INTER_LANCZOS4)
        return frame, state

    elif source_type == "video":
        source_path = str(params.get("source_path", ""))
        if not source_path:
            return None, state_in
        from security import validate_upload
        from video.reader import VideoReader

        errors = validate_upload(source_path)
        if errors:
            return None, state_in
        state = state_in or {}
        if "video_reader" not in state:
            try:
                state["video_reader"] = VideoReader(source_path)
            except Exception:
                return None, state
        reader = state["video_reader"]
        idx = frame_index % max(1, reader.frame_count)
        frame = reader.decode_frame(idx)
        if frame.shape[1] != width or frame.shape[0] != height:
            import cv2

            frame = cv2.resize(frame, (width, height), interpolation=cv2.INTER_LANCZOS4)
        return frame, state

    return None, state_in


def _flash_insert(
    frame: np.ndarray,
    source: np.ndarray,
    params: dict,
    rng: np.random.Generator,
) -> np.ndarray:
    """Flash insert mode — probabilistic full-frame blend."""
    probability = float(params.get("probability", 0.05))
    opacity = float(params.get("opacity", 0.3))

    if rng.random() > probability:
        return frame  # No flash this frame

    # Alpha blend source over frame
    output = frame.copy()
    output[:, :, :3] = (
        frame[:, :, :3].astype(np.float32) * (1.0 - opacity)
        + source[:, :, :3].astype(np.float32) * opacity
    ).astype(np.uint8)
    return output


def _channel_embed(
    frame: np.ndarray,
    source: np.ndarray,
    params: dict,
) -> np.ndarray:
    """Channel embed mode — LSB embedding in selected channel."""
    channel_map = {"r": 0, "g": 1, "b": 2}
    channel_idx = channel_map.get(str(params.get("channel", "b")), 2)
    bits = int(params.get("bits", 1))
    bits = max(1, min(4, bits))

    output = frame.copy()

    # Extract source luminance (grayscale)
    source_gray = (
        0.299 * source[:, :, 0].astype(np.float32)
        + 0.587 * source[:, :, 1].astype(np.float32)
        + 0.114 * source[:, :, 2].astype(np.float32)
    ).astype(np.uint8)

    # Quantize source to N bits
    source_quantized = source_gray >> (8 - bits)

    # Clear LSBs of target channel, then embed
    mask = np.uint8((0xFF << bits) & 0xFF)
    output[:, :, channel_idx] = (frame[:, :, channel_idx] & mask) | source_quantized

    return output


def _second_source(
    frame: np.ndarray,
    source: np.ndarray,
    params: dict,
    rng: np.random.Generator,
) -> np.ndarray:
    """Second source mode — granular spray of source fragments."""
    spray_count = int(params.get("spray_count", 16))
    spray_size = float(params.get("spray_size", 0.1))
    opacity = float(params.get("opacity", 0.3))

    h, w = frame.shape[:2]
    frag_w = max(1, int(w * spray_size))
    frag_h = max(1, int(h * spray_size))

    output = frame.copy()

    for _ in range(spray_count):
        # Seeded random position
        sx = rng.integers(0, max(1, w - frag_w))
        sy = rng.integers(0, max(1, h - frag_h))
        dx = rng.integers(0, max(1, w - frag_w))
        dy = rng.integers(0, max(1, h - frag_h))

        # Extract source fragment
        frag = source[sy : sy + frag_h, sx : sx + frag_w, :3].astype(np.float32)
        target = output[dy : dy + frag_h, dx : dx + frag_w, :3].astype(np.float32)

        # Ensure shapes match (edge cases)
        min_h = min(frag.shape[0], target.shape[0])
        min_w = min(frag.shape[1], target.shape[1])
        frag = frag[:min_h, :min_w]
        target = target[:min_h, :min_w]

        # Blend
        blended = (target * (1.0 - opacity) + frag * opacity).astype(np.uint8)
        output[dy : dy + min_h, dx : dx + min_w, :3] = blended

    return output


def apply(
    frame: np.ndarray,
    params: dict,
    state_in: dict | None = None,
    *,
    frame_index: int,
    seed: int,
    resolution: tuple[int, int],
) -> tuple[np.ndarray, dict | None]:
    """Apply subliminal effect."""
    mode = str(params.get("mode", "flash_insert"))

    # Get source frame
    source, state_out = _get_source_frame(params, resolution, frame_index, state_in)
    if source is None:
        return frame.copy(), state_out

    # Ensure source matches frame dimensions
    if source.shape[:2] != frame.shape[:2]:
        import cv2

        source = cv2.resize(
            source,
            (frame.shape[1], frame.shape[0]),
            interpolation=cv2.INTER_LANCZOS4,
        )

    # Seeded RNG for determinism
    rng = np.random.default_rng(seed + frame_index)

    if mode == "flash_insert":
        output = _flash_insert(frame, source, params, rng)
    elif mode == "channel_embed":
        output = _channel_embed(frame, source, params)
    elif mode == "second_source":
        output = _second_source(frame, source, params, rng)
    else:
        output = frame.copy()

    return output, state_out


def cleanup(state: dict | None):
    """Clean up resources held in state (readers)."""
    if state is None:
        return
    if "image_reader" in state:
        try:
            state["image_reader"].close()
        except Exception:
            pass
    if "video_reader" in state:
        try:
            state["video_reader"].close()
        except Exception:
            pass
