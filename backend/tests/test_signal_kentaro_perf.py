"""Performance gates for the Kentaro Cluster operator (P4.2).

All tests are marked @pytest.mark.perf and deselected by default (pyproject
addopts: `-m 'not perf'`). Run explicitly with: pytest -m perf.
"""

import time

import pytest

from modulation.kentaro_cluster import evaluate_kentaro_cluster
from modulation.engine import SignalEngine


def _p95(samples_s: list[float]) -> float:
    """95th-percentile of a list of per-iteration durations (seconds)."""
    ordered = sorted(samples_s)
    idx = min(len(ordered) - 1, int(round(0.95 * (len(ordered) - 1))))
    return ordered[idx]


@pytest.mark.perf
def test_single_cluster_eval_p95_under_500us():
    """A single 8-LFO cluster eval has p95 ≤ 0.5ms over 1000 frames."""
    lfos = [
        {"shape": "sine", "rate_hz": 0.5 + i * 0.37, "depth": 1.0, "phase": 0.0}
        for i in range(8)
    ]
    params = {"lfos": lfos, "lfo_count": 8, "master_depth": 1.0}
    state = {}
    samples = []
    for frame in range(1000):
        t0 = time.perf_counter()
        _, state = evaluate_kentaro_cluster(params, frame, 30.0, state_in=state)
        samples.append(time.perf_counter() - t0)

    p95_us = _p95(samples) * 1e6
    print(f"PERF single_cluster p95 = {p95_us:.1f}us (threshold 500us)")
    assert p95_us <= 500.0, f"single-cluster p95 {p95_us:.1f}us exceeds 500us"


@pytest.mark.perf
def test_evaluate_all_8_clusters_32_mappings_p95_under_4ms():
    """evaluate_all over 8 clusters (64 sub-LFOs) + 32 mappings: p95 ≤ 4ms."""
    engine = SignalEngine()
    operators = []
    for c in range(8):
        op_id = f"op-1700000000-{c}"
        mappings = [
            {
                "target_effect_id": "blur",
                "target_param_key": "radius",
                "source_key": f"lfo{m % 8}",
                "depth": 1.0,
                "min": 0.0,
                "max": 1.0,
                "blend_mode": "add",
            }
            for m in range(4)  # 4 mappings * 8 clusters = 32 mappings total
        ]
        operators.append(
            {
                "id": op_id,
                "type": "kentaroCluster",
                "is_enabled": True,
                "parameters": {
                    "lfos": [
                        {"shape": "sine", "rate_hz": 0.5 + i * 0.37, "depth": 1.0}
                        for i in range(8)
                    ],
                    "lfo_count": 8,
                },
                "processing": [],
                "mappings": mappings,
            }
        )

    state = {}
    samples = []
    for frame in range(1000):
        t0 = time.perf_counter()
        _, state = engine.evaluate_all(operators, frame, 30.0, state=state)
        samples.append(time.perf_counter() - t0)

    p95_ms = _p95(samples) * 1e3
    print(f"PERF evaluate_all_8clusters p95 = {p95_ms:.3f}ms (threshold 4ms)")
    assert p95_ms <= 4.0, f"8-cluster p95 {p95_ms:.3f}ms exceeds 4ms"
