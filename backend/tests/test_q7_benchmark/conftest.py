"""Make q7_benchmark importable from this test dir regardless of how pytest is invoked.

The project's main test suite (test.yml workflow) runs pytest from `backend/`
without PYTHONPATH=scripts, so it can't find the q7_benchmark package by
default. Our own q7-smoke.yml workflow sets PYTHONPATH=scripts explicitly,
but we want the same tests to work in both contexts so the project's
overall smoke gate stays green.

Adding scripts/ to sys.path here is contained to test_q7_benchmark/ —
parent conftest discovery still picks up the project conftest above us.
"""

from __future__ import annotations

import sys
from pathlib import Path

# parents: [0] test_q7_benchmark, [1] tests, [2] backend
SCRIPTS_DIR = Path(__file__).resolve().parents[2] / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))
