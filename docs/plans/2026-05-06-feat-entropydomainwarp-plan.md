# feat/entropydomainwarp — Plan

**Date:** 2026-05-06
**Branch:** `feat/entropydomainwarp` (off `origin/main`)
**Status:** built, tested, ready for review

## Goal

Ship `fx.entropy_domain_warp` — a new fx/ effect that gates fractal-noise domain warping by per-pixel Shannon entropy. Busy regions (faces, text, edges) warp violently; calm regions (sky, walls) hold still. `mode=inverse` flips the relationship so flat regions warp around pristine subjects.

## References

- PRD: `~/Documents/Obsidian/projects/PRDs/CONCISE-EntropyDomainWarp.md`
- DESIGN: `~/Documents/Obsidian/projects/PRDs/design-docs/EntropyDomainWarp-DESIGN.md`
- Sibling pattern (just shipped): `effects/fx/reaction_mosh.py` (PR #39)
- Reused shared modules: `effects/shared/displacement.py::remap_frame`, `effects/shared/noise_generators.py::fractal_noise_2d`
- Block-entropy helper inlined from the convention in `effects/fx/entropy_map.py`

## Implementation

- **Effect file:** `backend/src/effects/fx/entropy_domain_warp.py`
- **Registry:** added import + `phase8_mods` entry in `backend/src/effects/registry.py` (alphabetically next to `entropy_map`)
- **Tests:** `backend/tests/test_effects/test_fx/test_entropy_domain_warp.py` — 18 cases (contract, edges, numeric guards per PLAY-005, dim-change reset, mode/boundary fallback, flat-frame zero-warp invariant)
- **All-effects exemptions:** `IDENTITY_BY_DEFAULT` (effect is stateful) and `ALPHA_EXEMPT` (uses shared `remap_frame` which warps RGBA together — same as `domain_warp`/`flow_distort`)

## Algorithm

1. RGB → luma (Rec. 601)
2. per-block Shannon entropy of luma (block-tiled, normalized to [0,1] via `/log2(256)`)
3. mask = entropy ** `entropy_curve`, optionally inverted (`mode=inverse`), optionally EMA-smoothed across frames (`temporal_smooth > 0`)
4. fractal-noise displacement field (dx, dy), animated by `frame_index × time_evolve`
5. dx, dy ×= `intensity` × `max_offset_px` × mask
6. `remap_frame(frame, dx, dy, boundary_mode)`

State (when `temporal_smooth > 0`): `{"prev_mask": H×W float32}`. Reset on resolution change.

## Test Plan

- **Smoke:** `pytest tests/test_effects/test_fx/test_entropy_domain_warp.py -x` — 18 pass
- **Parametrized:** `pytest tests/test_all_effects.py -k entropy_domain_warp` — 9 pass + 2 expected skips (identity-by-default and alpha-exempt)
- **No regressions:** new effect added without modifying existing fx/ files

## Out of Scope (deferred)

- Bilinear smoothing of the entropy mask (currently block-tiled — risk of visible boundaries on coarse blocks; mitigation is to use smaller `entropy_block` for now)
- Half-res entropy compute for 4K performance — `halfres_wrap` is available if profiling shows it's needed
- Curl-noise displacement (independent x/y noise is fine for v1)
