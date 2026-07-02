"""Test result manifest plugin — writes .test-manifest.json and .test-results/ JSONL.

Registered via pytest_plugins in conftest.py. Tracks:
- Session-level pass/fail/error/skip counts
- Per-test durations for slow-test and flaky-test analysis
- History JSONL for trend reporting via test_health.py
"""

import json
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path


# --- Session state ---

_start_time: float = 0.0
_counts = {"passed": 0, "failed": 0, "error": 0, "skipped": 0}
_per_test: list[dict] = []

MAX_HISTORY_LINES = 500
MAX_PER_TEST_LINES = 50_000


def _git(args: list[str]) -> str:
    """Run a git command and return stripped stdout, or empty string on failure."""
    try:
        result = subprocess.run(
            ["git"] + args,
            capture_output=True,
            text=True,
            timeout=5,
        )
        return result.stdout.strip()
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return ""


def pytest_sessionstart(session):
    global _start_time
    _start_time = time.monotonic()
    _counts.update({"passed": 0, "failed": 0, "error": 0, "skipped": 0})
    _per_test.clear()


def pytest_runtest_makereport(item, call):
    """Count outcomes and record per-test durations (call phase only)."""
    if call.when != "call":
        return

    # Build report to check outcome
    from _pytest.runner import pytest_runtest_makereport as _make

    # We use a hook wrapper instead — but since we're a plain hook,
    # we process the result after the fact via pytest_runtest_logreport.


def pytest_runtest_logreport(report):
    """Process test reports to count outcomes and record durations."""
    if report.when != "call":
        return

    if report.passed:
        _counts["passed"] += 1
        outcome = "passed"
    elif report.failed:
        _counts["failed"] += 1
        outcome = "failed"
    elif report.skipped:
        _counts["skipped"] += 1
        outcome = "skipped"
    else:
        return

    _per_test.append(
        {
            "name": report.nodeid,
            "outcome": outcome,
            "duration_s": round(report.duration, 4),
        }
    )


def pytest_sessionfinish(session, exitstatus):
    """Write manifest and append to JSONL history files."""
    duration = round(time.monotonic() - _start_time, 2)
    commit_sha = _git(["rev-parse", "HEAD"])
    branch = _git(["rev-parse", "--abbrev-ref", "HEAD"])
    now = datetime.now(timezone.utc).isoformat()

    green = _counts["failed"] == 0 and _counts["error"] == 0

    manifest = {
        "commit_sha": commit_sha,
        "branch": branch,
        "timestamp": now,
        "max_age_hours": 24,
        "framework": "pytest",
        "passed": _counts["passed"],
        "failed": _counts["failed"],
        "errors": _counts["error"],
        "skipped": _counts["skipped"],
        "duration_seconds": duration,
        "green": green,
    }

    # Determine project root (where pyproject.toml lives)
    root = Path(session.config.rootpath)

    # Write manifest
    manifest_path = root / ".test-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")

    # Write JSONL history
    results_dir = root / ".test-results"
    results_dir.mkdir(exist_ok=True)

    history_path = results_dir / "history.jsonl"
    with history_path.open("a") as f:
        f.write(json.dumps(manifest) + "\n")

    # Write per-test durations
    per_test_path = results_dir / "per_test.jsonl"
    with per_test_path.open("a") as f:
        for entry in _per_test:
            entry["timestamp"] = now
            entry["commit_sha"] = commit_sha
            f.write(json.dumps(entry) + "\n")

    # Auto-rotate if files exceed thresholds
    _rotate_if_needed(history_path, MAX_HISTORY_LINES)
    _rotate_if_needed(per_test_path, MAX_PER_TEST_LINES)


def _rotate_if_needed(path: Path, max_lines: int):
    """Trim a JSONL file to its last max_lines entries if it exceeds the limit."""
    if not path.exists():
        return
    try:
        lines = path.read_text().splitlines()
        if len(lines) > max_lines:
            path.write_text("\n".join(lines[-max_lines:]) + "\n")
    except OSError:
        pass
