---
title: Composite per-layer state gap fix
status: in-progress
branch: fix/composite-state-gap
---

# Composite per-layer state gap

## Background

PR #51 fixed `_handle_render_frame` (single-clip preview) to propagate per-effect state across frames via a session-scoped cache. PR #51's review flagged that `_handle_render_composite` (multi-layer composite preview) had the same gap — every layer's chain ran with `state_in=None` every frame, so stateful effects (datamosh, reaction_mosh, frame_drop, generation_loss, all 12 just-shipped Frankensteins) silently no-op'd in composite preview.

This PR fixes the composite path with the same architecture, scoped per-layer.

## Scope

- [x] Modify `engine/compositor.render_composite` to accept optional `layer_states: dict[str, dict] | None`. When provided, threads `state_in`/`state_out` through `apply_chain` per layer and returns `(frame, new_layer_states)` tuple. When None, returns bare ndarray (back-compat).
- [x] Add `_get_composite_states(layer_signature, frame_index)` + `_save_composite_states` helpers to `ZMQServer`. Lazy-init the cache fields to avoid merging conflicts with PR #51.
- [x] In `_handle_render_composite`, derive a stable per-layer `layer_id` (asset_path for video/image, synthesized for text), build a `layer_signature` tuple of ordered layer_ids, anchor state cache on monotonic `frame_index`. Cache resets on add/remove/reorder/scrub-jump.
- [x] Add `tests/test_composite_state_propagation.py` (6 tests):
  - Legacy single-return back-compat
  - Tuple return when `layer_states` arg passed
  - State propagates frame[2] != frame[0]
  - Stateful path diverges from stateless path
  - Multi-layer keeps state per `layer_id`
  - Empty layers + state arg → empty new_states

## Test plan

### What to test
- [x] All 208 existing engine tests still pass (back-compat)
- [x] 6 new regression tests pass — state genuinely propagates per layer across frames

### How to verify
```
cd backend && python3 -m pytest tests/test_composite_state_propagation.py tests/test_engine -x --tb=short -q
```

### "Working" looks like
- 214 passed
- No regressions

### "Broken" looks like
- Any composite preview test fails → state isn't being threaded
- Any engine test fails → back-compat broken

### Existing test patterns to follow
- pytest, smoke marker
- See `tests/test_render_state_propagation.py` from PR #51 for the analog single-frame regression test

## Dependencies / merge order

This PR is INDEPENDENT of PR #51 — they touch different `_handle_*` paths and use lazy-init for the cache fields to avoid `__init__` collision.

Recommended merge order: PR #51 first (it's the higher-traffic path), then this. No git conflicts expected.

## Out of scope (follow-up)

- The `_handle_render_frame` fix from PR #51 isn't in this branch (fresh off `origin/main`); see PR #51.
- `_handle_apply_chain` may have the same gap; not addressed here. Spike if it does.
