"""SG-8 memory-pressure auto-disable package.

Per DEC-Q7-010 (canonical degrade order) and DEC-Q7-011 (base memory
budget). PR #6 ships:
  - budget.py: session-start anchor + per-process memory query
  - degrade_order.py: CANONICAL_DEGRADE_ORDER + state machine
  - feature_registry.py: degrade()/restore() callback wiring

PR #11 wires the pressure monitor that consults these.
"""

from .budget import (
    SESSION_BUDGET_BYTES,
    pressure_percent,
    q7_resident_bytes,
    session_budget_mb,
)
from .degrade_order import CANONICAL_DEGRADE_ORDER, DegradeStage

__all__ = [
    "CANONICAL_DEGRADE_ORDER",
    "DegradeStage",
    "SESSION_BUDGET_BYTES",
    "pressure_percent",
    "q7_resident_bytes",
    "session_budget_mb",
]
