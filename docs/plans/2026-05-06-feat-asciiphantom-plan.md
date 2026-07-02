---
title: AsciiPhantom — recursive ASCII collapse
status: shipped
branch: feat/asciiphantom
worktree: ~/Development/entropic-asciiphantom-wt
---

# AsciiPhantom — Build Plan

> Frankenstein #2 of 30. Stacks `ascii_art.py`'s pixel→glyph encoder with
> `generation_loss.py`'s N-pass recursive degradation. Each pass converts
> the frame to ASCII text, renders that text back to a raster, then feeds
> the raster as input for the next pass. After 3-5 passes the image
> collapses into a stable typographic basin.

## Source artifacts
- PRD: `~/Documents/Obsidian/projects/PRDs/CONCISE-AsciiPhantom.md`
- DESIGN: `~/Documents/Obsidian/projects/PRDs/design-docs/AsciiPhantom-DESIGN.md`
- Existing primitives: `backend/src/effects/fx/ascii_art.py`, `backend/src/effects/fx/generation_loss.py`
- Sibling: `~/Development/entropic-reactionmosh-wt/backend/src/effects/fx/reaction_mosh.py` (PR #39)

## Build checklist
- [x] Read PLAYBOOK.md (Gate 13) — focus on PLAY-005 numeric guards
- [x] Read existing fx convention (ascii_art, generation_loss, reaction_mosh, registry)
- [x] Create `backend/src/effects/fx/ascii_phantom.py`
- [x] Register effect in `backend/src/effects/registry.py` as `frankenstein_mods`
- [x] Write unit test `backend/tests/test_effects/test_fx/test_ascii_phantom.py` (20 tests)
- [x] Run smoke pytest — all 20 green
- [x] Run full parametrized pickup (`test_all_effects.py`) — all 11 green for this effect
- [x] NOT IDENTITY_BY_DEFAULT (visible change at frame 0 confirmed by parametrized test)
- [x] Commit
- [x] Verify branch HEAD vs origin/main (Gate 18b)
- [x] Push to origin
- [x] Open PR

## Test Plan

### What to test
- [x] Effect produces valid RGBA output with default params (test_basic_returns_frame_and_no_state)
- [x] State is None — recursive computation per-frame, font atlas cached at module level
- [x] Default params produce visible change (NOT IDENTITY_BY_DEFAULT)
- [x] mix=0 returns input unchanged
- [x] More passes diverges further from input

### Edge cases verified
- [x] All-black frame: no NaN, output stays valid
- [x] All-white frame: no NaN, output stays valid
- [x] Tiny frame (8x8) with glyph_size=32: no crash
- [x] Non-square frame (40x100): correct output dims
- [x] Out-of-range params (passes=-10, glyph_size=10000, mix=-5): clamp without NaN
- [x] Invalid charset string falls back to "standard"
- [x] Invalid color_mode falls back to "preserve"
- [x] All 4 charsets render (binary, sparse, standard, dense)
- [x] All 4 color modes render (mono, preserve, green, amber)
- [x] progressive_collapse=true narrows charset across passes
- [x] degrade=0.8 between passes does not break pipeline

### How to verify
- Smoke: `cd backend && python3 -m pytest tests/test_effects/test_fx/test_ascii_phantom.py -x --tb=short`
- Parametrized: `cd backend && python3 -m pytest tests/test_all_effects.py -k ascii_phantom -x --tb=short`
- Both green = registered + contract-compliant + visible change.

## PLAY-005 compliance
Every numeric param clamped at the trust boundary in `apply()`:
- `passes` clamped [1, 8]
- `glyph_size` clamped [4, 32]
- `degrade` clamped [0.0, 1.0]
- `mix` clamped [0.0, 1.0]
- `charset` validated against `_CHARSETS` keys, falls back to "standard"
- `color_mode` validated, falls back to "preserve"

## Multi-session safety
- Worktree `entropic-asciiphantom-wt` isolated from other worktrees
- Branch HEAD verified vs origin/main before push
