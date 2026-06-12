"""Multi-track compositor — blends multiple layers into a single output frame.

Each layer has an effect chain applied individually, then layers are composited
bottom-to-top using blend modes and per-layer opacity.

CRITICAL: All blend math uses float32 to avoid uint8 overflow/wrap.
"""

import logging

import cv2
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

# P2.2c (slice 3c, Decision D4): the terminal compositing effect id. Compositing
# (opacity + blend mode) is read off the LAST entry of a layer's effect chain when
# that entry is a `composite` effect — not from layer-level fields. The 9 modes
# above ARE the shipped blend modes; a `mode` outside this dict falls back to
# normal (the BLEND_MODES.get default below).
COMPOSITE_EFFECT_ID = "composite"
_COMPOSITE_OPACITY_DEFAULT = 1.0
_COMPOSITE_MODE_DEFAULT = "normal"


def _clamp_opacity(raw: object) -> float:
    """Clamp an opacity value to finite [0,1], defaulting to 1.0 on bad input."""
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return _COMPOSITE_OPACITY_DEFAULT
    if not (value == value) or value in (float("inf"), float("-inf")):
        return _COMPOSITE_OPACITY_DEFAULT
    return max(0.0, min(1.0, value))


def _resolve_compositing(layer_info: dict) -> tuple[float, str]:
    """Resolve (opacity, blend_mode) for a layer.

    Decision D3/D4: VIDEO-CLIP track compositing lives in the TERMINAL `composite`
    effect at the end of the layer's chain (params `{opacity, mode}`), NOT in the
    removed v2-era `Track.opacity`/`Track.blendMode`. When a terminal composite is
    present, its params are authoritative.

    When NO terminal composite is present we fall back to the layer's top-level
    `opacity`/`blend_mode`. This is NOT the removed Track-level path — it is the
    transport for the layer types that legitimately carry their own compositing and
    never had a terminal composite: sampler/instrument voices (instrument opacity +
    blend) and the no-clip fallback. The render handler's _is_v2_compositing_shape
    guard rejects the genuine v2 video-track-clip shape upstream, so reaching this
    fallback means the fields are legitimate.

    Every value crosses a trust boundary (IPC payload): opacity is clamped to finite
    [0,1] and mode is validated against BLEND_MODES (unknown → normal).
    """
    chain = layer_info.get("chain") or []
    terminal = chain[-1] if chain else None
    if isinstance(terminal, dict) and terminal.get("effect_id") == COMPOSITE_EFFECT_ID and terminal.get("enabled", True) is not False:
        # red-team RT-2: a forged IPC params=[..] / params=42 is truthy but has
        # no .get — coerce to {} unless it is genuinely a dict.
        raw_params = terminal.get("params")
        params = raw_params if isinstance(raw_params, dict) else {}
        opacity = _clamp_opacity(params.get("opacity", _COMPOSITE_OPACITY_DEFAULT))
        raw_mode = params.get("mode", _COMPOSITE_MODE_DEFAULT)
    else:
        opacity = _clamp_opacity(layer_info.get("opacity", _COMPOSITE_OPACITY_DEFAULT))
        raw_mode = layer_info.get("blend_mode", _COMPOSITE_MODE_DEFAULT)

    mode = (
        raw_mode
        if (isinstance(raw_mode, str) and raw_mode in BLEND_MODES)
        else _COMPOSITE_MODE_DEFAULT
    )

    return opacity, mode


def _clip_opacity(layer_info: dict) -> float:
    """Per-clip opacity multiplier (NOT track compositing).

    `clip_opacity` is a per-clip property distinct from track compositing. Track
    opacity/mode come from the terminal composite (_resolve_compositing); clip
    opacity multiplies on top so a faded clip on a full-opacity track still fades.
    Trust boundary: clamped to finite [0,1], defaults to 1.0 (fully opaque).
    """
    raw = layer_info.get("clip_opacity", 1.0)
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return 1.0
    if not (value == value) or value in (float("inf"), float("-inf")):
        return 1.0
    return max(0.0, min(1.0, value))


def render_composite(
    layers: list[dict],
    resolution: tuple[int, int],
    project_seed: int = 0,
    layer_states: dict[str, dict] | None = None,
) -> np.ndarray | tuple[np.ndarray, dict[str, dict]]:
    """Composite multiple layers into a single output frame.

    Args:
        layers: List of layer dicts, ordered bottom-to-top:
            {
                "frame": np.ndarray (H, W, 4) uint8,
                "chain": list[dict],  # effect chain for apply_chain(); when its
                                      # LAST entry is a `composite` effect, that
                                      # entry's params {opacity, mode} drive this
                                      # layer's compositing (Decision D3/D4).
                "frame_index": int,
                "layer_id": str,  # OPTIONAL — required only when layer_states is passed
            }
            Opacity/blend mode are resolved from the terminal composite in `chain`
            (see _resolve_compositing). Layer-level "opacity"/"blend_mode" fields
            are v2-era and are NO LONGER read — they were removed in the v3 clean
            break. apply_chain strips the same terminal composite so the blend is
            applied exactly once.
        resolution: (width, height) of the output.
        project_seed: For deterministic effects.
        layer_states: Per-layer state dicts keyed by `layer_id`. When provided,
            each layer's effect chain receives `state_in=layer_states.get(layer_id)`
            and the updated state is captured into the returned dict. Stateful
            effects (datamosh, reaction_mosh, frame_drop, etc.) require this for
            correct preview output across consecutive frames. See zmq_server's
            `_get_composite_states` for the standard caching pattern.

    Returns:
        Composited RGBA frame as uint8 (H, W, 4) when `layer_states` is None
        (legacy 1-tuple return). When `layer_states` is provided, returns
        `(frame, new_layer_states)` so callers can write the updated states
        back into their cache.
    """
    width, height = resolution

    propagate_state = layer_states is not None
    new_states: dict[str, dict] = {}

    if not layers:
        empty = np.zeros((height, width, 4), dtype=np.uint8)
        return (empty, new_states) if propagate_state else empty

    # Start with transparent black canvas
    canvas = np.zeros((height, width, 4), dtype=np.float32)

    for idx, layer_info in enumerate(layers):
        frame = layer_info["frame"]
        chain = layer_info.get("chain", [])
        # P2.2c (Decision D3/D4): opacity + blend mode come from the terminal
        # composite at the END of `chain`, not from layer-level fields (removed in
        # the v3 clean break). apply_chain strips the same terminal entry so the
        # blend is applied exactly once. No terminal composite → compositing
        # defaults (opacity 1.0 / normal), never the removed layer-level fields.
        opacity, blend_mode = _resolve_compositing(layer_info)
        # Per-clip opacity (a distinct property, not track compositing) multiplies
        # on top so a faded clip on a full-opacity track still fades.
        opacity *= _clip_opacity(layer_info)
        frame_index = layer_info.get("frame_index", 0)
        # When layer_states is passed but the caller didn't tag a layer_id,
        # fall back to positional index. Position-based keys silently invalidate
        # state on any layer add/remove/reorder — that's acceptable safety.
        layer_id = str(layer_info.get("layer_id", f"_pos_{idx}"))

        # Apply per-layer effect chain (with optional state propagation)
        if chain:
            state_in = layer_states.get(layer_id) if propagate_state else None
            processed, state_out = apply_chain(
                frame, chain, project_seed, frame_index, resolution, state_in
            )
            if propagate_state:
                new_states[layer_id] = state_out
        else:
            processed = frame

        # Skip degenerate frames (zero-dimension)
        if processed.shape[0] == 0 or processed.shape[1] == 0:
            continue

        # Resize layer to match canvas if dimensions differ
        if processed.shape[:2] != (height, width):
            processed = cv2.resize(
                processed, (width, height), interpolation=cv2.INTER_LINEAR
            )

        # Convert to float32 for blend math
        layer_f = processed.astype(np.float32)

        # Get blend function
        blend_fn = BLEND_MODES.get(blend_mode, _blend_normal)

        # Composite
        canvas = blend_fn(canvas, layer_f, opacity)

    # Clip and convert back to uint8
    out = np.clip(canvas, 0, 255).astype(np.uint8)
    return (out, new_states) if propagate_state else out
