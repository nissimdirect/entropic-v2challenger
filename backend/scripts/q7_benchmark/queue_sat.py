"""Queue saturation throughput probe (DEC-Q7-006 §queue).

Spawns N worker threads; each issues back-to-back encodes against a Loader
for a fixed wall-clock window (default 5 seconds). Reports total encodes
completed + throughput in encodes/sec.

For real backends (torch/MLX), this measures how the inference queue handles
concurrent demand. For mock backends (CI smoke), it validates the threading
machinery without exercising real GIL contention.
"""

from __future__ import annotations

import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import Callable

from .loaders import Loader

DEFAULT_SATURATION_THREADS = 4  # matches typical M-series perf-core count
DEFAULT_SATURATION_WINDOW_S = 5.0


@dataclass(frozen=True)
class SaturationResult:
    n_threads: int
    window_seconds: float
    total_encodes: int
    throughput_per_second: float
    per_thread_counts: tuple[int, ...]
    error: str | None = None

    def to_dict(self) -> dict:
        return {
            "n_threads": self.n_threads,
            "window_seconds": self.window_seconds,
            "total_encodes": self.total_encodes,
            "throughput_per_second": round(self.throughput_per_second, 2),
            "per_thread_counts": list(self.per_thread_counts),
            "error": self.error,
        }


def measure_saturation(
    loader: Loader,
    payload_factory: Callable[[], object],
    n_threads: int = DEFAULT_SATURATION_THREADS,
    window_seconds: float = DEFAULT_SATURATION_WINDOW_S,
) -> SaturationResult:
    """Run N concurrent encode loops against a Loader for `window_seconds`.

    Each thread counts how many encodes it completes; we sum and report.

    The barrier ensures all threads start the encode loop at the same moment,
    so the window is consistent across them.
    """
    if n_threads < 1:
        raise ValueError(f"n_threads must be >= 1, got {n_threads}")
    if window_seconds <= 0:
        raise ValueError(f"window_seconds must be > 0, got {window_seconds}")

    start_barrier = threading.Barrier(n_threads + 1)
    stop_event = threading.Event()
    counts = [0] * n_threads
    error_box: list[str] = []

    def worker(idx: int) -> None:
        start_barrier.wait()
        local = 0
        try:
            while not stop_event.is_set():
                loader.encode(payload_factory())
                local += 1
        except NotImplementedError as exc:
            error_box.append(f"BACKEND_NOT_LIT: {exc}")
        finally:
            counts[idx] = local

    with ThreadPoolExecutor(max_workers=n_threads) as pool:
        futures = [pool.submit(worker, i) for i in range(n_threads)]
        start_barrier.wait()
        t0 = time.perf_counter()
        time.sleep(window_seconds)
        stop_event.set()
        for f in futures:
            f.result()
        elapsed = time.perf_counter() - t0

    total = sum(counts)
    throughput = total / elapsed if elapsed > 0 else 0.0
    return SaturationResult(
        n_threads=n_threads,
        window_seconds=window_seconds,
        total_encodes=total,
        throughput_per_second=throughput,
        per_thread_counts=tuple(counts),
        error=error_box[0] if error_box else None,
    )
