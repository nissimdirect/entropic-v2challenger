"""Feature registry for SG-8 pressure-degrade callbacks (DEC-Q7-010).

Every Q7-tier feature that may need to be degraded under memory pressure
registers a pair of callbacks:

  - `degrade()` — release the feature's hot state (caches, model weights,
    cached embeddings). MUST be idempotent + safe to call from a background
    thread.
  - `restore()` — re-establish the feature when pressure has subsided.
    May be slow (re-download, re-decode); the monitor expects this.

The monitor loop (monitor.py) consults the canonical degrade order
(degrade_order.CANONICAL_DEGRADE_ORDER) + the registry to decide which
callback to fire next.

Per [[feedback_sdlc-verify-in-app-not-just-code]]: registry behavior is
tested at the Python API level here. The full SG-8 monitor loop is
exercised in test_monitor.py with a simulated pressure curve — that's
the closest we can get to app-validation without a real OOM scenario.
"""

from __future__ import annotations

import logging
import threading
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class FeatureCallbacks:
    """The pair of callbacks a feature registers."""

    degrade: Callable[[], None]
    restore: Callable[[], None]
    # Optional human-readable label for logging + telemetry
    label: str = ""


@dataclass
class RegistryState:
    """Tracks which features are currently in DEGRADED state."""

    active_degrade_stages: frozenset[str] = field(default_factory=frozenset)
    last_degrade_at: dict[str, float] = field(default_factory=dict)
    last_restore_at: dict[str, float] = field(default_factory=dict)


class FeatureRegistry:
    """Thread-safe registry of degrade/restore callbacks per stage name.

    Stages are the names defined in `degrade_order.CANONICAL_DEGRADE_ORDER`
    (e.g., 'd4_latent_grain_pool', 'clap_unloaded'). Each stage may have
    zero, one, or many features registered against it; the monitor fires
    all of them together when the stage threshold is crossed.
    """

    def __init__(self) -> None:
        self._features: dict[str, list[FeatureCallbacks]] = {}
        self._state = RegistryState()
        self._lock = threading.RLock()

    def register(
        self,
        stage_name: str,
        degrade: Callable[[], None],
        restore: Callable[[], None],
        *,
        label: str = "",
    ) -> None:
        """Register a feature against a degrade stage name.

        Multiple features may register against the same stage; all fire
        when the stage is triggered (e.g., 'd4_latent_grain_pool' might
        have separate registrations from the grain pool itself AND from
        any UI component caching D4 thumbnails).
        """
        with self._lock:
            callbacks = FeatureCallbacks(degrade=degrade, restore=restore, label=label)
            self._features.setdefault(stage_name, []).append(callbacks)

    def unregister(self, stage_name: str, label: str) -> bool:
        """Remove a registration by label. Returns True if found + removed."""
        with self._lock:
            if stage_name not in self._features:
                return False
            before = len(self._features[stage_name])
            self._features[stage_name] = [
                cb for cb in self._features[stage_name] if cb.label != label
            ]
            after = len(self._features[stage_name])
            if not self._features[stage_name]:
                del self._features[stage_name]
            return before != after

    def fire_degrade(self, stage_name: str) -> int:
        """Invoke all degrade callbacks registered against `stage_name`.

        Returns the number of callbacks fired. Idempotent: firing twice on
        an already-degraded stage is a no-op (the registry tracks state).
        """
        import time

        with self._lock:
            if stage_name in self._state.active_degrade_stages:
                return 0  # already degraded; idempotent
            callbacks = list(self._features.get(stage_name, []))
            self._state.active_degrade_stages = self._state.active_degrade_stages | {
                stage_name
            }
            self._state.last_degrade_at[stage_name] = time.time()

        # Fire OUTSIDE the lock so callbacks can take their own time
        # (e.g., wait on a GPU fence) without blocking other monitor
        # operations.
        fired = 0
        for cb in callbacks:
            try:
                cb.degrade()
                fired += 1
            except Exception:  # noqa: BLE001
                logger.exception(
                    "SG-8 degrade callback raised for stage=%s label=%s",
                    stage_name,
                    cb.label,
                )
        return fired

    def fire_restore(self, stage_name: str) -> int:
        """Invoke all restore callbacks registered against `stage_name`.

        Returns the number of callbacks fired. Idempotent.
        """
        import time

        with self._lock:
            if stage_name not in self._state.active_degrade_stages:
                return 0  # not currently degraded; nothing to restore
            callbacks = list(self._features.get(stage_name, []))
            self._state.active_degrade_stages = self._state.active_degrade_stages - {
                stage_name
            }
            self._state.last_restore_at[stage_name] = time.time()

        fired = 0
        for cb in callbacks:
            try:
                cb.restore()
                fired += 1
            except Exception:  # noqa: BLE001
                logger.exception(
                    "SG-8 restore callback raised for stage=%s label=%s",
                    stage_name,
                    cb.label,
                )
        return fired

    def active_stages(self) -> frozenset[str]:
        """Snapshot of currently-degraded stage names."""
        with self._lock:
            return self._state.active_degrade_stages

    def is_degraded(self, stage_name: str) -> bool:
        with self._lock:
            return stage_name in self._state.active_degrade_stages

    def stage_count(self, stage_name: str) -> int:
        """Number of features registered against a stage."""
        with self._lock:
            return len(self._features.get(stage_name, []))

    def total_registrations(self) -> int:
        """Total registration count across all stages."""
        with self._lock:
            return sum(len(v) for v in self._features.values())


# Module-level singleton — features import this directly.
_GLOBAL_REGISTRY: Optional[FeatureRegistry] = None


def global_registry() -> FeatureRegistry:
    """Return the process-wide registry. Lazy-initialized."""
    global _GLOBAL_REGISTRY
    if _GLOBAL_REGISTRY is None:
        _GLOBAL_REGISTRY = FeatureRegistry()
    return _GLOBAL_REGISTRY


def reset_global_registry_for_testing() -> None:
    """Drop the global registry. ONLY for tests."""
    global _GLOBAL_REGISTRY
    _GLOBAL_REGISTRY = None
