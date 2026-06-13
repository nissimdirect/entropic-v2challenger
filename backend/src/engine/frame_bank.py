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
  - flow    → DEFERRED (needs optical flow / B7). Treated as `blend` with a TODO;
              never raises (a `flow` bank renders as `blend`).

The decode path is INJECTED (`decode(clip_id, frame_index) -> ndarray`) so this
module is footage-source-agnostic + unit-testable with a fake reader. The byte-
budget cache is the AUTHORITY on resident RAM — see decoded_frame_cache.py.

Caps (position clamp, byteBudget clamp, slot-count / frameIndex validation) live
in security.validate_frame_bank and are enforced at the IPC/render boundary
BEFORE this module decodes anything (enforce-before-decode).
"""

from __future__ import annotations

from typing import Callable

import numpy as np

from engine.decoded_frame_cache import DecodedFrameCache


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
    `nearest` one slot frame is decoded; for `blend` two adjacent slot frames are
    decoded + interpolated. `flow` is treated as `blend` (DEFERRED — B7).

    The cache enforces resident_bytes <= byteBudget across every decode, so even
    a 256-slot bank under a small budget never holds all frames resident.
    """
    slots = inst.get("slots") or []
    n = len(slots)
    if n == 0:
        raise ValueError("frameBank has no slots")

    interp = inst.get("interp", "blend")
    # flow is DEFERRED (needs B7 optical flow) — render as blend, never raise.
    if interp == "flow":
        interp = "blend"

    lo, hi, frac = resolve_position_indices(position, n, interp)

    slot_lo = slots[lo]
    frame_lo = cache.get(str(slot_lo["clipId"]), int(slot_lo["frameIndex"]), decode)

    if interp == "nearest" or lo == hi or frac == 0.0:
        # Single frame — return a COPY (the cache owns the original; callers may
        # composite/mutate). nearest, or blend that landed exactly on a slot.
        return frame_lo.copy()

    slot_hi = slots[hi]
    frame_hi = cache.get(str(slot_hi["clipId"]), int(slot_hi["frameIndex"]), decode)
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
