"""Tests for signal routing and DAG cycle detection."""

from modulation.routing import resolve_routings, check_cycle


def _make_chain(*effects):
    """Helper: create a chain from (effect_id, params) tuples."""
    return [
        {"effect_id": eid, "enabled": True, "params": dict(params), "mix": 1.0}
        for eid, params in effects
    ]


def _make_operator(op_id, mappings, is_enabled=True):
    return {
        "id": op_id,
        "is_enabled": is_enabled,
        "mappings": mappings,
    }


def _make_mapping(effect_id, param_key, depth=1.0, m_min=0.0, m_max=1.0, blend="add"):
    return {
        "target_effect_id": effect_id,
        "target_param_key": param_key,
        "depth": depth,
        "min": m_min,
        "max": m_max,
        "blend_mode": blend,
    }


class TestOneToMany:
    def test_lfo_to_two_params(self):
        """One operator modulates two different params."""
        chain = _make_chain(("hue_shift", {"amount": 0.5, "speed": 0.3}))
        ops = [
            _make_operator(
                "lfo1",
                [
                    _make_mapping("hue_shift", "amount"),
                    _make_mapping("hue_shift", "speed"),
                ],
            )
        ]
        values = {"lfo1": 0.5}

        result = resolve_routings(values, ops, chain)
        # amount: 0.5 + 0.5*1.0*1.0 = 1.0 (clamped)
        assert result[0]["params"]["amount"] == 1.0
        assert result[0]["params"]["speed"] == 0.8  # 0.3 + 0.5


class TestManyToOne:
    def test_two_operators_add(self):
        """Two operators modulate same param with add blend."""
        chain = _make_chain(("blur", {"radius": 0.0}))
        ops = [
            _make_operator(
                "lfo1", [_make_mapping("blur", "radius", depth=1.0, blend="add")]
            ),
            _make_operator(
                "lfo2", [_make_mapping("blur", "radius", depth=1.0, blend="add")]
            ),
        ]
        values = {"lfo1": 0.3, "lfo2": 0.2}

        result = resolve_routings(values, ops, chain)
        assert abs(result[0]["params"]["radius"] - 0.5) < 0.01

    def test_two_operators_multiply(self):
        """Two operators with multiply blend."""
        chain = _make_chain(("blur", {"radius": 0.0}))
        ops = [
            _make_operator(
                "lfo1", [_make_mapping("blur", "radius", depth=1.0, blend="multiply")]
            ),
            _make_operator(
                "lfo2", [_make_mapping("blur", "radius", depth=1.0, blend="multiply")]
            ),
        ]
        values = {"lfo1": 0.5, "lfo2": 0.5}

        result = resolve_routings(values, ops, chain)
        # multiply: 0.5 * 0.5 = 0.25
        assert abs(result[0]["params"]["radius"] - 0.25) < 0.01


class TestClampAndBounds:
    def test_clamp_to_param_bounds(self):
        """Registry bounds should clamp modulated values."""
        chain = _make_chain(("effect1", {"p": 0.5}))
        ops = [_make_operator("lfo1", [_make_mapping("effect1", "p", depth=1.0)])]
        values = {"lfo1": 1.0}

        def registry_fn(eid):
            return {"params": {"p": {"min": 0.0, "max": 0.8}}}

        result = resolve_routings(values, ops, chain, registry_fn)
        assert result[0]["params"]["p"] <= 0.8

    def test_depth_zero_no_change(self):
        """Depth 0 should result in no change."""
        chain = _make_chain(("fx", {"val": 0.5}))
        ops = [_make_operator("lfo1", [_make_mapping("fx", "val", depth=0.0)])]
        values = {"lfo1": 1.0}

        result = resolve_routings(values, ops, chain)
        assert result[0]["params"]["val"] == 0.5


class TestMissingEffect:
    def test_missing_effect_skipped(self):
        """Routing to non-existent effect should not crash."""
        chain = _make_chain(("blur", {"radius": 0.5}))
        ops = [_make_operator("lfo1", [_make_mapping("nonexistent", "param")])]
        values = {"lfo1": 0.5}

        result = resolve_routings(values, ops, chain)
        assert result[0]["params"]["radius"] == 0.5  # unchanged


class TestDisabledOperator:
    def test_disabled_operator_skipped(self):
        """Disabled operator should not modulate."""
        chain = _make_chain(("fx", {"val": 0.5}))
        ops = [_make_operator("lfo1", [_make_mapping("fx", "val")], is_enabled=False)]
        values = {"lfo1": 1.0}

        result = resolve_routings(values, ops, chain)
        assert result[0]["params"]["val"] == 0.5


class TestDAGCycleDetection:
    def test_cycle_detected(self):
        """A→B→C, adding C→A should be a cycle."""
        routings = [("A", "B"), ("B", "C")]
        assert check_cycle(routings, ("C", "A")) is True

    def test_no_cycle(self):
        """A→B, A→C should not be a cycle."""
        routings = [("A", "B")]
        assert check_cycle(routings, ("A", "C")) is False

    def test_fan_out_ok(self):
        """Fan-out: A→B, A→C is fine."""
        routings = [("A", "B")]
        assert check_cycle(routings, ("A", "C")) is False

    def test_self_loop(self):
        """A→A is a cycle."""
        assert check_cycle([], ("A", "A")) is True
