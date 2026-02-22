"""Tests for effect registry."""

from effects.registry import get, list_all


def test_registry_contains_invert():
    info = get("fx.invert")
    assert info is not None
    assert info["name"] == "Invert"
    assert info["category"] == "fx"
    assert callable(info["fn"])


def test_list_all_includes_invert():
    effects = list_all()
    ids = [e["id"] for e in effects]
    assert "fx.invert" in ids


def test_list_all_has_correct_shape():
    effects = list_all()
    for effect in effects:
        assert "id" in effect
        assert "name" in effect
        assert "category" in effect
        assert "params" in effect


def test_get_nonexistent_returns_none():
    assert get("fx.nonexistent") is None
