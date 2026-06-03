"""Q7 benchmark runner — CLI entrypoint.

Skeleton for PR #1. Real backends + model loading land in PR #3; latency and
throughput measurement in PR #4; jitter measurement in PR #5.

Today this only supports --mock mode, which returns deterministic synthetic
results so CI can validate the harness end-to-end without GPU access.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np

from . import __version__
from .backends import BackendUnavailableError, detect_backend
from .bench import BenchPlan, benchmark_loader
from .loaders import make_loader
from .mock import mock_measure
from .queue_sat import measure_saturation
from .report import REPORT_SCHEMA_VERSION
from .under_load import measure_under_load


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="q7-benchmark",
        description="Q7 multi-headed L backbone benchmark (DINOv2 + CLIP + CLAP)",
    )
    p.add_argument(
        "--mock",
        action="store_true",
        help="Use deterministic mock backend (no model load, no GPU). CI default.",
    )
    p.add_argument(
        "--measure",
        action="store_true",
        help="Run real measurements (requires Apple silicon + downloaded models). PR #4+.",
    )
    p.add_argument(
        "--report",
        action="store_true",
        help="Render verdict to stdout after measurement.",
    )
    p.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Path to write JSON report. Default: stdout.",
    )
    p.add_argument(
        "--sparsity",
        type=int,
        choices=[4, 8, 16, 32],
        default=8,
        help="Sparse-encode ratio (every Nth frame). Used in PR #5+.",
    )
    p.add_argument(
        "--seed",
        type=int,
        default=42,
        help="RNG seed (mock mode determinism).",
    )
    p.add_argument(
        "--n-iterations",
        type=int,
        default=100,
        help="Measured iterations per backbone (DEC-Q7-006 default 100).",
    )
    p.add_argument(
        "--saturation-threads",
        type=int,
        default=4,
        help="Queue saturation worker count (DEC-Q7-006 default 4).",
    )
    p.add_argument(
        "--saturation-window",
        type=float,
        default=5.0,
        help="Queue saturation wall-clock window in seconds (default 5.0).",
    )
    p.add_argument(
        "--under-load-duration",
        type=float,
        default=30.0,
        help="Latency-under-load duration (CTO R3, default 30s).",
    )
    p.add_argument(
        "--skip-under-load",
        action="store_true",
        help="Skip the under-load measurement (faster for development).",
    )
    p.add_argument(
        "--version",
        action="version",
        version=f"q7-benchmark {__version__}",
    )
    return p


def _validate_args(args: argparse.Namespace) -> None:
    if args.mock and args.measure:
        raise SystemExit("error: --mock and --measure are mutually exclusive")
    if not args.mock and not args.measure:
        raise SystemExit(
            "error: must pass --mock (CI) or --measure (Apple silicon required). "
            "See docs/runbooks/q7/q7-smoke.md."
        )


def _build_report(
    mode: str, backend_name: str, measurement: dict, sparsity: int
) -> dict:
    from .verdict import verdict_from_measurement

    verdict = verdict_from_measurement(measurement)
    return {
        "schema_version": REPORT_SCHEMA_VERSION,
        "mode": mode,
        "backend": backend_name,
        "sparsity": sparsity,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "measurement": measurement,
        "verdict": verdict.to_dict(),
    }


# Per-modality payload factories. Frame is 224x224 RGB; text is a short prompt;
# audio is 3s @ 48kHz silence (CLAP minimum).
_PAYLOAD_FACTORIES = {
    "dinov2": lambda: np.zeros((224, 224, 3), dtype=np.uint8),
    "clip": lambda: {"image": np.zeros((224, 224, 3), dtype=np.uint8)},
    "clap": lambda: {
        "audio": np.zeros(48000 * 3, dtype=np.float32),
        "sample_rate": 48000,
    },
}


def _run_real_measurement(backend_name: str, args: argparse.Namespace) -> dict:
    """Wire the bench harness through real loaders.

    In PR #4 the real loaders' encode() still raises NotImplementedError;
    the harness catches and reports BACKEND_NOT_LIT per-head so the run
    produces a valid 0.2.0 report even before encode is lit up.
    """
    heads = {}
    queue_summary = {
        "n_threads": args.saturation_threads,
        "window_seconds": args.saturation_window,
        "total_encodes": 0,
        "throughput_per_second": 0.0,
        "per_thread_counts": [0] * args.saturation_threads,
    }

    # Use dinov2 as the canonical jitter target until PR #5 wires the real
    # interpolation pipeline.
    canonical_loader = make_loader("dinov2", backend=backend_name)  # type: ignore[arg-type]

    for name in ("dinov2", "clip", "clap"):
        loader = make_loader(name, backend=backend_name)  # type: ignore[arg-type]
        plan = BenchPlan(
            loader=loader,
            payload_factory=_PAYLOAD_FACTORIES[name],
            iterations=args.n_iterations,
        )
        result = benchmark_loader(plan)
        heads[name] = result.to_dict()

        sat = measure_saturation(
            loader,
            _PAYLOAD_FACTORIES[name],
            n_threads=args.saturation_threads,
            window_seconds=args.saturation_window,
        )
        # Aggregate: pick the highest throughput head as the headline number.
        if sat.throughput_per_second > queue_summary["throughput_per_second"]:
            queue_summary = sat.to_dict()
            # Drop the error field — schema 0.2.0 doesn't require it at the top
            queue_summary.pop("error", None)

    if args.skip_under_load:
        degradation_under_load = False
    else:
        under = measure_under_load(
            BenchPlan(
                loader=canonical_loader,
                payload_factory=_PAYLOAD_FACTORIES["dinov2"],
                iterations=max(10, args.n_iterations // 10),
            ),
            duration_seconds=args.under_load_duration,
        )
        degradation_under_load = under.degradation_under_load

    # PR #5: real jitter measurement across all four sparsities (DINOv2
    # only — the jitter-relevant vision backbone). Returns 0.3.0 interp
    # block with canonical_sparsity + by_sparsity.
    from .jitter import jitter_dict_for_report, measure_jitter_all_sparsities

    jitter_results = measure_jitter_all_sparsities(
        canonical_loader, n_frames_per_sparsity=128
    )
    interp_block = jitter_dict_for_report(jitter_results)
    interp_block["sparsity"] = args.sparsity  # legacy field for back-compat
    interp_block["degradation_under_load"] = degradation_under_load

    return {
        "heads": heads,
        "interpolation": interp_block,
        "queue": queue_summary,
        "memory": {
            # PR #6 wires psutil for real memory tracking; PR #5 stub.
            "resident_mb": 0.0,
            "peak_mb": 0.0,
        },
    }


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    _validate_args(args)

    if args.mock:
        backend_name = "mock"
        measurement = mock_measure(seed=args.seed, sparsity=args.sparsity)
        mode = "mock"
    else:
        # PR #4: real backend detection + bench harness wired. Real model
        # encode() raises NotImplementedError until PR #5+ lights it up;
        # benchmark_loader catches and surfaces as BACKEND_NOT_LIT per-head.
        try:
            backend = detect_backend(allow_mock=False)
        except BackendUnavailableError as exc:
            raise SystemExit(f"error: {exc}")
        backend_name = backend.name
        measurement = _run_real_measurement(backend.name, args)
        mode = "measure"

    report = _build_report(mode, backend_name, measurement, args.sparsity)

    # In --measure mode, exit non-zero if every head failed (backend not
    # lit). Mock mode always exits 0 because mock heads always succeed.
    measure_total_failure = mode == "measure" and all(
        h.get("error") is not None for h in measurement["heads"].values()
    )

    if args.out is not None:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(report, indent=2, sort_keys=True))
    elif args.report:
        json.dump(report, sys.stdout, indent=2, sort_keys=True)
        sys.stdout.write("\n")

    if measure_total_failure:
        sys.stderr.write(
            "error: --measure produced no real data — every backbone failed "
            "(typically because real encode is not lit up; expected before "
            "PR #5+).\n"
        )
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
