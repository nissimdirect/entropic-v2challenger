"""Frozen top-25 field-capable effect list for P6.2.

This file is the **source of truth** for which effect+param combinations are
allowed to receive a FieldRef value through the pipeline guard in
``engine/pipeline.py::apply_chain``.

Selection criterion (normative)
--------------------------------
Candidates = registered effects with ≥ 1 ``type:'float'`` param where
``min < max``.

Classification:
- **pointwise**: output pixel depends only on the input pixel + params (no
  kernel/area lookups).  Includes brightness, color, exposure, hue,
  destruction-by-threshold and similar per-pixel transforms.
- **banded**: needs neighbor pixels — convolution kernels, row sorts, etc.
  These appear last in the list and use ``mode='banded'``.

Ranking: all pointwise entries first, then banded, tie-broken by category
coverage (≥ 1 per eligible category), then alphabetical within each tier.

Regeneration
-------------
Run ``python3 backend/scripts/gen_field_top25.py`` to regenerate the candidate
table from the live registry and diff it against this file.  In ``--check``
mode, drift is printed as a warning; the frozen file remains authoritative.
"""

from __future__ import annotations

from typing import TypedDict


class FieldTop25Entry(TypedDict):
    """One entry in the FIELD_TOP25 list."""

    effect_id: str
    params: list[str]
    mode: str  # 'pointwise' | 'banded'


# ---------------------------------------------------------------------------
# The frozen list — DO NOT reorder; the pipeline guard iterates this for O(1)
# set membership.  To change entries, update this file AND re-run the generator
# in --check mode to verify no registry drift.
# ---------------------------------------------------------------------------

FIELD_TOP25: list[FieldTop25Entry] = [
    # --- Pointwise (23 entries) ---
    # Color / exposure
    {
        "effect_id": "fx.brightness_exposure",
        "params": ["stops"],
        "mode": "pointwise",
    },
    {
        "effect_id": "fx.color_filter",
        "params": ["intensity"],
        "mode": "pointwise",
    },
    {
        "effect_id": "fx.color_invert",
        "params": ["amount"],
        "mode": "pointwise",
    },
    {
        "effect_id": "fx.color_temperature",
        "params": ["temp"],
        "mode": "pointwise",
    },
    {
        "effect_id": "fx.contrast_crush",
        "params": ["amount"],
        "mode": "pointwise",
    },
    {
        "effect_id": "fx.cyanotype",
        "params": ["intensity"],
        "mode": "pointwise",
    },
    {
        "effect_id": "fx.hue_shift",
        "params": ["amount"],
        "mode": "pointwise",
    },
    {
        "effect_id": "fx.infrared",
        "params": ["vegetation_glow"],
        "mode": "pointwise",
    },
    {
        "effect_id": "fx.saturation_warp",
        "params": ["amount"],
        "mode": "pointwise",
    },
    {
        "effect_id": "fx.solarize",
        "params": ["brightness"],
        "mode": "pointwise",
    },
    {
        "effect_id": "fx.tape_saturation",
        "params": ["drive", "warmth", "output_level"],
        "mode": "pointwise",
    },
    # Destruction / texture (pointwise)
    {
        "effect_id": "fx.bitcrush",
        "params": ["resolution_scale"],
        "mode": "pointwise",
    },
    {
        "effect_id": "fx.channel_destroy",
        "params": ["intensity"],
        "mode": "pointwise",
    },
    {
        "effect_id": "fx.data_bend",
        "params": ["intensity"],
        "mode": "pointwise",
    },
    {
        "effect_id": "fx.film_grain",
        "params": ["intensity"],
        "mode": "pointwise",
    },
    {
        "effect_id": "fx.film_grain_warm",
        "params": ["amount", "size", "warmth"],
        "mode": "pointwise",
    },
    {
        "effect_id": "fx.noise",
        "params": ["intensity"],
        "mode": "pointwise",
    },
    {
        "effect_id": "fx.pixel_annihilate",
        "params": ["threshold"],
        "mode": "pointwise",
    },
    {
        "effect_id": "fx.row_shift",
        "params": ["density"],
        "mode": "pointwise",
    },
    # Modulation (pointwise)
    {
        "effect_id": "fx.gate",
        "params": ["threshold"],
        "mode": "pointwise",
    },
    {
        "effect_id": "fx.ring_mod",
        "params": ["frequency", "depth"],
        "mode": "pointwise",
    },
    {
        "effect_id": "fx.wavefold",
        "params": ["threshold", "brightness"],
        "mode": "pointwise",
    },
    # Enhance (pointwise remap — global histogram, no spatial kernel)
    {
        "effect_id": "fx.histogram_eq",
        "params": ["strength"],
        "mode": "pointwise",
    },
    # --- Banded / spatial (2 entries) ---
    {
        "effect_id": "fx.blur",
        "params": ["radius"],
        "mode": "banded",
    },
    {
        "effect_id": "fx.pixelsort",
        "params": ["threshold"],
        "mode": "banded",
    },
]

# Fast membership check for pipeline guard — built once at import time.
# Keys: (effect_id, param_name); value always True.
_FIELD_TOP25_SET: frozenset[tuple[str, str]] = frozenset(
    (entry["effect_id"], param) for entry in FIELD_TOP25 for param in entry["params"]
)


def is_field_capable(effect_id: str, param: str) -> bool:
    """Return True iff (effect_id, param) appears in FIELD_TOP25."""
    return (effect_id, param) in _FIELD_TOP25_SET
