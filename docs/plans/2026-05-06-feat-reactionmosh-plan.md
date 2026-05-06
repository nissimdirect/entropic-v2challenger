---
title: ReactionMosh — datamosh × reaction-diffusion Frankenstein
status: in-progress
branch: feat/reactionmosh
worktree: ~/Development/entropic-reactionmosh-wt
---

# ReactionMosh — Build Plan

> Frankenstein #1 from the 30-PRD bench. Combines `datamosh.py` (frame-buffer mosh) with `reaction_diffusion.py` (Gray-Scott PDE) to produce glitch that decays/grows like organic chemistry. ~3 days estimated; aiming to ship today.

## Source artifacts
- PRD: `~/Documents/Obsidian/projects/PRDs/CONCISE-ReactionMosh.md` (canonical)
- DESIGN: `~/Documents/Obsidian/projects/PRDs/design-docs/ReactionMosh-DESIGN.md` (canonical)
- Existing primitives: `backend/src/effects/fx/datamosh.py`, `backend/src/effects/fx/reaction_diffusion.py`

## Build checklist
- [x] Read PLAYBOOK.md (Gate 13) — focus on PLAY-005 numeric guards, resolution-change handling
- [x] Read existing fx convention (datamosh, reaction_diffusion, registry)
- [ ] Create `backend/src/effects/fx/reaction_mosh.py`
- [ ] Register effect in `backend/src/effects/registry.py` phase8_mods
- [ ] Write unit test `backend/tests/test_effects/test_fx/test_reaction_mosh.py`
- [ ] Write oracle test `backend/tests/oracles/test_reaction_mosh_oracle.py` (temporal-signature shift like datamosh oracle)
- [ ] Run smoke pytest, fix anything red
- [ ] Run full effects parametrized test (`test_all_effects.py` picks it up via registry)
- [ ] Commit
- [ ] Verify branch HEAD vs origin/main (Gate 18b)
- [ ] Push to origin
- [ ] Open PR

## Test Plan

### What to test
- [ ] Effect produces valid RGBA output with default params
- [ ] State dict (`A`, `B`, `prev_frame`) propagates across frames
- [ ] First frame returns input unchanged (no prev_frame yet) and seeds A/B from luma
- [ ] Second+ frames produce a measurable temporal-signature shift (oracle test)
- [ ] Mid-render resolution change resets state cleanly

### Edge cases to verify
- [ ] All-black frame: V field still evolves; output remains valid
- [ ] All-white frame: B field seeded from luma > 0.5 (full-coverage seed)
- [ ] Static input (same frame N times): V field still drifts (intentional)
- [ ] Extreme `Du`/`Dv` (clamped): no NaN, no instability
- [ ] `intensity = 0`: output ≈ input (within rounding)
- [ ] `pde_steps_per_frame = 1`: still produces motion (slow but valid)
- [ ] Dimension change between frames: state buffers reset

### How to verify
- Smoke: `cd backend && python -m pytest tests/test_all_effects.py -k reaction_mosh -x --tb=short`
- Oracle: `cd backend && python -m pytest tests/oracles/test_reaction_mosh_oracle.py -x --tb=short`
- Full: `cd backend && python -m pytest -x -n auto --tb=short -q`
- "Working" = registered in `_REGISTRY`, parametrized test passes, oracle confirms temporal-signature shift > 1.0
- "Broken" = NaN propagation, registry import error, or oracle shift < 1.0 (means effect is no-op)

### Existing test patterns to follow
- Framework: pytest
- Example unit: `tests/test_effects/test_fx/test_invert.py` (or any fx test)
- Example oracle: `tests/oracles/test_datamosh_oracle.py`
- Auto-pickup: `tests/test_all_effects.py` parametrizes over `_REGISTRY` so just registering = inclusion

## Multi-session safety
- This worktree (`entropic-reactionmosh-wt`) is isolated from the 8 existing Entropic worktrees + AudioPlugins
- User reported 2 parallel sessions active — don't touch other branches/repos
- Before push: `git fetch origin && git log --oneline origin/main -3` to confirm no commits I missed
- Before PR: `git log -1 --oneline` to verify commit landed on this branch's HEAD
