"""Tier 5 verdict computation (DEC-Q7-007).

Reads the jitter p95 at the canonical sparsity, plus advisory signals
(high_variance, degradation_under_load), and returns one of three verdict
states + a flag list. Pure function; no side effects; deterministic.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class VerdictState(str, Enum):
    """Tier 5 GO/CONDITIONAL/NO_GO states."""

    GO = "TIER_5_GO"
    CONDITIONAL = "TIER_5_CONDITIONAL"
    NO_GO = "TIER_5_NO_GO"


GATE_P95_GO_THRESHOLD_MS = 50.0
GATE_P95_CONDITIONAL_THRESHOLD_MS = 100.0


# Advisory flag labels — emitted in the verdict's `flags` array when
# the corresponding condition holds. Wording chosen for clarity in the
# eventual markdown report (PR #7).
FLAG_HIGH_VARIANCE = "HIGH_VARIANCE"
FLAG_DEGRADES_UNDER_LOAD = "DEGRADES_UNDER_LOAD"


@dataclass(frozen=True)
class Verdict:
    state: VerdictState
    flags: tuple[str, ...]
    canonical_p95_ms: float
    note: str

    def to_dict(self) -> dict:
        return {
            "state": self.state.value,
            "flags": list(self.flags),
            "canonical_p95_ms": round(self.canonical_p95_ms, 4),
            "note": self.note,
        }


def _verdict_note(state: VerdictState, p95: float) -> str:
    if state is VerdictState.GO:
        return (
            f"Tier 5 GO at p95={p95:.2f}ms (< {GATE_P95_GO_THRESHOLD_MS}ms gate). "
            "Proceed with Session 2 PR #9 (L worker skeleton) and downstream "
            "Tier 5 features."
        )
    if state is VerdictState.CONDITIONAL:
        return (
            f"Tier 5 CONDITIONAL at p95={p95:.2f}ms (between "
            f"{GATE_P95_GO_THRESHOLD_MS}ms and {GATE_P95_CONDITIONAL_THRESHOLD_MS}ms). "
            "Re-run after cold boot + thermal-cool-down before committing. "
            "Likely thermal-throttling or first-run cache effects."
        )
    return (
        f"Tier 5 NO_GO at p95={p95:.2f}ms (≥ {GATE_P95_CONDITIONAL_THRESHOLD_MS}ms). "
        "Defer L-axis to v1.1 per Vision §11 contingency. Tiers 0-4 ship "
        "without L-axis features."
    )


def compute_verdict(
    canonical_p95_ms: float,
    *,
    high_variance: bool = False,
    degradation_under_load: bool = False,
) -> Verdict:
    """Pure function: latency + advisory signals → Verdict.

    The canonical_p95_ms input MUST be the p95 of interpolation jitter
    measured at the canonical sparsity (DEC-Q7-009 = 1:8). Callers are
    responsible for picking the right percentile + sparsity from the
    benchmark report.
    """
    if canonical_p95_ms < 0:
        raise ValueError(
            f"canonical_p95_ms must be non-negative, got {canonical_p95_ms}"
        )

    if canonical_p95_ms < GATE_P95_GO_THRESHOLD_MS:
        state = VerdictState.GO
    elif canonical_p95_ms < GATE_P95_CONDITIONAL_THRESHOLD_MS:
        state = VerdictState.CONDITIONAL
    else:
        state = VerdictState.NO_GO

    flags: list[str] = []
    if high_variance:
        flags.append(FLAG_HIGH_VARIANCE)
    if degradation_under_load:
        flags.append(FLAG_DEGRADES_UNDER_LOAD)

    return Verdict(
        state=state,
        flags=tuple(flags),
        canonical_p95_ms=canonical_p95_ms,
        note=_verdict_note(state, canonical_p95_ms),
    )


def verdict_from_measurement(measurement: dict) -> Verdict:
    """Extract canonical p95 + advisory flags from a 0.3.0 measurement dict."""
    interp = measurement.get("interpolation", {})
    canonical_sparsity = interp.get("canonical_sparsity", 8)
    by_sparsity = interp.get("by_sparsity", {})
    canonical = by_sparsity.get(str(canonical_sparsity)) or by_sparsity.get(
        canonical_sparsity
    )
    if canonical is None:
        # Fallback: use top-level jitter_p95_ms (also points at canonical)
        canonical_p95 = float(interp.get("jitter_p95_ms", 0.0))
    else:
        canonical_p95 = float(canonical.get("jitter_p95_ms", 0.0))

    heads = measurement.get("heads", {})
    high_variance = any(h.get("high_variance", False) for h in heads.values())
    degradation_under_load = bool(interp.get("degradation_under_load", False))

    return compute_verdict(
        canonical_p95,
        high_variance=high_variance,
        degradation_under_load=degradation_under_load,
    )
