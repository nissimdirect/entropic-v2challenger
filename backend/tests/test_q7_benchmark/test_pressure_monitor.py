"""Tests for SG-8 pressure monitor + feature registry (PR #11).

Two layers:
  - Unit tests for FeatureRegistry: register / fire / state tracking
  - Integration test for PressureMonitor with a simulated pressure curve
    (0 → 100% → 0%) — the closest in-process app-validation we can do
    for SG-8 short of an actual OOM scenario.

Per [[feedback_sdlc-verify-in-app-not-just-code]]: the integration test
simulates the WHOLE pressure curve and asserts ALL canonical stages
fire in order + restore in reverse. That's the SDLC-validated outcome.
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

import pytest

BACKEND_SRC = Path(__file__).resolve().parents[2] / "src"
if str(BACKEND_SRC) not in sys.path:
    sys.path.insert(0, str(BACKEND_SRC))

from safety.pressure.degrade_order import CANONICAL_DEGRADE_ORDER
from safety.pressure.monitor import PressureMonitor
from safety.pressure.registry import (
    FeatureRegistry,
    global_registry,
    reset_global_registry_for_testing,
)


# ---------------------------------------------------------------------------
# FeatureRegistry unit tests
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _reset_global():
    """Each test gets a fresh global registry."""
    reset_global_registry_for_testing()
    yield
    reset_global_registry_for_testing()


@pytest.mark.smoke
def test_registry_empty_initially():
    r = FeatureRegistry()
    assert r.total_registrations() == 0
    assert r.active_stages() == frozenset()


@pytest.mark.smoke
def test_register_increments_count():
    r = FeatureRegistry()
    r.register(
        "d4_latent_grain_pool",
        degrade=lambda: None,
        restore=lambda: None,
        label="d4_test",
    )
    assert r.total_registrations() == 1
    assert r.stage_count("d4_latent_grain_pool") == 1


@pytest.mark.smoke
def test_register_multiple_on_same_stage():
    r = FeatureRegistry()
    r.register("clap_unloaded", degrade=lambda: None, restore=lambda: None, label="a")
    r.register("clap_unloaded", degrade=lambda: None, restore=lambda: None, label="b")
    assert r.stage_count("clap_unloaded") == 2


@pytest.mark.smoke
def test_fire_degrade_invokes_callback():
    fired_flags = []
    r = FeatureRegistry()
    r.register(
        "d4_latent_grain_pool",
        degrade=lambda: fired_flags.append("degrade"),
        restore=lambda: fired_flags.append("restore"),
        label="t",
    )
    fired_count = r.fire_degrade("d4_latent_grain_pool")
    assert fired_count == 1
    assert fired_flags == ["degrade"]
    assert r.is_degraded("d4_latent_grain_pool")


@pytest.mark.smoke
def test_fire_degrade_is_idempotent():
    fired_flags = []
    r = FeatureRegistry()
    r.register(
        "d4_latent_grain_pool",
        degrade=lambda: fired_flags.append("degrade"),
        restore=lambda: fired_flags.append("restore"),
        label="t",
    )
    r.fire_degrade("d4_latent_grain_pool")
    second_fire = r.fire_degrade("d4_latent_grain_pool")
    assert second_fire == 0  # idempotent — already degraded
    assert fired_flags == ["degrade"]  # not called twice


@pytest.mark.smoke
def test_fire_restore_only_when_degraded():
    fired_flags = []
    r = FeatureRegistry()
    r.register(
        "d4_latent_grain_pool",
        degrade=lambda: fired_flags.append("degrade"),
        restore=lambda: fired_flags.append("restore"),
        label="t",
    )
    # Restore without degrade first
    no_fire = r.fire_restore("d4_latent_grain_pool")
    assert no_fire == 0
    assert fired_flags == []  # nothing called

    # Now degrade then restore
    r.fire_degrade("d4_latent_grain_pool")
    fired = r.fire_restore("d4_latent_grain_pool")
    assert fired == 1
    assert fired_flags == ["degrade", "restore"]
    assert not r.is_degraded("d4_latent_grain_pool")


@pytest.mark.smoke
def test_fire_degrade_swallows_callback_exception():
    """Buggy degrade callback must not crash the monitor or other callbacks."""
    fired_flags = []

    def bad_callback():
        raise RuntimeError("simulated buggy callback")

    r = FeatureRegistry()
    r.register(
        "d4_latent_grain_pool", degrade=bad_callback, restore=lambda: None, label="bad"
    )
    r.register(
        "d4_latent_grain_pool",
        degrade=lambda: fired_flags.append("good"),
        restore=lambda: None,
        label="good",
    )
    fired = r.fire_degrade("d4_latent_grain_pool")
    # 1 succeeded (the good one); the bad one logged but didn't count
    assert fired == 1
    assert "good" in fired_flags


@pytest.mark.smoke
def test_unregister():
    r = FeatureRegistry()
    r.register(
        "d4_latent_grain_pool", degrade=lambda: None, restore=lambda: None, label="a"
    )
    r.register(
        "d4_latent_grain_pool", degrade=lambda: None, restore=lambda: None, label="b"
    )
    assert r.stage_count("d4_latent_grain_pool") == 2
    removed = r.unregister("d4_latent_grain_pool", label="a")
    assert removed is True
    assert r.stage_count("d4_latent_grain_pool") == 1


@pytest.mark.smoke
def test_global_registry_singleton():
    r1 = global_registry()
    r2 = global_registry()
    assert r1 is r2


# ---------------------------------------------------------------------------
# PressureMonitor — single-tick unit tests
# ---------------------------------------------------------------------------


@pytest.mark.smoke
def test_monitor_tick_no_fire_at_low_pressure():
    r = FeatureRegistry()
    monitor = PressureMonitor(
        pressure_fn=lambda: 50.0, registry=r, poll_interval_s=0.01
    )
    result = monitor.tick_once()
    assert result["pressure_pct"] == 50.0
    assert result["degrade"] is None
    assert result["restore"] is None


@pytest.mark.smoke
def test_monitor_tick_fires_first_stage_at_75_pct():
    fired = []
    r = FeatureRegistry()
    r.register(
        "d4_latent_grain_pool",
        degrade=lambda: fired.append("d4_degrade"),
        restore=lambda: fired.append("d4_restore"),
        label="t",
    )
    monitor = PressureMonitor(pressure_fn=lambda: 75.0, registry=r)
    result = monitor.tick_once()
    assert result["degrade"]["stage"] == "d4_latent_grain_pool"
    assert "d4_degrade" in fired


@pytest.mark.smoke
def test_monitor_tick_restores_when_pressure_drops_below_restore_threshold():
    fired = []
    r = FeatureRegistry()
    r.register(
        "d4_latent_grain_pool",
        degrade=lambda: fired.append("degrade"),
        restore=lambda: fired.append("restore"),
        label="t",
    )
    # Climb to degrade
    monitor = PressureMonitor(pressure_fn=lambda: 75.0, registry=r)
    monitor.tick_once()
    assert r.is_degraded("d4_latent_grain_pool")

    # Drop below 65 (the restore threshold) — should fire restore
    monitor._pressure_fn = lambda: 60.0
    result = monitor.tick_once()
    assert result["restore"] is not None
    assert result["restore"]["stage"] == "d4_latent_grain_pool"
    assert not r.is_degraded("d4_latent_grain_pool")


# ---------------------------------------------------------------------------
# PressureMonitor — INTEGRATION: full pressure-curve simulation
# (App-validation per [[feedback_sdlc-verify-in-app-not-just-code]])
# ---------------------------------------------------------------------------


@pytest.mark.smoke
def test_monitor_full_pressure_curve_fires_all_stages_in_order():
    """Simulate pressure ramping 0 → 100 → 0 and assert ALL stages fire
    + restore in canonical order. This is the SDLC-validated SG-8 behavior."""
    r = FeatureRegistry()
    fire_log: list[tuple[str, str]] = []  # [(action, stage_name)]

    # Register a feature against every canonical stage
    for stage in CANONICAL_DEGRADE_ORDER:
        # closure over stage.name
        stage_name = stage.name
        r.register(
            stage_name,
            degrade=lambda n=stage_name: fire_log.append(("degrade", n)),
            restore=lambda n=stage_name: fire_log.append(("restore", n)),
            label=stage_name,
        )

    monitor = PressureMonitor(pressure_fn=lambda: 0.0, registry=r)

    # Ramp pressure up in 1% steps
    for pct in range(0, 101, 1):
        monitor._pressure_fn = lambda p=float(pct): p
        monitor.tick_once()

    # All 10 stages should be degraded at 100%
    degrade_events = [s for (a, s) in fire_log if a == "degrade"]
    assert len(degrade_events) == len(CANONICAL_DEGRADE_ORDER), (
        f"expected {len(CANONICAL_DEGRADE_ORDER)} degrade events, got {len(degrade_events)}"
    )
    # Order must match canonical order
    expected = [s.name for s in CANONICAL_DEGRADE_ORDER]
    assert degrade_events == expected

    # Ramp pressure back down to 0
    for pct in range(100, -1, -1):
        monitor._pressure_fn = lambda p=float(pct): p
        monitor.tick_once()

    # All 10 stages should have restored, in REVERSE order
    restore_events = [s for (a, s) in fire_log if a == "restore"]
    assert len(restore_events) == len(CANONICAL_DEGRADE_ORDER), (
        f"expected {len(CANONICAL_DEGRADE_ORDER)} restore events, got {len(restore_events)}"
    )
    assert restore_events == list(reversed(expected))

    # And the registry is back to clean
    assert r.active_stages() == frozenset()


@pytest.mark.smoke
def test_monitor_background_thread_lifecycle():
    """Start the actual background thread + verify start/stop work."""
    r = FeatureRegistry()
    monitor = PressureMonitor(
        pressure_fn=lambda: 30.0, registry=r, poll_interval_s=0.05
    )
    assert not monitor.is_running()
    monitor.start()
    assert monitor.is_running()
    time.sleep(0.15)  # allow a couple of ticks
    stats = monitor.stats()
    assert stats.poll_count >= 2
    monitor.stop(timeout_s=2.0)
    assert not monitor.is_running()


@pytest.mark.smoke
def test_monitor_start_twice_is_idempotent():
    r = FeatureRegistry()
    monitor = PressureMonitor(
        pressure_fn=lambda: 30.0, registry=r, poll_interval_s=0.05
    )
    monitor.start()
    thread1 = monitor._thread
    monitor.start()  # again
    thread2 = monitor._thread
    assert thread1 is thread2  # same thread; not double-started
    monitor.stop()


@pytest.mark.smoke
def test_monitor_history_bounded():
    """Fire history doesn't grow without bound."""
    r = FeatureRegistry()
    for stage in CANONICAL_DEGRADE_ORDER:
        r.register(
            stage.name,
            degrade=lambda: None,
            restore=lambda: None,
            label=stage.name,
        )
    monitor = PressureMonitor(pressure_fn=lambda: 0.0, registry=r, history_limit=5)
    # Cycle 10x to overflow the 5-entry history
    for _ in range(10):
        monitor._pressure_fn = lambda: 100.0
        monitor.tick_once()
        monitor._pressure_fn = lambda: 0.0
        # Drain restores
        for _ in range(len(CANONICAL_DEGRADE_ORDER)):
            monitor.tick_once()
    stats = monitor.stats()
    assert len(stats.fire_history) <= 5
