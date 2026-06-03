# Change 02 — implementation tasks

> DoD: `npx --no -- tsc --noEmit` exit 0; `npx --no vitest run` all green; DeviceChain displays the
> active track's chain; render paths source per-track chains with per-track modulation; NO live
> per-track path reads the global `effectChain`. Repo hazard: lint hook may revert Edit — re-read; use Write if reverted.
> Live render verification is done by the reviewer (Opus), not this agent — but make it possible (don't break the build/run).

## Active-track resolution
- [ ] 1. Add `getActiveTrackId()` + `useActiveTrackId()` (project.ts or selectors) per design D1
      (selectedTrackId if valid, else first video track, else null).
- [ ] 2. Update Epic-1 `useActiveEffectChain()` to resolve through the SAME active-track rule (it
      currently keys only on selectedTrackId — confirm by reading, then fix). (D1 open-q)
- [ ] 3. `addTrack` (timeline.ts): if no track selected after add, select the new track (inside the
      undoable forward; inverse restores prior selectedTrackId). (D1)
- [ ] 4. Project load hydrate (project-persistence.ts): after tracks load, if none selected, select
      the first video track. (D1)

## DeviceChain + call sites
- [ ] 5. DeviceChain.tsx: `effectChain` = `useActiveEffectChain()` (drop the global-field read at :39).
- [ ] 6. DeviceChain handlers (toggle/remove/drop/updateParam/setMix): use `getActiveTrackId()`,
      early-return if null; remove `?? ''` and TODO(Epic02). (D2)
- [ ] 7. App.tsx addEffect/removeEffect wrappers + other call sites (Cmd+D ~553, Backspace ~536/629,
      menu-add ~1387/2180/2192): use `getActiveTrackId()`, early-return if null; remove D8 stubs. (D3)
- [ ] 8. DO NOT modify the `isFrozenAt(MASTER_TRACK_ID, …)` line (Epic 3).

## groupEffects
- [ ] 9. project.ts `groupEffects(trackId, effectIds)`: add trackId first arg; validate against that
      track's chain (getTrackChain) not the global field. Update ProjectState signature + DeviceChain
      call (pass getActiveTrackId()). (D5)

## Render path (core — App.tsx requestRenderFrame)
- [ ] 10. Extract `modulateChain(chain, frame)` pure helper (pad + CC), per design D4.
- [ ] 11. Composite layers (~817-833): `serializeEffectChain(modulateChain(track.effectChain, frame))`;
      REMOVE the `?? chain` fallback.
- [ ] 12. Single-clip path (~872-882): source `activeVideoClips[0].track.effectChain`, modulated.
- [ ] 13. No-clip fallback layer (~849-853): `chain: []`.
- [ ] 14. Keep the `chainOverride` branch working (freeze re-render uses it — do not regress). Scope
      the legacy global `chain` so no LIVE per-track path reads it; leave the F_0512_6 flag-off legacy
      branch intact as a fallback. (D4)

## Tests (map to acceptance criteria)
- [ ] 15. Component test (device-chain.test.tsx or new): DeviceChain shows the ACTIVE track's chain;
      switching selectedTrackId swaps the displayed chain; with no selection it resolves to the first
      video track; add-effect with no explicit selection lands on the first video track.
- [ ] 16. Unit test for `modulateChain`: pad + CC modulation applied to a given chain (not global).
- [ ] 17. Unit test: getActiveTrackId resolution (selected valid / selected stale / none+video / none+no-video=null).
- [ ] 18. addTrack auto-select test; load-selects-first-video-track test.
- [ ] 19. Name each test for its spec scenario (effect-chain MODIFIED scenarios). Cover states:
      no-selection, stale-selection, audio/text-only project (active=null), multi-track display swap.
- [ ] 20. Migrate any tests broken by the groupEffects signature change.

## Verify
- [ ] 21. `npx --no -- tsc --noEmit` → exit 0 (paste).
- [ ] 22. `npx --no vitest run` → all green (paste totals + failures verbatim).
- [ ] 23. Grep-confirm no live per-track render path reads global `effectChain` (only chainOverride/legacy branch may).
- [ ] 24. Report whether the build still launches (don't run E2E — reviewer does — but note any build break).
