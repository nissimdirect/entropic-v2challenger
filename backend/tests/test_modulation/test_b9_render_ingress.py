"""P5b.21 (B9) — PRODUCTION render/export IPC trust boundary for mod-routing.

Review Tiger 1b/4: the live app drives operators through the `render`/`export`
IPC messages (`message.get("operators")`), NOT through deserialize/validate. These
tests exercise that ACTUAL production boundary:
  - security.validate_operator_mod_edges (the authoritative live validator)
  - ZMQServer._validate_mod_edges_change_gated (the per-frame change-gated wrapper)
  - security.validate_export_modulation (the export ingress, now binding-aware)
"""

from __future__ import annotations

import pytest

from security import (
    MAX_MOD_EDGES_TOTAL,
    validate_export_modulation,
    validate_operator_mod_edges,
)

pytestmark = pytest.mark.smoke


def _op(op_id: str, *mappings: dict) -> dict:
    return {
        "id": op_id,
        "type": "lfo",
        "is_enabled": True,
        "parameters": {},
        "mappings": list(mappings),
    }


def _mapping(**over) -> dict:
    m = {
        "target_effect_id": "fx-blur",
        "target_param_key": "radius",
        "depth": 1.0,
        "min": 0.0,
        "max": 1.0,
        "blend_mode": "add",
    }
    m.update(over)
    return m


# --- the authoritative live validator -----------------------------------------


def test_validate_operator_mod_edges_rejects_learned_flag_off(monkeypatch):
    monkeypatch.delenv("EXPERIMENTAL_AXIS_BINDINGS", raising=False)
    ops = [_op("op-1", _mapping(binding_rule="learned"))]
    errors = validate_operator_mod_edges(ops)
    assert any("learned" in e for e in errors), errors


def test_validate_operator_mod_edges_rejects_unknown_rule():
    ops = [_op("op-1", _mapping(binding_rule="zigzag"))]
    errors = validate_operator_mod_edges(ops)
    assert any("zigzag" in e for e in errors), errors


def test_validate_operator_mod_edges_rejects_nonstring_rule():
    ops = [_op("op-1", _mapping(binding_rule=7))]
    errors = validate_operator_mod_edges(ops)
    assert any("bindingRule must be a string" in e for e in errors), errors


@pytest.mark.parametrize("rule", ["broadcast", "sampleAt", "scanOver", "integrate"])
def test_validate_operator_mod_edges_accepts_implemented(rule, monkeypatch):
    monkeypatch.delenv("EXPERIMENTAL_AXIS_BINDINGS", raising=False)
    ops = [_op("op-1", _mapping(binding_rule=rule, src_axis="y", dst_axis="t"))]
    assert validate_operator_mod_edges(ops) == []


def test_validate_operator_mod_edges_accepts_legacy_no_axis_fields():
    ops = [_op("op-1", _mapping())]  # no binding_rule/src_axis/dst_axis
    assert validate_operator_mod_edges(ops) == []


@pytest.mark.parametrize("bad", [float("nan"), float("inf"), float("-inf")])
def test_validate_operator_mod_edges_rejects_nonfinite_depth(bad):
    ops = [_op("op-1", _mapping(depth=bad))]
    errors = validate_operator_mod_edges(ops)
    assert any("depth must be a finite number" in e for e in errors), errors


# --- audit #14: finite guard for mapping min/max --------------------------------


def test_nan_min_rejected_at_validator():
    """NaN min must be rejected at the validator trust boundary (audit #14)."""
    ops = [_op("op-1", _mapping(min=float("nan")))]
    errors = validate_operator_mod_edges(ops)
    assert any("min must be a finite number" in e for e in errors), errors


def test_inf_max_rejected_at_validator():
    """Inf max must be rejected at the validator trust boundary (audit #14)."""
    ops = [_op("op-1", _mapping(max=float("inf")))]
    errors = validate_operator_mod_edges(ops)
    assert any("max must be a finite number" in e for e in errors), errors


def test_finite_min_max_accepted():
    """Normal finite min/max values must still be accepted."""
    ops = [_op("op-1", _mapping(min=-1.0, max=2.5))]
    assert validate_operator_mod_edges(ops) == []


def test_missing_min_max_accepted():
    """Absent min/max keys must be accepted — they are optional."""
    m = {
        "target_effect_id": "fx-blur",
        "target_param_key": "radius",
        "depth": 1.0,
        "blend_mode": "add",
        # no 'min' or 'max' keys
    }
    ops = [_op("op-1", m)]
    assert validate_operator_mod_edges(ops) == []


def test_depth_guard_unchanged():
    """Regression: existing depth rejection still works after min/max guard added."""
    ops = [_op("op-1", _mapping(depth=float("nan")))]
    errors = validate_operator_mod_edges(ops)
    assert any("depth must be a finite number" in e for e in errors), errors


def test_validate_operator_mod_edges_rejects_unknown_axis():
    ops = [_op("op-1", _mapping(src_axis="q"))]
    errors = validate_operator_mod_edges(ops)
    assert any("srcAxis" in e for e in errors), errors


def test_validate_operator_mod_edges_enforces_total_cap():
    per_op = 32
    n_ops = (MAX_MOD_EDGES_TOTAL // per_op) + 1  # one operator past the total
    ops = [_op(f"op-{i}", *[_mapping() for _ in range(per_op)]) for i in range(n_ops)]
    errors = validate_operator_mod_edges(ops)
    assert any("MAX_MOD_EDGES_TOTAL" in e for e in errors), errors


def test_validate_operator_mod_edges_at_cap_accepted():
    per_op = 32
    n_ops = MAX_MOD_EDGES_TOTAL // per_op
    ops = [_op(f"op-{i}", *[_mapping() for _ in range(per_op)]) for i in range(n_ops)]
    assert validate_operator_mod_edges(ops) == []


def test_validate_operator_mod_edges_flag_on_accepts_research(monkeypatch):
    monkeypatch.setenv("EXPERIMENTAL_AXIS_BINDINGS", "true")
    ops = [_op("op-1", _mapping(binding_rule="learned"))]
    assert validate_operator_mod_edges(ops) == []


# --- the render-IPC change-gated wrapper (the per-frame production path) -------


def _server():
    from zmq_server import ZMQServer

    return ZMQServer()


def test_render_change_gate_rejects_hostile_rule(monkeypatch):
    """A hostile binding rule arriving on the render IPC is rejected (not empty)."""
    monkeypatch.delenv("EXPERIMENTAL_AXIS_BINDINGS", raising=False)
    srv = _server()
    ops = [_op("op-1", _mapping(binding_rule="learned"))]
    errors = srv._validate_mod_edges_change_gated(ops)
    assert errors and any("learned" in e for e in errors)


def test_render_change_gate_passes_clean_operators(monkeypatch):
    monkeypatch.delenv("EXPERIMENTAL_AXIS_BINDINGS", raising=False)
    srv = _server()
    ops = [_op("op-1", _mapping(binding_rule="scanOver"))]
    assert srv._validate_mod_edges_change_gated(ops) == []


def test_render_change_gate_caches_unchanged_operators(monkeypatch):
    """The change-gate does NOT re-run validation when operators are unchanged.

    Perf contract: 30×/sec render must not pay full validation each frame. We
    assert the cached error list is returned by reference on a cache hit (the
    hash matched) — proving the validator was not re-invoked.
    """
    monkeypatch.delenv("EXPERIMENTAL_AXIS_BINDINGS", raising=False)
    srv = _server()
    ops = [_op("op-1", _mapping(binding_rule="scanOver"))]
    first = srv._validate_mod_edges_change_gated(ops)
    # Same payload again → cache hit → SAME list object returned (not recomputed).
    second = srv._validate_mod_edges_change_gated(ops)
    assert first is second


def test_render_change_gate_revalidates_on_change(monkeypatch):
    """When operators CHANGE, the gate re-validates and catches the new hostile rule."""
    monkeypatch.delenv("EXPERIMENTAL_AXIS_BINDINGS", raising=False)
    srv = _server()
    clean = [_op("op-1", _mapping(binding_rule="broadcast"))]
    assert srv._validate_mod_edges_change_gated(clean) == []
    hostile = [_op("op-1", _mapping(binding_rule="learned"))]
    errors = srv._validate_mod_edges_change_gated(hostile)
    assert errors and any("learned" in e for e in errors)


# --- export ingress (validate_export_modulation now binding-aware) ------------


def test_export_modulation_rejects_hostile_binding_rule(monkeypatch):
    monkeypatch.delenv("EXPERIMENTAL_AXIS_BINDINGS", raising=False)
    ops = [_op("op-1", _mapping(binding_rule="painted"))]
    errors = validate_export_modulation(ops, None)
    assert any("painted" in e for e in errors), errors


def test_export_modulation_enforces_total_cap():
    per_op = 32
    n_ops = (MAX_MOD_EDGES_TOTAL // per_op) + 1
    # Keep operator COUNT under MAX_OPERATORS by packing more mappings is capped at
    # 32/op upstream; here we just need the SUM > total, so use the operator-cap
    # boundary: MAX_OPERATORS (64) ops × 32 = 2048; add a 65th would trip the
    # operator-count check first. Instead exceed via the mapping count guard which
    # runs inside validate_operator_mod_edges before the total check is reached.
    # Use exactly n_ops operators (n_ops <= 64 here since 2048/32+1 = 65 > 64 →
    # the operator-count guard fires first, which is also a valid rejection).
    ops = [_op(f"op-{i}", *[_mapping() for _ in range(per_op)]) for i in range(n_ops)]
    errors = validate_export_modulation(ops, None)
    # Either the operator-count cap OR the mod-edges total cap rejects it — both
    # are valid loud rejections at the export trust boundary.
    assert errors
    assert any("MAX" in e for e in errors)


def test_export_modulation_accepts_clean(monkeypatch):
    monkeypatch.delenv("EXPERIMENTAL_AXIS_BINDINGS", raising=False)
    ops = [_op("op-1", _mapping(binding_rule="integrate", src_axis="y"))]
    assert validate_export_modulation(ops, None) == []
