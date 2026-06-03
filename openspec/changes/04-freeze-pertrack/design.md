# Change 03 — design decisions

## D1. Active track is the freeze target
Freeze operates on the chain the user is editing = the active track (Epic 2's
`getActiveTrackId()` = selectedTrackId-if-valid ?? first video track). All three handlers resolve it
and guard null (no active track → friendly toast or silent return, matching the existing
`activeAssetPath` guard pattern in handleFreezeUpTo).

## D2. Build the prefix from the active track's chain
`handleFreezeUpTo` currently slices the global `effectChain` (App.tsx:1480). Change to read the active
track's chain: `const chain = getActiveEffectChain()` (Epic 1, resolves via active-track rule after
Epic 2). Slice `chain.slice(0, cutIndex+1)`. The `cutIndex` bound check uses `chain.length`.

## D3. DeviceChain isFrozenAt
DeviceChain renders the active track's chain (Epic 2). Read `const activeTrackId = useActiveTrackId()`
at component top; in `buildMenuItems` use `isFrozenAt(activeTrackId ?? '', index)` (empty string →
store returns false, safe). Add `activeTrackId` to the `buildMenuItems` useCallback deps.

## D4. Per-track freeze isolation (already supported)
`frozenPrefixes: Record<trackId, FreezeInfo>` means freezing V1 records `frozenPrefixes['V1']` and
`isFrozen('V2', i)` returns false. Switching the active track naturally shows the correct frozen
state per track. No store change. The new tests assert this isolation.

## D5. Scope guard — do NOT expand
- The freeze→render cache consumption path (how a frozen prefix is actually used during live render)
  is OUT OF SCOPE. F-0514-16 is explicitly the store/call-site rewire to per-track. If the cache
  isn't consumed by the render today, that's a pre-existing state, not this epic's bug.
- Leave the `MASTER_TRACK_ID` constant + freeze.ts re-export in place (Epic 5 clean-break removes the
  constant). Only remove the now-dead IMPORTS in App.tsx/DeviceChain if grep shows they're unused
  after the swap; if anything else still imports it, leave it.

## Open question for implementer (verify first 10 min)
- Confirm `getActiveEffectChain()` (Epic 1, updated in Epic 2) returns the active track's chain so the
  freeze prefix is built from the right chain. Read it before wiring handleFreezeUpTo.
