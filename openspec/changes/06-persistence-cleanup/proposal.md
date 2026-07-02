# Change 05 — persistence + clean-break cleanup (dir: 06-persistence-cleanup)

> Epic 5 — the final epic. Fixes persistence to round-trip per-track chains, then deletes the
> transitional global `effectChain` field (end of strangler-fig) and the accumulated dead code.

## Why
Two things remain:
1. **Persistence is broken for per-track chains.** Save serializes full tracks (`tracks:
   timelineStore.tracks`, project-persistence.ts:145) which INCLUDE `effectChain` — but hydrate
   (`hydrateStores`) reconstructs tracks via `addTrack` (empty chain) + restores clips/mute/solo/gain
   and NEVER restores `track.effectChain`. So per-track chains are saved but lost on reload. The old
   code hid this because the GLOBAL chain (`masterEffectChain`) was the source; now it's per-track.
2. **The strangler-fig scaffold must come down.** The global `effectChain` field (project.ts:15,66),
   its `masterEffectChain` serialize (:173) + hydrate stub (:324-328), and the now-dead legacy
   `chain` read (App.tsx:788) should be removed for the clean break.

## Discovery facts
- Hydrate restores clips (addClip) but NOT effectChain (confirmed: zero effectChain restoration in
  hydrate; only the masterEffectChain→global stub at :324-328).
- `tracks:` serialize already includes each track's `effectChain` (Track type carries it).
- App.tsx:788 `chain = chainOverride ?? (F_0512_6 ? getState().effectChain : effectChain)` — the
  non-override value is DEAD: live render paths use `modulateChain(track.effectChain)`/`chainOverride`
  and never consume `chain`. (Verified: no live consumer of `chain` besides chainOverride.)
- `groupEffects` already trackId-scoped (Epic 2). Remaining global-field refs: project.ts:15,66 +
  persistence:173,328 + App.tsx:788 only.
- Dead code (IDE-flagged, Epic 1/2 leftovers): App.tsx `reorderEffectRaw`/`updateParamRaw`/
  `setMixRaw`/`toggleEffectRaw`/unused `selectEffect`/`removeEffect` wrapper/`renderSeqRef`/
  `resolveGhostValues`. `MASTER_TRACK_ID` now only re-exported (no live users).
- No user base → no migration code; old `.glitch` files simply won't carry chains (acceptable).

## What changes
1. **Hydrate restores per-track effectChain** — in the hydrate tracks loop, after creating each track
   and its clips, restore its `effectChain` from the saved track data via `updateTrackEffectChain`.
2. **Remove masterEffectChain** serialize (:173) + the hydrate global stub (:324-328).
3. **Delete the global `effectChain` field** (project.ts interface :15 + PROJECT_DEFAULTS :66).
4. **Remove the dead legacy `chain` read** at App.tsx:788 (reduce to chainOverride handling).
5. **Clean dead code** (verify-before-remove): the unused `...Raw` aliases + unused vars; and
   `MASTER_TRACK_ID` + its freeze.ts re-export if grep confirms zero users.
6. **Round-trip test** (the gate): save a 2-track project (V1=[A], V2=[B]), reload, assert each
   track's effectChain is restored independently.
7. **Migrate tests** still referencing the global field (e.g. project-persistence "includes master
   effect chain", device-group seeding) to the per-track shape.

## Impact
- Specs: `persistence` (new), `effect-chain` (MODIFIED — global field removed).
- Code: project.ts (delete field), project-persistence.ts (hydrate fix + remove masterEffectChain),
  App.tsx (dead chain + dead aliases), limits.ts/freeze.ts (MASTER_TRACK_ID).
- Risk: MEDIUM — deleting the field + persistence hydrate fix; round-trip test + full suite are the gates.
  Revert = revert the commit.
