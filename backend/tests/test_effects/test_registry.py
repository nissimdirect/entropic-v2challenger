"""Tests for effect registry."""

import pytest

from effects.registry import get, list_all

pytestmark = pytest.mark.smoke


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


def test_no_orphan_module_lists():
    """Guard against arbitrary mod-list naming.

    The Frankenstein batch (2026-05-06) shipped 12 effects via parallel agents.
    Two agents invented divergent module lists (`frankenstein_mods`,
    `phase12_mods` from a build that already had `phase12_mods`).

    Convention: NEW fx-style effects append to the latest phase list (currently
    `phase12_mods`). Open a `phase13_mods` only when the team agrees a new
    release-phase boundary is needed. Do NOT invent ad-hoc names.

    This test fails the build if any module list other than the canonical set
    appears in registry.py.
    """
    import re
    from pathlib import Path

    registry_src = (
        Path(__file__).resolve().parents[2] / "src" / "effects" / "registry.py"
    )
    text = registry_src.read_text(encoding="utf-8")

    # Find every `<name>_mods = [` declaration in the file.
    found = set(re.findall(r"^\s*(\w+_mods)\s*=\s*\[", text, flags=re.MULTILINE))

    canonical = {
        "phase8_mods",
        "phase12_mods",
    }
    # Ad-hoc names that previous agents invented and must NOT recur.
    forbidden = {
        "frankenstein_mods",
    }

    extras = (found - canonical) - forbidden
    assert not extras, (
        f"Unknown module lists in registry.py: {sorted(extras)}. "
        f"Append to the canonical set ({sorted(canonical)}) instead. "
        f"Open a phase{{N+1}}_mods only with team agreement on a new release-phase boundary."
    )

    forbidden_seen = found & forbidden
    assert not forbidden_seen, (
        f"Forbidden module list names re-introduced: {sorted(forbidden_seen)}. "
        f"These were named ad-hoc and must be folded into a canonical phase list."
    )
