"""Latency under load (CTO R3) — synthetic background load + re-measure.

After the steady-state benchmark, spin up a synthetic CPU + memory load
for a fixed duration and re-measure interpolation latency. If jitter
degrades by >2× under load, the report flags
`measurement.interpolation.degradation_under_load = true`.

This is a coarse approximation of the real-world scenario where the user
has a 10-effect render chain consuming CPU + GPU + memory while L
inference runs. PR #5+ may replace the synthetic load with a real
entropic engine session for calibration.
"""

from __future__ import annotations

import os
import threading
import time
from dataclasses import dataclass

from .bench import BenchPlan, benchmark_loader

DEFAULT_LOAD_DURATION_S = 30.0
DEFAULT_LOAD_THREADS = 0  # 0 == auto (cpu_count - 1)
DEFAULT_MEMORY_PRESSURE_MB = 512


@dataclass(frozen=True)
class UnderLoadResult:
    baseline_p95_ms: float
    under_load_p95_ms: float
    degradation_ratio: float
    degradation_under_load: bool  # True when ratio > 2x
    duration_seconds: float
    threads: int
    memory_pressure_mb: int

    def to_dict(self) -> dict:
        return {
            "baseline_p95_ms": round(self.baseline_p95_ms, 4),
            "under_load_p95_ms": round(self.under_load_p95_ms, 4),
            "degradation_ratio": round(self.degradation_ratio, 3),
            "degradation_under_load": self.degradation_under_load,
            "duration_seconds": self.duration_seconds,
            "threads": self.threads,
            "memory_pressure_mb": self.memory_pressure_mb,
        }


def _cpu_burner(stop_event: threading.Event) -> None:
    """Tight Python loop that won't release GIL — simulates render-chain CPU work."""
    x = 0.0
    while not stop_event.is_set():
        # Mix of int + float ops to defeat constant-folding
        x = (x + 1.0) * 1.0000001
        if x > 1e9:
            x = 0.0


def _memory_pressure(stop_event: threading.Event, megabytes: int) -> None:
    """Allocate a chunk of RAM and touch it periodically so it stays resident."""
    pool = bytearray(megabytes * 1024 * 1024)
    i = 0
    while not stop_event.is_set():
        # Touch every 64KB page to keep working set hot
        for offset in range(0, len(pool), 64 * 1024):
            pool[offset] = (pool[offset] + 1) & 0xFF
        i += 1
        if i % 100 == 0:
            time.sleep(0.001)


def _resolve_thread_count(n_threads: int) -> int:
    if n_threads > 0:
        return n_threads
    cpu = os.cpu_count() or 4
    return max(1, cpu - 1)


def measure_under_load(
    plan: BenchPlan,
    *,
    duration_seconds: float = DEFAULT_LOAD_DURATION_S,
    threads: int = DEFAULT_LOAD_THREADS,
    memory_pressure_mb: int = DEFAULT_MEMORY_PRESSURE_MB,
) -> UnderLoadResult:
    """Run baseline benchmark, spin up load, re-run benchmark, report ratio."""
    resolved_threads = _resolve_thread_count(threads)

    baseline = benchmark_loader(plan)
    if baseline.error is not None:
        # Can't compute under-load if baseline itself fails.
        return UnderLoadResult(
            baseline_p95_ms=baseline.latency.p95_ms,
            under_load_p95_ms=0.0,
            degradation_ratio=0.0,
            degradation_under_load=False,
            duration_seconds=duration_seconds,
            threads=resolved_threads,
            memory_pressure_mb=memory_pressure_mb,
        )

    stop_event = threading.Event()
    load_threads = [
        threading.Thread(target=_cpu_burner, args=(stop_event,), daemon=True)
        for _ in range(resolved_threads)
    ]
    mem_thread = threading.Thread(
        target=_memory_pressure, args=(stop_event, memory_pressure_mb), daemon=True
    )

    for t in load_threads:
        t.start()
    mem_thread.start()

    # Let the load saturate, then re-measure.
    time.sleep(min(1.0, duration_seconds * 0.1))
    under_load = benchmark_loader(plan)

    stop_event.set()
    # We don't join the daemon threads — they'll be reaped on process exit
    # and joining could block longer than the user's patience if the GIL is
    # held by a cpu_burner. Stop event is enough.

    baseline_p95 = baseline.latency.p95_ms
    under_load_p95 = under_load.latency.p95_ms
    ratio = under_load_p95 / baseline_p95 if baseline_p95 > 0 else 0.0
    return UnderLoadResult(
        baseline_p95_ms=baseline_p95,
        under_load_p95_ms=under_load_p95,
        degradation_ratio=ratio,
        degradation_under_load=ratio > 2.0,
        duration_seconds=duration_seconds,
        threads=resolved_threads,
        memory_pressure_mb=memory_pressure_mb,
    )
