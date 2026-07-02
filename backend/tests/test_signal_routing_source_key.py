"""Tests for the P4.2 mapping `source_key` sub-LFO routing in resolve_routings."""

from modulation.routing import resolve_routings


def _make_chain(*effects):
    return [
        {"effect_id": eid, "enabled": True, "params": dict(params), "mix": 1.0}
        for eid, params in effects
    ]


def _mapping(effect_id, param_key, source_key=None, depth=1.0, m_min=0.0, m_max=1.0):
    m = {
        "target_effect_id": effect_id,
        "target_param_key": param_key,
        "depth": depth,
        "min": m_min,
        "max": m_max,
        "blend_mode": "add",
    }
    if source_key is not None:
        m["source_key"] = source_key
    return m


def test_mapping_with_source_key_reads_sub_lfo_value():
    """A mapping with source_key='lfo3' reads values[op_id/lfo3], not the master."""
    op_id = "op-1700000000-0"
    chain = _make_chain(("blur", {"radius": 0.0}))
    ops = [
        {
            "id": op_id,
            "is_enabled": True,
            "mappings": [_mapping("blur", "radius", source_key="lfo3")],
        }
    ]
    # Master value is 0.0; the sub-LFO lfo3 is 1.0. Source_key must pick lfo3.
    values = {op_id: 0.0, f"{op_id}/lfo3": 1.0}
    result = resolve_routings(values, ops, chain)
    # radius = 0.0 base + 1.0(signal)*1.0(depth)*1.0(range) = 1.0
    assert result[0]["params"]["radius"] == 1.0


def test_mapping_without_source_key_unchanged_legacy_behavior():
    """No source_key → reads the operator master value (legacy, byte-identical)."""
    op_id = "lfo1"
    chain = _make_chain(("blur", {"radius": 0.0}))
    ops = [
        {
            "id": op_id,
            "is_enabled": True,
            "mappings": [_mapping("blur", "radius")],  # no source_key
        }
    ]
    values = {op_id: 0.5, f"{op_id}/lfo3": 1.0}
    result = resolve_routings(values, ops, chain)
    # Reads master 0.5, NOT the sub-LFO: 0.0 + 0.5 = 0.5
    assert result[0]["params"]["radius"] == 0.5


def test_unknown_source_key_contributes_zero():
    """An unknown source_key misses the dict → contributes 0.0, no crash."""
    op_id = "op-1700000000-0"
    chain = _make_chain(("blur", {"radius": 0.25}))
    ops = [
        {
            "id": op_id,
            "is_enabled": True,
            "mappings": [_mapping("blur", "radius", source_key="lfo99")],
        }
    ]
    values = {op_id: 1.0}  # no op_id/lfo99 entry
    result = resolve_routings(values, ops, chain)
    # signal 0.0 → radius unchanged from base 0.25
    assert result[0]["params"]["radius"] == 0.25


def test_source_key_with_slash_or_traversal_chars_contributes_zero():
    """source_key with '/' or '..' just misses the dict → 0.0 (can't escape)."""
    op_id = "op-1700000000-0"
    chain = _make_chain(("blur", {"radius": 0.4}))
    for evil in ["../../etc", "lfo3/../lfo0", "..", "a/b/c"]:
        ops = [
            {
                "id": op_id,
                "is_enabled": True,
                "mappings": [_mapping("blur", "radius", source_key=evil)],
            }
        ]
        # Even if a real lfo0 exists, the namespaced lookup is a plain dict get
        # of f"{op_id}/{evil}" — it can only hit an exact key, never traverse.
        values = {op_id: 1.0, f"{op_id}/lfo0": 1.0}
        result = resolve_routings(values, ops, chain)
        assert result[0]["params"]["radius"] == 0.4, (
            f"source_key {evil!r} should miss → base value unchanged"
        )
