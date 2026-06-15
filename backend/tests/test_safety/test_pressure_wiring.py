"""P5b.1 — SG-8 backend live-wiring tests.

Verifies that the SG-8 PressureMonitor + FeatureRegistry are actually wired
into the ZMQ sidecar:

  - the monitor thread starts with the sidecar (run()) and stops on close()
  - the new `pressure_status` REQ/REP handler returns the agreed shape
    {level, current_pct, degraded_features[]} within one REQ/REP cycle
  - every numeric crossing the IPC boundary is finite + clamped
  - degrade callbacks fire from monitor threshold crossings, and recovery
    restores in REVERSE order
  - chaos/state negative: calling startup twice leaks ZERO extra threads

Per [[feedback_numeric-trust-boundary]]: the `pressure_status` numerics
(level/current_pct/degraded_features) cross IPC into the frontend, so the
handler test asserts they survive NaN/Inf/None injection without escaping.

Per the harness Gate "Thread hygiene": double-start must not leak a thread —
`test_double_start_is_idempotent_no_second_thread` asserts the active-thread
count is unchanged after a second start().
"""

from __future__ import annotations

import math
import sys
import threading
import time
from pathlib import Path

import pytest

BACKEND_SRC = Path(__file__).resolve().parents[2] / "src"
if str(BACKEND_SRC) not in sys.path:
    sys.path.insert(0, str(BACKEND_SRC))

from safety.pressure.degrade_order import CANONICAL_DEGRADE_ORDER  # noqa: E402
from safety.pressure.monitor import PressureMonitor  # noqa: E402
from safety.pressure.registry import (  # noqa: E402
    global_registry,
    reset_global_registry_for_testing,
)
from zmq_server import ZMQServer  # noqa: E402


@pytest.fixture(autouse=True)
def _reset_global():
    """Each test gets a fresh process-wide registry (mirrors the lib tests)."""
    reset_global_registry_for_testing()
    yield
    reset_global_registry_for_testing()


@pytest.fixture
def server():
    """A ZMQServer constructed but NOT run(). close() tears down sockets +
    stops the pressure monitor. Constructing must not spawn a thread."""
    srv = ZMQServer()
    try:
        yield srv
    finally:
        srv.close()


# ---------------------------------------------------------------------------
# Lifecycle: started with the sidecar, stopped on shutdown
# ---------------------------------------------------------------------------


@pytest.mark.smoke
def test_monitor_started_with_sidecar():
    """run() starts the monitor thread; merely constructing does NOT."""
    srv = ZMQServer()
    # Construction is cheap — no thread spawned yet (so tests that build a
    # server without run() don't leak a background thread).
    assert srv.pressure_monitor.is_running() is False

    # Boot the real server loop in a background thread (conftest pattern).
    t = threading.Thread(target=srv.run, daemon=True)
    t.start()
    try:
        # The monitor should be running once run() has started it.
        deadline = time.monotonic() + 2.0
        while time.monotonic() < deadline and not srv.pressure_monitor.is_running():
            time.sleep(0.02)
        assert srv.pressure_monitor.is_running() is True
    finally:
        srv.running = False  # break the run() loop → run() calls close()
        t.join(timeout=3.0)
    # After clean shutdown the monitor thread is gone.
    assert srv.pressure_monitor.is_running() is False


@pytest.mark.smoke
def test_monitor_stopped_on_shutdown(server):
    """close() stops the monitor thread (no leaked thread)."""
    server.pressure_monitor.start()
    assert server.pressure_monitor.is_running() is True
    server.close()
    assert server.pressure_monitor.is_running() is False
    # Idempotent: a second close()/stop() is safe.
    server.pressure_monitor.stop()
    assert server.pressure_monitor.is_running() is False


# ---------------------------------------------------------------------------
# pressure_status handler — shape, latency, trust-boundary numerics
# ---------------------------------------------------------------------------


@pytest.mark.smoke
def test_pressure_status_handler_shape(server):
    """Handler returns {level, current_pct, degraded_features[]} in <50ms."""
    t0 = time.monotonic()
    resp = server._handle_pressure_status("msg-1")
    elapsed_ms = (time.monotonic() - t0) * 1000

    assert resp["id"] == "msg-1"
    assert resp["ok"] is True
    assert resp["level"] in {"ok", "warn", "auto_disable", "emergency"}
    assert isinstance(resp["current_pct"], (int, float))
    assert isinstance(resp["degraded_features"], list)
    # ACCEPTANCE GATE: returns within one REQ/REP cycle (<50ms wall-clock).
    assert elapsed_ms < 50.0, f"pressure_status took {elapsed_ms:.1f}ms (>=50ms)"


@pytest.mark.smoke
def test_pressure_status_level_bands(server):
    """level maps from current_pct per SPEC-3 §5.2 bands."""
    cases = [
        (0.0, "ok"),
        (59.9, "ok"),
        (60.0, "warn"),
        (74.9, "warn"),
        (75.0, "auto_disable"),
        (89.9, "auto_disable"),
        (90.0, "emergency"),
        (100.0, "emergency"),
    ]
    for pct, expected_level in cases:
        server.pressure_monitor._stats.last_pressure_pct = pct
        resp = server._handle_pressure_status("m")
        assert resp["level"] == expected_level, f"{pct}% -> {resp['level']}"
        assert resp["current_pct"] == round(pct, 1)


@pytest.mark.smoke
def test_pressure_status_values_finite_and_clamped(server):
    """Every numeric crossing IPC is finite + clamped to [0, 100].

    Inject NaN / +Inf / -Inf / None / a string into the monitor's last
    reading; the handler must never let a non-finite or out-of-range value
    escape to the frontend.
    """
    for bad in (float("nan"), float("inf"), float("-inf"), None, "boom", -25.0, 250.0):
        server.pressure_monitor._stats.last_pressure_pct = bad
        resp = server._handle_pressure_status("m")
        pct = resp["current_pct"]
        assert isinstance(pct, (int, float))
        assert math.isfinite(pct), f"non-finite pct escaped for input {bad!r}"
        assert 0.0 <= pct <= 100.0, f"unclamped pct {pct} for input {bad!r}"
        assert resp["level"] in {"ok", "warn", "auto_disable", "emergency"}


# ---------------------------------------------------------------------------
# Degrade callbacks fire from threshold crossings; recovery in reverse order
# ---------------------------------------------------------------------------


@pytest.mark.smoke
def test_degrade_callback_fires_at_threshold():
    """A feature registered against stage 1 degrades when the monitor's
    pressure fn (the `_default_pressure_fn` seam) crosses the threshold."""
    fired: list[str] = []
    registry = global_registry()
    stage = CANONICAL_DEGRADE_ORDER[0]  # d4_latent_grain_pool @ 75%
    registry.register(
        stage.name,
        degrade=lambda: fired.append("degrade"),
        restore=lambda: fired.append("restore"),
        label="wiring_test",
    )
    # Mock the pressure seam to read above the stage-1 threshold.
    monitor = PressureMonitor(
        pressure_fn=lambda: stage.threshold_pct, registry=registry
    )
    result = monitor.tick_once()

    assert result["degrade"] is not None
    assert result["degrade"]["stage"] == stage.name
    assert fired == ["degrade"]
    assert registry.is_degraded(stage.name)


@pytest.mark.smoke
def test_recovery_restores_in_reverse_order():
    """Ramp pressure 0->100->0 over the global registry; all stages degrade in
    canonical order then restore in REVERSE order (SPEC-3 §5.2 Part C)."""
    registry = global_registry()
    fire_log: list[tuple[str, str]] = []
    for stage in CANONICAL_DEGRADE_ORDER:
        name = stage.name
        registry.register(
            name,
            degrade=lambda n=name: fire_log.append(("degrade", n)),
            restore=lambda n=name: fire_log.append(("restore", n)),
            label=name,
        )

    monitor = PressureMonitor(pressure_fn=lambda: 0.0, registry=registry)
    for pct in range(0, 101):
        monitor._pressure_fn = lambda p=float(pct): p
        monitor.tick_once()
    degrade_order = [s for (a, s) in fire_log if a == "degrade"]
    assert degrade_order == [s.name for s in CANONICAL_DEGRADE_ORDER]

    for pct in range(100, -1, -1):
        monitor._pressure_fn = lambda p=float(pct): p
        monitor.tick_once()
    restore_order = [s for (a, s) in fire_log if a == "restore"]
    assert restore_order == list(reversed([s.name for s in CANONICAL_DEGRADE_ORDER]))
    assert registry.active_stages() == frozenset()


# ---------------------------------------------------------------------------
# Chaos / state negative: double-start leaks ZERO extra threads
# ---------------------------------------------------------------------------


@pytest.mark.smoke
def test_double_start_is_idempotent_no_second_thread(server):
    """Calling start() twice must not spawn a second monitor thread.

    Asserts BOTH that the thread identity is unchanged across the double-start
    AND that the live `sg8-monitor` thread count does NOT INCREASE — a leaked
    thread would bump the count by one.

    The assertion is a DELTA (count after second start == count after first),
    not an absolute "== 1": the xdist session-fixture sidecar
    (`_zmq_server_session` in conftest) keeps its own running monitor alive
    for the whole worker session, so other `sg8-monitor` threads may legally
    coexist in this process. The invariant we own is "MY second start spawns
    nothing new," which the delta captures exactly.
    """

    def _sg8_thread_count() -> int:
        return sum(
            1 for t in threading.enumerate() if t.name == "sg8-monitor" and t.is_alive()
        )

    # My monitor isn't running yet (fixture constructs but never start()s it).
    assert server.pressure_monitor.is_running() is False

    server.pressure_monitor.start()
    first_thread = server.pressure_monitor._thread
    assert server.pressure_monitor.is_running() is True
    count_after_first = _sg8_thread_count()

    server.pressure_monitor.start()  # double start — must be a no-op
    second_thread = server.pressure_monitor._thread
    count_after_second = _sg8_thread_count()

    # Same thread object — not re-spawned.
    assert first_thread is second_thread
    # ZERO extra threads leaked by the second start (delta is robust to the
    # session-fixture's own coexisting sg8-monitor thread).
    assert count_after_second == count_after_first, (
        f"double start() leaked a thread: {count_after_first} -> {count_after_second}"
    )

    # My monitor's own thread tears down cleanly (the core leak-free check).
    server.pressure_monitor.stop()
    assert server.pressure_monitor.is_running() is False
    assert server.pressure_monitor._thread is None


# ---------------------------------------------------------------------------
# SG-8 stop() thread-lifecycle correctness (audit bug #8)
# ---------------------------------------------------------------------------


def test_stop_nulls_thread_on_clean_exit():
    """After a normal stop() the thread exits cleanly and _thread is nulled.

    Verifies the happy-path branch of the audit fix: when join() returns and
    the thread is confirmed dead, _thread must be set to None so is_running()
    reports False and callers can rely on the sentinel.
    """
    monitor = PressureMonitor(
        pressure_fn=lambda: 0.0,
        poll_interval_s=0.05,
    )
    monitor.start()
    assert monitor.is_running() is True
    monitor.stop(timeout_s=3.0)
    assert monitor._thread is None, "_thread must be None after clean stop()"
    assert monitor.is_running() is False


def test_stop_keeps_thread_ref_if_join_times_out(monkeypatch, caplog):
    """If join() times out (thread still alive), _thread must NOT be nulled.

    Monkeypatches ``threading.Thread.join`` on the monitor's thread instance
    so it returns immediately without actually joining (simulating a blocked
    tick). Confirms:
      - _thread is NOT None after stop() times out
      - is_running() still returns True (reference kept, thread alive)
      - A WARNING is emitted naming the unresponsive thread
    """
    import logging

    monitor = PressureMonitor(
        pressure_fn=lambda: 0.0,
        poll_interval_s=100.0,  # very long interval so the thread blocks
    )
    monitor.start()
    assert monitor.is_running() is True

    thread_ref = monitor._thread

    # Monkeypatch join on the thread instance to be a no-op (timeout fires immediately).
    def _noop_join(timeout=None):
        pass  # return without actually joining — thread stays alive

    thread_ref.join = _noop_join  # type: ignore[method-assign]

    with caplog.at_level(logging.WARNING, logger="safety.pressure.monitor"):
        monitor.stop(timeout_s=0.01)

    # Thread must NOT be orphaned: reference is kept so callers detect the stall.
    assert monitor._thread is not None, (
        "stop() must keep _thread reference when join times out (thread still alive)"
    )
    assert monitor._thread is thread_ref

    # A structured warning must have been logged.
    assert any("did not stop" in r.message for r in caplog.records), (
        f"Expected 'did not stop' warning; got: {[r.message for r in caplog.records]}"
    )

    # Cleanup: release the real thread by restoring a real join so it can exit.
    import threading as _threading

    original_join = _threading.Thread.join
    thread_ref.join = lambda timeout=None: original_join(thread_ref, timeout=timeout)  # type: ignore[method-assign]
    monitor._stop_event.set()
    thread_ref.join(timeout=3.0)
    # Manually null to avoid teardown noise (the test's point is already proven).
    monitor._thread = None
