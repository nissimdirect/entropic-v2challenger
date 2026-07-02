# Change 1.5 — track-lifecycle-integrity (dir: 02-track-lifecycle-integrity)

> Numbered `02-` on disk (sequential), but it is **Epic 1.5** in the plan: gated AFTER
> Epic 1 (per-track chains) and BEFORE Epic 2 (UI wiring). Closes two cross-store bugs that
> Epic 1 armed by making `Track.effectChain` load-bearing. Both CONFIRMED via tiger-repro.test.ts.

## Why
With per-track effect chains now real, two track-lifecycle operations leave inconsistent
cross-store state:

- **TIGER 1 — `removeTrack` runs zero cross-store cleanup** (timeline.ts:345-373). Deleting a
  track orphans: its `useAutomationStore.lanes[trackId]` (canonical automation — `getAllLanes()`
  at App.tsx:781 would still process phantom lanes for a deleted track), plus operator mappings
  (`targetEffectId`), midi CC mappings (`effectId`), and device groups (`effectIds`) that point at
  the deleted track's effects. The automation-store orphan is a **live bug today**; the effect-ref
  orphans become live now that chains are per-track. CONFIRMED by repro.
- **TIGER 2 — `duplicateTrack` does not carry automation** (timeline.ts:874-905). It clones
  `effectChain` with NEW effect ids but never copies `useAutomationStore.lanes[oldTrackId]` to the
  new track id → the duplicate silently has no automation. It also clones the **vestigial**
  `Track.automationLanes` field with stale paramPaths (harmless — see discovery — but should be
  re-keyed for consistency).

## Discovery correction (important)
`Track.automationLanes` is **vestigial at runtime**: UI (`components/timeline/Track.tsx:338`) and
engine (App.tsx `getLanesForTrack`/`getAllLanes`) read `useAutomationStore.lanes[trackId]`;
persistence serializes the store (`project-persistence.ts:176`), not the Track field. The canonical
automation state is the store. TIGER 2's user-facing impact is therefore "automation lost on
duplicate," not "dangling corruption."

## What changes
1. Extract `pruneEffectDependents(effectIds, opts)` into a **standalone module**
   `stores/crossStoreCleanup.ts`, accessing operator/automation/midi/project stores via lazy
   `getState()` (avoids a `timeline ↔ project` import cycle). Refactor `project.ts removeEffect`
   to call it (behavior-preserving).
2. `removeTrack`: within its existing `undoable`, prune the deleted track's dependents —
   drop `useAutomationStore.lanes[trackId]`; prune operator/midi/group refs to the track's effect
   ids — and snapshot all of it for symmetric undo restore (mirror `removeEffect`).
3. `duplicateTrack`: build an `oldEffectId → newEffectId` map; copy
   `useAutomationStore.lanes[oldTrackId] → [newTrackId]` with NEW lane ids and paramPaths rewritten
   through the map; re-key the cloned `Track.automationLanes` paramPaths for consistency.
4. Operator/CC mapping clone policy: **documented as NOT auto-duplicated** (deliberate — the
   duplicate's new effects are simply unmapped, which is valid and non-dangling; operators are
   global routing the user re-targets). No silent dangling is created.
5. Invert `tiger-repro.test.ts` into GUARD tests asserting CORRECT behavior. ⚠️ Re-point the
   TIGER 2 assertion at the CANONICAL store (`useAutomationStore.lanes[newTrackId]` exists with
   paramPaths re-keyed to the copy's effect ids), NOT at the vestigial `Track.automationLanes`.

## Impact
- Specs: `track-lifecycle` (new capability).
- Code: new `stores/crossStoreCleanup.ts`; `stores/project.ts` (removeEffect refactor);
  `stores/timeline.ts` (removeTrack + duplicateTrack + imports).
- Risk: MEDIUM (cross-store mutation + undo symmetry + import-cycle care). Revert = revert the commit.
