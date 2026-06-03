# Change 01 — implementation tasks

> Implementer: work top-to-bottom. Run `npx --no tsc --noEmit` after task 3 to size D8 stubs.
> Definition of done: `cd frontend && npx --no vitest run` is fully green; no new `any`;
> the global `effectChain` field is no longer **written** by the migrated actions.

## Timeline store
- [ ] 1. Add `updateTrackEffectChain(trackId, updater)` to the `TimelineState` interface and impl,
      placed near `setTrackOpacity`. Plain `set` (not undoable). Unknown trackId = no-op. (design D2)

## Project store
- [ ] 2. Import `useTimelineStore` into `stores/project.ts` (confirm no circular import via `tsc`).
- [ ] 3. Add `trackId: string` as the **first parameter** to: `addEffect`, `removeEffect`,
      `reorderEffect`, `updateParam`, `setMix`, `toggleEffect`, `activateAB`, `toggleAB`,
      `copyToInactiveAB`, `deactivateAB`. Update the `ProjectState` interface signatures to match.
      ⚠️ **A/B actions have a DIFFERENT mutation shape** (`set((state) => ({ effectChain: state.effectChain.map(...) }))`,
      NOT `undoable(...)` — they are deliberately non-undoable, project.ts:311-375). Do NOT wrap them in
      `undoable`; just retarget their `state.effectChain` to the track chain via `updateTrackEffectChain`.
      Don't mis-apply the undoable pattern from tasks 4. (CTO finding #6)
- [ ] 4. Retarget every `get().effectChain` read and `set({ effectChain })` write inside those
      actions to operate on the track's chain:
      - reads: `useTimelineStore.getState().tracks.find(t => t.id === trackId)?.effectChain ?? []`
      - writes: `useTimelineStore.getState().updateTrackEffectChain(trackId, prev => <next>)`
      Preserve the `MAX_EFFECTS_PER_CHAIN` early-return in `addEffect` (read track chain length).
      Preserve ALL cross-store undo cleanup in `removeEffect` (operators, automation, midi, deviceGroups)
      and the `undoable(label, forward, inverse)` wrapping exactly. (design D1, D3)
      ⚠️ **Retarget the PRE-`undoable` snapshot reads too** — "preserve exactly" does NOT mean leave them
      reading the stale global field. These reads MUST move to the track chain:
      `removeEffect` `prevId`+`removed` (project.ts:130-134), `reorderEffect` `oldOrder` (~:210),
      `updateParam` `oldValue` (~:233), `setMix` `oldMix` (~:253), `toggleEffect` `wasEnabled` (~:270).
      Capture them OUTSIDE the closure from the track chain; mutate INSIDE via `updateTrackEffectChain`.
      A literal "preserve exactly" here causes silent restore-at-index-0 bugs. (CTO finding #3)
- [ ] 5. Add `getActiveEffectChain()` and `useActiveEffectChain()` exports with a stable module-level
      `EMPTY` constant. Do NOT wire any consumer to them yet (Epic 02). (design D4)
- [ ] 6. Leave the `effectChain` field + default in `ProjectState` in place; remove only its **writes**
      from the migrated actions. No mirror-writes. `resetProject()` unchanged. (design D6)

## D8 compile-stubs (VERIFIED non-test call sites — all WILL break compile)
- [ ] 7. Insert a `trackId` arg at each of these confirmed call sites and mark
      `// TODO(Epic02): use active track`. ⚠️ Do NOT use `?? MASTER_TRACK_ID` — `'master'` resolves to
      NO track (timeline starts `tracks: []`), so a no-selection add silently vanishes (Real Tiger 3).
      Instead use `useTimelineStore.getState().selectedTrackId` and let task 7b make the no-op LOUD.
      Sites (verified 2026-06-02):
      - `project-persistence.ts:325` — hydrate loop `projectStore.addEffect(effect)` (⚠️ MISSED by first draft; Epic 05 reworks this, stub for now)
      - `App.tsx:536` `removeEffect`, `:553` `addEffect(clone)`, `:629` `removeEffect`, `:1387` `addEffect({...})`,
        `:2172` `onAddEffect={addEffect}` (prop — wrap), `:2180` `addEffect`, `:2192` `addEffect`
      - `DeviceChain.tsx:52` `toggleEffect`, `:56` `removeEffect`, `:103` `addEffect`, `:110` `updateParam`, `:116` `setMix`
      - `ABSwitch.tsx:14` `activateAB`, `:16` `copyToInactiveAB`, `:18` `toggleAB`, `:25` `deactivateAB`
- [ ] 7b. **Make the no-op LOUD** (Real Tiger 3): when a migrated action resolves `trackId` to no track,
      `console.warn('[effect-chain] no track for trackId=…; mutation skipped')` in dev. Keeps the spec's
      "no-op" contract (no throw) while killing silent user-effect loss during the transition.

## Tests (this epic)
- [ ] 8. Migrate `frontend/src/__tests__/stores/project.test.ts`: every chain action call gains a
      `trackId`; arrange a track in the timeline store in `beforeEach`; assertions read the track's
      chain via `useTimelineStore.getState()`. (design D7)
- [ ] 9. ADD store-layer isolation tests:
      - 2-track: addEffect to V1, assert V2.effectChain unchanged; reorder/remove on V1 leave V2 intact.
      - 3-track mixed: different effect ids per track survive cross-track operations.
      - updateParam/setMix/toggleEffect on V1 effect does not touch V2.
      - undo of an addEffect on V1 restores V1 only.
- [ ] 10. These OTHER suites reference the migrated actions and WILL break compile (verified — 11 beyond
      project.test.ts). Apply minimal mechanical `trackId` insertion to keep each green; deeper rewrites
      belong to the owning epic. List touched files in PR notes:
      `redteam-chaos.test.ts`, `sprint1-wiring.test.ts`, `sprint3-layout-ux.test.ts`,
      `sprint4-unwired-stores.test.ts`, `sprint4-ab-deactivate.test.ts`, `sprint6-security.test.ts`,
      `stores/cross-store-integration.test.ts`, `stores/project-persistence.test.ts`,
      `stores/ab-switch.test.ts`, `stores/zero-default-effect-toast.test.ts`, `stores/device-group.test.ts`.
- [ ] 10b. PC-B guard: add a test that `resetProject()` leaves no stale per-track chains inconsistent with
      the project reset (verify reset semantics across project+timeline stores). (data-integrity PC-B)

## Verify (Gate 4)
- [ ] 11. `cd frontend && npx --no vitest run` → all green. Paste the pass/fail summary.
- [ ] 12. `npx --no tsc --noEmit` → no errors.
- [ ] 13. Confirm via grep that no migrated action body still contains `set({ effectChain` /
      `get().effectChain` (the only remaining references should be the field declaration, default,
      `resetProject`, and the not-yet-migrated A/B helpers IF deferred — there should be none deferred).
