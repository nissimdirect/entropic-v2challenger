"""SG-3 latent NaN/Inf sentinel + L2 clamp (SPEC-3 §3).

Pure-function module. Every code path that touches latent vectors
(modulation routes, feedback loops, decoded latents) MUST run them
through `check_and_clamp()` before publishing downstream. This catches:

  - NaN/Inf propagation from numerical instability (out-of-distribution
    latents, divide-by-zero in modulation chains)
  - Unbounded magnitude drift on feedback paths (C6 Frame-as-Self-Wavetable,
    C8 Feedback-Through-L)
  - Encoder output corruption (rare; usually a torch backend issue)

The sentinel is fail-loud: an invalid latent raises `LatentSentinelError`,
which the surrounding lane/effect handler converts to a user-facing toast
(via the existing toast.ts pattern). Tier 5 features cannot ship without
this gate (SPEC-3 §3.1 contract).

Per [[feedback_sdlc-verify-in-app-not-just-code]]: the unit tests
verify the math + behavior; the in-app validation is the
toast-when-NaN-fires path which lights up when downstream code calls
this on a real feedback runaway scenario in PR #11 SG-8 implementation
or a Tier 5 feature build.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from enum import Enum

import numpy as np

logger = logging.getLogger(__name__)

# L2 norm above which we clamp. Encoders return L2≈1; anything above 10
# is almost certainly a feedback runaway. The clamp scales the vector
# back to magnitude 1 (preserves direction).
DEFAULT_L2_CEILING = 10.0

# L2 norm below which the latent is considered "zero" — we can't
# normalize it, so it's flagged separately. Common after divide-by-zero
# upstream.
DEFAULT_L2_FLOOR = 1e-6

# Per-backbone L2 ceiling table (SPEC-3 §3.3).
# B8-latent/B9-learned callers pass their backbone name so the ceiling is
# tighter where encoder outputs are known to stay near unit norm, and
# relaxed for backbones whose internal representations have higher natural
# magnitude (e.g. CLIP image encoders clip their output at √dim).
#
# Schema: backbone_name (str) → L2 ceiling (float, > 0).
# Unknown backbone names fall back to DEFAULT_L2_CEILING.
# Callers: pass the result of `get_l2_ceiling_for_backbone(name)` as the
# `l2_ceiling` argument to `check_and_clamp()`.
MAX_L2_NORM_PER_BACKBONE: dict[str, float] = {
    # Stable Diffusion VAE encoder: outputs ≈ unit-norm latents (σ≈0.18)
    "sd_vae": 5.0,
    # CLIP image encoder: embeddings are ℓ₂-normalized to 1 by the model
    "clip_image": 2.0,
    # CLIP text encoder: same normalization as image encoder
    "clip_text": 2.0,
    # MusicGen / AudioCraft encoder: outputs have higher variance
    "audiogen": 20.0,
    # Generic fallback for unregistered backbones (identical to DEFAULT_L2_CEILING)
    "_default": DEFAULT_L2_CEILING,
}


def get_l2_ceiling_for_backbone(backbone: str) -> float:
    """Return the per-backbone L2 ceiling from MAX_L2_NORM_PER_BACKBONE.

    Falls back to the ``_default`` entry (= DEFAULT_L2_CEILING) for unknown
    backbone names.  The caller passes the result as ``l2_ceiling`` to
    ``check_and_clamp()``.

    Args:
        backbone: Case-sensitive backbone name (e.g. "sd_vae", "clip_image").

    Returns:
        A positive float L2 ceiling appropriate for the named backbone.
    """
    if not isinstance(backbone, str) or not backbone:
        return MAX_L2_NORM_PER_BACKBONE["_default"]
    return MAX_L2_NORM_PER_BACKBONE.get(backbone, MAX_L2_NORM_PER_BACKBONE["_default"])


class SentinelAction(str, Enum):
    """What the sentinel did to a latent."""

    PASSTHROUGH = "passthrough"  # within bounds; no change
    CLAMPED = "clamped"  # L2 above ceiling; renormalized
    REJECTED_NAN = "rejected_nan"
    REJECTED_INF = "rejected_inf"
    REJECTED_ZERO = "rejected_zero"  # too close to zero to normalize


class LatentSentinelError(Exception):
    """Raised when a latent fails NaN/Inf/zero check.

    The lane handler catches this + emits a user-facing toast like:
    "Modulation route 'C8 feedback' produced an invalid latent. Lane
    paused. Reduce feedback amount or check the modulation source."
    """

    def __init__(self, action: SentinelAction, context: str = ""):
        self.action = action
        self.context = context
        super().__init__(f"latent rejected ({action.value}): {context}")


@dataclass(frozen=True)
class SentinelResult:
    """Outcome of a single check_and_clamp call."""

    latent: np.ndarray  # may be the input verbatim, or a clamped copy
    action: SentinelAction
    pre_l2_norm: float
    post_l2_norm: float


def check_and_clamp(
    latent: np.ndarray,
    *,
    l2_ceiling: float = DEFAULT_L2_CEILING,
    l2_floor: float = DEFAULT_L2_FLOOR,
    context: str = "",
    raise_on_reject: bool = True,
) -> SentinelResult:
    """Apply the SG-3 sentinel checks + L2 renormalization.

    Order of checks:
      1. NaN detection (raises or returns REJECTED_NAN)
      2. Inf detection (raises or returns REJECTED_INF)
      3. L2 floor (raises or returns REJECTED_ZERO)
      4. L2 ceiling — if violated, normalize to magnitude 1 (CLAMPED)
      5. Otherwise PASSTHROUGH

    The result's `.latent` is ALWAYS safe to publish downstream
    (when action != REJECTED_*). PASSTHROUGH returns the input verbatim
    (no copy); CLAMPED returns a new array.

    Set `raise_on_reject=False` to get the REJECTED_* status without
    an exception (useful for batch-validation telemetry).
    """
    if latent.dtype != np.float32 and latent.dtype != np.float64:
        # Allow integer/bool inputs to fail-fast — they shouldn't be in
        # a latent path
        raise TypeError(
            f"check_and_clamp expects float32 or float64; got {latent.dtype}"
        )

    if np.any(np.isnan(latent)):
        logger.warning("SG-3: NaN in latent (context=%s)", context)
        if raise_on_reject:
            raise LatentSentinelError(SentinelAction.REJECTED_NAN, context)
        return SentinelResult(
            latent=latent,
            action=SentinelAction.REJECTED_NAN,
            pre_l2_norm=float("nan"),
            post_l2_norm=float("nan"),
        )

    if np.any(np.isinf(latent)):
        logger.warning("SG-3: Inf in latent (context=%s)", context)
        if raise_on_reject:
            raise LatentSentinelError(SentinelAction.REJECTED_INF, context)
        return SentinelResult(
            latent=latent,
            action=SentinelAction.REJECTED_INF,
            pre_l2_norm=float("inf"),
            post_l2_norm=float("inf"),
        )

    pre_norm = float(np.linalg.norm(latent))

    if pre_norm < l2_floor:
        logger.warning(
            "SG-3: latent below L2 floor (norm=%.6f, floor=%.6f, context=%s)",
            pre_norm,
            l2_floor,
            context,
        )
        if raise_on_reject:
            raise LatentSentinelError(SentinelAction.REJECTED_ZERO, context)
        return SentinelResult(
            latent=latent,
            action=SentinelAction.REJECTED_ZERO,
            pre_l2_norm=pre_norm,
            post_l2_norm=pre_norm,
        )

    if pre_norm > l2_ceiling:
        # Renormalize to magnitude 1 (preserves direction)
        clamped = latent / pre_norm
        logger.info(
            "SG-3: latent clamped (pre_norm=%.4f > ceiling=%.4f, context=%s)",
            pre_norm,
            l2_ceiling,
            context,
        )
        return SentinelResult(
            latent=clamped.astype(latent.dtype, copy=False),
            action=SentinelAction.CLAMPED,
            pre_l2_norm=pre_norm,
            post_l2_norm=1.0,
        )

    # All checks passed
    return SentinelResult(
        latent=latent,
        action=SentinelAction.PASSTHROUGH,
        pre_l2_norm=pre_norm,
        post_l2_norm=pre_norm,
    )


def detect_nan_in_frame(frame: np.ndarray) -> bool:
    """SG-3 clause-2 render-output gate: is ANY pixel non-finite (NaN/±Inf)?

    This is the frame-level (image-domain) sibling of `check_and_clamp`, which
    is latent-domain (requires float dtype + does an L2-norm renormalization
    that is meaningless for an RGBA image frame). A composited preview/export
    frame is a uint8 *or* float array of arbitrary magnitude — the only thing
    we assert before it goes downstream to compositing/encode is FINITENESS.

    Implementation: ONE `np.isfinite` reduction over the final frame (single
    pass, no copy). `np.isfinite` is True for normal numbers and False for both
    NaN and ±Inf, so `~np.all(np.isfinite(frame))` catches both. Integer frames
    (the uint8 happy path) are trivially all-finite and short-circuit cheaply.

    Returns True if the frame contains a NaN/Inf (caller must abort/substitute);
    False if every pixel is finite (caller passes the frame through unmodified).
    """
    # Integer dtypes can never hold NaN/Inf — skip the float reduction entirely
    # (keeps the uint8 hot path allocation- and scan-free beyond the dtype check).
    if np.issubdtype(frame.dtype, np.integer):
        return False
    return not bool(np.all(np.isfinite(frame)))


def safe_normalize(latent: np.ndarray, *, context: str = "") -> np.ndarray:
    """Convenience wrapper: returns just the safe latent (or raises).

    Equivalent to `check_and_clamp(latent, context=context).latent`
    with default thresholds. Use this in the common case where the
    caller only cares about the result, not the action category.
    """
    return check_and_clamp(latent, context=context).latent


def batch_validate(
    latents: list[np.ndarray], *, context: str = ""
) -> dict[SentinelAction, int]:
    """Validate a batch of latents and count outcomes by category.

    Never raises; used for telemetry / batch-processing dashboards.
    Returns a count dict like {PASSTHROUGH: 47, CLAMPED: 2, REJECTED_NAN: 1}.
    """
    counts: dict[SentinelAction, int] = {a: 0 for a in SentinelAction}
    for i, lat in enumerate(latents):
        try:
            result = check_and_clamp(
                lat, context=f"{context}[{i}]", raise_on_reject=False
            )
            counts[result.action] += 1
        except TypeError:
            # Wrong dtype — skip + log; not a sentinel rejection
            logger.warning("batch_validate skipped index %d (bad dtype)", i)
    return counts
