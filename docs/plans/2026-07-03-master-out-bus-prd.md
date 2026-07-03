---
title: Master-Out Bus — effects + automation on the final summed video
status: ready-to-packetize
created: 2026-07-03
source: user feature request 2026-07-03 + in-repo verification (pipeline.py, types.ts Track)
decision-owner: nissimdirect (design locked below)
---

# Master-Out Bus PRD

**User intent (verbatim):** "we should have a 'master' out where we can put effects (not instruments)
on the master summed video" + "a default track that every open session ships with at empty state and
no clips can exist on it just automation and effects not instruments either."

**One line:** a permanent Master track — the DAW master bus for video — whose effect chain runs on the
FINAL COMPOSITED frame (all tracks summed), carrying effects + automation but never clips or instruments.

## Neglect test (why build it)
Today every effect is per-track or per-clip. There is NO way to treat the whole composited output as one
signal — no final color-grade, no output-wide glitch/vignette/LUT, no master limiter-equivalent. Every
comp tool and DAW has this; without it, "grade the final look" means duplicating an effect onto every
track (wrong, and impossible for cross-track looks). The window is now — it's foundational and everything
downstream (output automation, export looks) sits on it.

## Verified ground truth (not assumed)
- **Render seam — `backend/src/engine/pipeline.py`:** `render_composite` blends all tracks into the final
  frame; `apply_chain` runs an effect list; the terminal `composite` effect is compositing plumbing that
  apply_chain detects+skips (Decision D3). **Insertion point: after the tracks are composited into the
  summed frame, before encode, run `apply_chain(masterTrack.effectChain)` on that frame.** One point,
  shared by preview and export → parity is structural, not bolted on.
- **Schema — `frontend/src/shared/types.ts:90` `Track`:** `type` union is
  `"video"|"performance"|"text"|"audio"|"inspector"`. `"inspector"` is the PRECEDENT — a first-class
  **no-clips** track type; the persistence validator accepts it and is FORWARD-TOLERANT (unknown future
  types are dropped, not rejected). `Track` already has `effectChain: EffectInstance[]` and
  `automationLanes: AutomationLane[]`. So Master reuses existing fields; only a new `type: "master"` +
  guards are new.
- **No video master bus exists today** (only an audio `master.volume` mixer path — unrelated).

## Locked design (user-decided)
1. **One permanent Master track**, `type: "master"`, auto-created at empty state in EVERY project (new +
   migrated). Not deletable, not duplicable. Exactly one per project.
2. **No clips, ever.** `clips` stays `[]`; the timeline rejects clip drops/creation onto it (like a locked
   track, but structural). No clip lane rendered.
3. **Effects: yes. Instruments: no.** The effects browser's **instruments** tab (and any generator/
   instrument category) is rejected on the master with a guard toast ("Instruments can't go on the Master
   — it processes the summed output"). fx / op / composite / tool are allowed. (Terminal `composite` is
   also meaningless on master — reject it too; master output is already the composited frame.)
4. **Automation: yes.** Master effect params automate exactly like any track (reuses AutomationLane +
   everything in the automation suite; a master EQ sweep is just automation on a master-chain param).
5. **Position:** pinned at the BOTTOM of the timeline, always visible, visually distinct (Ableton master
   styling). Select it → its device chain shows in the same panel as any track's.

## Render contract (the hard part — parity + no-op safety)
- **Preview + export both:** composite all tracks → `apply_chain(master.effectChain, summed_frame)` →
  encode. Must be the SAME call site so preview==export holds (the P1-B / A2b class — a parity test is
  mandatory).
- **Empty master chain = TRUE no-op:** a project with an empty master track must render BYTE-IDENTICAL to
  today. This is the #1 regression guard (a golden-frame test: same project, master-empty, pre/post = 0 diff).
- **Numeric trust boundary:** finite-guard the master-processed frame (SG-class); a master effect that
  divides/blows up must not emit NaN/Inf into the encoder.
- **Master effects see only the composited RGBA frame** — no per-track state, no per-clip context (there
  is none post-composite). Redteam: confirm no master effect assumes track/clip state exists.

## Migration
- New project: bootstrap creates the Master track (empty chain).
- Load old project (no master track): the hydrate step INJECTS a default empty Master track (absent →
  create). Never rejects. Save always writes it back.
- Guard: if a loaded project somehow has 2+ master tracks (corruption), keep the first, drop the rest.

## Packets (build order)
- **M.1 — schema + render (foundation):** add `"master"` to Track.type; bootstrap + migration inject one
  empty Master; pipeline.py post-composite `apply_chain`; the no-op golden-frame parity test + finite guard.
  Backend + stores + types. **Opus-redteam (render/parity seam).** No UI yet — headless-provable.
- **M.2 — UI:** Master track row pinned at timeline bottom (no clip lane), selectable → device chain panel;
  effect drop wiring; the instruments/composite REJECT guard + toast; not-deletable/not-duplicable guards.
- **M.3 — automation on master (verify):** confirm master-chain params expose automation lanes and
  automate in preview+export (likely free once M.1+M.2 land; add a test).

## Test plan
- **No-op parity (M.1, blocking):** project with empty master → exported frames byte-identical to the same
  project pre-feature. `pytest backend/tests` golden-frame.
- **Master effect applies to the SUM (M.1):** two tracks + a master invert → assert the inverted result is
  of the *composited* frame, not per-track.
- **Guards (M.2):** dropping an instrument on master → rejected + toast; dropping a clip on master →
  rejected; master track has no delete/duplicate affordance.
- **Migration (M.1):** load a pre-feature project fixture → a master track appears, empty, render unchanged.
- **Automation (M.3):** automate a master effect param → preview==export.
- **Redteam (Opus):** non-finite master output; a master effect that reads absent per-track state; 2+ master
  tracks on load; instruments sneaking in via preset/paste rather than the browser.

## Out of scope (v1)
Multiple master/sub-buses, master sends/returns, per-track routing to alternate buses. One master, all
tracks → it. (Revisit buses later if needed.)
