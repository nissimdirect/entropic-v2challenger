"""Multi-track compositor — blends multiple layers into a single output frame.

Each layer has an effect chain applied individually, then layers are composited
bottom-to-top using blend modes and per-layer opacity.

CRITICAL: All blend math uses float32 to avoid uint8 overflow/wrap.
"""

import logging

import numpy as np

from engine.pipeline import apply_chain

logger = logging.getLogger(__name__)


def _blend_normal(base: np.ndarray, layer: np.ndarray, opacity: float) -> np.ndarray:
    """Alpha-over composite with opacity."""
    return base * (1.0 - opacity) + layer * opacity


def _blend_add(base: np.ndarray, layer: np.ndarray, opacity: float) -> np.ndarray:
    blended = base + layer
    return base * (1.0 - opacity) + blended * opacity


def _blend_multiply(base: np.ndarray, layer: np.ndarray, opacity: float) -> np.ndarray:
    blended = (base * layer) / 255.0
    return base * (1.0 - opacity) + blended * opacity


def _blend_screen(base: np.ndarray, layer: np.ndarray, opacity: float) -> np.ndarray:
    blended = 255.0 - ((255.0 - base) * (255.0 - layer)) / 255.0
    return base * (1.0 - opacity) + blended * opacity


def _blend_overlay(base: np.ndarray, layer: np.ndarray, opacity: float) -> np.ndarray:
    # Conditional: multiply where base < 128, screen where base >= 128
    low = (2.0 * base * layer) / 255.0
    high = 255.0 - (2.0 * (255.0 - base) * (255.0 - layer)) / 255.0
    blended = np.where(base < 128.0, low, high)
    return base * (1.0 - opacity) + blended * opacity


def _blend_difference(
    base: np.ndarray, layer: np.ndarray, opacity: float
) -> np.ndarray:
    blended = np.abs(base - layer)
    return base * (1.0 - opacity) + blended * opacity


def _blend_exclusion(base: np.ndarray, layer: np.ndarray, opacity: float) -> np.ndarray:
    blended = base + layer - 2.0 * base * layer / 255.0
    return base * (1.0 - opacity) + blended * opacity


def _blend_darken(base: np.ndarray, layer: np.ndarray, opacity: float) -> np.ndarray:
    blended = np.minimum(base, layer)
    return base * (1.0 - opacity) + blended * opacity


def _blend_lighten(base: np.ndarray, layer: np.ndarray, opacity: float) -> np.ndarray:
    blended = np.maximum(base, layer)
    return base * (1.0 - opacity) + blended * opacity


BLEND_MODES = {
    "normal": _blend_normal,
    "add": _blend_add,
    "multiply": _blend_multiply,
    "screen": _blend_screen,
    "overlay": _blend_overlay,
    "difference": _blend_difference,
    "exclusion": _blend_exclusion,
    "darken": _blend_darken,
    "lighten": _blend_lighten,
}


def render_composite(
    layers: list[dict],
    resolution: tuple[int, int],
    project_seed: int = 0,
) -> np.ndarray:
    """Composite multiple layers into a single output frame.

    Args:
        layers: List of layer dicts, ordered bottom-to-top:
            {
                "frame": np.ndarray (H, W, 4) uint8,
                "chain": list[dict],  # effect chain for apply_chain()
                "opacity": float (0-1),
                "blend_mode": str,
                "frame_index": int,
            }
        resolution: (width, height) of the output.
        project_seed: For deterministic effects.

    Returns:
        Composited RGBA frame as uint8 (H, W, 4).
    """
    width, height = resolution

    if not layers:
        return np.zeros((height, width, 4), dtype=np.uint8)

    # Start with transparent black canvas
    canvas = np.zeros((height, width, 4), dtype=np.float32)

    for layer_info in layers:
        frame = layer_info["frame"]
        chain = layer_info.get("chain", [])
        opacity = float(layer_info.get("opacity", 1.0))
        blend_mode = layer_info.get("blend_mode", "normal")
        frame_index = layer_info.get("frame_index", 0)

        # Apply per-layer effect chain
        if chain:
            processed, _ = apply_chain(
                frame, chain, project_seed, frame_index, resolution
            )
        else:
            processed = frame

        # Convert to float32 for blend math
        layer_f = processed.astype(np.float32)

        # Get blend function
        blend_fn = BLEND_MODES.get(blend_mode, _blend_normal)

        # Composite
        canvas = blend_fn(canvas, layer_f, opacity)

    # Clip and convert back to uint8
    return np.clip(canvas, 0, 255).astype(np.uint8)
