# Change 02 — ui-wiring (dir: 03-ui-wiring)

> Epic 2. Makes the running app read per-track chains end to end — restores the preview that was
> by-design broken after Epic 1. Replaces the Epic-1 D8 stubs with real active-track wiring.

## Why
After Epic 1, the migrated actions write per-track chains, but DeviceChain still reads the (now
stale/empty) global `effectChain` (DeviceChain.tsx:39) and the render path still builds its `chain`
from the global field (App.tsx:756). The single-clip render path sends the global chain; the
composite path uses per-track `track.effectChain` but UNMODULATED with a global fallback. Net: the
editing UI shows nothing and the preview is wrong. Epic 2 wires both to per-track chains.

## Discovery facts
- `addTrack` does NOT set `selectedTrackId` (timeline.ts:254-273); `selectedTrackId` defaults null
  and nothing auto-selects on load. So "no active track" is a reachable state.
- DeviceChain reads global `effectChain` (:39) for display; mutation handlers use Epic-1 D8 stubs
  (`selectedTrackId ?? ''`, lines 54/60/109/118/126); `groupEffects` has no trackId (:161).
- Render path: `chain` = global effectChain (App.tsx:756), pad/CC modulations applied to it
  (:765/:771); composite layers use `track.effectChain ?? chain` (:819); single-clip path uses
  `chain` (:875). Operators + automation_overrides are sent to backend separately, keyed by effectId
  (unique across tracks) — unaffected by per-track split.
- `Track.effectChain` is populated and authoritative post-Epic 1.

## What changes
1. **Active-track resolution.** Add `getActiveTrackId()`/`useActiveTrackId()` = `selectedTrackId ??
   first video track id ?? null`. `addTrack` auto-selects the new track when none is selected;
   project load selects the first video track. (Preserves "always a chain" UX; covers no-selection.)
2. **DeviceChain** reads the active track's chain via `useActiveEffectChain()` (from Epic 1) instead
   of the global field. All mutation handlers + the App.tsx `addEffect`/`removeEffect` wrappers use
   the resolved active track id (remove the `?? ''` D8 stubs and `TODO(Epic02)` markers).
3. **`groupEffects(trackId, effectIds)`** gains trackId; validates ids against that track's chain.
   DeviceChain passes the active track id.
4. **Render path (the core).** Extract `modulateChain(chain, frame)` (pad + CC application, currently
   inline at App.tsx:760-773). Apply it PER track chain:
   - composite layers: `serializeEffectChain(modulateChain(track.effectChain, frame))` — DROP the
     `?? chain` global fallback.
   - single-clip fast path: source from `activeVideoClips[0].track.effectChain`, modulated.
   - the empty/no-clip fallback layer: empty chain (no global chain).
5. Freeze (`MASTER_TRACK_ID` in DeviceChain.tsx:182) is LEFT for Epic 3. Persistence
   (`masterEffectChain`) is LEFT for Epic 5.

## Impact
- Specs: `effect-chain` (MODIFIED — active-track UI binding), `track-lifecycle` (untouched).
- Code: DeviceChain.tsx, App.tsx (render path + wrappers), project.ts (groupEffects sig + active-track
  helpers), timeline.ts (addTrack auto-select), project-persistence.ts (load selects first track).
- Risk: HIGH — touches the render/modulation pipeline. Unit tests cannot fully prove the preview;
  requires a live/E2E render verification. Revert = revert the commit (flagged `F_CREATRIX_LAYOUT`? NO
  — PR-zero is unflagged per PLAN; revert is the rollback).
