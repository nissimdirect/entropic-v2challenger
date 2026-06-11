# Creatrix Execution Plan — One-Shottable Work Packets

**Date:** 2026-06-11 · **Repo:** `~/Development/entropic-v2challenger` (origin/main @ `d821ae8`)
**Companion to:** `docs/roadmap/ROADMAP.md` (phases + ledger). This file turns phases into packets.

**Rule of expansion:** Phases 1–3 are fully specified below against origin/main as of 2026-06-11.
Phases 4–9 get stubs only — at each phase boundary the orchestrator **regenerates packets just-in-time
from live main** using the §1 contract + the cited plan doc, because file paths and line anchors rot.
Never execute a stub directly.

---

## 1. The Work Packet Contract

Every packet below has these fields. An executor (Sonnet-class agent) runs them top to bottom with
**zero improvisation**.

| Field | Meaning |
|---|---|
| **ID / branch / base** | Packet ID · branch to create · base ref (always `origin/main` unless stated) |
| **Depends-on** | Packets that must be MERGED first |
| **Goal** | One sentence |
| **Preconditions** | Exact grep/read commands run FIRST, each with expected output. **Any mismatch → STOP, report to orchestrator, do not improvise.** |
| **Scope** | Checklist of verified file paths the packet may touch |
| **DO-NOT-TOUCH** | Files/areas that must show zero diff |
| **Steps** | Implementation order |
| **Test plan** | Exact commands + new test files with the behavior keyword in the test title |
| **Acceptance gates** | CI green + specific assertions (+ perf gates where defined) |
| **Rollback** | Always: revert the PR. **No migrations, ever** (single-tester app, clean-break policy per PLAN.md v1.2) |
| **Evidence** | Commands + output pasted into the PR body |

**Standard test commands** (verified against repo + `.github/workflows/test.yml`, workflow
"Entropic v2 Tests", jobs `smoke` / `sidecar` / `electron-e2e` / `test-health-comment`):

```bash
# Backend full:   cd backend && python -m pytest -x -n auto --tb=short
# Backend smoke:  cd backend && python -m pytest tests/ -m smoke --tb=short -q
# Frontend unit:  cd frontend && npx --no vitest run        # MUST use --no (project-local vitest)
# E2E smoke:      cd frontend && npx playwright test tests/e2e/smoke.spec.ts
```
Backend markers (verified in `backend/pyproject.toml`): `perf`, `smoke`, `oracle`, `metal`.

**Orchestration rules:**
1. One packet = one agent = one worktree (`isolation: "worktree"`). Never two packets in one worktree.
2. Packet size target **≤ 4h**. Anything bigger gets decomposed before dispatch.
3. Parked q7 drafts (#117–#145) are **cherry-pick-only, NEVER raw-merge** — stale merge-base falsely
   reverts merged work (`feedback_cherry-pick-stale-scaffold-branches.md`).
4. **No parallel reimplementation** of existing components — evolve in place (PR #154 was closed as
   waste for violating this; `feedback_read-existing-component-before-parallel-build.md`).
5. Model routing: **Sonnet default**. Packets marked **RISK:HIGH** go to Opus/Fable and get a
   `/qa-redteam` pass before merge.
6. Merge order is the packet numbering unless a depends-on says otherwise.
7. **Single-flight on shared hotspots:** no two packets touching `frontend/src/renderer/styles/global.css`
   may be in flight simultaneously; same for `backend/src/zmq_server.py` dispatch — at most one in-flight,
   others queue.

---

## 2. Phase 1 — Drain the frontier (merge/verify packets)

These are verification packets, not build packets: rebase, test, verify the claimed behavior, merge.

### P1.1 — Merge the PR-B slice stack #157 → #158 → #160
- **Branch:** none (operates on existing PR branches) · **Depends-on:** —
- **Goal:** Land automation unification, B4-lite axis binding, and export-determinism in strict order.
- **Preconditions:**
  - `git grep -n "isTrigger" origin/main -- frontend/src/renderer/stores/automation.ts | head -3` → hits at ~:93/:116/:135 (i.e. #157 NOT yet merged). If zero hits → #157 already merged, skip to #158.
  - `gh pr view 157 158 160 --json state` → all `OPEN`.
- **Steps (per PR, in order 157, 158, 160):** rebase on current main → run frontend unit + backend smoke → verify the claimed behavior → merge (squash) → repeat for next.
  - **#157 claimed behavior:** `InterpolationMode = 'smooth'|'step'|'gate'|'oneShot'` replaces `isTrigger`/`triggerMode`; `addTriggerLane` removed; mode `'step'` holds left point. Verify: `git grep -c "isTrigger" frontend/src/` on the PR branch → 0 in prod code; grep `InterpolationMode` in `frontend/src/shared/types.ts` → present.
  - **#158 claimed behavior:** `AutomationLane.axisBinding?: LaneAxisBinding` + `setLaneAxisBinding` with Tier-1 validator (accepts only `broadcast` + domains `t|y|x`); reuses `frontend/src/shared/axis-binding.ts` (verified on main). Verify validator rejection test exists and passes. NOTE: this is schema spine only — the `domain='y'` render unlock is deferred to C2/C3 by design; do not flag its absence as a defect.
  - **#160 claimed behavior:** export uses real `projectStore.seed` instead of hardcoded `project_seed: 42`. Verify: grep `42` near `project_seed` in export path → gone; determinism test green.
- **DO-NOT-TOUCH:** anything outside each PR's own diff (rebase conflicts only).
- **Acceptance:** CI green on each merge; full frontend suite count ≥ pre-merge count (~1814+).
- **Evidence:** per-PR: rebase log, test summary lines, behavior-verification grep output.

### P1.2 — Merge #164 BPM persistence fix
- **Depends-on:** P1.1 (rebase target stability) · **Goal:** BPM survives save/reload.
- **Preconditions:**
  - `git grep -n "bpm" origin/main -- frontend/src/renderer/project-persistence.ts` → single hit `:135  bpm: 120,` (write-default, never hydrated — the bug). If more hits → already fixed, close packet.
- **Steps:** rebase #164, run `cd frontend && npx --no vitest run`, verify a test exists whose title contains "bpm" + "hydrat" or "round-trip" in `frontend/src/__tests__/stores/project-persistence.test.ts`, merge.
- **Acceptance:** save→load round-trip test proves non-default BPM (e.g. 93) restores.
- **Note for orchestrator:** MUST merge before P2.1 (BPM split builds on hydrated `bpm`).

### P1.3 — Merge #156 (B1 sampler persistence) then #167 (B2-lite performance track)
- **Depends-on:** P1.1 · **Goal:** Land sampler persistence, then the B2-lite track-bound model on top.
- **Preconditions:**
  - `git ls-tree --name-only origin/main frontend/src/renderer/stores/ | grep instruments` → `instruments.ts` exists.
  - `git grep -n "addTrack" origin/main -- frontend/src/renderer/stores/timeline.ts | head -2` → `:43` signature `type?: 'video' | 'text'` (#167 extends to `'performance'`; `Track.type` union at `frontend/src/shared/types.ts:59` already includes `"performance"`).
- **Steps:** merge #156 first (global-sampler persistence). Then rebase #167 on the result — **#167 changes `useInstrumentsStore` from one global instrument to `Record<trackId, SamplerInstrumentV1>`, a breaking change to #156's persistence shape** (G10). Resolve in #167, never by re-editing main. Verify #167 behaviors per `docs/roadmap/plans/entropic-B2-performance-track-sampler-2026-06-05.md` test plan: Cmd+Shift+T creates performance track; drag Sampler from instruments tab onto it; drop video sets `clipId`; two tracks own independent samplers; persistence round-trip.
- **DO-NOT-TOUCH:** `frontend/src/renderer/components/effects/EffectBrowser.tsx` beyond the drag-payload reuse #167 already contains.
- **Acceptance:** CI green; `buildSamplerLayer` multi-track test green (`frontend/src/__tests__/components/instruments/buildSamplerLayer.test.ts`).

### P1.4 — Merge #146 Grid Moire v2
- **Depends-on:** — (independent) · **Goal:** Fix black-render + two independent liquify meshes.
- **Ownership:** P1.4 is the SOLE owner of merging #146. `packets/effects-quality.md` PFX.2 is follow-ups only and hard-gates on this merge.
- **Preconditions:** `gh pr view 146 --json state` → OPEN.
- **Steps:** rebase, run backend full suite, verify the generator no longer renders black (claimed fix — confirm a regression test asserts non-zero frame variance for grid_moire), merge.
- **Acceptance:** CI green; oracle suite unaffected (`python -m pytest -m oracle` count unchanged).

### P1.5 — Disposition the 5 stale May PRs (#101, #103, #108, #109, #67)
- **Depends-on:** P1.1–P1.4 (rebase last) · **Goal:** Each stale PR is merged, updated, or closed-with-reason. No PR left in limbo.
- **Preconditions:** `gh pr view 101 103 108 109 67 --json state,mergeable` — record each.
- **Per-PR verdicts to verify:**
  - **#101** Escape-deselect in perform mode (F-0514-5) — real open bug; rebase + merge. Verify the R.4 integration test title names "Escape" + "perform".
  - **#103** zero-default hint badge (F-0516-7) — **check for reverted files first** (`git diff origin/main...pr-head --stat`; flag any file whose diff deletes post-May work) per ROADMAP G8.
  - **#108** ZMQ REQ-socket mutex — rebase; run `cd backend && python -m pytest tests/ -k zmq --tb=short` + the sidecar CI job.
  - **#109** timeline drag-reorder — rebase; conflicts likely with #167's track-type change; verify drag-end doesn't fire click-deselect (`feedback_drag-end-suppresses-click.md`).
  - **#67** docs — merge or fold into #168 and close.
- **Acceptance:** zero stale-May PRs open afterward; each close has a one-line reason comment.

### P1.6 — Hygiene: prune worktrees + verify cron
- **Depends-on:** P1.1–P1.5 merged (their worktrees become prunable) · **Goal:** Worktree count down from 58 to active-only.
- **Preconditions:** `git -C ~/Development/entropic-v2challenger worktree list | wc -l` → currently **58** (ROADMAP says "~19 prunable" — undercount; treat 58 as ground truth).
- **Steps:** for each worktree whose branch is merged or whose PR is closed: **run the Gate-19 6-check audit before removal** (git log --all on the path, stash list, reflog, fsck, sibling dirs) — never delete a worktree holding unmerged unique commits. `git worktree remove <path>` only after audit. Keep: main checkout, `entropic-v2-uat`, any worktree of a still-open PR, q7 draft worktrees (parked, not stale). Verify cron `b3c47f1c`: `crontab -l | grep b3c47f1c` → already returns 0 hits (verified 2026-06-11; record as confirmed-dead).
- **DO-NOT-TOUCH:** never `rm -rf`; only `git worktree remove` (refuses dirty trees by default).
- **Evidence:** before/after `git worktree list` output; per-removal audit one-liner.

---

## 3. Phase 2 — Finish PR-B (slices 3b / 3c / 3d)

Source: `docs/roadmap/plans/entropic-PR-B-plan-2026-06-05.md`. Hard constraints: NO migration code ·
NO feature flag · v3 clean break · validator at transaction commit · Composite terminal-only ·
audio tracks never get Composite.

### P2.1 — Slice 3b: BPM split (`bpm` vs `effectiveBpm`)
- **Branch:** `feat/prb-3b-bpm-split` · **Base:** origin/main · **Depends-on:** P1.1 (#157/#158), P1.2 (#164)
- **Goal:** Split persisted baseline `bpm` from derived per-frame `effectiveBpm`, add `projectParam` modulation sink + Mixer/BPM automation target.
- **Preconditions:**
  - `git grep -n "effectiveBpm" origin/main -- frontend/` → **zero hits** (not yet built). Hits → STOP.
  - `git grep -n "bpm: number" origin/main -- frontend/src/renderer/stores/project.ts` → `:43`; `setBpm` clamp `[1,300]` at ~:292–294.
  - `git ls-tree --name-only origin/main frontend/src/renderer/components/transport/` → contains ONLY `VolumeControl.tsx`, `Waveform.tsx`, `useWaveform.ts`. **There is no `TransportBar.tsx`** (PLAN.md §4 names one — known doc discrepancy). BPM UI lives in `frontend/src/renderer/components/timeline/Timeline.tsx` (props `bpm` / `onBpmChange`, ~:20–21) wired from `App.tsx` (`setBpm`).
  - `git ls-tree --name-only origin/main frontend/src/renderer/components/performance/ | grep apply` → `applyCCModulations.ts`, `applyPadModulations.ts` exist.
- **Scope:**
  - [ ] `frontend/src/renderer/stores/project.ts` — add `effectiveBpm` (derived, NEVER persisted)
  - [ ] `frontend/src/renderer/project-persistence.ts` — persist `bpm` only; assert `effectiveBpm` absent from saved JSON
  - [ ] `frontend/src/shared/types.ts` — `'projectParam'` sink on the modulation-target discriminant
  - [ ] `frontend/src/renderer/components/performance/applyCCModulations.ts` — factor: chain-targeted eval stays; new `applyProjectModulations.ts` (same dir) writes `effectiveBpm`
  - [ ] `frontend/src/renderer/components/timeline/Timeline.tsx` + `App.tsx` — BPM click-to-edit wiring
  - [ ] Automation picker — add "Mixer → BPM" target (picker lives in the automation components dir: `frontend/src/renderer/components/automation/`)
- **DO-NOT-TOUCH:** `backend/src/modulation/engine.py` (cycle detection is INJ-2-complete; BPM-via-LFO cycles already raise), `Track.opacity`/`blendMode` (that's 3c), `EffectBrowser.tsx`.
- **Steps:** types → store → factor modulation apply → UI → persistence → tests.
- **Test plan:** new `frontend/src/__tests__/stores/project-bpm-split.test.ts` — titles must include: "editing bpm shifts effectiveBpm baseline", "modulation writes only effectiveBpm", "save persists bpm only", "load hydrates bpm". Run `cd frontend && npx --no vitest run`.
- **Acceptance:** all 4 named tests green; full suite no regressions; engine reads `effectiveBpm` everywhere playback timing is computed (grep proof: no remaining playback-path reads of raw `bpm` except baseline UI).
- **Rollback:** revert PR. **Evidence:** vitest summary + the 4 test titles + grep output.

### P2.2 — Slice 3c: Composite-as-terminal-effect — **RISK:HIGH**
36-file / 108-hit data-model break (removes `Track.opacity`/`blendMode`). **Requires fresh session,
Opus/Fable executor, `/qa-redteam` gate before merge** (per PR-B plan). Decomposed into 3 sub-packets,
merged in order. v3 clean break: old `.glitch` files stop loading (Decision D1, user-accepted).
Ship the **9 existing blend modes** (Decision D4) — verified `BLEND_MODES` dict at
`backend/src/engine/compositor.py:69` has exactly 9 (`normal add multiply screen overlay difference
exclusion darken lighten`); the 36-mode list in PLAN.md is a later additive PR.

#### P2.2a — Schema + validator (frontend types/stores break)
- **Branch:** `feat/prb-3c-composite-schema` · **Depends-on:** P2.1
- **Preconditions:**
  - `git grep -n "opacity: number;" origin/main -- frontend/src/shared/types.ts` → `:64` (inside `Track`); `blendMode: BlendMode;` → `:65`. Absent → already broken out, STOP.
  - `git grep -n "CURRENT_VERSION" origin/main -- backend/src/project/schema.py` → `:9  CURRENT_VERSION = "2.0.0"`.
- **Scope:** `frontend/src/shared/types.ts` (remove `Track.opacity`/`blendMode`, add `CompositeEffect` with `params: {opacity, mode}`) · `frontend/src/renderer/stores/timeline.ts` (drop opacity/blendMode setters; terminal-only validator running at **transaction commit** via `useUndoStore.beginTransaction`, not per mutation; reject on audio tracks in BOTH `addEffect` and `reorderEffect`; reject inside DeviceGroup) · `backend/src/project/schema.py` (`CURRENT_VERSION = "3.0.0"`, reject v<3 with "v2 projects unsupported — start a new project") · regenerate `.glitch` test fixtures in v3 shape.
- **DO-NOT-TOUCH:** `backend/src/engine/compositor.py` render math, `zmq_server.py` (P2.2c), export (P2.3).
- **Tests:** new `frontend/src/__tests__/stores/composite-terminal-validator.test.ts` — titles: "rejects composite mid-chain", "rejects composite on audio track via addEffect", "rejects composite on audio track via reorderEffect", "rejects composite inside DeviceGroup", "allows intermediate states mid-transaction". Backend: v2-file rejection test in the project schema suite.
- **Acceptance:** validator tests green; v2 fixture cleanly rejected (no crash); full vitest green.

#### P2.2b — Store + components (UI reads chain terminal)
- **Branch:** `feat/prb-3c-composite-ui` · **Depends-on:** P2.2a
- **Preconditions:** `git ls-tree --name-only origin/main frontend/src/renderer/components/timeline/ | grep Track.tsx` → exists.
- **Scope:** `frontend/src/renderer/components/timeline/Track.tsx` (drop opacity slider + blend dropdown; read from chain terminal) · `frontend/src/renderer/components/timeline/TransformPanel.tsx` + any component reading `track.opacity`/`track.blendMode` (executor: `git grep -rn "\.opacity\b\|\.blendMode\b" frontend/src/renderer/components/` and sweep every hit) · drag-Composite-onto-track wrapped in one undo transaction.
- **Tests:** component test "composite drag undoes in one transaction"; sweep proof in PR body: zero remaining `track.opacity` / `track.blendMode` reads in prod code.
- **Acceptance:** vitest green; grep sweep output pasted.

#### P2.2c — Render + backend rewire
- **Branch:** `feat/prb-3c-composite-render` · **Depends-on:** P2.2b
- **Preconditions:**
  - `git grep -n "_handle_render_composite" origin/main -- backend/src/zmq_server.py` → `:707` (def) — INJ-3 caps (`MAX_COMPOSITE_LAYERS=50`, `backend/src/security.py:48`) + frame_index clamp already present; KEEP them.
  - `git grep -n "BLEND_MODES" origin/main -- backend/src/engine/compositor.py` → `:69`.
- **Scope:** `backend/src/effects/registry.py` (register `composite` effect, 9 modes) · `backend/src/engine/compositor.py` (read opacity/mode from chain terminal instead of `layer_info["opacity"]`/`["blend_mode"]` track fields) · `backend/src/engine/pipeline.py` (skip terminal Composite in main `apply_chain` — Decision D3: pipeline detects the special effect and feeds the layer list) · `backend/src/zmq_server.py` `_handle_render_composite` builds terminal composite · `frontend/src/renderer/App.tsx` render call sites.
- **Tests:** backend per-blend-mode hash-stability test (9 modes) in `backend/tests/` composite suite; INJ-3 edge cases stay green (0 layers, >50 layers rejected, negative frame_index clamped); render-graph cycle case (Composite-opacity ← operator ← track depending on that Composite) raises `ModulationCycleError` (`backend/src/modulation/engine.py:20`).
- **Acceptance:** `cd backend && python -m pytest -x -n auto --tb=short` green; E2E smoke green; `/qa-redteam` findings resolved before merge.
- **Rollback (all of P2.2):** revert the three PRs in reverse order; no data to migrate back.

### P2.3 — Slice 3d: Full export parity
- **Branch:** `feat/prb-3d-export-parity` · **Depends-on:** P2.2c
- **Goal:** Export runs operators + automation + sampler + multi-track through the modulation engine so export == preview (today export drops all three).
- **Preconditions:**
  - `git ls-tree --name-only origin/main backend/src/engine/ | grep export.py` → exists.
  - `git grep -n "def sample_lane" origin/main -- backend/src/modulation/lane_reader.py` → `:92`.
- **Scope:** `backend/src/engine/export.py` (snapshot at job start: deep-clone of project/timeline/effect/automation/operator state passed in the export job payload; run modulation per frame) · frontend export store/IPC payload (`frontend/src/renderer/stores/export.ts`) to send operators + automation + sampler layers · status string "Exporting from snapshot @ T=X".
- **DO-NOT-TOUCH:** preview render path (must remain the reference), determinism seed plumbing from #160.
- **Test plan:** time-aligned determinism: 90-frame project, 1Hz sine LFO on Composite opacity, export at 30fps AND 60fps → frame at t=1.5s hash-matches across rates (test title: "export time-aligned frames hash-match across frame rates"). Live-edit-during-export test: snapshot unaffected. E2E via Playwright `_electron` in `frontend/tests/e2e/`.
- **Acceptance:** export-vs-preview pixel parity on the modulated fixture; full backend + frontend suites green.

---

## 3.5 UX-audit packets (PUX) — land HERE, between Phase 2 and Phase 3

Source: `docs/roadmap/packets/ux-audit.md`. Sequencing: **PUX.1 → (PUX.2 ∥ PUX.3 ∥ PUX.4) → PUX.5 land here**,
so PR-A (Phase 3) builds on tokens + a11y primitives instead of retrofitting them. PUX.6 (live visual pass)
runs after PUX.1–5 merge and before P3.1 starts. Consequence: **P3.1's preconditions gain
`test -f frontend/src/renderer/styles/tokens.css || echo STOP`** (PUX.1 must have landed). The §1 rule-7
single-flight constraint applies: PUX packets touching `global.css` queue behind each other.

---

## 4. Phase 3 — PR-A decomposed (layout redesign, in place)

Source: `docs/roadmap/layout-session/PLAN.md` §3 (9–12h monolith) → 5 packets. Governing constraint:
**evolve `frontend/src/renderer/components/effects/EffectBrowser.tsx` IN PLACE** — PR #154 built a
parallel CreatrixShell/BrowserPanel and was closed as waste. Any packet that creates a parallel
browser/layout component is an automatic FAIL.

**Known doc discrepancies (verified 2026-06-11, executors must respect ground truth):**
- PLAN.md §3.8 references `useSelectionStore` — **does not exist on main**. Selection lives in
  `useTimelineStore` (`selectedTrackId`, `frontend/src/renderer/stores/timeline.ts:36`) and the
  effects store. P3.3 builds the selection abstraction or reads existing stores; precondition flags this.
- PLAN.md names `components/timeline/AutomationLane.tsx` — actual path is
  `frontend/src/renderer/components/automation/AutomationLane.tsx`.
- Flag naming: repo convention is kebab-case flags in `frontend/src/shared/feature-flags.ts`
  (localStorage `entropic-disable-*` / env `VITE_ENTROPIC_DISABLE_*`). `F_CREATRIX_LAYOUT` should be
  implemented inside this existing module, following its pattern — not a new flag system.

### P3.1 — Layout grid shell + 4 drag handles (behind `F_CREATRIX_LAYOUT`)
- **Branch:** `feat/pra-1-layout-shell` · **Depends-on:** Phase 2 complete (PR-B shape settled)
- **Goal:** CSS-grid app shell (transport / left-col / right-col / statusbar) with 4 persisted resize handles, flag-gated; old layout untouched when flag off.
- **Preconditions:**
  - `test -f frontend/src/renderer/styles/tokens.css || echo STOP` → tokens.css must exist (PUX.1 landed; see §3.5).
  - `git grep -n "F_CREATRIX_LAYOUT\|creatrix-layout" origin/main -- frontend/` → zero hits (not built).
  - `git ls-tree --name-only origin/main frontend/src/renderer/stores/ | grep layout` → `layout.ts` exists (extend it; do not create a second layout store).
  - Read `frontend/src/shared/feature-flags.ts` for the flag pattern.
- **Scope:** flag in `feature-flags.ts` · grid CSS per PLAN.md §3.2 (vars `--left-col-w: 260px` min 200/max 33vw · `--inspector-h: 150px` · `--preview-h: 38%` · `--device-chain-h: 180px`, persisted to localStorage via `stores/layout.ts`) · 4 fat-target handles (6px visible / 16px hit zone, PLAN §3.3) · pop-out preview collapse to 28px strip (PLAN §3.4).
- **DO-NOT-TOUCH:** `EffectBrowser.tsx` (P3.2), inspector content (P3.3), root `grid-template-rows` of the OLD layout (`feedback_test-layout-changes.md`).
- **Tests:** component tests: "resize handle persists width to localStorage", "16px hit zone receives pointer events", "flag off renders legacy layout". Run vitest + E2E smoke with flag on AND off.
- **Acceptance:** both flag states green in E2E smoke; localStorage round-trip proven.

### P3.2 — Browser 5-tab evolution of EffectBrowser.tsx (IN PLACE)
- **Branch:** `feat/pra-2-browser-tabs` · **Depends-on:** P3.1
- **Goal:** `EffectBrowser.tsx` grows tabs `[fx] [op] [composite] [tool] [instruments]` + global search, keeping the existing drag idiom.
- **Preconditions:**
  - `git grep -n "handleDragStart" origin/main -- frontend/src/renderer/components/effects/EffectBrowser.tsx` → `:159`; `EFFECT_DRAG_TYPE = 'application/x-entropic-effect-id'` at `:13`.
  - `git ls-tree --name-only origin/main frontend/src/renderer/stores/ | grep browser` → `browser.ts` exists (tab/search state goes here).
- **Scope:** `EffectBrowser.tsx` (tabs, search with X clear + Esc clears-and-blurs) · drag payload upgraded to `{kind, id}` JSON with session nonce + `kind` enum check + id namespace regex (PLAN §3.6, qa-redteam H1/H2) · tool tab with cursor-mode stack + statusbar chip (PLAN §3.7 `isTextInputActive` guard verbatim) · per-tab USER folder writing flat JSON to `~/.creatrix/presets/<tab>/<name>.json` — **no zip/bundle import; USER import rejects with toast** (hardening deferred, qa-redteam Real Tiger 1).
- **DO-NOT-TOUCH:** **no new sibling browser component** (cite PR #154 closure in PR body); `DeviceChain` drop-target contract (payload stays backward-readable for existing fx drags); instruments tab content beyond a stub list (P3.5 owns it).
- **Tests:** "drag payload rejected without session nonce", "tab switch filters categories", "Esc clears search and blurs", "bare-letter shortcut suppressed while input focused", "tool mode restored after modal close".
- **Acceptance:** vitest green; existing fx drag-to-chain E2E still green; diff shows EffectBrowser.tsx modified, zero new top-level browser components.

### P3.3 — Polymorphic inspector (8 states, info-only)
- **Branch:** `feat/pra-3-inspector` · **Depends-on:** P3.1
- **Goal:** Single inspector shell mounting per-state child (`key={selection.type}`), info-only, reading through typed selectors.
- **Preconditions:**
  - `git grep -rn "useSelectionStore" origin/main -- frontend/` → **zero hits — PLAN.md §3.8 is aspirational here.** Executor builds a selection selector over `useTimelineStore.selectedTrackId` (`stores/timeline.ts:36`) + effect/operator/marker selection state found by `git grep -n "selected" frontend/src/renderer/stores/*.ts`. If a selection store has appeared since, use it.
- **Scope:** new `frontend/src/renderer/selectors/trackStats.ts` (`getTrackStats(trackId)` reading per-track `effectChain` — per-track chains verified present: `Track.effectChain` at `types.ts:67`) · inspector shell + 8 state children per PLAN §3.12 (none/clip/multi/track/effect/operator/marker/tool) · `InspectorHoverHelp` mounted OUTSIDE the state subtree.
- **DO-NOT-TOUCH:** store shapes (inspector is read-only through selectors — that's the PR-B decoupling contract, PLAN §3.11); no actionable controls (info-only).
- **Tests:** unit per state (8 titles "inspector renders <state> info"); integration "hover slot survives selection change"; "selection change remounts body via key".
- **Acceptance:** 8-state tests green; selector contract test pins the `TrackStats` shape.

### P3.4 — Hover-help + hotkeys, with measurable perf gate
- **Branch:** `feat/pra-4-hover-hotkeys` · **Depends-on:** P3.3
- **Goal:** Delegated hover-help (WCAG 1.4.13) + Ableton-style tool hotkeys, with the <8ms perf gate enforced as a test BEFORE merge.
- **Preconditions:** P3.3 merged (`InspectorHoverHelp` exists); read PLAN §3.9–3.10 for timings (300ms settle, 200ms fade, 400ms sticky, Esc dismiss, focusin parity).
- **Scope:** `useHoverDelegation` hook — single `onMouseOver` at inspector root walking to `[data-help-id]`, zero per-target listeners · collapsible slot persisted as `creatrix.inspector.hoverHelpCollapsed` · hotkey table from PLAN §3.7 (12 shortcuts, conflict-checked) wired through the existing shortcut layer (`frontend/src/__tests__/utils/shortcuts.test.ts` shows the pattern).
- **PERF GATE (merge-blocking, mechanized):** new `frontend/src/__tests__/components/hover-delegation-perf.test.ts` titled "hover delegation stays under 8ms per event at 200 targets": render 200 `[data-help-id]` nodes, dispatch 60 synthetic mouseover events, assert mean handler time < 8ms (use `performance.now()` around the delegated handler; CI variance margin: fail only if mean ≥ 8ms across 3 runs). Result documented in PR body per PLAN §3.1.
- **DO-NOT-TOUCH:** native Electron menus (hover-help only on DOM menus); `dangerouslySetInnerHTML` anywhere (help body is plaintext — qa-redteam M5).
- **Acceptance:** perf test green in CI; WCAG behaviors each have a named test (Esc dismiss, sticky hover-into-tooltip, focus parity).

### P3.5 — INJ-4: Sampler browser entry + Demos Drawer + first-launch onboarding
- **Branch:** `feat/pra-5-instruments-demos` · **Depends-on:** P3.2 (tabs exist), P1.3 (#167 sampler flow merged)
- **Goal:** Real draggable "Sampler" entry in the instruments tab (INJ-4) + Demos Drawer playing the rendered trilogy + first-launch onboarding pointing at it.
- **Preconditions:**
  - `ls ~/.entropic/demos/` → `audio-lfo-stripes.mp4  painted-blur.mp4  y-is-time.mp4` (verified present 2026-06-11). Missing → STOP; demos must be re-rendered (`backend/scripts/demo_trilogy/` exists on main), do not stub with placeholders.
  - `git grep -n "RACKS" origin/main -- frontend/src/renderer/components/instruments/InstrumentsPanel.tsx` → expected present after #167 (B2-lite ships the RACKS list); if absent, #167 unmerged → STOP.
  - Note: runtime demo dir is `~/.entropic/demos/` on disk today, but `ENTROPIC_DIR` const in `frontend/src/main/diagnostics-handlers.ts:12` already points to `~/.creatrix` — executor must resolve the demos path from ONE constant, not hardcode both.
- **Scope:** instruments tab entry: Sampler draggable/double-clickable, disabled-with-tooltip when no base clip on timeline (INJ-4 spec: entry only — B1/B2 logic already merged, do NOT reimplement) · Demos Drawer component listing the 3 MP4s with inline playback · first-launch onboarding flag (localStorage) opening the drawer once · spec: `~/.claude/plans/entropic-spec-4-demo-trilogy.md`.
- **DO-NOT-TOUCH:** `buildSamplerLayer.ts`, `SamplerDevice.tsx`, instruments store internals (consume #167's API only).
- **Tests:** "sampler entry disabled with tooltip when timeline empty", "drag payload kind=instruments id=sampler", "demos drawer lists three demo videos", "onboarding opens drawer on first launch only".
- **Acceptance:** vitest green; manual/CU smoke of the drag flow; flag-off state unaffected.

---

## 5. Phase 4–9 + parallel track — packet stubs (JIT expansion)

> At each phase boundary, the orchestrator regenerates packets from **live main** using the §1
> contract + the cited plan doc. Stubs are pointers, not instructions.

| Stub | One line | Detail plan | Expansion notes |
|---|---|---|---|
| P4.x PR-C operators + Kentaro | Surface ops in browser; `kentaroCluster\|sidechain\|gate\|midiEnvStutter`; react-xyflow topology w/ 60fps@32-paths gate + bare-SVG fallback | `layout-session/PLAN.md` §5 | **Path discrepancy:** PLAN cites `backend/src/pipeline/operators/*.py` — no `backend/src/pipeline/` exists; operators live in `backend/src/modulation/` (verified). Re-anchor at expansion. Prototype gate §5.1 runs first. |
| P5.x Instrument ladder B2→B10 | Voice spine, full sampler, rack, grouping, Frame-Bank, RIFE morph, Granulator, tensor routing, live affordances | `~/Development/entropic-layout-mockup/INSTRUMENTS-BUILD-PLAN.md` | B8 needs SG-3 cherry-pick (#133, +12–18h real work), B9 needs PR-C + SG-5 (#144). Cherry-pick rule §1.3 applies. |
| P6.x Field params + routing surfaces | C2 frame-as-lane, C3 per-pixel fields (the deferred `domain='y'` render unlock), I1/I2 from drafts #140/#142 | ROADMAP Phase 6; `entropic-spec-2-b4lite-schema.md` | `sample_lane` (`backend/src/modulation/lane_reader.py:92`) is merged but wired nowhere live — C2/C3 wire it. |
| P7.x Tier 5 latent | **HARD-GATED on Q7 REAL verdict (user runs benchmark)** | `entropic-spec-5-l-backbone.md` §9 | **Discrepancy:** ROADMAP cites `backend/scripts/q7_benchmark/` — NOT on origin/main; the machinery lives only in parked drafts #117–#145 (22 drafts verified open, gh 2026-06-11). The runnable 3-head harness is at `~/Development/entropic-q7-clap` (PR #132); user runs it FIRST, harness extraction follows GO. |
| P8.x `.dna` + Genoscope | E2 format + CI lints (draft #139), SG-6, A2/E8 | `entropic-spec-6-dna-format.md` | Research-class; re-spec at boundary. |
| P9.x Ecosystem | SG-9 quotas + Ed25519 signing, E7 plugin SDK | ROADMAP Phase 9 | Farthest out. |
| PT.1 Audio tracks un-flag | 1-week user bake → PR-4 removes `EXPERIMENTAL_AUDIO_TRACKS` (`backend/src/zmq_server.py:52`, verified) + auto-extract (task #46) | `memory/entropic-audio-tracks.md` | Bake is a USER action; packet only after bake. |
| PT.2 Feature tasks #45/#35 | Region-select preview; per-track metering + dB readout (task #35; #47 closed as spec task) | `memory/entropic-uat-may14.md` | Independent, schedulable anytime. |
| PT.3 Hotkey epic | 6 unchecked surfaces | issue #65; `docs/plans/2026-05-14-upcoming-ux-items.md` | Pairs naturally with P3.4. |
| PT.4 Rename residue | `gh repo rename`, dir rename, `ENTROPIC_DIR` const name (already points to `~/.creatrix` — name-only residue), memory slugs | ROADMAP §3 parallel-track 5 | Low risk; do after PR-A settles. |
| PT.5 Cross-modal v1.1 decision | F1–F4 fold-in vs supersede (Gap G6) | `docs/plans/2026-05-04-cross-modal-features-plan.md` | Decision packet, not build packet. |

---

## 6. Verification protocol for the orchestrator

Per-packet, **never batch** — batch-then-verify produced the 170-finding audit
(`memory/feedback_per-task-verification.md`; per-task verification is the corrective).

After an agent returns a packet:

1. **Run the packet's test commands yourself** in the agent's worktree — do not trust the agent's
   pasted output. Frontend: `npx --no vitest run`. Backend: `python -m pytest -x -n auto --tb=short`.
2. **Adversarially review the diff**: correctness first, then reuse/simplification — did the agent
   reinvent something that exists (`git grep` the new function names against main)? Is every new file
   justified? (Gate: rule §1.4, the #154 lesson.)
3. **Check DO-NOT-TOUCH**: `git diff origin/main...HEAD --stat` must show zero hits in the packet's
   forbidden paths. Any hit → bounce the packet back, do not hand-fix.
4. **Check the named behavior tests exist**: grep the new test files for the literal behavior keywords
   the packet specified (`feedback_grep-the-test-file-before-claiming-coverage.md`).
5. **Check preconditions were actually run**: the PR body must contain the precondition command
   outputs. Missing → bounce.
6. **THEN merge** (squash), wait for CI (`smoke` + `sidecar` + `electron-e2e`), and only then
   dispatch the next dependent packet.
7. On any precondition-mismatch STOP report: re-verify ground truth yourself, amend this file, and
   re-issue the packet — never let the executor improvise around a stale anchor.
