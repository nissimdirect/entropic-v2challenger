"""Q7 multi-headed L backbone benchmark.

Measures DINOv2 + CLIP + CLAP encode latency, queue throughput, and slerp
interpolation jitter on Apple silicon to gate Tier 5 commit (<50ms threshold).

Mock mode (CI, no GPU) returns deterministic synthetic results so the harness
itself can be unit-tested without model weights or hardware.

Entry points:
    python -m q7_benchmark.runner --mock --report  # smoke
    python -m q7_benchmark.runner --measure --out r.json  # real (Apple silicon)
    python -m q7_benchmark.report --in r.json  # render markdown verdict
"""

__version__ = "0.0.1"
