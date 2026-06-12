---
title: PR-B — Composite-as-effect + Automation Unification (Creatrix data-model break)
created: 2026-06-05
status: plan — awaiting user decisions before BUILD (Phase 3)
ground_truth: mapped 2026-06-05 by 4 parallel Explore agents against origin/main + locked decision docs (PLAN.md, PR-INJECTIONS.md, INSTRUMENTS.md §10, SPEC-2, SPEC-3). Supersedes any earlier PR-B claims.
estimate: 12-18h across 3 commits
hard_constraints: NO migration code · NO feature flag (revert PR if broken) · v3 clean break (old .glitch won't load) · validator at transaction commit · Composite terminal-only · audio-tracks never get Composite · B4-lite validator REJECTS non-broadcast on save
---

# PR-B Implementation Plan

> **Why this exists.** Everything user-facing past B1 (B2 voice spine, B9 tensor routing, demo trilogy, I2/I3 routing canvas) is bottlenecked on PR-B. The locked §9 sequence put SG-1/Tier-2 next, but that's GPU-greenfield (zero Metal code) — invalid. PR-B is the real unblocker. User selected it 2026-06-05.

## Already merged — DO NOT REDO
- **INJ-1 (#152)** `Pad.mappings → Pad.modRoutes` — single location; do NOT re-rename, do NOT touch `Operator.mappings`.
- **INJ-2 (#150)** `_topological_sort` raises `ModulationCycleError`, walks all operator edges.
- **INJ-3 (#151)** `MAX_COMPOSITE_LAYERS=50` (security.py:48) + composite `frame_index` clamp.
- **#148** `frontend/src/shared/axis-binding.ts` (Axis canon `t|y|x|c|f|l`, 8-member BindingRule union, validators) + backend `modulation/schema.py` (Lane/ModEdge) + `lane_reader.py` `sample_lane()`. **Schema exists; runtime wiring does not.**

## The 7 work items (grouped into 3 commits)

### Commit 1 — Automation unification ✅ SHIPPED (PR #157, 2026-06-05)
- [x] Drop `AutomationLane.isTrigger`/`triggerMode` → single `InterpolationMode = 'smooth' | 'step' | 'gate' | 'oneShot'`.
- [x] Exclusivity via `isTriggerLane()` helper (`mode==='gate'||'oneShot'`); swept 6 prod + 12 test files.
- [x] Evaluator: `'step'` holds left point. `loadAutomation` defaults absent/invalid mode → 'smooth' (clean break).
- [~] Per-mode timeline viz: gate/auto badge distinction retained; richer per-mode glyphs (bezier/jump/bars/triangles) deferred to a polish pass (not blocking).
- [x] +4 new tests; full suite 1985 pass / 0 fail; typecheck below baseline.

### Commit 2 — B4-lite axis wiring ✅ SHIPPED (PR #158, 2026-06-05) — schema spine, NOT the render unlock
> **Honest finding:** `sample_lane` is wired nowhere live; the demo proves scanline-as-time with bespoke per-row numpy. Per-param per-scanline render = **C2/C3 tier**, not Commit-2. Shipped the wire-format + selector; y/x persist+validate but render later.
- [x] `AutomationLane.axisBinding?: LaneAxisBinding`; `setLaneAxisBinding` action w/ Tier-1 validator (rejects non-broadcast + c/f/l domains).
- [x] Persistence preserves valid / drops invalid axisBinding. Domain `<select>` (Time/Y/X) in the param picker.
- [x] +6 tests; suite 1991 pass. Backend "mirror validator" = N/A (backend doesn't validate lanes).
- [ ] **Deferred to C2/C3:** the actual `domain='y'` per-scanline RENDER unlock (per-pixel parameter fields).

### Commit 2 (original framing) — B4-lite axis wiring (INJ-5)
- [ ] Add optional `domain?: Axis` / `direction?: number` / `bindingRule?: BindingRule` to `AutomationLane` (default `t`/`1`/`broadcast`). Mirror on `OperatorMapping` (`src_axis`/`dst_axis`/`binding_rule`).
- [ ] **Tier-1 writer validator** (the critical CTO gate): accept only `bindingRule='broadcast'` + `domain ∈ {t,y,x}` on `addLane`/`updateLane`/`addOperatorMapping`/`updateOperatorMapping` + save/load. Reject the other 5 rules + c/f/l domains with a clear error. Reuse `axis-binding.ts` validators.
- [ ] **Renderer domain-eval unlock (P1-D):** in the lane-evaluation site, when `domain='y'` sample the curve at `current_y/frame_height` (and `x` at `current_x/frame_width`) instead of `t/duration`. Default `t` = today's behavior. (Frontend `evaluateAutomationOverrides` is time-only and pre-evaluates at playhead → axis lanes must instead pass lane metadata to the backend and be evaluated via `lane_reader.sample_lane()` per-coordinate — see Decision D2.)
- [ ] Backend mirror validator in `backend/src/project/schema.py` on file load.
- [ ] Persist + round-trip the new fields (extend the #156 persistence pattern).

### Commit 3 — SPLIT into slices (sized 2026-06-05; Composite = 36-file data-model break)
> **Sizing finding:** Composite-as-effect touches **36 files / 108 hits** (removes `Track.opacity`/`blendMode`; old `.glitch` stops loading per D1). Too big + too breaking for a marathon tail → its own focused session + `/qa-redteam` gate + user's conscious trigger. Sliced:
- [x] **3a — export determinism** (PR #160): `project_seed` 42→real. Export matches preview for seeded effects.
- [ ] **3b — BPM split**: `bpm` (persisted) vs `effectiveBpm` (derived/modulated); `projectParam` sink; `applyProjectModulations`; transport UI; **Mixer/BPM automation target in the picker** (the user-flagged feature). Medium, self-contained. NEXT.
- [ ] **3c — Composite-as-effect**: the 36-file data-model break. Register `composite` effect (9 blend modes); remove `Track.opacity`/`blendMode`; terminal-only + audio-guard validator; rewire compositor/zmq/App render. **Fresh session + /qa-redteam + breaks old projects.**
- [ ] **3d — full export parity**: operators/automation/sampler/multi-track in export (export path must run the modulation engine — bigger than 3a).
- [ ] Cycle-detection render-graph case (INJ-2 confirm).

### Commit 3 (original framing) — Composite-as-effect + BPM split + export snapshot + cycle confirm
- [ ] **Composite-as-effect (the hard part):** new registered `composite` effect; refactor `compositor.py` blend logic into it; teach `pipeline.py`/`apply_chain` to handle the multi-frame composite input (breaks the single-frame assumption — see Decision D3); `zmq_server._handle_render_composite` builds a terminal composite instead of calling `render_composite()` directly. Keep INJ-3 caps + frame clamp.
- [ ] **Track schema clean break:** remove `Track.opacity` + `Track.blendMode`; Composite (opacity+blend) reads from the chain terminal. Validator: ≤1 Composite per chain, must be last; reject on audio tracks (both `addEffect` + `reorderEffect`); reject inside DeviceGroup. Runs at **transaction commit**, not per mutation.
- [ ] **Blend modes:** scope decision D4 (current compositor has 9; docs spec 36).
- [ ] **BPM split:** `project.bpm` (user-writable, persisted) vs `project.effectiveBpm` (derived per-frame from bpm+modulation, NEVER persisted). New `'projectParam'` modulation sink; `applyProjectModulations()` per frame. Transport click-to-edit. **Also fix the pre-existing bug: BPM is saved but never hydrated** (`project-persistence.ts`).
- [ ] **Export snapshot:** deep-clone {project,timeline,effect,automation,operator} stores at job start; fix hardcoded `project_seed:42`→`projectStore.seed`; pass operators + automation_overrides + sampler layer into export so **export matches preview** (today export drops all three — `export.py` divergence). Time-aligned determinism test (30fps vs 60fps frame at t=1.5s hash-match).
- [ ] **Cycle detection confirm:** verify INJ-2 signature vs real `list[dict]`/`parameters.sources`; add render-graph cycle case (Composite-opacity ← operator ← track depending on Composite). Runtime/axis cycles defer to SG-5 (post-PR-B).

## Test Plan
### What to test
- [ ] Automation: `InterpolationMode` 4 modes evaluate + render; 84 fixtures converted & green.
- [ ] B4-lite: validator rejects 4 non-broadcast rules + c/f/l domains; accepts broadcast+t/y/x; `domain='y'` evaluates per-row over a 100-row frame (Y-is-Time); round-trip preserves fields.
- [ ] Composite: each blend mode hash-stable; terminal-only validator (mid-chain rejected, audio-track rejected, DeviceGroup rejected); multi-step undo of a Composite drag = one transaction.
- [ ] BPM: edit `bpm` → `effectiveBpm` shifts; modulation writes only `effectiveBpm`; save persists only `bpm`; load hydrates `bpm`.
- [ ] Export: 1Hz sine LFO on opacity, 30fps vs 60fps, time-aligned frames hash-match; live edit during export doesn't touch the snapshot; export output == preview for operators+automation+sampler.
- [ ] Cycle: direct / 2-hop / 3-hop / BPM-via-LFO / render-graph all raise `ModulationCycleError`.
### Edge cases
- [ ] v2 `.glitch` load → clean rejection with clear error (no crash). **(See Decision D1 — this loses the user's existing projects.)**
- [ ] Lane without new fields → loads with defaults (backward-compat within v3).
- [ ] Composite with 0 layers; >50 layers (INJ-3 cap); negative frame_index (INJ-3 clamp).
### How to verify
- Frontend: `cd frontend && npx --no vitest run`  ·  Backend: `cd backend && python -m pytest -x -n auto --tb=short`  ·  E2E export determinism: Playwright `_electron`.
- Pattern files: `__tests__/stores/project-persistence.test.ts`, `backend/tests/` composite + modulation suites.

## DECISIONS — RESOLVED 2026-06-05
- **D1 → CLEAN BREAK, no migration.** v3 only; old `.glitch` won't load; regenerate fixtures. (User accepts losing saved projects.)
- **D2 → recommended:** axis lanes (y/x) evaluate backend per-coordinate via `lane_reader.sample_lane()`; time lanes stay frontend-evaluated. (User did not object.)
- **D3 → recommended:** Composite = special effect the pipeline detects + feeds the layer list (least disruption). (User did not object.)
- **D4 → SHIP THE 9 blend modes now**; widen to 36 in a later additive PR.
- **D5 → 3 SEQUENTIAL PRs** (Commit-1 → Commit-2 → Commit-3), CI + verify per step.

## BUILD recon (PR-1, 2026-06-05)
- Surface = 90 hits / 15 files (6 prod: `types.ts`, `stores/automation.ts`, `stores/crossStoreCleanup.ts`, `components/automation/AutomationLane.tsx`, `components/automation/AutomationToolbar.tsx`, `components/timeline/Track.tsx`; 9 test files).
- **`evaluateAutomation` (utils/automation-evaluate.ts) does NOT branch on isTrigger/triggerMode** — pure point-interp w/ per-point `curve`. So Commit-1 is mostly schema + store + UI/viz rename; the only new behavior is `mode='step'` (hold value, no interp).
- Mapping: `isTrigger:false`→`'smooth'`; `triggerMode:'gate'`→`'gate'`; `'one-shot'`→`'oneShot'`; `'toggle'`→`'gate'`. New `'step'`. Keep `triggerADSR` (envelope still used by gate/oneShot). `TriggerMode` type stays (Pad still conceptually separate via `PadMode`).
- Worktree: `~/Development/entropic-prb-wt` @ branch `feat/prb-1-automation-unify` off origin/main (228fe89).

## Propagation / wiring (P96)
After landing: update master-sequence §3 Tier-1 (1.12 reconcile resolved) + Tier-4 (B2 unblocked), retire stale "B2 gated on PR-B" notes, update memory `entropic-synth-paradigm.md`.
