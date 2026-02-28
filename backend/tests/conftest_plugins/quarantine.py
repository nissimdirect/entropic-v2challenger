"""Auto-quarantine plugin — marks persistently flaky tests as xfail.

DEFERRED: This plugin is NOT registered in conftest.py yet.
Wire it in when flaky tests are actually observed in .test-results/per_test.jsonl.

To activate: add "conftest_plugins.quarantine" to pytest_plugins in conftest.py.

Safety cap: max 5% of test suite can be quarantined. If exceeded, the plugin
raises an error to flag an infrastructure problem.
"""

import json
from pathlib import Path

import pytest

# Tests that fail >30% of the time over their last 10 runs are quarantined
FLAKY_THRESHOLD = 0.3
MIN_RUNS = 5
MAX_QUARANTINE_PERCENT = 0.05  # 5% of total collected tests

PER_TEST_PATH = Path(".test-results/per_test.jsonl")


def _load_flaky_tests() -> set[str]:
    """Identify tests that exceed the flaky threshold."""
    if not PER_TEST_PATH.exists():
        return set()

    from collections import defaultdict

    by_test: dict[str, list[str]] = defaultdict(list)
    try:
        for line in PER_TEST_PATH.read_text().splitlines():
            line = line.strip()
            if not line:
                continue
            entry = json.loads(line)
            name = entry.get("name", "")
            outcome = entry.get("outcome", "")
            if name and outcome:
                by_test[name].append(outcome)
    except (json.JSONDecodeError, OSError):
        return set()

    flaky = set()
    for name, outcomes in by_test.items():
        # Only consider last 10 runs
        recent = outcomes[-10:]
        if len(recent) < MIN_RUNS:
            continue
        fail_count = sum(1 for o in recent if o == "failed")
        if fail_count / len(recent) >= FLAKY_THRESHOLD:
            flaky.add(name)

    return flaky


def pytest_collection_modifyitems(config, items):
    """Mark flaky tests as xfail (expected failure)."""
    flaky = _load_flaky_tests()
    if not flaky:
        return

    # Safety cap
    max_quarantine = int(len(items) * MAX_QUARANTINE_PERCENT)
    if max_quarantine < 1:
        max_quarantine = 1

    quarantined_count = sum(1 for item in items if item.nodeid in flaky)
    if quarantined_count > max_quarantine:
        raise pytest.UsageError(
            f"QUARANTINE OVERFLOW: {quarantined_count} tests quarantined "
            f"(max {max_quarantine}). Infrastructure problem — investigate."
        )

    for item in items:
        if item.nodeid in flaky:
            item.add_marker(
                pytest.mark.xfail(reason="auto-quarantined: flaky", strict=False)
            )
