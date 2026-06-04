"""Backend↔frontend B4-lite schema contract (the #1 architectural risk).

The `.dna` / `.entropic` portability thesis (Vision §2, strict no-regression)
requires the backend `modulation/schema.py` enums and the frontend
`shared/axis-binding.ts` canonical union to serialize IDENTICAL strings. If they
diverge, a frontend-saved patch fails to load on the backend (and vice versa),
silently corrupting cross-version portability.

DISCOVERED 2026-06-04 (master-sequence P2): they DO diverge today —
  - BindingRule values: backend snake_case ("sample_at"/"scan_over") vs
    frontend camelCase ("sampleAt"/"scanOver").
  - Member count: backend 5 vs frontend 8 (frontend adds hilbert/polar/learned).

This test encodes the REQUIRED agreement and is xfail(strict=True) until PR-B
reconciles. When PR-B fixes the schema, this test "unexpectedly passes" → strict
xfail turns that into a failure prompting removal of the marker (self-clearing
guard). Reconciliation guidance: `~/.claude/plans/entropic-P2-schema-fork-finding.md`.
"""

from __future__ import annotations

import pytest

from modulation.schema import BindingRule, LaneDomain

# Canonical strings as serialized by frontend/src/shared/axis-binding.ts.
FRONTEND_AXES = {"t", "y", "x", "c", "f", "l"}
FRONTEND_BINDING_RULES = {
    "broadcast",
    "sampleAt",
    "scanOver",
    "integrate",
    "painted",
    "hilbert",
    "polar",
    "learned",
}


def test_lane_domain_values_match_frontend() -> None:
    """Axis values are already lowercase-canonical on both sides (P1-A locked)."""
    assert {d.value for d in LaneDomain} == FRONTEND_AXES


@pytest.mark.xfail(
    strict=True,
    reason=(
        "SCHEMA FORK (P2 finding): backend BindingRule is snake_case + 5 members; "
        "frontend canonical is camelCase + 8. Reconcile in PR-B before .dna locks. "
        "See entropic-P2-schema-fork-finding.md"
    ),
)
def test_binding_rule_values_match_frontend_canonical() -> None:
    """Backend BindingRule string values MUST equal the frontend canonical set."""
    assert {r.value for r in BindingRule} == FRONTEND_BINDING_RULES
