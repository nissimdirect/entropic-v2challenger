# Change 04 — export-pertrack (dir: 05-export-pertrack)

> Epic 4. Fixes the one place per-track chains broke a real feature: export. Plus an explicit
> backend guard test for the per-track composite seam. (Originally scoped as "ipc-backend track_id
> scoping" — that part is DROPPED: the backend is stateless re: tracks and would consume no track_id,
> so threading it is a dead-flag anti-pattern.)

## Why
Epic 2 wired the PREVIEW render to per-track chains but left the EXPORT path on the global chain:
`export_start` (App.tsx:~1815) sends `chain: serializeEffectChain(effectChain)` — the global field,
now stale/empty after Epic 1. So **export currently renders with no/wrong effects**. Real P1 bug.

## Discovery facts
- Frontend `export_start` sends `input_path` (single `activeAssetPath.current`), `chain` (GLOBAL,
  stale), and `text_layers`. (App.tsx:~1811-1817)
- Backend `ExportManager.start(input_path, chain, text_layers, ...)` → `_run_export` applies ONE
  `chain` per frame to ONE `input_path`, then composites text overlays (export.py:168-230, 310-422).
  It does **NOT** composite multiple video tracks. Export is single-video-source + text overlays.
- `render_composite` (preview) DOES apply per-layer chains and is tested by
  `test_composite_state_propagation.py` (per-layer state). No test asserts two DISTINCT chains →
  distinct layer outputs.

## What changes
1. **Export chain-sourcing fix:** `export_start` sends `getActiveEffectChain()` (the active track's
   chain) instead of the global `effectChain`. Guard: if no active track, toast + abort (mirrors the
   existing `activeAssetPath` guard).
2. **Belt-and-suspenders backend test:** `render_composite` with two layers carrying DISTINCT chains
   (V1=[effect A], V2=[effect B]) → assert each layer's output reflects its own chain (composite
   differs from either-chain-applied-to-both). Closes the exact per-track composite scenario headlessly.
3. **Frontend test:** export builds its chain from the active track (assert the chain passed to
   `export_start` is the active track's, not the global field).

## Explicitly OUT OF SCOPE (documented, not built)
- **Multi-track video-composite export parity.** Export remains single-video-source + text overlays,
  exactly as before PR-zero. Making export composite all video tracks (like the preview) is a NEW
  feature — track it as a separate follow-up ("export parity with multi-track preview"), NOT PR-zero.
- track_id threading through render IPC for logging (no consumer; dead-flag avoidance).

## Impact
- Specs: `export` (new), `effect-chain` (MODIFIED — composite guard).
- Code: App.tsx export handler (1-line chain source + guard); new backend test; frontend test.
- Risk: LOW. Export fix is a chain-source swap; the backend test is additive. Revert = revert commit.
