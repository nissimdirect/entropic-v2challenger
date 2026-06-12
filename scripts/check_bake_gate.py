#!/usr/bin/env python3
"""Machine gate-check for the audio-tracks 1-week user bake (PD.1b).

This script IS PD.2's un-flag gate. PASS (exit 0, prints ``BAKE GATE: PASS``)
requires ALL of the following, computed over ``flag_on: true`` sessions newer
than ``--since`` when given:

  1. >= 7 distinct local dates with >= 1 session
  2. Sigma duration_s >= 7200 (>= 2h cumulative)
  3. Sigma callback_errors == 0
  4. zero malformed / unparseable lines in the file (a tampered or truncated
     line is a FAIL, not a skip)
  5. log file exists and is non-empty

Any failure -> exit 1 + the first failed criterion printed on stdout.

Usage:
    python scripts/check_bake_gate.py --log <path> [--since YYYY-MM-DD]
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

REQUIRED_DISTINCT_DAYS = 7
REQUIRED_DURATION_S = 7200.0


def _fail(msg: str) -> int:
    print(f"BAKE GATE: FAIL — {msg}")
    return 1


def _local_date_of(ts_start: str) -> str:
    """Local calendar date (YYYY-MM-DD) of an ISO-8601 timestamp.

    Aware timestamps are converted to local time; naive ones are taken as-is.
    Raises ValueError on an unparseable timestamp so the caller treats the line
    as malformed (criterion 4).
    """
    dt = datetime.fromisoformat(ts_start)
    if dt.tzinfo is not None:
        dt = dt.astimezone()  # to local tz
    return dt.date().isoformat()


def check_bake_gate(log_path: Path, since: str | None) -> tuple[bool, str]:
    """Return (passed, message). message is the first failed criterion on fail."""
    # Criterion 5: file exists and is non-empty.
    if not log_path.exists():
        return False, "log missing"
    try:
        raw = log_path.read_text(encoding="utf-8")
    except Exception as e:
        return False, f"log unreadable: {e}"
    if raw.strip() == "":
        return False, "log empty"

    since_date: str | None = None
    if since:
        try:
            since_date = datetime.fromisoformat(since).date().isoformat()
        except ValueError:
            return False, f"invalid --since date: {since!r}"

    distinct_days: set[str] = set()
    total_duration = 0.0
    total_errors = 0

    # Criterion 4: every non-blank line must parse to a valid schema:1 record.
    for lineno, line in enumerate(raw.splitlines(), start=1):
        if line.strip() == "":
            continue  # trailing/blank lines are not data, not malformed
        try:
            rec = json.loads(line)
        except Exception:
            return False, f"malformed line {lineno} (unparseable JSON)"
        if not isinstance(rec, dict):
            return False, f"malformed line {lineno} (not an object)"
        # Validate required fields + types — a truncated line that happens to
        # parse but is missing fields is also malformed.
        try:
            ts_start = rec["ts_start"]
            duration_s = float(rec["duration_s"])
            callback_errors = int(rec["callback_errors"])
            flag_on = bool(rec["flag_on"])
            if not isinstance(ts_start, str):
                raise ValueError("ts_start not a string")
            local_date = _local_date_of(ts_start)
        except (KeyError, ValueError, TypeError) as e:
            return False, f"malformed line {lineno} ({e})"

        # Only flag_on sessions count toward the gate.
        if not flag_on:
            continue
        # Honor --since (inclusive) on the session's local date.
        if since_date is not None and local_date < since_date:
            continue

        distinct_days.add(local_date)
        total_duration += duration_s
        total_errors += callback_errors

    # Criterion 1: distinct days.
    if len(distinct_days) < REQUIRED_DISTINCT_DAYS:
        return False, (
            f"under 7 days ({len(distinct_days)} distinct day(s), "
            f"need {REQUIRED_DISTINCT_DAYS})"
        )
    # Criterion 2: cumulative duration.
    if total_duration < REQUIRED_DURATION_S:
        return False, (
            f"under 2h ({total_duration:.1f}s cumulative, "
            f"need {REQUIRED_DURATION_S:.0f}s)"
        )
    # Criterion 3: zero callback errors.
    if total_errors != 0:
        return False, f"nonzero callback errors ({total_errors})"

    return True, (
        f"{len(distinct_days)} distinct days, "
        f"{total_duration:.0f}s cumulative, 0 callback errors"
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Audio-tracks bake gate check.")
    parser.add_argument("--log", required=True, help="path to audio-bake-log.jsonl")
    parser.add_argument(
        "--since", default=None, help="only count sessions on/after YYYY-MM-DD"
    )
    args = parser.parse_args(argv)

    passed, message = check_bake_gate(Path(args.log), args.since)
    if passed:
        print(f"BAKE GATE: PASS — {message}")
        return 0
    return _fail(message)


if __name__ == "__main__":
    sys.exit(main())
