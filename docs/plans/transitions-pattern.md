# Layer Transitions — Authoring Pattern

> Status: PATTERN ESTABLISHED — first 3 of 53 shipped, this doc is the template for the remaining 50.
> Spec: `docs/addendums/LAYER-TRANSITIONS.md` (53 transitions, 6 categories).
> Decision record: `docs/roadmap/ROADMAP.md` §2.5 decision 2 ("53 transitions ... SCHEDULED post-B5 as a content sprint ... first 3 establish the pattern, remainder = batch Haiku/Sonnet work").
> Shipped: `fx.transition_column_cascade` (#1), `fx.transition_column_cascade_reverse` (#2), `fx.transition_row_waterfall` (#3).

## Mechanism

A `transition` effect is a normal registry effect (`EFFECT_ID` / `EFFECT_NAME` / `EFFECT_CATEGORY` / `PARAMS` / `apply`) that reveals a **second layer** over the current frame as an animated `progress` param sweeps `0 -> 1`.

The second layer arrives via the **existing** `_sidechain_frame` convention already used by `fx.sidechain_cross_blend`, `fx.sidechain_gate`, `fx.sidechain_modulate`, `fx.sidechain_interference` (`backend/src/effects/fx/sidechain_*.py`). `_sidechain_frame` is a synthetic param key read at runtime via `params.get("_sidechain_frame")` — it is intentionally **not** declared in `PARAMS` (the registry's `RESERVED_PARAM_PREFIX = "_"` guard would reject that; see `backend/src/effects/registry.py`). This is the same "designed, not yet routed by the engine" state the sidechain effects are already shipped in — no engine/timeline/App.tsx changes were needed to add these 3, and none are needed for the remaining 50. When the engine wires a second-layer source into `_sidechain_frame` (tracked separately — no ticket exists yet), every transition effect lights up simultaneously.

**No `_sidechain_frame` present -> exact identity passthrough** (`return frame.copy(), None`). This is why every transition effect belongs in `IDENTITY_BY_DEFAULT` (`backend/tests/test_all_effects.py`) and `STATEFUL_FRAME0` (`backend/tests/test_parameter_sweep.py`) — the generic effect sweeps call `apply()` with no sidechain input, so they correctly expect identity there. The real "does this transition work" proof lives in the two-clip-blend oracle (see Testing below).

## Shared math

`backend/src/effects/shared/transitions.py` owns the parts every transition reuses:

- `reveal_mask_1d(pos, progress, softness)` — the progress -> mask curve along a normalized `0..1` position axis. Pads the sweep by `softness` at both ends so `progress=0`/`progress=1` always fully resolve to an all-0/all-1 mask (otherwise a sample sitting exactly at `pos == progress` freezes at 0.5 and the transition never completes at the edges).
- `get_sidechain_rgb(frame, params)` — resolves `_sidechain_frame` to an RGB float32 array sized to match `frame` (handles RGBA input, resizes mismatched resolutions via `cv2.resize`). Returns `None` when absent.
- `blend_with_mask(frame_rgb, key_rgb_f32, mask)` — `frame_rgb * (1-mask) + key_rgb_f32 * mask`, rounded with `np.rint` (not truncated) before the `uint8` cast so `progress=0`/`1` land on an **exact** frame/key match instead of off-by-one from float rounding at the sweep boundary.

A new transition's `apply()` is almost always just: compute a `pos` array for its geometry (column index, row index, radius, angle, checkerboard cell, ...), call `reveal_mask_1d`, reshape to broadcast against `(H, W, 1)`, call `blend_with_mask`. See `transition_column_cascade.py` (pos = `x / (w-1)`), `transition_column_cascade_reverse.py` (pos = `1 - x/(w-1)` — same math, mirrored axis), `transition_row_waterfall.py` (pos = `y / (h-1)`) as the three reference shapes (linear sweep, mirrored linear sweep, orthogonal linear sweep). Radial/angular/procedural transitions (Iris Open, Clock Wipe, Checkerboard, Cellular Automata, ...) will need their own `pos` derivation but can still call `reveal_mask_1d` for the progress curve.

## Param conventions

Every transition declares exactly these two params (add transition-specific params — e.g. a checkerboard's `cell_size`, a spiral's `turns` — on top, never instead of):

```python
PARAMS: dict = {
    "progress": {
        "type": "float", "min": 0.0, "max": 1.0, "default": 0.0,
        "label": "Progress", "curve": "linear", "unit": "%",
        "description": "Reveal position: 0 = layer A only, 1 = fully replaced by layer B (sidechain input).",
    },
    "edge_softness": {
        "type": "float", "min": 0.0, "max": 0.5, "default": 0.04,
        "label": "Edge Softness", "curve": "linear", "unit": "",
        "description": "Width of the anti-aliased blend band at the reveal boundary, as a fraction of the sweep axis.",
    },
}
```

`EFFECT_CATEGORY = "transition"` for all of them (new category — confirmed dynamic in `frontend/src/renderer/components/effects/EffectBrowser.tsx`, no frontend change needed to add a category).

## Registration

The registry is **explicit-import, not auto-discovery** (`docs/solutions/2026-05-14-effect-registry-explicit-import.md`) — a module that exists on disk but isn't imported in `registry.py` is invisible to the CLI ("unknown effect"). Append new transitions to the *existing* `phase12_mods` list in `backend/src/effects/registry.py` (do **not** invent a new `*_mods` list — `tests/test_effects/test_registry.py::test_no_orphan_module_lists` hard-fails the build on any `*_mods` name outside `{phase8_mods, phase12_mods}`):

```python
from effects.fx import (
    transition_column_cascade,
    transition_column_cascade_reverse,
    transition_row_waterfall,
    # transition_row_rise, transition_venetian_blinds_h, ...  <- append here
)

phase12_mods = [
    ...,
    transition_column_cascade,
    transition_column_cascade_reverse,
    transition_row_waterfall,
    # transition_row_rise, ...
]
```

Verify with `python3 -c "from effects import registry; print([e['id'] for e in registry.list_all() if e['category']=='transition'])"`.

## Testing (per transition)

1. **Unit test** (`backend/tests/test_effects/test_fx/test_<name>.py`) — mirrors the standard fx-effect template (see `test_edge_pixel_wind.py`): effect id, default params sane, alpha preserved, deterministic, param clamping (PLAY-005), no-sidechain-is-identity, resolution-mismatch resize.
2. **Two-clip blend oracle** — append to `backend/tests/oracles/test_transitions_two_clip_blend_oracle.py`'s `@pytest.mark.parametrize("apply_fn", [...])` list. Feeds two distinct solid-color frames as layer A / `_sidechain_frame`=layer B and asserts: `progress=0` is exact layer A, `progress=1` is exact layer B, `progress=0.5` contains *both* colors (proves it's a real two-clip blend, not a uniform fade), and the reveal direction matches the transition's name (e.g. "fills top→down" means the top is *already* layer B partway through — don't assume the naive reading; verify empirically against the actual mask, see the two direction-bug fixes in this module's git history before copying blindly).
3. **Registry exemption** — add the new `EFFECT_ID` to `IDENTITY_BY_DEFAULT` in `backend/tests/test_all_effects.py` and to `STATEFUL_FRAME0` in `backend/tests/test_parameter_sweep.py`, both with a one-line comment pointing back to this doc.

Run `pytest tests/test_effects/test_fx/test_<name>.py tests/oracles/test_transitions_two_clip_blend_oracle.py tests/test_all_effects.py tests/test_parameter_sweep.py tests/test_effect_harness.py tests/test_effects/test_registry.py -q` before opening a PR.

## Gotchas hit while shipping #1-#3

- **`np.array_equal` does not broadcast.** Comparing a single row/column slice (shape `(N, 3)`) against a 3-tuple color (shape `(3,)`) with `np.array_equal` is *always* `False` regardless of content — it requires identical shapes. Use `np.all(slice == color)` instead. (Caught two false-positive "wrong direction" failures during #1-#3's own test authoring — see git history.)
- **Float rounding at `progress` extremes.** `mask` computed in float32 can land at `0.999999` instead of exactly `1.0` at the far edge of the sweep; `astype(np.uint8)` truncates, silently turning `255 -> 254`. `blend_with_mask` rounds with `np.rint` before casting specifically to avoid this — don't reintroduce a bare `.astype(np.uint8)` truncation in a new transition's blend step.
- **Reveal direction is a property of the `pos` mapping, not the mask math.** `reveal_mask_1d` always reveals low-`pos` values first as `progress` increases. To reverse a sweep, invert `pos` (e.g. `1 - x/(w-1)`), don't touch the shared mask function.

## Batch-authoring the remaining 50

Group by `pos` derivation, not by spec category — several spec categories share the same geometry:

- **Linear sweep (reuse #1-#3 pattern directly):** Row Rise (`pos = 1 - y/(h-1)`), Venetian Blinds H/V (`pos = (x or y) % slat_period / slat_period`), Diagonal Slash (`pos = (x/w + y/h)/2`).
- **Radial:** Iris Open/Close-Open, Diamond Expand (`pos = distance-from-center / max-distance`, Euclidean for Iris, Chebyshev/L1 for Diamond).
- **Angular:** Clock Wipe (`pos = atan2(dy, dx)` normalized to `0..1`).
- **Tiled/procedural:** Checkerboard, Hexagonal Tiles, Mosaic Defrag — `pos` per-cell (derive from a per-cell hash or grid index so cells resolve as a block, not gradient-blended internally) still runs through the same `reveal_mask_1d` per cell.
- **Pixel/digital reveals (#16-24) and glitch-native reveals (#25-35)** mostly need a *different* per-pixel reveal predicate (random dissolve threshold, scanline index, bit-depth step) rather than a spatial sweep — `reveal_mask_1d`'s `(threshold - pos)/softness` shape still fits if `pos` is redefined as "how early does this pixel/block reveal" (e.g. a fixed per-pixel random value for Pixel Dissolve).
- **Physics/organic (#36-46) and audio-synced (#47-53)** are the ones most likely to need genuinely new math (fluid/cellular simulation, audio-reactive `progress` input) — do not force these through the linear-sweep template; scope them as their own small design pass before implementing.

Route the boilerplate params/registration/test-scaffold work per transition to Sonnet/Haiku batch execution once the `pos`-derivation is decided for a given transition — the shared-math module is what makes that safe (agents only write the `pos` line + docstring, not the blend/rounding/param-clamp logic).
