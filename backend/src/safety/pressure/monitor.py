"""SG-8 live pressure monitor (DEC-Q7-010 + DEC-Q7-011).

Polls `pressure_percent()` on a background thread; when the value crosses
a stage threshold, fires that stage's degrade callbacks (via the registry).
When pressure drops below a stage's restore threshold (10pp hysteresis),
fires restore.

Single instance per process; starts/stops via `start()` / `stop()`. The
monitor is HEADLESS — it doesn't touch UI. Frontend gets notified via
the existing toast / ZMQ event system (out of scope for this module).

Per [[feedback_sdlc-verify-in-app-not-just-code]]: this is tested with a
simulated pressure curve in test_monitor.py — we override the
pressure-percent function to ramp 0 → 100 → 0 and assert that all stages
fire in canonical order then restore in reverse. The real OOM scenario
isn't testable in CI, but the controlled simulation is the closest
honest validation.
"""

from __future__ import annotations

import logging
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, field

from .degrade_order import (
    CANONICAL_DEGRADE_ORDER,
    next_stage_to_fire,
    stages_to_restore,
)
from .registry import FeatureRegistry, global_registry

logger = logging.getLogger(__name__)

DEFAULT_POLL_INTERVAL_S = 1.0


@dataclass
class MonitorStats:
    """Telemetry for the monitor loop."""

    poll_count: int = 0
    degrade_fires: int = 0
    restore_fires: int = 0
    last_pressure_pct: float = 0.0
    last_poll_at: float | None = None
    started_at: float | None = None
    fire_history: list[dict] = field(default_factory=list)  # [{stage, action, at}]


class PressureMonitor:
    """Background-thread monitor that consults pressure + fires degrade callbacks."""

    def __init__(
        self,
        *,
        pressure_fn: Callable[[], float] | None = None,
        poll_interval_s: float = DEFAULT_POLL_INTERVAL_S,
        registry: FeatureRegistry | None = None,
        history_limit: int = 100,
    ) -> None:
        self._pressure_fn = pressure_fn or _default_pressure_fn
        self._poll_interval_s = poll_interval_s
        self._registry = registry or global_registry()
        self._history_limit = history_limit

        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None
        self._stats = MonitorStats()
        self._lock = threading.RLock()

    def start(self) -> None:
        """Start the background monitor thread. Idempotent."""
        if self._thread is not None and self._thread.is_alive():
            return
        self._stop_event.clear()
        self._stats.started_at = time.time()
        self._thread = threading.Thread(
            target=self._run, name="sg8-monitor", daemon=True
        )
        self._thread.start()

    def stop(self, timeout_s: float = 5.0) -> None:
        """Signal stop + join. Safe to call multiple times.

        Only nulls ``_thread`` when the join confirms the thread has actually
        exited.  If the join times out (thread still alive), the reference is
        kept so callers can detect the orphan via ``is_running()``; a warning
        is logged and the stop-event remains set so the thread will exit on its
        next poll tick.
        """
        self._stop_event.set()
        if self._thread is not None:
            self._thread.join(timeout=timeout_s)
            if not self._thread.is_alive():
                self._thread = None
            else:
                logger.warning(
                    "SG-8 monitor thread did not stop within %.1fs — "
                    "thread reference kept; thread will exit on next tick",
                    timeout_s,
                )

    def is_running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    def stats(self) -> MonitorStats:
        with self._lock:
            return MonitorStats(
                poll_count=self._stats.poll_count,
                degrade_fires=self._stats.degrade_fires,
                restore_fires=self._stats.restore_fires,
                last_pressure_pct=self._stats.last_pressure_pct,
                last_poll_at=self._stats.last_poll_at,
                started_at=self._stats.started_at,
                fire_history=list(self._stats.fire_history),
            )

    def tick_once(self) -> dict:
        """Single poll + fire pass. Returns a summary dict.

        Exposed for tests so we don't need to start the background thread.
        """
        pct = float(self._pressure_fn())
        with self._lock:
            self._stats.poll_count += 1
            self._stats.last_pressure_pct = pct
            self._stats.last_poll_at = time.time()
        return self._evaluate_and_fire(pct)

    def _run(self) -> None:
        """Background loop. Polls every `poll_interval_s` until stop()."""
        while not self._stop_event.is_set():
            try:
                pct = float(self._pressure_fn())
                with self._lock:
                    self._stats.poll_count += 1
                    self._stats.last_pressure_pct = pct
                    self._stats.last_poll_at = time.time()
                self._evaluate_and_fire(pct)
            except Exception:  # noqa: BLE001
                logger.exception("SG-8 monitor tick failed")
            # Wait for next interval OR stop
            self._stop_event.wait(timeout=self._poll_interval_s)

    def _evaluate_and_fire(self, current_pct: float) -> dict:
        """Decide which degrade or restore to fire next; execute it.

        Fires AT MOST ONE stage per tick (degrade) and AT MOST ONE per
        tick (restore). Limits cascade speed so we don't drop everything
        at once during a spike.
        """
        active = self._registry.active_stages()
        result: dict = {"pressure_pct": current_pct, "degrade": None, "restore": None}

        # Restore first (give features a chance to come back before adding more pressure).
        # When multiple stages share a restore threshold (e.g., stages 1, 2, 3 all at 65%),
        # restore in REVERSE canonical order (LIFO — most-recently-degraded restores first).
        restorable = stages_to_restore(active, current_pct)
        if restorable:
            stage = restorable[-1]
            fired = self._registry.fire_restore(stage.name)
            self._record_history(stage.name, "restore", current_pct)
            with self._lock:
                self._stats.restore_fires += 1
            result["restore"] = {"stage": stage.name, "callbacks_fired": fired}
            logger.info(
                "SG-8 restore: stage=%s callbacks_fired=%d pressure=%.1f%%",
                stage.name,
                fired,
                current_pct,
            )
            return result

        # Otherwise, degrade if there's a next-stage-to-fire
        next_stage = next_stage_to_fire(active, current_pct)
        if next_stage is not None:
            fired = self._registry.fire_degrade(next_stage.name)
            self._record_history(next_stage.name, "degrade", current_pct)
            with self._lock:
                self._stats.degrade_fires += 1
            result["degrade"] = {"stage": next_stage.name, "callbacks_fired": fired}
            logger.info(
                "SG-8 degrade: stage=%s callbacks_fired=%d pressure=%.1f%% blast_radius=%s",
                next_stage.name,
                fired,
                current_pct,
                next_stage.blast_radius,
            )

        return result

    def _record_history(self, stage: str, action: str, pct: float) -> None:
        with self._lock:
            self._stats.fire_history.append(
                {
                    "stage": stage,
                    "action": action,
                    "pressure_pct": pct,
                    "at": time.time(),
                }
            )
            # Bound history to last N entries
            if len(self._stats.fire_history) > self._history_limit:
                self._stats.fire_history = self._stats.fire_history[
                    -self._history_limit :
                ]


def _default_pressure_fn() -> float:
    """Lazy-import-friendly default. Avoids circular imports at module load."""
    from .budget import pressure_percent

    return pressure_percent()
