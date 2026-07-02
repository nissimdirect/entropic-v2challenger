# Change 05 — implementation tasks

> DoD: `npx --no -- tsc --noEmit` exit 0; `npx --no vitest run` FULLY green; round-trip test proves
> per-track chains persist; global `effectChain` field GONE; no read of it anywhere. Repo hazard:
> lint hook may revert Edit — re-read; use Write if reverted.

## Persistence fix (do FIRST — before deleting the field)
- [ ] 1. Confirm `updateTrackEffectChain` exists + is non-undoable (Epic 1). (D1)
- [ ] 2. In `hydrateStores` track loop (project-persistence.ts), after each track + its clips are
      restored, restore its `effectChain` from the saved track data via `updateTrackEffectChain`
      (guard: array of objects with string `effectId`; drop malformed). (D1)
- [ ] 3. Round-trip test (the gate): 2-track in-memory project (V1=[effect A], V2=[effect B]) →
      serialize → hydrate → assert V1 chain==[A], V2 chain==[B] independently; assert serialized output
      has NO `masterEffectChain`. (D7) — write this NOW and watch it FAIL before the cleanup, PASS after.

## Remove masterEffectChain
- [ ] 4. Delete `masterEffectChain: projectStore.effectChain` (serialize, :173) + drop `masterEffectChain?`
      from the Project type annotations in project-persistence.ts. (D2)
- [ ] 5. Delete the hydrate global stub (:324-328). (D2)

## Delete the global field + dead reads
- [ ] 6. Grep all `chain` uses in App.tsx requestRenderFrame (D4). Remove the dead legacy `chain` read
      at :788 (no global-field read); reduce to chainOverride handling. Drop the now-unused
      `effectChain` destructure from `useProjectStore()` in App.tsx if unused. Leave the F_0512_6 flag itself.
- [ ] 7. Delete the global `effectChain` field: project.ts interface (:15) + PROJECT_DEFAULTS (:66). (D3)
- [ ] 8. Run `npx --no -- tsc --noEmit` — fix every revealed missed reader by routing to the appropriate
      track chain / active chain (NOT re-adding the field). (D3)

## Dead-code cleanup (verify-before-remove)
- [ ] 9. For each IDE-flagged unused symbol (reorderEffectRaw, updateParamRaw, setMixRaw, toggleEffectRaw,
      selectEffect, the removeEffect wrapper, renderSeqRef, resolveGhostValues): grep to confirm zero
      references, then delete. Leave any that ARE referenced. (D5)
- [ ] 10. Grep `MASTER_TRACK_ID` (non-test); if zero live users, delete the constant (limits.ts) + the
      freeze.ts re-export. If any user remains, leave it + note why. (D6)

## Test migration
- [ ] 11. Update tests referencing the global field (project-persistence.test.ts "includes master effect
      chain"; device-group.test.ts; any others tsc/vitest flags) to the per-track shape. (D8)

## Verify
- [ ] 12. `npx --no -- tsc --noEmit` → exit 0 (paste).
- [ ] 13. `npx --no vitest run` → FULLY green (paste totals + any failures verbatim).
- [ ] 14. Grep-confirm: NO `useProjectStore...effectChain` / `getState().effectChain` / `.effectChain`
      reads the global field anywhere (only `track.effectChain` / selectors remain). Paste the grep.
- [ ] 15. Confirm the round-trip test (task 3) passes.
