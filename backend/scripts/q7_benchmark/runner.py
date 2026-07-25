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

from . import __version__
from .backends import detect_backend, BackendUnavailableError
from .mock import mock_measure
from .report import REPORT_SCHEMA_VERSION


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
    return {
        "schema_version": REPORT_SCHEMA_VERSION,
        "mode": mode,
        "backend": backend_name,
        "sparsity": sparsity,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "measurement": measurement,
    }


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    _validate_args(args)

    if args.mock:
        backend_name = "mock"
        measurement = mock_measure(seed=args.seed, sparsity=args.sparsity)
        mode = "mock"
    else:
        # PR #3+: real backend detection + measurement
        try:
            backend = detect_backend(allow_mock=False)
        except BackendUnavailableError as exc:
            raise SystemExit(f"error: {exc}")
        raise SystemExit(
            f"error: --measure not implemented yet (PR #3+ scope). "
            f"Detected backend: {backend.name}. Use --mock for now."
        )

    report = _build_report(mode, backend_name, measurement, args.sparsity)

    if args.out is not None:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(report, indent=2, sort_keys=True))
    elif args.report:
        json.dump(report, sys.stdout, indent=2, sort_keys=True)
        sys.stdout.write("\n")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
