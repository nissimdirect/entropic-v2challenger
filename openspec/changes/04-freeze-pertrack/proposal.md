# Change 03 — freeze-pertrack (dir: 04-freeze-pertrack) — F-0514-16

> Epic 3. Smallest epic. The freeze store is ALREADY trackId-keyed; this just rewires the call
> sites to pass the active track id + that track's chain instead of the synthetic MASTER_TRACK_ID +
> the (now-stale) global effectChain.

## Why
`useFreezeStore` (stores/freeze.ts) keys `frozenPrefixes` by trackId and every action already takes
`trackId`. But the call sites still use the synthetic `MASTER_TRACK_ID` (a leftover from the
project-level global chain) and build the freeze prefix from the global `effectChain` (App.tsx:1480)
— stale after Epic 1. Rewire to per-track so freeze/unfreeze/flatten operate on the active track and
its chain, with correct per-track freeze isolation.

## Discovery facts
- Freeze store: fully trackId-keyed, NO changes needed (stores/freeze.ts:18-39).
- Call sites (all live): App.tsx `handleFreezeUpTo` (1469-1497, builds prefix from global
  `effectChain`, passes MASTER_TRACK_ID 1486), `handleUnfreeze` (1500), `handleFlatten` (1509);
  DeviceChain.tsx `isFrozenAt(MASTER_TRACK_ID, index)` (:184).
- Active-track resolution exists from Epic 2 (`getActiveTrackId`/`useActiveTrackId`).
- The freeze→live-render cache integration (if any) is unchanged; F-0514-16 is the STORE rewire only.

## What changes
1. `handleFreezeUpTo`: resolve `trackId = getActiveTrackId()` (guard null); build the prefix from THAT
   track's chain (not global `effectChain`); `freezePrefix(trackId, ...)`.
2. `handleUnfreeze`: `unfreezePrefix(getActiveTrackId())` (guard null).
3. `handleFlatten`: `flattenPrefix(getActiveTrackId(), ...)` (guard null).
4. DeviceChain: `isFrozenAt(activeTrackId, index)` using `useActiveTrackId()`.
5. Remove now-dead `MASTER_TRACK_ID` imports in App.tsx/DeviceChain (the constant + re-export stay
   until Epic 5's clean-break, in case other code references them — grep first).

## Impact
- Specs: `freeze` (new capability — per-track freeze isolation).
- Code: App.tsx (3 handlers), DeviceChain.tsx (isFrozenAt + active-track read).
- Risk: LOW. Store unchanged; call-site swaps. Revert = revert the commit.
