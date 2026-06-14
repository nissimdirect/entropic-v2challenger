"""P6.1 — CPU row-banded lane evaluation (domain=Y/X live render unlock).

Implements `evaluate_axis_lane_bands` and the banded-apply wrapper used by
pipeline.apply_chain when an effect has an `axis_lanes` entry for one of its
params.

Key design decisions
--------------------
* Only Y-axis (horizontal strips) and X-axis (vertical strips) lanes are handled
  here.  T-axis automation stays in the existing automation_overrides path — any
  attempt to route a T-domain lane through axis_lanes is treated as a negative
  test (rejected, caller skips).
* Stateful effects get APPROXIMATE banding: state_in is passed only to band 0
  and the resulting state_out from band 0 is propagated to all subsequent bands.
  This is an intentional trade-off documented in the public function's docstring;
  the alternative (chaining state_out per band) changes the render meaning and
  is reserved for a future per-band stateful mode.
* `direction='negative'` (direction < 0 on the Lane) reverses band order so
  that band 0 starts at the far end of the axis.  The curve itself is unchanged;
  only the frame strips are iterated in reverse.
* Perf guard: if (n_effects_with_axis_lanes * n_bands) > 512 invocations for a
  given frame, n_bands is reduced to keep total invocations ≤ 512.  This matches
  the #166 budget of 500 ms/frame @1080p (see constant AXIS_LANE_MAX_INVOCATIONS).
"""

from __future__ import annotations

import logging
import math
from typing import Any

import numpy as np

from modulation.lane_reader import sample_lane_row
from modulation.schema import Lane, LaneDomain

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

BAND_COUNT_MIN: int = 2
BAND_COUNT_MAX: int = 128

# Total effect invocations per frame budget (#166: 500 ms/frame @1080p).
AXIS_LANE_MAX_INVOCATIONS: int = 512


# ---------------------------------------------------------------------------
# Band count helpers
# ---------------------------------------------------------------------------


def _clamp_n_bands(n_bands: int) -> int:
    """Clamp n_bands to the legal range [BAND_COUNT_MIN, BAND_COUNT_MAX]."""
    return max(BAND_COUNT_MIN, min(BAND_COUNT_MAX, n_bands))


# ---------------------------------------------------------------------------
# Public API — band scalar evaluation
# ---------------------------------------------------------------------------


def evaluate_axis_lane_bands(
    curve: list[float],
    lane: Lane,
    t_norm: float,
    n_bands: int = 32,
) -> list[float]:
    """Return one scalar per band by sampling the lane across the target axis.

    Parameters
    ----------
    curve:
        Raw curve samples (floats).  Empty / NaN / Inf values are sanitised
        via np.nan_to_num + clamp before sampling.
    lane:
        The Lane describing domain, direction, interp_mode, loop_mode.
        Only Y and X domains are accepted; others raise ValueError.
    t_norm:
        Normalised clip time in [0, 1] — used as the orthogonal-axis value
        when the lane domain is Y (vertical) or X (horizontal).
    n_bands:
        Number of strips to divide the axis into.  Clamped to
        [BAND_COUNT_MIN, BAND_COUNT_MAX] (i.e. [2, 128]) silently.

    Returns
    -------
    list[float]
        One scalar per band.  Band 0 is the top strip (Y-domain) or left
        strip (X-domain).  When lane.direction < 0 the order is reversed so
        band 0 maps to the bottom / right strip.

    Raises
    ------
    ValueError
        If the lane domain is not Y or X (T-domain stays in automation_overrides).
    """
    if lane.domain not in (LaneDomain.Y, LaneDomain.X):
        raise ValueError(
            f"evaluate_axis_lane_bands only accepts Y or X domain lanes; "
            f"got domain={lane.domain.value!r}. "
            f"T-domain automation belongs in the automation_overrides path."
        )

    n_bands = _clamp_n_bands(n_bands)

    # Sanitise curve — nan_to_num replaces NaN → 0, Inf → large finite, then
    # clamp to a sane float range.
    if not curve:
        sanitized: list[float] = [0.0]
    else:
        arr = np.nan_to_num(
            np.array(curve, dtype=np.float64), nan=0.0, posinf=1.0, neginf=0.0
        )
        arr = np.clip(arr, -1e9, 1e9)
        sanitized = arr.tolist()

    # Band centre positions in [0, 1] along the lane's axis.
    # For Y-domain: 0.0 = top row, 1.0 = bottom row.
    # For X-domain: 0.0 = left column, 1.0 = right column.
    band_centers = [(i + 0.5) / n_bands for i in range(n_bands)]

    # Direction sign: controls scan polarity for the banded case.
    # sample_lane / sample_lane_row multiply axis_value by lane.direction
    # before wrap-normalizing.  A negative direction makes all positive band
    # centres produce negative u_raw values, which LoopMode.OFF clamps to 0 —
    # every band would get the same curve[0] value, not a reversal.
    # The banded abstraction handles direction as index ordering: we always
    # sample the curve forward (direction=+1 magnitude), then reverse the
    # scalar list when direction < 0.  Speed (|direction| ≠ 1) is preserved
    # by scaling the magnitude.
    direction_sign = -1 if lane.direction < 0 else 1
    # Use abs(direction) so the sampling speed is correct but sign is stripped.
    sampling_lane = Lane(
        domain=lane.domain,
        direction=abs(lane.direction),
        binding_rule=lane.binding_rule,
        interp_mode=lane.interp_mode,
        loop_mode=lane.loop_mode,
    )

    # sample_lane_row expects y_norms for domain Y; for domain X we use
    # the underlying sample_lane directly to honour the x_norm field.
    if sampling_lane.domain == LaneDomain.Y:
        scalars = sample_lane_row(sanitized, sampling_lane, t_norm, band_centers)
    else:
        # X-domain: sample per-band using FrameCoord with x_norm set.
        from modulation.lane_reader import FrameCoord, sample_lane

        scalars = [
            sample_lane(sanitized, sampling_lane, FrameCoord(t_norm=t_norm, x_norm=xc))
            for xc in band_centers
        ]

    # direction < 0 → reverse band order (band 0 maps to far end of axis).
    if direction_sign < 0:
        scalars = scalars[::-1]

    return scalars


# ---------------------------------------------------------------------------
# Banded-apply wrapper
# ---------------------------------------------------------------------------


def apply_effect_banded(
    frame: np.ndarray,
    effect_fn,
    effect_id: str,
    params: dict,
    param_name: str,
    scalars: list[float],
    state_in: dict | None,
    *,
    frame_index: int,
    project_seed: int,
    resolution: tuple[int, int],
    axis: LaneDomain,
) -> tuple[np.ndarray, dict | None]:
    """Apply an effect once per band, substituting the band's scalar for param_name.

    The frame is split into N equal strips along `axis`:
    * Y-domain → horizontal strips (np.vsplit / np.vstack).
    * X-domain → vertical strips  (np.hsplit / np.hstack).

    State handling (APPROXIMATE banding)
    -------------------------------------
    state_in is passed only to band 0.  The state_out from band 0 is then
    passed to all subsequent bands as their state_in.  This avoids hiding
    effects from earlier bands but is an approximation — fully-chained
    state_out propagation would require sequential execution where each
    band's state_out feeds the next.  Stateful effects (datamosh,
    reaction_mosh, etc.) that depend on exact state continuity should not
    be used with axis lanes until a per-band stateful mode is added.

    Parameters
    ----------
    frame:        Input RGBA frame (H, W, 4) uint8.
    effect_fn:    The raw effect apply() callable (NOT an EffectContainer).
    effect_id:    String ID used only for logging.
    params:       Base param dict; param_name will be overridden per band.
    param_name:   The param to modulate with the band's scalar.
    scalars:      Per-band values from evaluate_axis_lane_bands.
    state_in:     Per-effect state from the previous frame.
    frame_index:  Current frame number.
    project_seed: Project-level seed.
    resolution:   (width, height) of the output.
    axis:         LaneDomain.Y or LaneDomain.X.

    Returns
    -------
    (reassembled_frame, state_out_band0)
    """
    from engine.container import EffectContainer
    from engine.determinism import derive_seed

    n_bands = len(scalars)
    h, w = frame.shape[:2]

    # Split frame into strips.
    if axis == LaneDomain.Y:
        # Pad height to be divisible by n_bands to make vsplit work cleanly.
        pad_h = (n_bands - h % n_bands) % n_bands
        if pad_h:
            frame_work = np.concatenate(
                [frame, np.zeros((pad_h, w, frame.shape[2]), dtype=frame.dtype)], axis=0
            )
        else:
            frame_work = frame
        strips = np.vsplit(frame_work, n_bands)
    else:
        # X-axis: vertical strips.
        pad_w = (n_bands - w % n_bands) % n_bands
        if pad_w:
            frame_work = np.concatenate(
                [frame, np.zeros((h, pad_w, frame.shape[2]), dtype=frame.dtype)], axis=1
            )
        else:
            frame_work = frame
        strips = np.hsplit(frame_work, n_bands)

    # Derive the per-frame seed once (same logic as EffectContainer).
    seed = derive_seed(project_seed, effect_id, frame_index, params.get("seed", 0))
    strip_resolution = (
        (resolution[0], resolution[1] // n_bands)
        if axis == LaneDomain.Y
        else (resolution[0] // n_bands, resolution[1])
    )

    out_strips: list[np.ndarray] = []
    band0_state_out: dict | None = state_in  # default fallback

    for band_idx, (strip, scalar) in enumerate(zip(strips, scalars)):
        band_params = dict(params)
        band_params[param_name] = float(scalar)

        # State: band 0 uses state_in; all others use band 0's state_out.
        s_in = state_in if band_idx == 0 else band0_state_out

        try:
            wet_strip, s_out = effect_fn(
                strip,
                band_params,
                s_in,
                frame_index=frame_index,
                seed=seed,
                resolution=strip_resolution,
            )
        except Exception as exc:
            logger.warning(
                "apply_effect_banded: effect %s band %d failed (%s) — using dry strip",
                effect_id,
                band_idx,
                type(exc).__name__,
            )
            wet_strip = strip
            s_out = s_in

        if band_idx == 0:
            band0_state_out = s_out

        # Validate strip shape — revert to dry on mismatch.
        if not isinstance(wet_strip, np.ndarray) or wet_strip.shape != strip.shape:
            logger.warning(
                "apply_effect_banded: effect %s band %d returned wrong shape — dry",
                effect_id,
                band_idx,
            )
            wet_strip = strip

        out_strips.append(wet_strip)

    # Reassemble.
    if axis == LaneDomain.Y:
        out_frame = np.vstack(out_strips)
        # Trim any padding.
        if pad_h:
            out_frame = out_frame[:h, :, :]
    else:
        out_frame = np.hstack(out_strips)
        if pad_w:
            out_frame = out_frame[:, :w, :]

    # Ensure uint8.
    if out_frame.dtype != np.uint8:
        out_frame = np.clip(out_frame, 0, 255).astype(np.uint8)

    return out_frame, band0_state_out


# ---------------------------------------------------------------------------
# Perf guard — reduce n_bands to stay under AXIS_LANE_MAX_INVOCATIONS
# ---------------------------------------------------------------------------


def budget_n_bands(n_effects_with_axis: int, n_bands: int) -> int:
    """Reduce n_bands so total invocations stay under AXIS_LANE_MAX_INVOCATIONS.

    Called by pipeline.apply_chain before the banded loop to honour the
    500 ms/frame budget from #166.  Returns the (possibly reduced) n_bands.
    """
    if n_effects_with_axis <= 0:
        return _clamp_n_bands(n_bands)
    max_per_effect = AXIS_LANE_MAX_INVOCATIONS // n_effects_with_axis
    allowed = max(BAND_COUNT_MIN, min(n_bands, max_per_effect))
    if allowed < n_bands:
        logger.warning(
            "axis_lane perf guard: %d effects × %d bands = %d invocations "
            "> %d budget; reducing n_bands to %d",
            n_effects_with_axis,
            n_bands,
            n_effects_with_axis * n_bands,
            AXIS_LANE_MAX_INVOCATIONS,
            allowed,
        )
    return allowed
