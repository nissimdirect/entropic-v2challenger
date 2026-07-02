"""P6.6 follow-up: registry.list_all() must expose fieldParams from FIELD_TOP25.

Regression guard for the gap surfaced by P6.6: registration never populated
``field_capable``, so ``list_all()`` returned empty ``fieldParams`` for every
effect and the frontend "Field…" control stayed inert. ``list_all`` now unions
the registered set with the frozen FIELD_TOP25 params (the same source of truth
the render-path guard ``is_field_capable`` uses).
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import effects  # noqa: F401  — triggers effect registration
from effects import registry
from effects.field_top25 import FIELD_TOP25


def _field_params_by_id() -> dict[str, list[str]]:
    return {e["id"]: e["fieldParams"] for e in registry.list_all()}


def test_all_top25_effects_expose_their_field_params() -> None:
    """Every FIELD_TOP25 effect exposes (at least) its top-25 params in fieldParams."""
    by_id = _field_params_by_id()
    missing = []
    for entry in FIELD_TOP25:
        exposed = set(by_id.get(entry["effect_id"], []))
        for p in entry["params"]:
            if p not in exposed:
                missing.append(f"{entry['effect_id']}.{p}")
    assert not missing, f"FIELD_TOP25 params not exposed via list_all: {missing}"


def test_non_top25_effect_has_empty_field_params() -> None:
    """An effect not in FIELD_TOP25 (and not explicitly registered) exposes []."""
    top_ids = {e["effect_id"] for e in FIELD_TOP25}
    by_id = _field_params_by_id()
    non_top = [eid for eid in by_id if eid not in top_ids]
    assert non_top, "expected at least one non-FIELD_TOP25 effect registered"
    # The vast majority of non-top25 effects must have empty fieldParams (no
    # explicit field_capable registration exists today); assert it for all of them.
    assert all(by_id[eid] == [] for eid in non_top), (
        "a non-FIELD_TOP25 effect unexpectedly exposes fieldParams"
    )


def test_field_params_is_sorted_and_list_typed() -> None:
    for e in registry.list_all():
        assert isinstance(e["fieldParams"], list)
        assert e["fieldParams"] == sorted(e["fieldParams"])


def test_field_params_matches_is_field_capable_guard() -> None:
    """The frontend list and the backend guard agree on every exposed param."""
    from effects.field_top25 import is_field_capable

    for e in registry.list_all():
        for p in e["fieldParams"]:
            assert is_field_capable(e["id"], p), (
                f"{e['id']}.{p} exposed by list_all but rejected by is_field_capable"
            )
