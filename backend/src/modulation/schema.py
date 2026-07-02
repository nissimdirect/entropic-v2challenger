"""B1 universal-automatability schema + B4-lite routing schema.

Vision §6 B1: every param has a lane with
    domain (T/Y/X/C/F/L) + direction (signed real) + binding_rule + interp_mode + loop_mode.

Vision §6 B4-lite: mod-edge schema (src, src_axis, dst, dst_axis, binding_rule, depth)
ships in full. Only `broadcast` is implemented in Tier 1. Writer-side validator
REJECTS non-broadcast values on save to prevent schema-vs-implementation drift.

Forward-compat: future tiers add sampleAt / scanOver / integrate / painted (+ the
research rules hilbert / polar / learned) without schema migration; reader accepts
unknown future binding_rules and preserves them in round-trip but writer must
downconvert or refuse. Values are CANONICAL camelCase, identical to the frontend.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class LaneDomain(str, Enum):
    """The six paradigm axes (Vision §4)."""

    T = "t"  # time (default)
    Y = "y"  # scanline / vertical
    X = "x"  # horizontal
    C = "c"  # channel (RGB / stem)
    F = "f"  # frequency / band
    L = "l"  # latent


class BindingRule(str, Enum):
    """The eight binding rules (Vision §7) — CANONICAL camelCase wire values,
    matching frontend `shared/axis-binding.ts` (P2 schema-fork reconciliation,
    2026-06-04). Backend + frontend now serialize identical strings, so `.dna`
    patches round-trip across both sides.

    Tier 1 ships ONLY `broadcast`. The other seven are accepted by the schema
    but rejected by the writer-side validator until their tier lands; the reader
    preserves unknown future rules on round-trip.
    """

    BROADCAST = "broadcast"
    SAMPLE_AT = "sampleAt"
    SCAN_OVER = "scanOver"
    INTEGRATE = "integrate"
    PAINTED = "painted"
    HILBERT = "hilbert"
    POLAR = "polar"
    LEARNED = "learned"


class InterpMode(str, Enum):
    LINEAR = "linear"
    STEP = "step"
    EASE_IN_OUT = "ease_in_out"


class LoopMode(str, Enum):
    OFF = "off"
    LOOP = "loop"
    PING_PONG = "ping_pong"


# P5b.21 (B9 tensor mod-routing): Tier 1 now implements the FOUR binding rules
# broadcast / sampleAt / scanOver / integrate. This widening is LOCKSTEP with the
# engine renderer (P5b.22, modulation/routing.py) — the resolver honors exactly
# these four. The other four (painted / hilbert / polar / learned) are flag-gated
# research rules: accepted by the schema (forward-compat read) but REJECTED by the
# writer-side validator AND the loader trust boundary when their flag is off.
TIER1_IMPLEMENTED_RULES: frozenset[BindingRule] = frozenset(
    {
        BindingRule.BROADCAST,
        BindingRule.SAMPLE_AT,
        BindingRule.SCAN_OVER,
        BindingRule.INTEGRATE,
    }
)

# The four flag-gated research rules. NOT implemented in the engine; gated behind
# EXPERIMENTAL_AXIS_BINDINGS. Mirrors the frontend RESEARCH_BINDING_RULES set.
RESEARCH_BINDING_RULES: frozenset[BindingRule] = frozenset(
    {
        BindingRule.PAINTED,
        BindingRule.HILBERT,
        BindingRule.POLAR,
        BindingRule.LEARNED,
    }
)


def experimental_axis_bindings_enabled() -> bool:
    """Read the EXPERIMENTAL_AXIS_BINDINGS env flag (true/1/yes/on).

    When OFF (default), the four research binding rules (painted/hilbert/polar/
    learned) are REJECTED at the writer + loader trust boundaries. Mirrors the
    EXPERIMENTAL_AUDIO_TRACKS flag-reader convention in zmq_server.py.
    """
    val = os.environ.get("EXPERIMENTAL_AXIS_BINDINGS", "").strip().lower()
    return val in {"true", "1", "yes", "on"}


def accepted_binding_rules() -> frozenset[BindingRule]:
    """The currently-accepted binding-rule set.

    Always includes the four implemented Tier-1 rules; adds the four research
    rules ONLY when EXPERIMENTAL_AXIS_BINDINGS is on. This is the authoritative
    accept-set consulted by the loader (project/schema.py) and the writer-side
    validator.
    """
    if experimental_axis_bindings_enabled():
        return TIER1_IMPLEMENTED_RULES | RESEARCH_BINDING_RULES
    return TIER1_IMPLEMENTED_RULES


@dataclass(frozen=True)
class Lane:
    """B1 lane — one parameter's automation channel.

    `direction` is a signed real (Vision Round-1 decision: signed-axis-direction)
    indicating the axis polarity / scan direction. +1 = forward, -1 = reverse.
    """

    domain: LaneDomain = LaneDomain.T
    direction: float = 1.0
    binding_rule: BindingRule = BindingRule.BROADCAST
    interp_mode: InterpMode = InterpMode.LINEAR
    loop_mode: LoopMode = LoopMode.OFF

    def to_dict(self) -> dict[str, Any]:
        return {
            "domain": self.domain.value,
            "direction": float(self.direction),
            "binding_rule": self.binding_rule.value,
            "interp_mode": self.interp_mode.value,
            "loop_mode": self.loop_mode.value,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Lane":
        return cls(
            domain=LaneDomain(data.get("domain", "t")),
            direction=float(data.get("direction", 1.0)),
            binding_rule=BindingRule(data.get("binding_rule", "broadcast")),
            interp_mode=InterpMode(data.get("interp_mode", "linear")),
            loop_mode=LoopMode(data.get("loop_mode", "off")),
        )


@dataclass(frozen=True)
class ModEdge:
    """B4-lite mod-edge — one modulation routing.

    Fields match Vision §6 B4-lite spec exactly: (src, src_axis, dst, dst_axis,
    binding_rule, depth). `depth` is the per-edge modulation amount (signed real,
    -1.0 to 1.0 nominal).
    """

    src: str
    src_axis: LaneDomain
    dst: str
    dst_axis: LaneDomain
    binding_rule: BindingRule = BindingRule.BROADCAST
    depth: float = 1.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "src": self.src,
            "src_axis": self.src_axis.value,
            "dst": self.dst,
            "dst_axis": self.dst_axis.value,
            "binding_rule": self.binding_rule.value,
            "depth": float(self.depth),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ModEdge":
        return cls(
            src=str(data["src"]),
            src_axis=LaneDomain(data["src_axis"]),
            dst=str(data["dst"]),
            dst_axis=LaneDomain(data["dst_axis"]),
            binding_rule=BindingRule(data.get("binding_rule", "broadcast")),
            depth=float(data.get("depth", 1.0)),
        )


class UnimplementedBindingRuleError(ValueError):
    """Raised by writer-side validator when a non-Tier-1 binding rule appears on save."""


def validate_for_save(edge: ModEdge) -> None:
    """B4-lite writer-side validator (Vision §6 B4-lite).

    Rejects any binding_rule outside the currently-accepted set. P5b.21 (B9)
    widened Tier 1 to broadcast / sampleAt / scanOver / integrate; the four
    research rules (painted/hilbert/polar/learned) are accepted ONLY when
    EXPERIMENTAL_AXIS_BINDINGS is on.

    This prevents schema-vs-implementation drift: the schema accepts all 8 rules
    forever (forward-compat read), but the writer refuses to save a rule that
    the engine cannot honor today.
    """
    accepted = accepted_binding_rules()
    if edge.binding_rule not in accepted:
        impl = sorted(r.value for r in accepted)
        raise UnimplementedBindingRuleError(
            f"binding_rule={edge.binding_rule.value!r} not accepted "
            f"(flag-gated research rule with EXPERIMENTAL_AXIS_BINDINGS off). "
            f"Accepted rules: {impl}. "
            f"Edge: {edge.src}.{edge.src_axis.value} -> {edge.dst}.{edge.dst_axis.value}"
        )


def validate_edges_for_save(edges: list[ModEdge]) -> None:
    """Bulk validator — runs on project save (Vision §6 B4-lite contract).

    Raises UnimplementedBindingRuleError on first offending edge with full context.
    """
    for edge in edges:
        validate_for_save(edge)


@dataclass
class ParamAutomation:
    """A parameter with its B1 lane attached (Vision §6 B1 universal coverage).

    Stored alongside the param in the project schema. Engine reads `lane.domain` to
    decide what axis basis to sample over; `direction` controls scan polarity.
    """

    param_id: str
    lane: Lane = field(default_factory=Lane)

    def to_dict(self) -> dict[str, Any]:
        return {"param_id": self.param_id, "lane": self.lane.to_dict()}

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ParamAutomation":
        return cls(
            param_id=str(data["param_id"]), lane=Lane.from_dict(data.get("lane", {}))
        )
