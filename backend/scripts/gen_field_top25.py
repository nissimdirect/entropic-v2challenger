#!/usr/bin/env python3
"""Regenerate + drift-check the FIELD_TOP25 candidate table.

Usage
-----
    # Check mode (default): print drift between live registry and frozen file
    python3 backend/scripts/gen_field_top25.py --check

    # Print mode: emit the candidate table derived from the live registry to stdout
    python3 backend/scripts/gen_field_top25.py

The frozen file ``backend/src/effects/field_top25.py`` is the source of truth.
``--check`` mode prints a warning if registry candidates diverge from what the
frozen file covers, but does NOT fail (exit code 0) — the frozen file remains
authoritative and must be updated manually when the registry changes.

Selection criterion (matches field_top25.py docstring)
-------------------------------------------------------
Candidates = registered effects with >= 1 type:'float' param where min < max.
"""

from __future__ import annotations

import argparse
import sys
import os

# Ensure the backend src directory is on sys.path
_BACKEND_SRC = os.path.join(os.path.dirname(__file__), "..", "src")
sys.path.insert(0, os.path.abspath(_BACKEND_SRC))


def _get_registry_candidates() -> list[dict]:
    """Return effects from live registry that have >= 1 float param with min < max."""
    from effects.registry import list_all  # noqa: PLC0415

    candidates = []
    for e in list_all():
        float_params = [
            k
            for k, v in e["params"].items()
            if isinstance(v, dict)
            and v.get("type") == "float"
            and v.get("min", 0) < v.get("max", 0)
        ]
        if float_params and e["id"] != "composite":
            candidates.append(
                {
                    "effect_id": e["id"],
                    "category": e["category"],
                    "float_params": float_params,
                }
            )
    return sorted(candidates, key=lambda x: x["effect_id"])


def _check_drift(candidates: list[dict]) -> None:
    """Compare live candidates against the frozen FIELD_TOP25."""
    from effects.field_top25 import FIELD_TOP25  # noqa: PLC0415

    frozen_ids = {entry["effect_id"] for entry in FIELD_TOP25}
    candidate_ids = {c["effect_id"] for c in candidates}

    in_frozen_not_registry = frozen_ids - candidate_ids
    in_registry_not_frozen = candidate_ids - frozen_ids

    if not in_frozen_not_registry and not in_registry_not_frozen:
        print(
            "gen_field_top25 --check: no drift detected between registry candidates and FIELD_TOP25."
        )
        return

    print(
        "WARNING: gen_field_top25 drift detected between live registry and frozen FIELD_TOP25.\n"
        "The frozen file (backend/src/effects/field_top25.py) is the source of truth.\n"
        "Update it manually if registry changes are intentional.\n"
    )
    if in_frozen_not_registry:
        print(
            "  In FIELD_TOP25 but NOT in registry candidates (removed or renamed effects):"
        )
        for eid in sorted(in_frozen_not_registry):
            print(f"    - {eid}")
    if in_registry_not_frozen:
        print(
            "  In registry candidates but NOT in FIELD_TOP25 (new float-param effects):"
        )
        for eid in sorted(in_registry_not_frozen):
            matches = [c for c in candidates if c["effect_id"] == eid]
            if matches:
                print(f"    + {eid}  float_params={matches[0]['float_params']}")


def _print_candidates(candidates: list[dict]) -> None:
    """Print the live candidate table to stdout."""
    print(
        f"# Live registry candidates — {len(candidates)} effects with float params (min<max)\n"
    )
    for c in candidates:
        print(f"  {c['effect_id']} ({c['category']}): {c['float_params']}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Drift-check or regenerate the FIELD_TOP25 candidate table."
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Compare live registry candidates against the frozen FIELD_TOP25 (prints drift, never fails).",
    )
    args = parser.parse_args()

    candidates = _get_registry_candidates()

    if args.check:
        _check_drift(candidates)
    else:
        _print_candidates(candidates)


if __name__ == "__main__":
    main()
