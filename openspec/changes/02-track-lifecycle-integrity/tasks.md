# Change 1.5 — implementation tasks

> DoD: `cd frontend && npx --no vitest run` fully green; `npx --no -- tsc --noEmit` exit 0;
> guard tests assert CORRECT behavior (inverted from tiger-repro); removeEffect refactor causes
> ZERO regressions in cross-store-integration tests.
> Repo hazard: a lint hook may revert `Edit` changes — re-read after editing; use `Write` if reverted.

## Helper extraction
- [ ] 1. Create `frontend/src/renderer/stores/crossStoreCleanup.ts` with `pruneEffectDependents(effectIds, opts?)`
      and `restoreEffectDependents(snap)`. Access useOperatorStore/useAutomationStore/useMIDIStore/
      useProjectStore via lazy `getState()` inside function bodies ONLY (no top-level store calls). (D1)
      Mirror the exact prune rules from project.ts removeEffect:166-188 (lanes by paramPath prefix,
      operator mappings by targetEffectId, midi CC by effectId, deviceGroups with <2-member delete).
      `opts.dropTrackLanes: trackId` also deletes `lanes[trackId]` wholesale.
- [ ] 2. Refactor `project.ts removeEffect` to use `pruneEffectDependents([id])` (forward) +
      `restoreEffectDependents(snap)` (inverse). Behavior-preserving. Keep Epic-1 per-track chain
      mutation untouched. (D2) — cross-store-integration tests are the canary: they MUST stay green unchanged.

## removeTrack (TIGER 1)
- [ ] 3. In `timeline.ts removeTrack`, inside the existing `undoable`: capture
      `const snap = pruneEffectDependents(removedTrack.effectChain.map(e=>e.id), { dropTrackLanes: id })`
      in forward; call `restoreEffectDependents(snap)` in inverse alongside track re-insert. (D3)
      Import `pruneEffectDependents`/`restoreEffectDependents` from crossStoreCleanup.

## duplicateTrack (TIGER 2)
- [ ] 4. In `timeline.ts duplicateTrack`: build `oldEffectId→newEffectId` Map while cloning the chain;
      copy `useAutomationStore.getState().lanes[trackId]` → new lanes for `newTrackId` with fresh ids
      and `rekeyPath(paramPath, idMap)`; write them via the automation store inside the `undoable`
      (forward writes lanes[newTrackId]; inverse deletes them). Re-key the cloned Track.automationLanes
      paramPaths too. Access automation store via lazy getState(). (D4)
- [ ] 5. Add `rekeyPath(paramPath, idMap)` helper (swap leading `${oldId}.` prefix; else unchanged).
- [ ] 6. Add a header comment in duplicateTrack documenting that operator/CC mappings are deliberately
      NOT duplicated (D5).

## Tests
- [ ] 7. Convert `frontend/src/__tests__/stores/tiger-repro.test.ts` into guard tests (rename to
      `track-lifecycle.test.ts`) asserting CORRECT behavior:
      - [track-lifecycle/removeTrack cleans cross-store state] after removeTrack: lanes[tid] undefined;
        operator mappings to the track's effects gone; midi CC gone; device group pruned.
      - [track-lifecycle/removeTrack undo restores all] undo re-inserts track AND restores lanes,
        operator mappings, CC, device group — one undo step.
      - [track-lifecycle/duplicateTrack carries automation] after duplicate: useAutomationStore.lanes[newId]
        exists; paramPaths reference the COPY's new effect ids; lane ids fresh.
      - [track-lifecycle/duplicateTrack does not dangle] copy's effects have new ids; no mapping/lane
        references a non-existent effect id.
      - State coverage: track with empty chain (no-op clean), track with multi-effect chain + lanes +
        operator mapping + CC + device group (full prune), duplicate of track with 0 lanes (no crash).
- [ ] 8. Each test named for its acceptance criterion (spec scenario). Every scenario in
      specs/track-lifecycle/spec.md covered.

## Verify
- [ ] 9. `cd frontend && npx --no -- tsc --noEmit` → exit 0 (paste).
- [ ] 10. `cd frontend && npx --no vitest run` → all green (paste totals + any failures verbatim).
- [ ] 11. Confirm cross-store-integration.test.ts unchanged & green (removeEffect refactor regression check).
