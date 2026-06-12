# Phase 5b Work Packets — Instruments B6→B10 + Gate Cherry-Picks (SG-3 / SG-5 / SG-8-wiring)

**Authored:** 2026-06-11 · **Base:** `origin/main` @ `d821ae8` (PR #166, 2026-06-05)
**Sources:** `docs/roadmap/layout-session/INSTRUMENTS-BUILD-PLAN.md` (B6–B10 designs) · `docs/roadmap/specs/entropic-spec-3-safety-gates.md` (SG contracts) · `docs/roadmap/specs/entropic-spec-2-b4lite-schema.md` (B9 schema) · `docs/roadmap/ROADMAP.md` (status ledger)
**Repo:** `~/Development/entropic-v2challenger/` (github `nissimdirect/entropic-v2challenger`)

---

## 0. Global rules (apply to every packet)

### 0.1 Ground truth verified 2026-06-11 against `origin/main` @ `d821ae8`

| Artifact | Status (VERIFIED) |
|---|---|
| `frontend/src/shared/axis-binding.ts` | ✅ shipped in #148 — `Axis`, 8-member `BindingRule`, `LaneAxisBinding`, `TIER_1_BINDING_RULES = ['broadcast']`, `ALL_BINDING_RULES`, `ALL_AXES`, local `InterpolationMode` |
| `backend/src/modulation/engine.py` | ✅ — `ModulationCycleError` (line 20), `_topological_sort(list[dict])` reading `parameters.sources` raises on cycle (line 98); caller catches + degrades to declaration order (lines 138–141, comment says "SG-5 will replace") |
| `backend/src/safety/pressure/` | ✅ SG-8 **lib** merged #161 — `monitor.py` (`PressureMonitor.start/stop/tick_once`), `registry.py` (`FeatureRegistry.register/fire_degrade/fire_restore`, `global_registry()`), `budget.py`, `degrade_order.py`. **Zero callers in `zmq_server.py`/`main.py` (grep verified) — live wiring unbuilt** |
| `backend/src/safety/gpu_resources.py` | ✅ SG-1 lib merged #163 — `GPUResource` protocol, pools, `MockGPUResource`; real Metal binding deferred |
| `backend/src/safety/latent_sentinel.py` | ❌ NOT on main — exists only in draft worktree `~/Development/entropic-q7-sg3` (branch `feat/q7-sg3-sentinel`, commit `8853d63`, PR #133) |
| `backend/src/safety/cycle_detection.py` | ❌ NOT on main — draft worktree `~/Development/entropic-q7-sg5` (branch `feat/q7-sg5-cycle-detection`, commit `f877439`, PR #144). **Imports `inspector.routing_graph` which is ALSO not on main** (commit `2d2ac79`, PR #142) |
| `backend/src/security.py` | ✅ — `MAX_UPLOAD_SIZE` (l.9), `MAX_FRAME_COUNT` (l.39), `MAX_CHAIN_DEPTH` (l.42), `MAX_COMPOSITE_LAYERS` (l.48, INJ-3). **No** `MAX_GRAINS` / `MAX_FRAMEBANK_SLOTS` / `MAX_TOTAL_VOICES_PER_RENDER` / `MAX_MACRO_EDGES_TOTAL` (P5a.11) / `MAX_MOD_EDGES_TOTAL` (P5b.21) yet |
| `backend/src/zmq_server.py` | ✅ — `_handle_render_composite` (l.707), `_get_composite_states` (l.669), `_save_composite_states` (l.698), `_max_readers = 10` (l.75), `EXPERIMENTAL_AUDIO_TRACKS` (l.52) |
| `backend/src/engine/` | ✅ — `pipeline.py`, `compositor.py`, `export.py`, `determinism.py`, `freeze.py`, `cache.py`, `guards.py` |
| `backend/src/project/schema.py` | ✅ exists (load-time validation mirror lives here) |
| `frontend/src/shared/types.ts` | ⚠️ `Track.type` includes `"performance"` (l.59) BUT `AutomationLane` (l.261) **still has `isTrigger`** and `OperatorMapping` (l.401) is the **old shape** (`targetEffectId`/`targetParamKey`/`depth`/`min`/`max`/`curve`/`blendMode` — **no axis fields**). PR-B slices #157/#158 are open, unmerged |
| B1 sampler | ✅ — `frontend/src/renderer/components/instruments/{InstrumentsPanel,SamplerDevice,buildSamplerLayer,computeSamplerVoice,types,index}.tsx/ts` + `stores/instruments.ts` |
| Performance/MIDI surface | ✅ — `stores/{performance,midi,freeze}.ts` (`panicAll` at performance.ts:66/155; `learnTarget` learn mode in midi.ts; `FreezeOp = 'idle'\|'freezing'\|'unfreezing'\|'flattening'` with `operationState` guard in freeze.ts), `components/performance/{MIDILearnOverlay,MIDISettings,PadGrid,PadEditor,PadCell,padActions,applyCCModulations,applyPadModulations,computeADSR}.ts(x)`, `hooks/useMIDI.ts`, `shared/midi-utils.ts`. **`padActions.ts:25,45` still calls `performance.now()`** (B10 determinism violation to fix) |
| Existing granulators | ⚠️ namespace collision hazard — `backend/src/effects/fx/granulator.py` and `backend/src/effects/spectral/{granulator,spectral_granulator}.py` are **effects**, not the B8 instrument. B8 modules must use a distinct name (`backend/src/instruments/granulator_instrument.py` or similar) |
| morphlab (B7 source) | ⚠️ **NOT at `~/Development/morphlab*`** — lives at **`~/Development/livephoto/`**: `rife_arch.py` (vendored IFNet), `engines.py` (downloads `rife49.pth`/`rife47.pth` from `github.com/Fannovel16/ComfyUI-Frame-Interpolation` releases; `DEFAULT_RIFE_MODEL="rife49.pth"`; `torch.load(..., weights_only=True)`), `morphlab_core.py` (`MAX_RESOLUTION = 1920` RIFE safety cap) |
| `backend/tests/test_q7_benchmark/` | ✅ exists on main (e.g. `test_pressure.py`) — cherry-picked q7 test files land in an existing dir |

### 0.2 CRITICAL cherry-pick rule (RISK:HIGH — applies to P5b.3, P5b.6)

Parked q7 draft branches have **stale merge-bases** (~10+ behind main at park time). A raw `git merge` of these branches **falsely reverts later-merged work** (see `memory/feedback_cherry-pick-stale-scaffold-branches.md`; this exact hazard hit the #117–#145 scaffolds). Every cherry-pick packet MUST:

1. Enumerate the payload: `git log --oneline origin/main..<branch>` — identify the SPECIFIC commit(s) that carry the payload, never the whole branch.
2. Verify payload files are new-namespace: `git show --stat <sha>` — every file must be NEW (not modifying files that exist on main). If any payload file modifies a main-tracked file → STOP, escalate.
3. Cherry-pick onto a FRESH branch cut from `origin/main` — never merge, never rebase the draft branch.
4. Run the payload's own test file plus the full backend suite before opening a PR.

### 0.3 Test commands (from repo CLAUDE.md)

```bash
# backend:        cd backend && python -m pytest -x -n auto --tb=short
# backend single: cd backend && python -m pytest tests/test_<name>.py -x --tb=short
# frontend unit:  cd frontend && npx --no vitest run        # MUST use --no
# frontend E2E:   cd frontend && npx playwright test
```

### 0.4 Universal OUT-gates (every packet, in addition to its own gates)

1. Tests green at the right layer (Vitest / Playwright / pytest).
2. Every numeric crossing IPC clamped + finite-guarded (`feedback_numeric-trust-boundary`).
3. No backend cap left as a frontend-only convention.
4. Determinism gates are **EXPORT-PATH only**. (Corrected 2026-06-11 vs origin/main: the old `Date.now()` preview seeds at `App.tsx:840/857` are GONE — preview now uses the reactive project-store seed, HT-4, `App.tsx:153–156`. The export path remains the only surface we assert byte-identity against; never gate on preview-path byte-identity.)
5. Each packet = its own branch + its own PR (small, reviewable; per SPEC-3 §9 "bundling gates with feature work increases blast radius"). Exception, pre-decided: **P5b.21 + P5b.22 ship as ONE PR** (SPEC-6 Lint-3 lockstep).

### 0.7 Single ownership of safety-gate work

**SG-3 / SG-5 / SG-8 implementation lives HERE (P5b.1–P5b.8) and nowhere else.** `packets/phase-7.md` P7.6 and P7.7a/b/c are VERIFY-ONLY stubs that grep main for these packets' artifacts. Canonical design decisions (this file wins on divergence): SG-8 uses a **poll model** with a `pressure_status` REQ/REP handler (no push channel exists on main); SG-3's per-backbone ceiling table is named **`MAX_L2_NORM_PER_BACKBONE`**; SG-3 frontend toast source is **`sg3-sentinel`** (SG-8's is `sg8-pressure`); the `lane_aborted` abort signal rides the **render reply** (REQ/REP), not a push event.

### 0.5 Rollback (universal)

Every packet ships on its own branch. Pre-merge rollback = close PR, delete branch. Post-merge rollback = `git revert -m 1 <merge-sha>` of the squash commit (all packets are additive-or-localized; packets that touch shared files list per-file rollback notes inline).

### 0.6 Phase-5a dependency note

B6/B8 depend on B5 (grouping), B10 depends on B2 (voice spine) + B4 (rack) — **none of which exist on main today** (ROADMAP Phase 5: B2-lite in flight #167; B3/B4/B5 ❌). The B-instrument packets below carry explicit STOP preconditions that probe for Phase-5a deliverables by their spec-named identifiers (`MAX_TOTAL_VOICES_PER_RENDER`, `RackNode`). The SG packets (P5b.1–P5b.8) and B7 packets (P5b.13–14) have **no Phase-5a dependency and can start immediately.**

### 0.8 Model assignment (safety protocol)

Every packet carries a **Model:** field on its header line. Default **Sonnet**. Every **RISK:HIGH** packet runs on **Opus/Fable** (high-blast-radius work gets the stronger model) — as does P5b.22, which ships inside P5b.21's RISK:HIGH PR (one executor, one model).

---

## Track A — SG-8 live-gate wiring (lib merged #161; wiring ❌)

### P5b.1 — SG-8 backend live wiring: monitor startup + feature registry + pressure IPC · RISK:HIGH

- **ID:** P5b.1 · **Branch:** `feat/p5b-sg8-live-backend` · **Base:** `origin/main` · **Est:** ~4h · **Model:** Opus/Fable (RISK:HIGH)
- **Depends-on:** none (lib already on main).
- **Goal:** The SG-8 lib actually runs: `PressureMonitor` starts with the sidecar, features register with the global `FeatureRegistry`, and pressure events reach the frontend over IPC. (SPEC-3 §5.4 enforcement point.)
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  git fetch origin && git rev-parse --short origin/main          # lineage of d821ae8; if main moved, re-verify the two greps below
  git ls-tree origin/main backend/src/safety/pressure/ --name-only
  #   MUST list: __init__.py budget.py degrade_order.py monitor.py registry.py — else STOP
  git grep -n "PressureMonitor" origin/main -- backend/src/zmq_server.py backend/src/main.py
  #   MUST be EMPTY — non-empty means someone already wired it → STOP, reassess scope
  ```
- **Scope (VERIFIED paths):** `backend/src/zmq_server.py` (startup/shutdown + one new handler), `backend/src/safety/pressure/monitor.py` + `registry.py` (read-only consumers; modify ONLY if a hook point is genuinely missing — justify in PR body), `backend/src/security.py` (clamps for any new IPC numerics), new `backend/tests/test_safety/test_pressure_wiring.py`.
- **DO-NOT-TOUCH:** `backend/src/safety/pressure/budget.py` + `degrade_order.py` algorithm internals; frontend (P5b.2); `engine/export.py`; the `EXPERIMENTAL_AUDIO_TRACKS` flag block.
- **Steps:**
  1. Instantiate `MemoryBudget`-equivalent detection + `PressureMonitor` in sidecar startup (where the ZMQ server boots in `zmq_server.py` / `main.py`); `stop()` on clean shutdown.
  2. Wire `global_registry()` so degrade callbacks fire from monitor threshold crossings (use `monitor.tick_once()`/callback seam — read the lib first; it already has `_evaluate_and_fire`).
  3. Add a `pressure_status` IPC handler (poll model — matches existing REQ/REP; no push channel exists) returning `{level, current_pct, degraded_features[]}`, numerics clamped/finite.
  4. Log threshold crossings via the structured sidecar logger (`~/.entropic/logs/sidecar.log` conventions).
- **TEST PLAN:** `cd backend && python -m pytest tests/test_safety/test_pressure_wiring.py -x --tb=short` — named tests: `test_monitor_started_with_sidecar`, `test_monitor_stopped_on_shutdown`, `test_pressure_status_handler_shape`, `test_pressure_status_values_finite_and_clamped`, `test_degrade_callback_fires_at_threshold` (mock pressure fn — `monitor.py` has `_default_pressure_fn` seam), `test_recovery_restores_in_reverse_order`, `test_double_start_is_idempotent_no_second_thread` (chaos/state negative: calling startup twice leaks zero extra threads). Then full `python -m pytest -x -n auto --tb=short`.
- **ACCEPTANCE GATES:** monitor thread provably starts/stops (no leaked thread in tests); `pressure_status` returns within one REQ/REP cycle (<50 ms wall-clock asserted in the handler test); degrade order matches `degrade_order.py` (SPEC-3 §5.2 Part C); zero regressions in the 12K-test backend suite.
- ****Cross-phase marker (required by P7.9c):** when wiring the pressure/sentinel seam into `zmq_server.py`, plant the comment `# TODO(P7.9c): C5 latent-trajectory enforcement hooks here` at the per-lane evaluation seam — phase-7's P7.9c precondition greps for this exact marker.

ROLLBACK:** revert single PR; lib remains intact (wiring is additive at startup + one handler).
- **EVIDENCE:** pytest output for the named tests; `grep -n "PressureMonitor" backend/src/zmq_server.py` showing the wiring lines; one captured `sidecar.log` line showing a synthetic threshold crossing.

### P5b.2 — SG-8 frontend: memory status surface + degrade toasts

- **ID:** P5b.2 · **Branch:** `feat/p5b-sg8-live-frontend` · **Base:** `origin/main` · **Est:** ~3h · **Model:** Sonnet
- **Depends-on:** P5b.1 merged (needs `pressure_status` IPC).
- **Goal:** SPEC-3 §5.2 "status overlay always-visible when any feature auto-disabled" + toast on auto-disable.
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  git grep -n "pressure_status" origin/main -- backend/src/zmq_server.py   # MUST be non-empty (P5b.1 merged) — else STOP
  git ls-tree origin/main frontend/src/renderer/components/ --name-only    # confirm component layout; no statusbar/ dir exists today (VERIFIED) — create one
  ```
- **Scope (VERIFIED paths):** new `frontend/src/renderer/components/statusbar/MemoryStatus.tsx` (+ CSS in BEM, dark theme tokens per repo CLAUDE.md), `frontend/src/renderer/stores/toast.ts` consumers (use existing 2s-dedup `source` field — do not modify the store), polling hook wired where other engine polling lives, new Vitest file `frontend/src/__tests__/components/statusbar/memory-status.test.tsx`.
- **DO-NOT-TOUCH:** `stores/toast.ts` internals; backend; `global.css` root grid rows (`feedback_test-layout-changes`: never modify `grid-template-rows` on root layout — position the overlay `position:fixed`).
- **Steps:** poll `pressure_status` at ~1s while app focused; render nothing at `level=ok`; persistent badge + degraded-feature list at `warn`/`auto_disable`/`emergency`; fire toast (source=`sg8-pressure`) on each NEW feature disable; manual-dismiss state toast at `emergency`. **Live-runtime step (Gate 18):** run the app from the SAME worktree edited (`ps aux | grep -i electron` path check), drive a mocked `auto_disable` payload, and see the badge live before claiming ready.
- **TEST PLAN:** `cd frontend && npx --no vitest run src/__tests__/components/statusbar/memory-status.test.tsx` — named tests: `renders nothing at ok`, `shows badge and feature list at auto_disable`, `toast fired once per newly disabled feature (dedup)`, `emergency state is manual-dismiss`, `malformed/non-finite IPC payload renders fallback not crash`. Full `npx --no vitest run` after.
- **ACCEPTANCE GATES:** overlay visible whenever ≥1 feature degraded; no layout shift of the root grid; trust-boundary guard on every numeric from IPC.
- **ROLLBACK:** revert PR — component is additive.
- **EVIDENCE:** vitest output; screenshot of the badge under a mocked `auto_disable` payload.

---

## Track B — SG-3 latent NaN/Inf sentinel (draft #133 = clause-1 only; ~12–18h remains)

### P5b.3 — SG-3 cherry-pick: land the clause-1 sentinel module · RISK:HIGH (stale merge-base)

- **ID:** P5b.3 · **Branch:** `feat/p5b-sg3-sentinel-pick` · **Base:** `origin/main` · **Est:** ~1.5h · **Model:** Opus/Fable (RISK:HIGH)
- **Depends-on:** none.
- **Goal:** Land draft PR #133's pure-function sentinel (`check_and_clamp`, `safe_normalize`, `batch_validate`, `LatentSentinelError`, `SentinelAction`, `SentinelResult`, `DEFAULT_L2_CEILING=10.0`, `DEFAULT_L2_FLOOR=1e-6`) + its 25 tests, via cherry-pick per §0.2 — NOT a branch merge.
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  cd ~/Development/entropic-q7-sg3 && git branch --show-current      # MUST print: feat/q7-sg3-sentinel — else STOP
  git log --oneline origin/main..feat/q7-sg3-sentinel | head -3
  #   MUST show 8853d63 "[q7] feat: PR #15 SG-3 latent NaN/Inf sentinel (25 tests)" at/near top — else STOP
  git show --stat 8853d63
  #   MUST show EXACTLY 2 files, both new: backend/src/safety/latent_sentinel.py (+204)
  #   and backend/tests/test_q7_benchmark/test_latent_sentinel.py (+288) — anything else → STOP
  git ls-tree origin/main backend/src/safety/latent_sentinel.py      # MUST be EMPTY (not already landed) — else STOP
  ```
- **Scope (VERIFIED):** exactly the two files in commit `8853d63`. The branch carries 20+ OTHER q7 commits (PRs #3–#15 stack) — **only `8853d63` is payload.**
- **DO-NOT-TOUCH:** every other commit on `feat/q7-sg3-sentinel`; anything outside `backend/src/safety/latent_sentinel.py` + its test file.
- **Steps:**
  1. `git -C ~/Development/entropic-v2challenger worktree add ../p5b-sg3 -b feat/p5b-sg3-sentinel-pick origin/main`
  2. `git cherry-pick 8853d63` (clean expected — both files new-namespace; `backend/tests/test_q7_benchmark/` already exists on main).
  3. If ANY conflict appears → STOP (means main moved); do not resolve by hand without re-running §0.2 checks.
  4. Note in PR body: draft uses `DEFAULT_L2_CEILING=10.0` vs SPEC-3 §3.3's illustrative `MAX_L2_NORM=32.0` — keep 10.0 (per-backbone overrides come in P5b.5), record as a DEC note.
- **TEST PLAN:** `cd backend && python -m pytest tests/test_q7_benchmark/test_latent_sentinel.py -x --tb=short` (expect 25 pass) → full backend suite.
- **ACCEPTANCE GATES:** 25/25 sentinel tests green; full suite zero regressions; `git diff origin/main --stat` shows ONLY the 2 payload files.
- **ROLLBACK:** delete branch (pre-merge) / revert (post-merge); zero coupling.
- **EVIDENCE:** the four precondition command outputs pasted in PR body (per §0.2 contract) + pytest 25-pass output.

### P5b.4 — SG-3 clause-2: render-output NaN/Inf gate + `lane_aborted` event (backend) · RISK:HIGH (hot render path)

- **ID:** P5b.4 · **Branch:** `feat/p5b-sg3-output-gate` · **Base:** `origin/main` · **Est:** ~4h · **Model:** Opus/Fable (RISK:HIGH)
- **Depends-on:** P5b.3 merged.
- **Goal:** SPEC-3 §3.2 clauses 2+3: every render-pipeline output is finite-checked BEFORE compositing/encode; on NaN/Inf → abort the offending modulation lane, render last-known-good (or blank), emit a `lane_aborted` payload to the frontend. NaN frames NEVER silently pass downstream.
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  git grep -n "check_and_clamp" origin/main -- backend/src/safety/latent_sentinel.py   # non-empty (P5b.3 merged) — else STOP
  git ls-tree origin/main backend/src/engine/pipeline.py backend/src/engine/compositor.py --name-only  # both MUST exist — else re-locate enforcement point, STOP and re-survey
  ```
- **Scope (VERIFIED paths):** `backend/src/engine/pipeline.py` and/or `backend/src/engine/compositor.py` (read both first; put the gate at the single choke point where composed frames exit toward encode — SPEC-3 names "after compositor, before encode"), `backend/src/zmq_server.py` (attach `lane_aborted` info to the render response — REQ/REP, so it rides the frame reply, not a push), `backend/src/safety/latent_sentinel.py` (consume only), new `backend/tests/test_safety/test_sg3_output_gate.py`.
- **DO-NOT-TOUCH:** effect implementations under `backend/src/effects/`; `engine/export.py` determinism logic (the gate must be a pure pass-through for finite frames); frontend (P5b.5).
- **Steps:**
  1. Add `detect_nan_in_frame`-style finite gate (use/extend sentinel module — keep it the single source of truth) at the pipeline output choke point.
  2. On detection: identify offending lane if attributable (else `lane_id="unknown"`), mute it server-side for the session, return last-known-good frame + `lane_aborted: {lane_id, reason}` field on the reply.
  3. Performance guard: gate must be `np.isfinite` reduction on the final frame only (one pass; benchmark before/after — budget <1ms at 1080p).
  4. Export path: a NaN frame during export FAILS the export job loudly (no silent substitution inside deterministic exports).
- **TEST PLAN:** `python -m pytest tests/test_safety/test_sg3_output_gate.py -x --tb=short` — named tests: `test_finite_frame_passes_unmodified`, `test_nan_frame_blocked_and_last_good_served`, `test_inf_frame_blocked`, `test_lane_aborted_payload_on_reply`, `test_lane_muted_after_abort_stays_muted`, `test_export_fails_loud_on_nan_frame`, `test_gate_overhead_under_budget` (perf smoke). Full backend suite after.
- **ACCEPTANCE GATES:** SPEC-3 §3.2(2)+(3) satisfied; no measurable render-path regression (>1ms @1080p fails); export NaN = hard error.
- **ROLLBACK:** revert PR; the gate is one choke-point insertion + one reply field — list both in commit body for targeted revert.
- **EVIDENCE:** pytest output; before/after per-frame timing numbers in PR body.

### P5b.5 — SG-3 clause-3: frontend lane-mute UX + feedback-path normalize + fuzz

- **ID:** P5b.5 · **Branch:** `feat/p5b-sg3-frontend-mute` · **Base:** `origin/main` · **Est:** ~3.5h · **Model:** Sonnet
- **Depends-on:** P5b.4 merged.
- **Goal:** Close out SG-3: frontend toast + auto-mute UI on `lane_aborted` (SPEC-3 §3.4 "toast: lane name + muted automatically", user can re-enable); `normalize_latent`-on-write seam for future feedback-capable latent paths; malformed-input fuzz.
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  git grep -n "lane_aborted" origin/main -- backend/src/zmq_server.py    # non-empty (P5b.4 merged) — else STOP
  git grep -rn "lane_aborted" origin/main -- frontend/src | head -3      # MUST be EMPTY — else STOP (already wired)
  ```
- **Scope (VERIFIED paths):** frontend IPC reply handling where render responses are consumed (locate via `git grep -n "render_composite" frontend/src` — read before editing), `stores/toast.ts` consumers (source=`sg3-sentinel`, error tier 8s), the modulation lane UI state (mute flag — coordinate with `stores/operators.ts` / `stores/automation.ts`, whichever owns the aborted lane id), backend `backend/src/safety/latent_sentinel.py` per-backbone ceiling table (`MAX_L2_NORM_PER_BACKBONE` per SPEC-3 §3.3), new fuzz tests both layers.
- **DO-NOT-TOUCH:** toast store internals; engine hot path (P5b.4 owns it); `axis-binding.ts`.
- **Steps:** (1) surface `lane_aborted` → toast + mute badge on the lane row + re-enable affordance; (2) add `MAX_L2_NORM_PER_BACKBONE` config + tests (the seam B8-latent/B9-learned will call); (3) fuzz: feed NaN/Inf/huge/negative-dim latents and malformed `lane_aborted` payloads — never crash, never silent-pass; (4) **live-runtime step (Gate 18):** run the app from the edited worktree (`ps aux | grep -i electron` path check), inject a mocked abort reply, and see the toast + mute badge live before claiming ready.
- **TEST PLAN:** Vitest `frontend/src/__tests__/components/sg3-lane-mute.test.tsx`: `toast on lane_aborted`, `lane shows muted state`, `re-enable clears mute`, `malformed payload ignored safely`. Backend: extend `test_latent_sentinel.py` with `test_per_backbone_ceiling_override`, `test_fuzz_malformed_latents_never_silent_pass`. Both full suites.
- **ACCEPTANCE GATES:** all three SPEC-3 §3.2 contract clauses now demonstrably in code (clause-1 P5b.3, clause-2 P5b.4, clause-3 here); SG-3 gate can be marked GREEN in ROADMAP, unblocking B8-latent + B9-learned.
- **ROLLBACK:** revert PR (frontend additive + one backend config table).
- **EVIDENCE:** vitest + pytest outputs; screen capture of the mute toast under a mocked abort.

---

## Track C — SG-5 dynamic cycle detection (draft #144; lib-only, not integrated)

### P5b.6 — SG-5 cherry-pick: routing-graph dep + cycle-detection module · RISK:HIGH (stale merge-base + cross-PR dependency)

- **ID:** P5b.6 · **Branch:** `feat/p5b-sg5-cycle-pick` · **Base:** `origin/main` · **Est:** ~2h · **Model:** Opus/Fable (RISK:HIGH)
- **Depends-on:** none.
- **Goal:** Land draft #144's `cycle_detection.py` (DFS static detection, deterministic lex-smallest break, `cycle_safe_edge_addition` pre-check, 19 tests). **Hard fact (VERIFIED):** the module does `from inspector.routing_graph import GraphEdge, RoutingGraph` — and `backend/src/inspector/` does NOT exist on main. The payload is therefore TWO commits: `2d2ac79` (PR #142 I2 routing graph: `backend/src/inspector/routing_graph.py` +237, test +272) then `f877439` (PR #144: `backend/src/safety/cycle_detection.py` +177, test +278) — **plus the package init `backend/src/inspector/__init__.py`: cherry-pick it if `2d2ac79` carries it, else CREATE it in this packet** (the init otherwise lives only in #140's `d85828e`, which is Phase-6 P6.7's payload — do not pick that commit here). **P5b.6 is the SOLE owner/closer of #142's graph payload**; Phase-6 P6.9 is rescoped to graph-sync wiring only on top of this.
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  cd ~/Development/entropic-q7-sg5 && git branch --show-current      # MUST print: feat/q7-sg5-cycle-detection — else STOP
  git log --oneline origin/main..feat/q7-sg5-cycle-detection | wc -l # expect 37; wild divergence → STOP and re-enumerate
  git show --stat 2d2ac79   # MUST be exactly 2 NEW files under backend/src/inspector/ + tests — else STOP
  git show --stat f877439   # MUST be exactly 2 NEW files (safety/cycle_detection.py + test) — else STOP
  git ls-tree origin/main backend/src/inspector backend/src/safety/cycle_detection.py  # MUST be EMPTY — else STOP
  ```
- **Scope:** exactly the 4 files in those 2 commits, plus `backend/src/inspector/__init__.py` (picked-or-created per Goal). The branch carries the whole q7 stack (PRs #3–#26) — everything else is NOT payload.
- **DO-NOT-TOUCH:** all other commits on the draft branch; `modulation/engine.py` (P5b.7 owns integration).
- **Steps:** fresh worktree off `origin/main` → `git cherry-pick 2d2ac79 f877439` → ensure `backend/src/inspector/__init__.py` exists (create if the pick didn't bring it) → any other conflict = STOP per §0.2. PR body must note: this lands the I2 backend graph as an SG-5 dependency, extracting draft #142's graph payload — **only P5b.6 closes #142's graph payload** (comment on #142 and #144; close #144 once merged; #142 closes pointing here, with P6.9 handling only the remaining graph-sync wiring).
- **TEST PLAN:** `python -m pytest tests/test_q7_benchmark/test_routing_graph.py tests/test_q7_benchmark/test_cycle_detection.py -x --tb=short` (expect 25+19 pass per the commit messages — actual counts from run are authoritative) → full backend suite.
- **ACCEPTANCE GATES:** both payload test files green; `git diff origin/main --stat` = exactly 4 files; zero suite regressions.
- **ROLLBACK:** delete branch / revert; both modules are leaf-namespace.
- **EVIDENCE:** precondition outputs in PR body; pytest pass counts.

### P5b.7 — SG-5 part A: runtime-aware toposort integrated into the modulation engine · RISK:HIGH

- **ID:** P5b.7 · **Branch:** `feat/p5b-sg5-runtime-toposort` · **Base:** `origin/main` · **Est:** ~4h · **Model:** Opus/Fable (RISK:HIGH)
- **Depends-on:** P5b.6 merged.
- **Goal:** SPEC-3 §4.2 Part A+B against the REAL engine: replace `engine.py`'s catch-and-degrade-to-declaration-order (lines 138–141, VERIFIED comment "SG-5 will replace") with deterministic cycle-break via `cycle_detection.break_cycles`; add `topological_sort_with_runtime(operators, runtime_context)` that evaluates runtime-conditional edges first; keep the existing static `_topological_sort` as the fast path for static-only graphs (SPEC-3 §4.4).
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  git grep -n "break_cycles" origin/main -- backend/src/safety/cycle_detection.py   # non-empty (P5b.6 merged) — else STOP
  git grep -n "SG-5" origin/main -- backend/src/modulation/engine.py                # MUST hit the lines-138-141 degrade comment — else engine moved, re-read it first
  ```
- **Scope (VERIFIED paths):** `backend/src/modulation/engine.py` (the `except ModulationCycleError` block + new entry point), adapter from engine's `list[dict]` / `parameters.sources` operator shape to `inspector.routing_graph.RoutingGraph` (put adapter in `backend/src/modulation/` so `safety/` stays dependency-free), `RuntimeContext` dataclass (`frame_index`, `current_y`, `audio_buffer` per SPEC-3 §4.3), new `backend/tests/test_modulation/test_sg5_integration.py`.
- **DO-NOT-TOUCH:** `_topological_sort` raise semantics (INJ-2, shipped #150 — regression-guard it); `cycle_detection.py` internals beyond what adapter needs; `zmq_server.py`.
- **Steps:** (1) adapter `operators[list[dict]] → RoutingGraph`; (2) on `ModulationCycleError`: run `detect_cycles` + `break_cycles`, evaluate in broken order, log decision; (3) runtime-conditional edges (painted/learned — none implemented yet, so the seam takes a predicate) evaluated before snapshot; (4) static-only graphs bypass to existing path.
- **TEST PLAN:** `python -m pytest tests/test_modulation/test_sg5_integration.py -x --tb=short` — named: `test_static_cycle_caught_by_existing_toposort` (INJ-2 regression guard, SPEC-3 §4.5), `test_cycle_now_breaks_deterministically_not_declaration_order`, `test_break_is_lex_smallest_edge`, `test_adapter_roundtrip_preserves_all_edges`, `test_static_only_graph_uses_fast_path`, `test_runtime_conditional_edge_evaluated_before_snapshot`. Full backend suite (existing `test_modulation/` must stay green).
- **ACCEPTANCE GATES:** declaration-order fallback GONE (grep proves it); same cycle → same break across 100 repeated sorts; fast path unchanged for static graphs.
- **ROLLBACK:** revert PR; commit body must list the exact `engine.py` hunks (this packet's only non-additive edit).
- **EVIDENCE:** pytest output; `git diff` of the engine.py except-block before/after in PR body.

### P5b.8 — SG-5 part B: per-export-job break caching + once-per-export warning + perf gate

- **ID:** P5b.8 · **Branch:** `feat/p5b-sg5-export-cache` · **Base:** `origin/main` · **Est:** ~3.5h · **Model:** Sonnet
- **Depends-on:** P5b.7 merged.
- **Goal:** SPEC-3 §4.2's determinism tail: cycle-break decision snapshotted per export job (same break for every frame of one export), one warning toast per export (not per frame), `<16ms` per-frame detection budget.
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  git grep -n "break_cycles" origin/main -- backend/src/modulation/   # non-empty (P5b.7 merged) — else STOP
  git ls-tree origin/main backend/src/engine/export.py --name-only    # MUST exist — else STOP
  ```
- **Scope (VERIFIED paths):** `backend/src/engine/export.py` (job-scoped decision cache), `backend/src/modulation/engine.py` (accept injected decision), warning emission via the render reply (reuse P5b.4's reply-field pattern; frontend toast source=`sg5-cycle`), `backend/tests/test_modulation/test_sg5_export_determinism.py`.
- **DO-NOT-TOUCH:** `engine/determinism.py` hashing; export encode path.
- **Steps:** cache `CycleBreakDecision` keyed by export-job id at job start; reuse for all frames; emit warning once; perf-test detection on a 32-operator synthetic graph.
- **TEST PLAN:** named tests per SPEC-3 §4.5: `test_cycle_break_deterministic_across_replays`, `test_cycle_break_consistent_across_frames_within_export`, `test_warning_emitted_once_per_export`, `test_conditional_cycle_detected_within_16ms` (wall-clock guard), plus `test_two_exports_same_project_identical_decisions`. Full backend suite.
- **ACCEPTANCE GATES:** all four SPEC-3 §4.5 CI tests exist and pass → **SG-5 gate GREEN**, unblocking B9; export of a cyclic test project is byte-identical across two runs (export-path rule §0.4).
- **ROLLBACK:** revert PR.
- **EVIDENCE:** pytest output incl. measured detection ms; two-export hash comparison.

---

## Track D — B6 Frame-Bank (wavetable) · gated on B5 + SG-8 wiring

### P5b.9 — B6 backend: byte-budget LRU decoded-frame bank (backend-enforced) · RISK:HIGH (256×4K RGBA ≈ 8.5GB → 16GB-Mac freeze)

- **ID:** P5b.9 · **Branch:** `feat/p5b-b6-frame-bank-backend` · **Base:** `origin/main` · **Est:** ~4h · **Model:** Opus/Fable (RISK:HIGH)
- **Depends-on:** P5b.1 (SG-8 wiring — IN-gate per INSTRUMENTS plan §3 B6). Phase-5a B5 NOT required for this backend lib packet (it's standalone); B5 required from P5b.10 on.
- **Goal:** The safety crux of B6: a slot bank whose residency bound is **bytes of decoded frames, not slot count** (the existing `_max_readers = 10` at `zmq_server.py:75` caps file handles, NOT decoded RAM — VERIFIED). Over budget → LRU-evict + serve downscale proxy. The renderer (sidecar) is the enforcement authority; the frontend `byteBudget` field is a request only.
- **PINNED DESIGN (2026-06-11 — was "final at gate"; final HERE. Diverging at the gate requires amending this block first):**
  - **Budget formula:** `frame_bank_byte_budget = min(MAX_FRAMEBANK_BYTE_BUDGET, floor(0.20 × SESSION_BUDGET_BYTES))`. `SESSION_BUDGET_BYTES` is SG-8's session-start `psutil.virtual_memory().available` anchor (`backend/src/safety/pressure/budget.py`, VERIFIED on main: import-time constant, `ENTROPIC_Q7_BUDGET_MB` env override, 8 GiB fallback when psutil absent — do NOT re-read mid-session, DEC-Q7-011). `MAX_FRAMEBANK_BYTE_BUDGET = 2 GiB` is the absolute `security.py` ceiling. Under SG-8 stage 5 `frame_bank_cache_dropped` (threshold 82% / restore 72%, VERIFIED `degrade_order.py` order=5) the effective cap halves — that's step 3's degrade hook. **Hazard math (why slot-count caps are insufficient):** 256 slots × 3840×2160 px × 4 B = 8,493,465,600 B ≈ **8.5 GiB** ≈ 80%+ of the ~10.5 GiB session budget on the 16 GB Apple-silicon target → would cascade straight through degrade stages 5–10. Under the formula, a worst-case bank is 2 GiB ≈ 19% of session budget.
  - **Eviction policy:** LRU at **decoded-frame granularity** (one cache entry = one decoded frame = `h*w*4` bytes), never whole-slot. **Pinned slots:** frames of currently-playing banks (current frame ± 1 blend neighbor) are pinned and skipped by eviction — mirror `GPUResourcePool.pin/unpin` + `_evict_lru` skip-pinned semantics (VERIFIED `safety/gpu_resources.py`). If pinned bytes alone reach the cap, new admissions decode at proxy resolution; pinned entries are never evicted.
  - **Enforcement point:** **before decode, in the slot-load path** — `FrameBank.ensure_capacity(h*w*4)` runs evict-then-admit BEFORE any frame decode; admission denied → decode the downscale proxy instead. Frontend `byteBudget` is clamped to the formula server-side (it can lower the cap, never raise it).
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  git grep -n "PressureMonitor" origin/main -- backend/src/zmq_server.py     # non-empty (P5b.1) — else STOP
  git grep -rn "MAX_FRAMEBANK_SLOTS\|frame_bank" origin/main -- backend/src | head -3   # MUST be EMPTY — else STOP (exists already)
  ```
- **Scope (VERIFIED paths):** new `backend/src/instruments/__init__.py` + `backend/src/instruments/frame_bank.py` (bank, LRU accounting, proxy downscaler — reuse `modulation/video_analyzer.py`'s `downscale_proxy` if API fits, VERIFIED it exists), `backend/src/security.py` (add `MAX_FRAMEBANK_SLOTS`, `MAX_FRAMEBANK_BYTE_BUDGET` hard caps; clamp `position` [0,1] finite, per-slot `validate_upload` on add), new `backend/tests/test_instruments/test_frame_bank.py`.
- **DO-NOT-TOUCH:** `zmq_server.py` (P5b.10 wires it); `video/reader.py` reader pool; existing granulator/sampler code.
- **Steps:** (1) `FrameBank` class: ordered slots (`SlotRef = {clip_id|still_id, frame_index}`), `resolve(position) → (slot_idx, frac)`; (2) decoded-frame cache with byte accounting (`h*w*4` per frame), LRU eviction at budget, downscale-proxy fallback path; (3) SG-8 `FeatureRegistry` registration: degrade hook = LRU-evict to half cap (SPEC-3 §5.2 priority 5), `disable_fn` returns bytes freed; (4) security constants + clamps.
- **TEST PLAN:** `python -m pytest tests/test_instruments/test_frame_bank.py -x --tb=short` — named: `test_byte_accounting_exact`, `test_lru_evicts_oldest_at_budget`, `test_over_budget_serves_proxy_not_oom`, `test_position_clamped_and_finite_guarded`, `test_slot_count_cap_rejected`, `test_sg8_degrade_hook_frees_bytes_and_reports`, `test_256_slot_synthetic_bank_stays_under_budget` (synthetic small frames — assert accounting math, not real 8.5GB), `test_frame_bank_respects_byte_budget_under_4k_load` (**named oracle test** — frames with REAL 4K dims under a tiny `ENTROPIC_Q7_BUDGET_MB` override; assert residency ≤ formula cap after EVERY admission, and that the formula `min(2GiB, 0.20×SESSION_BUDGET_BYTES)` is the binding bound), `test_eviction_is_lru_order_and_skips_pinned_slots` (**eviction-order test** — touch-order eviction proven exact; pinned playing-bank frames survive a full eviction sweep; admission with all-pinned-at-cap yields proxy, not eviction). Full backend suite.
- **ACCEPTANCE GATES:** memory bound is bytes-based and backend-owned; budget formula, eviction policy, and enforcement point match the PINNED DESIGN block verbatim (reviewer greps the constants); SG-8 hook registered; no API exposed to frontend yet (no IPC change in this packet).
- **ROLLBACK:** revert PR — entirely additive (`security.py` constants are append-only).
- **EVIDENCE:** pytest output; line refs of the two new security constants.

### P5b.10 — B6 backend: composite-render integration (position scan, nearest/blend)

- **ID:** P5b.10 · **Branch:** `feat/p5b-b6-render-integration` · **Base:** `origin/main` · **Est:** ~4h · **Model:** Sonnet
- **Depends-on:** P5b.9 merged; **Phase-5a B5 merged** (B6's IN-gate per INSTRUMENTS plan).
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  git grep -n "class FrameBank" origin/main -- backend/src/instruments/frame_bank.py  # non-empty — else STOP
  git grep -rln "RackNode" origin/main -- frontend/src | head -2
  #   non-empty proves Phase-5a B4/B5 landed — EMPTY → STOP (B5 IN-gate not green; do not build B6 on top of nothing)
  ```
- **Goal:** a `frameBank` layer resolves through `_handle_render_composite` (`zmq_server.py:707`, VERIFIED): integer slot + fractional blend (`idx = position * (slots.length-1)`), `interp: nearest|blend` (`flow` deferred to P5b.15), emitting one layer per active voice.
- **Scope (VERIFIED paths):** `backend/src/zmq_server.py` `_handle_render_composite` (new `layer_type: 'frameBank'` branch — mirror the B1 sampler's layer dict shape from `components/instruments/types.ts` `SamplerVoiceLayer`, VERIFIED), `backend/src/instruments/frame_bank.py` (interp), `backend/src/engine/compositor.py` only if layer plumbing demands (read first), tests.
- **DO-NOT-TOUCH:** existing layer types' behavior; `_get/_save_composite_states` keying (B2's voice-keying owns that); export encode.
- **Steps:** parse+validate layer params (clamp position, validate slot refs against bank, reject unknown interp), nearest = integer slot, blend = `(1-frac)*A + frac*B`, per-voice instances keyed by voiceId. **Pinning:** the render arm pins the active bank's current ± neighbor frames (`FrameBank.pin`) for the duration of the render call and unpins after — playing banks are never evicted mid-frame (P5b.9 PINNED DESIGN).
- **TEST PLAN:** `python -m pytest tests/test_instruments/test_frame_bank_render.py -x --tb=short` — named: `test_nearest_picks_integer_slot`, `test_blend_fractional_crossfade_l1` (L1-diff against hand-computed blend), `test_position_0_and_1_exact_endpoints`, `test_malformed_layer_rejected_before_decode`, `test_unknown_interp_rejected`, `test_two_voices_independent_positions`. Full backend suite.
- **ACCEPTANCE GATES:** fractional-position crossfade quantified: blend output L1-diff vs hand-computed `(1-frac)*A + frac*B` ≤ 1 LSB per channel (uint8), endpoints at position 0/1 byte-exact; malformed input rejected pre-decode (trust boundary); composite handler regression-free.
- **ROLLBACK:** revert PR; the `zmq_server.py` branch is one dispatch arm — name the hunk in commit body.
- **EVIDENCE:** pytest output; sample rendered blend frame attached to PR.

### P5b.11 — B6 frontend: FrameBank instrument + slot-strip UI + position as mod destination

- **ID:** P5b.11 · **Branch:** `feat/p5b-b6-frontend` · **Base:** `origin/main` · **Est:** ~4h · **Model:** Sonnet
- **Depends-on:** P5b.10 merged; PR-A browser tabs (instruments tab — VERIFY below).
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  git grep -n "frameBank" origin/main -- backend/src/zmq_server.py            # non-empty — else STOP
  git grep -n "instruments" origin/main -- frontend/src/renderer/stores/browser.ts | head -3
  #   instruments browser tab must exist (PR-A deliverable) — EMPTY → STOP, B6 UI has no mount point
  ```
- **Goal:** INSTRUMENTS plan B6 UI: horizontal slot strip (thumbnails) + position knob with live moving indicator + interp dropdown + byte-budget/residency readout; `position` exposed as a PRIME modulation destination (LFO sweep = wavetable scan).
- **Scope (VERIFIED paths):** new `frontend/src/renderer/components/instruments/FrameBankDevice.tsx` + `buildFrameBankLayer.ts` (mirror B1's `SamplerDevice.tsx`/`buildSamplerLayer.ts` pattern — `feedback_read-existing-component-before-parallel-build`: READ them first, extend the established pattern in place), `components/instruments/types.ts` (add `FrameBankInstrument` — `slots`, `position`, `interp`, `byteBudget`, `timeAxis?: 't'|'y'|'x'` lowercase per axis-binding.ts canon), `stores/instruments.ts`, `styles/instruments.css`, residency readout fed by P5b.1's `pressure_status`/bank stats, Vitest.
- **DO-NOT-TOUCH:** `shared/axis-binding.ts`; `SamplerDevice` behavior; root layout grid.
- **Steps:** type + store entry → device tile → slot add/remove with per-slot `validate_upload` round-trip → position knob wired as mod destination (same mechanism Sampler params use — read `applyCCModulations.ts` first) → residency readout.
- **TEST PLAN:** `npx --no vitest run src/__tests__/components/instruments/frame-bank.test.tsx` — named: `renders slot strip from instrument state`, `position knob clamped [0,1]`, `interp dropdown has nearest+blend only (flow absent pre-B7)`, `layer dict shape matches backend contract`, `empty bank renders without crash`, `mod destination registered for position`, `full chain: slot add in UI → store → IPC layer payload matches the backend frameBank contract (mock IPC, asserts the exact dict)`. Full vitest suite. Wiring check per Gate 14: every prop passed, select AND deselect paths.
- **ACCEPTANCE GATES:** drag from instruments tab → device tile → renders a frame; position scrub visibly scans the bank — verified LIVE per Gate 18 (app launched from the edited worktree, `ps aux | grep -i electron` path check; relaunch, not HMR, after the store-shape change); no dead flags/props.
- **ROLLBACK:** revert PR (additive components + one types.ts append).
- **EVIDENCE:** vitest output; short screen capture of a position sweep.

### P5b.12 — B6 determinism + degrade campaign (export-path seeded LFO sweep; SG-8 drop-to-proxy)

- **ID:** P5b.12 · **Branch:** `feat/p5b-b6-determinism` · **Base:** `origin/main` · **Est:** ~3h · **Model:** Sonnet
- **Depends-on:** P5b.11 merged.
- **PRECONDITIONS:** `git grep -n "FrameBankDevice" origin/main -- frontend/src` non-empty — else STOP.
- **Goal:** B6's OUT-gates from the build plan: position-LFO sweep determinism (seeded, **EXPORT PATH** per §0.4 — never assert byte-identity on preview), byte-budget eviction under render load, SG-8 degrade drops to proxy not crash.
- **Scope:** test-only + small fixes it flushes out: `backend/tests/test_instruments/test_frame_bank_determinism.py`, a committed fixture project with a frame-bank + position LFO, export-path harness reuse from `engine/determinism.py` (VERIFIED exists).
- **DO-NOT-TOUCH:** preview seeding (project-store seed, HT-4 `App.tsx:153–156` — corrected §0.4; the old `Date.now()` sites at 840/857 no longer exist).
- **Steps:** fixture project → export twice → byte-compare; export under artificially tiny byte budget → completes on proxies, hashes still self-consistent within a run; SG-8 forced `auto_disable` mid-export → no crash, degrade logged.
- **TEST PLAN:** named: `test_position_lfo_export_byte_identical_across_runs`, `test_export_under_tiny_budget_completes_on_proxies`, `test_sg8_degrade_during_export_no_crash`, `test_edit_after_capture_replay_identical` (universal OUT-gate #4 wording). Full backend suite.
- **ACCEPTANCE GATES:** two consecutive exports byte-identical; OOM path provably converts to proxy; **B6 done** in ROADMAP terms.
- **ROLLBACK:** revert (tests + fixture only, plus any bugfix commits which must be separately revertable).
- **EVIDENCE:** hash pairs printed in test output.

---

## Track E — B7 Optical-flow / RIFE interpolation · gated SG-1 (lib ✅ #163)

### P5b.13 — B7 port: vendor RIFE arch + fp32 ONNX deterministic export · RISK:HIGH (model weights provenance + size)

- **ID:** P5b.13 · **Branch:** `feat/p5b-b7-rife-port` · **Base:** `origin/main` · **Est:** ~4h · **Model:** Opus/Fable (RISK:HIGH)
- **Depends-on:** none (SG-1 lib already merged #163; B7 has no B-ladder dep per build-plan graph).
- **Goal:** Vendor the morphlab RIFE arch into the sidecar and produce the **deterministic fp32 ONNX** model that the export path requires (build-plan B7 decision: bundle fp32 ONNX — no torch heft at runtime, no first-run download stall on export; optional MPS path is preview-only and comes later).
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  ls ~/Development/livephoto/rife_arch.py ~/Development/livephoto/engines.py   # both MUST exist — else STOP
  #   NOTE (discrepancy vs plan): morphlab lives in ~/Development/livephoto/, NOT ~/Development/morphlab*
  grep -n "rife49.pth" ~/Development/livephoto/engines.py                      # MUST show ComfyUI-Frame-Interpolation release URL — else weight source changed, STOP
  git grep -rn "rife" origin/main -- backend/src | head -3                     # MUST be EMPTY — else STOP
  ```
- **Scope (VERIFIED paths):** new `backend/src/interp/__init__.py` + `backend/src/interp/rife_arch.py` (vendored copy of `~/Development/livephoto/rife_arch.py`, license header preserved — RIFE arch CODE is MIT (hzwer); record provenance + weight URL + SHA-256 in the module docstring), new `backend/scripts/export_rife_onnx.py` (torch → ONNX fp32, fixed opset, fixed input names; torch is a SCRIPT-TIME dep only — must NOT enter the sidecar runtime requirements), new `backend/scripts/measure_rife_memory.py` (step 5), model integrity manifest (`{filename, sha256, size, license, license_evidence_url}` — license fields are step 6's deliverable), `backend/tests/test_interp/test_rife_arch.py`.
- **DO-NOT-TOUCH:** sidecar runtime `requirements` (no torch); `zmq_server.py` (P5b.14); `engines.py` in livephoto (read-only source).
- **Steps:** (1) copy + import-path-fix `rife_arch.py`; (2) export script: download `rife49.pth` (~/Development/livephoto cache may already have it — check `engines.py`'s cache dir first), load `weights_only=True`, export fp32 ONNX, emit sha256; (3) integrity check helper `verify_model(path)` (build-plan B7 security bullet); (4) document the ~`MAX_RESOLUTION=1920` inference cap carried over from `morphlab_core.py:495`; (5) **memory-budget measurement (gates P5b.14 start; target machine = Apple M4 16GB):** `backend/scripts/measure_rife_memory.py` loads `rife49.pth` fp32 via the vendored arch, runs one synthetic interpolation at the 1920 cap and one at 1080p, logs peak RSS (`resource.getrusage(RUSAGE_SELF).ru_maxrss` + psutil cross-check) and computes `headroom = SESSION_BUDGET_BYTES − (app+sidecar RSS at measurement time + model peak RSS)` against SG-8's budget anchor (`backend/src/safety/pressure/budget.py` `SESSION_BUDGET_BYTES`, VERIFIED: session-start `psutil.virtual_memory().available`, `ENTROPIC_Q7_BUDGET_MB` override — note its docstring says "16GB M1"; the anchor is psutil-derived so M4-correct anyway). **The script is exit-bearing: `headroom < 4 GiB` → exit nonzero printing the three numbers → STOP, do not start P5b.14; surface to user** (options: fp16 ONNX, lower res cap, defer B7); (6) **weights-licensing verification (exit-bearing):** the arch CODE license (MIT, hzwer) does NOT cover the WEIGHTS. `rife49.pth` is fetched from `github.com/Fannovel16/ComfyUI-Frame-Interpolation` releases (VERIFIED `~/Development/livephoto/engines.py:240`; **no license is recorded anywhere in livephoto — genuinely unverified today, named in ROADMAP G14**). At execution: check that repo's LICENSE + upstream `hzwer/Practical-RIFE` LICENSE as they apply to the weight files; record `{license, license_evidence_url}` in the integrity manifest. **If the weights cannot be pinned to a named license permitting redistribution/bundling → STOP and surface to user before bundling anything.**
- **TEST PLAN:** `python -m pytest tests/test_interp/test_rife_arch.py -x --tb=short` — named: `test_arch_constructs_without_weights`, `test_verify_model_rejects_bad_hash`, `test_verify_model_accepts_manifest_match`, `test_onnx_export_script_produces_fixed_io_names` (skip-marked if torch absent in CI — assert skip reason is explicit, never silent-pass per `feedback_silent-exception-swallowing`), `test_manifest_requires_nonempty_license_fields` (`verify_model` rejects a manifest missing `license`/`license_evidence_url`), `test_memory_measure_script_exits_nonzero_under_4gib_headroom` (drive via tiny `ENTROPIC_Q7_BUDGET_MB`; assert exit code ≠ 0 and the headroom line printed; skip-marked-with-reason if torch absent). Full backend suite.
- **ACCEPTANCE GATES:** ONNX file produced locally + manifest committed **including license fields** (weights file itself NOT committed if >100MB — document the fetch step in the script `--help`); zero new runtime deps; measurement run on the M4 16GB target shows `headroom ≥ 4 GiB` (else this packet merges but P5b.14 is STOPPED and the user decides).
- **ROLLBACK:** revert PR — wholly additive.
- **EVIDENCE:** sha256 + file size of produced ONNX in PR body; pytest output; **peak-RSS + headroom numbers from step 5** (both resolutions); **license name + evidence URL from step 6**.

### P5b.14 — B7 sidecar interp service: ONNX runtime + blend fallback + timeout

- **ID:** P5b.14 · **Branch:** `feat/p5b-b7-interp-service` · **Base:** `origin/main` · **Est:** ~4h · **Model:** Sonnet
- **Depends-on:** P5b.13 merged.
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  git grep -n "verify_model" origin/main -- backend/src/interp/ | head -2   # non-empty — else STOP
  git grep -n "class GPUResource" origin/main -- backend/src/safety/gpu_resources.py  # non-empty (SG-1 lib) — else STOP
  git grep -n "license_evidence_url" origin/main -- backend/src/interp/ backend/scripts/ | head -2
  #   non-empty proves P5b.13 step 6 (weights license) recorded — EMPTY → STOP, licensing unresolved
  # MANUAL gate: P5b.13 step-5 memory evidence in its PR body MUST show headroom ≥ 4 GiB on the M4 16GB target — < 4 GiB → STOP, surface to user
  ```
- **Goal:** Build-plan B7 service shape: stateless `interp(frameA, frameB, t∈(0,1)) → frame` callable in the sidecar; model absent/load-fail/timeout → degrade to `blend` (never crash, never hard-dep); per-inference timeout; resources owned via SG-1 pool discipline.
- **Scope (VERIFIED paths):** new `backend/src/interp/service.py` (onnxruntime session lifecycle, lazy load, `interp()`), `backend/src/safety/gpu_resources.py` consumed (pool registration for session-owned buffers — Mock acceptable until real Metal binding lands, which #163 explicitly deferred), per-inference timeout reusing the SG-7 timeout pattern (`backend/src/video/codec_timeout.py`, VERIFIED exists — read it first), `requirements` gains `onnxruntime` (runtime dep — flag in PR body for Infra review), `backend/tests/test_interp/test_service.py`.
- **DO-NOT-TOUCH:** decode/encode paths; export determinism hashing; frame-bank/sampler call sites (P5b.15).
- **Steps:** lazy session init + `verify_model` at load; `interp()` with t clamped (0,1) exclusive + finite guards; timeout wrapper (**default 2.0 s per inference**, configurable — SG-7 pattern; `codec_timeout.py`'s `DEFAULT_DECODE_TIMEOUT_SECONDS = 5.0` is the precedent, interp gets the tighter budget) → blend fallback + one-shot warning log; explicit `unload()` freeing session; **SG-8 integration:** register the session's `unload()` with the `FeatureRegistry` (`safety/pressure/registry.py`, VERIFIED) under the canonical cache-release tier (stage 6 `gpu_texture_pool_released` @85%, VERIFIED `degrade_order.py` order=6 — read `registry.py` first for the stage-mapping seam) so memory pressure sheds the ONNX session before the L-backbone stages fire.
- **TEST PLAN:** named: `test_blend_fallback_when_model_absent`, `test_blend_fallback_on_timeout`, `test_t_clamped_and_finite_guarded`, `test_interp_deterministic_same_inputs_same_output` (fp32 CPU EP — byte-equal), `test_session_unload_frees_handles` (SG-1 leak==0 via pool accounting), `test_corrupt_model_rejected_then_blend`, `test_sg8_pressure_unloads_session_then_blend_fallback` (mock pressure fn → degrade fires → session unloaded → next `interp()` serves blend, no crash). Full backend suite.
- **ACCEPTANCE GATES:** sidecar boots with NO model present (degraded mode); deterministic CPU-EP output proven byte-stable across two calls; GPU-handle leak == 0.
- **ROLLBACK:** revert PR; `onnxruntime` requirement removal included in revert.
- **EVIDENCE:** pytest output incl. determinism byte-compare; `ps`-level RSS note before/after 100 interp calls.

### P5b.15 — B7 wiring: Sampler slow-mo/scrub + Frame-Bank `interp:'flow'` + UI state

- **ID:** P5b.15 · **Branch:** `feat/p5b-b7-wiring` · **Base:** `origin/main` · **Est:** ~4h · **Model:** Sonnet
- **Depends-on:** P5b.14; P5b.10 (frame-bank render branch) for the flow-morph half; B3 full sampler for the scrub half — **if B3 not merged, ship the frame-bank half only and say so in the PR.**
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  git grep -n "def interp" origin/main -- backend/src/interp/service.py    # non-empty — else STOP
  git grep -n "frameBank" origin/main -- backend/src/zmq_server.py          # non-empty — else flow-morph half blocked, STOP
  git grep -rln "scrub" origin/main -- frontend/src/renderer/components/instruments | head -2  # EMPTY = B3 absent → ship frame-bank half only
  ```
- **Goal:** `interp==='flow'` becomes selectable: Frame-Bank adjacent-slot morph; Sampler speed≠1 frame interpolation (if B3 landed); "loading model" UI state on first use; per-platform export rule — flow frames use deterministic fp32 ONNX on the export path, else marked non-deterministic and **excluded from the export hash gate** (build-plan B7 determinism crux).
- **Scope (VERIFIED paths):** `backend/src/instruments/frame_bank.py` (flow branch calls `interp.service`), `backend/src/zmq_server.py` frameBank arm (accept `interp:'flow'`), `frontend/.../instruments/FrameBankDevice.tsx` (+SamplerDevice if B3) interp selector + loading state, `engine/export.py` flow-determinism flag, tests both layers.
- **DO-NOT-TOUCH:** blend/nearest paths (regression-guard); preview seeding.
- **TEST PLAN:** backend named: `test_flow_morph_calls_service_between_adjacent_slots`, `test_flow_falls_back_to_blend_when_service_degraded`, `test_flow_with_fewer_than_2_slots_falls_back_to_blend_not_crash` (degenerate-bank negative), `test_export_with_flow_uses_onnx_path_and_is_byte_identical_x2`, `test_export_marks_nondeterministic_when_onnx_unavailable`. Vitest: `flow option appears after P5b.15`, `loading-model state shown on first flow use`. Full suites. **Live-runtime step (Gate 18):** select `flow` in the running app launched from the edited worktree and observe the loading state + morph before claiming ready.
- **ACCEPTANCE GATES:** no ghosting regression on the blend path; export byte-identity holds with flow enabled on the ONNX path; degrade chain flow→blend→nearest never crashes.
- **ROLLBACK:** revert PR; flow stays schema-reserved.
- **EVIDENCE:** pytest+vitest output; one flow-morph output frame vs blend comparison image.

---

## Track F — B8 Granulator · gated SG-1 ✅(lib) + SG-3 (Track B) + SG-8 (Track A)

> **Scope honesty:** the build plan sizes B8 at **L–XL (~40–70h)**. These five packets cover **B8-core** (CPU-first grain engine, seeded determinism, caps, degrade, UI, 2 of 4 selection rules). The GPU shader pass (≈200 grains/frame as textured quads) and `latentSimilarity` full implementation are packetized as **Track I follow-ups: P5b.28** (GPU pass — lands the real Metal binding that #163 deferred) and **P5b.29** (latentSimilarity — additionally Q7-GATED).

### P5b.16 — B8 grain engine core (pure, seeded, capped)

- **ID:** P5b.16 · **Branch:** `feat/p5b-b8-grain-engine` · **Base:** `origin/main` · **Est:** ~4h · **Model:** Sonnet
- **Depends-on:** P5b.5 (SG-3 GREEN) + P5b.1 (SG-8 wiring). Phase-5a B5 required at render integration (P5b.17), not here.
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  git grep -n "lane_aborted" origin/main -- backend/src/zmq_server.py        # SG-3 clause-2 merged — else STOP
  git grep -n "PressureMonitor" origin/main -- backend/src/zmq_server.py     # SG-8 wired — else STOP
  git ls-tree origin/main backend/src/instruments/ --name-only               # frame_bank.py present = instruments pkg exists (P5b.9); EMPTY → create pkg here
  # Namespace check (VERIFIED hazard): fx/granulator.py + spectral granulators already exist as EFFECTS
  git grep -rln "granulator" origin/main -- backend/src/effects | head -3    # expect 3 hits — new module MUST NOT shadow these
  ```
- **Goal:** Pure-function grain cloud per the build-plan data model: `density` grains/frame (hard `MAX_GRAINS`), per-axis `{T,Y,X,C,F,L}` `grain`/`jitter`/`position`, `window: hann|tri|rect`, per-axis `grainEnv`; **seeded determinism** per the pinned formula below; grains are sub-voices inside the instrument's budget, NOT top-level voices.
- **SEED-DERIVATION FORMULA (pinned — executors implement THIS byte-for-byte, no improvisation):** REUSE `backend/src/engine/determinism.py` (VERIFIED on main: `derive_seed(project_seed, effect_id, frame_index, user_seed=0)` = `int(sha256(f"{project_seed}:{effect_id}:{frame_index}:{user_seed}".encode()).hexdigest()[:16], 16)` and `make_rng(seed)` = `np.random.default_rng(seed)`). Per grain: `grain_seed = derive_seed(project_seed, f"gran:{instrument_id}:{grain_index}", frame_index)`; `rng = make_rng(grain_seed)`. **Fixed draw order per grain (part of the determinism contract):** T-jitter, Y-jitter, X-jitter, C-jitter, F-jitter, L-jitter (the L draw is CONSUMED even while L is inert behind its flag, so flag-enabling L later does NOT shift the other axes' values), then window-phase. Changing the key string, draw order, or RNG bit-generator is a determinism break — requires a DEC note + golden-vector regeneration.
- **Scope:** new `backend/src/instruments/granulator_instrument.py` (name avoids the 3 existing effect modules), `backend/src/security.py` (`MAX_GRAINS` append), `backend/tests/test_instruments/test_granulator_engine.py`. L-axis params accepted but inert behind SG-3-gated flag (P5b.18).
- **DO-NOT-TOUCH:** `backend/src/effects/fx/granulator.py` + both spectral granulators (different products); zmq_server; frontend.
- **Steps:** grain spawn (seeded positions/jitter) → axis-interval sampling spec (returns grain descriptors; pixel work in P5b.17) → window + env evaluation → all numerics clamped+finite at the constructor trust boundary.
- **TEST PLAN:** named: `test_seeded_replay_identical_grain_set`, `test_seed_derivation_matches_pinned_formula` (hand-computed sha256 vector for a known `(project_seed, instrument_id, frame_index, grain_index)` tuple), `test_hash_seed_frame_grain_indexing`, `test_max_grains_cap_enforced`, `test_density_zero_yields_empty_cloud`, `test_all_axis_numerics_clamped_finite`, `test_window_shapes_hann_tri_rect`, `test_grain_env_per_axis_evaluated`, `test_l_axis_inert_without_flag`, `test_l_axis_draw_consumed_while_inert_keeps_other_axes_stable` (flag-flip does not shift T/Y/X/C/F values). Full backend suite.
- **ACCEPTANCE GATES:** same (seed, frameIndex) → identical descriptors across 100 runs; cap unbypassable; module import-clean alongside the 3 effect granulators.
- **ROLLBACK:** revert PR — additive.
- **EVIDENCE:** pytest output; descriptor-hash stability printout.

### P5b.17 — B8 render integration: compositing grains + budget degrade · RISK:HIGH (perf)

- **ID:** P5b.17 · **Branch:** `feat/p5b-b8-render` · **Base:** `origin/main` · **Est:** ~4h · **Model:** Opus/Fable (RISK:HIGH)
- **Depends-on:** P5b.16; **Phase-5a B5 merged** (B8 IN-gate: B5 + SG-1 + SG-3 + SG-8).
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  git grep -n "MAX_GRAINS" origin/main -- backend/src/security.py            # non-empty — else STOP
  git grep -rln "RackNode" origin/main -- frontend/src | head -2             # B5 proof — EMPTY → STOP
  ```
- **Goal:** Granulator instrument renders: each grain samples source at `position+jitter` over its axis-intervals, windowed+enveloped, composited into ONE output layer (CPU/numpy first; the GPU quad pass is the carved-out Phase-5c item). Render-budget guard degrades `density` when frame eval > 16ms; SG-8 degrade order (latent grains → spectral → density) registered.
- **Scope (VERIFIED paths):** `backend/src/zmq_server.py` `_handle_render_composite` new `granulator` arm; `backend/src/instruments/granulator_instrument.py` pixel path; SG-8 `FeatureRegistry` registration; tests.
- **DO-NOT-TOUCH:** other layer arms; composite state keying; preview seed.
- **TEST PLAN:** named: `test_grain_composite_single_output_layer`, `test_render_budget_degrades_density_over_16ms` (synthetic slow path), `test_sg8_pressure_halves_density`, `test_grain_count_cap_at_render`, `test_malformed_granulator_layer_rejected_pre_decode`. Full backend suite + a perf smoke documenting ms/frame at density={16,64,200} (200-grain CPU number is the GPU-pass justification — record it).
- **ACCEPTANCE GATES:** one layer out; 16ms guard provably fires; degrade never crashes mid-frame.
- **ROLLBACK:** revert; dispatch arm named in commit body.
- **EVIDENCE:** perf table in PR body; pytest output.

### P5b.18 — B8 selection rules: random/onset/scenePayload + flag-gated latentSimilarity · RISK:HIGH (SG-3 boundary)

- **ID:** P5b.18 · **Branch:** `feat/p5b-b8-selection` · **Base:** `origin/main` · **Est:** ~4h · **Model:** Opus/Fable (RISK:HIGH)
- **Depends-on:** P5b.17.
- **PRECONDITIONS:** `git grep -n "granulator" origin/main -- backend/src/zmq_server.py` non-empty — else STOP.
- **Goal:** `selection: 'random' | 'onset' | 'scenePayload'` implemented (`random` seeded; `onset` from existing audio analysis — read `modulation/audio_follower.py` first, VERIFIED exists; `scenePayload` from cut metadata if a scene-detection source exists on main — **verify with `git grep -rn "scene" backend/src/ | head`; if no scene metadata source exists, implement `scenePayload` as schema-reserved + validator-rejected, mirroring the SPEC-2 tier-gating pattern, and say so in the PR**). `latentSimilarity` stays schema-reserved behind an SG-3-coupled flag; selecting it without the flag → schema rejection at load (build-plan B9-style trust-boundary rule applied to B8).
- **Scope:** `granulator_instrument.py` selection dispatch; `backend/src/project/schema.py` (VERIFIED) load-time rejection of flagged selection values; NaN-sentinel call on any latent read (consumes P5b.5 seam); tests.
- **DO-NOT-TOUCH:** sentinel internals; onset analysis algorithms (consume only).
- **TEST PLAN:** named: `test_random_selection_seeded_deterministic`, `test_onset_selection_uses_audio_triggers`, `test_latent_similarity_rejected_at_load_when_flag_off`, `test_latent_path_nan_sentinel_aborts_lane_and_toasts` (integration w/ P5b.4 gate), `test_scene_payload_behavior_or_reserved` (per the survey result). Full backend suite.
- **ACCEPTANCE GATES:** flag-off project files with `latentSimilarity` rejected at `schema.py` — NOT just hidden in UI; sentinel demonstrably fires on a synthetic OOD latent.
- **ROLLBACK:** revert PR.
- **EVIDENCE:** pytest output incl. the schema-rejection error text.

### P5b.19 — B8 UI: device panel + grain-cloud visualization

- **ID:** P5b.19 · **Branch:** `feat/p5b-b8-ui` · **Base:** `origin/main` · **Est:** ~4h · **Model:** Sonnet
- **Depends-on:** P5b.18.
- **PRECONDITIONS:** `git grep -n "granulator" origin/main -- backend/src/zmq_server.py` non-empty; instruments browser tab present (same check as P5b.11) — else STOP.
- **Goal:** Build-plan B8 UI: per-axis density/size/jitter/position knobs, selection-rule picker, per-axis envelope mini-editors, live grain-cloud visualization (Kentaro density-without-clutter principle).
- **Scope:** new `frontend/.../instruments/GranulatorDevice.tsx` + `buildGranulatorLayer.ts` (B1 pattern, read first), `components/instruments/types.ts` append, `stores/instruments.ts`, viz as canvas/SVG fed from grain descriptors (preview-rate, decimated), Vitest.
- **DO-NOT-TOUCH:** root layout grid; existing device components' behavior; research-flag default (off).
- **TEST PLAN:** Vitest named: `all six axes render knob rows`, `numerics clamped at input`, `selection picker hides latentSimilarity when flag off`, `viz renders N<=cap markers`, `layer dict matches backend contract`, `deselect/unmount cleans listeners` (Gate 14 wiring checklist), `full chain: density knob change → store → granulator layer payload carries the new density (mock IPC, asserts the exact dict)`. Full vitest suite.
- **ACCEPTANCE GATES:** instrument playable end-to-end (drop → tweak → render) — verified LIVE per Gate 18 (app launched from the edited worktree, `ps aux | grep -i electron` path check; relaunch after store-shape changes); no dead props; flag-off UI cannot author a flag-on file.
- **ROLLBACK:** revert PR — additive.
- **EVIDENCE:** vitest output + screen capture of grain-cloud viz while sweeping density.

### P5b.20 — B8 determinism + gate-compliance campaign (export-path)

- **ID:** P5b.20 · **Branch:** `feat/p5b-b8-determinism` · **Base:** `origin/main` · **Est:** ~3h · **Model:** Sonnet
- **Depends-on:** P5b.19.
- **PRECONDITIONS:** `git grep -n "GranulatorDevice" origin/main -- frontend/src` non-empty — else STOP.
- **Goal:** B8 OUT-gates: seeded grain replay byte-identical on the **export path** (export-path-only rule, §0.4 as corrected — preview uses the project-store seed); SG-8 density degrade under pressure during export; GPU leak == 0 (pool accounting; Mock until Metal); malformed-event fuzz.
- **Scope:** fixture project + `backend/tests/test_instruments/test_granulator_determinism.py`; bugfixes it flushes (separately revertable commits).
- **TEST PLAN:** named: `test_seeded_export_byte_identical_x2`, `test_edit_after_capture_export_identical`, `test_sg8_degrade_during_export_no_crash_and_logged`, `test_gpu_pool_leak_zero_after_500_frames`, `test_fuzz_malformed_grain_params_rejected`. Full backend suite.
- **ACCEPTANCE GATES:** byte-identity ×2; **B8-core done**; follow-up packets P5b.28 (GPU pass) + P5b.29 (latentSimilarity) referenced in the PR body (they are packetized in Track I — no loose issues).
- **ROLLBACK:** revert.
- **EVIDENCE:** export hash pairs; leak-counter printout.

---

## Track G — B9 Tensor mod-routing + Y-as-time · gated PR-C + SG-5 (Track C) (+SG-3 for `learned`)

> **Schema ground truth (VERIFIED, critical):** `OperatorMapping` on main is the OLD shape (`types.ts:401` — `targetEffectId`/`targetParamKey`, no axis fields). SPEC-2's snake_case axis-extended shape does NOT exist yet; #158 (open) wires `axisBinding` on lanes. B9 **consumes** the PR-B/SPEC-2 extensions — it must NOT declare a parallel `ModEdge` (build-plan review P2-A). P5b.21's preconditions police this.

### P5b.21 — B9 schema: axis-extended OperatorMapping + lockstep validator widening + load-time flag-rejection · RISK:HIGH (schema break coordination)

- **ID:** P5b.21 · **Branch:** `feat/p5b-b9-schema` · **Base:** `origin/main` · **Est:** ~4h · **Model:** Opus/Fable (RISK:HIGH)
- **Depends-on:** PR-B slices #157/#158 merged (automation unify + axis-binding store wiring).
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  git grep -n "isTrigger" origin/main -- frontend/src/shared/types.ts
  #   MUST be EMPTY (PR-B slice-1 #157 merged removes it) — non-empty → STOP, B9 is premature
  git grep -n "axisBinding" origin/main -- frontend/src/shared/types.ts frontend/src/renderer/stores/automation.ts | head -3
  #   MUST be non-empty (#158 merged) — else STOP
  git grep -n "TIER_1_BINDING_RULES" origin/main -- frontend/src/shared/axis-binding.ts   # non-empty (VERIFIED today) — else STOP
  git grep -n "src_axis\|srcAxis" origin/main -- frontend/src/shared/types.ts
  #   EMPTY = this packet adds them; non-empty = someone already extended OperatorMapping → re-scope to widening only
  git grep -n "MAX_MOD_EDGES_TOTAL" origin/main -- backend/src/security.py
  #   MUST be EMPTY (this packet adds it; distinct from P5a.11's MAX_MACRO_EDGES_TOTAL macro-route cap) — non-empty → re-scope, STOP
  ```
- **Goal:** (1) extend `OperatorMapping` with optional `srcAxis`/`dstAxis`/`bindingRule` (camelCase TS ↔ snake_case Python via the existing IPC serialization layer — repo convention, VERIFIED in CLAUDE.md) defaulting `'t'/'t'/'broadcast'`; (2) **widen the tier accept-set from `{broadcast}` to `{broadcast, sampleAt, scanOver, integrate}` IN THE SAME PR as the renderer impl lands** — per SPEC-2 §3.1 + SPEC-6 Lint-3 the widening must be lockstep. **Pre-decided: P5b.21 + P5b.22 ship as ONE PR** (one branch, both packets' scopes and test plans; Lint-3 satisfied by construction); (3) `backend/src/project/schema.py` rejects (or coerces to `broadcast` — pick REJECT, matching SPEC-2 §4's no-silent-fallback row) any `bindingRule` outside the accept-set and any flagged rule (`painted/hilbert/polar/learned`) with flag off — **the trust boundary is the loader, not the UI** (build-plan B9 flag-enforcement paragraph).
- **Scope (VERIFIED paths):** `frontend/src/shared/types.ts` (OperatorMapping append), `frontend/src/shared/axis-binding.ts` (tier constant), `frontend/src/renderer/stores/operators.ts` (validator on `addMapping/updateMapping` — VERIFIED those actions at l.162/211), `frontend/src/renderer/stores/automation.ts`, `backend/src/project/schema.py`, `backend/src/security.py` (`MAX_MOD_EDGES_TOTAL` append — mod-routing edge cap, distinct from P5a.11's `MAX_MACRO_EDGES_TOTAL`), tests both layers.
- **DO-NOT-TOUCH:** the 8-member `BindingRule` union itself (already canonical on main); lane evaluation renderer (P5b.22/23); `.dna` round-trip rules (SPEC-6 territory).
- **TEST PLAN:** Vitest: `accepts broadcast/sampleAt/scanOver/integrate post-widening`, `rejects painted on save when flag off`, `rejects hilbert on save when flag off`, `rejects polar on save when flag off`, `rejects learned on save when flag off` (one named case PER research rule — the 8-member `BindingRule` union on main is `broadcast|sampleAt|scanOver|integrate|painted|hilbert|polar|learned`, VERIFIED `axis-binding.ts:32-40`; a single parametrized loop hides which rule regressed), `old mapping without axis fields gets defaults`, `non-finite depth rejected`. pytest `tests/test_project/test_b9_schema.py`: `test_load_rejects_painted_flag_off`, `test_load_rejects_hilbert_flag_off`, `test_load_rejects_polar_flag_off`, `test_load_rejects_learned_flag_off` (per-rule load negatives mirroring the Vitest four), `test_load_rejects_unknown_binding_rule` (e.g. `'zigzag'` — outside the union entirely), `test_load_rejects_nonstring_binding_rule` (number/null/object), `test_load_accepts_defaults_for_missing_fields`, `test_max_mod_edges_total_enforced`, `test_hand_edited_learned_rule_rejected_with_clear_error`. Full suites.
- **ACCEPTANCE GATES:** SPEC-2 §8 checklist rows for validator + backward-compat pass; a hand-edited project file with `bindingRule:'learned'` fails to load with a clear error.
- **ROLLBACK:** revert PR — fields optional, removal restores old behavior (SPEC-2 §10 pattern).
- **EVIDENCE:** vitest+pytest output; the rejection error message text.

### P5b.22 — B9 engine: binding-rule semantics (broadcast / sampleAt / scanOver / integrate)

- **ID:** P5b.22 · **Branch:** `feat/p5b-b9-engine-rules` · **Base:** `origin/main` · **Est:** ~4h · **Model:** Opus/Fable (ships inside P5b.21's RISK:HIGH PR — same executor, same model)
- **Depends-on:** P5b.21 + P5b.8 (SG-5 GREEN) + PR-C merged (operators surface).
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  git grep -n "srcAxis" origin/main -- frontend/src/shared/types.ts                  # non-empty (P5b.21) — else STOP
  git grep -n "test_cycle_break_deterministic" origin/main -- backend/tests/ -r | head -2  # SG-5 part B merged — else STOP
  git grep -rln "kentaroCluster" origin/main -- frontend/src | head -2               # PR-C proof — EMPTY → STOP (B9 IN-gate: PR-C)
  ```
- **Goal:** Modulation resolver maps a source value over `srcAxis` to a destination over `dstAxis`: `broadcast` (scalar→all, existing behavior + annotation), `sampleAt` (index), `scanOver` (per-row/col vector), `integrate` (cumulative). Destinations scalar OR field(2D) when `dstAxis` spatial — **field-dst behind a flag** (build-plan: B9 ships scalar + scanOver; field-dst flagged).
- **Scope (VERIFIED paths):** `backend/src/modulation/engine.py` + `backend/src/modulation/routing.py` (`resolve_routings` — read first), axis-edge extension to the SG-5 adapter (P5b.7's), `frontend/.../performance/applyCCModulations.ts` only if live-preview parity demands (export authority is backend), tests.
- **DO-NOT-TOUCH:** `_topological_sort` core; SG-5 break ordering; effect param schemas.
- **TEST PLAN:** pytest named: `test_broadcast_identical_to_legacy_scalar`, `test_sampleAt_reads_single_index`, `test_scanOver_produces_per_row_vector`, `test_integrate_cumulative_over_axis`, `test_field_destination_rejected_flag_off`, `test_axis_edge_cycle_detected_via_sg5` (direct/n-hop/axis-bound per build-plan test list), `test_edge_depth_clamped_finite`. Full backend suite.
- **ACCEPTANCE GATES:** per-binding-rule correctness vs hand-computed fixtures; legacy projects render byte-identically (broadcast == old behavior); Lint-3 lockstep satisfied by construction — **P5b.21 + P5b.22 ship as ONE PR (pre-decided, see P5b.21)**.
- **ROLLBACK:** revert; broadcast-only behavior restored, schema stays (validator re-narrows via the P5b.21 guard).
- **EVIDENCE:** pytest output; fixture-vs-output diffs.

### P5b.23 — B9 Y-as-time: per-instrument `timeAxis` switch (the felt primitive)

- **ID:** P5b.23 · **Branch:** `feat/p5b-b9-y-as-time` · **Base:** `origin/main` · **Est:** ~3.5h · **Model:** Sonnet
- **Depends-on:** P5b.22.
- **PRECONDITIONS:** `git grep -n "scanOver" origin/main -- backend/src/modulation/` non-empty — else STOP.
- **Goal:** Vision C1 / build-plan "Y-as-time first": per-instrument `timeAxis: 't'|'y'|'x'` — `'y'` advances the playhead down image rows (slit-scan/scanline-as-time). Cheap, felt, shippable; the general tensor is P5b.22 on top. NOTE (ROADMAP G4, VERIFIED): #158 deferred the per-scanline render unlock to C2/C3 — this packet delivers the instrument-scoped version only (sampler/frame-bank footage indexing by row), NOT the per-pixel param-field general case.
- **Scope (VERIFIED paths):** `components/instruments/types.ts` (`timeAxis` on Sampler + FrameBank types — field already designed in build plan §3 B6), `buildSamplerLayer.ts`/`buildFrameBankLayer.ts` (pass through), backend sampler/frame-bank arms (row-indexed footage resolve), tests + one committed demo fixture.
- **DO-NOT-TOUCH:** lane `domain` evaluation (that's #158/C2-C3 territory); effects.
- **TEST PLAN:** pytest: `test_timeaxis_y_rows_advance_through_footage` (output row r == source frame f(r) — hand-computed slit-scan fixture), `test_timeaxis_x_symmetric`, `test_timeaxis_t_unchanged_legacy`, `test_lowercase_axis_only_rejects_uppercase` (P1-A canon). Vitest: `timeAxis selector renders 3 options`, `default t`. Full suites.
- **ACCEPTANCE GATES:** visible slit-scan output on the demo fixture; legacy `t` path byte-identical; selector verified live per Gate 18 (app launched from the edited worktree, `ps aux | grep -i electron` path check).
- **ROLLBACK:** revert PR.
- **EVIDENCE:** slit-scan output frame attached; pytest output.

### P5b.24 — B9 routing inspector UI: topology graph + per-edge axis pickers

- **ID:** P5b.24 · **Branch:** `feat/p5b-b9-routing-ui` · **Base:** `origin/main` · **Est:** ~4h · **Model:** Sonnet
- **Depends-on:** P5b.22; PR-C merged (its xyflow topology graph is the substrate — VERIFY).
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  git grep -rln "xyflow\|react-flow" origin/main -- frontend/src frontend/package.json | head -2
  git grep -rln "OperatorTopologyGraph" origin/main -- frontend/src | head -2
  #   PASS if EITHER xyflow is present OR OperatorTopologyGraph.tsx (P4.5's bare-SVG FAIL-branch implementation) is present —
  #   both EMPTY → PR-C's graph substrate absent → STOP (do not hand-roll a parallel graph lib; feedback_read-existing-component-before-parallel-build)
  git grep -n "scanOver" origin/main -- backend/src/modulation/   # P5b.22 merged — else STOP
  ```
- **Goal:** Build-plan B9 UI: compact topology graph (modulator→target lines, depth = line thickness, color per source), per-edge `srcAxis`/`dstAxis` pickers + binding-rule + depth arc (Bitwig-style); painted/learned hidden behind the research toggle; `cycle_safe_edge_addition` (P5b.6's, VERIFIED in `cycle_detection.py`) called as the pre-flight check before committing an edge add.
- **Scope:** extend PR-C's operator topology surface in place (READ it first), `stores/operators.ts` edge mutations call the pre-flight via IPC, Vitest.
- **DO-NOT-TOUCH:** PR-C graph internals beyond the extension seam; flag defaults.
- **TEST PLAN:** Vitest named: `edge add blocked when cycle_safe_edge_addition returns false`, `depth renders as thickness`, `research rules hidden when toggle off`, `axis pickers write srcAxis/dstAxis through validator`, `edge delete cleans store + undo symmetric`. Full vitest; one Playwright smoke if the surface is reachable headless (`npx playwright test` tagged spec). **Live-runtime step (Gate 18):** in the running app launched from the edited worktree (`ps aux | grep -i electron` path check), attempt a cycle-forming edge add and see the rejection live before claiming ready.
- **ACCEPTANCE GATES:** user cannot author a cycle from the UI (pre-flight) — and if a file sneaks one in, SG-5 breaks it deterministically (defense in depth); **B9 done**.
- **ROLLBACK:** revert PR.
- **EVIDENCE:** vitest output; screen capture of edge-add rejection.

---

## Track H — B10 Live performance affordances · gated B2 + B4 + SG-8

### P5b.25 — B10 MIDI Learn hardening: rate-limit + persistence round-trip

- **ID:** P5b.25 · **Branch:** `feat/p5b-b10-midi-ratelimit` · **Base:** `origin/main` · **Est:** ~3h · **Model:** Sonnet
- **Depends-on:** P5b.1 (SG-8); Phase-5a B2+B4 (B10 IN-gate).
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  git grep -n "MAX_TOTAL_VOICES_PER_RENDER" origin/main -- backend/src/security.py   # B2 proof — EMPTY → STOP
  git grep -rln "RackNode" origin/main -- frontend/src | head -2                      # B4 proof — EMPTY → STOP
  git grep -n "learnTarget" origin/main -- frontend/src/renderer/stores/midi.ts       # non-empty (VERIFIED today) — else re-survey
  ```
- **Goal:** Build-plan B10: MIDI map `{controlId → {target, kind, min, max}}` persisted in project + **input rate-limit** (reuse the toast store's 2s-dedup-by-source pattern conceptually — a stuck controller can't thrash voice-steal or balloon the capture buffer) + echo-suppression seam (SG-H3) for motorized faders.
- **Scope (VERIFIED paths):** `frontend/src/renderer/stores/midi.ts` (rate limiter on the message intake at the `handleMIDIMessage` seam — read l.75+ first), `frontend/src/shared/midi-utils.ts`, project persistence of `CCMapping`/pad maps (locate via `git grep -n "MIDIPersistData"` — type VERIFIED in midi.ts imports), Vitest.
- **DO-NOT-TOUCH:** `useMIDI.ts` device enumeration; pad trigger semantics (P5b.26).
- **TEST PLAN:** Vitest named: `flood of identical CC drops to the limit rate (1 kHz flood for 2 s → ≤ 60 store writes for that controlId; min inter-write interval 33 ms ≈ 30 writes/s)`, `distinct controls not cross-limited`, `learn mode still single-shot under flood`, `midi map round-trips through project save/load`, `echo within suppression window ignored`, `malformed midi bytes never crash` (chaos-mode inputs, negative). Full vitest.
- **ACCEPTANCE GATES:** synthetic 1 kHz CC flood → ≤ 30 store writes/s per controlId (quantified; the 33 ms floor is the constant under test); map survives save/reload byte-equal.
- **ROLLBACK:** revert PR.
- **EVIDENCE:** vitest output incl. flood-test counters.

### P5b.26 — B10 Freeze↔voice FSM: queue-by-frameIndex + double-bake guard · RISK:HIGH (attack-ramp/`isActive` bug class)

- **ID:** P5b.26 · **Branch:** `feat/p5b-b10-freeze-fsm` · **Base:** `origin/main` · **Est:** ~4h · **Model:** Opus/Fable (RISK:HIGH)
- **Depends-on:** P5b.25's preconditions (B2+B4) — same STOP checks apply.
- **PRECONDITIONS (mismatch → STOP):** B2/B4 probes as P5b.25, plus:
  ```bash
  git grep -n "operationState" origin/main -- frontend/src/renderer/stores/freeze.ts   # non-empty (VERIFIED: FreezeOp idle|freezing|unfreezing|flattening) — else re-survey
  ```
- **Goal:** The build-plan FSM, with the three pinned-down behaviors: (1) **mid-freeze triggers QUEUE by `frameIndex`, never Promise-resolution time** (capture-replay byte-identity depends on it); (2) **freeze-FAILURE branch explicit** — `freeze.ts` already pattern-matches `finally → idle` (VERIFIED at l.72); queued triggers drain against PRE-freeze state on failure, against FROZEN on success; (3) **double-bake guard** — bake snapshot excludes queued-but-unapplied voices (neither baked nor lost). This packet INTRODUCES the freeze↔padStates coupling (today decoupled, VERIFIED build-plan note).
- **Scope (VERIFIED paths):** `frontend/src/renderer/stores/freeze.ts` (FSM states + queue), `frontend/src/renderer/stores/performance.ts` (voice slot free/restore), `frontend/src/renderer/components/performance/padActions.ts` (**replace `performance.now()` at l.25,45 with `{frameIndex, eventIndex}` — VERIFIED determinism violation, also a B2 capture-schema item; if B2 already fixed it, this is a no-op — check first**), `backend/src/engine/freeze.py` only if bake snapshot needs backend awareness (read first), Vitest + one Playwright E2E.
- **DO-NOT-TOUCH:** freeze cache file format; `FreezeOverlay.tsx` visuals beyond state labels; export.
- **TEST PLAN:** Vitest named (the build-plan OUT-gates verbatim): `mid-freeze trigger is QUEUED not orphaned or baked`, `queue drains by frameIndex order not promise time`, `bake error drains queue against pre-freeze state`, `cancel drains against pre-freeze and frees no slots`, `double-bake guard excludes queued voices from snapshot`, `freeze frees voice slots deterministically`. Playwright: freeze a track while hammering pads → no orphaned voices (UI count == store count). Full suites.
- **ACCEPTANCE GATES:** all six named tests green; capture-replay of a session containing a mid-freeze trigger is byte-identical ×2 (export path).
- **ROLLBACK:** revert PR; commit body lists the freeze.ts/performance.ts hunks (non-additive edits).
- **EVIDENCE:** vitest+playwright output; replay hash pair.

### P5b.27 — B10 quantized launch + panic key + retro-capture (events-only)

- **ID:** P5b.27 · **Branch:** `feat/p5b-b10-launch-panic-capture` · **Base:** `origin/main` · **Est:** ~4h · **Model:** Sonnet
- **Depends-on:** P5b.26.
- **PRECONDITIONS:** `git grep -n "QUEUED\|drainQueue\|queueByFrame" origin/main -- frontend/src/renderer/stores/freeze.ts | head -2` non-empty (P5b.26 merged) — else STOP.
- **Goal:** (1) **Quantized launch:** triggers snap to the next division of the existing edit/slice grid (no footage warp — resolved decision §15), OFF by default; (2) **Panic:** existing `panicAll` (`performance.ts:66,155`, VERIFIED) bound to a hard key via the shortcut table (repo CLAUDE.md owns the table — update it, per `feedback_update-docs-before-reporting`); (3) **Retro-capture:** rolling event buffer dumped as events onto the Performance Track — **events ONLY** `{frameIndex, eventIndex, note, velocity}`, no `performance.now()`, no embedded mutable mappings (resolved decision §6.4; P5b.26 already converted padActions timestamps).
- **Scope (VERIFIED paths):** `stores/performance.ts` (quantize + capture ring buffer), grid source (read `stores/timeline.ts` for the edit/slice grid the repo already quantizes Cmd+U against — VERIFIED shortcut exists), keyboard handler where existing shortcuts live, capture-dump writes events to the performance track's lane/clip model (B2's event schema), repo `CLAUDE.md` shortcut table row, Vitest.
- **DO-NOT-TOUCH:** footage timing (quantize snaps TRIGGERS, never warps footage); toast store; export.
- **TEST PLAN:** Vitest named: `quantize off by default`, `trigger snaps to next grid division`, `panic clears all voices including queued`, `capture buffer is events-only schema` (assert no `performance.now` value shape), `capture dump replays byte-identical incl edit-after-capture`, `buffer bounded under flood: ring buffer capped at MAX_CAPTURE_EVENTS = 10_000 events — the same security.py constant Phase-5a P5a.4 adds (if P5a.4 is unmerged at execution, THIS packet adds it); oldest events evicted, never unbounded` (couples with P5b.25 limiter). Playwright: panic key during playback clears pads. Full suites.
- **ACCEPTANCE GATES:** build-plan B10 OUT-gates all green across P5b.25–27 → **B10 done**; retro-capture replay byte-identical (export path).
- **ROLLBACK:** revert PR.
- **EVIDENCE:** vitest+playwright output; capture-replay hash pair; CLAUDE.md diff line.

---

## Track I — B8 follow-ups (carved out of Track F's B8-core; appended 2026-06-11)

### P5b.28 — B8 GPU grain-render pass: Metal binding via the SG-1 seam + textured-quad compositor · RISK:HIGH (first real Metal binding; perf)

- **ID:** P5b.28 · **Branch:** `feat/p5b-b8-gpu-grains` · **Base:** `origin/main` · **Est:** ~4h (if the Metal binding alone exceeds ~4h, ship binding+tests as P5b.28a and the quad pass as P5b.28b — do not half-integrate) · **Model:** Opus/Fable (RISK:HIGH)
- **Depends-on:** P5b.20 merged (B8-core done; its P5b.17 perf table at density={16,64,200} is the CPU baseline this packet must beat).
- **Goal:** The carved-out GPU pass: composite up to `MAX_GRAINS` (≈200) grains/frame as textured quads on Metal, behind the SG-1 resource contract. `gpu_resources.py`'s docstring (VERIFIED) says the real Metal/MLX binding "lands in the first Tier 2 effect PR that needs Metal" — **this is that PR**: every Metal handle wrapped in an SG-1 `GPUResource` implementation, pooled via `GPUResourcePool` (VERIFIED API on main: `acquire/release/touch/pin/unpin/get/destroy_all/stats`, `EvictionPolicy.LRU|FAIL`, `PoolExhausted`, `DestroyedHandleError`, `GlobalPoolRegistry`). **Determinism rule (§0.4 + B7 P5b.15 precedent): the GPU pass is PREVIEW-ONLY; export stays on the deterministic CPU path.** Promoting GPU output into exports requires a separate packet proving byte-identity — not this one.
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  git grep -n "granulator" origin/main -- backend/src/zmq_server.py                 # B8 render arm merged (P5b.17) — else STOP
  git grep -n "test_seeded_export_byte_identical_x2" origin/main -- backend/tests/ -r | head -2  # P5b.20 merged — else STOP
  git grep -n "class GPUResourcePool" origin/main -- backend/src/safety/gpu_resources.py  # SG-1 lib — else STOP
  git grep -rln "MTLDevice\|MTLTexture\|import Metal\|import mlx" origin/main -- backend/src | head -3
  #   MUST be EMPTY (no real Metal binding exists yet; #163 deferred it) — non-empty → a binding landed elsewhere, re-scope to CONSUME it, STOP
  ```
- **Scope (VERIFIED seams):** new `backend/src/safety/metal_binding.py` (real `GPUResource` implementations for texture/buffer/pipeline handles — satisfies the Protocol incl. `destroy()` idempotence, `raw` raising `DestroyedHandleError` after free, `size_bytes`, the `weakref.finalize` RAII fallback); new `backend/src/instruments/granulator_gpu.py` (quad batcher: grain descriptors from P5b.16 → instanced textured quads, one draw per frame); `backend/src/instruments/granulator_instrument.py` + `zmq_server.py` granulator arm gain `render_path: 'cpu'|'gpu'` (default `'cpu'`, auto-fallback to cpu on any GPU error — never crash); SG-8: texture pool registered so stage 6 `gpu_texture_pool_released` (@85%, VERIFIED `degrade_order.py` order=6) calls `destroy_all()`; `backend/src/security.py` (clamp any new numerics); `backend/tests/test_instruments/test_granulator_gpu.py`.
- **DO-NOT-TOUCH:** the CPU grain path (P5b.16/17 — regression-guard byte-identity); `engine/export.py` (export never selects `'gpu'`); `gpu_resources.py` pool internals (consume, don't fork); preview seeding.
- **Steps:** (1) `metal_binding.py` wrappers + pool wiring (read `gpu_resources.py` forbidden-patterns list first — no raw `makeTexture()` outside wrappers, no module-level Metal objects); (2) quad batcher mapping grain descriptors (position/size/window alpha) to instanced quads; (3) `render_path` dispatch + auto-fallback; (4) SG-8 stage-6 hook; (5) perf capture at 1080p, density={16,64,200}, vs the P5b.17 CPU table.
- **TEST PLAN:** `python -m pytest tests/test_instruments/test_granulator_gpu.py -x --tb=short` — named: `test_gpu_vs_cpu_pixel_tolerance` (**the gate**: same seed/params/frame, max per-channel abs diff ≤ 2/255 and mean abs diff ≤ 0.5/255 at density=64, 1080p), `test_gpu_pass_200_grains_1080p_under_16ms` (**perf target**: median over 100 frames < 16ms on the M4; record the number), `test_gpu_error_falls_back_to_cpu_not_crash`, `test_export_never_uses_gpu_path` (export request with `render_path:'gpu'` is coerced to cpu + logged), `test_pool_leak_zero_after_500_frames` (pool accounting; finalizer-free counter == 0), `test_sg8_stage6_releases_texture_pool_and_renders_continue`, `test_use_after_destroy_raises_destroyed_handle_error`. **All Metal-requiring tests skip-marked-with-explicit-reason when no Metal device (CI) — never silent-pass** (`feedback_silent-exception-swallowing`); the tolerance + perf gates MUST be run-and-pasted from the M4 before merge. Full backend suite.
- **ACCEPTANCE GATES:** pixel tolerance holds at all three densities; 200 grains @1080p < 16ms (vs CPU baseline — paste both); GPU-handle leak == 0; CPU path byte-identical to pre-packet (regression hash); export untouched.
- **ROLLBACK:** revert PR — `render_path` defaults `'cpu'`; binding + batcher are additive modules.
- **EVIDENCE:** CPU-vs-GPU perf table (density {16,64,200} @1080p); pixel-diff stats; pool `stats()` after the 500-frame soak; pytest output.

### P5b.29 — B8 `latentSimilarity` grain selection: L-distance pool filtering · RISK:HIGH (Q7-GATED + SG-3 boundary)

- **ID:** P5b.29 · **Branch:** `feat/p5b-b8-latent-similarity` · **Base:** `origin/main` · **Est:** ~4h · **Model:** Opus/Fable (RISK:HIGH)
- **Depends-on:** P5b.18 merged (selection dispatch + flag-off schema rejection), P5b.5 merged (SG-3 GREEN, `MAX_L2_NORM_PER_BACKBONE` seam), **Q7 REAL verdict (G-CHECK below)**.
- **Q7 GATE — this packet runs the phase-7 G-CHECK verbatim before anything else (gates packet START; the test suite below runs on mocked L vectors, so CI never needs the live backbone). Block kept at column 0 so the heredoc terminator survives copy-paste:**

```bash
python3 - <<'EOF'
import json, pathlib, sys
p = pathlib.Path.home() / ".entropic" / "q7-report.json"
if not p.exists():
    sys.exit("STOP: REAL Q7 verdict file missing at ~/.entropic/q7-report.json. Run P7.0.")
d = json.loads(p.read_text())
if d.get("backend") == "mock":
    sys.exit("STOP: verdict file is from the MOCK backend. Not acceptable. Run P7.0.")
state = d.get("verdict", {}).get("state")
if state != "TIER_5_GO":
    sys.exit(f"STOP: verdict is {state!r}. Phase 7 is gated. See P7.0N (NO-GO branch).")
print(f"GATE OK: TIER_5_GO on backend={d['backend']} p95={d['verdict']['canonical_p95_ms']}ms")
EOF
```
- **PRECONDITIONS (after G-CHECK; mismatch → STOP):**
  ```bash
  git grep -n "latentSimilarity\|latent_similarity" origin/main -- backend/src/project/schema.py   # P5b.18's flag-off load rejection present — else STOP
  git grep -n "MAX_L2_NORM_PER_BACKBONE" origin/main -- backend/src/safety/latent_sentinel.py      # P5b.5 per-backbone ceiling seam — else STOP
  git grep -n "selection" origin/main -- backend/src/instruments/granulator_instrument.py | head -3 # P5b.18 selection dispatch — else STOP
  git grep -rn "LatentProvider" origin/main -- backend/src | head -2
  #   EMPTY = this packet defines the provider seam; non-empty = Phase-7 landed one (P7.10+) → CONSUME it, do not declare a parallel protocol
  ```
- **Goal:** Implement `selection:'latentSimilarity'` behind the SG-3-coupled research flag: the grain source-frame pool is filtered by **L-vector distance** — given a target L vector (current playhead frame, or a user-pinned anchor frame), candidate source frames are ranked by L2 distance and the pool = top-k within `maxDistance`, deterministic tie-break by ascending frame index. L vectors arrive through a `LatentProvider` seam (protocol: `get_l_vector(frame_ref) -> ndarray | None`) so unit tests inject **mocked vectors** — the packet is fully testable pre-verdict; only flag-enable + live-backbone wiring is what the G-CHECK gates. **Every** latent read passes SG-3 (`check_and_clamp`/`batch_validate` + `MAX_L2_NORM_PER_BACKBONE`); a NaN/Inf/OOD latent aborts the lane via the P5b.4 gate, never silently degrades selection.
- **Scope (VERIFIED seams):** `backend/src/instruments/granulator_instrument.py` (selection arm); new `backend/src/instruments/latent_pool.py` (pure distance filter: `filter_pool(candidates, target, k, max_distance) -> list[SlotRef]`); `backend/src/project/schema.py` (flip: ACCEPT `latentSimilarity` when the research flag is ON — load-time, mirroring P5b.18's reject-when-off, which stays); `backend/src/safety/latent_sentinel.py` consumed only; `backend/src/security.py` (clamp `k`, `maxDistance` finite/positive); `backend/tests/test_instruments/test_latent_selection.py` (mocked `LatentProvider`).
- **DO-NOT-TOUCH:** sentinel internals; the other three selection rules (P5b.18 — regression-guard); SG-8 degrade order (stage 1 `d4_latent_grain_pool` already covers latent-pool drop — register, don't reorder); the flag default (OFF).
- **Steps:** (1) pure `latent_pool.py` + provider protocol; (2) selection arm: provider miss (returns None) → deterministic fallback to `'random'` with one-shot warning log (never crash, never block render); (3) sentinel validation on every vector at the trust boundary; (4) schema flag-on acceptance + flag-off rejection regression test; (5) SG-8 stage-1 registration (drop cached pool under pressure).
- **TEST PLAN:** `python -m pytest tests/test_instruments/test_latent_selection.py -x --tb=short` — named (all on mocked vectors): `test_pool_topk_by_l2_distance_mocked_vectors`, `test_max_distance_excludes_far_frames`, `test_distance_tie_breaks_by_frame_index_deterministic`, `test_seeded_selection_replay_identical_x100`, `test_nan_latent_aborts_lane_via_sentinel` (P5b.4 integration; synthetic OOD vector), `test_provider_miss_falls_back_to_random_with_warning`, `test_flag_on_schema_accepts_latent_similarity`, `test_flag_off_still_rejected_at_load` (P5b.18 regression guard), `test_sg8_stage1_drops_cached_pool`. Full backend suite.
- **ACCEPTANCE GATES:** selection deterministic for fixed (seed, mocked vectors); sentinel demonstrably fires on OOD input; flag-off rejection unchanged; zero live-backbone imports in the test suite (grep the test file for `clip\|clap\|dinov2` = empty); G-CHECK output pasted in PR body.
- **ROLLBACK:** revert PR — flag stays OFF and schema rejection (P5b.18) is untouched by the revert.
- **EVIDENCE:** G-CHECK `GATE OK` line; pytest output; the fallback warning log line from a provider-miss run.

---

## Sequencing summary

```
Immediately startable (no Phase-5a dep):
  P5b.1 → P5b.2                 (SG-8 wiring)
  P5b.3 → P5b.4 → P5b.5         (SG-3)            ← unblocks B8-latent, B9-learned
  P5b.6 → P5b.7 → P5b.8         (SG-5)            ← unblocks B9
  P5b.13 → P5b.14               (B7 port+service)
  P5b.9                         (B6 backend lib; needs only P5b.1)

Gated on Phase-5a (B5 / B2+B4) merging:
  P5b.10 → P5b.11 → P5b.12      (B6)
  P5b.16 → P5b.17 → P5b.18 → P5b.19 → P5b.20   (B8-core; also needs SG-3+SG-8 GREEN)
  P5b.25 → P5b.26 → P5b.27      (B10; needs B2+B4)

Gated on PR-B #157/#158 + PR-C:
  P5b.21+P5b.22 (ONE PR, pre-decided) → P5b.23 → P5b.24   (B9; also needs SG-5 GREEN)

Gated on B6+B7 both landed:
  P5b.15                        (flow wiring)

Gated on B8-core complete (P5b.20):
  P5b.28                        (GPU grain pass; also first real Metal binding)
  P5b.29                        (latentSimilarity; ALSO hard-gated on Q7 REAL verdict via G-CHECK + SG-3 GREEN)
```

**PR-A gates:** P5b.11 and P5b.19 additionally carry PR-A instruments-tab preconditions (the browser instruments tab must exist before their UI mounts — see each packet's STOP checks).

**Carve-outs now packetized (2026-06-11):** B8 GPU quad/shader pass + real Metal binding = **P5b.28**; B8 `latentSimilarity` full impl = **P5b.29** (Q7-GATED). **Still carve-outs, not packetized:** C2/C3 per-pixel field destinations (B9 ships them flag-rejected), E6 modal live mode (explicitly NOT B10 per build plan).

---

## Thickness scorecard (rubric pass 2026-06-11)

Rubric: **R1** anchors grep-verified in preconditions · **R2** full contract incl. Est + Model line · **R3** named tests + exact commands (+ live-runtime step for UI packets) · **R4** every gate quantified (ms/counts/bytes) · **R5** ≥1 negative test · **R6** named full-chain integration test (n/a for cherry-pick / lib-only / test-campaign packets) · **R7** depends-on resolve to defined IDs/gates. Cells are before→after.

| Packet | R1 | R2 | R3 | R4 | R5 | R6 | R7 |
|---|---|---|---|---|---|---|---|
| P5b.1 | ✅→✅ | ❌→✅ (Model added) | ✅→✅ | ⚠️→✅ (REQ/REP <50ms) | ⚠️→✅ (+double-start idempotence negative) | ✅→✅ (wiring test IS startup→handler chain) | ✅→✅ |
| P5b.2 | ✅→✅ | ❌→✅ | ⚠️→✅ (Gate-18 live-runtime added) | ✅→✅ (1s poll, toast tiers) | ✅→✅ (malformed-payload fallback) | ✅→✅ (poll→store→badge with mocked IPC) | ✅→✅ |
| P5b.3 | ✅→✅ | ❌→✅ | ✅→✅ | ✅→✅ (25/25, 2-file diff) | ✅→✅ (payload's NaN/Inf negatives; diff-stat gate) | n/a (cherry-pick) | ✅→✅ |
| P5b.4 | ✅→✅ | ❌→✅ | ✅→✅ | ✅→✅ (<1ms @1080p) | ✅→✅ (NaN/Inf blocked) | ✅→✅ (gate→reply-field chain test) | ✅→✅ |
| P5b.5 | ✅→✅ | ❌→✅ | ⚠️→✅ (Gate-18 live-runtime added) | ✅→✅ (8s error tier) | ✅→✅ (fuzz both layers) | ✅→✅ (abort→toast→mute chain) | ✅→✅ |
| P5b.6 | ✅→✅ | ❌→✅ | ✅→✅ | ✅→✅ (25+19, 4-file diff) | ✅→✅ (STOP gates + payload negatives) | n/a (cherry-pick) | ✅→✅ |
| P5b.7 | ✅→✅ | ❌→✅ | ✅→✅ | ✅→✅ (same break ×100 sorts) | ✅→✅ (INJ-2 regression guard) | ✅→✅ (adapter roundtrip + engine integration) | ✅→✅ |
| P5b.8 | ✅→✅ | ❌→✅ | ✅→✅ | ✅→✅ (<16ms, once-per-export) | ✅→✅ (cyclic-project export) | ✅→✅ (two-export byte-identity) | ✅→✅ |
| P5b.9 | ✅→✅ | ❌→✅ | ✅→✅ | ✅→✅ (PINNED budget formula, 2GiB/20%/82%/72%) | ✅→✅ (over-budget→proxy, slot-cap reject) | n/a (lib-only; chain lands P5b.10) | ✅→✅ |
| P5b.10 | ✅→✅ | ❌→✅ | ✅→✅ | ✅→✅ (L1-diff blend oracle, endpoints exact) | ✅→✅ (malformed/unknown-interp pre-decode) | ✅→✅ (IPC arm→bank→composite chain) | ✅→✅ |
| P5b.11 | ✅→✅ | ❌→✅ | ⚠️→✅ (Gate-18 live-runtime added) | ✅→✅ ([0,1] clamps) | ✅→✅ (empty bank no-crash) | ❌→✅ (+named UI→store→payload chain test) | ✅→✅ |
| P5b.12 | ✅→✅ | ❌→✅ | ✅→✅ | ✅→✅ (byte-identity ×2, tiny-budget run) | ✅→✅ (degrade-mid-export no-crash) | ✅→✅ (export campaign IS the chain) | ✅→✅ |
| P5b.13 | ✅→✅ | ❌→✅ | ✅→✅ | ✅→✅ (headroom ≥4GiB exit-bearing, 1920 cap) | ✅→✅ (bad-hash/missing-license rejects) | n/a (port+script; service chain is P5b.14) | ✅→✅ |
| P5b.14 | ✅→✅ | ❌→✅ | ✅→✅ | ⚠️→✅ (per-inference timeout pinned 2.0s) | ✅→✅ (corrupt model, timeout, absent model) | ✅→✅ (degrade-chain tests) | ✅→✅ |
| P5b.15 | ✅→✅ | ❌→✅ | ⚠️→✅ (Gate-18 live-runtime added) | ✅→✅ | ⚠️→✅ (+<2-slots degenerate negative) | ✅→✅ (export-with-flow byte-identity) | ✅→✅ |
| P5b.16 | ✅→✅ | ❌→✅ | ✅→✅ | ⚠️→✅ (seed formula PINNED: derive_seed reuse + fixed draw order) | ✅→✅ (+formula vector + flag-flip stability) | n/a (pure engine; chain lands P5b.17) | ✅→✅ |
| P5b.17 | ✅→✅ | ❌→✅ | ✅→✅ | ✅→✅ (16ms guard, density {16,64,200} table) | ✅→✅ (malformed pre-decode) | ✅→✅ (render-arm integration) | ✅→✅ |
| P5b.18 | ✅→✅ | ❌→✅ | ✅→✅ | ✅→✅ | ✅→✅ (flag-off load rejection) | ✅→✅ (sentinel→lane-abort integration) | ✅→✅ |
| P5b.19 | ✅→✅ | ❌→✅ | ⚠️→✅ (Gate-18 live-runtime added) | ✅→✅ (N≤cap viz) | ✅→✅ (clamps, flag-off authoring) | ❌→✅ (+named knob→store→payload chain test) | ✅→✅ |
| P5b.20 | ✅→✅ | ❌→✅ | ✅→✅ | ✅→✅ (×2 hashes, 500-frame leak==0) | ✅→✅ (fuzz) | ✅→✅ (export campaign IS the chain) | ✅→✅ |
| P5b.21 | ✅→✅ | ❌→✅ | ✅→✅ | ✅→✅ (MAX_MOD_EDGES_TOTAL) | ⚠️→✅ (per-rule negatives enumerated: painted/hilbert/polar/learned + unknown + non-string, both layers) | ✅→✅ (save→load rejection both layers) | ✅→✅ |
| P5b.22 | ✅→✅ | ❌→✅ | ✅→✅ | ✅→✅ (hand-computed fixtures) | ✅→✅ (field-dst flag-off reject) | ✅→✅ (legacy byte-identity + SG-5 cycle integration) | ✅→✅ |
| P5b.23 | ✅→✅ | ❌→✅ | ⚠️→✅ (Gate-18 live check added) | ✅→✅ (row==f(r) fixture) | ✅→✅ (uppercase-axis reject) | ✅→✅ (slit-scan fixture render) | ✅→✅ |
| P5b.24 | ✅→✅ | ❌→✅ | ⚠️→✅ (Gate-18 live-runtime added) | ✅→✅ | ✅→✅ (edge-add blocked) | ✅→✅ (UI→store→IPC pre-flight chain) | ✅→✅ |
| P5b.25 | ✅→✅ | ❌→✅ | ✅→✅ | ⚠️→✅ (rate limit pinned: ≤30 writes/s, 33ms floor, 1kHz×2s→≤60) | ✅→✅ (malformed bytes chaos) | ✅→✅ (flood→limiter→store chain) | ✅→✅ |
| P5b.26 | ✅→✅ | ❌→✅ | ✅→✅ (Playwright live) | ✅→✅ (byte-identity ×2) | ✅→✅ (bake-error drain branch) | ✅→✅ (Playwright freeze-while-hammering) | ✅→✅ |
| P5b.27 | ✅→✅ | ❌→✅ | ✅→✅ (Playwright live) | ⚠️→✅ (buffer pinned: MAX_CAPTURE_EVENTS=10,000, evict-oldest) | ✅→✅ (flood bound) | ✅→✅ (capture-dump replay byte-identity) | ✅→✅ |
| P5b.28 | ✅→✅ | ❌→✅ | ✅→✅ | ✅→✅ (≤2/255 max, ≤0.5/255 mean, <16ms@200 grains, leak==0) | ✅→✅ (GPU-error fallback, use-after-destroy) | ✅→✅ (render-path dispatch integration) | ✅→✅ |
| P5b.29 | ✅→✅ | ❌→✅ | ✅→✅ | ✅→✅ (top-k, ×100 replay) | ✅→✅ (NaN latent abort, flag-off regression) | ✅→✅ (sentinel→lane-abort integration) | ✅→✅ |
