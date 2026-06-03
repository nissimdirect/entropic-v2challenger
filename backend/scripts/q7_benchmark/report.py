"""Q7 report writer + schema validator.

Skeleton for PR #1. Markdown rendering + matplotlib charts land in PR #7.
For now: JSON schema validation only, so the smoke gate can fail on shape drift.

Schema lives at ./schemas/q7-report.schema.json. Bump REPORT_SCHEMA_VERSION when
the report shape changes; runner.py stamps every report with the active version.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPORT_SCHEMA_VERSION = "0.3.0"


class ReportSchemaError(ValueError):
    """Report JSON does not match the declared schema."""


def validate_report(report: dict) -> None:
    """Minimal schema enforcement.

    PR #1 only validates the top-level shape (no jsonschema dep — we're under
    the smoke-tier rule of zero non-CI deps). PR #4+ may upgrade to full
    jsonschema validation once we know real-measurement field shapes.
    """
    required_top = {
        "schema_version",
        "mode",
        "backend",
        "sparsity",
        "generated_at",
        "measurement",
        "verdict",
    }
    missing = required_top - report.keys()
    if missing:
        raise ReportSchemaError(f"missing required keys: {sorted(missing)}")
    if report["schema_version"] != REPORT_SCHEMA_VERSION:
        raise ReportSchemaError(
            f"schema_version mismatch: report={report['schema_version']} "
            f"expected={REPORT_SCHEMA_VERSION}"
        )
    if report["mode"] not in {"mock", "measure"}:
        raise ReportSchemaError(f"invalid mode: {report['mode']!r}")
    if report["sparsity"] not in {4, 8, 16, 32}:
        raise ReportSchemaError(f"invalid sparsity: {report['sparsity']!r}")
    if not isinstance(report["measurement"], dict):
        raise ReportSchemaError("measurement must be a dict")
    heads = report["measurement"].get("heads", {})
    if not isinstance(heads, dict):
        raise ReportSchemaError("measurement.heads must be a dict")
    required_heads = {"dinov2", "clip", "clap"}
    missing_heads = required_heads - heads.keys()
    if missing_heads:
        raise ReportSchemaError(f"missing heads: {sorted(missing_heads)}")
    # 0.2.0 shape: per-head + interpolation + queue extra fields
    required_head_keys = {
        "embed_dim",
        "backend",
        "cold_load_seconds",
        "encode_latency",
        "high_variance",
        "warmup_iterations",
        "error",
    }
    for hname, head in heads.items():
        missing_h = required_head_keys - head.keys()
        if missing_h:
            raise ReportSchemaError(f"head {hname!r} missing keys: {sorted(missing_h)}")
    interp = report["measurement"].get("interpolation", {})
    if "degradation_under_load" not in interp:
        raise ReportSchemaError(
            "measurement.interpolation missing degradation_under_load"
        )
    # 0.3.0: canonical_sparsity + by_sparsity required
    if "canonical_sparsity" not in interp:
        raise ReportSchemaError(
            "measurement.interpolation missing canonical_sparsity (0.3.0)"
        )
    if "by_sparsity" not in interp:
        raise ReportSchemaError("measurement.interpolation missing by_sparsity (0.3.0)")
    # Verdict shape
    verdict = report["verdict"]
    if not isinstance(verdict, dict):
        raise ReportSchemaError("verdict must be a dict")
    required_verdict_keys = {"state", "flags", "canonical_p95_ms", "note"}
    missing_v = required_verdict_keys - verdict.keys()
    if missing_v:
        raise ReportSchemaError(f"verdict missing keys: {sorted(missing_v)}")
    if verdict["state"] not in {"TIER_5_GO", "TIER_5_CONDITIONAL", "TIER_5_NO_GO"}:
        raise ReportSchemaError(f"invalid verdict state: {verdict['state']!r}")
    queue = report["measurement"].get("queue", {})
    for k in (
        "n_threads",
        "window_seconds",
        "total_encodes",
        "throughput_per_second",
        "per_thread_counts",
    ):
        if k not in queue:
            raise ReportSchemaError(f"measurement.queue missing {k!r}")


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="q7-report",
        description="Q7 report validator (PR #1) and markdown renderer (PR #7+)",
    )
    sub = p.add_subparsers(dest="cmd", required=True)
    v = sub.add_parser("validate", help="Validate a JSON report against the schema")
    v.add_argument("path", type=Path)
    return p


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    if args.cmd == "validate":
        report = json.loads(args.path.read_text())
        try:
            validate_report(report)
        except ReportSchemaError as exc:
            sys.stderr.write(f"INVALID: {exc}\n")
            return 1
        sys.stdout.write(f"OK: {args.path} schema_version={report['schema_version']}\n")
        return 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
