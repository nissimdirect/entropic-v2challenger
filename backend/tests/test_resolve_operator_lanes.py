"""AA.3-A — operator-sourced automation lanes: resolve_operator_lanes.

Drives the REAL resolver (modulation.routing.resolve_operator_lanes) directly,
mirroring the test style of resolve_mask_modulations / resolve_sampler_modulations
(test_mask_routing.py / test_sampler_scrub_speed_modulation.py).

Hard oracle bullets from docs/plans/2026-07-03-aa3-live-generators-spec.md §6:
  - LFO op value composes onto a base via add/multiply/max (exact numbers).
  - null base -> seeds from first operator mod (mirror composeModulatedValue).
  - denormalize + clamp to inverted [max,min] registry bounds.
  - non-finite operator value -> skipped, param untouched.
  - synthetic op with mappings:[] produces zero routing deltas (regression:
    resolve_routings unchanged).
"""

from modulation.routing import apply_blend_op, resolve_operator_lanes, resolve_routings


def _chain(effect_id, param_key, value):
    return [
        {
            "effect_id": effect_id,
            "enabled": True,
            "params": {param_key: value},
            "mix": 1.0,
        }
    ]


def _spec(param_path, operator_id, *, blend_op="add", depth=1.0, m_min=0.0, m_max=1.0):
    return {
        "param_path": param_path,
        "operator_id": operator_id,
        "blend_op": blend_op,
        "depth": depth,
        "min": m_min,
        "max": m_max,
    }


def _registry_fn(bounds):
    def _get(effect_id):
        return {"params": {k: {"min": v[0], "max": v[1]} for k, v in bounds.items()}}

    return _get


# ---------------------------------------------------------------------------
# apply_blend_op — pure unit
# ---------------------------------------------------------------------------


class TestApplyBlendOp:
    def test_add_default(self):
        assert apply_blend_op(0.3, 0.2, "add") == 0.3 + 0.2

    def test_multiply(self):
        assert apply_blend_op(0.5, 0.4, "multiply") == 0.5 * 0.4

    def test_max(self):
        assert apply_blend_op(0.2, 0.7, "max") == 0.7
        assert apply_blend_op(0.9, 0.1, "max") == 0.9

    def test_unknown_op_defaults_to_add(self):
        assert apply_blend_op(0.3, 0.2, "bogus") == 0.3 + 0.2


# ---------------------------------------------------------------------------
# Compose onto a present base — exact numbers, all three blend ops
# ---------------------------------------------------------------------------


class TestComposeOntoBase:
    def test_add_blend_exact(self):
        # base 0.5 normalized -> hue_shift.amount range [0,360]; LFO value 1.0,
        # min/max [0,1] depth 1.0 -> mod = 1.0; acc = 0.5 + 1.0 = 1.5 -> clamp 1.0
        # -> denormalize(1.0, 0, 360) = 360.0
        chain = _chain("fxhue", "amount", 90.0)  # pre-existing numeric base param
        specs = [_spec("fxhue.amount", "lfo1", blend_op="add")]
        values = {"lfo1": 1.0}
        base_map = {"fxhue.amount": 0.5}
        registry = _registry_fn({"amount": (0.0, 360.0)})

        result = resolve_operator_lanes(specs, values, base_map, chain, registry)
        assert result[0]["params"]["amount"] == 360.0

    def test_multiply_blend_exact(self):
        chain = _chain("fxblur", "radius", 0.0)
        specs = [_spec("fxblur.radius", "lfo1", blend_op="multiply")]
        values = {"lfo1": 0.5}
        # base 0.8, mod = min(0)+0.5*(max(1)-min(0))*depth(1) = 0.5 -> 0.8*0.5=0.4
        base_map = {"fxblur.radius": 0.8}
        registry = _registry_fn({"radius": (0.0, 100.0)})

        result = resolve_operator_lanes(specs, values, base_map, chain, registry)
        assert abs(result[0]["params"]["radius"] - 40.0) < 1e-9

    def test_max_blend_exact(self):
        chain = _chain("fxblur", "radius", 0.0)
        specs = [_spec("fxblur.radius", "lfo1", blend_op="max")]
        values = {"lfo1": 0.2}  # mod = 0.2
        base_map = {"fxblur.radius": 0.6}  # base > mod -> max stays at base
        registry = _registry_fn({"radius": (0.0, 100.0)})

        result = resolve_operator_lanes(specs, values, base_map, chain, registry)
        assert abs(result[0]["params"]["radius"] - 60.0) < 1e-9

    def test_depth_scales_mod(self):
        chain = _chain("fxblur", "radius", 0.0)
        specs = [_spec("fxblur.radius", "lfo1", blend_op="add", depth=0.5)]
        values = {"lfo1": 1.0}  # mod = 1.0 * depth 0.5 = 0.5
        base_map = {"fxblur.radius": 0.0}
        registry = _registry_fn({"radius": (0.0, 100.0)})

        result = resolve_operator_lanes(specs, values, base_map, chain, registry)
        assert abs(result[0]["params"]["radius"] - 50.0) < 1e-9

    def test_min_max_remap_scales_operator_value(self):
        chain = _chain("fxblur", "radius", 0.0)
        # operator value 1.0 remapped through [min=0.25, max=0.75] -> mod = 0.75
        specs = [_spec("fxblur.radius", "lfo1", blend_op="add", m_min=0.25, m_max=0.75)]
        values = {"lfo1": 1.0}
        base_map = {"fxblur.radius": 0.0}
        registry = _registry_fn({"radius": (0.0, 100.0)})

        result = resolve_operator_lanes(specs, values, base_map, chain, registry)
        assert abs(result[0]["params"]["radius"] - 75.0) < 1e-9


# ---------------------------------------------------------------------------
# Null base -> seed from first operator mod (mirror composeModulatedValue)
# ---------------------------------------------------------------------------


class TestNullBaseSeedsFromFirstMod:
    def test_single_spec_null_base_seeds_from_mod(self):
        chain = _chain("fxhue", "amount", 0.0)
        specs = [_spec("fxhue.amount", "lfo1", blend_op="add")]
        values = {"lfo1": 0.25}  # mod = 0.25 (min0/max1/depth1)
        base_map = {"fxhue.amount": None}
        registry = _registry_fn({"amount": (0.0, 360.0)})

        result = resolve_operator_lanes(specs, values, base_map, chain, registry)
        # acc seeded at mods[0] (0.25), no further mods to blend -> denorm(0.25,0,360)=90
        assert abs(result[0]["params"]["amount"] - 90.0) < 1e-9

    def test_missing_param_path_in_base_map_treated_as_null(self):
        chain = _chain("fxhue", "amount", 0.0)
        specs = [_spec("fxhue.amount", "lfo1", blend_op="add")]
        values = {"lfo1": 0.5}
        base_map = {}  # param_path absent entirely
        registry = _registry_fn({"amount": (0.0, 360.0)})

        result = resolve_operator_lanes(specs, values, base_map, chain, registry)
        assert abs(result[0]["params"]["amount"] - 180.0) < 1e-9

    def test_two_specs_null_base_first_seeds_second_blends(self):
        chain = _chain("fxhue", "amount", 0.0)
        specs = [
            _spec("fxhue.amount", "lfo1", blend_op="add"),
            _spec("fxhue.amount", "lfo2", blend_op="add"),
        ]
        values = {"lfo1": 0.2, "lfo2": 0.3}
        base_map = {"fxhue.amount": None}
        registry = _registry_fn({"amount": (0.0, 360.0)})

        result = resolve_operator_lanes(specs, values, base_map, chain, registry)
        # acc = mods[0]=0.2, then blend mods[1]=0.3 via add -> 0.5 -> denorm(0.5,0,360)=180
        assert abs(result[0]["params"]["amount"] - 180.0) < 1e-9


# ---------------------------------------------------------------------------
# Denormalize + clamp to INVERTED [max,min] registry bounds
# ---------------------------------------------------------------------------


class TestInvertedBounds:
    def test_inverted_registry_bounds_clamped_correctly(self):
        chain = _chain("fxthing", "amt", 5.0)
        specs = [_spec("fxthing.amt", "lfo1", blend_op="add")]
        values = {"lfo1": 1.0}
        base_map = {"fxthing.amt": 1.0}  # composed clamps to 1.0 -> denorm at hi end
        # Inverted bounds: min=100 (registry "min") > max=0 (registry "max").
        registry = _registry_fn({"amt": (100.0, 0.0)})

        result = resolve_operator_lanes(specs, values, base_map, chain, registry)
        # denormalize(1.0, 100, 0) = 100 + 1.0*(0-100) = 0.0; clamp to [min(100,0),
        # max(100,0)] = [0,100] -> 0.0 survives unclamped.
        assert result[0]["params"]["amt"] == 0.0

    def test_inverted_bounds_clamp_engages_when_over_range(self):
        chain = _chain("fxthing", "amt", 5.0)
        specs = [
            _spec("fxthing.amt", "lfo1", blend_op="add"),
            _spec("fxthing.amt", "lfo2", blend_op="add"),
        ]
        # Force acc above 1.0 pre-clamp (add blend): base 0.9 + two mods.
        values = {"lfo1": 1.0, "lfo2": 1.0}
        base_map = {"fxthing.amt": 0.9}
        registry = _registry_fn({"amt": (100.0, 0.0)})

        result = resolve_operator_lanes(specs, values, base_map, chain, registry)
        # composed clamps to 1.0 regardless -> denormalize(1.0,100,0) = 0.0, still
        # inside [0,100] clamp.
        assert result[0]["params"]["amt"] == 0.0


# ---------------------------------------------------------------------------
# Non-finite operator value -> skipped, param untouched
# ---------------------------------------------------------------------------


class TestNonFiniteSkipped:
    def test_nan_operator_value_skips_spec_param_untouched(self):
        chain = _chain("fxblur", "radius", 42.0)
        specs = [_spec("fxblur.radius", "lfo1", blend_op="add")]
        values = {"lfo1": float("nan")}
        base_map = {"fxblur.radius": 0.5}
        registry = _registry_fn({"radius": (0.0, 100.0)})

        result = resolve_operator_lanes(specs, values, base_map, chain, registry)
        assert result[0]["params"]["radius"] == 42.0  # untouched — no mods survived

    def test_inf_operator_value_skips_spec(self):
        chain = _chain("fxblur", "radius", 42.0)
        specs = [_spec("fxblur.radius", "lfo1", blend_op="add")]
        values = {"lfo1": float("inf")}
        base_map = {"fxblur.radius": 0.5}
        registry = _registry_fn({"radius": (0.0, 100.0)})

        result = resolve_operator_lanes(specs, values, base_map, chain, registry)
        assert result[0]["params"]["radius"] == 42.0

    def test_missing_operator_id_in_values_skips_spec(self):
        chain = _chain("fxblur", "radius", 42.0)
        specs = [_spec("fxblur.radius", "lfo-does-not-exist", blend_op="add")]
        values = {}  # operator id never evaluated (dropped op, etc.)
        base_map = {"fxblur.radius": 0.5}
        registry = _registry_fn({"radius": (0.0, 100.0)})

        result = resolve_operator_lanes(specs, values, base_map, chain, registry)
        assert result[0]["params"]["radius"] == 42.0

    def test_one_finite_one_nan_only_finite_contributes(self):
        chain = _chain("fxblur", "radius", 0.0)
        specs = [
            _spec("fxblur.radius", "bad", blend_op="add"),
            _spec("fxblur.radius", "good", blend_op="add"),
        ]
        values = {"bad": float("nan"), "good": 0.4}
        base_map = {"fxblur.radius": None}
        registry = _registry_fn({"radius": (0.0, 100.0)})

        result = resolve_operator_lanes(specs, values, base_map, chain, registry)
        # "bad" spec dropped entirely; "good" alone seeds acc = mod(0.4) -> denorm 40
        assert abs(result[0]["params"]["radius"] - 40.0) < 1e-9


# ---------------------------------------------------------------------------
# Trust boundary / never-raise defensive skips
# ---------------------------------------------------------------------------


class TestTrustBoundarySkips:
    def test_empty_operator_lanes_returns_chain_unchanged(self):
        chain = _chain("fxblur", "radius", 7.0)
        result = resolve_operator_lanes(
            [], {}, {}, chain, _registry_fn({"radius": (0, 100)})
        )
        assert result is chain
        assert result[0]["params"]["radius"] == 7.0

    def test_none_operator_lanes_returns_chain_unchanged(self):
        chain = _chain("fxblur", "radius", 7.0)
        result = resolve_operator_lanes(
            None, {}, {}, chain, _registry_fn({"radius": (0, 100)})
        )
        assert result is chain

    def test_unknown_effect_id_skipped_no_raise(self):
        chain = _chain("fxblur", "radius", 7.0)
        specs = [_spec("fxmissing.radius", "lfo1", blend_op="add")]
        result = resolve_operator_lanes(
            specs, {"lfo1": 1.0}, {}, chain, _registry_fn({"radius": (0, 100)})
        )
        assert result[0]["params"]["radius"] == 7.0

    def test_non_numeric_base_param_skipped_no_raise(self):
        # params[param_key] is a string (e.g. an enum) — not a lane target.
        chain = [
            {
                "effect_id": "fxthing",
                "enabled": True,
                "params": {"mode": "normal"},
                "mix": 1.0,
            }
        ]
        specs = [_spec("fxthing.mode", "lfo1", blend_op="add")]
        result = resolve_operator_lanes(
            specs, {"lfo1": 1.0}, {}, chain, _registry_fn({"mode": (0, 1)})
        )
        assert result[0]["params"]["mode"] == "normal"

    def test_missing_param_key_in_effect_params_skipped(self):
        chain = _chain("fxblur", "radius", 7.0)
        specs = [_spec("fxblur.nonexistent_param", "lfo1", blend_op="add")]
        result = resolve_operator_lanes(
            specs, {"lfo1": 1.0}, {}, chain, _registry_fn({"radius": (0, 100)})
        )
        assert result[0]["params"]["radius"] == 7.0  # untouched, no crash

    def test_malformed_spec_entries_skipped(self):
        chain = _chain("fxblur", "radius", 7.0)
        specs = ["not-a-dict", {"param_path": 123}, {"param_path": "noeffectdot"}, {}]
        result = resolve_operator_lanes(
            specs, {"lfo1": 1.0}, {}, chain, _registry_fn({"radius": (0, 100)})
        )
        assert result[0]["params"]["radius"] == 7.0


# ---------------------------------------------------------------------------
# Regression: synthetic op (mappings:[]) produces zero routing deltas
# ---------------------------------------------------------------------------


def test_dotted_real_effect_id_resolves_via_last_dot_split():
    """Regression guard: real registered effect ids are themselves dotted
    (e.g. "fx.hue_shift" — confirmed against effects.registry). A first-dot
    split of "fx.hue_shift.amount" would derive effect_id="fx" (never present
    in effect_map) and silently no-op every real project's operator lane.
    resolve_operator_lanes must split on the LAST dot so param_key ("amount",
    never dotted) is stripped correctly, leaving effect_id="fx.hue_shift"."""
    chain = [
        {
            "effect_id": "fx.hue_shift",
            "enabled": True,
            "params": {"amount": 0.0},
            "mix": 1.0,
        }
    ]
    specs = [_spec("fx.hue_shift.amount", "lfo1", blend_op="add")]
    values = {"lfo1": 0.5}
    base_map = {"fx.hue_shift.amount": None}
    registry = _registry_fn({"amount": (0.0, 360.0)})

    result = resolve_operator_lanes(specs, values, base_map, chain, registry)
    assert abs(result[0]["params"]["amount"] - 180.0) < 1e-9


def test_synthetic_lane_operator_mappings_empty_produces_zero_routing_deltas():
    """A synthetic lane operator (buildSyntheticLaneOperators) always carries
    mappings:[] — resolve_routings must iterate zero mappings for it and leave
    the chain's params exactly as they were (it exists only to be read by
    resolve_operator_lanes, never to modulate via the routing channel)."""
    chain = _chain("fxhue", "amount", 42.0)
    synthetic_op = {
        "id": "__lane__auto-1",
        "type": "lfo",
        "is_enabled": True,
        "parameters": {"waveform": "sine", "rate_hz": 1.0, "phase_offset": 0.0},
        "processing": [],
        "mappings": [],
    }
    values = {"__lane__auto-1": 0.9}

    result = resolve_routings(values, [synthetic_op], chain)
    assert result[0]["params"]["amount"] == 42.0  # unchanged — zero mapping deltas
