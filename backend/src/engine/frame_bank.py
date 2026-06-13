"""B6.1 — Frame-Bank (wavetable) instrument: position-scan render (backend).

A Frame-Bank is the video analog of a wavetable oscillator: an indexed BANK of
frames that a modulatable POSITION (0..1) scans + interpolates through. An LFO
over `position` = a "wavetable sweep" through footage.

This module is the BACKEND render (export path, deterministic). Given a resolved
Frame-Bank instrument + a `position`, it produces ONE resolved frame (the voice
layer the compositor blends), decoding the needed slot frame(s) through the
byte-budget DecodedFrameCache (the OOM guard).

Position math (the wavetable index):
    idx  = position * (len(slots) - 1)
    lo   = floor(idx)
    frac = idx - lo
  - nearest → slot[round(idx)]'s frame
  - blend   → linear interpolate slot[lo] and slot[lo+1] by frac, per-pixel uint8:
                out = (1 - frac) * A + frac * B
  - flow    → CPU optical-flow MORPH (B7-partial): warp slot[lo] toward slot[hi]
              (and vice-versa) by the Farneback flow field, then cross-dissolve —
              a true morph, NOT a crossfade. The flow field is computed at a
              DOWNSCALED resolution (FLOW_MAX_DIM cap) then upscaled back, so the
              flow-field memory is bounded regardless of slot resolution (a 4K
              flow field would be ~256 MB/field otherwise). Deterministic (fixed
              Farneback params). Boundary (frac 0/1) → exact slot, no morph.
              The Metal/GPU path (SG-1) stays DEFERRED — this is the CPU fallback.

The decode path is INJECTED (`decode(clip_id, frame_index) -> ndarray`) so this
module is footage-source-agnostic + unit-testable with a fake reader. The byte-
budget cache is the AUTHORITY on resident RAM — see decoded_frame_cache.py.

Caps (position clamp, byteBudget clamp, slot-count / frameIndex validation) live
in security.validate_frame_bank and are enforced at the IPC/render boundary
BEFORE this module decodes anything (enforce-before-decode).
"""

from __future__ import annotations

from typing import Callable

import cv2
import numpy as np

from engine.decoded_frame_cache import DecodedFrameCache

# The flow field is computed at a DOWNSCALED resolution: the larger frame
# dimension is capped at FLOW_MAX_DIM before Farneback runs, then the flow
# vectors are upscaled (and rescaled by the resize ratio) back to full res for
# the remap. A flow field is HxWx2 float32 — a 4K field is ~256 MB EACH, and we
# compute two (forward + backward) plus the warps, so an uncapped 4K morph would
# spike ~1 GB. Flow fields are smooth, so downscaled-flow + upscale is the
# standard cheap approximation. This bounds flow-field RAM + CPU regardless of
# slot resolution.
FLOW_MAX_DIM = 720

# Fixed Farneback parameters — hardcoded so the morph is DETERMINISTIC (same
# input → byte-identical output, no randomness / seed drift).
_FARNEBACK_PARAMS = dict(
    pyr_scale=0.5,
    levels=3,
    winsize=15,
    iterations=3,
    poly_n=5,
    poly_sigma=1.2,
    flags=0,
)


def resolve_position_indices(
    position: float, n_slots: int, interp: str
) -> tuple[int, int, float]:
    """Resolve a position (0..1) into (lo, hi, frac) slot indices.

    `lo`/`hi` index into the slots list; `frac` in [0,1] is the blend weight
    toward `hi`. For `nearest`, lo == hi == round(idx) and frac == 0.

    Assumes `position` is already clamped to [0,1] and `n_slots >= 1` (the caps
    layer guarantees both). Defensive clamps stay so a direct unit-test call with
    raw values can't index out of range.
    """
    if n_slots <= 1:
        return 0, 0, 0.0
    pos = 0.0 if position < 0.0 else (1.0 if position > 1.0 else float(position))
    idx = pos * (n_slots - 1)
    if interp == "nearest":
        r = int(round(idx))
        r = max(0, min(n_slots - 1, r))
        return r, r, 0.0
    lo = int(idx)  # floor for non-negative idx
    lo = max(0, min(n_slots - 1, lo))
    hi = min(lo + 1, n_slots - 1)
    frac = idx - lo
    if frac < 0.0:
        frac = 0.0
    elif frac > 1.0:
        frac = 1.0
    return lo, hi, frac


def _blend_frames(a: np.ndarray, b: np.ndarray, frac: float) -> np.ndarray:
    """Per-pixel linear interpolation of two uint8 frames: (1-frac)*a + frac*b.

    Rounds to nearest uint8 (frac=0.5 of 0 and 255 → 127.5 → 128). If the two
    frames differ in shape (e.g. one is a downscale-proxy), `b` is nearest-
    resized to `a` so the blend is well-defined; the proxy fallback already
    guarantees no OOM, this just keeps the math total.
    """
    if a.shape != b.shape:
        from engine.decoded_frame_cache import _nn_resize

        b = _nn_resize(b, a.shape[0], a.shape[1])
    out = a.astype(np.float32) * (1.0 - frac) + b.astype(np.float32) * frac
    return np.clip(np.round(out), 0, 255).astype(np.uint8)


def _gray(frame: np.ndarray) -> np.ndarray:
    """RGB(A) uint8 frame → single-channel uint8 grayscale for Farneback."""
    if frame.ndim == 2:
        return frame
    c = frame.shape[2]
    if c >= 3:
        # Farneback wants intensity; use the RGB channels (ignore alpha).
        return cv2.cvtColor(np.ascontiguousarray(frame[:, :, :3]), cv2.COLOR_RGB2GRAY)
    return frame[:, :, 0]


def _downscaled_flow(
    src_gray: np.ndarray, dst_gray: np.ndarray, max_dim: int
) -> np.ndarray:
    """Compute Farneback flow src→dst at a downscaled res, upscale to full res.

    The flow is computed on grayscale frames resized so the larger dimension is
    <= `max_dim` (the memory/CPU guard — see FLOW_MAX_DIM). The resulting HsxWsx2
    field is then resized back to the full (H, W) and its vectors scaled by the
    inverse resize ratio (a vector measured in small-pixels must be expressed in
    full-pixels). Returns a full-res HxWx2 float32 flow field.
    """
    h, w = src_gray.shape[:2]
    larger = max(h, w)
    if larger > max_dim:
        scale = max_dim / float(larger)
        sw = max(1, int(round(w * scale)))
        sh = max(1, int(round(h * scale)))
        small_src = cv2.resize(src_gray, (sw, sh), interpolation=cv2.INTER_AREA)
        small_dst = cv2.resize(dst_gray, (sw, sh), interpolation=cv2.INTER_AREA)
    else:
        sw, sh = w, h
        small_src, small_dst = src_gray, dst_gray

    flow_small = cv2.calcOpticalFlowFarneback(
        small_src, small_dst, None, **_FARNEBACK_PARAMS
    )
    # Stash the computed flow-field shape so the memory-bound test can assert it
    # was computed downscaled regardless of input frame size.
    _downscaled_flow.last_flow_shape = flow_small.shape  # type: ignore[attr-defined]

    if (sw, sh) == (w, h):
        return flow_small
    # Upscale the field to full res and rescale the vector magnitudes: a flow
    # vector measured on the small grid spans (w/sw) full-pixels horizontally and
    # (h/sh) vertically.
    flow_full = cv2.resize(flow_small, (w, h), interpolation=cv2.INTER_LINEAR)
    flow_full[:, :, 0] *= w / float(sw)
    flow_full[:, :, 1] *= h / float(sh)
    return flow_full


def _warp(frame: np.ndarray, flow: np.ndarray, t: float) -> np.ndarray:
    """Warp `frame` along `t * flow` via cv2.remap (backward map: out(p)=in(p+t*flow))."""
    h, w = frame.shape[:2]
    grid_x, grid_y = np.meshgrid(
        np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32)
    )
    map_x = grid_x + t * flow[:, :, 0]
    map_y = grid_y + t * flow[:, :, 1]
    return cv2.remap(
        frame,
        map_x,
        map_y,
        interpolation=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_REPLICATE,
    )


def _flow_morph(
    a: np.ndarray, b: np.ndarray, frac: float, max_dim: int = FLOW_MAX_DIM
) -> np.ndarray:
    """Optical-flow MORPH of two uint8 frames by `frac` ∈ (0,1).

    Warps A toward B by `frac` along the forward flow, warps B toward A by
    `(1-frac)` along the backward flow, then cross-dissolves the two warped
    frames: out = (1-frac)*A' + frac*B'. This MORPHS a moving feature toward its
    intermediate position (a true warp), unlike `_blend_frames` which double-
    exposes it. The flow is computed downscaled (FLOW_MAX_DIM) for memory/CPU.

    Caller guarantees a.shape == b.shape and 0 < frac < 1 (boundary/regression
    paths fall back to blend/exact-slot). Deterministic (fixed Farneback params).
    """
    ga = _gray(a)
    gb = _gray(b)
    flow_ab = _downscaled_flow(ga, gb, max_dim)  # A → B
    flow_ba = _downscaled_flow(gb, ga, max_dim)  # B → A
    a_warped = _warp(a, flow_ab, frac)  # A moved frac of the way to B
    b_warped = _warp(b, flow_ba, 1.0 - frac)  # B moved (1-frac) of the way to A
    out = (
        a_warped.astype(np.float32) * (1.0 - frac) + b_warped.astype(np.float32) * frac
    )
    return np.clip(np.round(out), 0, 255).astype(np.uint8)


def resolve_frame_bank_frame(
    inst: dict,
    position: float,
    cache: DecodedFrameCache,
    decode: Callable[[str, int], np.ndarray],
) -> np.ndarray:
    """Resolve a Frame-Bank instrument + position into ONE decoded frame.

    `inst` is the resolved frameBank dict (post security.validate_frame_bank):
      { type:'frameBank', slots:[{clipId, frameIndex}, ...], position, interp,
        byteBudget, timeAxis? }
    `position` is the modulated 0..1 scan position (overrides inst['position']
    when passed; callers thread the per-frame modulated value here).
    `cache` is the byte-budget LRU (the OOM guard); `decode(clip_id, frame_index)`
    yields the raw decoded ndarray for one slot frame.

    Returns the resolved frame (a COPY safe for the caller to composite). For
    `nearest` one slot frame is decoded; for `blend`/`flow` two adjacent slot
    frames are decoded then interpolated (`blend` = linear) or optical-flow
    morphed (`flow` = CPU Farneback warp, B7-partial; Metal/GPU deferred).

    The cache enforces resident_bytes <= byteBudget across every decode, so even
    a 256-slot bank under a small budget never holds all frames resident.
    """
    slots = inst.get("slots") or []
    n = len(slots)
    if n == 0:
        raise ValueError("frameBank has no slots")

    interp = inst.get("interp", "blend")

    lo, hi, frac = resolve_position_indices(position, n, interp)

    slot_lo = slots[lo]
    frame_lo = cache.get(str(slot_lo["clipId"]), int(slot_lo["frameIndex"]), decode)

    if interp == "nearest" or lo == hi or frac == 0.0:
        # Single frame — return a COPY (the cache owns the original; callers may
        # composite/mutate). nearest, or blend/flow that landed exactly on a slot
        # (frac 0/1 → exact slot, no morph).
        return frame_lo.copy()

    slot_hi = slots[hi]
    frame_hi = cache.get(str(slot_hi["clipId"]), int(slot_hi["frameIndex"]), decode)

    if interp == "flow" and frame_lo.shape == frame_hi.shape:
        # CPU optical-flow MORPH (B7-partial). Falls back to blend if the two
        # frames differ in shape (e.g. one is a downscale-proxy) — flow needs a
        # shared pixel grid. Metal/GPU path (SG-1) stays DEFERRED.
        return _flow_morph(frame_lo, frame_hi, frac)
    return _blend_frames(frame_lo, frame_hi, frac)


def resolve_frame_bank_layer(
    inst: dict,
    position: float,
    cache: DecodedFrameCache,
    decode: Callable[[str, int], np.ndarray],
    *,
    frame_index: int,
    voice_id: str,
    opacity: float = 1.0,
    blend_mode: str = "normal",
    chain: list | None = None,
) -> dict:
    """Resolve a Frame-Bank into the voice-layer dict the compositor consumes.

    Mirrors the voice-layer shape `_composite_export_frame` builds for samplers
    (`frame` / `chain` / `frame_index` / `voice_id` / `layer_id` / `opacity` /
    `blend_mode`) so a frameBank composites through the SAME render_composite path
    as every other voice — preview == export, no separate compositor.
    """
    frame = resolve_frame_bank_frame(inst, position, cache, decode)
    op = opacity
    if not isinstance(op, (int, float)) or op != op:  # NaN / non-numeric guard
        op = 0.0
    op = max(0.0, min(1.0, float(op)))
    return {
        "frame": frame,
        "chain": chain or [],
        "frame_index": frame_index,
        "voice_id": voice_id,
        "layer_id": f"framebank:{voice_id}",
        "opacity": op,
        "blend_mode": blend_mode,
    }
