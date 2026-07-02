# Change 02 — design decisions

## D1. Active-track resolution (the "no selection" state)
`selectedTrackId` can be null (addTrack doesn't select; load doesn't select). The editing UI and
mutation handlers need a non-null target. Resolve:
```ts
// project.ts (or selectors) — uses timeline store via lazy getState/subscription
export const getActiveTrackId = (): string | null => {
  const tl = useTimelineStore.getState()
  if (tl.selectedTrackId && tl.tracks.some(t => t.id === tl.selectedTrackId)) return tl.selectedTrackId
  const firstVideo = tl.tracks.find(t => t.type === 'video')
  return firstVideo?.id ?? null
}
export const useActiveTrackId = () => useTimelineStore(s =>
  (s.selectedTrackId && s.tracks.some(t => t.id === s.selectedTrackId))
    ? s.selectedTrackId
    : (s.tracks.find(t => t.type === 'video')?.id ?? null))
```
And `useActiveEffectChain()` (Epic 1) must resolve through the SAME rule (currently it keys only on
`selectedTrackId`). Update `useActiveEffectChain` to use the resolved active track id so display and
mutation agree. Auto-select to make selection explicit/visible:
- `addTrack`: if `selectedTrackId` is null after add, set it to the new track id (inside the same
  `undoable` forward; inverse clears it back to null).
- project load (`project-persistence.ts` hydrate): after tracks load, if none selected, select the
  first video track.

**Why first *video* track:** audio/text tracks don't carry a destructive effect chain the device
chain edits. If no video track exists, active = null and DeviceChain shows its empty state (handlers
loud-no-op per Epic 1) — a legitimate "nothing to edit" state.

## D2. DeviceChain display + handlers
- Replace `const effectChain = useProjectStore((s) => s.effectChain)` with
  `const effectChain = useActiveEffectChain()`.
- Replace each handler's `const trackId = useTimelineStore.getState().selectedTrackId; …(trackId ?? '', …)`
  with `const trackId = getActiveTrackId(); if (!trackId) return; …(trackId, …)`. Remove TODO(Epic02).
- `findGroupForEffect`/`buildMenuItems` operate on the displayed chain (already correct once display
  is per-track).
- DO NOT touch the `isFrozenAt(MASTER_TRACK_ID, index)` line (:182) — Epic 3.

## D3. App.tsx wrappers
`addEffect`/`removeEffect` wrappers (App.tsx:159-168): swap `selectedTrackId ?? ''` for
`getActiveTrackId()`, early-return if null. Same for the other call sites (Cmd+D duplicate ~553,
Backspace ~536/629, menu add ~1387/2180/2192). Each resolves the active track id.

## D4. Render path — per-track modulation (HIGHEST RISK)
Current (App.tsx:756-773): one `chain` from global, `applyPadModulations`/`applyCCModulations`
applied once. Refactor:
```ts
// pure helper (new): apply pad + CC modulation to ANY chain at a frame
function modulateChain(chain: EffectInstance[], frame: number): EffectInstance[] {
  const perf = usePerformanceStore.getState()
  const env = perf.getEnvelopeValues(frame)
  let out = Object.keys(env).length ? applyPadModulations(chain, perf.drumRack.pads, env) : chain
  const midi = useMIDIStore.getState()
  if (midi.ccMappings.length && Object.keys(midi.ccValues).length)
    out = applyCCModulations(out, midi.ccMappings, midi.ccValues)
  return out
}
```
- **composite layers** (App.tsx:817-833): `chain: serializeEffectChain(modulateChain(track.effectChain, frame))`.
  REMOVE `?? chain`.
- **single-clip path** (App.tsx:872-882): `const singleTrackChain = modulateChain(activeVideoClips[0].track.effectChain, frame)`;
  send `serializeEffectChain(singleTrackChain)`.
- **no-clip fallback layer** (App.tsx:849-853): `chain: []` (no global chain).
- `chainOverride`: still honored — if a `chainOverride` is passed (freeze re-render path), it bypasses
  per-track sourcing. Keep that branch; it's used by freeze (Epic 3 territory) — do not regress it.
- The legacy `let chain = …global…` (756) is now only used by the `chainOverride`/legacy branches;
  scope it so the per-track paths don't read it. If the `F_0512_6_UNDO_RERENDER` flag-off legacy
  branch still needs a global chain, leave that branch as-is (it's a fallback); the per-track paths
  are the live path.
- Operators (`serializedOps`) + `automation_overrides` are sent unchanged (keyed by effectId, unique).

**Correctness note:** CC/pad modulations target a specific `effectId`. Applying `modulateChain` to
each track's chain only mutates that track's matching effects — equivalent to the old single-chain
behavior when there was one chain, and correct now that effects are partitioned across tracks.

## D5. groupEffects(trackId, effectIds)
Add `trackId` as first arg; validate ids against `getTrackChain(trackId)` (Epic-1 helper / timeline
track) instead of the global `effectChain`. DeviceChain passes `getActiveTrackId()`. Update the
`ProjectState` signature + the device-group tests that seed the global field (they can now seed the
track chain). Device groups remain a project-store map (cross-track grouping still structurally
possible but the UI only ever groups within the active track).

## D6. Verification beyond unit tests (MANDATORY for this epic)
Unit/component tests (vitest) cannot prove the IPC render path. After unit green:
- Component test: DeviceChain renders the active track's chain; switching `selectedTrackId` swaps the
  displayed chain; adding with no selection resolves to first video track.
- A render-path unit test for `modulateChain` (pad + CC applied to a given chain).
- FLAG for the verifier (me, Opus): a live render check — launch the app or run the Playwright
  `_electron` 2-track fixture — to confirm V1 and V2 render their own chains and editing V1 doesn't
  change V2's render. This is the real acceptance gate; do not declare Epic 2 done on unit green alone.

## Open questions for implementer (verify first 30 min)
- Does `useActiveEffectChain` (Epic 1) currently key only on `selectedTrackId`? If so, update it to
  the resolved active-track rule (D1) so display matches mutation targets. Confirm by reading it.
- Count the `chain`-using call sites in requestRenderFrame after refactor; ensure none of the live
  per-track paths still read the global `chain`.
