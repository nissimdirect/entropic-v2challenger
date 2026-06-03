# Change 01 — design decisions

## D1. Where do the chain-mutating actions live?
**Decision:** Keep them in the **project store**, add `trackId` as the first arg, retarget their
storage from `get().effectChain` to the selected track's chain in the **timeline store**.

**Why not move them into the timeline store?** `removeEffect` carries ~50 lines of cross-store undo
cleanup (operator mappings, automation lanes keyed by trackId, midi CC, device groups). That logic
is orthogonal to where the chain array lives and already reaches into other stores from the project
store. Moving it into the timeline store would bloat it and shuffle imports for no benefit. The
chain *array* moves to the track; the *orchestration* stays put.

**Mechanism:** `project.ts` imports `useTimelineStore` (verified: no circular dependency — timeline
does not import project). Reads become
`useTimelineStore.getState().tracks.find(t => t.id === trackId)?.effectChain ?? []`.
Writes go through a single timeline primitive (D2) so the timeline store stays the sole owner of its
`tracks` array (no external `setState` on tracks from project.ts).

## D2. Timeline store primitive
Add to timeline store, mirroring `setTrackOpacity`:
```ts
// Functional update of one track's effectChain. Pure store write (NOT undoable here —
// callers in project.ts wrap with `undoable` so cross-store undo stays atomic).
updateTrackEffectChain: (trackId: string, updater: (chain: EffectInstance[]) => EffectInstance[]) =>
  set((state) => ({
    tracks: state.tracks.map((t) =>
      t.id === trackId ? { ...t, effectChain: updater(t.effectChain) } : t,
    ),
  }))
```
- Unknown `trackId` → no-op (map matches nothing). Callers guard before calling for early-return
  semantics (e.g. `addEffect` length check).
- The `MAX_EFFECTS_PER_CHAIN` guard stays in `addEffect` (project store) — same place as today,
  just reading the track's chain length.

## D3. Undo atomicity
Today each action wraps `undoable('label', forward, inverse)`. We keep that exactly. `forward`/`inverse`
now call `updateTrackEffectChain(trackId, ...)` instead of `set({ effectChain })`. Because
`updateTrackEffectChain` is a plain `set` (not itself undoable), the single `undoable` wrapper in the
project action remains the one undo unit — cross-store cleanup + chain mutation undo together, as now.

## D4. Active-chain selector
```ts
// project.ts (or a selectors file) — derives the chain the UI should show.
export const getActiveEffectChain = (): EffectInstance[] => {
  const tid = useTimelineStore.getState().selectedTrackId
  if (!tid) return []
  return useTimelineStore.getState().tracks.find(t => t.id === tid)?.effectChain ?? []
}
export const useActiveEffectChain = () =>
  useTimelineStore(s => {
    const t = s.tracks.find(t => t.id === s.selectedTrackId)
    return t?.effectChain ?? EMPTY  // stable EMPTY const to avoid re-render churn
  })
```
Use a module-level `const EMPTY: EffectInstance[] = []` so the no-selection case returns a stable
reference (Zustand re-render hygiene). Consumed by DeviceChain in Epic 02, not here.

## D5. selectedEffectId scoping
Stays a single value in the project store for Epic 1. A selected effect id is unique across chains
(uuid), so a global pointer is unambiguous. If a later epic needs per-track selection memory we
revisit — out of scope now.

## D6. Transitional global field
`effectChain` field + its default stay in `ProjectState` through Epic 1–4. After this epic the
migrated actions no longer write it. Do **not** add mirror-writes (mirrors drift and hide bugs).
`resetProject()` still resets it harmlessly. Deleted in Epic 05 with the persistence clean break.

## D7. Test migration boundary
`project.test.ts` is the unit suite for these actions → migrate it **in this epic**:
- Each `addEffect(effect)` → `addEffect(trackId, effect)`; arrange a track in the timeline store first.
- Assertions on `useProjectStore.getState().effectChain` → on the track's chain via timeline store.
- ADD: 2-track isolation test (add to V1, assert V2 unchanged) and 3-track mixed-type test at the
  store layer.
Other suites that touch the chain (device-group, ab-switch, cross-store-integration, sprint1-wiring,
redteam-chaos) are migrated in the epic that owns their surface — **not here** — UNLESS they fail to
compile due to the signature change. If a signature change breaks their compile, apply the minimal
mechanical `trackId` insertion to keep them green and note it; deeper rewrites stay with their epic.

## D8. Helper for callers without an explicit track
Many current call sites (App.tsx Cmd+D duplicate, DeviceChain drop) operate on "the current chain".
For Epic 1 we do **not** change those call sites (that's Epic 02). To keep them compiling and the
suite green, the migrated actions must still be callable — callers in Epic 02 will supply
`timeline.selectedTrackId`. Within Epic 1 only the **store API + its unit tests** change. If App.tsx
/ DeviceChain reference the old zero-`trackId` signatures and break compile, add a temporary
`trackId` argument sourced from `useTimelineStore.getState().selectedTrackId ?? MASTER_TRACK_ID` at
those call sites (minimal, mechanical) and flag them with `// TODO(Epic02): use active track` so Epic
02 finds them. This keeps `tsc`/vitest green at the Epic-1 boundary without doing Epic 02's design work.

## Open question for implementer to verify in first 30 min
- Does any non-test caller pass through TypeScript strict checks once signatures gain `trackId`?
  Run `npx --no tsc --noEmit` early; the count of break sites tells us how many D8 stubs are needed.
