# Fix: Per-Effect State Propagation in Preview Render Path

**Date:** 2026-05-06
**Branch:** `fix/preview-state-gap`
**Refs:** CTO review on PR #39 (`/tmp/PR-39-cto-review.md`)

## The Bug

`_handle_render_frame` and `_handle_apply_chain` in `backend/src/zmq_server.py`
called `apply_chain` with the `states` parameter omitted (defaults to `None` →
empty dict). Result: every preview frame ran every stateful effect cold.

Stateful effects that **silently no-op** in this path:
- `fx.reaction_mosh`
- `fx.datamosh` (and `fx.datamosh_melt`/`bloom`/`freeze` variants)
- `fx.frame_drop`
- `fx.generation_loss`
- `fx.entropy_domain_warp`
- `fx.logistic_generation_loss`
- `fx.resonant_paulstretch`
- `fx.temporal_dispersion`
- `fx.edge_pixel_wind`
- 7+ pre-existing stateful effects (afterimage, spectral_freeze, etc.)

Reference: `engine/export.py:346` already threads `states` correctly.

## Architecture (Option A)

Cache `states` dict on the `ZMQServer` instance, keyed by source path +
last-frame-index. Reset on:
1. Path change (different source video).
2. Frame discontinuity (`frame_index != last_frame_index + 1`) — i.e. seek,
   scrub, or replay.
3. `reset_state()` (existing fixture-aware lifecycle).

This matches `export.py` semantics: monotonic frame iteration, fresh states
per session. Option B (client-managed state) was rejected — IPC-marshalling
opaque numpy arrays per frame is wasteful and breaks effect contract.

## Implementation

1. Add `self._render_states: dict[str, dict | None] = {}` and
   `self._render_state_key: tuple[str | None, int] = (None, -1)` in
   `__init__`.
2. Add helper `_get_or_reset_states(path, frame_index)` that returns the
   existing states dict or a fresh one based on the rules above.
3. In `_handle_render_frame` and `_handle_apply_chain`: pass states in,
   capture the returned states, store them keyed by `(path, frame_index)`.
4. Reset in `reset_state()` for fixture cleanup.

Composite path (`_handle_render_composite`) has the same gap for layered
chains — out of scope here, will follow up in a separate PR.

## Tests

`backend/tests/test_render_state_propagation.py`:
1. Render 5 consecutive frames with `fx.reaction_mosh` enabled — assert
   frames 2..4 differ from frame 0 (state propagating).
2. Render frame 0, jump to frame 50, jump back to 0 — assert state was
   reset on each non-monotonic jump.
3. Same chain across two paths — assert state isolation per source.

## Risk

- **Memory:** state dicts can hold full prev-frame arrays (~8MB at 1080p).
  Capping at one path × one chain via the key reset bounds this to a single
  copy at most.
- **Correctness on chain edits:** `apply_chain` uses `states.get(effect_id)`
  so removing an effect mid-playback simply leaves an unused key; adding an
  effect starts it cold (correct behavior).
- **Determinism:** state propagation is the *same* path export uses — if
  export is correct, preview now matches.
