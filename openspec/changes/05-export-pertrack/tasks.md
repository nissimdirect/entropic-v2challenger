# Change 04 — implementation tasks

> DoD: frontend `npx --no -- tsc --noEmit` exit 0 + `npx --no vitest run` green; backend
> `python3 -m pytest tests/test_composite*.py -q` green (new test passes); export sources the active
> track's chain. Repo hazard: lint hook may revert Edit — re-read; use Write if reverted.

## Export fix (frontend)
- [ ] 1. In App.tsx export handler, read `getActiveEffectChain()` (active track's chain) for the
      `export_start` `chain` payload instead of the global `effectChain`. (D1)
- [ ] 2. Guard: if `getActiveTrackId()` is null, toast ("Add a video track before exporting") + abort,
      mirroring the existing `if (!activeAssetPath.current)` guard. (D1)
- [ ] 3. Add a code comment at the export call site: export is single-video-source + text overlays;
      multi-track composite export parity is a separate follow-up feature (out of PR-zero scope). (D1)

## Backend composite guard test
- [ ] 4. Read `backend/src/engine/compositor.py` `render_composite` signature + the existing
      `backend/tests/test_composite_state_propagation.py` fixtures FIRST. (D2 open-q)
- [ ] 5. Add a test (`test_composite_per_track_chains.py` or into the existing file): `render_composite`
      with two layers carrying DISTINCT visible chains (e.g. V1=[color_invert], V2=[a different visible
      effect]). Assert the composite output differs from the all-layers-use-chain-A baseline → proves
      each layer applies its OWN chain. Headless, deterministic. Name the test for the spec scenario. (D2)
- [ ] 6. Cover states: layer with empty chain (passthrough), two layers distinct chains (isolation),
      same effect different params per layer (params isolated).

## Frontend export test
- [ ] 7. Test that the export handler sources the active track's chain (two tracks, distinct chains,
      set active track, assert exported chain == active track's chain, NOT the global field). Extract a
      pure chain-sourcing helper if needed for testability. (D3)

## Verify
- [ ] 8. `cd frontend && npx --no -- tsc --noEmit` → exit 0 (paste).
- [ ] 9. `cd frontend && npx --no vitest run` → all green (paste totals + failures).
- [ ] 10. `cd backend && python3 -m pytest tests/test_composite_state_propagation.py tests/test_composite_per_track_chains.py -q` → green (paste). (Run only the composite tests — full suite is slow; the new test is the gate.)
- [ ] 11. Confirm the export `chain` payload is now the active track's chain (quote the final code).
