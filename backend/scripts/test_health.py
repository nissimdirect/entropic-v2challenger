#!/usr/bin/env python3
"""Test health dashboard — reads .test-manifest.json and .test-results/ JSONL.

Usage:
    python scripts/test_health.py           # Last 20 runs summary
    python scripts/test_health.py --slow    # Top 10 slowest tests
    python scripts/test_health.py --flaky   # Tests with mixed outcomes
    python scripts/test_health.py --rotate  # Trim JSONL to retention limits
"""

import argparse
import json
from collections import defaultdict
from pathlib import Path

HISTORY_PATH = Path(".test-results/history.jsonl")
PER_TEST_PATH = Path(".test-results/per_test.jsonl")
MANIFEST_PATH = Path(".test-manifest.json")

MAX_HISTORY = 500
MAX_PER_TEST = 50_000


def _read_jsonl(path: Path, max_lines: int = 0) -> list[dict]:
    """Read JSONL file, optionally limiting to last N lines."""
    if not path.exists():
        return []
    lines = path.read_text().splitlines()
    if max_lines > 0:
        lines = lines[-max_lines:]
    results = []
    for line in lines:
        line = line.strip()
        if line:
            try:
                results.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return results


def cmd_summary():
    """Show last 20 runs: pass rate, duration, trend."""
    runs = _read_jsonl(HISTORY_PATH, max_lines=20)
    if not runs:
        print("No test history found. Run pytest first.")
        return

    print(f"\n  Test Health — Last {len(runs)} runs\n")
    print(
        f"  {'#':>3}  {'Passed':>6}  {'Failed':>6}  {'Skip':>4}  {'Duration':>8}  {'Status':>6}"
    )
    print(f"  {'—' * 3}  {'—' * 6}  {'—' * 6}  {'—' * 4}  {'—' * 8}  {'—' * 6}")

    durations = []
    for i, run in enumerate(runs, 1):
        p = run.get("passed", 0)
        f = run.get("failed", 0)
        s = run.get("skipped", 0)
        d = run.get("duration_seconds", 0)
        status = "GREEN" if run.get("green") else "RED"
        durations.append(d)
        print(f"  {i:>3}  {p:>6}  {f:>6}  {s:>4}  {d:>7.1f}s  {status:>6}")

    if durations:
        avg = sum(durations) / len(durations)
        trend = ""
        if len(durations) >= 3:
            recent = sum(durations[-3:]) / 3
            older = sum(durations[:3]) / 3
            if recent > older * 1.2:
                trend = " (SLOWER)"
            elif recent < older * 0.8:
                trend = " (FASTER)"
        green_count = sum(1 for r in runs if r.get("green"))
        print(f"\n  Avg duration: {avg:.1f}s{trend}")
        print(
            f"  Pass rate: {green_count}/{len(runs)} runs green ({100 * green_count / len(runs):.0f}%)"
        )

    # Current manifest
    if MANIFEST_PATH.exists():
        m = json.loads(MANIFEST_PATH.read_text())
        sha = m.get("commit_sha", "")[:10]
        print(
            f"\n  Current: {'GREEN' if m.get('green') else 'RED'} at {sha} ({m.get('branch', '?')})"
        )

    print()


def cmd_slow():
    """Show top 10 slowest tests by average duration."""
    entries = _read_jsonl(PER_TEST_PATH)
    if not entries:
        print("No per-test data found. Run pytest first.")
        return

    by_test: dict[str, list[float]] = defaultdict(list)
    for e in entries:
        name = e.get("name", "")
        dur = e.get("duration_s", 0)
        if name and dur > 0:
            by_test[name].append(dur)

    ranked = sorted(by_test.items(), key=lambda x: sum(x[1]) / len(x[1]), reverse=True)

    print(f"\n  Top 10 Slowest Tests (avg across {len(entries)} records)\n")
    print(f"  {'Avg':>7}  {'Max':>7}  {'Runs':>4}  Test")
    print(f"  {'—' * 7}  {'—' * 7}  {'—' * 4}  {'—' * 40}")
    for name, durs in ranked[:10]:
        avg = sum(durs) / len(durs)
        mx = max(durs)
        print(f"  {avg:>6.3f}s  {mx:>6.3f}s  {len(durs):>4}  {name}")
    print()


def cmd_flaky():
    """Show tests with mixed outcomes (passed AND failed)."""
    entries = _read_jsonl(PER_TEST_PATH)
    if not entries:
        print("No per-test data found. Run pytest first.")
        return

    by_test: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for e in entries:
        name = e.get("name", "")
        outcome = e.get("outcome", "")
        if name and outcome:
            by_test[name][outcome] += 1

    flaky = []
    for name, outcomes in by_test.items():
        if outcomes.get("passed", 0) > 0 and outcomes.get("failed", 0) > 0:
            total = sum(outcomes.values())
            fail_rate = outcomes["failed"] / total
            flaky.append((name, outcomes, fail_rate))

    flaky.sort(key=lambda x: x[2], reverse=True)

    if not flaky:
        print("\n  No flaky tests detected.\n")
        return

    print(f"\n  Flaky Tests ({len(flaky)} found)\n")
    print(f"  {'Fail%':>5}  {'Pass':>4}  {'Fail':>4}  Test")
    print(f"  {'—' * 5}  {'—' * 4}  {'—' * 4}  {'—' * 40}")
    for name, outcomes, fail_rate in flaky:
        print(
            f"  {fail_rate * 100:>4.0f}%  {outcomes['passed']:>4}  {outcomes['failed']:>4}  {name}"
        )
    print()


def cmd_rotate():
    """Trim JSONL files to retention limits."""
    for path, limit, label in [
        (HISTORY_PATH, MAX_HISTORY, "history"),
        (PER_TEST_PATH, MAX_PER_TEST, "per_test"),
    ]:
        if not path.exists():
            print(f"  {label}: not found")
            continue
        lines = path.read_text().splitlines()
        before = len(lines)
        if before > limit:
            path.write_text("\n".join(lines[-limit:]) + "\n")
            print(f"  {label}: trimmed {before} -> {limit} lines")
        else:
            print(f"  {label}: {before} lines (under {limit} limit)")


def main():
    parser = argparse.ArgumentParser(description="Test health dashboard")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--slow", action="store_true", help="Top 10 slowest tests")
    group.add_argument("--flaky", action="store_true", help="Tests with mixed outcomes")
    group.add_argument("--rotate", action="store_true", help="Trim JSONL files")
    args = parser.parse_args()

    if args.slow:
        cmd_slow()
    elif args.flaky:
        cmd_flaky()
    elif args.rotate:
        cmd_rotate()
    else:
        cmd_summary()


if __name__ == "__main__":
    main()
