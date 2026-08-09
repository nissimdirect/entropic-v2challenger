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

REPORT_SCHEMA_VERSION = "0.1.0"


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
