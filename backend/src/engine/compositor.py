"""Multi-track compositor — blends multiple layers into a single output frame.

Each layer has an effect chain applied individually, then layers are composited
bottom-to-top using blend modes and per-layer opacity.

CRITICAL: All blend math uses float32 to avoid uint8 overflow/wrap.

MK.2 (SPEC GT-2, §7-2): per-pixel alpha is HONORED, not just carried. The blend
weight is `w = layer_alpha · scalar_opacity` PER PIXEL (straight, unpremultiplied
alpha). Output alpha is the standard straight-alpha over-composite. The legacy
scalar code path is preserved byte-for-byte for fully-opaque layers (the hot path);
only the partial-alpha case takes the per-pixel weighting branch. See
`tests/test_alpha_composite.py::test_fully_opaque_layers_byte_identical_to_legacy`
(THE golden no-regression gate).
"""

import logging

import cv2
import numpy as np

from engine.pipeline import apply_chain

logger = logging.getLogger(__name__)

# Preview backdrop (DESIGN-SPEC surface-0). The final composited RGBA canvas is
# flattened onto this opaque colour before MJPEG encode so keyed-out / transparent
# regions show the backdrop, not whatever RGB happened to ride under alpha=0.
SURFACE_0_BG: tuple[int, int, int] = (11, 11, 16)  # #0B0B10


# ---------------------------------------------------------------------------
# Blend modes.
#
# Each `_blend_*` function computes the per-pixel composite of `base` over which
# `layer` is painted, weighted by `w`. `w` is EITHER a Python/np scalar (the
# legacy fully-opaque fast path — `w == opacity`) OR a per-pixel weight array of
# shape (H, W, 1) broadcasting across channels (the MK.2 partial-alpha path,
# `w = layer_alpha · opacity`).
#
# The blend formula `base * (1 - w) + blended * w` is identical to the legacy
# `base * (1 - opacity) + blended * opacity` when `w` is the scalar `opacity`,
# which is what makes the golden byte-identity gate hold: for fully-opaque inputs
# render_composite calls these with the scalar `opacity` exactly as before.
#
# DO-NOT-TOUCH: the BLEND_MODES dict KEYS and the _resolve_compositing /
# _clamp_opacity SEMANTICS. The math INSIDE these functions is extended (scalar →
# scalar-or-array weight); the contract is unchanged.
# ---------------------------------------------------------------------------


def _blend_normal(base: np.ndarray, layer: np.ndarray, w) -> np.ndarray:
    """Alpha-over composite with weight."""
    return base * (1.0 - w) + layer * w


def _blend_add(base: np.ndarray, layer: np.ndarray, w) -> np.ndarray:
    blended = base + layer
    return base * (1.0 - w) + blended * w


def _blend_multiply(base: np.ndarray, layer: np.ndarray, w) -> np.ndarray:
    blended = (base * layer) / 255.0
    return base * (1.0 - w) + blended * w


def _blend_screen(base: np.ndarray, layer: np.ndarray, w) -> np.ndarray:
    blended = 255.0 - ((255.0 - base) * (255.0 - layer)) / 255.0
    return base * (1.0 - w) + blended * w


def _blend_overlay(base: np.ndarray, layer: np.ndarray, w) -> np.ndarray:
    # Conditional: multiply where base < 128, screen where base >= 128
    low = (2.0 * base * layer) / 255.0
    high = 255.0 - (2.0 * (255.0 - base) * (255.0 - layer)) / 255.0
    blended = np.where(base < 128.0, low, high)
    return base * (1.0 - w) + blended * w


def _blend_difference(base: np.ndarray, layer: np.ndarray, w) -> np.ndarray:
    blended = np.abs(base - layer)
    return base * (1.0 - w) + blended * w


def _blend_exclusion(base: np.ndarray, layer: np.ndarray, w) -> np.ndarray:
    blended = base + layer - 2.0 * base * layer / 255.0
    return base * (1.0 - w) + blended * w


def _blend_darken(base: np.ndarray, layer: np.ndarray, w) -> np.ndarray:
    blended = np.minimum(base, layer)
    return base * (1.0 - w) + blended * w


def _blend_lighten(base: np.ndarray, layer: np.ndarray, w) -> np.ndarray:
    blended = np.maximum(base, layer)
    return base * (1.0 - w) + blended * w


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
    if (
        isinstance(terminal, dict)
        and terminal.get("effect_id") == COMPOSITE_EFFECT_ID
        and terminal.get("enabled", True) is not False
    ):
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


def _sanitize_alpha(alpha: np.ndarray) -> np.ndarray:
    """Sanitize an alpha plane for use as a blend weight.

    MK.2 trust boundary (SPEC §7-2): NaN/Inf in an alpha plane is treated as
    OPAQUE (255), NEVER propagated into the weight. An effect that emits a NaN
    alpha (a divide-by-zero in a key kernel, a corrupt decode) must not poison the
    whole composite — the safe failure is "fully visible", not "transparent hole"
    or "NaN smear". Returns a float32 plane in [0,255].
    """
    a = alpha.astype(np.float32)
    # NaN and ±Inf → 255 (opaque). np.isfinite is False for both.
    a = np.where(np.isfinite(a), a, 255.0)
    return np.clip(a, 0.0, 255.0)


def _composite_layer(
    canvas: np.ndarray,
    layer_f: np.ndarray,
    opacity: float,
    blend_fn,
    is_opaque: bool | None = None,
) -> np.ndarray:
    """Composite one float32 RGBA layer onto the float32 RGBA canvas.

    Scalar fast-path (legacy, byte-identical): when the layer is fully opaque
    (`processed[:, :, 3].min() == 255`), run the legacy whole-RGBA blend with the
    SCALAR opacity. This keeps the hot path allocation-free (no alpha extract, no
    per-pixel weight array) and provably byte-identical to pre-MK.2 main.

    `is_opaque` is the precomputed opacity verdict. render_composite computes it
    ONCE on the uint8 `processed` alpha (cheaper than a float32 reduction) and
    passes it in, so the fast path adds no per-layer float-domain scan. When None
    (direct callers / tests) it is computed here from the float alpha.

    Per-pixel path (MK.2): when the layer has partial alpha, weight the RGB blend
    by `w = (layer_alpha / 255) · opacity` per pixel (straight alpha, §7-2) and set
    the output alpha by straight-alpha over-composite
    `a_out = a_layer + a_canvas · (1 - a_layer)`.
    """
    layer_alpha = layer_f[:, :, 3]
    if is_opaque is None:
        is_opaque = float(layer_alpha.min()) == 255.0
    # Fast path: fully-opaque layer → legacy code path, scalar weight, byte-exact.
    if is_opaque:
        return blend_fn(canvas, layer_f, opacity)

    # Partial-alpha path. Sanitize the layer alpha (NaN/Inf → opaque) BEFORE it
    # becomes a weight, then normalise to [0,1] and fold in scalar opacity.
    a_layer = _sanitize_alpha(layer_alpha) / 255.0  # (H, W)
    w = (a_layer * opacity)[:, :, np.newaxis]  # (H, W, 1) broadcasts over channels

    # RGB: per-pixel weighted blend. blend_fn operates on full RGBA, but we only
    # keep its RGB result here; the alpha channel of the blend output is discarded
    # and replaced by the explicit over-composite below.
    blended = blend_fn(canvas, layer_f, w)
    out = canvas.copy()
    out[:, :, :3] = blended[:, :, :3]

    # Output alpha = straight-alpha over-composite. a_canvas already in [0,255].
    a_canvas = canvas[:, :, 3] / 255.0
    a_out = a_layer + a_canvas * (1.0 - a_layer)  # (H, W), [0,1]
    out[:, :, 3] = a_out * 255.0
    return out


def flatten_rgba(
    frame: np.ndarray, bg: tuple[int, int, int] = SURFACE_0_BG
) -> np.ndarray:
    """Flatten an RGBA frame onto an opaque background (straight-alpha over).

    Used at the PREVIEW boundary (zmq render reply) before `encode_mjpeg`, which
    would otherwise drop alpha by truncation and leak the RGB that rode under
    alpha=0. Flattening onto surface-0 (#0B0B10) makes keyed-out / transparent
    regions show the backdrop — this is what makes `fx.chroma_key`/`fx.luma_key`
    visible for the first time (SPEC GT-3).

    Returns an (H, W, 4) uint8 frame whose alpha is uniformly 255. Export does NOT
    call this (MK.10 owns the writer's alpha-aware slice); flatten lives only at the
    preview encode boundary so export is never double-flattened.
    """
    if frame.ndim != 3 or frame.shape[2] != 4:
        # Not RGBA (already RGB / unexpected) — return unchanged; encode handles it.
        return frame
    f = frame.astype(np.float32)
    a = _sanitize_alpha(f[:, :, 3]) / 255.0  # (H, W), NaN/Inf-safe
    a = a[:, :, np.newaxis]  # (H, W, 1)
    bg_arr = np.array(bg, dtype=np.float32).reshape(1, 1, 3)
    rgb = f[:, :, :3] * a + bg_arr * (1.0 - a)
    out = np.empty_like(f)
    out[:, :, :3] = rgb
    out[:, :, 3] = 255.0
    return np.clip(out, 0, 255).astype(np.uint8)


def render_composite(
    layers: list[dict],
    resolution: tuple[int, int],
    project_seed: int = 0,
    layer_states: dict[str, dict] | None = None,
    master_chain: list[dict] | None = None,
    master_frame_index: int = 0,
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
        master_chain: M.1 (Master-Out Bus PRD) — the Master track's effect chain,
            run via `apply_chain` on the FINAL composited frame, AFTER every
            layer has been blended (post-composite, pre-return). This is the
            ONE seam shared by every caller of `render_composite` (preview's
            `_handle_render_composite` and export's `_composite_export_frame`),
            so preview==export parity is structural — both paths call the SAME
            function with the SAME semantics, never two hand-maintained copies.
            ABSENT (None, the default) → skipped entirely, byte-identical to
            pre-M.1. This is what every RECURSIVE sub-composite call from
            `composite_tree.expand_group_layer` gets (it never passes this arg)
            — a branch sub-frame is NOT the final output, so it must never see
            the master chain; only the TOP-LEVEL callers pass it.
            An EMPTY list ([]) is what the top-level preview/export callers pass
            for a project whose Master track has no effects yet — `apply_chain`
            with an empty chain returns the input frame UNCHANGED (same object,
            no copy), so this is a true no-op: the #1 regression guard from the
            PRD ("empty master chain = TRUE no-op, byte-identical render").
            Master effects see ONLY the composited RGBA frame — no per-track/
            per-clip state exists post-composite, so `state_in` is always None
            here (master-chain state is NOT threaded across frames in M.1; a
            stateful master effect resets every frame — persisting it would mean
            plumbing a new state cache through every call site's caching layer,
            deferred to a follow-up packet, out of M.1's schema+render scope).
            Finite-guard: deliberately NOT sanitized here. Every caller of
            `render_composite` already gates its return value for NaN/Inf (SG-3
            clause-2) — preview's `_apply_output_gate` (silent substitute) and
            export's `detect_nan_in_frame` checks (loud fail, "never a silent
            substitution inside a deterministic export"). Sanitizing here too
            would silently swallow a master-effect NaN before export's
            fail-loud gate ever saw it, breaking that existing contract. A
            master effect that blows up is caught by the SAME gate that already
            catches a misbehaving per-track effect — no new, redundant policy.
        master_frame_index: Frame index passed to the master chain's
            `apply_chain` call (for deterministic/seeded effects). Callers pass
            their own per-request frame anchor (e.g. preview's `anchor_frame`,
            export's per-output-frame `frame_index`).

    Returns:
        Composited RGBA frame as uint8 (H, W, 4) when `layer_states` is None
        (legacy 1-tuple return). When `layer_states` is provided, returns
        `(frame, new_layer_states)` so callers can write the updated states
        back into their cache.

        MK.2: per-pixel alpha is honored in the blend (SPEC GT-2) and the output
        alpha is the straight-alpha over-composite of all layers. The result is
        STILL an RGBA frame with meaningful alpha; the preview boundary
        (zmq_server) flattens it onto surface-0 via `flatten_rgba` before encode.
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

        # Apply per-layer effect chain (with optional state propagation).
        # MK.3: an optional per-layer `chain_mask` (resolved by the caller via
        # masking.routing.apply_masks_to_chain) is forwarded into apply_chain so
        # the whole-chain wet/dry matte is honored in composite preview/export —
        # parity with the single-clip render_frame path. Absent → None →
        # byte-identical legacy chain application (this is plumbing into the
        # chain, NOT the blend math; the per-pixel composite below is untouched).
        if chain:
            state_in = layer_states.get(layer_id) if propagate_state else None
            processed, state_out = apply_chain(
                frame,
                chain,
                project_seed,
                frame_index,
                resolution,
                state_in,
                chain_mask=layer_info.get("chain_mask"),
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

        # Opacity verdict for the fast path — computed ONCE on the uint8 alpha
        # (the spec's `processed[:, :, 3].min() == 255`), which is ~2x cheaper than
        # a float32 reduction. Only an integer-typed, all-255 alpha is "opaque";
        # any float frame (a NaN/Inf alpha can ride in float) takes the sanitizing
        # per-pixel path so NaN/Inf is treated as opaque per-pixel, never as a
        # whole-layer fast-path shortcut.
        alpha_plane = processed[:, :, 3]
        is_opaque = (
            np.issubdtype(alpha_plane.dtype, np.integer)
            and int(alpha_plane.min()) == 255
        )

        # Convert to float32 for blend math
        layer_f = processed.astype(np.float32)

        # Get blend function
        blend_fn = BLEND_MODES.get(blend_mode, _blend_normal)

        # Composite (scalar fast-path for opaque layers; per-pixel alpha otherwise)
        canvas = _composite_layer(canvas, layer_f, opacity, blend_fn, is_opaque)

    # Clip and convert back to uint8
    out = np.clip(canvas, 0, 255).astype(np.uint8)

    # M.1 (Master-Out Bus PRD) — the ONE post-composite seam, shared by every
    # top-level caller (preview + export). None (default, and what every
    # recursive composite_tree sub-frame call gets) → skipped, byte-identical.
    # An explicit [] (the top-level no-master-effects case) → apply_chain is a
    # true no-op (returns `out` unchanged, same object). See the `master_chain`
    # docstring above for why no finite-guard/state-cache is added here.
    if master_chain is not None:
        out, _master_state = apply_chain(
            out, master_chain, project_seed, master_frame_index, resolution, None
        )

    return (out, new_states) if propagate_state else out
