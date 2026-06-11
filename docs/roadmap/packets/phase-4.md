---
title: Phase 4 work packets — PR-C (operators + Kentaro Cluster)
source_spec: docs/roadmap/layout-session/PLAN.md §5 (v1.2)
target_repo: ~/Development/entropic-v2challenger
base: origin/main (verified at d821ae8, 2026-06-11)
authored: 2026-06-11
status: ready-to-execute (P4.6 BLOCKED on PR-A)
---

# Phase 4 — PR-C: Operators surfaced + Kentaro Cluster

Seven one-shottable packets. Execute in dependency order. Every packet branches
from `origin/main` and merges independently (PR-C is delivered as a stack of
small PRs, not one 14-18h monolith).

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

Other verified facts executors rely on:

- Frontend operator store: `frontend/src/renderer/stores/operators.ts` (Zustand, `useOperatorStore`, `addOperator/addMapping/loadOperators/getSerializedOperators`).
- Operator UI dir (plural, exists): `frontend/src/renderer/components/operators/` with `OperatorRack.tsx` (has `TYPE_OPTIONS` with `available` flag), `LFOEditor.tsx`, `ModulationMatrix.tsx`, `RoutingLines.tsx`, etc.
- Backend entry: `backend/src/zmq_server.py:535-567` reads `message.get("operators")`, calls `SignalEngine.evaluate_all(...)` then `apply_modulation(...)`.
- `backend/src/security.py` holds caps as module constants (`MAX_UPLOAD_SIZE`, `MAX_FRAME_COUNT` line 39, `MAX_CHAIN_DEPTH` line 42, `MAX_COMPOSITE_LAYERS` line 48).
- `react-xyflow` / `reactflow` is NOT in `frontend/package.json` — P4.0 decides whether it ever is.
- Frontend tests: vitest, run from `frontend/` via `npx vitest run <path>`; existing operator tests at `frontend/src/__tests__/stores/operators.test.ts`, `frontend/src/__tests__/components/operator-rack.test.tsx`, `modulation-matrix.test.tsx`.
- Backend tests: pytest from `backend/` (`testpaths=["tests"]`, `pythonpath=["src"]`, addopts `-n auto`); existing signal tests `backend/tests/test_signal_*.py`. `perf`-marked tests are deselected by default.
- `_topological_sort` in `engine.py` already walks `parameters.sources[].operator_id` edges for ALL operator types (INJ-2) — Gate (P4.3) gets cycle safety for free.
- Pre-existing quirk (DO NOT FIX in this phase): store default for `step_sequencer.steps` is a CSV string while `engine.py` expects a list. Out of scope.

## Global DO-NOT-TOUCH (applies to every packet)

- `backend/src/modulation/schema.py` (B1/B4-lite lane schema — separate workstream, INJ-5)
- `backend/src/effects/fx/sidechain_*.py` (video *effects* named sidechain; unrelated to the sidechain *operator*)
- `frontend/src/renderer/stores/timeline.ts`, `project.ts` (PR-zero per-track chain model — landed, frozen)
- `openspec/changes/**` (parallel session's workflow artifacts)
- Anything under `frontend/src/renderer/components/effects/EffectBrowser.tsx` except in P4.6
- No schema/data migrations, ever. No `.glitch` format version bumps in this phase.

## Dependency graph

```
P4.0 (spike) ──────────────┐
P4.1 (types+caps) ─┬─ P4.2 (kentaro backend) ─┬─ P4.4 (kentaro UI)
                   │                          └─ P4.5 (topology graph, also needs P4.0)
                   └─ P4.3 (sidechain/gate/stutter backend)
PR-A (NOT MERGED) ──── P4.6 (browser op tab)  [BLOCKED]
```

---

## P4.0 — Prototype gate: react-xyflow 32-path @ 60fps  `RISK:HIGH`

- **ID:** P4.0
- **Branch:** `spike/p4-0-xyflow-32path-gate`
- **Base:** `origin/main`
- **Depends-on:** none
- **Goal:** Produce a measured PASS/FAIL verdict on react-xyflow rendering 32 animated SVG paths at 60fps with <8ms scripting+render frame time, so P4.5 knows whether to take the react-xyflow dependency or build bare SVG + rAF batching.
- **Size:** ~2h (PLAN says 30-min prototype; budget includes harness + measurement + writeup)
- **RISK:HIGH because:** the verdict requires judgment about measurement methodology (what counts as "frame time", warm-up exclusion, Electron vs Chrome variance). Assign a stronger model.

### PRECONDITIONS (run first; if mismatch → STOP and report, do not improvise)

```bash
cd ~/Development/entropic-v2challenger
git fetch origin && git log origin/main -1 --oneline        # any SHA ≥ d821ae8 is fine
grep -c "xyflow\|reactflow" frontend/package.json            # expect: 0 (no existing dep)
ls docs/ | head                                              # confirm docs/ dir exists for the result artifact
```

If `frontend/package.json` already contains xyflow/reactflow → STOP: someone pre-empted this gate; report which packet/PR added it.

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
4. Drive animation with `requestAnimationFrame`; instrument with `performance.now()` per frame over a 10-second run after a 2-second warm-up; record p50/p95/max frame time. Cross-check with Chrome DevTools Performance trace (scripting+rendering per frame).
5. Repeat the identical animation with a bare-SVG control implementation (no xyflow, same 32 paths, rAF batching) for a comparison baseline.
6. Write `docs/perf/p4-xyflow-gate-result.md`: environment (machine, Electron/Chrome version), methodology, p50/p95/max for both implementations, verdict line: `VERDICT: PASS (use react-xyflow)` or `VERDICT: FAIL (bare SVG fallback)`. Pass criterion: **p95 frame time < 8ms at 60fps with 32 paths animating**.
7. Open PR containing ONLY `docs/perf/p4-xyflow-gate-result.md` (cherry-pick the doc onto a clean branch; the spike harness + dep stay on the spike branch, referenced by SHA in the doc).

### TEST PLAN

No vitest/pytest — this is a measurement spike. The "test" is the measurement protocol in steps 4-5. Numbers without a DevTools trace screenshot or a captured rAF-delta histogram = not evidence.

### ACCEPTANCE GATES

- [ ] `docs/perf/p4-xyflow-gate-result.md` exists on the PR and contains a single unambiguous `VERDICT:` line plus p50/p95/max numbers for BOTH implementations.
- [ ] Merged PR diff touches ONLY `docs/perf/` (verify: `git diff origin/main --stat` shows 1 file).
- [ ] Spike branch pushed (not deleted) so P4.5 can reuse the harness.

### ROLLBACK

Revert the doc PR. No migrations. Spike branch is throwaway by design.

### EVIDENCE required in PR body

Verdict line, p50/p95/max table, exact `@xyflow/react` version tested, link/SHA of spike branch, screenshot or pasted histogram of frame-time distribution.

---

## P4.1 — OperatorType union extension + caps + render-budget guard

- **ID:** P4.1
- **Branch:** `feat/p4-1-operator-types-and-caps`
- **Base:** `origin/main`
- **Depends-on:** none
- **Goal:** Extend `OperatorType` with `'kentaroCluster' | 'sidechain' | 'gate' | 'midiEnvStutter'` (visible but `available: false` in UI), add `MAX_OPERATORS_PER_PROJECT = 64` + 32-mappings-per-operator caps on both sides of the IPC boundary, and add the 16ms render-budget guard to `SignalEngine.evaluate_all`.
- **Size:** ~3-4h

### PRECONDITIONS (run first; if mismatch → STOP and report)

```bash
cd ~/Development/entropic-v2challenger && git fetch origin
git grep -n "export type OperatorType" origin/main -- frontend/src/shared/types.ts
# expect: types.ts:388:export type OperatorType = 'lfo' | 'envelope' | 'video_analyzer' | 'audio_follower' | 'step_sequencer' | 'fusion';
git grep -n "MAX_OPERATORS" origin/main -- backend/src/modulation/engine.py
# expect: MAX_OPERATORS = 16
git grep -n "MAX_OPERATORS_PER_PROJECT" origin/main -- backend/src/
# expect: NO matches (constant does not exist yet)
git grep -n "addMapping" origin/main -- frontend/src/renderer/stores/operators.ts | head -2
# expect: interface line (~50) + implementation — confirm no cap currently enforced
git grep -n "TYPE_OPTIONS" origin/main -- frontend/src/renderer/components/operators/OperatorRack.tsx
# expect: line 18: const TYPE_OPTIONS: { type: OperatorType; label: string; available: boolean }[]
```

If `kentaroCluster` already appears anywhere in `frontend/src` or `backend/src` → STOP (parallel session collision).

### Scope checklist (verified paths)

- [ ] `frontend/src/shared/types.ts` — extend `OperatorType` union (line 388)
- [ ] `frontend/src/renderer/stores/operators.ts` — `createDefaultOperator`: add defaults + labels for the 4 new types (the `Record<OperatorType, …>` maps are exhaustive and will fail typecheck until you do); cap `addOperator` at `MAX_OPERATORS_PER_PROJECT` (64); cap `addMapping` at 32 mappings per operator (no-op + `console.warn` when at cap); `loadOperators` clamps `mappings` arrays to 32
- [ ] `frontend/src/shared/constants.ts` OR nearest existing shared-constants module — `MAX_OPERATORS_PER_PROJECT = 64`, `MAX_MAPPINGS_PER_OPERATOR = 32` (grep `git grep -l "export const MAX" origin/main -- frontend/src/shared/` first; create `frontend/src/shared/operatorLimits.ts` only if no shared constants file exists)
- [ ] `frontend/src/renderer/components/operators/OperatorRack.tsx` — append 4 entries to `TYPE_OPTIONS` with `available: false` (UI lands in P4.4/P4.6)
- [ ] `backend/src/security.py` — `MAX_OPERATORS_PER_PROJECT = 64` constant + comment citing qa-redteam M2
- [ ] `backend/src/modulation/engine.py` — replace `MAX_OPERATORS = 16` with import of `MAX_OPERATORS_PER_PROJECT` from security (or set to 64 with a cross-reference comment if the import crosses a layering boundary — check how other modules import security first: `git grep -n "from security import\|import security" origin/main -- backend/src/`); add render-budget guard: wrap the operator loop in `time.perf_counter()`, if total eval > 16ms log `logger.warning` once per second (rate-limited) and set a degrade flag that skips `video_analyzer` proxies on the next frame (cheapest meaningful degrade; document choice in code comment)
- [ ] `backend/src/modulation/routing.py` — `resolve_routings`: per-operator `mappings` slice `[:32]` (defense in depth; frontend already caps)
- [ ] Tests (see TEST PLAN)

### DO-NOT-TOUCH

Global list. Plus: do not implement any evaluator for the new types (engine's `else: value = 0.0` branch already handles unknown types gracefully — verified at engine.py dispatch tail); do not touch `ModulationMatrix.tsx`; do not change `_topological_sort`.

### Implementation steps

1. Branch. Extend the union in `types.ts`.
2. Run `cd frontend && npx tsc -b` — collect every exhaustiveness error; those errors ARE the checklist of `Record<OperatorType,…>` sites to update (known: `createDefaultOperator` defaults + labels in `operators.ts`; possibly icon/color maps — fix whatever typecheck surfaces, nothing more).
3. Defaults for new types (placeholders; refined by P4.2/P4.3): `kentaroCluster: { lfo_count: 8, master_rate_hz: 1.0, master_depth: 1.0, bpm_sync: false }`, `sidechain: { source_track_id: '', sensitivity: 1.4 }`, `gate: { threshold: 0.5, sources: '' }`, `midiEnvStutter: { attack: 5, decay: 10, sustain: 0.5, release: 15, trigger_count: 0 }`.
4. Add caps in store actions + constants module. `addOperator` past 64 → no-op with warn. `addMapping` past 32 → no-op with warn.
5. Backend: security constant, engine cap reconcile (16 → 64), routing `[:32]`, budget guard.
6. Run full test suites (below). Typecheck must be clean.

### TEST PLAN

New test files (behavior keywords in titles):

- `frontend/src/__tests__/stores/operators-caps.test.ts`
  - `it('addOperator refuses the 65th operator (MAX_OPERATORS_PER_PROJECT=64)')`
  - `it('addMapping refuses the 33rd mapping per operator (32-mapping cap)')`
  - `it('loadOperators clamps oversized mappings arrays to 32 entries')`
  - `it('addOperator creates valid defaults for kentaroCluster, sidechain, gate, midiEnvStutter')`
- `backend/tests/test_signal_operator_caps.py`
  - `test_evaluate_all_caps_at_64_operators_not_16`
  - `test_resolve_routings_ignores_mappings_beyond_32_per_operator`
  - `test_unknown_operator_type_evaluates_to_zero_without_crash`
  - `test_render_budget_guard_warns_when_eval_exceeds_16ms` (monkeypatch a slow evaluator)

Commands (all must pass):

```bash
cd ~/Development/entropic-v2challenger/frontend
npx tsc -b
npx vitest run src/__tests__/stores/operators-caps.test.ts src/__tests__/stores/operators.test.ts src/__tests__/stores/operators-persistence.test.ts src/__tests__/components/operator-rack.test.tsx
cd ../backend
python -m pytest tests/test_signal_operator_caps.py tests/test_signal_engine.py tests/test_signal_engine_toposort.py -q
```

### ACCEPTANCE GATES

- [ ] `npx tsc -b` clean (proves union extension propagated to every exhaustive map).
- [ ] All commands above green; zero existing-test regressions (`npx vitest run` full suite as final check).
- [ ] `git grep -n "MAX_OPERATORS = 16"` returns nothing on the branch.
- [ ] New types appear in `TYPE_OPTIONS` with `available: false` — manually confirm the Add-Operator menu does NOT offer them yet.

### ROLLBACK

Revert the PR. No migrations. Projects saved with new-type operators before revert would fail `loadOperators` type-filter silently (acceptable: no user base).

### EVIDENCE required in PR body

Paste: `tsc -b` exit 0, vitest summary line, pytest summary line, `git grep MAX_OPERATORS_PER_PROJECT` output showing both frontend + backend constants.

---

## P4.2 — Kentaro Cluster backend evaluator (8-LFO)  `RISK:HIGH`

- **ID:** P4.2
- **Branch:** `feat/p4-2-kentaro-cluster-backend`
- **Base:** `origin/main` (after P4.1 merges)
- **Depends-on:** P4.1
- **Goal:** Implement the `kentaroCluster` operator in the backend — up to 8 independent LFOs sharing master rate/depth/BPM-sync/phase-reset, each LFO individually routable — and wire it into `SignalEngine.evaluate_all` + `resolve_routings`.
- **Size:** ~4h
- **RISK:HIGH because:** `operator_values` is `dict[op_id -> float]` (one scalar per operator) and `resolve_routings` reads `operator_values.get(op_id)`. Per-LFO routing requires a sub-key scheme + an optional mapping field. This is a real design extension, not paint-by-numbers.

### PRECONDITIONS (run first; if mismatch → STOP and report)

```bash
cd ~/Development/entropic-v2challenger && git fetch origin
git grep -n "kentaroCluster" origin/main -- frontend/src/shared/types.ts
# expect: 1 match in the OperatorType union (P4.1 merged). If 0 matches → STOP: P4.1 not landed.
git grep -n "def evaluate_lfo" origin/main -- backend/src/modulation/lfo.py
# expect: evaluate_lfo(waveform, rate_hz, phase_offset, frame_index, fps, state_in) -> tuple[float, dict]
git grep -n "signal = operator_values.get(op_id" origin/main -- backend/src/modulation/routing.py
# expect: 1 match (the read site you will extend)
ls backend/src/modulation/kentaro_cluster.py 2>/dev/null
# expect: file does NOT exist
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
  - `test_lfo_count_clamped_between_2_and_8`
  - `test_master_depth_scales_all_lfo_outputs`
  - `test_bpm_sync_converts_beat_rate_to_hz_using_bpm`
  - `test_phase_reset_counter_restarts_all_lfo_phases`
  - `test_nan_inf_master_rate_yields_zero_not_crash`
  - `test_engine_exposes_subkey_values_for_each_lfo` (via `evaluate_all`)
- `backend/tests/test_signal_routing_source_key.py`
  - `test_mapping_with_source_key_reads_sub_lfo_value`
  - `test_mapping_without_source_key_unchanged_legacy_behavior`
  - `test_unknown_source_key_contributes_zero`
- `frontend/src/__tests__/stores/operators-kentaro-serialization.test.ts`
  - `it('serializes mapping sourceKey as snake_case source_key')`
  - `it('omits source_key when mapping has no sourceKey')`

Commands:

```bash
cd ~/Development/entropic-v2challenger/backend
python -m pytest tests/test_signal_kentaro_cluster.py tests/test_signal_routing_source_key.py tests/test_signal_engine.py tests/test_signal_engine_toposort.py -q
cd ../frontend
npx tsc -b && npx vitest run src/__tests__/stores/operators-kentaro-serialization.test.ts src/__tests__/stores/operators.test.ts
```

### ACCEPTANCE GATES

- [ ] All commands green; full `python -m pytest -q` (backend) shows zero regressions.
- [ ] A kentaroCluster op with 8 LFOs at distinct rates produces 8 distinct sub-values at frame 30 (assert in test, paste output).
- [ ] Legacy routing behavior byte-identical: existing `test_signal_engine.py` passes unmodified.

### ROLLBACK

Revert the PR. `source_key` is optional on the wire — projects saved with it load fine after revert (unknown mapping keys are ignored by the older reader; confirm in PR body by running `loadOperators` filter against a fixture).

### EVIDENCE required in PR body

pytest + vitest summary lines, pasted assertion output of the 8-distinct-values test, one-paragraph design note on the `op_id/lfoN` sub-key scheme (this becomes the reference for P4.4/P4.5).

---

## P4.3 — Sidechain, Gate, MIDI Envelope Stutter backend evaluators  `RISK:HIGH`

- **ID:** P4.3
- **Branch:** `feat/p4-3-simple-operators-backend`
- **Base:** `origin/main` (after P4.2 merges — serializes engine.py edits)
- **Depends-on:** P4.1, P4.2 (merge-order only, to avoid engine.py dispatch conflicts)
- **Goal:** Implement the three remaining PLAN §5.5 operators in `backend/src/modulation/` and wire them into the engine dispatch.
- **Size:** ~3-4h
- **RISK:HIGH because:** two design judgments — (a) sidechain "source track's audio" but `evaluate_all` receives ONE `audio_pcm` (the project audio); per-track PCM does not reach the modulation engine today, so v1 must scope to project-audio amplitude with `source_track_id` reserved, and that descope must be stated, not hidden; (b) midiEnvStutter retriggering: backend has no MIDI runtime — the frontend must signal retriggers via a monotonically increasing `trigger_count` param.

### PRECONDITIONS (run first; if mismatch → STOP and report)

```bash
cd ~/Development/entropic-v2challenger && git fetch origin
git grep -n "kentaroCluster" origin/main -- backend/src/modulation/engine.py
# expect: ≥1 match (P4.2 merged). 0 → STOP.
git grep -n "def evaluate_audio" origin/main -- backend/src/modulation/audio_follower.py
# expect: signature with (pcm, method, params, sample_rate, state_in)
git grep -n "def evaluate_envelope" origin/main -- backend/src/modulation/envelope.py
# expect: signature with (trigger, attack, decay, sustain, release, frame_index, state_in)
git grep -n "parameters.sources\|operator_id" origin/main -- backend/src/modulation/engine.py | head -3
# expect: toposort walks params['sources'][].operator_id — gate's upstream reads are cycle-safe for free
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
  - `test_sidechain_with_no_audio_pcm_outputs_zero`
  - `test_sidechain_source_track_id_accepted_but_does_not_crash`
- `backend/tests/test_signal_gate.py`
  - `test_gate_outputs_one_when_source_operator_above_threshold`
  - `test_gate_outputs_zero_when_source_below_threshold`
  - `test_gate_hysteresis_prevents_flutter_around_threshold`
  - `test_gate_with_missing_source_outputs_zero`
  - `test_gate_after_lfo_in_toposort_reads_current_frame_value` (via `evaluate_all` — declares gate BEFORE its source lfo in the list; toposort must still order lfo first)
- `backend/tests/test_signal_midi_env_stutter.py`
  - `test_trigger_count_increment_retriggers_envelope_attack`
  - `test_unchanged_trigger_count_continues_envelope_phase`
  - `test_adsr_shape_matches_envelope_operator_for_single_trigger`

Commands:

```bash
cd ~/Development/entropic-v2challenger/backend
python -m pytest tests/test_signal_sidechain.py tests/test_signal_gate.py tests/test_signal_midi_env_stutter.py -q
python -m pytest -q   # full suite, zero regressions
```

### ACCEPTANCE GATES

- [ ] All listed tests green + full backend suite green.
- [ ] `test_gate_after_lfo_in_toposort_reads_current_frame_value` proves cycle-safe ordering came free from INJ-2 toposort (paste output).
- [ ] PR body states the sidechain v1 descope (project audio, not per-track) and the midiEnvStutter frontend-wiring gap explicitly.

### ROLLBACK

Revert the PR. New op types degrade to `value = 0.0` via the engine's else-branch for any project that referenced them.

### EVIDENCE required in PR body

pytest summary lines (targeted + full), descope statement, toposort test output.

---

## P4.4 — Kentaro Cluster UI: editor + per-destination depth arcs  `RISK:HIGH`

- **ID:** P4.4
- **Branch:** `feat/p4-4-kentaro-cluster-ui`
- **Base:** `origin/main` (after P4.2 merges)
- **Depends-on:** P4.1, P4.2
- **Goal:** Ship `OperatorKentaroCluster.tsx` (8-LFO direct-manipulation editor, Madrona Labs Aalto reference) and `OperatorDepthArc.tsx` (Bitwig-style colored arc around target knobs, color-matched per source LFO), and flip `kentaroCluster` to `available: true` in `OperatorRack`.
- **Size:** ~4h
- **RISK:HIGH because:** direct-manipulation canvas/SVG interaction — CLAUDE.md Rule 1.5 / Research Gate applies (drag-to-sculpt waveform overlays, pointer-event layering). Assign a stronger model; the reference-implementation citation MUST appear in the file header.

### PRECONDITIONS (run first; if mismatch → STOP and report)

```bash
cd ~/Development/entropic-v2challenger && git fetch origin
git grep -n "kentaroCluster" origin/main -- backend/src/modulation/engine.py frontend/src/shared/types.ts
# expect: matches in BOTH (P4.1+P4.2 merged). Missing either → STOP.
git grep -n "sourceKey" origin/main -- frontend/src/shared/types.ts
# expect: 1 match on OperatorMapping (P4.2). 0 → STOP.
ls frontend/src/renderer/components/operators/
# expect: AudioFollowerEditor.tsx EnvelopeEditor.tsx FusionEditor.tsx LFOEditor.tsx ModulationMatrix.tsx OperatorRack.tsx RoutingLines.tsx StepSequencerEditor.tsx VideoAnalyzerEditor.tsx — and NO OperatorKentaroCluster.tsx
git grep -n "available: false" origin/main -- frontend/src/renderer/components/operators/OperatorRack.tsx | grep -i kentaro
# expect: 1 match
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
  - `it('clamps lfo_count input between 2 and 8')`
  - `it('master depth slider updates operator parameters in the store')`
  - `it('per-LFO target mapping creates a mapping with the correct sourceKey')`
  - `it('loads a legacy kentaroCluster operator with missing lfos param without crashing')`
- `frontend/src/__tests__/components/operator-depth-arc.test.tsx`
  - `it('arc sweep angle is proportional to depth')`
  - `it('arc color matches the source LFO color prop')`
  - `it('depth zero renders an empty arc not a NaN path')`

Commands:

```bash
cd ~/Development/entropic-v2challenger/frontend
npx tsc -b
npx vitest run src/__tests__/components/operator-kentaro-cluster.test.tsx src/__tests__/components/operator-depth-arc.test.tsx src/__tests__/components/operator-rack.test.tsx src/__tests__/components/modulation-matrix.test.tsx
npx vitest run   # full suite
```

### ACCEPTANCE GATES

- [ ] All commands green, zero regressions.
- [ ] Reference-implementation citation present in `OperatorKentaroCluster.tsx` header (grep it, paste in PR).
- [ ] Live runtime check (CLAUDE.md Gate 18): launch the app, add a Kentaro Cluster from the rack menu, drag a depth, confirm preview modulates. Name the runtime path in the PR body.
- [ ] `sidechain/gate/midiEnvStutter` still `available: false` (grep proof).

### ROLLBACK

Revert the PR. Flip `available` back implicitly via revert; saved projects containing cluster ops still load (type exists since P4.1, backend since P4.2).

### EVIDENCE required in PR body

tsc + vitest summaries, header-citation grep output, screenshot or screen recording of the editor modulating a param in the live app, runtime path named.

---

## P4.5 — Operator topology graph (xyflow or bare-SVG per P4.0 verdict)  `RISK:HIGH`

- **ID:** P4.5
- **Branch:** `feat/p4-5-operator-topology-graph`
- **Base:** `origin/main` (after P4.2 + P4.4 merge)
- **Depends-on:** P4.0 (verdict), P4.2, P4.4 (reuses `OperatorDepthArc`)
- **Goal:** Render the operator-routing topology (operators → mappings → effect params, ≤32 animated `<path>` edges, transform-only animation) as `OperatorTopologyGraph.tsx`, mounted in `OperatorRack` (device-chain tile placement moves to PR-A's shell later — that re-mount is PR-A scope, not yours).
- **Size:** ~4h
- **RISK:HIGH because:** 60fps animation budget, layout algorithm judgment, and the implementation forks on P4.0's verdict.

### PRECONDITIONS (run first; if mismatch → STOP and report)

```bash
cd ~/Development/entropic-v2challenger && git fetch origin
test -f docs/perf/p4-xyflow-gate-result.md && grep -n "VERDICT:" docs/perf/p4-xyflow-gate-result.md
# expect: exactly one VERDICT: PASS or VERDICT: FAIL line. Missing file → STOP: run P4.0 first.
git grep -n "OperatorDepthArc" origin/main -- frontend/src/renderer/components/operators/
# expect: ≥1 match (P4.4 merged). 0 → STOP.
git grep -n "xyflow" origin/main -- frontend/package.json
# expect: dep presence CONSISTENT WITH THE VERDICT DOC (not a hard 0-matches check):
#   VERDICT: FAIL → 0 matches required; VERDICT: PASS → 0 matches (this packet adds the dep) OR already
#   present if a prior PASS-branch packet landed it. Dep present despite VERDICT: FAIL → STOP and report.
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
  - `it('collapsed section unmounts the graph and cancels the animation frame loop')`
  - `it('kentaroCluster mappings with sourceKey render as distinct edges per sub-LFO')`

Commands:

```bash
cd ~/Development/entropic-v2challenger/frontend
npx tsc -b
npx vitest run src/__tests__/components/operator-topology-graph.test.tsx src/__tests__/components/operator-rack.test.tsx
npx vitest run   # full suite
```

Manual perf check (required, not automatable in vitest): live app, 8 operators / 32 mappings fixture project, DevTools Performance trace while playing — p95 frame scripting+render < 8ms. Paste trace summary in PR.

### ACCEPTANCE GATES

- [ ] All vitest green, zero regressions, tsc clean.
- [ ] Manual perf trace pasted, p95 < 8ms with 32 animated paths.
- [ ] `package.json` diff matches the P4.0 verdict (dep added ⟺ PASS).
- [ ] rAF loop provably cancelled on unmount (test above green + no console warnings in live run).

### ROLLBACK

Revert the PR (also reverts the dep if added). Graph is presentation-only; no persisted state.

### EVIDENCE required in PR body

VERDICT line quoted from gate doc, vitest/tsc summaries, perf-trace screenshot, live runtime path named (Gate 18).

---

## P4.6 — Browser `op` tab + drag-to-add  `BLOCKED — depends on PR-A`  `RISK:HIGH`

- **ID:** P4.6
- **Branch:** `feat/p4-6-browser-op-tab`
- **Base:** `origin/main` (after PR-A merges — NOT mergeable today)
- **Depends-on:** **PR-A (5-tab browser shell + `F_CREATRIX_LAYOUT` flag — NOT on origin/main as of d821ae8)**, P4.1, P4.4
- **Goal:** Surface operators in the browser's `op` tab (folders: MODULATION / INPUTS / GATING, implemented types only) with drag-onto-track-header (adds operator) and drag-onto-param-knob (adds operator + auto-mapping at depth 1.0).
- **Size:** ~4h
- **RISK:HIGH because:** drag-and-drop across panels (Research Gate: study existing drag handling in `EffectBrowser.tsx` first; HTML5 DnD vs pointer-event judgment) and because the PR-A surface it lands on does not exist yet — scope below is written against PLAN §3/§5.6 and MUST be re-verified against the merged PR-A code.

### PRECONDITIONS (run first; if ANY mismatch → STOP and report — this is the expected outcome until PR-A lands)

```bash
cd ~/Development/entropic-v2challenger && git fetch origin
git grep -rn "F_CREATRIX_LAYOUT" origin/main -- frontend/src | head -3
# expect: ≥1 match (PR-A merged). AS OF 2026-06-11 THIS RETURNS 0 → STOP. Do not improvise a tab system.
git grep -n "Tab" origin/main -- frontend/src/renderer/components/effects/EffectBrowser.tsx | head -5
# expect: tab structure exists (PR-A). As of d821ae8: 0 matches → STOP.
git grep -n "available: true" origin/main -- frontend/src/renderer/components/operators/OperatorRack.tsx | grep -i kentaro
# expect: 1 match (P4.4 merged)
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
  - `it('op tab lists only implemented operator types grouped by MODULATION INPUTS GATING folders')`
  - `it('drop on track header adds an operator of the dragged type')`
  - `it('drop on a param knob adds operator plus auto-mapping at depth 1.0 linear')`
  - `it('drop is refused with feedback when operator count is at the 64 cap')`
  - `it('drop on an invalid target is a no-op without console errors')`

Commands:

```bash
cd ~/Development/entropic-v2challenger/frontend
npx tsc -b
npx vitest run src/__tests__/components/browser-op-tab.test.tsx src/__tests__/components/operator-rack.test.tsx
npx vitest run   # full suite
```

### ACCEPTANCE GATES

- [ ] All green, zero regressions, tsc clean.
- [ ] Live runtime check (Gate 18): drag Kentaro Cluster onto a param knob in the running app; preview modulates immediately. Runtime path named in PR.
- [ ] All 4 new operator types now `available: true` (grep proof).
- [ ] Cap-refusal feedback demonstrated (recording or screenshot).

### ROLLBACK

Revert the PR. Tab disappears; operators remain addable via OperatorRack menu (P4.4 path unaffected).

### EVIDENCE required in PR body

tsc/vitest summaries, drag-to-knob recording, cap-refusal proof, note confirming PR-A's DnD mechanism was reused (cite file/line).

---

## Execution notes for the dispatcher

- **Parallelizable now:** P4.0, P4.1 (disjoint files). P4.2 next; then P4.3 ∥ P4.4; then P4.5. P4.6 sits in the blocked queue until PR-A merges.
- **Model routing:** P4.0, P4.2, P4.3, P4.4, P4.5, P4.6 are RISK:HIGH (stronger model). P4.1 is mechanical (standard model fine).
- **Every PR:** branch from fresh `origin/main`, `gh pr create` with the EVIDENCE section filled, squash-merge, no migrations anywhere in this phase.
- **Estimate check:** P4.1–P4.6 sum ≈ 18-22h vs PLAN's 14-18h — the overage is the per-packet test files PLAN lumped into one ~700-line row. Acceptable; flag to roadmap owner if budget matters.
