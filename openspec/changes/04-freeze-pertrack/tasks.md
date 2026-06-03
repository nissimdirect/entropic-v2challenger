# Change 03 — implementation tasks

> DoD: `npx --no -- tsc --noEmit` exit 0; `npx --no vitest run` all green; freeze/unfreeze/flatten
> operate on the active track; per-track freeze isolation tested. Repo hazard: lint hook may revert
> Edit — re-read; use Write if reverted.

## Call-site rewire (App.tsx)
- [ ] 1. `handleFreezeUpTo`: `const trackId = getActiveTrackId(); if (!trackId) return` (after the
      activeAssetPath guard). Build prefix from the active track's chain (`getActiveEffectChain()`),
      bound-check against that chain's length. `freezePrefix(trackId, cutIndex, ...)`. Update useCallback
      deps (drop global `effectChain`; the handler reads via getState/selectors inside). (D1, D2)
- [ ] 2. `handleUnfreeze`: `const trackId = getActiveTrackId(); if (!trackId) return;
      unfreezePrefix(trackId)`. (D1)
- [ ] 3. `handleFlatten`: `const trackId = getActiveTrackId(); if (!trackId) return;
      flattenPrefix(trackId, outputPath, activeFps)`. (D1)

## DeviceChain
- [ ] 4. Read `const activeTrackId = useActiveTrackId()` at component top. In `buildMenuItems` use
      `isFrozenAt(activeTrackId ?? '', index)`; add `activeTrackId` to the useCallback deps. (D3)

## Cleanup
- [ ] 5. Grep `MASTER_TRACK_ID` after the swap; remove now-unused imports in App.tsx/DeviceChain.
      Leave the constant in shared/limits.ts + the freeze.ts re-export (Epic 5 removes the constant). (D5)

## Tests (map to acceptance criteria)
- [ ] 6. Per-track freeze isolation: freeze V1 prefix → `isFrozen('V1', i<=cut)` true, `isFrozen('V2', i)`
      false; unfreeze V1 → `isFrozen('V1', ...)` false; `frozenPrefixes['V2']` never created.
- [ ] 7. handleFreezeUpTo builds the prefix from the ACTIVE track's chain (freeze V1 with [A,B], assert
      the prefix sent reflects V1's effects, not the global/stale chain). (May need to assert via the
      freezePrefix args / a store spy, or test the chain-slicing logic.)
- [ ] 8. Name each test for its spec scenario. Cover states: no active track (guard), freeze then switch
      active track (isolation), unfreeze.

## Verify
- [ ] 9. `npx --no -- tsc --noEmit` → exit 0 (paste).
- [ ] 10. `npx --no vitest run` → all green (paste totals + failures verbatim).
