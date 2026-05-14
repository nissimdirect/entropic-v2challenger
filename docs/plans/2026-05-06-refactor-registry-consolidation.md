---
title: Registry list naming consolidation — guard test
status: in-progress
branch: refactor/registry-consolidation
---

# Registry list consolidation

## Context

The Frankenstein batch (2026-05-06) shipped 12 effects via parallel agents. Two agents invented divergent module lists in `backend/src/effects/registry.py`:
- AsciiPhantom (PR #42) used `frankenstein_mods` (ad-hoc, never existed before)
- FrequencyMosh (PR #46) used `phase12_mods` (legitimate but the agent didn't realize `phase8_mods` was the right destination for that effect)

`phase8_mods` and `phase12_mods` are both legitimate phase groupings; the problem is **arbitrary new list names** appearing under the same lexical pattern.

## Scope of this PR

- [x] Add convention comment near `phase12_mods` declaration in `registry.py` documenting the rule
- [x] Add `test_no_orphan_module_lists` to `tests/test_effects/test_registry.py` that fails the build if any `<name>_mods = [` declaration outside the canonical set (`phase8_mods`, `phase12_mods`) appears in registry.py — and explicitly forbids `frankenstein_mods`
- [x] Verify all 5 registry tests pass

## Test plan

### What to test
- [x] Existing 4 registry tests still pass
- [x] New `test_no_orphan_module_lists` regex-greps `registry.py` and validates only canonical names appear

### How to verify
- `cd backend && python3 -m pytest tests/test_effects/test_registry.py -x --tb=short -q` → 5 passed

### What "broken" looks like
- A future PR adding `mything_mods = [...]` to registry.py → CI fails the new guard test
