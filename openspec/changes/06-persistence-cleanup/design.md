# Change 05 — design decisions

## D1. Hydrate restores per-track effectChain (the real fix)
In `hydrateStores`'s track loop (project-persistence.ts ~337-410), after the track is created
(`addTrack`/`addAudioTrack` → `addedTrackId`) and its clips are added, restore its chain:
```ts
const savedChain = Array.isArray((track as any).effectChain) ? (track as any).effectChain : []
if (savedChain.length) {
  useTimelineStore.getState().updateTrackEffectChain(addedTrackId, () => savedChain as EffectInstance[])
}
```
- Use `updateTrackEffectChain` (Epic 1 primitive) — a plain set, NOT undoable (hydrate must not create
  undo entries).
- Trust boundary (memory: numeric-trust-boundary): the saved chain is external input. Minimum:
  guard it's an array of objects with an `effectId` string; drop malformed entries. Full per-param
  validation can reuse existing effect validation if cheap; otherwise restore as-is and note it (the
  existing `validateProject` already gates gross structure). Don't over-build.
- Order: restoring after clips is fine. The final "select first video track" (line ~432) still runs.

## D2. Remove masterEffectChain
- Delete the serialize line (`masterEffectChain: projectStore.effectChain`, :173) and drop
  `masterEffectChain?` from the Project type annotations in this file.
- Delete the hydrate stub (:324-328) entirely. Per-track chains now come from D1.

## D3. Delete the global effectChain field
- Remove `effectChain: EffectInstance[]` (project.ts:15) and `effectChain: [] as EffectInstance[]`
  (PROJECT_DEFAULTS :66). After D1/D2/D4 there are no readers. Run `tsc` — any breakage reveals a
  missed reader; fix it (route to the active track's chain or a track chain as appropriate).
- `getActiveEffectChain`/`useActiveEffectChain`/`getTrackChain` read TRACK chains — they stay.

## D4. Remove the dead legacy `chain` read (App.tsx:788)
The `chain` var's non-override value is unused by live paths. Simplify:
```ts
// was: const chain = chainOverride ?? (FF.F_0512_6_UNDO_RERENDER ? useProjectStore.getState().effectChain : effectChain)
const chain = chainOverride ?? EMPTY_CHAIN   // or remove `chain` entirely if no consumer remains
```
First grep every use of `chain` in requestRenderFrame. If the ONLY consumers are `chainOverride`
checks, remove the `chain` var and use `chainOverride` directly. If something does read `chain`,
route it to `getActiveEffectChain()`. Either way: NO read of the global field. Drop the now-unused
`effectChain` destructure from `useProjectStore()` in App.tsx if it becomes unused. Leave the
`F_0512_6_UNDO_RERENDER` flag itself (used elsewhere) — only this dead branch goes.

## D5. Dead-code cleanup (VERIFY each with grep before removing)
IDE flags as unused: `reorderEffectRaw`, `updateParamRaw`, `setMixRaw`, `toggleEffectRaw`,
`selectEffect`, the `removeEffect` wrapper (App.tsx ~167-185), `renderSeqRef`, `resolveGhostValues`.
For EACH: grep the file to confirm zero references before deleting. If any is actually used, leave it.
Don't delete anything still referenced. (These accumulated from Epic 1/2 D8 stubs.)

## D6. MASTER_TRACK_ID removal (verify zero users)
Grep `MASTER_TRACK_ID` across `src/` (non-test). Expect only the `limits.ts` definition + the
`freeze.ts` re-export remain (Epic 3 removed the call sites). If zero live users, delete both the
constant and the re-export. If ANY test or code still imports it, leave it and note why.

## D7. Round-trip test (the gate)
Build a 2-track project in-memory (V1 effectChain=[effect A], V2 effectChain=[effect B]); call the
serialize path; feed the serialized object through hydrate (or save to a temp path + load); assert:
- track V1's restored chain == [A], V2's == [B] (independent)
- the project has NO `masterEffectChain` key in the serialized output
- no global `effectChain` field exists on the project store
No fixture file needed (build in-memory). Name tests after the persistence spec scenarios.

## D8. Migrate tests referencing the global field
After deleting the field, these break: `project-persistence.test.ts` ("includes master effect chain"
seeds/asserts the global field), `device-group.test.ts` (may seed global), possibly others. Update
them to the per-track shape (seed track chains; assert the new serialize shape). Run the FULL frontend
suite; fix every breakage. The suite must be fully green.

## Open questions for implementer (verify first 20 min)
- Grep all `chain` uses in requestRenderFrame (D4) — confirm the dead var is safe to remove.
- Run `tsc` immediately after deleting the field (D3) to enumerate any missed readers.
- Confirm `updateTrackEffectChain` exists + is non-undoable (Epic 1) before using it in hydrate.
