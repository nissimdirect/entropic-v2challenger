"""Tests for effect registry."""

import pytest

from effects.registry import (
    KNOWN_SYNTHETIC_KEYS,
    RESERVED_PARAM_PREFIX,
    get,
    list_all,
    register,
)

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


# Architecture-review follow-up: lock the synthetic-param namespace convention.
# Before this guard, an effect author could declare `params["_internal"]` and
# silently overwrite the container's `_mix` / `_mask` plumbing at runtime.
class TestReservedParamNamespace:
    def _noop(self, frame, params, state):
        return frame, state

    def test_constants_exposed(self):
        assert RESERVED_PARAM_PREFIX == "_"
        assert "_mix" in KNOWN_SYNTHETIC_KEYS
        assert "_mask" in KNOWN_SYNTHETIC_KEYS

    def test_register_rejects_underscore_prefix_param(self):
        with pytest.raises(ValueError, match="reserved param key"):
            register(
                "fx.bad_underscore",
                self._noop,
                {"_internal": {"type": "float", "default": 0.0}},
                "Bad",
                "fx",
            )

    def test_register_rejects_synthetic_key_collision(self):
        # Even known synthetic keys must NOT be re-declared — they belong to
        # container plumbing, not effect param surface.
        with pytest.raises(ValueError, match="reserved param key"):
            register(
                "fx.bad_mix",
                self._noop,
                {"_mix": {"type": "float", "default": 1.0}},
                "Bad",
                "fx",
            )

    def test_register_allows_normal_param_keys(self):
        # Sanity check: registration with normal keys still works.
        # Use a unique effect_id so we don't collide with the real registry.
        register(
            "test._reserved_namespace_ok",
            self._noop,
            {"amount": {"type": "float", "default": 0.5}},
            "Test OK",
            "test",
        )
        info = get("test._reserved_namespace_ok")
        assert info is not None
        assert "amount" in info["params"]
        assert "_mix" not in info["params"]  # container injects, not registry

    def test_no_registered_effect_currently_declares_reserved_key(self):
        """Regression guard: scan the full registry for any reserved key."""
        for effect in list_all():
            reserved = [
                k
                for k in effect["params"]
                if isinstance(k, str) and k.startswith(RESERVED_PARAM_PREFIX)
            ]
            assert not reserved, (
                f"Effect {effect['id']!r} declares reserved param key(s): "
                f"{reserved}. Rename without leading underscore."
            )
