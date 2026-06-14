"""Effect pipeline — applies a chain of effects to a frame.

Includes per-effect timeout guard to prevent slow effects from blocking
the ZMQ server and triggering watchdog restarts (BUG-4).

Includes auto-disable for effects that fail consecutively (Item 2).
Includes conditional breadcrumbs and rolling timing stats (Item 6).
"""

import logging
import threading
import time
from collections import defaultdict, deque

import numpy as np
import sentry_sdk

from effects import registry
from effects.field_top25 import is_field_capable
from engine.container import EffectContainer
from modulation.field_eval import (
    BAND_COUNT_MIN,
    apply_effect_banded,
    budget_n_bands,
    evaluate_axis_lane_bands,
)
from modulation.schema import Lane, LaneDomain

logger = logging.getLogger(__name__)

# SEC-7: Maximum effects in a single chain
MAX_CHAIN_DEPTH = 10

# P2.2c (slice 3c, Decision D3): the terminal `composite` effect is compositing
# plumbing, not a frame transform. apply_chain DETECTS and SKIPS it so the blend
# is applied exactly once (by render_composite, reading opacity/mode off the same
# terminal). Double-applying it is the headline failure mode for this slice — the
# 9 per-blend-mode hash-stability tests are the catch.
COMPOSITE_EFFECT_ID = "composite"

# Per-effect timing thresholds (milliseconds)
EFFECT_WARN_MS = 100
EFFECT_ABORT_MS = 500

# Auto-disable threshold: consecutive failures before disabling
DISABLE_THRESHOLD = 3

# Thread-safe failure tracking (export thread + preview both call apply_chain)
_health_lock = threading.Lock()
_failure_counts: dict[str, int] = defaultdict(int)
_disabled_effects: set[str] = set()

# Rolling timing stats per effect (Item 6)
_effect_timing: dict[str, deque] = defaultdict(lambda: deque(maxlen=100))


def _record_failure(effect_id: str) -> bool:
    """Record a failure. Returns True if effect was just disabled."""
    with _health_lock:
        _failure_counts[effect_id] += 1
        if _failure_counts[effect_id] >= DISABLE_THRESHOLD:
            _disabled_effects.add(effect_id)
            return True
    return False


def _record_success(effect_id: str):
    """Reset consecutive failure counter on success."""
    with _health_lock:
        _failure_counts[effect_id] = 0


def get_effect_health() -> dict:
    """Side-channel: returns current health state."""
    with _health_lock:
        return {
            "failure_counts": dict(_failure_counts),
            "disabled_effects": list(_disabled_effects),
        }


def reset_effect_health(effect_id: str | None = None):
    """Reset health tracking. If effect_id given, reset just that effect."""
    with _health_lock:
        if effect_id:
            _failure_counts.pop(effect_id, None)
            _disabled_effects.discard(effect_id)
        else:
            _failure_counts.clear()
            _disabled_effects.clear()


def record_timing(effect_id: str, elapsed_ms: float):
    """Record a timing sample for an effect."""
    _effect_timing[effect_id].append(elapsed_ms)


def get_effect_stats() -> dict[str, dict]:
    """Return p50/p95/max/drop_rate per effect."""
    result = {}
    for eid, samples in _effect_timing.items():
        s = sorted(samples)
        result[eid] = {
            "p50": s[len(s) // 2] if s else 0,
            "p95": s[int(len(s) * 0.95)] if len(s) >= 20 else None,
            "max": max(s) if s else 0,
            "drop_rate": sum(1 for t in s if t > 500) / len(s) if s else 0,
            "samples": len(s),
        }
    return result


def flush_timing():
    """Clear all timing stats."""
    _effect_timing.clear()


def apply_chain(
    frame: np.ndarray,
    chain: list[dict],
    project_seed: int,
    frame_index: int,
    resolution: tuple[int, int],
    states: dict[str, dict | None] | None = None,
    freeze_cut: int | None = None,
    freeze_frame: np.ndarray | None = None,
    chain_mask: np.ndarray | None = None,
    axis_lanes: list[dict] | None = None,
) -> tuple[np.ndarray, dict[str, dict | None]]:
    """Apply an ordered chain of effects to a frame.

    Args:
        frame:        Input RGBA frame (H, W, 4) uint8.
        chain:        List of effect instances, each:
                      {"effect_id": str, "params": dict, "enabled": bool}.
        project_seed: Project-level seed for determinism.
        frame_index:  Current frame number (0-based).
        resolution:   (width, height) of the output.
        states:       Per-effect state from previous frame, keyed by effect_id.
        freeze_cut:   If set, skip effects 0..freeze_cut and use freeze_frame instead.
        freeze_frame: Cached RGBA frame to use when freeze_cut is active.
        chain_mask:   MK.3 per-chain wet/dry matte, float32 (H, W) in [0, 1].
                      When set, the WHOLE chain is wet/dry-blended against the
                      chain's input snapshot: ``out = in·(1−m) + chain(in)·m``.
                      This is the universal-wrapper routing scope and is NOT
                      equivalent to per-device ``_mask`` injection on every stage
                      (a 3-effect chain differs; see
                      tests/test_mask_routing.py::test_chain_mask_whole_chain_wet_dry_not_per_device).
                      Degenerate: all-ones → byte-identical to no chain_mask;
                      all-zeros → byte-identical to the dry input snapshot.
                      Interaction with freeze_cut: the snapshot is taken AFTER the
                      freeze short-circuit resolves ``output`` (so a frozen prefix
                      is the dry reference the live suffix blends against). When
                      freeze_cut skips the entire chain, the snapshot equals the
                      freeze_frame and the blend is the identity (wet == dry).
        axis_lanes:   P6.1 optional list of per-effect axis-lane modulations.
                      Each entry: {
                        "effect_id": str,
                        "param": str,
                        "curve": [float, ...],
                        "domain": "y" | "x",
                        "direction": float,    # default 1.0
                        "interp_mode": str,    # default "linear"
                        "loop_mode": str,      # default "off"
                        "n_bands": int,        # default 32, clamped to [2, 128]
                      }
                      ABSENT (None or []) → EXACT current behavior (byte-identical).
                      Only Y/X domains are accepted; T-domain entries are skipped
                      with a warning (T stays in automation_overrides path).
                      unknown effect_id → skipped with warning, never crash.
                      NaN/Inf in curve → sanitized via nan_to_num + clamp.

    Returns:
        Tuple of (output_frame, new_states).

    Raises:
        ValueError: If chain exceeds MAX_CHAIN_DEPTH or contains unknown effects.
    """
    # P2.2c (Decision D3): strip the terminal composite BEFORE the depth check
    # and the process loop. It is compositing plumbing (opacity/mode read by
    # render_composite), never a frame transform — running it here would
    # double-apply the blend. Only the LAST entry is the terminal composite;
    # a mid-chain composite is invalid (frontend validator rejects it) and is
    # left in place so it surfaces as the registered identity no-op rather than
    # being silently honored as compositing. Done against the SEC-7 cap so a
    # full 10-effect chain plus a terminal composite is not falsely rejected.
    if chain and chain[-1].get("effect_id") == COMPOSITE_EFFECT_ID:
        chain = chain[:-1]

    if len(chain) > MAX_CHAIN_DEPTH:
        raise ValueError(
            f"Chain depth {len(chain)} exceeds maximum {MAX_CHAIN_DEPTH} (SEC-7)"
        )

    if states is None:
        states = {}

    output = frame
    new_states: dict[str, dict | None] = {}

    # Freeze short-circuit: skip effects 0..freeze_cut, use cached frame instead
    if freeze_cut is not None and freeze_frame is not None:
        output = freeze_frame
        # Preserve state for frozen effects so subsequent frames maintain continuity
        for effect_instance in chain[: freeze_cut + 1]:
            eid = effect_instance.get("effect_id")
            if eid and eid in states:
                new_states[eid] = states[eid]
        chain = chain[freeze_cut + 1 :]

    # MK.3 per-chain mask: snapshot the chain's dry input AFTER the freeze
    # short-circuit resolves `output`. The whole chain runs wet, then blends
    # against this snapshot once (out = in·(1−m) + chain(in)·m). Snapshot only
    # when a chain_mask is actually present (zero cost on the legacy path).
    chain_dry_snapshot = output.copy() if chain_mask is not None else None

    # P6.1 axis_lanes pre-processing: build a lookup keyed by effect_id.
    # Each entry maps effect_id → parsed axis-lane spec (Lane + param + scalars).
    # Only Y/X domains are accepted; T-domain entries are skipped + warned.
    # unknown effect_id in axis_lanes is skipped+warned (never crash).
    # NaN/Inf curves are sanitized inside evaluate_axis_lane_bands.
    _axis_lane_map: dict[str, dict] = {}
    if axis_lanes:
        # Compute effective n_bands under the perf budget.
        # Find n_bands from first valid entry (all entries should agree, but
        # we honour the first one and apply the budget guard globally).
        _raw_n_bands: int = 32
        for _al in axis_lanes:
            if isinstance(_al, dict):
                _raw_n_bands = int(_al.get("n_bands", 32))
                break
        _n_bands_budgeted = budget_n_bands(len(axis_lanes), _raw_n_bands)

        # Normalised clip time for axis sampling.
        # We derive it from frame_index + resolution; pipeline doesn't know fps
        # so we pass 0.0 here — callers that know t_norm should inject it via
        # the curve itself (Vision §6 design: curve encodes temporal shape).
        # For P6.1 the t_norm is always 0.0 within a single frame evaluation.
        _t_norm: float = 0.0

        for _al_entry in axis_lanes:
            if not isinstance(_al_entry, dict):
                continue
            _al_effect_id = str(_al_entry.get("effect_id", ""))
            _al_param = str(_al_entry.get("param", ""))
            _al_curve = _al_entry.get("curve", [])
            if not isinstance(_al_curve, list):
                _al_curve = []

            # Parse the Lane from the entry (reuse schema.Lane.from_dict).
            _al_lane = Lane.from_dict(
                {
                    "domain": _al_entry.get("domain", "y"),
                    "direction": float(_al_entry.get("direction", 1.0)),
                    "interp_mode": _al_entry.get("interp_mode", "linear"),
                    "loop_mode": _al_entry.get("loop_mode", "off"),
                }
            )

            # Reject T-domain axis lanes — T stays in automation_overrides.
            if _al_lane.domain == LaneDomain.T:
                logger.warning(
                    "axis_lanes: effect %r has domain='t' — "
                    "T-domain automation belongs in automation_overrides; skipping",
                    _al_effect_id,
                )
                continue

            # Evaluate band scalars now (before the effect loop).
            try:
                _scalars = evaluate_axis_lane_bands(
                    _al_curve, _al_lane, _t_norm, _n_bands_budgeted
                )
            except Exception as _eval_exc:
                logger.warning(
                    "axis_lanes: evaluate_axis_lane_bands failed for effect %r "
                    "param %r (%s) — skipping",
                    _al_effect_id,
                    _al_param,
                    type(_eval_exc).__name__,
                )
                continue

            _axis_lane_map[_al_effect_id] = {
                "param": _al_param,
                "lane": _al_lane,
                "scalars": _scalars,
            }

    for i, effect_instance in enumerate(chain):
        # Skip disabled effects
        if not effect_instance.get("enabled", True):
            continue

        effect_id = effect_instance.get("effect_id")
        params = dict(effect_instance.get("params", {}))

        # P6.2 field-param guard: reject __field__ values for params not in FIELD_TOP25.
        # This is a schema guard only — no field evaluation happens here (that is P6.1/P6.5).
        for param_name, param_value in params.items():
            if isinstance(param_value, dict) and "__field__" in param_value:
                if not is_field_capable(effect_id, param_name):
                    raise ValueError(
                        f"Effect {effect_id!r} param {param_name!r} received a field "
                        f"reference (__field__) but is not in the FIELD_TOP25 allow-list. "
                        f"Add it to backend/src/effects/field_top25.py to enable field "
                        f"modulation for this param, then re-run "
                        f"python3 backend/scripts/gen_field_top25.py --check."
                    )

        # Skip auto-disabled effects
        with _health_lock:
            if effect_id in _disabled_effects:
                logger.debug("Skipping auto-disabled effect %s", effect_id)
                continue

        # Conditional breadcrumbs: only for effects with prior failures (Item 6, NB-4)
        with _health_lock:
            prior_failures = _failure_counts.get(effect_id, 0)
        if prior_failures > 0:
            sentry_sdk.add_breadcrumb(
                category="effect",
                message=f"Processing {effect_id} (prior failures: {prior_failures})",
                data={"chain_position": i, "frame_index": frame_index},
                level="warning",
            )

        # Inject top-level mix into params as _mix for EffectContainer.
        # F-0516-9: setdefault preserves any routing-modulated _mix value so
        # operator modulation of mix is honored. If routing did not set it,
        # we fall back to the effect's base mix value.
        if "mix" in effect_instance:
            params.setdefault("_mix", effect_instance["mix"])

        effect_info = registry.get(effect_id)
        if effect_info is None:
            raise ValueError(f"unknown effect: {effect_id}")

        state_in = states.get(effect_id)
        t0 = time.monotonic()

        # P6.1 banded path: if this effect has an axis_lane spec, apply banded.
        _al_spec = _axis_lane_map.get(effect_id) if _axis_lane_map else None
        if _al_spec is not None:
            try:
                output, state_out = apply_effect_banded(
                    output,
                    effect_info["fn"],
                    effect_id,
                    params,
                    _al_spec["param"],
                    _al_spec["scalars"],
                    state_in,
                    frame_index=frame_index,
                    project_seed=project_seed,
                    resolution=resolution,
                    axis=_al_spec["lane"].domain,
                )
                elapsed_ms = (time.monotonic() - t0) * 1000
                record_timing(effect_id, elapsed_ms)
                _record_success(effect_id)
            except Exception as _banded_exc:
                logger.warning(
                    "apply_effect_banded: effect %s failed (%s) — "
                    "falling back to standard apply",
                    effect_id,
                    type(_banded_exc).__name__,
                )
                _al_spec = None  # fall through to standard path below

        if _al_spec is None:
            # Standard (non-banded) path — unchanged from pre-P6.1.
            container = EffectContainer(effect_info["fn"], effect_id)

            output, state_out = container.process(
                output,
                params,
                state_in,
                frame_index=frame_index,
                project_seed=project_seed,
                resolution=resolution,
            )

            elapsed_ms = (time.monotonic() - t0) * 1000

            # Record timing stats (Item 6)
            record_timing(effect_id, elapsed_ms)

            # Track health based on container's error flag
            if container.last_error is not None:
                just_disabled = _record_failure(effect_id)
                if just_disabled:
                    logger.warning(
                        "Effect %s auto-disabled after %d consecutive failures",
                        effect_id,
                        DISABLE_THRESHOLD,
                    )
            else:
                _record_success(effect_id)

        if elapsed_ms > EFFECT_ABORT_MS:
            logger.error(
                "Effect %s took %.0fms (>%dms abort threshold) on frame %d — "
                "returning input frame unchanged",
                effect_id,
                elapsed_ms,
                EFFECT_ABORT_MS,
                frame_index,
            )
            # Discard the slow output and return the pre-effect frame.
            return frame.copy(), states
        elif elapsed_ms > EFFECT_WARN_MS:
            logger.warning(
                "Effect %s took %.0fms (>%dms warn threshold) on frame %d",
                effect_id,
                elapsed_ms,
                EFFECT_WARN_MS,
                frame_index,
            )

        new_states[effect_id] = state_out

    # MK.3 per-chain wet/dry blend (universal wrapper). Applied once, after the
    # whole chain has run, against the dry input snapshot. Degenerate masks are
    # no-ops by construction: all-ones → output unchanged; all-zeros → dry
    # snapshot. Broadcast (H, W) → (H, W, 1) over RGBA. A shape mismatch here
    # (defensive — the resolver resizes to frame shape before this point) falls
    # back to the unblended output rather than crashing the frame.
    if chain_mask is not None and chain_dry_snapshot is not None:
        try:
            m = np.clip(chain_mask.astype(np.float32), 0.0, 1.0)
            if m.ndim == 2:
                m = m[:, :, np.newaxis]
            output = np.clip(
                chain_dry_snapshot.astype(np.float32) * (1.0 - m)
                + output.astype(np.float32) * m,
                0,
                255,
            ).astype(np.uint8)
        except Exception as e:
            logger.warning(
                "chain_mask blend failed (%s) — returning unblended chain output",
                type(e).__name__,
            )

    return output, new_states
