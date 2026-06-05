"""Base memory budget for SG-8 pressure monitor (DEC-Q7-011).

Anchor: session-start `psutil.virtual_memory().available`, NOT `total`.
On 16GB M1, macOS + Electron + Python sidecar consume ~5-6GB, leaving
~10-11GB available — that's the honest denominator for percent-pressure
calculations, not the marketing "16GB".

Environment override: `ENTROPIC_Q7_BUDGET_MB` (integer MB) bypasses the
psutil read. Useful for benchmarking and tests.
"""

from __future__ import annotations

import os


def _read_session_budget_bytes() -> int:
    """Compute the session memory budget at import time."""
    override_mb = os.environ.get("ENTROPIC_Q7_BUDGET_MB")
    if override_mb is not None:
        try:
            return int(override_mb) * 1024 * 1024
        except ValueError:
            # Bad override — fall through to psutil
            pass

    try:
        import psutil
    except ImportError:
        # psutil isn't installed in smoke environments. Fall back to a
        # plausible default (8 GB) so callers don't crash; users running
        # real --measure will have psutil per requirements-q7-measure.txt.
        return 8 * 1024 * 1024 * 1024

    return int(psutil.virtual_memory().available)


# Captured at module import time. Module-level constant; do NOT re-read
# this in the pressure monitor — that's the bug DEC-Q7-011 is designed
# to avoid (re-reading would treat "user opened Chrome" as "Q7 grew").
SESSION_BUDGET_BYTES: int = _read_session_budget_bytes()


def session_budget_mb() -> float:
    """Session budget in MB (rounded to 1 decimal)."""
    return round(SESSION_BUDGET_BYTES / (1024 * 1024), 1)


def q7_resident_bytes() -> int:
    """Memory consumed by Q7 specifically — this process + L worker children.

    PR #6 ships v1: this process + any tracked child processes. PR #11
    extends this to include explicit L worker process tracking.
    """
    try:
        import psutil
    except ImportError:
        return 0

    proc = psutil.Process()
    try:
        rss = proc.memory_info().rss
    except psutil.AccessDenied:
        return 0

    for child in proc.children(recursive=True):
        try:
            rss += child.memory_info().rss
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    return int(rss)


def pressure_percent() -> float:
    """Current Q7 resident memory as percent of session budget.

    Returns a value in [0, 100+]. Values > 100 indicate Q7 exceeded the
    budget — possible if SESSION_BUDGET_BYTES is exceptionally low.
    """
    if SESSION_BUDGET_BYTES <= 0:
        return 0.0
    return (q7_resident_bytes() / SESSION_BUDGET_BYTES) * 100.0
