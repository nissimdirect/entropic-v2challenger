"""Tests for B1 lane schema + B4-lite mod-edge schema + writer-side validator.

Vision §6 B1 + B4-lite Tier 1 deliverables.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

BACKEND_SRC = Path(__file__).resolve().parents[2] / "src"
if str(BACKEND_SRC) not in sys.path:
    sys.path.insert(0, str(BACKEND_SRC))

from modulation.schema import (  # noqa: E402
    BindingRule,
    InterpMode,
    Lane,
    LaneDomain,
    LoopMode,
    ModEdge,
    ParamAutomation,
    TIER1_IMPLEMENTED_RULES,
    UnimplementedBindingRuleError,
    validate_edges_for_save,
    validate_for_save,
)


# ---- LaneDomain ----


@pytest.mark.smoke
def test_lane_domain_has_six_axes():
    """Vision §4: 6D — T/Y/X/C/F/L."""
    assert {d.value for d in LaneDomain} == {"t", "y", "x", "c", "f", "l"}


# ---- BindingRule ----


@pytest.mark.smoke
def test_binding_rule_has_five_rules():
    """Vision §7: five binding rules — broadcast / sample_at / scan_over / integrate / painted."""
    assert {r.value for r in BindingRule} == {
        "broadcast",
        "sample_at",
        "scan_over",
        "integrate",
        "painted",
    }


@pytest.mark.smoke
def test_tier1_only_broadcast_implemented():
    """Vision §6 B4-lite: only broadcast is implemented in Tier 1."""
    assert TIER1_IMPLEMENTED_RULES == frozenset({BindingRule.BROADCAST})


# ---- Lane ----


@pytest.mark.smoke
def test_lane_default_is_broadcast_time_forward():
    lane = Lane()
    assert lane.domain == LaneDomain.T
    assert lane.direction == 1.0
    assert lane.binding_rule == BindingRule.BROADCAST
    assert lane.interp_mode == InterpMode.LINEAR
    assert lane.loop_mode == LoopMode.OFF


@pytest.mark.smoke
def test_lane_signed_direction():
    """Vision Round-1: signed-axis-direction (-1 = reverse)."""
    lane = Lane(direction=-1.0)
    assert lane.direction == -1.0


@pytest.mark.smoke
def test_lane_round_trip_through_dict():
    lane = Lane(
        domain=LaneDomain.Y,
        direction=-1.0,
        binding_rule=BindingRule.BROADCAST,
        interp_mode=InterpMode.EASE_IN_OUT,
        loop_mode=LoopMode.PING_PONG,
    )
    assert Lane.from_dict(lane.to_dict()) == lane


@pytest.mark.smoke
def test_lane_round_trip_preserves_unknown_future_rules_via_enum():
    """Forward-compat: schema accepts all 5 rules forever; only writer restricts."""
    for rule in BindingRule:
        lane = Lane(binding_rule=rule)
        assert Lane.from_dict(lane.to_dict()).binding_rule == rule


# ---- ModEdge ----


@pytest.mark.smoke
def test_modedge_full_schema():
    """B4-lite spec: (src, src_axis, dst, dst_axis, binding_rule, depth)."""
    edge = ModEdge(
        src="lfo1",
        src_axis=LaneDomain.T,
        dst="track1.fx-blur.radius",
        dst_axis=LaneDomain.T,
        binding_rule=BindingRule.BROADCAST,
        depth=0.5,
    )
    d = edge.to_dict()
    assert set(d.keys()) == {
        "src",
        "src_axis",
        "dst",
        "dst_axis",
        "binding_rule",
        "depth",
    }
    assert ModEdge.from_dict(d) == edge


@pytest.mark.smoke
def test_modedge_default_is_broadcast_full_depth():
    edge = ModEdge(src="a", src_axis=LaneDomain.T, dst="b", dst_axis=LaneDomain.T)
    assert edge.binding_rule == BindingRule.BROADCAST
    assert edge.depth == 1.0


# ---- Writer-side validator (the core B4-lite contract) ----


@pytest.mark.smoke
def test_validate_for_save_accepts_broadcast():
    edge = ModEdge(src="a", src_axis=LaneDomain.T, dst="b", dst_axis=LaneDomain.T)
    validate_for_save(edge)  # no raise


@pytest.mark.smoke
@pytest.mark.parametrize(
    "rule",
    [
        BindingRule.SAMPLE_AT,
        BindingRule.SCAN_OVER,
        BindingRule.INTEGRATE,
        BindingRule.PAINTED,
    ],
)
def test_validate_for_save_rejects_non_broadcast(rule):
    """B4-lite writer-side validator REJECTS non-broadcast on save."""
    edge = ModEdge(
        src="a",
        src_axis=LaneDomain.T,
        dst="b",
        dst_axis=LaneDomain.T,
        binding_rule=rule,
    )
    with pytest.raises(UnimplementedBindingRuleError, match=rule.value):
        validate_for_save(edge)


@pytest.mark.smoke
def test_validate_bulk_rejects_first_offending():
    edges = [
        ModEdge(src="a", src_axis=LaneDomain.T, dst="b", dst_axis=LaneDomain.T),
        ModEdge(
            src="c",
            src_axis=LaneDomain.T,
            dst="d",
            dst_axis=LaneDomain.T,
            binding_rule=BindingRule.PAINTED,
        ),
    ]
    with pytest.raises(UnimplementedBindingRuleError, match="painted"):
        validate_edges_for_save(edges)


@pytest.mark.smoke
def test_validate_error_message_includes_edge_context():
    """Error must name the offending edge so the user can fix the right one."""
    edge = ModEdge(
        src="lfo7",
        src_axis=LaneDomain.T,
        dst="fx-blur.radius",
        dst_axis=LaneDomain.T,
        binding_rule=BindingRule.SCAN_OVER,
    )
    with pytest.raises(UnimplementedBindingRuleError) as exc:
        validate_for_save(edge)
    msg = str(exc.value)
    assert "lfo7" in msg
    assert "fx-blur.radius" in msg
    assert "scan_over" in msg


# ---- ParamAutomation (B1 universal coverage primitive) ----


@pytest.mark.smoke
def test_param_automation_round_trip():
    pa = ParamAutomation(
        param_id="track1.fx-blur.radius",
        lane=Lane(domain=LaneDomain.Y, direction=-1.0),
    )
    assert ParamAutomation.from_dict(pa.to_dict()) == pa


# ---- Forward-compat read (the other half of B4-lite) ----


@pytest.mark.smoke
def test_reader_accepts_all_five_rules():
    """Forward-compat: reader must accept all 5 binding rules; writer is the gate."""
    for rule in BindingRule:
        d = {
            "src": "a",
            "src_axis": "t",
            "dst": "b",
            "dst_axis": "t",
            "binding_rule": rule.value,
            "depth": 1.0,
        }
        edge = ModEdge.from_dict(d)
        assert edge.binding_rule == rule


@pytest.mark.smoke
def test_reader_uses_broadcast_default_when_rule_omitted():
    """Backward-compat: old projects without binding_rule field default to broadcast."""
    d = {"src": "a", "src_axis": "t", "dst": "b", "dst_axis": "t"}
    edge = ModEdge.from_dict(d)
    assert edge.binding_rule == BindingRule.BROADCAST
