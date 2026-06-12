---
title: Phase 4 work packets — PR-C (operators + Kentaro Cluster)
source_spec: docs/roadmap/layout-session/PLAN.md §5 (v1.2)
target_repo: ~/Development/entropic-v2challenger
base: origin/main (verified at d821ae8, 2026-06-11)
authored: 2026-06-11
thickness_pass: 2026-06-11 (rubric 1-7; anchors re-verified against origin/main d821ae8 — scorecard at end of file)
status: ready-to-execute (P4.6 BLOCKED on GATE:PR-A)
---

# Phase 4 — PR-C: Operators surfaced + Kentaro Cluster

Seven one-shottable packets. Execute in dependency order. Every packet branches
from `origin/main` and merges independently (PR-C is delivered as a stack of
small PRs, not one 14-18h monolith).

**Command conventions (apply to every packet — repo CLAUDE.md is binding):**

- Frontend unit tests: `cd frontend && npx --no vitest run <path>` — the `--no`
  flag is MANDATORY (global `npx vitest` picks up E2E specs and fails).
- Backend tests: `cd backend && python -m pytest <path> -x --tb=short`
  (pyproject addopts already inject `-m 'not perf' -n auto`; perf-marked tests
  run explicitly via `python -m pytest -m perf <path>`).
- E2E: `cd frontend && npx playwright test tests/e2e/<dir>/<spec>` (testDir is
  `frontend/tests/e2e/`, verified in `playwright.config.ts:4`).
- Live-runtime checks (Gate 18): the app runs from
  `~/Development/entropic-v2challenger/frontend` via `npm start`. If a
  `entropic-v2-uat` worktree is in play, sync edits there too and name whichever
  path the running Electron process actually loads (`ps aux | grep -i electron`).

## Ground-truth corrections to PLAN.md §5 (verified against origin/main d821ae8)

The spec's file inventory (§5.7) is WRONG about backend paths. Verified reality:

| PLAN.md §5.7 says | origin/main reality |
|---|---|
| `backend/src/pipeline/operators/*.py` | **No `backend/src/pipeline/` exists.** Operator evaluators live in `backend/src/modulation/` (`lfo.py`, `envelope.py`, `step_sequencer.py`, `audio_follower.py`, `video_analyzer.py`, `fusion.py`) |
| `backend/src/pipeline/apply_modulations.py` | Dispatch + routing live in `backend/src/modulation/engine.py` (`SignalEngine.evaluate_all`, `apply_modulation`) and `backend/src/modulation/routing.py` (`resolve_routings`) |
| "render-budget guard at `engine.py`" | `backend/src/modulation/engine.py` (no top-level engine.py) |
| `types.ts:386-428` Operator types | Verified: `OperatorType` union at `frontend/src/shared/types.ts:388`, `OperatorMapping` at ~401, `Operator` at ~419 |
| (not mentioned) | **`MAX_OPERATORS = 16` already exists** in `backend/src/modulation/engine.py` and silently truncates `operators[:MAX_OPERATORS]`. Must be reconciled with the new `MAX_OPERATORS_PER_PROJECT = 64` or operators 17-64 are silently dropped |
| §5.6 browser folders list S&H, Random, Add, Multiply, Clamp, Curve, Audio Amplitude, MIDI CC, Playhead Time as ops | **None of these operator types exist.** Only `lfo, envelope, video_analyzer, audio_follower, step_sequencer, fusion` exist + the 4 new ones from this PR. P4.6 scopes the `op` tab to implemented types only |
| Behind `F_CREATRIX_LAYOUT` (PR-A flag) | **`F_CREATRIX_LAYOUT` does not exist on origin/main.** PR-A (5-tab browser + layout shell) has NOT merged. Only P4.6 truly needs it; P4.0–P4.5 are structured to not require PR-A |

Other verified facts executors rely on (all re-verified against d821ae8 on 2026-06-11):

- Frontend operator store: `frontend/src/renderer/stores/operators.ts` (Zustand, `useOperatorStore`); verified line anchors: `createDefaultOperator` line 14, `addOperator` impl line 65 (id format `` `op-${Date.now()}-${nextOpId++}` `` at line 66), `addMapping` impl line 162, `loadOperators` line 271, `getSerializedOperators` line 285. **Neither `addOperator` nor `addMapping` enforces any cap today** (read both bodies — no length check).
- **`frontend/src/shared/limits.ts` ALREADY EXISTS** with `LIMITS.MAX_OPERATORS: 16` at line 8 — and it is a **dead constant**: `git grep -rn "MAX_OPERATORS" origin/main -- frontend/src` returns ONLY the definition, zero readers. P4.1 must update + wire `limits.ts` (16 → 64, add `MAX_MAPPINGS_PER_OPERATOR: 32`), NOT create a new `operatorLimits.ts` / touch `constants.ts` (which holds CATEGORY/SHM/WATCHDOG groups, no caps).
- Operator UI dir (plural, exists): `frontend/src/renderer/components/operators/` containing exactly: `AudioFollowerEditor.tsx`, `EnvelopeEditor.tsx`, `FusionEditor.tsx`, `LFOEditor.tsx`, `ModulationMatrix.tsx`, `OperatorRack.tsx`, `RoutingLines.tsx`, `StepSequencerEditor.tsx`, `VideoAnalyzerEditor.tsx`. `OperatorRack.tsx` has `TYPE_OPTIONS` (with `available` flag) at line 18 and the per-type editor branch pattern (`op.type === 'fusion'`) at line 157.
- Backend entry: `backend/src/zmq_server.py` — `operators = message.get("operators")` at line 536, `engine.evaluate_all(...)` call at line 547, then `engine.apply_modulation(...)`.
- `backend/src/modulation/engine.py`: `MAX_OPERATORS = 16` at line 17, used at lines 138/145 (`operators[:MAX_OPERATORS]` silent truncation). `_topological_sort` at line 37. Dispatch tail `else: value = 0.0` handles unknown types (verified — unknown types degrade to 0.0, no crash).
- `backend/src/modulation/routing.py`: the single signal read site is `signal = operator_values.get(op_id, 0.0)` at line 50.
- Evaluator entry points (signatures start at): `lfo.py:7 def evaluate_lfo(`, `envelope.py:6 def evaluate_envelope(`, `audio_follower.py:8 def evaluate_audio(`, `fusion.py:11 def evaluate_fusion(sources: list[dict], operator_values: dict[str, float], blend_mode: str)`. Fusion's `sources` element shape is `{operator_id: str, weight: float}` with NaN/Inf guards — the pattern gate/sidechain copy.
- `backend/src/security.py` holds caps as module constants (`MAX_UPLOAD_SIZE` line 9, `MAX_FRAME_COUNT` line 39, `MAX_CHAIN_DEPTH` line 42, `MAX_COMPOSITE_LAYERS` line 48).
- `react-xyflow` / `reactflow` is NOT in `frontend/package.json` — P4.0 decides whether it ever is.
- Frontend tests: vitest, run from `frontend/` via `npx --no vitest run <path>` (`--no` mandatory); existing operator tests at `frontend/src/__tests__/stores/operators.test.ts`, `operators-persistence.test.ts`, `frontend/src/__tests__/components/operator-rack.test.tsx`, `modulation-matrix.test.tsx`.
- Backend tests: pytest from `backend/` (`testpaths=["tests"]`, `pythonpath=["src","tests"]`, addopts `-m 'not perf' -n auto --dist loadfile --reruns=2`); existing signal tests `backend/tests/test_signal_*.py` (12 files), **including `test_signal_zmq_integration.py`** — the standing harness for operators-over-ZMQ integration tests (P4.1/P4.2/P4.3 extend it). `perf`-marked tests are deselected by default; run with `-m perf`.
- E2E: Playwright `_electron`, `testDir: 'tests/e2e'` (`frontend/playwright.config.ts:4`), phase-scoped subdirs (`tests/e2e/phase-4/` exists).
- `_topological_sort` in `engine.py` already walks `parameters.sources[].operator_id` edges for ALL operator types (INJ-2) — Gate (P4.3) gets cycle safety for free.
- Pre-existing quirk (DO NOT FIX in this phase): store default for `step_sequencer.steps` is a CSV string while `engine.py` expects a list. Out of scope.

**Phase-wide modulation perf budget (referenced by P4.2/P4.4/P4.5 gates):** at 60fps the
frame budget is 16.6ms end-to-end. The modulation slice (`evaluate_all` +
`resolve_routings`, worst case 64 operators incl. 8-LFO clusters × 32 mappings) gets
**≤ 4.0ms p95**; a single `kentaroCluster` evaluation (8 sub-LFOs) gets **≤ 0.5ms p95**;
frontend graph/arc animation gets **≤ 8ms p95 scripting+render** (P4.0's gate threshold).
Numbers measured on the dev machine class recorded in P4.0's verdict doc.

## Global DO-NOT-TOUCH (applies to every packet)

- `backend/src/modulation/schema.py` (B1/B4-lite lane schema — separate workstream, INJ-5)
- `backend/src/effects/fx/sidechain_*.py` (video *effects* named sidechain; unrelated to the sidechain *operator*)
- `frontend/src/renderer/stores/timeline.ts`, `project.ts` (PR-zero per-track chain model — landed, frozen)
- `openspec/changes/**` (parallel session's workflow artifacts)
- Anything under `frontend/src/renderer/components/effects/EffectBrowser.tsx` except in P4.6
- No schema/data migrations, ever. No `.glitch` format version bumps in this phase.

## Dependency graph

```
P4.0 (spike) ────────────────────────────────┐
P4.1 (types+caps) ─┬─ P4.2 (kentaro backend) ─┬─ P4.4 (kentaro UI) ─┬─ P4.5 (topology graph;
                   │                          │                     │   also needs P4.0 verdict)
                   └─ P4.3 (sidechain/gate/   │                     │
                       stutter backend) ──────┴──────────┐          │
GATE:PR-A (NOT MERGED, external) ─────────────────────────┴─ P4.6 (browser op tab;
                                                              needs P4.1+P4.3+P4.4)  [BLOCKED]
```

Every `depends-on` above resolves to a packet ID defined in this file or to the
declared external gate `GATE:PR-A` (status: not on origin/main as of d821ae8).

---

## P4.0 — Prototype gate: react-xyflow 32-path @ 60fps  `RISK:HIGH`

- **ID:** P4.0
- **Branch:** `spike/p4-0-xyflow-32path-gate`
- **Base:** `origin/main`
- **Depends-on:** none
- **Goal:** Produce a measured PASS/FAIL verdict on react-xyflow rendering 32 animated SVG paths at 60fps with <8ms scripting+render frame time, so P4.5 knows whether to take the react-xyflow dependency or build bare SVG + rAF batching.
- **Size:** ~2h (PLAN says 30-min prototype; budget includes harness + measurement + writeup)
- **Model:** strong (RISK:HIGH)
- **RISK:HIGH because:** the verdict requires judgment about measurement methodology (what counts as "frame time", warm-up exclusion, Electron vs Chrome variance). Assign a stronger model.

### PRECONDITIONS (run first; if mismatch → STOP and report, do not improvise)

```bash
cd ~/Development/entropic-v2challenger
git fetch origin && git log origin/main -1 --oneline        # any SHA ≥ d821ae8 is fine
git grep -c "xyflow\|reactflow" origin/main -- frontend/package.json
# expect: command exits 1 with no output (0 matches — dep not present)
git grep -c "@xyflow" origin/main -- frontend/package-lock.json
# expect: exits 1, no output (not even transitively pinned)
git ls-tree origin/main --name-only docs/ | head -5
# expect: docs/ exists (docs/perf/ may not — create it)
git ls-tree origin/main --name-only frontend/spike/ 2>/dev/null
# expect: empty (no pre-existing spike dir to collide with)
```

If `frontend/package.json` already contains xyflow/reactflow → STOP (exit, report): someone pre-empted this gate; report which packet/PR added it. If `frontend/spike/` exists → STOP and report its contents before reusing the path.

### Scope checklist (verified paths)

- [ ] `frontend/spike/xyflow-gate/` — throwaway harness (new dir, NOT under `src/`, never imported by app code)
- [ ] `docs/perf/p4-xyflow-gate-result.md` — verdict artifact (new file)
- [ ] `frontend/package.json` — `@xyflow/react` added as devDependency ONLY inside this spike branch; the dep is NOT merged (see rollback)

### DO-NOT-TOUCH

- Everything in Global list. Additionally: `frontend/src/**` (zero app-code changes), `frontend/electron.vite.config.*`.

### Implementation steps

1. `git checkout -b spike/p4-0-xyflow-gate origin/main`
2. `cd frontend && npm install --save-dev @xyflow/react` (pin exact version in the result doc).
3. Build a minimal Vite page (or `npx vite` inside `frontend/spike/xyflow-gate/`) that renders a react-xyflow canvas with 16 nodes / 32 edges where each edge is an SVG `<path>`; animate ONLY `transform` attributes (translate/scale on a group), no path-`d` recompute — this mirrors P4.5's contract.
4. Drive animation with `requestAnimationFrame`; instrument with `performance.now()` per frame over a 10-second run (≈600 frames) after a 2-second warm-up (first 120 frames discarded); record p50/p95/max frame time AND dropped-frame count (rAF delta > 17ms). Cross-check with Chrome DevTools Performance trace (scripting+rendering per frame). 3 runs per implementation; report the worst run.
5. Repeat the identical animation with a bare-SVG control implementation (no xyflow, same 32 paths, rAF batching) for a comparison baseline. Also run a 64-path stress variant of BOTH (break-point data for P4.5's cap headroom — informational, not gating).
6. Write `docs/perf/p4-xyflow-gate-result.md`: environment (machine, Electron/Chrome version), methodology, and the **threshold table below filled in for both implementations**. End with a single verdict line: `VERDICT: PASS (use react-xyflow)` or `VERDICT: FAIL (bare SVG fallback)`.

   **Verdict threshold table (copy into the doc; ALL three PASS criteria must hold for xyflow to PASS):**

   | Metric (32 paths, 10s run, worst of 3) | PASS threshold | FAIL threshold | xyflow | bare SVG |
   |---|---|---|---|---|
   | p50 frame time (scripting+render) | < 5.0 ms | ≥ 5.0 ms | _measure_ | _measure_ |
   | p95 frame time (scripting+render) | < 8.0 ms | ≥ 8.0 ms | _measure_ | _measure_ |
   | Dropped frames (rAF delta > 17ms) per 600 | ≤ 6 (1%) | > 6 | _measure_ | _measure_ |
   | max frame time (informational) | — | — | _measure_ | _measure_ |
   | 64-path p95 (informational headroom) | — | — | _measure_ | _measure_ |

   Edge case: if xyflow passes all three but bare SVG beats its p95 by >2×, still PASS but record the margin — P4.5 may choose bare SVG anyway for the dependency saving.
7. Open PR containing ONLY `docs/perf/p4-xyflow-gate-result.md` (cherry-pick the doc onto a clean branch; the spike harness + dep stay on the spike branch, referenced by SHA in the doc).

### TEST PLAN

No vitest/pytest — this is a measurement spike (no app code is touched, so there is no behavior to regression-test; rubric integration-test requirement is N/A by packet type). The "test" is the measurement protocol in steps 4-5, executed via exact commands:

```bash
cd ~/Development/entropic-v2challenger/frontend/spike/xyflow-gate
npx vite --port 5199            # serve the harness
# in the harness page: ?impl=xyflow&paths=32 then ?impl=svg&paths=32 then both with paths=64
# harness must print the p50/p95/max/dropped JSON blob to console AND download it as run-N.json
```

Numbers without a DevTools trace screenshot or a captured rAF-delta histogram (the `run-N.json` files committed to the spike branch) = not evidence.

**Negative/abuse check (required):** load the harness with `?paths=0` and `?paths=512` — harness must clamp to [1, 64] and render without throwing (guards the methodology against a silently-empty run producing a fake PASS).

### ACCEPTANCE GATES

- [ ] `docs/perf/p4-xyflow-gate-result.md` exists on the PR and contains the filled threshold table (10 measured cells, no `_measure_` placeholders remaining) plus exactly ONE `VERDICT:` line (`grep -c "^VERDICT:" == 1`).
- [ ] All three PASS-criterion rows have explicit numbers with units (ms / count).
- [ ] Merged PR diff touches ONLY `docs/perf/` (verify: `git diff origin/main --stat` shows exactly 1 file).
- [ ] Spike branch pushed (not deleted) so P4.5 can reuse the harness; its SHA appears in the doc.
- [ ] 6 `run-N.json` files (3 per implementation) committed on the spike branch.

### FAILURE MODES / partial completion

- Partial completion looks like: verdict doc merged with only one implementation measured, or `_measure_` placeholders left in the table, or verdict asserted from a single run. Any of these = the gate did NOT run; P4.5 must STOP at its verdict-doc precondition.
- If the harness cannot reach stable 60fps even with 0 animated paths (environment problem), write `VERDICT: INCONCLUSIVE` + the environment data and STOP — do not pick a side; escalate to roadmap owner.

### ROLLBACK

Revert the doc PR. No migrations. Spike branch is throwaway by design.

### EVIDENCE required in PR body

Verdict line, the filled threshold table, exact `@xyflow/react` version tested, link/SHA of spike branch, screenshot or pasted histogram of frame-time distribution, paths of the 6 run-N.json files.

---

## P4.1 — OperatorType union extension + caps + render-budget guard

- **ID:** P4.1
- **Branch:** `feat/p4-1-operator-types-and-caps`
- **Base:** `origin/main`
- **Depends-on:** none
- **Goal:** Extend `OperatorType` with `'kentaroCluster' | 'sidechain' | 'gate' | 'midiEnvStutter'` (visible but `available: false` in UI), add `MAX_OPERATORS_PER_PROJECT = 64` + 32-mappings-per-operator caps on both sides of the IPC boundary, and add the 16ms render-budget guard to `SignalEngine.evaluate_all`.
- **Size:** ~3-4h
- **Model:** standard (mechanical: union extension + caps + guard; the typechecker enumerates the work)

### PRECONDITIONS (run first; if mismatch → STOP and report)

```bash
cd ~/Development/entropic-v2challenger && git fetch origin
git grep -n "export type OperatorType" origin/main -- frontend/src/shared/types.ts
# expect: types.ts:388:export type OperatorType = 'lfo' | 'envelope' | 'video_analyzer' | 'audio_follower' | 'step_sequencer' | 'fusion';
git grep -n "MAX_OPERATORS = " origin/main -- backend/src/modulation/engine.py
# expect: engine.py:17:MAX_OPERATORS = 16
git grep -n "MAX_OPERATORS_PER_PROJECT" origin/main -- backend/src/ frontend/src/
# expect: exits 1, NO matches (constant does not exist yet anywhere)
git grep -n "MAX_OPERATORS" origin/main -- frontend/src/shared/limits.ts
# expect: limits.ts:8:  MAX_OPERATORS: 16,
git grep -rn "LIMITS.MAX_OPERATORS" origin/main -- frontend/src
# expect: exits 1, NO matches — the constant is DEAD (zero readers); you will wire it
git grep -n "addOperator: (type) =>\|addMapping: (operatorId, mapping) =>" origin/main -- frontend/src/renderer/stores/operators.ts
# expect: lines 65 and 162 — read both bodies; confirm NO length/cap check exists in either
git grep -n "loadOperators" origin/main -- frontend/src/renderer/stores/operators.ts | head -2
# expect: interface line 56 + impl line 271
git grep -n "const TYPE_OPTIONS" origin/main -- frontend/src/renderer/components/operators/OperatorRack.tsx
# expect: line 18: const TYPE_OPTIONS: { type: OperatorType; label: string; available: boolean }[] = [
git grep -n "MAX_CHAIN_DEPTH\|MAX_COMPOSITE_LAYERS" origin/main -- backend/src/security.py
# expect: lines 42 and 48 (the constants your new cap sits beside)
git grep -n "signal = operator_values.get(op_id" origin/main -- backend/src/modulation/routing.py
# expect: routing.py:50 (the resolve_routings read site that gets the [:32] slice)
git grep -rn "kentaroCluster" origin/main -- frontend/src backend/src
# expect: exits 1, NO matches
```

If `kentaroCluster` already appears anywhere in `frontend/src` or `backend/src` → STOP and report (parallel session collision). If `addOperator`/`addMapping` already contain a cap check → STOP and report which PR added it.

### Scope checklist (verified paths)

- [ ] `frontend/src/shared/types.ts` — extend `OperatorType` union (line 388)
- [ ] `frontend/src/renderer/stores/operators.ts` — `createDefaultOperator` (line 14): add defaults + labels for the 4 new types (the `Record<OperatorType, …>` maps are exhaustive and will fail typecheck until you do); cap `addOperator` (line 65) at `LIMITS.MAX_OPERATORS` (64) — no-op + warning toast/`console.warn` when at cap; cap `addMapping` (line 162) at `LIMITS.MAX_MAPPINGS_PER_OPERATOR` (32) — same no-op+warn pattern; `loadOperators` (line 271) clamps `operators` to 64 and each `mappings` array to 32
- [ ] `frontend/src/shared/limits.ts` — change `LIMITS.MAX_OPERATORS` from 16 → 64 (line 8; currently a DEAD constant with zero readers — this packet wires it) and add `MAX_MAPPINGS_PER_OPERATOR: 32`. Do NOT create a new constants file and do NOT touch `constants.ts` (it holds CATEGORY/SHM/WATCHDOG, no caps)
- [ ] `frontend/src/renderer/components/operators/OperatorRack.tsx` — append 4 entries to `TYPE_OPTIONS` (line 18) with `available: false` (UI lands in P4.4/P4.6)
- [ ] `backend/src/security.py` — `MAX_OPERATORS_PER_PROJECT = 64` constant (beside `MAX_COMPOSITE_LAYERS`, line ~48) + comment citing qa-redteam M2
- [ ] `backend/src/modulation/engine.py` — replace `MAX_OPERATORS = 16` with import of `MAX_OPERATORS_PER_PROJECT` from security (or set to 64 with a cross-reference comment if the import crosses a layering boundary — check how other modules import security first: `git grep -n "from security import\|import security" origin/main -- backend/src/`); add render-budget guard: wrap the operator loop in `time.perf_counter()`, if total eval > 16ms log `logger.warning` once per second (rate-limited) and set a degrade flag that skips `video_analyzer` proxies on the next frame (cheapest meaningful degrade; document choice in code comment)
- [ ] `backend/src/modulation/routing.py` — `resolve_routings`: per-operator `mappings` slice `[:32]` (defense in depth; frontend already caps)
- [ ] Tests (see TEST PLAN)

### DO-NOT-TOUCH

Global list. Plus: do not implement any evaluator for the new types (engine's `else: value = 0.0` branch already handles unknown types gracefully — verified at engine.py dispatch tail); do not touch `ModulationMatrix.tsx`; do not change `_topological_sort`.

### Implementation steps

1. Branch. Extend the union in `types.ts`.
2. Run `cd frontend && npx tsc -b` — collect every exhaustiveness error; those errors ARE the checklist of `Record<OperatorType,…>` sites to update (known: `createDefaultOperator` defaults + labels in `operators.ts`; possibly icon/color maps — fix whatever typecheck surfaces, nothing more).
3. Defaults for new types (placeholders; refined by P4.2/P4.3): `kentaroCluster: { lfo_count: 8, master_rate_hz: 1.0, master_depth: 1.0, bpm_sync: false }`, `sidechain: { source_track_id: '', sensitivity: 1.4 }`, `gate: { threshold: 0.5, sources: '' }`, `midiEnvStutter: { attack: 5, decay: 10, sustain: 0.5, release: 15, trigger_count: 0 }`.
4. Add caps in store actions, reading `LIMITS` from `frontend/src/shared/limits.ts` (update 16→64, add `MAX_MAPPINGS_PER_OPERATOR: 32`). `addOperator` past 64 → no-op with warn. `addMapping` past 32 → no-op with warn.
5. Backend: security constant, engine cap reconcile (16 → 64), routing `[:32]`, budget guard.
6. Run full test suites (below). Typecheck must be clean.

### TEST PLAN

New test files (behavior keywords in titles):

- `frontend/src/__tests__/stores/operators-caps.test.ts`
  - `it('addOperator refuses the 65th operator (LIMITS.MAX_OPERATORS=64)')`
  - `it('addMapping refuses the 33rd mapping per operator (32-mapping cap)')`
  - `it('loadOperators clamps oversized mappings arrays to 32 entries')`
  - `it('addOperator creates valid defaults for kentaroCluster, sidechain, gate, midiEnvStutter')`
- `backend/tests/test_signal_operator_caps.py`
  - `test_evaluate_all_caps_at_64_operators_not_16`
  - `test_evaluate_all_refuses_65th_operator_silently_with_one_warning_log` (negative: 65 ops in, exactly 64 evaluated, exactly 1 warning)
  - `test_resolve_routings_ignores_mappings_beyond_32_per_operator` (negative: 40 mappings in, 32 applied)
  - `test_unknown_operator_type_evaluates_to_zero_without_crash` (negative: garbage `type` string → value 0.0)
  - `test_render_budget_guard_warns_when_eval_exceeds_16ms` (monkeypatch a slow evaluator; assert exactly 1 warning per 1-second window across 60 simulated frames, and assert the degrade flag is set for the following frame)
  - `test_render_budget_guard_silent_when_eval_under_16ms` (0 warnings on the fast path)
- `backend/tests/test_signal_zmq_integration.py` — **integration test (extend the existing class):**
  - `test_render_with_65_operators_returns_frame_and_caps_at_64_end_to_end` — full ZMQ render request carrying 65 LFO operators: response is a valid frame (no error), and ≤64 operator values are applied. Spans wire-format → `zmq_server.py:536` → `evaluate_all` → `apply_modulation` → encoded frame. (UI-event leg lands with the first UI packet, P4.4.)

Commands (all must pass):

```bash
cd ~/Development/entropic-v2challenger/frontend
npx tsc -b
npx --no vitest run src/__tests__/stores/operators-caps.test.ts src/__tests__/stores/operators.test.ts src/__tests__/stores/operators-persistence.test.ts src/__tests__/components/operator-rack.test.tsx
npx --no vitest run   # full suite, zero regressions
cd ~/Development/entropic-v2challenger/backend
python -m pytest tests/test_signal_operator_caps.py tests/test_signal_engine.py tests/test_signal_engine_toposort.py tests/test_signal_zmq_integration.py -x --tb=short
python -m pytest -x --tb=short   # full suite, zero regressions
```

### ACCEPTANCE GATES

- [ ] `npx tsc -b` exits 0 (proves union extension propagated to every exhaustive map).
- [ ] All commands above green; full frontend suite and full backend suite show **0 failed** and the same pass count as origin/main or higher (record both counts in the PR).
- [ ] `git grep -n "MAX_OPERATORS = 16" -- backend/src` returns 0 matches on the branch; `git grep -c "MAX_OPERATORS_PER_PROJECT"` returns ≥1 in `backend/src/security.py`.
- [ ] `git grep -rn "LIMITS.MAX_OPERATORS" frontend/src/renderer/stores/operators.ts` returns ≥1 match (dead constant now wired).
- [ ] New types appear in `TYPE_OPTIONS` with `available: false` — asserted by a test (`operator-rack.test.tsx`: menu renders exactly 6 enabled entries, 4 disabled), not by manual inspection.

### FAILURE MODES / partial completion

- Partial completion looks like: union extended + tsc green but caps un-wired (the dead-constant trap repeats — `LIMITS.MAX_OPERATORS` updated to 64 with still zero readers), or frontend caps added without the backend `[:32]`/64 reconcile (operators 17-64 still silently dropped server-side). The two grep gates above catch both.
- If `tsc -b` surfaces exhaustive maps outside `operators.ts` (icon/color maps), fix those too — but if it surfaces >10 sites, STOP and report (the union is more load-bearing than this packet assumed).

### ROLLBACK

Revert the PR. No migrations. Projects saved with new-type operators before revert would fail `loadOperators` type-filter silently (acceptable: no user base).

### EVIDENCE required in PR body

Paste: `tsc -b` exit 0, vitest summary line (with counts), pytest summary line (with counts), `git grep MAX_OPERATORS_PER_PROJECT` output showing both frontend + backend constants, `git grep -rn "LIMITS.MAX_OPERATORS" frontend/src` output showing ≥1 reader.

---

## P4.2 — Kentaro Cluster backend evaluator (8-LFO)  `RISK:HIGH`

- **ID:** P4.2
- **Branch:** `feat/p4-2-kentaro-cluster-backend`
- **Base:** `origin/main` (after P4.1 merges)
- **Depends-on:** P4.1
- **Goal:** Implement the `kentaroCluster` operator in the backend — up to 8 independent LFOs sharing master rate/depth/BPM-sync/phase-reset, each LFO individually routable — and wire it into `SignalEngine.evaluate_all` + `resolve_routings`.
- **Size:** ~4h
- **Model:** strong (RISK:HIGH)
- **RISK:HIGH because:** `operator_values` is `dict[op_id -> float]` (one scalar per operator) and `resolve_routings` reads `operator_values.get(op_id)`. Per-LFO routing requires a sub-key scheme + an optional mapping field. This is a real design extension, not paint-by-numbers.
- **Perf budget (gating, from the phase-wide budget):** one `kentaroCluster` evaluation (8 sub-LFOs) ≤ **0.5ms p95**; `evaluate_all` with 8 clusters (64 sub-LFOs) + 32 resolved mappings ≤ **4.0ms p95** over 1000 frames. Both enforced by perf-marked tests below.

### PRECONDITIONS (run first; if mismatch → STOP and report)

```bash
cd ~/Development/entropic-v2challenger && git fetch origin
git grep -n "kentaroCluster" origin/main -- frontend/src/shared/types.ts
# expect: 1 match in the OperatorType union (P4.1 merged). If 0 matches → STOP: P4.1 not landed.
git grep -n "def evaluate_lfo" origin/main -- backend/src/modulation/lfo.py
# expect: lfo.py:7:def evaluate_lfo(   — then READ lines 7-25 to confirm the param list
#   (waveform, rate_hz, phase_offset, frame_index, fps, state_in) -> tuple[float, dict]
git grep -n "signal = operator_values.get(op_id" origin/main -- backend/src/modulation/routing.py
# expect: routing.py:50 — exactly 1 match (the read site you will extend)
git grep -n "value = 0.0" origin/main -- backend/src/modulation/engine.py
# expect: ≥1 match in the dispatch else-branch (unknown-type fallback your new branch sits above)
git grep -n 'op-\${Date.now()}' origin/main -- frontend/src/renderer/stores/operators.ts
# expect: operators.ts:66 — op id format contains no '/' so the "{op_id}/lfoN" sub-key scheme cannot collide
git grep -n "getSerializedOperators" origin/main -- frontend/src/renderer/stores/operators.ts | head -2
# expect: interface line 57 + impl line 285 (the serializer you extend with source_key)
git grep -n 'message.get("operators")' origin/main -- backend/src/zmq_server.py
# expect: zmq_server.py:536 (evaluate_all call site ~547 — the bpm kwarg lands there)
test -f backend/src/modulation/kentaro_cluster.py && echo "EXISTS" || echo "ABSENT"
# expect: ABSENT — if EXISTS → STOP: parallel session collision
```

### Scope checklist (verified paths)

- [ ] `backend/src/modulation/kentaro_cluster.py` — NEW. `evaluate_kentaro_cluster(params, frame_index, fps, bpm, state_in) -> tuple[dict[str, float], dict]` returning `{'': master_mix, 'lfo0': v0, …, 'lfo7': v7}`; reuses `evaluate_lfo` per sub-LFO (do NOT reimplement waveforms); per-LFO config read from `params['lfos']` (list of ≤8 dicts: shape/rate_hz/depth/phase); shared `master_rate_hz`, `master_depth`, `bpm_sync` (when true, `rate_hz` is interpreted as beats — `effective_hz = rate_beats * bpm / 60`), `phase_reset` counter (increment → all LFOs restart phase); clamp `lfo_count` to 2..8; NaN/Inf guards on every numeric param (numeric trust-boundary rule)
- [ ] `backend/src/modulation/engine.py` — dispatch branch `elif op_type == "kentaroCluster":` storing master value at `values[op_id]` and sub-values at `values[f"{op_id}/lfo{i}"]`; add optional `bpm: float = 120.0` kwarg to `evaluate_all`
- [ ] `backend/src/modulation/routing.py` — mapping may carry optional `source_key` (str, e.g. `"lfo3"`); when present, `signal = operator_values.get(f"{op_id}/{source_key}", 0.0)`; absent → unchanged behavior
- [ ] `backend/src/zmq_server.py` — pass `bpm=float(message.get("bpm", 120.0))` (guard non-finite → 120.0) into `evaluate_all` at the call site (~line 547)
- [ ] `frontend/src/shared/types.ts` — `OperatorMapping` gains optional `sourceKey?: string`
- [ ] `frontend/src/renderer/stores/operators.ts` — `getSerializedOperators` emits `source_key: m.sourceKey` when set (snake_case, matching existing `target_effect_id` convention)
- [ ] Tests (see TEST PLAN)

### DO-NOT-TOUCH

Global list. Plus: `_topological_sort` (no operator-to-operator sources in kentaroCluster v1); `backend/src/modulation/lfo.py` (consume, don't modify); no UI files beyond the two type/serialization touches above; no `ModulationMatrix.tsx` UI for sourceKey (P4.4's job).

### Implementation steps

1. Branch from updated origin/main. Read `lfo.py`, `engine.py` dispatch, `routing.py` read-site in full before writing anything.
2. Write `kentaro_cluster.py` with per-LFO state threaded as `state['lfo{i}']` sub-dicts (matches the engine's per-op `op_state` pattern).
3. Wire dispatch + sub-key values. Sub-key format is `"{op_id}/lfo{i}"` — the `/` cannot collide with op ids (ids are `op-{timestamp}-{n}`; verify with the precondition grep on `operators.ts` id generation if paranoid).
4. Extend routing read-site; extend frontend types + serialization (camelCase → snake_case at the boundary, both accepted backend-side like existing dual-key reads).
5. BPM plumbing through zmq_server.
6. Tests, full suites.

### TEST PLAN

New test files:

- `backend/tests/test_signal_kentaro_cluster.py`
  - `test_eight_lfos_produce_independent_values_with_different_rates`
  - `test_lfo_count_clamped_between_2_and_8` (negative: `lfo_count=0`, `=1`, `=9`, `=999` all clamp, never raise)
  - `test_master_depth_scales_all_lfo_outputs`
  - `test_bpm_sync_converts_beat_rate_to_hz_using_bpm`
  - `test_phase_reset_counter_restarts_all_lfo_phases`
  - `test_nan_inf_master_rate_yields_zero_not_crash` (negative: NaN, +Inf, -Inf, string-typed rate)
  - `test_lfos_param_not_a_list_treated_as_empty_cluster` (negative: `lfos: "garbage"` → master 0.0, no crash)
  - `test_engine_exposes_subkey_values_for_each_lfo` (via `evaluate_all`)
- `backend/tests/test_signal_routing_source_key.py`
  - `test_mapping_with_source_key_reads_sub_lfo_value`
  - `test_mapping_without_source_key_unchanged_legacy_behavior`
  - `test_unknown_source_key_contributes_zero` (negative)
  - `test_source_key_with_slash_or_traversal_chars_contributes_zero` (negative: `source_key="../lfo0"` cannot escape the `{op_id}/{source_key}` namespace)
- `backend/tests/test_signal_kentaro_perf.py` — **perf gate (mark every test `@pytest.mark.perf`)**
  - `test_single_cluster_eval_p95_under_500us` — 1000 frames, one 8-LFO cluster, p95 of `evaluate_kentaro_cluster` ≤ 0.5ms
  - `test_evaluate_all_8_clusters_32_mappings_p95_under_4ms` — 1000 frames, 8 clusters (64 sub-LFOs) + `resolve_routings` over 32 mappings (mixed `source_key`/legacy), p95 of the combined modulation slice ≤ 4.0ms (60fps frame budget is 16.6ms; modulation gets ≤ 4ms — see phase-wide budget)
- `backend/tests/test_signal_zmq_integration.py` — **integration test (extend the existing class):**
  - `test_render_with_kentaro_cluster_modulates_effect_param_end_to_end` — full ZMQ render request: one kentaroCluster + a mapping with `source_key: "lfo3"` targeting an effect param; assert the rendered frame differs from the unmodulated render of the same frame index (wire → `zmq_server.py:536` → `evaluate_all` → sub-key routing → `apply_modulation` → encoded frame). The UI-event leg of the path is owned by P4.4's E2E spec.

- `frontend/src/__tests__/stores/operators-kentaro-serialization.test.ts`
  - `it('serializes mapping sourceKey as snake_case source_key')`
  - `it('omits source_key when mapping has no sourceKey')`
  - `it('round-trips a kentaroCluster operator through serialize then loadOperators without field loss')`

Commands:

```bash
cd ~/Development/entropic-v2challenger/backend
python -m pytest tests/test_signal_kentaro_cluster.py tests/test_signal_routing_source_key.py tests/test_signal_engine.py tests/test_signal_engine_toposort.py tests/test_signal_zmq_integration.py -x --tb=short
python -m pytest -m perf tests/test_signal_kentaro_perf.py -x --tb=short   # perf gate, run explicitly
python -m pytest -x --tb=short   # full suite, zero regressions
cd ~/Development/entropic-v2challenger/frontend
npx tsc -b
npx --no vitest run src/__tests__/stores/operators-kentaro-serialization.test.ts src/__tests__/stores/operators.test.ts
```

### ACCEPTANCE GATES

- [ ] All commands green; full backend suite shows **0 failed**, pass count ≥ origin/main's (record both counts).
- [ ] Perf gate: both perf tests pass with measured p95 values pasted in the PR (numbers in ms, not "fast enough"); `test_evaluate_all_8_clusters_32_mappings_p95_under_4ms` p95 ≤ 4.0ms.
- [ ] A kentaroCluster op with 8 LFOs at distinct rates produces 8 pairwise-distinct sub-values at frame 30, each in [0, 1] (assert in test, paste output).
- [ ] Legacy routing behavior byte-identical: existing `test_signal_engine.py` + `test_signal_routing.py` pass unmodified (0 edits to those files in the diff).

### FAILURE MODES / partial completion

- Partial completion looks like: evaluator + dispatch landed but the routing `source_key` read (routing.py:50) not extended — sub-LFO values computed then dropped on the floor (every mapping reads only the master mix). `test_mapping_with_source_key_reads_sub_lfo_value` is the tripwire; do not skip it.
- Second shape: frontend serializer emits `sourceKey` (camelCase) instead of `source_key` — backend silently ignores it (dual-key reads are NOT automatic for new fields). The serialization vitest is the tripwire.
- If the perf gate fails, do NOT merge with the test skipped: either optimize (vectorize the 8-LFO loop) or STOP and report the measured number to the roadmap owner.

### ROLLBACK

Revert the PR. `source_key` is optional on the wire — projects saved with it load fine after revert (unknown mapping keys are ignored by the older reader; confirm in PR body by running `loadOperators` filter against a fixture).

### EVIDENCE required in PR body

pytest + vitest summary lines (with counts), pasted assertion output of the 8-distinct-values test, measured perf p95 numbers (ms) for both perf tests, one-paragraph design note on the `op_id/lfoN` sub-key scheme (this becomes the reference for P4.4/P4.5).

---

## P4.3 — Sidechain, Gate, MIDI Envelope Stutter backend evaluators  `RISK:HIGH`

- **ID:** P4.3
- **Branch:** `feat/p4-3-simple-operators-backend`
- **Base:** `origin/main` (after P4.2 merges — serializes engine.py edits)
- **Depends-on:** P4.1, P4.2 (merge-order only, to avoid engine.py dispatch conflicts)
- **Goal:** Implement the three remaining PLAN §5.5 operators in `backend/src/modulation/` and wire them into the engine dispatch.
- **Size:** ~3-4h
- **Model:** strong (RISK:HIGH)
- **RISK:HIGH because:** two design judgments — (a) sidechain "source track's audio" but `evaluate_all` receives ONE `audio_pcm` (the project audio); per-track PCM does not reach the modulation engine today, so v1 must scope to project-audio amplitude with `source_track_id` reserved, and that descope must be stated, not hidden; (b) midiEnvStutter retriggering: backend has no MIDI runtime — the frontend must signal retriggers via a monotonically increasing `trigger_count` param.

### PRECONDITIONS (run first; if mismatch → STOP and report)

```bash
cd ~/Development/entropic-v2challenger && git fetch origin
git grep -n "kentaroCluster" origin/main -- backend/src/modulation/engine.py
# expect: ≥1 match (P4.2 merged). 0 → STOP.
git grep -n "def evaluate_audio" origin/main -- backend/src/modulation/audio_follower.py
# expect: audio_follower.py:8:def evaluate_audio(  — READ lines 8-25 to confirm params
#   (pcm, method, params, sample_rate, state_in)
git grep -n "def evaluate_envelope" origin/main -- backend/src/modulation/envelope.py
# expect: envelope.py:6:def evaluate_envelope(  — READ lines 6-25 to confirm params
#   (trigger, attack, decay, sustain, release, frame_index, state_in)
git grep -n "def evaluate_fusion" origin/main -- backend/src/modulation/fusion.py
# expect: fusion.py:11 — gate copies fusion's (sources, operator_values) read pattern;
#   sources element shape is {operator_id: str, weight: float} with NaN/Inf guards
git grep -n "operator_id" origin/main -- backend/src/modulation/engine.py | head -3
# expect: engine.py:41 (toposort docstring) + :70 (src.get("operator_id")) — toposort walks
#   params['sources'][].operator_id for ALL op types, so gate's upstream reads are cycle-safe for free
for f in sidechain gate midi_env_stutter; do test -f backend/src/modulation/$f.py && echo "$f EXISTS"; done
# expect: no output — if any EXISTS → STOP: parallel session collision
```

### Scope checklist (verified paths)

- [ ] `backend/src/modulation/sidechain.py` — NEW. `evaluate_sidechain(pcm, params, sample_rate, state_in)`: amplitude-follow (delegate to `evaluate_audio` with `method='rms'`), `sensitivity` param, `source_track_id` accepted-but-unused with a `# TODO(P4-followup): per-track PCM plumbing` comment and a one-time `logger.info` when set
- [ ] `backend/src/modulation/gate.py` — NEW. `evaluate_gate(params, operator_values, state_in)`: reads input from `params['sources'][0]['operator_id']` (same shape as fusion → toposort already orders it), outputs 1.0 when input > `threshold` else 0.0; optional `hysteresis` (default 0.0)
- [ ] `backend/src/modulation/midi_env_stutter.py` — NEW. `evaluate_midi_env_stutter(params, frame_index, state_in)`: ADSR via `evaluate_envelope`, retrigger when `params['trigger_count']` (int, monotonic, frontend-incremented on MIDI note-on) differs from `state['last_trigger_count']`
- [ ] `backend/src/modulation/engine.py` — three dispatch branches; gate's branch passes `values` (already-evaluated upstream operators), mirroring fusion's pattern
- [ ] Tests (see TEST PLAN)

### DO-NOT-TOUCH

Global list. Plus: `audio_follower.py`, `envelope.py` (consume, don't modify); no frontend changes at all in this packet (defaults landed in P4.1); no MIDI subsystem changes (`frontend/src/**/midi*` untouched — wiring `trigger_count` to real MIDI note-on is P4.6-followup scope, noted in PR body).

### Implementation steps

1. Branch. Read `fusion.py` + its dispatch branch — gate copies that operator-reads-operator pattern exactly.
2. Implement the three evaluators with NaN/Inf guards on every numeric param.
3. Dispatch wiring in declaration order after `kentaroCluster`.
4. Tests, full backend suite.

### TEST PLAN

New test files:

- `backend/tests/test_signal_sidechain.py`
  - `test_sidechain_follows_project_audio_amplitude_rms`
  - `test_sidechain_sensitivity_scales_output`
  - `test_sidechain_with_no_audio_pcm_outputs_zero` (negative)
  - **Reserved-field negative tests (the descope must reject gracefully, not explode or half-work):**
  - `test_sidechain_source_track_id_set_falls_back_to_project_audio_and_logs_info_exactly_once` (negative: reserved field present → identical output to unset, exactly 1 info log across 100 frames, never per-frame spam)
  - `test_sidechain_source_track_id_nonstring_garbage_ignored_without_crash` (negative: `source_track_id: {"evil": 1}` / `12345` / `NaN` → output unchanged, no exception)
  - `test_sidechain_nan_inf_sensitivity_clamped_to_default` (negative)
- `backend/tests/test_signal_gate.py`
  - `test_gate_outputs_one_when_source_operator_above_threshold`
  - `test_gate_outputs_zero_when_source_below_threshold`
  - `test_gate_hysteresis_prevents_flutter_around_threshold` — quantified: source oscillating ±0.04 around `threshold=0.5` with `hysteresis=0.1` produces **exactly 1 transition** over 120 frames (without hysteresis the same input produces ≥20)
  - `test_gate_with_missing_source_outputs_zero` (negative: `sources: []`, missing key, and dangling `operator_id` all → 0.0)
  - `test_gate_nan_threshold_outputs_zero_not_crash` (negative: reserved/garbage numeric → guarded)
  - `test_gate_after_lfo_in_toposort_reads_current_frame_value` (via `evaluate_all` — declares gate BEFORE its source lfo in the list; toposort must still order lfo first)
- `backend/tests/test_signal_midi_env_stutter.py`
  - `test_trigger_count_increment_retriggers_envelope_attack`
  - `test_unchanged_trigger_count_continues_envelope_phase`
  - `test_adsr_shape_matches_envelope_operator_for_single_trigger`
  - `test_trigger_count_negative_noninteger_or_nan_treated_as_zero_no_retrigger_storm` (negative: `-5`, `3.7`, `NaN`, `"abc"` → no crash, no retrigger every frame)
  - `test_trigger_count_decrease_does_not_retrigger` (negative: monotonicity contract — frontend bug sending lower count must not stutter)
- `backend/tests/test_signal_zmq_integration.py` — **integration test (extend the existing class):**
  - `test_render_with_gate_chained_after_lfo_modulates_param_end_to_end` — full ZMQ render request: lfo → gate (via `sources[].operator_id`) → mapping onto an effect param; assert rendered frame differs from unmodulated render when the LFO is above threshold and matches it when below (wire → toposort → gate → `apply_modulation` → frame).

Commands:

```bash
cd ~/Development/entropic-v2challenger/backend
python -m pytest tests/test_signal_sidechain.py tests/test_signal_gate.py tests/test_signal_midi_env_stutter.py tests/test_signal_zmq_integration.py -x --tb=short
python -m pytest -x --tb=short   # full suite, zero regressions
```

### ACCEPTANCE GATES

- [ ] All listed tests green + full backend suite shows **0 failed**, pass count ≥ origin/main's (record both counts).
- [ ] `test_gate_after_lfo_in_toposort_reads_current_frame_value` proves cycle-safe ordering came free from INJ-2 toposort (paste output).
- [ ] Hysteresis quantification holds: exactly 1 transition over the 120-frame flutter fixture (paste the transition count from test output).
- [ ] All 8 negative tests above pass — the reserved `source_track_id` field and garbage `trigger_count` values are proven to degrade gracefully (0 exceptions, ≤1 log line each).
- [ ] PR body states the sidechain v1 descope (project audio, not per-track) and the midiEnvStutter frontend-wiring gap explicitly.

### FAILURE MODES / partial completion

- Partial completion looks like: evaluators written but dispatch branches missing for 1-2 of the 3 types — those types silently fall through to `value = 0.0` and every targeted test "passes" only if it goes through the evaluator directly. The zmq integration test plus the per-type `evaluate_all` tests are the tripwire: each of the 3 types MUST have ≥1 test that goes through `evaluate_all`, not just the bare evaluator function.
- Second shape: `source_track_id` half-implemented (e.g. raising `NotImplementedError`) instead of reserved-and-ignored — the reserved-field negative tests catch this.
- If per-track PCM turns out to be reachable after all (precondition reality differs), STOP and report — do not silently expand scope into audio-pipeline plumbing.

### ROLLBACK

Revert the PR. New op types degrade to `value = 0.0` via the engine's else-branch for any project that referenced them.

### EVIDENCE required in PR body

pytest summary lines (targeted + full, with counts), descope statement, toposort test output, hysteresis transition-count output.

---

## P4.4 — Kentaro Cluster UI: editor + per-destination depth arcs  `RISK:HIGH`

- **ID:** P4.4
- **Branch:** `feat/p4-4-kentaro-cluster-ui`
- **Base:** `origin/main` (after P4.2 merges)
- **Depends-on:** P4.1, P4.2
- **Goal:** Ship `OperatorKentaroCluster.tsx` (8-LFO direct-manipulation editor, Madrona Labs Aalto reference) and `OperatorDepthArc.tsx` (Bitwig-style colored arc around target knobs, color-matched per source LFO), and flip `kentaroCluster` to `available: true` in `OperatorRack`.
- **Size:** ~4h
- **Model:** strong (RISK:HIGH)
- **RISK:HIGH because:** direct-manipulation canvas/SVG interaction — CLAUDE.md Rule 1.5 / Research Gate applies (drag-to-sculpt waveform overlays, pointer-event layering). Assign a stronger model; the reference-implementation citation MUST appear in the file header.

### PRECONDITIONS (run first; if mismatch → STOP and report)

```bash
cd ~/Development/entropic-v2challenger && git fetch origin
git grep -n "kentaroCluster" origin/main -- backend/src/modulation/engine.py frontend/src/shared/types.ts
# expect: matches in BOTH (P4.1+P4.2 merged). Missing either → STOP.
git grep -n "sourceKey" origin/main -- frontend/src/shared/types.ts
# expect: 1 match on OperatorMapping (P4.2). 0 → STOP.
git ls-tree origin/main --name-only frontend/src/renderer/components/operators/
# expect EXACTLY (verified at d821ae8): AudioFollowerEditor.tsx EnvelopeEditor.tsx FusionEditor.tsx
#   LFOEditor.tsx ModulationMatrix.tsx OperatorRack.tsx RoutingLines.tsx StepSequencerEditor.tsx
#   VideoAnalyzerEditor.tsx — and NO OperatorKentaroCluster.tsx / OperatorDepthArc.tsx
#   (extra files are fine if unrelated; the two NEW names existing → STOP: collision)
git grep -n "op.type === 'fusion'" origin/main -- frontend/src/renderer/components/operators/OperatorRack.tsx
# expect: line 157 — the per-type editor branch pattern you copy
git grep -n "available: false" origin/main -- frontend/src/renderer/components/operators/OperatorRack.tsx | grep -i kentaro
# expect: 1 match (P4.1 landed the disabled entry)
git grep -n "updateOperator\|updateMapping" origin/main -- frontend/src/renderer/stores/operators.ts | head -4
# expect: both actions exist (the editor reuses them; no new store actions)
```

### Scope checklist (verified paths)

- [ ] `frontend/src/renderer/components/operators/OperatorKentaroCluster.tsx` — NEW editor following the existing `LFOEditor.tsx` prop/store conventions (read it first): per-LFO rows (shape/rate/depth/phase + target mapping w/ `sourceKey`), shared master controls, drag-on-waveform-overlay sculpting, set-vs-effective animated display
- [ ] `frontend/src/renderer/components/operators/OperatorDepthArc.tsx` — NEW. Pure-SVG arc, props `{ depth, color, radius }`, no store coupling (reusable by P4.5)
- [ ] `frontend/src/renderer/components/operators/OperatorRack.tsx` — render `OperatorKentaroCluster` for `op.type === 'kentaroCluster'` (follow the existing `op.type === 'fusion'` branch at ~line 157); flip `available: true`
- [ ] `frontend/src/renderer/components/operators/ModulationMatrix.tsx` — render `sourceKey` suffix on mapping rows for cluster ops (read-only display; full matrix editing of sourceKey is out of scope)
- [ ] Tests (see TEST PLAN)

### DO-NOT-TOUCH

Global list. Plus: no topology graph (P4.5); no browser/EffectBrowser changes (P4.6); no new npm dependencies (bare SVG only — xyflow is P4.5's decision); no changes to `RoutingLines.tsx`; `sidechain/gate/midiEnvStutter` stay `available: false`.

### Implementation steps

1. **Research Gate first (Rule 1.5):** study react-moveable / existing `StepSequencerEditor.tsx` drag handling + Aalto screenshots; cite the chosen pattern in the `OperatorKentaroCluster.tsx` header comment (PLAN §5.4 requires this citation).
2. Read `LFOEditor.tsx` + `OperatorRack.tsx` + `operators.ts` store in full. Reuse `updateOperator`/`addMapping`/`updateMapping` — no new store actions.
3. Build `OperatorDepthArc` (pure, testable) first; then the editor; then rack wiring.
4. Wiring Check (Gate 14): every callback → store mutation verified; select AND deselect; mount AND unmount; legacy project without `lfos` param loads without crash (defaults from P4.1).
5. Tests, typecheck, full vitest.

### TEST PLAN

New test files:

- `frontend/src/__tests__/components/operator-kentaro-cluster.test.tsx`
  - `it('renders one row per LFO up to the configured lfo_count')`
  - `it('clamps lfo_count input between 2 and 8')` (negative: typing `0` / `99` / `-3` / `e` clamps or rejects, never NaN in store)
  - `it('master depth slider updates operator parameters in the store')`
  - `it('per-LFO target mapping creates a mapping with the correct sourceKey')`
  - `it('loads a legacy kentaroCluster operator with missing lfos param without crashing')` (negative: legacy-data path)
  - `it('unmounting mid-drag removes all document-level pointer listeners')` (negative: Gate 14 exit-path; spy on add/removeEventListener, counts must balance)
- `frontend/src/__tests__/components/operator-depth-arc.test.tsx` — **visual-state tests (exact SVG geometry, not snapshots):**
  - `it('depth 1.0 renders a 270-degree sweep: path d end-angle within 0.5deg of 270')` (parse the `d` attribute arc params)
  - `it('depth 0.5 renders a 135-degree sweep (linear proportionality, ±0.5deg)')`
  - `it('depth 0 renders an empty arc: d attribute absent or zero-length, never NaN in d')` (negative)
  - `it('depth values outside 0..1 are clamped: depth=1.7 renders the same d as depth=1.0, depth=-0.2 same as 0')` (negative)
  - `it('arc stroke equals the color prop verbatim and radius prop sets the arc radius attribute')`
  - `it('arc re-renders to the new sweep when the depth prop changes (set-vs-effective display)')`
- `frontend/tests/e2e/phase-4/kentaro-cluster-roundtrip.spec.ts` — **THE integration test for this feature (full path UI event → store → IPC → backend → render):**
  - `test('dragging master depth on a Kentaro Cluster changes the rendered preview frame')` — Playwright `_electron`: load fixture project with one video clip + one effect; add Kentaro Cluster via rack menu (UI event); map lfo0 → effect param (store); start playback; capture preview `<img>` `src` checksum at depth 0, drag master depth to 1.0, capture again over 30 frames — checksums must differ in ≥10 of 30 frames (proves store → ZMQ IPC → `evaluate_all` → `apply_modulation` → encoded frame → `<img>` round trip)

Commands:

```bash
cd ~/Development/entropic-v2challenger/frontend
npx tsc -b
npx --no vitest run src/__tests__/components/operator-kentaro-cluster.test.tsx src/__tests__/components/operator-depth-arc.test.tsx src/__tests__/components/operator-rack.test.tsx src/__tests__/components/modulation-matrix.test.tsx
npx --no vitest run   # full suite
npx playwright test tests/e2e/phase-4/kentaro-cluster-roundtrip.spec.ts
```

**Live runtime check (Gate 18, required):** run the app from
`~/Development/entropic-v2challenger/frontend` via `npm start` (if an
`entropic-v2-uat` worktree session is active, `cp` the changed files there and state
which path the running Electron process loads — `ps aux | grep -i electron`). Add a
Kentaro Cluster from the rack menu, map lfo0 to a visible effect param, drag master
depth 0 → 1 during playback: the target param's knob readout must change by ≥10% of
its range within 2 seconds, and the preview must visibly modulate.

### ACCEPTANCE GATES

- [ ] All commands green: tsc exit 0, full vitest suite **0 failed** with pass count ≥ origin/main's, Playwright spec passes (record the ≥10-of-30 differing-frame count).
- [ ] Depth-arc geometry tests pass with the exact angle tolerances above (±0.5°).
- [ ] Reference-implementation citation present in `OperatorKentaroCluster.tsx` header (grep it, paste in PR).
- [ ] Live runtime check done with the runtime path named in the PR body (Gate 18 evidence).
- [ ] `sidechain/gate/midiEnvStutter` still `available: false` (grep proof: `git grep -n "available: false" -- frontend/src/renderer/components/operators/OperatorRack.tsx` shows 3 matches).
- [ ] Pointer-listener balance test green (0 leaked document listeners after unmount).

### FAILURE MODES / partial completion

- Partial completion looks like: editor renders and store updates but the mapping's `sourceKey` never reaches serialization — preview modulates from the master mix only and all 8 LFOs look identical. The E2E roundtrip spec at depth-per-LFO plus P4.2's serialization tests are the tripwire.
- Second shape: `available: true` flipped but `OperatorRack` lacks the `op.type === 'kentaroCluster'` editor branch — users can add an operator they cannot edit. The renders-one-row-per-LFO test mounted via the Rack (not the editor in isolation) catches this; mount through `OperatorRack` in at least one test.
- Drag-end-suppresses-click hazard (memory: `feedback_drag-end-suppresses-click`): after a depth drag, the synthesized click must not deselect the operator — cover in the unmount/exit-path test or chaos pass.

### ROLLBACK

Revert the PR. Flip `available` back implicitly via revert; saved projects containing cluster ops still load (type exists since P4.1, backend since P4.2).

### EVIDENCE required in PR body

tsc + vitest summaries (with counts), Playwright result with differing-frame count, header-citation grep output, screenshot or screen recording of the editor modulating a param in the live app, runtime path named.

---

## P4.5 — Operator topology graph (xyflow or bare-SVG per P4.0 verdict)  `RISK:HIGH`

- **ID:** P4.5
- **Branch:** `feat/p4-5-operator-topology-graph`
- **Base:** `origin/main` (after P4.2 + P4.4 merge)
- **Depends-on:** P4.0 (verdict), P4.2, P4.4 (reuses `OperatorDepthArc`)
- **Goal:** Render the operator-routing topology (operators → mappings → effect params, ≤32 animated `<path>` edges, transform-only animation) as `OperatorTopologyGraph.tsx`, mounted in `OperatorRack` (device-chain tile placement moves to PR-A's shell later — that re-mount is PR-A scope, not yours).
- **Size:** ~4h
- **Model:** strong (RISK:HIGH)
- **RISK:HIGH because:** 60fps animation budget, layout algorithm judgment, and the implementation forks on P4.0's verdict.
- **Perf budget (gating):** with 8 operators / 32 mappings animating, p95 scripting+render ≤ **8.0ms** per frame, dropped frames (rAF delta > 17ms) ≤ 1% — same thresholds as P4.0's verdict table.

### PRECONDITIONS (run first; if mismatch → STOP and report)

```bash
cd ~/Development/entropic-v2challenger && git fetch origin
git show origin/main:docs/perf/p4-xyflow-gate-result.md | grep -c "^VERDICT:"
# expect: exactly 1. File missing or count != 1 → STOP: run P4.0 first / verdict doc malformed.
git show origin/main:docs/perf/p4-xyflow-gate-result.md | grep "^VERDICT:"
# record PASS or FAIL — the implementation forks on this line.
git grep -n "OperatorDepthArc" origin/main -- frontend/src/renderer/components/operators/
# expect: ≥1 match (P4.4 merged). 0 → STOP.
git grep -n "xyflow" origin/main -- frontend/package.json
# expect: dep presence CONSISTENT WITH THE VERDICT DOC (not a hard 0-matches check):
#   VERDICT: FAIL → 0 matches required; VERDICT: PASS → 0 matches (this packet adds the dep) OR already
#   present if a prior PASS-branch packet landed it. Dep present despite VERDICT: FAIL → STOP and report.
git ls-tree origin/main --name-only frontend/src/renderer/components/operators/ | grep -c "OperatorTopologyGraph"
# expect: 0 (exits 1) — 1 match → STOP: collision
git grep -n "RoutingLines" origin/main -- frontend/src/renderer/App.tsx
# expect: import line 64 + mount `<RoutingLines operatorValues={...}>` at App.tsx:2479 —
#   legacy lines mount in App.tsx, NOT OperatorRack; you leave both the component and its mount untouched
```

### Scope checklist (verified paths)

- [ ] `frontend/src/renderer/components/operators/OperatorTopologyGraph.tsx` — NEW. Nodes = operators + target effects; edges = mappings (≤32 rendered; if more exist post-cap that's a bug upstream — assert, don't slice silently); edge thickness/color from depth + source color (reuse `OperatorDepthArc` color convention); animate ONLY `transform` attributes
- [ ] IF VERDICT: PASS → `frontend/package.json` adds `@xyflow/react` (exact version from the gate doc); graph uses xyflow nodes/edges
- [ ] IF VERDICT: FAIL → bare SVG + single `requestAnimationFrame` loop batching all 32 transform writes (pattern from P4.0's control harness — pull from the spike branch)
- [ ] `frontend/src/renderer/components/operators/OperatorRack.tsx` — mount the graph in a collapsible section (collapsed by default; rendering 0 cost when collapsed — unmount, not `display:none`)
- [ ] Tests (see TEST PLAN)

### DO-NOT-TOUCH

Global list. Plus: `RoutingLines.tsx` (legacy lines stay until PR-A relayout removes them — removing them here breaks existing tests); no EffectBrowser; no backend; no device-chain components (`frontend/src/renderer/components/**/DeviceChain*` — PR-A territory).

### Implementation steps

1. Read the P4.0 verdict doc FIRST; the implementation forks there. Copy the winning pattern from the spike branch.
2. Read `ModulationMatrix.tsx` + `RoutingLines.tsx` for the existing operator→mapping data-shape selectors; reuse selectors, don't reinvent.
3. Build graph component with deterministic layout (operators column-left, effects column-right, edges between — no force simulation; force layouts are nondeterministic and untestable).
4. rAF loop: subscribe to operator values for live edge animation ONLY when the section is expanded; tear down on collapse/unmount (julik race-condition rules: guard against setState-after-unmount).
5. Tests, typecheck, full vitest.

### TEST PLAN

New test file:

- `frontend/src/__tests__/components/operator-topology-graph.test.tsx`
  - `it('renders one node per operator and one node per mapped target effect')`
  - `it('renders one edge path per mapping with at most 32 paths')`
  - `it('edge color matches source operator color and thickness scales with depth')`
  - `it('collapsed section unmounts the graph and cancels the animation frame loop')` — quantified: spy on `requestAnimationFrame`/`cancelAnimationFrame`; after collapse, scheduled-minus-cancelled == 0 and zero new rAF callbacks fire over 5 fake-timer frames
  - `it('kentaroCluster mappings with sourceKey render as distinct edges per sub-LFO')`
  - `it('renders an empty state with zero edges and zero nodes when the project has no operators')` (negative)
  - `it('logs an assertion error and renders nothing extra when more than 32 mappings reach the graph')` (negative: upstream-cap-breach tripwire — assert, don't slice silently)
  - `it('layout is deterministic: two renders of the same store state produce identical node coordinates')` (guards the no-force-simulation rule)
- `frontend/tests/e2e/phase-4/operator-topology-live-edges.spec.ts` — **THE integration test (UI event → store → IPC → backend → render):**
  - `test('expanding the topology section during playback shows edges animating from live operator values')` — Playwright `_electron`: fixture project with 1 LFO mapped to an effect param; start playback (backend `evaluate_all` over ZMQ produces operator values); expand the topology section (UI event); sample the mapped edge's `transform`/stroke-width attribute at 3 instants ≥500ms apart — the 3 samples must not all be equal (proves backend-computed values drive the rendered edges), then collapse and assert the graph DOM node count drops to 0 (unmount, not display:none)

Commands:

```bash
cd ~/Development/entropic-v2challenger/frontend
npx tsc -b
npx --no vitest run src/__tests__/components/operator-topology-graph.test.tsx src/__tests__/components/operator-rack.test.tsx
npx --no vitest run   # full suite
npx playwright test tests/e2e/phase-4/operator-topology-live-edges.spec.ts
```

**Manual perf check (required, not automatable in vitest):** live app run from
`~/Development/entropic-v2challenger/frontend` (`npm start`; name the actual runtime
path per Gate 18 if a uat worktree is active), 8 operators / 32 mappings fixture
project, topology expanded, DevTools Performance trace over ≥10s of playback —
**p95 frame scripting+render ≤ 8.0ms, dropped frames ≤ 1%**. Paste trace summary in PR.

### ACCEPTANCE GATES

- [ ] All vitest green (**0 failed**, pass count ≥ origin/main's), tsc exit 0, Playwright spec green.
- [ ] Manual perf trace pasted: p95 ≤ 8.0ms and dropped-frame % with 32 animated paths (numbers, not adjectives).
- [ ] `package.json` diff matches the P4.0 verdict (dep added ⟺ PASS); paste the VERDICT line next to the diff stat.
- [ ] rAF loop provably cancelled on unmount: the quantified spy test green AND zero `setState on unmounted` / rAF warnings in the live-run console.
- [ ] Collapsed cost is zero: E2E collapse assertion green (graph subtree removed from DOM).

### FAILURE MODES / partial completion

- Partial completion looks like: graph renders statically but the live-value subscription was never wired (edges drawn once, never animate) — the 3-sample E2E assertion is the tripwire. Or: subscription wired but never torn down on collapse — the rAF-balance spy test and the DOM-removal assertion catch both halves.
- Fork hazard: implementing the xyflow branch when the verdict said FAIL (or vice versa) — the package.json⟺VERDICT gate catches it; if the verdict doc is missing or says INCONCLUSIVE, STOP (P4.0 must re-run).
- If deterministic column layout produces unreadable overlap at 8+ operators, add row-wrapping — do NOT reach for a force simulation (nondeterministic, untestable).

### ROLLBACK

Revert the PR (also reverts the dep if added). Graph is presentation-only; no persisted state.

### EVIDENCE required in PR body

VERDICT line quoted from gate doc, vitest/tsc summaries (with counts), Playwright result, perf-trace screenshot with p95 + dropped-frame numbers, live runtime path named (Gate 18).

---

## P4.6 — Browser `op` tab + drag-to-add  `BLOCKED — depends on PR-A`  `RISK:HIGH`

- **ID:** P4.6
- **Branch:** `feat/p4-6-browser-op-tab`
- **Base:** `origin/main` (after PR-A merges — NOT mergeable today)
- **Depends-on:** **GATE:PR-A** (external declared gate: 5-tab browser shell + `F_CREATRIX_LAYOUT` flag — NOT on origin/main as of d821ae8; owned by the PR-A workstream, not this phase), P4.1, P4.3 (flips its types to `available: true`), P4.4
- **Goal:** Surface operators in the browser's `op` tab (folders: MODULATION / INPUTS / GATING, implemented types only) with drag-onto-track-header (adds operator) and drag-onto-param-knob (adds operator + auto-mapping at depth 1.0).
- **Size:** ~4h
- **Model:** strong (RISK:HIGH)
- **RISK:HIGH because:** drag-and-drop across panels (Research Gate: study existing drag handling in `EffectBrowser.tsx` first; HTML5 DnD vs pointer-event judgment) and because the PR-A surface it lands on does not exist yet — scope below is written against PLAN §3/§5.6 and MUST be re-verified against the merged PR-A code.

### PRECONDITIONS (run first; if ANY mismatch → STOP and report — this is the expected outcome until PR-A lands)

```bash
cd ~/Development/entropic-v2challenger && git fetch origin
git grep -rn "F_CREATRIX_LAYOUT" origin/main -- frontend/src | head -3
# expect: ≥1 match (PR-A merged). AS OF 2026-06-11 THIS RETURNS 0 → STOP. Do not improvise a tab system.
git grep -n "Tab" origin/main -- frontend/src/renderer/components/effects/EffectBrowser.tsx | head -5
# expect: tab structure exists (PR-A). As of d821ae8: 0 matches → STOP.
git grep -n "available: true" origin/main -- frontend/src/renderer/components/operators/OperatorRack.tsx | grep -i kentaro
# expect: 1 match (P4.4 merged). 0 → STOP.
git grep -n 'op_type == "kentaroCluster"\|op_type == "sidechain"\|op_type == "gate"\|op_type == "midiEnvStutter"' origin/main -- backend/src/modulation/engine.py
# expect: 4 dispatch branches (P4.2+P4.3 merged). Fewer → STOP and name the missing packet.
git grep -n "MAX_MAPPINGS_PER_OPERATOR\|MAX_OPERATORS" origin/main -- frontend/src/shared/limits.ts
# expect: MAX_OPERATORS: 64 + MAX_MAPPINGS_PER_OPERATOR: 32 (P4.1) — the caps your refusal UX surfaces
git grep -n "addToast" origin/main -- frontend/src/renderer/stores/toast.ts | head -2
# expect: toast store exists (the cap-refusal feedback channel; rate-limited 2s dedup by source)
```

### Scope checklist (paths PROVISIONAL — re-verify file names against merged PR-A before executing)

- [ ] Browser op-tab content component (location determined by PR-A's tab architecture; today's anchor is `frontend/src/renderer/components/effects/EffectBrowser.tsx`)
- [ ] Folder taxonomy, implemented types ONLY (see ground-truth corrections — §5.6's S&H/Random/MATH/MIDI-CC/Playhead entries have no implementations and are OUT of scope):
  - MODULATION: LFO · Envelope · Step Seq · Fusion · **Kentaro Cluster** · **MIDI Envelope Stutter**
  - INPUTS: Audio Follower · Video Analyzer · **Sidechain**
  - GATING: **Gate**
- [ ] Drag-onto-track-header → `addOperator(type)`; drag-onto-param-knob → `addOperator(type)` + `addMapping(opId, { targetEffectId, targetParamKey, depth: 1.0, min: 0, max: 1, curve: 'linear' })`
- [ ] Flip `sidechain`, `gate`, `midiEnvStutter` to `available: true` in `OperatorRack.tsx` `TYPE_OPTIONS` (their backend landed in P4.3)
- [ ] Tests (see TEST PLAN)

### DO-NOT-TOUCH

Global list. Plus: no backend; no changes to PR-A's tab shell itself (consume its API); no fx-tab behavior changes.

### Implementation steps

1. Re-run preconditions. If PR-A still absent → file this packet back to the queue and STOP.
2. Re-verify every scope path against merged PR-A; update this packet's checklist in a PR comment before coding (the packet author could not see PR-A's file layout).
3. Research Gate: read PR-A's drag implementation (and `EffectBrowser.tsx` effect-drag precedent) — reuse its DnD mechanism exactly; do not introduce a second drag system.
4. Build folder tree + drag sources; wire drop targets on track header + param knobs.
5. Wiring Check (Gate 14) + chaos pass (drop on invalid targets, drop mid-playback, rapid double-drags, drop when at 64-operator cap → must no-op with visible feedback, not crash).
6. Tests, typecheck, full vitest.

### TEST PLAN

New test file:

- `frontend/src/__tests__/components/browser-op-tab.test.tsx`
  - `it('op tab lists exactly 10 operator types grouped as MODULATION(6) INPUTS(3) GATING(1)')`
  - `it('drop on track header adds an operator of the dragged type')`
  - `it('drop on a param knob adds operator plus auto-mapping at depth 1.0 linear')`
  - `it('drop is refused with a toast when operator count is at the 64 cap')` (negative: store length stays 64, exactly 1 toast via `addToast` with a `source` field for rate-limiting)
  - `it('drop on an invalid target is a no-op without console errors')` (negative: 0 store mutations, 0 console.error calls)
  - `it('rapid double-drop adds exactly two operators not three')` (negative: timing-error chaos case)
- `frontend/tests/e2e/phase-4/browser-op-tab-drag.spec.ts` — **THE integration test (UI event → store → IPC → backend → render):**
  - `test('dragging Kentaro Cluster from the op tab onto a param knob modulates the preview')` — Playwright `_electron`: fixture project with a clip + effect; drag the Kentaro Cluster entry from the browser op tab onto an effect param knob (UI event) → operator + auto-mapping at depth 1.0 created (store) → during playback, preview `<img>` checksum differs from the pre-drop render in ≥10 of 30 sampled frames (IPC → backend `evaluate_all` → render)

Commands:

```bash
cd ~/Development/entropic-v2challenger/frontend
npx tsc -b
npx --no vitest run src/__tests__/components/browser-op-tab.test.tsx src/__tests__/components/operator-rack.test.tsx
npx --no vitest run   # full suite
npx playwright test tests/e2e/phase-4/browser-op-tab-drag.spec.ts
```

**Live runtime check (Gate 18, required):** app from
`~/Development/entropic-v2challenger/frontend` via `npm start` (name the actual runtime
path if a uat worktree is active). Drag Kentaro Cluster onto a param knob: the mapping
appears and the preview modulates within 2s. Then add operators to the 64 cap and drop
one more: a refusal toast appears within 1s and the operator count stays 64.

### ACCEPTANCE GATES

- [ ] All green: tsc exit 0, full vitest **0 failed** (pass count ≥ origin/main's), Playwright spec green with the ≥10-of-30 frame-diff count recorded.
- [ ] Live runtime check done; runtime path named in PR (Gate 18 evidence).
- [ ] All 4 new operator types now `available: true` (grep proof: `git grep -c "available: false" -- frontend/src/renderer/components/operators/OperatorRack.tsx` produces no output / exits 1 — zero disabled entries remain).
- [ ] Cap-refusal demonstrated: recording/screenshot showing toast + operator count pinned at 64.
- [ ] Exactly ONE drag system in the diff: 0 new drag libraries in `package.json`, and the PR cites the PR-A DnD file/line it reuses.

### FAILURE MODES / partial completion

- Partial completion looks like: folders render and track-header drop works but knob-drop creates the operator WITHOUT the auto-mapping (the operator exists, nothing modulates, user blames the effect). The knob-drop vitest asserting `mappings.length === 1 && depth === 1.0` plus the E2E spec are the tripwire.
- Second shape: `available: true` flipped for sidechain/gate/midiEnvStutter while P4.3 hasn't merged — users add operators that evaluate to 0.0 forever. The engine-dispatch precondition grep guards this; re-run it at execution time, not authoring time.
- Cap refusal that silently no-ops (no toast) is a FAIL per `feedback_no-yellows-binary-verdicts` — refusal must be visible feedback, asserted in the cap test.

### ROLLBACK

Revert the PR. Tab disappears; operators remain addable via OperatorRack menu (P4.4 path unaffected).

### EVIDENCE required in PR body

tsc/vitest summaries (with counts), Playwright result with frame-diff count, drag-to-knob recording, cap-refusal proof, note confirming PR-A's DnD mechanism was reused (cite file/line).

---

## Execution notes for the dispatcher

- **Parallelizable now:** P4.0, P4.1 (disjoint files). P4.2 next; then P4.3 ∥ P4.4; then P4.5. P4.6 sits in the blocked queue until GATE:PR-A clears.
- **Model routing:** P4.0, P4.2, P4.3, P4.4, P4.5, P4.6 are RISK:HIGH (stronger model — each packet's **Model:** line is authoritative). P4.1 is mechanical (standard model fine).
- **Every PR:** branch from fresh `origin/main`, `gh pr create` with the EVIDENCE section filled, squash-merge, no migrations anywhere in this phase.
- **Estimate check:** P4.1–P4.6 sum ≈ 18-22h vs PLAN's 14-18h — the overage is the per-packet test files PLAN lumped into one ~700-line row. Acceptable; flag to roadmap owner if budget matters.

---

## Thickness scorecard (rubric pass 2026-06-11, verified against origin/main d821ae8)

Rubric: (1) anchors git-grep-verified in preconditions · (2) full contract incl. model tier
· (3) named tests + behavior titles + exact commands (+ live-runtime path for UI)
· (4) quantified gates · (5) failure modes + ≥1 negative test · (6) named full-path
integration test · (7) depends-on resolve.

| Packet | Failed before | Fixed in this pass | After |
|---|---|---|---|
| P4.0 | 1 (local `grep`/`ls`, not `git grep origin/main`) · 2 (no model tier) · 4 (single p95 number, no PASS/FAIL table) · 5 (no failure modes, no negative check) | Preconditions converted to `git grep`/`git ls-tree origin/main` incl. lockfile + spike-dir collision checks; **Model** line; quantified 5-row verdict threshold table (p50/p95/dropped-frames, 3-run worst, 600-frame protocol) + INCONCLUSIVE path; harness run commands + `?paths=0/512` clamp negative check; FAILURE MODES section | 1-5,7 ✓; 6 N/A (doc-only spike, no app code — justified inline) |
| P4.1 | 1 (limits.ts ground truth missed: `LIMITS.MAX_OPERATORS:16` exists, dead, 0 readers; scope pointed at `constants.ts`/new file) · 2 (no model tier) · 3 (`npx vitest` w/o `--no`; pytest `-q` not `-x --tb=short`) · 4 (manual menu check unquantified) · 5 (no partial-completion statement) · 6 (no integration test) | Preconditions now pin engine.py:17, limits.ts:8, dead-constant grep, store lines 65/162/271, security.py 42/48, routing.py:50; scope rewired to `limits.ts`; commands fixed; gates quantified (0 failed, count ≥ baseline, grep-count gates, 6-enabled/4-disabled menu test); 2 new negative tests + budget-guard silent-path test; FAILURE MODES (dead-constant trap, half-wired caps); integration test `test_render_with_65_operators_returns_frame_and_caps_at_64_end_to_end` in existing `test_signal_zmq_integration.py` | 1-7 ✓ |
| P4.2 | 3 (commands missing `--no`/`-x --tb=short`) · 4 (no perf budget for 8-LFO×32-mapping cluster — known thin spot) · 5 (no partial-completion statement) · 6 (no integration test) · 1 (precondition "expect" lines overstated grep output) | Perf budget quantified (cluster ≤0.5ms p95, full modulation slice ≤4.0ms p95 @1000 frames) + perf-marked `test_signal_kentaro_perf.py` with exact `-m perf` command; preconditions corrected to actual grep outputs (lfo.py:7, routing.py:50, operators.ts:66 id-format no-`/` proof, zmq:536) + collision STOP; 3 new negative tests (garbage `lfos`, traversal `source_key`, clamp sweep); FAILURE MODES (values-dropped-on-floor, camelCase leak, no-skip perf rule); integration test `test_render_with_kentaro_cluster_modulates_effect_param_end_to_end`; commands fixed | 1-7 ✓ |
| P4.3 | 3 (command format) · 4 (hysteresis test unquantified) · 5 (reserved-field negatives thin — known thin spot; no partial-completion statement) · 6 (no integration test) · 1 (signature "expects" not matching grep output) | 5 new reserved-field/garbage negative tests (source_track_id log-once + non-string, NaN sensitivity, NaN threshold, trigger_count garbage + monotonicity); hysteresis quantified (exactly 1 transition / 120 frames vs ≥20 without); preconditions corrected (audio_follower.py:8, envelope.py:6, fusion.py:11 + engine.py:41/70) + new-file collision STOP; FAILURE MODES (missing dispatch branch, NotImplementedError half-reserve); integration test `test_render_with_gate_chained_after_lfo_modulates_param_end_to_end`; commands fixed | 1-7 ✓ |
| P4.4 | 1 (local `ls`) · 3 (commands; runtime path not named) · 4 (depth-arc tests qualitative — known thin spot: no visual-state geometry test; "preview modulates" unquantified) · 5 (no partial-completion statement) · 6 (no full-path integration test) | Depth-arc visual-state tests with exact geometry (270°@1.0, 135°@0.5, ±0.5° tolerance, out-of-range clamp, NaN-free `d`); live-runtime step names `~/Development/entropic-v2challenger/frontend` + uat-worktree protocol + ≥10%-of-range-in-2s quantification; E2E integration `kentaro-cluster-roundtrip.spec.ts` (UI→store→IPC→backend→render, ≥10/30 frame-diff); preconditions via `git ls-tree` + fusion-branch:157 + updateOperator/updateMapping greps; pointer-listener-balance negative test; FAILURE MODES (sourceKey dropped, uneditable operator, drag-end-click) | 1-7 ✓ |
| P4.5 | 1 (`test -f` local check) · 3 (commands; runtime path not named) · 4 (rAF cancellation unquantified) · 5 (no negative tests, no partial-completion statement) · 6 (no integration test) | Verdict check via `git show origin/main:` with `grep -c == 1`; rAF gate quantified (scheduled−cancelled==0, 0 callbacks over 5 fake-timer frames); 3 negative/guard tests (zero-operator empty state, >32 assertion tripwire, deterministic layout); perf check quantified (p95 ≤8.0ms, ≤1% dropped) with runtime path named; E2E integration `operator-topology-live-edges.spec.ts` (3-sample animation + unmount DOM assertion); FAILURE MODES (never-wired subscription, never-torn-down loop, verdict fork mismatch) | 1-7 ✓ |
| P4.6 | 2 (no model tier; depends-on listed PR-A informally, omitted P4.3 despite flipping its types) · 3 (commands; runtime path not named) · 4 (cap feedback unquantified) · 5 (no partial-completion statement) · 6 (no integration test) | PR-A formalized as `GATE:PR-A` declared external gate; P4.3 added to depends-on + engine-dispatch precondition grep for all 4 types; caps + toast-store preconditions added; folder test quantified (exactly 10 types: 6/3/1); cap-refusal quantified (1 toast w/ source field, count pinned at 64, ≤1s); rapid-double-drop negative test; live-runtime step with path + 2s/1s timings; E2E integration `browser-op-tab-drag.spec.ts`; FAILURE MODES (mapping-less knob-drop, premature available:true, silent cap no-op) | 1-7 ✓ (still BLOCKED on GATE:PR-A by design) |

Cross-cutting fixes: command conventions block (mandatory `npx --no vitest run`, pytest
`-x --tb=short`, Playwright testDir, Gate-18 runtime-path protocol) added to the
preamble; ground-truth section extended with verified line anchors (engine.py:17/37,
routing.py:50, zmq_server.py:536/547, operators.ts:14/65/66/162/271/285,
OperatorRack.tsx:18/157, limits.ts:8 dead-constant finding, evaluator signature lines,
`test_signal_zmq_integration.py` as the standing integration harness, Playwright
`testDir: tests/e2e`); phase-wide modulation perf budget (≤4.0ms p95 slice / ≤0.5ms
cluster / ≤8ms UI) declared once and referenced by P4.2/P4.4/P4.5; dependency graph
corrected (P4.4→P4.5 edge, P4.1+P4.3+P4.4→P4.6).
