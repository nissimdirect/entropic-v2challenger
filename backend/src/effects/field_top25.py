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
    approx: bool  # P6.5: True if the v1 codegen lerp is an APPROXIMATION


# ---------------------------------------------------------------------------
# P6.5 codegen approximation flag (per-entry ``approx``)
# ---------------------------------------------------------------------------
#
# The P6.5 v1 codegen kernel composites a field-driven param by rendering the
# effect at the param's [min, max] endpoints and lerping per pixel:
#
#     out = E(frame, p=p_min)·(1 − F) + E(frame, p=p_max)·F
#
# This is EXACT only when the effect applies the param **linearly** across its
# [min, max] range — i.e. the output is an affine function of p, so
# E(p) = E(p_min) + (E(p_max) − E(p_min))·(p − p_min)/(p_max − p_min) and the
# lerp coefficient F = (p − p_min)/(p_max − p_min) reproduces it pixel-exactly.
#
# Almost every entry below applies its param NON-linearly (exposure is a
# power-of-two multiply, thresholds are step functions, hue is a rotation,
# noise/grain seed amplitude, etc.), so the lerp is a visually-faithful but
# mathematically APPROXIMATE composite. We therefore default ``approx=True``
# for every pointwise entry — the honest, conservative choice. (A future
# per-effect shader-transpilation tier would make these exact; that is NOT this
# packet.) Banded entries never enter codegen, so their ``approx`` flag is
# unused (kept False for schema uniformity).


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
        "approx": True,
    },
    {
        "effect_id": "fx.color_filter",
        "params": ["intensity"],
        "mode": "pointwise",
        "approx": True,
    },
    {
        "effect_id": "fx.color_invert",
        "params": ["amount"],
        "mode": "pointwise",
        "approx": True,
    },
    {
        "effect_id": "fx.color_temperature",
        "params": ["temp"],
        "mode": "pointwise",
        "approx": True,
    },
    {
        "effect_id": "fx.contrast_crush",
        "params": ["amount"],
        "mode": "pointwise",
        "approx": True,
    },
    {
        "effect_id": "fx.cyanotype",
        "params": ["intensity"],
        "mode": "pointwise",
        "approx": True,
    },
    {
        "effect_id": "fx.hue_shift",
        "params": ["amount"],
        "mode": "pointwise",
        "approx": True,
    },
    {
        "effect_id": "fx.infrared",
        "params": ["vegetation_glow"],
        "mode": "pointwise",
        "approx": True,
    },
    {
        "effect_id": "fx.saturation_warp",
        "params": ["amount"],
        "mode": "pointwise",
        "approx": True,
    },
    {
        "effect_id": "fx.solarize",
        "params": ["brightness"],
        "mode": "pointwise",
        "approx": True,
    },
    {
        "effect_id": "fx.tape_saturation",
        "params": ["drive", "warmth", "output_level"],
        "mode": "pointwise",
        "approx": True,
    },
    # Destruction / texture (pointwise)
    {
        "effect_id": "fx.bitcrush",
        "params": ["resolution_scale"],
        "mode": "pointwise",
        "approx": True,
    },
    {
        "effect_id": "fx.channel_destroy",
        "params": ["intensity"],
        "mode": "pointwise",
        "approx": True,
    },
    {
        "effect_id": "fx.data_bend",
        "params": ["intensity"],
        "mode": "pointwise",
        "approx": True,
    },
    {
        "effect_id": "fx.film_grain",
        "params": ["intensity"],
        "mode": "pointwise",
        "approx": True,
    },
    {
        "effect_id": "fx.film_grain_warm",
        "params": ["amount", "size", "warmth"],
        "mode": "pointwise",
        "approx": True,
    },
    {
        "effect_id": "fx.noise",
        "params": ["intensity"],
        "mode": "pointwise",
        "approx": True,
    },
    {
        "effect_id": "fx.pixel_annihilate",
        "params": ["threshold"],
        "mode": "pointwise",
        "approx": True,
    },
    {
        "effect_id": "fx.row_shift",
        "params": ["density"],
        "mode": "pointwise",
        "approx": True,
    },
    # Modulation (pointwise)
    {
        "effect_id": "fx.gate",
        "params": ["threshold"],
        "mode": "pointwise",
        "approx": True,
    },
    {
        "effect_id": "fx.ring_mod",
        "params": ["frequency", "depth"],
        "mode": "pointwise",
        "approx": True,
    },
    {
        "effect_id": "fx.wavefold",
        "params": ["threshold", "brightness"],
        "mode": "pointwise",
        "approx": True,
    },
    # Enhance (pointwise remap — global histogram, no spatial kernel)
    {
        "effect_id": "fx.histogram_eq",
        "params": ["strength"],
        "mode": "pointwise",
        "approx": True,
    },
    # --- Banded / spatial (2 entries) ---
    {
        "effect_id": "fx.blur",
        "params": ["radius"],
        "mode": "banded",
        "approx": False,
    },
    {
        "effect_id": "fx.pixelsort",
        "params": ["threshold"],
        "mode": "banded",
        "approx": False,
    },
]

# Fast membership check for pipeline guard — built once at import time.
# Keys: (effect_id, param_name); value always True.
_FIELD_TOP25_SET: frozenset[tuple[str, str]] = frozenset(
    (entry["effect_id"], param) for entry in FIELD_TOP25 for param in entry["params"]
)

# (effect_id, param) → mode ('pointwise' | 'banded'). P6.5 dispatch reads this
# to route pointwise field params to codegen and keep banded ones on the P6.1
# band path. Built once at import time alongside the membership set.
_FIELD_TOP25_MODE: dict[tuple[str, str], str] = {
    (entry["effect_id"], param): entry["mode"]
    for entry in FIELD_TOP25
    for param in entry["params"]
}


def is_field_capable(effect_id: str, param: str) -> bool:
    """Return True iff (effect_id, param) appears in FIELD_TOP25."""
    return (effect_id, param) in _FIELD_TOP25_SET


def field_mode(effect_id: str, param: str) -> str | None:
    """Return the field mode ('pointwise' | 'banded') for (effect_id, param).

    Returns None if the pair is not field-capable. P6.5 dispatch uses this to
    send pointwise params to the GPU/CPU codegen lerp while banded params stay
    on the P6.1 band path (a banded field param must NEVER enter codegen).
    """
    return _FIELD_TOP25_MODE.get((effect_id, param))
