"""Audit #13 — B9 binding rules WIRED into the live resolver (resolve_routings).

Pre-fix, resolve_routings ignored each mapping's binding_rule: sampleAt /
scanOver / integrate were UI-selectable, schema-validated, persisted — and INERT.
resolve_axis_binding (the implemented semantics) had ZERO production callers.

These tests pin the fix at the PRODUCTION boundary (resolve_routings, the resolver
engine.py:apply_modulation calls every frame):

  * broadcast (and absent) stay BYTE-IDENTICAL to the pre-fix golden vector —
    legacy projects cannot change.
  * a MULTI-SAMPLE source axis (a kentaroCluster's sub-LFOs, exposed at
    values[f"{op_id}/lfo{i}"]) now makes sampleAt / scanOver / integrate produce
    DIFFERENT, correct values — the exact inertness the audit flagged.

Hand-computed golden: base radius 0.0, param range [0,1], depth 1.0, blend add.
  new = base + (m_min + signal*(m_max-m_min))*depth * (m_max - m_min ... )
For min=0,max=1,depth=1,add: new_value = 0.0 + signal*1.0 * 1.0 = signal.
"""

from __future__ import annotations

import inspect

import pytest

from modulation import routing
from modulation.routing import resolve_routings

pytestmark = pytest.mark.smoke


def _chain():
    return [
        {"effect_id": "fx-blur", "enabled": True, "params": {"radius": 0.0}, "mix": 1.0}
    ]


def _ops(rule=None, *, op_id="op-1"):
    m = {
        "target_effect_id": "fx-blur",
        "target_param_key": "radius",
        "depth": 1.0,
        "min": 0.0,
        "max": 1.0,
        "blend_mode": "add",
    }
    if rule is not None:
        m["binding_rule"] = rule
    return [{"id": op_id, "is_enabled": True, "mappings": [m]}]


def _radius(operator_values, ops):
    return resolve_routings(operator_values, ops, _chain())[0]["params"]["radius"]


# --- broadcast byte-identity (legacy guard) -----------------------------------

# Pinned PRE-FIX golden vector: with signal 1.0, depth 1.0, range [0,1], blend add,
# the legacy resolver produced radius == 1.0 (base 0.0 + 1.0). This is the exact
# value pre-fix resolve_routings returned; the fix MUST not change it.
_BROADCAST_GOLDEN = 1.0


def test_broadcast_byte_identical_to_prefix():
    """binding_rule='broadcast' AND absent both equal the pinned pre-fix golden.

    This is the regression guard: legacy projects (no binding_rule) and explicit
    broadcast mappings render byte-identically to before audit #13's fix.
    """
    absent = _radius({"op-1": 1.0}, _ops(None))
    broadcast = _radius({"op-1": 1.0}, _ops("broadcast"))
    assert absent == pytest.approx(_BROADCAST_GOLDEN)
    assert broadcast == pytest.approx(_BROADCAST_GOLDEN)
    # And identical to each other (no drift between the two legacy spellings).
    assert absent == broadcast


def test_scalar_source_all_rules_collapse_to_broadcast():
    """With a SINGLE-scalar operator (length-1 axis), every rule collapses to the
    broadcast value — so legacy single-scalar operators are unaffected by the wiring.
    """
    vals = {"op-1": 1.0}
    bc = _radius(vals, _ops("broadcast"))
    for rule in ("sampleAt", "scanOver", "integrate"):
        assert _radius(vals, _ops(rule)) == pytest.approx(bc), rule


# --- multi-sample axis: the rules now DIFFER (the bug is fixed) ----------------

# A kentaroCluster-style source: master 0.5, sub-LFO axis [0.1, 0.2, 0.3] exposed
# at op-1/lfo0..2. broadcast reads the master (0.5); the axis rules read the axis.
_MULTI = {"op-1": 0.5, "op-1/lfo0": 0.1, "op-1/lfo1": 0.2, "op-1/lfo2": 0.3}


def test_sampleAt_reads_single_index():
    """sampleAt now produces the indexed axis value (index 0 → 0.1), DIFFERENT
    from broadcast (0.5)."""
    bc = _radius(_MULTI, _ops("broadcast"))
    sa = _radius(_MULTI, _ops("sampleAt"))
    assert sa == pytest.approx(0.1)
    assert sa != pytest.approx(bc)


def test_scanOver_per_row_vector():
    """scanOver to a SCALAR dst collapses the axis to its mean (mean[0.1,0.2,0.3]
    = 0.2), DIFFERENT from broadcast (0.5)."""
    bc = _radius(_MULTI, _ops("broadcast"))
    sc = _radius(_MULTI, _ops("scanOver"))
    assert sc == pytest.approx(0.2)
    assert sc != pytest.approx(bc)


def test_integrate_cumulative():
    """integrate accumulates the axis (0.1+0.2+0.3 = 0.6), DIFFERENT from broadcast
    (0.5) — THE EXACT AUDIT BUG: integrate must not equal broadcast."""
    bc = _radius(_MULTI, _ops("broadcast"))
    ig = _radius(_MULTI, _ops("integrate"))
    assert ig == pytest.approx(0.6)
    assert ig != pytest.approx(bc)


def test_integrate_now_differs_from_broadcast_repro():
    """Direct re-statement of the audit repro: same mapping, integrate vs broadcast
    vs absent — integrate now diverges where pre-fix all three were byte-identical."""
    bc = _radius(_MULTI, _ops("broadcast"))
    absent = _radius(_MULTI, _ops(None))
    ig = _radius(_MULTI, _ops("integrate"))
    assert bc == pytest.approx(absent)  # broadcast == legacy/absent (still)
    assert ig != pytest.approx(bc)  # integrate now DIFFERS (the fix)


# --- resolve_axis_binding now has a live caller -------------------------------


def test_resolve_axis_binding_now_has_live_caller():
    """resolve_routings (the live resolver) now invokes resolve_axis_binding —
    previously it had ZERO production callers (audit #13's root cause).

    Evidence (a): the resolver source references resolve_axis_binding.
    Evidence (b): behavioral — a non-broadcast multi-sample axis produces the
    resolve_axis_binding result, which the legacy path could not.
    """
    src = inspect.getsource(routing.resolve_routings)
    assert "resolve_axis_binding(" in src, (
        "resolve_routings must call resolve_axis_binding on the binding-rule path"
    )
    # Behavioral proof: integrate over the sub-LFO axis == resolve_axis_binding's
    # cumulative total (0.6), which the broadcast/legacy scalar path cannot yield.
    assert _radius(_MULTI, _ops("integrate")) == pytest.approx(0.6)


# --- field destination still flag-gated ---------------------------------------


def test_field_destination_still_flag_gated(monkeypatch):
    """The live resolver always requests a SCALAR destination — scanOver collapses
    to its mean and NEVER emits a field/vector into the param, regardless of the
    EXPERIMENTAL_FIELD_DST flag. So a param value stays a scalar float and the
    flag-gated 2D path is not silently enabled here.
    """
    # Flag OFF: scanOver still resolves (scalar mean), no FieldDestinationDisabledError.
    monkeypatch.delenv("EXPERIMENTAL_FIELD_DST", raising=False)
    v_off = _radius(_MULTI, _ops("scanOver"))
    assert isinstance(v_off, float)
    assert v_off == pytest.approx(0.2)

    # Flag ON: the resolver STILL requests scalar (field_dst=False), so the param
    # value is the same scalar mean — the flag does not change the resolver path.
    monkeypatch.setenv("EXPERIMENTAL_FIELD_DST", "true")
    v_on = _radius(_MULTI, _ops("scanOver"))
    assert isinstance(v_on, float)
    assert v_on == pytest.approx(v_off)


# --- defensive: an unknown rule never raises in the hot path ------------------


def test_unknown_rule_falls_back_not_raises():
    """A rule that slips past the upstream validators (defense in depth) falls back
    to the broadcast scalar — the per-frame render path NEVER raises."""
    # 'painted' is a research rule rejected at the trust boundaries; if it reached
    # the resolver it must degrade to the legacy scalar, not crash the render.
    v = _radius(_MULTI, _ops("painted"))
    assert v == pytest.approx(0.5)  # master scalar broadcast fallback
