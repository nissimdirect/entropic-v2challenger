# Change 1.5 — design decisions

## D1. `pruneEffectDependents` lives in a standalone module (cycle avoidance)
`removeTrack`/`duplicateTrack` are in `timeline.ts`. `deviceGroups` lives in `projectStore`, which
ALREADY imports `useTimelineStore` (Epic 1). A direct `timeline.ts → project.ts` import would create
a `project ↔ timeline` cycle. Put the helper in **`stores/crossStoreCleanup.ts`** and access every
store via lazy `getState()` inside the function body (ESM live bindings + function-level access make
any residual import cycle harmless at runtime). Both `project.ts` (removeEffect) and `timeline.ts`
(removeTrack) import the helper.

```ts
// stores/crossStoreCleanup.ts
export interface PruneSnapshot { operators: ...; lanes: ...; ccMappings: ...; deviceGroups: ... }
// Returns a snapshot for undo restore; mutates the four dependent stores.
export function pruneEffectDependents(effectIds: string[], opts?: { dropTrackLanes?: string }): PruneSnapshot
export function restoreEffectDependents(snap: PruneSnapshot): void
```
- `effectIds`: prune operator mappings (`targetEffectId ∈ effectIds`), midi CC (`effectId ∈ effectIds`),
  device groups (drop matching `effectIds`; if a group falls below 2 members, delete it — mirror
  `project.ts:180-188`), and automation lanes whose `paramPath` starts with `${effectId}.` (mirror
  `project.ts:166-171`).
- `opts.dropTrackLanes`: when set (track deletion), ALSO delete `useAutomationStore.lanes[trackId]`
  wholesale (covers lanes not matched by effect-id prefix, e.g. mixer/project-targeted lanes).
- Snapshot everything mutated so callers can restore on undo.

## D2. `removeEffect` refactor (behavior-preserving)
Replace the inline cleanup in `project.ts removeEffect` (operators/lanes/midi/deviceGroups,
~:137-201) with `pruneEffectDependents([id])` in `forward` and `restoreEffectDependents(snap)` in
`inverse`. Keep the chain mutation (now per-track via Epic 1's `updateTrackEffectChain`) exactly as
Epic 1 left it. Net behavior identical — the existing cross-store-integration tests must stay green
with no change. This is the regression canary for the extraction.

## D3. `removeTrack` cleanup + undo symmetry
Inside the existing `undoable` in `removeTrack`:
- forward: after removing the track, call `pruneEffectDependents(removedTrack.effectChain.map(e=>e.id),
  { dropTrackLanes: id })`. Capture the returned snapshot in a closure var.
- inverse: re-insert the track (existing logic) AND `restoreEffectDependents(snap)`.
The snapshot must be captured per-invocation (closure), exactly like `removeEffect` captures
`savedOperators`/`savedLanes`/etc. before the `undoable` call. Confirm undo restores: track, its
store lanes, operator mappings, CC mappings, device groups — all in ONE undo step.

## D4. `duplicateTrack` automation carry-over
```ts
const idMap = new Map<string,string>()          // oldEffectId -> newEffectId
const newChain = source.effectChain.map(e => { const nid = randomUUID(); idMap.set(e.id, nid)
  return { ...e, id: nid, parameters: { ...e.parameters } } })
// canonical: copy store lanes for the source track, re-keyed
const srcLanes = useAutomationStore.getState().lanes[trackId] ?? []
const newLanes = srcLanes.map(l => ({ ...l, id: randomUUID(),
  paramPath: rekeyPath(l.paramPath, idMap),       // replace leading "<oldId>." -> "<newId>."
  points: l.points.map(p => ({ ...p })) }))
// write lanes[newTrackId] = newLanes (via automation store; lazy getState)
// also re-key the cloned Track.automationLanes paramPaths for consistency (vestigial but keep sane)
```
- `rekeyPath`: if `paramPath` starts with `${oldId}.` for some old id in `idMap`, swap the prefix to
  the new id; otherwise leave unchanged (e.g. mixer/project paths).
- Must be inside the existing `undoable`: forward inserts track + writes new store lanes; inverse
  removes the track + deletes `lanes[newTrackId]`. Symmetric.
- Import cycle: `timeline.ts` accesses `useAutomationStore` via lazy `getState()` (it already imports
  `useUndoStore`/`useToastStore`; add `useAutomationStore`).

## D5. Operator/CC mapping policy (documented, deliberate)
Duplicated effects get NEW ids and are intentionally LEFT UNMAPPED by operators/CC. This is not
dangling (no mapping references the new ids; the source's mappings still validly point at the
source). Document in `duplicateTrack` header + the spec. If the user wants modulation duplicated,
that's a future enhancement, not a correctness bug. (Guardian's accepted outcome.)

## D6. Guard tests (invert the repro, CORRECTLY)
- TIGER 1 guard: after `removeTrack`, assert `useAutomationStore.getState().lanes[tid]` is undefined,
  AND operator/CC/group refs to the track's effects are gone, AND undo restores them all.
- TIGER 2 guard: after `duplicateTrack`, assert `useAutomationStore.getState().lanes[newTrackId]`
  EXISTS, its paramPaths reference the COPY's new effect ids (not the source's), and lane ids are
  fresh. ⚠️ Do NOT assert on `Track.automationLanes` (vestigial) for the canonical behavior.
- Keep one assertion documenting Track.automationLanes is re-keyed too (consistency), clearly labeled.

## Open question for implementer (verify first 20 min)
- Confirm no import-init crash from the new cross-store wiring: run `tsc --noEmit` AND a focused
  vitest on the guard file. If a circular-init error appears, ensure ALL cross-store access is via
  `getState()` inside function bodies (never at module top-level).
