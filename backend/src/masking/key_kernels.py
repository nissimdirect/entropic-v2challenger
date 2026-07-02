"""Shared key kernels (MK.8 · SPEC §6, §13-5).

Single source of truth for chroma and luma keying. Both the shipped effects
(``effects/fx/chroma_key.py`` / ``effects/fx/luma_key.py``) AND the procedural
matte evaluators registered in ``masking/stack.py`` call into these functions —
no parallel math anywhere (GT-3).

Two public surfaces per key type:

  * ``chroma_alpha(rgb, hue, tolerance, softness, spill) -> (alpha_f01, rgb_out)``
    The kernel. Returns a float [0,1] alpha matte where 1.0 = keep (opaque) and
    0.0 = keyed-out (transparent), PLUS the (optionally spill-suppressed) RGB.
    The matte is the COMPLEMENT of the keyed region: alpha = 1 − key_mask.

  * ``luma_alpha(rgb, threshold, mode, softness) -> alpha_f01``
    Same convention for luminance keying.

Back-compat golden (THE non-negotiable, SPEC MK.8): with ``spill=0`` the chroma
kernel reproduces the pre-refactor ``fx.chroma_key`` alpha BYTE-FOR-BYTE on a
green-screen fixture. The legacy inline math is faithfully reproduced here:

    h_center = hue / 2
    h_low/high = (h_center ∓ tolerance/2) mod 180
    hue_mask   = in-range (handles wraparound via the < branch)
    sat_mask   = S > 30
    key_mask   = (hue_mask & sat_mask) → float32
    softness>0 → gaussian blur, ksize = int(softness*2)|1
    alpha      = (1 − key_mask) * 255 → uint8 (at the effect boundary)

Spill suppression (NEW, default 0 = legacy): for pixels whose hue is within
``tolerance/2 · (1 + spill)`` of the key hue, desaturate the RGB toward its own
luma in proportion to ``spill`` and hue-proximity. This removes the green/blue
fringe that survives the alpha key. At ``spill=0`` it is an exact no-op
(``rgb_out is rgb`` — the same array object), which is what keeps the golden
byte-equal.

Numeric trust boundary (SPEC §13, learning #74): every scalar param is passed
through ``_finite`` which maps NaN/Inf → the supplied fallback, then clamped to
the param's legal range. Kernels NEVER raise on bad numerics.
"""

from __future__ import annotations

import math

import cv2
import numpy as np

# --------------------------------------------------------------------------- #
#  Param ranges (mirror the shipped effects' PARAMS — DO-NOT-TOUCH ranges)
# --------------------------------------------------------------------------- #

HUE_MIN, HUE_MAX = 0.0, 360.0
TOLERANCE_MIN, TOLERANCE_MAX = 1.0, 180.0
SOFTNESS_MIN, SOFTNESS_MAX = 0.0, 50.0
SPILL_MIN, SPILL_MAX = 0.0, 1.0
THRESHOLD_MIN, THRESHOLD_MAX = 0.0, 1.0

# Saturation floor below which a pixel is never considered "the key colour".
# Lifted verbatim from the legacy effect (``s > 30``) so the golden holds.
_SAT_FLOOR = 30.0


# --------------------------------------------------------------------------- #
#  Numeric trust boundary helpers
# --------------------------------------------------------------------------- #


def _finite(value: object, fallback: float) -> float:
    """Coerce *value* to a finite float, falling back on NaN/Inf/garbage.

    Never raises. This is the single clamp-guard entry every key param crosses
    (IPC / lane payload / project load all route through here).
    """
    try:
        f = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return float(fallback)
    if not math.isfinite(f):
        return float(fallback)
    return f


def _clamp(value: float, lo: float, hi: float) -> float:
    return lo if value < lo else hi if value > hi else value


def sanitize_chroma_params(
    hue: object,
    tolerance: object,
    softness: object,
    spill: object = 0.0,
) -> tuple[float, float, float, float]:
    """Finite-guard + clamp the four chroma params. NaN/Inf → defaults.

    hue wraps modulo 360 (NOT clamped — 350 and −10 are both valid keys).
    """
    h = _finite(hue, 120.0) % 360.0
    tol = _clamp(_finite(tolerance, 30.0), TOLERANCE_MIN, TOLERANCE_MAX)
    soft = _clamp(_finite(softness, 10.0), SOFTNESS_MIN, SOFTNESS_MAX)
    sp = _clamp(_finite(spill, 0.0), SPILL_MIN, SPILL_MAX)
    return h, tol, soft, sp


def sanitize_luma_params(
    threshold: object,
    mode: object,
    softness: object,
) -> tuple[float, str, float]:
    """Finite-guard + clamp the luma params. NaN/Inf → defaults."""
    thr = _clamp(_finite(threshold, 0.3), THRESHOLD_MIN, THRESHOLD_MAX)
    m = str(mode) if mode in ("dark", "bright") else "dark"
    soft = _clamp(_finite(softness, 10.0), SOFTNESS_MIN, SOFTNESS_MAX)
    return thr, m, soft


# --------------------------------------------------------------------------- #
#  Internal: the keyed-region mask (legacy math, exact)
# --------------------------------------------------------------------------- #


def _chroma_key_mask(
    rgb: np.ndarray, hue: float, tolerance: float, softness: float
) -> np.ndarray:
    """Return the float32 KEY mask (1.0 = this pixel is the key colour).

    Reproduces the pre-refactor inline math byte-for-byte. ``hue`` is assumed
    already wrapped to [0,360); ``tolerance``/``softness`` already clamped.
    """
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)

    h_center = hue / 2.0
    h_low = (h_center - tolerance / 2.0) % 180
    h_high = (h_center + tolerance / 2.0) % 180

    h = hsv[:, :, 0].astype(np.float32)
    s = hsv[:, :, 1].astype(np.float32)

    if h_low < h_high:
        hue_mask = (h >= h_low) & (h <= h_high)
    else:
        # Wraparound (e.g. key hue near 0/360): the band straddles the seam.
        hue_mask = (h >= h_low) | (h <= h_high)

    sat_mask = s > _SAT_FLOOR
    mask = (hue_mask & sat_mask).astype(np.float32)

    if softness > 0:
        ksize = int(softness * 2) | 1
        mask = cv2.GaussianBlur(mask, (ksize, ksize), 0)

    return mask


def _hue_distance_deg(h_opencv: np.ndarray, key_hue_deg: float) -> np.ndarray:
    """Circular hue distance in DEGREES (0–360 space) for each pixel.

    ``h_opencv`` is the OpenCV H channel (0–180). Returns float32 (H,W) of the
    minimal angular distance to ``key_hue_deg`` accounting for wraparound.
    """
    h_deg = h_opencv.astype(np.float32) * 2.0  # 0–180 → 0–360
    diff = np.abs(h_deg - (key_hue_deg % 360.0))
    return np.minimum(diff, 360.0 - diff)


# --------------------------------------------------------------------------- #
#  Public: chroma kernel
# --------------------------------------------------------------------------- #


def chroma_alpha(
    rgb: np.ndarray,
    hue: object,
    tolerance: object,
    softness: object,
    spill: object = 0.0,
) -> tuple[np.ndarray, np.ndarray]:
    """Chroma key kernel — single source of truth.

    Args:
        rgb:       uint8 (H, W, 3) RGB array.
        hue:       target hue in degrees [0,360) (wrapped); 120 = green.
        tolerance: hue band width in degrees [1,180].
        softness:  edge feather in px [0,50].
        spill:     spill-suppression strength [0,1]. 0 = exact legacy no-op.

    Returns:
        ``(alpha_f01, rgb_out)`` where
          * ``alpha_f01`` is float32 (H, W) in [0,1]; 1.0 = keep, 0.0 = keyed out.
            ``alpha = 1 − key_mask`` — the COMPLEMENT of the keyed region.
          * ``rgb_out`` is the spill-suppressed RGB (uint8). At ``spill == 0`` it
            is the SAME object as ``rgb`` (no copy → golden byte-equal).

    Never raises on bad numerics (every param is finite-guarded + clamped).
    """
    h, tol, soft, sp = sanitize_chroma_params(hue, tolerance, softness, spill)

    key_mask = _chroma_key_mask(rgb, h, tol, soft)
    alpha = (1.0 - key_mask).astype(np.float32)

    if sp <= 0.0:
        # Exact legacy path: no RGB modification, same array object.
        return alpha, rgb

    rgb_out = _suppress_spill(rgb, h, tol, sp)
    return alpha, rgb_out


def _suppress_spill(
    rgb: np.ndarray, hue: float, tolerance: float, spill: float
) -> np.ndarray:
    """Desaturate toward luma within the spill radius of the key hue.

    A pixel whose hue is within ``radius = (tolerance/2) · (1 + spill)`` degrees
    of the key hue is pulled toward its own grayscale luma. The pull strength is
    ``spill · proximity`` where proximity ∈ [0,1] is 1 at the key hue and 0 at
    the radius edge — so the green fringe just outside the alpha key (which the
    matte keeps) loses its green cast smoothly.

    Returns a NEW uint8 (H,W,3) array (the input is never mutated).
    """
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    dist = _hue_distance_deg(hsv[:, :, 0], hue)  # degrees, [0,180]

    radius = max(1e-6, (tolerance / 2.0) * (1.0 + spill))
    proximity = np.clip(1.0 - dist / radius, 0.0, 1.0).astype(np.float32)
    strength = (spill * proximity)[:, :, np.newaxis]  # (H,W,1) in [0, spill]

    rgb_f = rgb.astype(np.float32)
    # Rec.601 luma — the gray we desaturate toward (per-pixel scalar).
    luma = (0.299 * rgb_f[:, :, 0] + 0.587 * rgb_f[:, :, 1] + 0.114 * rgb_f[:, :, 2])[
        :, :, np.newaxis
    ]

    out = rgb_f * (1.0 - strength) + luma * strength
    return np.clip(out, 0.0, 255.0).astype(np.uint8)


# --------------------------------------------------------------------------- #
#  Public: luma kernel
# --------------------------------------------------------------------------- #


def luma_alpha(
    rgb: np.ndarray,
    threshold: object,
    mode: object,
    softness: object,
) -> np.ndarray:
    """Luma key kernel — single source of truth.

    Args:
        rgb:       uint8 (H, W, 3) RGB array.
        threshold: brightness cutoff [0,1].
        mode:      "dark" (key out below) or "bright" (key out above).
        softness:  edge feather in px [0,50].

    Returns:
        float32 (H, W) alpha in [0,1]; 1.0 = keep, 0.0 = keyed out.
        ``alpha = 1 − key_mask`` — byte-equal to the legacy effect's matte.

    Never raises on bad numerics.
    """
    thr, m, soft = sanitize_luma_params(threshold, mode, softness)

    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255.0

    if m == "dark":
        mask = (gray < thr).astype(np.float32)
    else:
        mask = (gray > thr).astype(np.float32)

    if soft > 0:
        ksize = int(soft * 2) | 1
        mask = cv2.GaussianBlur(mask, (ksize, ksize), 0)

    return (1.0 - mask).astype(np.float32)


# --------------------------------------------------------------------------- #
#  Procedural matte evaluators (registered into masking.stack — MK.8)
# --------------------------------------------------------------------------- #
#
# Matte convention (resolve_stack): 1.0 = SELECTED region. A key node selects
# the KEYED-OUT colour region (the green screen / the dark area), i.e. the
# COMPLEMENT of the kept alpha. So matte = key_mask = 1 − alpha. With maskMode
# 'deleteInside' that removes the green; 'deleteOutside' keeps only the green.
#
# The evaluator signature matches stack.EvaluatorFn:
#   (node, ctx, height, width) -> float32 (H, W) in [0, 1]


def _rgb_from_ctx(ctx, height: int, width: int) -> np.ndarray:
    """Extract a uint8 (H,W,3) RGB array from the FrameCtx.

    If no frame is present (e.g. a static-only test path), returns an all-zero
    frame so the evaluator degrades to an empty matte instead of raising.
    """
    frame = getattr(ctx, "frame", None)
    if frame is None:
        return np.zeros((height, width, 3), dtype=np.uint8)
    return np.ascontiguousarray(frame[:, :, :3])


def evaluate_chroma_matte(node, ctx, height: int, width: int) -> np.ndarray:
    """Procedural ``chroma_key`` matte: select the keyed-out hue region.

    Reads ``node.params``: hue / tolerance / softness / spill (spill does not
    change the SELECTION, only the effect's RGB; the matte is the key region).
    """
    p = node.params
    rgb = _rgb_from_ctx(ctx, height, width)
    alpha, _ = chroma_alpha(
        rgb,
        p.get("hue", 120.0),
        p.get("tolerance", 30.0),
        p.get("softness", 10.0),
        p.get("spill", 0.0),
    )
    # Select the keyed region = complement of kept alpha.
    return (1.0 - alpha).astype(np.float32)


def evaluate_luma_matte(node, ctx, height: int, width: int) -> np.ndarray:
    """Procedural ``luma_key`` matte: select the keyed-out luminance region."""
    p = node.params
    rgb = _rgb_from_ctx(ctx, height, width)
    alpha = luma_alpha(
        rgb,
        p.get("threshold", 0.3),
        p.get("mode", "dark"),
        p.get("softness", 10.0),
    )
    return (1.0 - alpha).astype(np.float32)


def register_key_evaluators() -> None:
    """Wire the chroma/luma evaluators into the masking stack registry.

    Idempotent — re-registration replaces the entry (register_evaluator's
    documented behavior). Called at masking-package import (MK.8).
    """
    # Imported lazily to avoid a circular import at module load.
    from masking.stack import register_evaluator

    register_evaluator("chroma_key", evaluate_chroma_matte)
    register_evaluator("luma_key", evaluate_luma_matte)
