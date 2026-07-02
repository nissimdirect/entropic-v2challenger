# Change 01 — per-track-chain-model

## Why
Today a single global `useProjectStore.effectChain` holds *the* effect chain. The Creatrix
layout redesign (and the freeze store's F-0514-16 note) assume each track owns its own chain.
`Track.effectChain` exists in the type but is vestigial. This change makes per-track chains the
source of truth at the **store/model layer** — the foundation every later epic builds on.

## What changes (Epic 1 scope only)
1. **timeline store** gains a per-track effect-chain mutation primitive keyed by `trackId`,
   mirroring the existing `setTrackOpacity(id, value)` pattern: `updateTrackEffectChain(trackId, updater)`.
   It is undoable-friendly (callers wrap with `undoable`) and clamps to `MAX_EFFECTS_PER_CHAIN`.
2. **project store actions** `addEffect`, `removeEffect`, `reorderEffect`, `updateParam`, `setMix`,
   `toggleEffect`, and the A/B actions (`activateAB`/`toggleAB`/`copyToInactiveAB`/`deactivateAB`)
   take **`trackId` as their first argument** and read/write that track's chain via the timeline
   store instead of the global `effectChain`. Their rich cross-store undo logic (operator mappings,
   automation lanes, midi CC, device groups) is preserved unchanged.
3. **`selectedEffectId`** stays in the project store (UI selection within the active chain).
4. A selector `getActiveEffectChain()` / `useActiveEffectChain()` returns the chain of
   `timeline.selectedTrackId`'s track (or `[]` when none selected).
5. **Unit tests** in `frontend/src/__tests__/stores/project.test.ts` are migrated to pass `trackId`
   and assert against the track's chain. New tests cover multi-track isolation at the store layer.

## Explicitly NOT in this change (deferred to later epics)
- DeviceChain / render-path / ABSwitch UI reads → **Epic 02**.
- Freeze call-site rewire → **Epic 03**.
- Backend IPC track_id threading → **Epic 04**.
- Persistence shape + **deletion of the global `effectChain` field** + fixtures + E2E → **Epic 05**.

The global `effectChain` field **remains present** after this epic (strangler-fig scaffold). It is
no longer written by the migrated actions, so DeviceChain (still reading it in Epic 1) will show a
stale/empty chain until Epic 02 — acceptable mid-PR since the branch is not merged until all epics land.

> ⚠️ **By-design intermediate breakage (CTO finding #2):** because App.tsx subscribes to the global
> `effectChain` (App.tsx:136) and feeds it to the single-clip `render_frame` path (:875), the running
> app's **preview is non-functional between Epic 1 and Epic 02**. This is expected, NOT a regression —
> do not panic-debug it. Full app integration is verified at PR-zero completion.

> ⚠️ **Two latent bugs are ARMED by this epic (data-integrity review — see Epic 1.5):** making
> `Track.effectChain` load-bearing exposes pre-existing gaps in `timeline.removeTrack` (no cross-store
> cleanup → orphaned operator/automation/midi/group refs) and `timeline.duplicateTrack` (clones chain
> with new effect ids but doesn't re-key automation paramPaths/mappings → silently-dead modulation).
> These are NOT Epic-1 regressions (revert disarms them), but they MUST be closed before per-track
> track-lifecycle UX ships. Tracked as **Epic 1.5 — track-lifecycle-integrity**, gated before Epic 02.

## Impact
- Affected specs: `effect-chain` (new capability spec, this change introduces it).
- Affected code: `stores/timeline.ts` (+1 action), `stores/project.ts` (action signatures + retarget),
  `__tests__/stores/project.test.ts` (signature migration).
- Risk: low. Additive at the store layer; covered by migrated + new unit tests. No backend, no IPC,
  no persistence touched. Revert = revert the commit.
