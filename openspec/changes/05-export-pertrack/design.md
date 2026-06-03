# Change 04 — design decisions

## D1. Export sources the active track's chain
`export_start` currently sends the global `effectChain`. Change to `getActiveEffectChain()` (Epic 1/2
selector = the active track's chain). This preserves export's single-source model (one input asset +
one chain + text overlays) while using the correct, non-stale chain. Guard: if `getActiveTrackId()`
is null (no video track), toast "Add a video track before exporting" and abort — mirror the existing
`if (!activeAssetPath.current)` guard already in the export handler.

**Why not composite all tracks?** The backend export path (`ExportManager._run_export`) is built for a
single video source + text overlays. Multi-track video compositing in export would require rewiring
export to use `render_composite`-style per-layer rendering — a substantial new feature. Out of scope
(see proposal). Document the limitation in a code comment at the export call site.

## D2. Belt-and-suspenders composite test (the real per-track render guard)
Add to `backend/tests/test_composite_state_propagation.py` (or a new
`test_composite_per_track_chains.py`): build a non-trivial frame; call `render_composite` with two
layers:
- layer V1: `chain=[<effect A: e.g. color_invert>]`
- layer V2: `chain=[<effect B: e.g. a distinct visible effect>]`
Assert: the composite output is NOT equal to the output when BOTH layers use chain A (proves each
layer applied its OWN chain, not a shared/global one). Follow the existing `_frame()` /
`render_composite(...)` fixtures in that file. Headless, deterministic, no GUI, no Playwright.

This is the explicit headless proof of the per-track render seam that the CTO review flagged as the
minimum to trust the per-track render before merge.

## D3. Frontend export test
Unit/component test asserting the export handler sources the active track's chain: arrange two tracks
with distinct chains, set the active track, invoke the export trigger (or the chain-building logic it
uses), assert the `chain` payload equals the active track's chain (not the global `effectChain`,
which stays empty). If the export handler is hard to invoke in isolation, extract the chain-sourcing
into a tiny pure helper and test that.

## D4. Dropped: track_id IPC threading
The plan's original "apply_chain backend: receive track_id" is dropped. The backend receives a chain
and applies it; it never looks a chain up by track. Adding a track_id param with no consumer is a
dead flag (CLAUDE.md dead-flag rule). If a future need arises (per-track backend caching/observability),
add it THEN with a real consumer.

## Open question for implementer (verify first 10 min)
- Confirm the export handler's `effectChain` reference is the global project-store field (stale after
  Epic 1). Read App.tsx around the `export_start` sendCommand. Then swap to `getActiveEffectChain()`.
- Confirm `render_composite`'s Python signature + how a layer's `chain` is passed (read
  `backend/src/engine/compositor.py` render_composite + the existing test) before writing the test.
