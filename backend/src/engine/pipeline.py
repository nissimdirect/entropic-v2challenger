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
from engine.container import EffectContainer

logger = logging.getLogger(__name__)

# SEC-7: Maximum effects in a single chain
MAX_CHAIN_DEPTH = 10

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

    Returns:
        Tuple of (output_frame, new_states).

    Raises:
        ValueError: If chain exceeds MAX_CHAIN_DEPTH or contains unknown effects.
    """
    if len(chain) > MAX_CHAIN_DEPTH:
        raise ValueError(
            f"Chain depth {len(chain)} exceeds maximum {MAX_CHAIN_DEPTH} (SEC-7)"
        )

    if states is None:
        states = {}

    output = frame
    new_states: dict[str, dict | None] = {}

    for i, effect_instance in enumerate(chain):
        # Skip disabled effects
        if not effect_instance.get("enabled", True):
            continue

        effect_id = effect_instance.get("effect_id")
        params = dict(effect_instance.get("params", {}))

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

        # Inject top-level mix into params as _mix for EffectContainer
        if "mix" in effect_instance:
            params["_mix"] = effect_instance["mix"]

        effect_info = registry.get(effect_id)
        if effect_info is None:
            raise ValueError(f"unknown effect: {effect_id}")

        container = EffectContainer(effect_info["fn"], effect_id)
        state_in = states.get(effect_id)

        t0 = time.monotonic()

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

    return output, new_states
