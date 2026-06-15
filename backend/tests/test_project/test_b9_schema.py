"""P5b.21 (B9) — load-time validation of axis-extended OperatorMapping fields.

The LOADER (project.schema.validate / deserialize) is the trust boundary for the
B9 mod-routing fields (srcAxis / dstAxis / bindingRule / depth). A hand-edited /
hostile project carrying a flag-gated research rule, an unknown rule, a non-string
rule, or a malformed axis / non-finite depth is REJECTED LOUDLY — never coerced
(SPEC-2 §4 no-silent-fallback).
"""

from __future__ import annotations

import pytest

from project.schema import deserialize, new_project, serialize, validate
from security import MAX_MOD_EDGES_TOTAL

pytestmark = pytest.mark.smoke


def _project_with_mapping(mapping: dict) -> dict:
    """A valid v3 project carrying one operator with one mapping."""
    p = new_project(author="b9")
    p["operators"] = [
        {
            "id": "op-1",
            "type": "lfo",
            "is_enabled": True,
            "parameters": {"waveform": "sine", "rate_hz": 1.0},
            "processing": [],
            "mappings": [mapping],
        }
    ]
    return p


def _base_mapping(**overrides) -> dict:
    m = {
        "target_effect_id": "fx-blur",
        "target_param_key": "radius",
        "depth": 1.0,
        "min": 0.0,
        "max": 1.0,
        "curve": "linear",
        "blend_mode": "add",
    }
    m.update(overrides)
    return m


# --- research rules rejected when the flag is off -----------------------------


def test_load_rejects_painted_flag_off(monkeypatch):
    monkeypatch.delenv("EXPERIMENTAL_AXIS_BINDINGS", raising=False)
    p = _project_with_mapping(_base_mapping(bindingRule="painted"))
    errors = validate(p)
    assert any("painted" in e for e in errors), errors


def test_load_rejects_hilbert_flag_off(monkeypatch):
    monkeypatch.delenv("EXPERIMENTAL_AXIS_BINDINGS", raising=False)
    p = _project_with_mapping(_base_mapping(bindingRule="hilbert"))
    errors = validate(p)
    assert any("hilbert" in e for e in errors), errors


def test_load_rejects_polar_flag_off(monkeypatch):
    monkeypatch.delenv("EXPERIMENTAL_AXIS_BINDINGS", raising=False)
    p = _project_with_mapping(_base_mapping(bindingRule="polar"))
    errors = validate(p)
    assert any("polar" in e for e in errors), errors


def test_load_rejects_learned_flag_off(monkeypatch):
    monkeypatch.delenv("EXPERIMENTAL_AXIS_BINDINGS", raising=False)
    p = _project_with_mapping(_base_mapping(bindingRule="learned"))
    errors = validate(p)
    assert any("learned" in e for e in errors), errors


# --- unknown / non-string rules -----------------------------------------------


def test_load_rejects_unknown_binding_rule(monkeypatch):
    monkeypatch.delenv("EXPERIMENTAL_AXIS_BINDINGS", raising=False)
    p = _project_with_mapping(_base_mapping(bindingRule="zigzag"))
    errors = validate(p)
    assert any("zigzag" in e for e in errors), errors


@pytest.mark.parametrize("bad", [3, None, {"x": 1}, [1, 2]])
def test_load_rejects_nonstring_binding_rule(bad):
    # `None` is treated as "absent" (defaults to broadcast) — exclude it.
    if bad is None:
        p = _project_with_mapping(_base_mapping())  # no bindingRule key at all
        assert validate(p) == []
        return
    p = _project_with_mapping(_base_mapping(bindingRule=bad))
    errors = validate(p)
    assert any("bindingRule must be a string" in e for e in errors), errors


# --- accepted (implemented) rules pass ----------------------------------------


@pytest.mark.parametrize("rule", ["broadcast", "sampleAt", "scanOver", "integrate"])
def test_load_accepts_implemented_rules(rule, monkeypatch):
    monkeypatch.delenv("EXPERIMENTAL_AXIS_BINDINGS", raising=False)
    p = _project_with_mapping(_base_mapping(bindingRule=rule, srcAxis="y", dstAxis="t"))
    assert validate(p) == []


def test_load_accepts_defaults_for_missing_fields():
    """An old mapping with NO axis fields loads cleanly (defaults t/t/broadcast)."""
    p = _project_with_mapping(_base_mapping())  # no srcAxis/dstAxis/bindingRule
    assert validate(p) == []
    # And it round-trips byte-identically (no axis keys injected).
    restored = deserialize(serialize(p))
    m = restored["operators"][0]["mappings"][0]
    assert "srcAxis" not in m and "dstAxis" not in m and "bindingRule" not in m


# --- axis validation ----------------------------------------------------------


def test_load_rejects_unknown_axis():
    p = _project_with_mapping(_base_mapping(srcAxis="q"))
    errors = validate(p)
    assert any("srcAxis" in e for e in errors), errors


def test_load_rejects_nonstring_axis():
    p = _project_with_mapping(_base_mapping(dstAxis=5))
    errors = validate(p)
    assert any("dstAxis must be a string" in e for e in errors), errors


# --- depth finite guard -------------------------------------------------------


@pytest.mark.parametrize("bad_depth", [float("nan"), float("inf"), float("-inf")])
def test_load_rejects_nonfinite_depth(bad_depth):
    p = _project_with_mapping(_base_mapping(depth=bad_depth))
    errors = validate(p)
    assert any("depth must be a finite number" in e for e in errors), errors


# --- MAX_MOD_EDGES_TOTAL enforcement ------------------------------------------


def test_max_mod_edges_total_enforced():
    """A project whose total mapping count exceeds the cap is REJECTED."""
    p = new_project(author="b9")
    # Spread (cap + 1) mappings across two operators (per-op store cap is 32; the
    # loader cap is the project-wide SUM, so split to exceed it cleanly).
    half = (MAX_MOD_EDGES_TOTAL // 2) + 1
    p["operators"] = [
        {
            "id": f"op-{i}",
            "type": "lfo",
            "is_enabled": True,
            "parameters": {},
            "processing": [],
            "mappings": [_base_mapping() for _ in range(half)],
        }
        for i in range(2)
    ]
    errors = validate(p)
    assert any("MAX_MOD_EDGES_TOTAL" in e for e in errors), errors


def test_at_cap_mod_edges_accepted():
    """Exactly MAX_MOD_EDGES_TOTAL mappings is accepted (boundary)."""
    p = new_project(author="b9")
    # MAX_MOD_EDGES_TOTAL = 2048; spread across operators to stay valid shape.
    per_op = 32
    n_ops = MAX_MOD_EDGES_TOTAL // per_op
    p["operators"] = [
        {
            "id": f"op-{i}",
            "type": "lfo",
            "is_enabled": True,
            "parameters": {},
            "processing": [],
            "mappings": [_base_mapping() for _ in range(per_op)],
        }
        for i in range(n_ops)
    ]
    assert validate(p) == []


# --- hand-edited learned rule rejected with a clear, actionable error ----------


def test_hand_edited_learned_rule_rejected_with_clear_error(monkeypatch):
    """A hand-edited project with bindingRule:'learned' fails to LOAD clearly."""
    monkeypatch.delenv("EXPERIMENTAL_AXIS_BINDINGS", raising=False)
    p = _project_with_mapping(_base_mapping(bindingRule="learned"))
    json_str = serialize(p)
    with pytest.raises(ValueError) as exc:
        deserialize(json_str)
    msg = str(exc.value)
    assert "learned" in msg
    assert "not accepted" in msg


# --- flag ON accepts research rules (the other half) --------------------------


def test_load_accepts_learned_when_flag_on(monkeypatch):
    monkeypatch.setenv("EXPERIMENTAL_AXIS_BINDINGS", "true")
    p = _project_with_mapping(_base_mapping(bindingRule="learned"))
    assert validate(p) == []
