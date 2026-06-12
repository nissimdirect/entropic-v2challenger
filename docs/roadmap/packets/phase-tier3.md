# Tier-3 Work Packets — "Everything Modulates Everything" (B4-full · vision-B2 matrix · F3 macros · effects-as-sources · E5 · SG-H2)

**Authored:** 2026-06-11 · **Base:** `origin/main` @ `d821ae8` (PR #166, 2026-06-05)
**Sources:** `docs/roadmap/plans/entropic-synth-paradigm-vision.md` (§6 B2/B3/B4-full/E5, §10 SG-H2, Tier-3 row of §8) · `docs/roadmap/specs/entropic-spec-2-b4lite-schema.md` (the schema these rules light up) · `docs/roadmap/specs/entropic-spec-1-crosswalk.md` (Tier-3 deferral rows 26/27/96) · `docs/roadmap/ROADMAP.md` §2.5 locked decision 1 (F3 folds HERE) · `docs/plans/2026-05-04-cross-modal-features-plan.md` (F3 build checklist, on main)
**Repo:** `~/Development/entropic-v2challenger/` (github `nissimdirect/entropic-v2challenger`)

## Composition with B9 (read this before any packet)

1. **B9 (P5b.21–24) = axis-bound tensor routing on T/Y/X**: it extends `OperatorMapping` with `srcAxis`/`dstAxis`/`bindingRule`, widens the EDGE accept-set to `{broadcast, sampleAt, scanOver, integrate}`, and implements those rules in the operator resolver (`modulation/engine.py`/`routing.py`).
2. **Tier 3 = source/destination universality + the full binding rules on LANES**: whole-audio + rendered-frame taps become sources routable to any lane-backed param; the four standard rules (plus `painted`) become real on the lane evaluation path (`lane_reader.py` → P6.1 `axis_lanes` render arm); macros and Launchpad hardware become first-class source surfaces.
3. **Together = the full matrix**: any source (LFO / envelope / step-seq / audio band / centroid / onset / render tap / macro / MIDI CC) → any destination (any effect param, any lane, `_mix`, projectParam) over any of the 6 axes with an explicit binding rule per edge.
4. **Dependency spine:** P1.1 (#157/#158 merged) → P5b.6–8 (SG-5 GREEN) → [P5b.21+22 (B9 edge rules) ∥ P6.1/P6.2/P6.3 (axis render unlock + field infra) ∥ P6.9/P6.10 (I2 canvas)] → **Tier 3 (this file)** → unblocks P7.14 (E6 needs E5, phase-7 D9) and vision-B3 mod-as-track (carve-out, §end).
5. **Duplication ban:** Tier 3 NEVER re-implements a rule kernel that B9 landed, never re-adds SG-H3 echo suppression (P5b.25 owns it), never re-picks #142/#144 payloads (P5b.6 owns them), never re-adds `MAX_MOD_EDGES_TOTAL` (P5b.21 owns it). Every overlap has a precondition probe below.

---

## 0. Global rules (apply to every packet)

### 0.1 Ground truth verified 2026-06-11 against `origin/main` @ `d821ae8`

| Artifact | Status (VERIFIED) |
|---|---|
| `frontend/src/shared/axis-binding.ts` | ✅ — `TIER_1_BINDING_RULES = ['broadcast']` (l.67), `validateBindingRule(rule, tier: 1\|3)` (l.99), `validateLaneAxisBinding` (l.111). **HAZARD:** the `tier: 1\|3` binary accepts ALL 8 rules at tier 3 — including research rules `hilbert/polar/learned`. Tier-3 packets must replace the binary with explicit per-rule accept-sets (T3.1 owns the refactor). |
| `backend/src/modulation/schema.py` | ✅ — `TIER1_IMPLEMENTED_RULES = frozenset({BROADCAST})` (l.69), `Lane` (l.73, has `binding_rule`), `ModEdge` (l.107), `UnimplementedBindingRuleError` (l.144), `validate_for_save` (l.148, EDGE-only), `validate_edges_for_save` (l.167). **There is no lane-side save validator on main** — T3.1 adds `LANE_IMPLEMENTED_RULES` + `validate_lane_for_save`. |
| `backend/src/modulation/lane_reader.py` | ✅ — `sample_lane(curve, lane, coord)` (l.92) consumes `domain/direction/interp_mode/loop_mode` but **NOT `binding_rule`** (broadcast implicit); `sample_lane_row` (l.111); `_coord_for_domain` (l.77); `FrameCoord` 6-axis dataclass. This is the Tier-3 lane renderer seam. |
| `backend/src/modulation/engine.py` | ✅ — `SignalEngine.evaluate_all` (l.106) dispatches op types `lfo / envelope / step_sequencer / audio_follower / video_analyzer / fusion` (l.160–209). New source types (`render_tap`, master-scope audio) extend this dispatch. |
| `backend/src/modulation/routing.py` | ✅ — `resolve_routings` (l.7) reads per-mapping `depth/min/max/blend_mode`, `check_cycle` (l.156); `_mix` injection (F-0516-9). Per-mapping `processing` does NOT exist (T3.7 adds it). |
| `backend/src/modulation/processor.py` | ✅ — `process_signal` (l.6) step types: `threshold / smooth / quantize / scale`. **No `lag`, no `sample_hold`** — T3.7 adds both. |
| `backend/src/modulation/audio_follower.py` | ✅ — `evaluate_audio` (l.8) methods `rms / frequency_band / onset`. **No `spectral_centroid`, no band bank** — T3.6 adds them. |
| `backend/src/modulation/video_analyzer.py` | ✅ — `downscale_proxy` (l.18), `analyze_luminance` (l.66), `analyze_motion` (l.75), `evaluate_video_analyzer` (l.165). These run on the SOURCE frame pre-effects; T3.11's taps reuse the same functions on the POST-composite frame. |
| `backend/src/zmq_server.py` | ✅ — `_get_audio_pcm_for_frame` (l.1444) reads the legacy singleton `self.audio_player`, **NOT** `self.audio_mixer` (l.92, flag-gated); `evaluate_all` call site l.541–551; `_handle_check_dag` (l.1472, frontend cycle pre-flight); `EXPERIMENTAL_AUDIO_TRACKS` env read (l.51–54, default OFF). |
| `frontend/src/shared/types.ts` | ✅ — `ModulationRoute {sourceId, depth, min, max, curve, effectId?, paramKey?}` (l.239), `Pad.modRoutes: ModulationRoute[]` (l.344, INJ-1 #152 rename), `MacroMapping {label, effectId, paramKey, min, max}` (l.456, used at l.436/478), `CCMapping {cc, effectId, paramKey}`. |
| `frontend/src/renderer/components/library/MacroKnob.tsx` | ✅ exists, props `{macro: MacroMapping, value, onChange}` — **zero production importers (grep-verified; only its own test imports it). Unmounted component, confirmed revivable.** |
| `frontend/src/renderer/stores/midi.ts` | ✅ — `learnTarget`/`setLearnTarget` (l.16/62), learn dispatch at l.75–83 (pad branch verified), `MIDIPersistData` import. `useMIDI.ts`, `MIDISettings.tsx`, `MIDILearnOverlay.tsx` exist. |
| `frontend/src/renderer/stores/operators.ts` | ✅ — `addMapping` (l.162), `updateMapping` (l.211). |
| E5 draft #145 | 🔄 OPEN, `headRefName=feat/q7-e5-midi-learn` (gh-verified 2026-06-11). Payload = **single tip commit `004a47a`** "[q7] feat: PR #27 E5 Hardware MIDI Learn + 3 Launchpad templates (28 tests)" = exactly 4 files, **all new-namespace** (cat-file-verified absent from main): `backend/src/midi/{__init__.py,registry.py,templates.py}` + `backend/tests/test_q7_benchmark/test_midi_learn.py` (+691). Commits below it (`f877439` SG-5, `bc0ea0b` I3, `2d2ac79` I2 graph…) are OTHER packets' payloads — NOT E5. |
| Worktree `~/Development/entropic-q7-e5` | ⚠️ **sits on `feat/tier1-b1-b4lite-c1-c7` @ `7a2c756` — NOT #145's branch** (worktree-list-verified 2026-06-11; confirms the EXECUTION-PLAN §5 stub warning). Cherry-pick from the branch `feat/q7-e5-midi-learn` (exists locally + on origin), never from this worktree. |
| FD management today | `resource.setrlimit(RLIMIT_AS)` in `backend/src/main.py:39–40` (memory only — **RLIMIT_NOFILE never raised**); reader pool LRU `_max_readers = 10` at `zmq_server.py:75`, eviction loop l.1542. SG-H2 (T3.15) is the only owner of FD work. |
| NOT on main (probe before depending) | `setLaneAxisBinding` (#158, P1.1) · `axis_lanes` render arm (P6.1) · `FieldRef`/`field_source.py` (P6.2/P6.3) · `routing_graph_get` + RoutingCanvas (P6.9/P6.10) · `cycle_detection.py` (P5b.6) · `srcAxis` on OperatorMapping (P5b.21) · `pressure_status` (P5b.1) · `MAX_MACRO_EDGES_TOTAL` (P5a.11) |

### 0.2 Cherry-pick rule (applies to T3.13)

Identical to `packets/phase-5b.md` §0.2: enumerate payload commits, `git show --stat` proves every file new-namespace, pick onto a FRESH branch off `origin/main`, any conflict = STOP. Stale merge-base raw-merges falsely revert merged work (`memory/feedback_cherry-pick-stale-scaffold-branches.md`).

### 0.3 Test commands (from repo CLAUDE.md)

```bash
# backend:        cd backend && python -m pytest -x -n auto --tb=short
# backend single: cd backend && python -m pytest tests/test_<name>.py -x --tb=short
# backend oracle: cd backend && python -m pytest -m oracle --tb=short -q
# frontend unit:  cd frontend && npx --no vitest run        # MUST use --no
# frontend E2E:   cd frontend && npx playwright test
```

### 0.4 Universal OUT-gates (every packet)

1. Tests green at the right layer; behavior-keyword titles greppable (`feedback_grep-the-test-file-before-claiming-coverage`).
2. Every numeric crossing IPC clamped + finite-guarded (`feedback_numeric-trust-boundary`).
3. Determinism gates are **EXPORT-PATH only** (phase-5b §0.4 correction stands; preview uses the project-store seed).
4. **Lint-3 lockstep (SPEC-2 §6 / SPEC-6):** any accept-set widening (lane OR edge) lands in the SAME PR as the renderer implementation + a named test. A packet that widens without rendering is an automatic bounce.
5. Each packet = own branch + own PR. Exceptions pre-decided inline.
6. **Single-flight on shared hotspots:** at most one in-flight PR touching `frontend/src/shared/axis-binding.ts` or `backend/src/modulation/schema.py` — T3.1–T3.4 queue behind each other AND behind P5b.21+22 if it is in flight (EXECUTION-PLAN §1 rule 7 extended).

### 0.5 Rollback (universal)

Pre-merge: close PR, delete branch. Post-merge: `git revert -m 1 <squash-sha>`. Accept-set widenings revert cleanly: the schema keeps accepting all 8 rules on READ (round-trip preserve), the validator simply re-narrows — saved projects using a reverted rule fail at next save with the standard `UnimplementedBindingRuleError` text (acceptable: pre-1.0, zero external users per ROADMAP G11).

---

## Track A — B4-full binding rules on lanes (vision §6 B4; SPEC-2 §11 "what this does not cover")

> Lane-side semantics, decided here (canonical for executors):
> `domain` picks which axis projects through the curve (already live, `lane_reader.py`). The `binding_rule` decides how the sampled value lands on the destination:
> **broadcast** = scalar applied uniformly (today's behavior) · **sampleAt** = curve read at one fixed axis coordinate `rule_params.at`, regardless of current coord · **scanOver** = a per-cell vector over the destination axis (one value per row/col/channel/band) · **integrate** = cumulative mean of the curve from 0 to the current axis coordinate · **painted** = scalar shaped per-pixel by a user-painted 2D mask field.

### T3.1 — Binding-rule kernels + `sampleAt` lane evaluation + per-rule accept-set refactor · RISK:HIGH (architecture-setting)

- **ID:** T3.1 · **Branch:** `feat/t3-b4full-sampleat` · **Base:** `origin/main` · **Est:** ~4h
- **Depends-on:** P1.1 (#158 merged — lane axisBinding store wiring); P6.1 merged (`axis_lanes` render arm — the surface where lane rules become visible).
- **Goal:** (1) One shared kernel module `backend/src/modulation/binding_kernels.py` becomes the single home for rule math (B9's edge resolver and the lane reader both consume it — whichever lands second refactors to consume, never duplicates); (2) `sampleAt` implemented end-to-end on lanes; (3) the frontend `tier: 1|3` binary and backend `TIER1_IMPLEMENTED_RULES` (edge) / new `LANE_IMPLEMENTED_RULES` are refactored to explicit per-rule accept-sets so rules un-reject ONE AT A TIME as their renderer lands.
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  cd ~/Development/entropic-v2challenger && git fetch origin
  git grep -q "setLaneAxisBinding" origin/main -- frontend/src/renderer/stores/automation.ts || { echo "STOP: #158/P1.1 not merged"; exit 1; }
  git grep -q "axis_lanes" origin/main -- backend/src/zmq_server.py || { echo "STOP: P6.1 not merged — lane rules would render nowhere"; exit 1; }
  git grep -n "TIER1_IMPLEMENTED_RULES" origin/main -- backend/src/modulation/schema.py | head -1   # expect l.69 — moved → re-read schema.py first
  git ls-tree origin/main backend/src/modulation/binding_kernels.py | grep -q . && { echo "STOP: kernels module already exists (B9 landed it?) — re-scope to consume, not create"; exit 1; }
  git grep -n "sampleAt" origin/main -- backend/src/modulation/routing.py backend/src/modulation/engine.py | head -2
  #   non-empty = P5b.21+22 landed edge-side rules FIRST → extract their kernels into binding_kernels.py in this packet
  #   (refactor-to-shared, behavior-preserving, their tests stay green); EMPTY = this packet authors the kernels fresh
  #   and P5b.22 consumes them later (leave a comment in the module header naming both consumers).
  ```
- **Scope (VERIFIED paths):**
  - NEW `backend/src/modulation/binding_kernels.py` — `kernel_broadcast`, `kernel_sample_at(curve, at, interp)`, signatures designed for all 5 standard rules (scanOver/integrate/painted stubs raise `NotImplementedError` naming their packet)
  - `backend/src/modulation/lane_reader.py` — `sample_lane` honors `lane.binding_rule` via kernels; new `rule_params` passthrough (additive, default `{}`)
  - `backend/src/modulation/schema.py` — `Lane` gains optional `rule_params: dict` (to_dict/from_dict, defaults `{}`); NEW `LANE_IMPLEMENTED_RULES = frozenset({BROADCAST, SAMPLE_AT})` + `validate_lane_for_save(lane)` raising `UnimplementedBindingRuleError`; load path (`backend/src/project/schema.py`) rejects out-of-set lane rules with a clear error
  - `frontend/src/shared/axis-binding.ts` — replace `validateBindingRule(rule, tier)` internals with `IMPLEMENTED_LANE_BINDING_RULES: ReadonlySet<BindingRule>` (now `{'broadcast','sampleAt'}`); keep the exported function signature working (deprecation note) so #158's call sites don't break
  - `frontend/src/renderer/stores/automation.ts` — `setLaneAxisBinding` validator consumes the new set; `sampleAt` selectable with an `at` numeric input (clamped [0,1] finite)
  - NEW `backend/tests/test_modulation/test_binding_sampleat.py` + extend `frontend/src/__tests__/shared/axis-binding.test.ts`
- **DO-NOT-TOUCH:** `TIER1_IMPLEMENTED_RULES` edge semantics beyond renaming-with-alias (P5b.21 owns edge widening); `routing.py` resolver behavior; `_topological_sort`; the 8-member `BindingRule` union (canonical).
- **Steps:** kernels module → lane_reader dispatch → backend lane validator + load rejection → frontend accept-set + store input → tests. Keep `sample_lane`'s broadcast fast path byte-identical (regression-guard).
- **TEST PLAN:** `cd backend && python -m pytest tests/test_modulation/test_binding_sampleat.py -x --tb=short` — named: `test_sampleat_reads_curve_at_fixed_coord_not_current`, `test_sampleat_at_clamped_finite`, `test_broadcast_unchanged_byte_identical` (regression oracle vs main's output, `@pytest.mark.oracle`), `test_lane_save_rejects_scanover_still`, `test_load_rejects_unimplemented_lane_rule_with_clear_error`, `test_rule_params_roundtrip`. Vitest: `lane accept-set is broadcast+sampleAt`, `sampleAt at-input clamped and finite`, `validateBindingRule legacy signature still answers`. Full suites both layers.
- **ACCEPTANCE GATES:** Lint-3 satisfied (widening + renderer + test, one PR); a `domain='y', binding_rule='sampleAt', at=0.25` lane on a real effect renders the curve's 0.25-value uniformly (manual render smoke via `axis_lanes`); broadcast oracle byte-identical; full backend suite zero regressions.
- **ROLLBACK:** revert PR; accept-sets re-narrow per §0.5.
- **EVIDENCE:** pytest + vitest output; the kernels-module header naming both consumers; render smoke frame.
- **Model:** Opus/Fable (RISK:HIGH — sets the kernel architecture every later rule rides).

### T3.2 — `scanOver` lane evaluation (per-cell vector over the destination axis)

- **ID:** T3.2 · **Branch:** `feat/t3-b4full-scanover` · **Base:** `origin/main` · **Est:** ~4h
- **Depends-on:** T3.1 merged.
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  git grep -q "kernel_sample_at" origin/main -- backend/src/modulation/binding_kernels.py || { echo "STOP: T3.1 not merged"; exit 1; }
  git grep -n "sample_lane_row" origin/main -- backend/src/modulation/lane_reader.py | head -1   # expect l.111 — the row-sweep primitive scanOver generalizes
  git grep -q "axis_lanes" origin/main -- backend/src/zmq_server.py || { echo "STOP: P6.1 render arm missing"; exit 1; }
  ```
- **Goal:** `kernel_scan_over(curve, n_cells, direction, interp)` → vector; lane evaluation returns per-row (y), per-col (x), per-channel (c) vectors consumed by the P6.1 banded render path — the true scanline semantic SPEC-2 §2.4 reserved for B4-full. Banded application for spatial effects follows P6.1's banding rules; c-axis applies per-channel (3 cells).
- **Scope (VERIFIED paths):** `binding_kernels.py` (un-stub scanOver), `lane_reader.py` (vector return path — typed as `float | np.ndarray`, callers branch), the P6.1 `axis_lanes` evaluation arm in `backend/src/engine/pipeline.py`/`zmq_server.py` (re-anchor at packet start — P6.1 owns the exact location), `schema.py` `LANE_IMPLEMENTED_RULES` += `SCAN_OVER`, `axis-binding.ts` accept-set += `'scanOver'`, `stores/automation.ts` selectable, NEW `backend/tests/test_modulation/test_binding_scanover.py`.
- **DO-NOT-TOUCH:** edge-side resolver (B9 owns `scanOver` for edges); `_coord_for_domain`; kernels already landed (extend, don't reshape signatures).
- **Steps:** kernel → vector plumbing → render application (y first, x symmetric, c per-channel) → validators → tests. Perf guard: vector evaluation is one curve interp per cell; assert <2ms @ 1080p rows on the perf smoke.
- **TEST PLAN:** named: `test_scanover_y_returns_one_value_per_row`, `test_scanover_x_symmetric`, `test_scanover_c_three_channel_values`, `test_scanover_direction_negative_reverses_vector`, `test_scanover_render_oracle_hand_computed_gradient` (`@pytest.mark.oracle` — fixed curve, assert row r gets curve(r/(H-1)) within 1e-6), `test_scanover_perf_under_budget`, `test_lane_save_rejects_integrate_still`. Vitest: `scanOver selectable`, `accept-set is broadcast+sampleAt+scanOver`. Full suites.
- **ACCEPTANCE GATES:** visible vertical gradient on the demo fixture when a constant-slope curve binds `scanOver/y` to e.g. `hue_shift` (this is the SPEC-2 §2.4 "actual scanline-as-time" landing); oracle green; Lint-3 lockstep; zero regressions.
- **ROLLBACK:** revert PR. · **EVIDENCE:** oracle output + gradient frame capture + perf number.
- **Model:** Sonnet.

### T3.3 — `integrate` lane evaluation (cumulative over the axis)

- **ID:** T3.3 · **Branch:** `feat/t3-b4full-integrate` · **Base:** `origin/main` · **Est:** ~3h
- **Depends-on:** T3.2 merged.
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  git grep -q "kernel_scan_over" origin/main -- backend/src/modulation/binding_kernels.py || { echo "STOP: T3.2 not merged"; exit 1; }
  git grep -n "INTEGRATE" origin/main -- backend/src/modulation/schema.py | head -2   # enum member exists (VERIFIED) — accept-set must NOT yet include it
  ```
- **Goal:** `kernel_integrate(curve, u, n_samples)` = normalized cumulative mean of the curve over [0, u] (running integral, so a constant curve integrates to itself — identity-friendly); works for every domain incl. `t` (slow-build automation) and composes with `scanOver`-style vector output when the destination is spatial (cumulative down rows).
- **Scope:** `binding_kernels.py`, `lane_reader.py`, `schema.py` `LANE_IMPLEMENTED_RULES` += `INTEGRATE`, `axis-binding.ts` accept-set += `'integrate'`, `stores/automation.ts`, NEW `backend/tests/test_modulation/test_binding_integrate.py`.
- **DO-NOT-TOUCH:** edge-side resolver; existing kernel signatures; export hashing.
- **TEST PLAN:** named: `test_integrate_constant_curve_is_identity`, `test_integrate_ramp_curve_is_half_at_end`, `test_integrate_monotonic_for_nonnegative_curve`, `test_integrate_vector_mode_cumulative_down_rows` (`@pytest.mark.oracle`), `test_integrate_export_byte_identical_x2` (export-path rule §0.4), `test_lane_save_rejects_painted_still`. Vitest: accept-set widening test. Full suites.
- **ACCEPTANCE GATES:** oracle green; the four STANDARD rules now all lane-implemented except `painted`; Lint-3 lockstep; export determinism holds.
- **ROLLBACK:** revert PR. · **EVIDENCE:** pytest output + export hash pair.
- **Model:** Sonnet.

### T3.4 — `painted` part 1: painted-mask field storage + backend evaluation · RISK:HIGH (research rule; vision §9 "painted binding unproven")

- **ID:** T3.4 · **Branch:** `feat/t3-b4full-painted-storage` · **Base:** `origin/main` · **Est:** ~4h
- **Depends-on:** T3.3 merged; **P6.2 + P6.3 merged (C3 field infra — FieldRef + FieldProvider are the storage/resolve substrate; do NOT invent a parallel mask store).**
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  git grep -q "class FieldRef" origin/main -- backend/src/effects/field_params.py || { echo "STOP: P6.2 not merged — painted has no field substrate"; exit 1; }
  git grep -q "class FieldProvider\|def resolve" origin/main -- backend/src/effects/field_source.py || { echo "STOP: P6.3 not merged"; exit 1; }
  git grep -n "kind: 'image'|'video'|'lane2d'\|'lane2d'" origin/main -- backend/src/effects/field_params.py | head -2   # confirm the kind union before extending; shape moved → re-read
  git grep -rn "painted" origin/main -- backend/src/effects/ backend/src/modulation/ | head -3   # MUST be EMPTY (nobody implemented painted) — else STOP, re-scope
  ```
- **Goal:** `FieldRef` gains `kind: 'painted'` whose payload is an inline, capped mask (`{w, h, data: base64-PNG-gray8}`, max 256×256 — painted masks are project data, not media files); `FieldProvider.resolve` decodes + caches it; `kernel_painted(value, mask_field)` shapes the lane's scalar per-pixel (multiply, mask∈[0,1]); lane accept-set += `PAINTED`. UI paint authoring is T3.5 — this packet makes hand-authored painted fields load + render.
- **Scope (VERIFIED paths):** `backend/src/effects/field_params.py` (kind union + payload validator), `backend/src/effects/field_source.py` (decode arm + LRU reuse), `backend/src/security.py` (NEW `MAX_PAINTED_FIELD_BYTES`, `MAX_PAINTED_FIELD_DIM = 256` — append-only), `binding_kernels.py` (un-stub painted), `lane_reader.py`/P6.1 arm (painted lanes need the pixel-stage application — compose with the C3 field application point, read P6.5/P6.1 result first), `schema.py` `LANE_IMPLEMENTED_RULES` += `PAINTED`, `axis-binding.ts` accept-set += `'painted'` (label it "(research)" in any UI string), NEW `backend/tests/test_modulation/test_binding_painted.py`.
- **DO-NOT-TOUCH:** `hilbert`/`polar`/`learned` (stay rejected — `learned` additionally needs SG-3 per axis-binding.ts header); P6.3 cache internals; image decode paths outside the SG-7-wrapped helpers.
- **Steps:** kind + validator (dims/bytes capped, decode trust-boundary: reject non-PNG, NaN-impossible by uint8) → provider arm → kernel + render application → validators → tests.
- **TEST PLAN:** named: `test_painted_field_decodes_to_unit_range`, `test_painted_dim_cap_rejected`, `test_painted_bytes_cap_rejected`, `test_painted_mask_shapes_lane_value_per_pixel` (`@pytest.mark.oracle` — checkerboard mask, assert masked vs unmasked pixels), `test_malformed_painted_payload_rejected_at_load`, `test_painted_roundtrip_preserves_payload_verbatim`. Full backend suite + vitest accept-set test.
- **ACCEPTANCE GATES:** a hand-authored project file with a painted lane loads + renders the mask shape; caps backend-enforced; Lint-3 lockstep; round-trip byte-preserves the mask.
- **ROLLBACK:** revert PR; painted re-rejects, files keep the payload on read (round-trip preserve).
- **EVIDENCE:** oracle output; rendered masked frame; the two new security constants' line refs.
- **Model:** Opus/Fable (RISK:HIGH).

### T3.5 — `painted` part 2: paint UI (brush overlay → painted field) · RISK:HIGH (novel interaction; Gate-15 research required)

- **ID:** T3.5 · **Branch:** `feat/t3-b4full-painted-ui` · **Base:** `origin/main` · **Est:** ~4h
- **Depends-on:** T3.4 merged; P6.6 merged (the "Field…" param control this hooks into).
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  git grep -q "'painted'" origin/main -- backend/src/effects/field_params.py || { echo "STOP: T3.4 not merged"; exit 1; }
  git grep -rqn "__field__" origin/main -- frontend/src/renderer/components/effects/ || { echo "STOP: P6.6 field UI not merged — no mount point"; exit 1; }
  ```
- **Goal:** "Paint…" appears beside P6.6's "Field…" control (param fields) and in the lane axis-binding editor (painted lanes): opens a canvas overlay over the preview, brush + eraser + radius + clear, strokes rasterize to the ≤256×256 gray8 mask, Save writes the `painted` FieldRef / lane `rule_params.field` (undoable), Escape cancels. **Gate-15 research is mandatory before coding:** read an established canvas-brush implementation (e.g. Fabric.js free-drawing brush or Excalidraw's freedraw) and cite the pattern in a code comment — pointer-event ordering and devicePixelRatio mapping are solved problems.
- **Scope (VERIFIED paths):** NEW `frontend/src/renderer/components/paint/PaintOverlay.tsx` (+ BEM CSS, dark tokens), hook into P6.6's field control + the #158 axis-binding editor (re-anchor both at packet start), mask rasterize/encode util in `frontend/src/shared/` (PNG-gray8 base64, dims clamped), store writes via existing undoable actions, Vitest.
- **DO-NOT-TOUCH:** preview render pipeline (overlay is `position:fixed` composited DOM — never modify root grid rows, `feedback_test-layout-changes`); backend (T3.4 done); pointer handling on the timeline (isolated overlay only).
- **Steps:** research citation → overlay + brush engine → rasterize/encode (round-trip vs T3.4 validator) → save/cancel wiring + undo → drag-end click suppression (`feedback_drag-end-suppresses-click`: track isPainting; mouseup must not click-through-dismiss).
- **TEST PLAN:** Vitest `frontend/src/__tests__/components/paint/paint-overlay.test.tsx` — named: `brush stroke rasterizes into mask`, `eraser zeroes painted cells`, `save writes painted field via undoable action`, `escape cancels without store write`, `mask dims clamped to cap`, `mouseup after stroke does not dismiss overlay`, `undo restores pre-paint value`. Full vitest; one Playwright smoke if reachable headless. Live-runtime smoke per Gate 18 (name the runtime path in evidence).
- **ACCEPTANCE GATES:** paint → save → preview visibly shows the mask shaping the param (end-to-end with T3.4); round-trip re-opens the saved mask for further editing; **B4-full COMPLETE: 5 standard rules lane-implemented** — mark vision-B4 ✅ in ROADMAP §2 in this PR (ledger-correction protocol).
- **ROLLBACK:** revert PR — UI additive; painted files still load (T3.4).
- **EVIDENCE:** vitest output; screen capture paint→render; the Gate-15 citation comment.
- **Model:** Opus/Fable (RISK:HIGH).

---

## Track B — vision-B2 cross-modal matrix (whole-audio → anything)

### T3.6 — Whole-audio analysis sources: master scope + spectral centroid + band bank

- **ID:** T3.6 · **Branch:** `feat/t3-b2-audio-sources` · **Base:** `origin/main` · **Est:** ~4h
- **Depends-on:** none hard (audio-tracks chain merged #30+#66, flag-off — preconditions handle flag state). Coordinate: PT.1 un-flag is a separate parallel-track packet; this packet must work in BOTH flag states.
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  git grep -n "_experimental_audio_tracks_enabled" origin/main -- backend/src/zmq_server.py | head -1   # expect l.51 — flag still exists (if PT.1 removed it, simplify: master scope is always mixer)
  git grep -n "self.audio_mixer = AudioMixer()" origin/main -- backend/src/zmq_server.py | head -1      # expect l.92 — else re-survey the mixer seam
  git grep -n "def _get_audio_pcm_for_frame" origin/main -- backend/src/zmq_server.py | head -1         # expect l.1444
  git grep -n "spectral_centroid" origin/main -- backend/src/modulation/audio_follower.py               # MUST be EMPTY — else already built, STOP
  ```
- **Goal:** Whole-audio analysis becomes a routable source family: (1) `audio_follower` gains methods `spectral_centroid` (normalized 0–1 over 20Hz–Nyquist, log-scaled) and `band_bank` (fixed low/mid/high RMS triple — `band_index` param selects, so one op = one scalar source, matrix-friendly); (2) operator param `audio_scope: 'clip' | 'master'` — `master` pulls the mixer-summed bus via a new `_get_master_pcm_for_frame` (flag ON: `AudioMixer` sum at the frame window; flag OFF: falls back to the legacy `audio_player` bed — **VERIFIED discrepancy: `_get_audio_pcm_for_frame` l.1444 reads only the singleton `audio_player`, never the mixer; this packet adds the mixer tap rather than changing the legacy path**); (3) frontend operator editor exposes the new methods + scope so they route to ANY lane-backed param through the existing `addMapping` machinery (operators.ts l.162) — no new routing system.
- **Scope (VERIFIED paths):** `backend/src/modulation/audio_follower.py` (two methods, pure functions, finite-guarded), `backend/src/zmq_server.py` (`_get_master_pcm_for_frame` + scope dispatch at the evaluate_all call site l.541–551), the frontend operator-config UI (locate via `git grep -rn "frequency_band" frontend/src/renderer/components/` at packet start — extend the existing method picker in place), `frontend/src/shared/types.ts` operator param typing if typed, NEW `backend/tests/test_modulation/test_audio_master_sources.py`, Vitest for the picker.
- **DO-NOT-TOUCH:** `EXPERIMENTAL_AUDIO_TRACKS` default (PT.1 owns the flip); `AudioMixer` internals (consume its existing sum API — read `backend/src/audio/mixer.py` first); existing `rms/frequency_band/onset` behavior (regression-guard).
- **TEST PLAN:** named: `test_spectral_centroid_low_tone_near_zero_high_tone_near_one`, `test_band_bank_isolates_low_mid_high`, `test_master_scope_uses_mixer_when_flag_on` (env-var set in test), `test_master_scope_falls_back_to_bed_when_flag_off`, `test_silence_returns_zero_not_nan`, `test_all_outputs_finite_and_clamped`. Vitest: `method picker lists spectral_centroid and band_bank`, `scope selector clip/master`. Full suites.
- **ACCEPTANCE GATES:** an operator `{type: audio_follower, method: spectral_centroid, audio_scope: master}` mapped to any effect param visibly modulates in preview with project audio playing (manual smoke, both flag states); zero regressions in existing audio-follower tests.
- **ROLLBACK:** revert PR — methods additive, scope defaults `'clip'`.
- **EVIDENCE:** pytest+vitest output; smoke capture; flag-on AND flag-off run notes.
- **Model:** Sonnet.

### T3.7 — Matrix edges: per-edge `lag` + `sample_hold` processing + persistence

- **ID:** T3.7 · **Branch:** `feat/t3-b2-edge-lag-sh` · **Base:** `origin/main` · **Est:** ~4h
- **Depends-on:** T3.6 merged (the sources that make lag/S+H worth having).
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  git grep -n "def process_signal" origin/main -- backend/src/modulation/processor.py | head -1   # expect l.6
  git grep -n "lag\|sample_hold" origin/main -- backend/src/modulation/processor.py               # MUST be EMPTY — else STOP
  git grep -n '"processing"' origin/main -- backend/src/modulation/routing.py                     # MUST be EMPTY (per-edge processing not built) — else re-scope
  ```
- **Goal:** vision-B2's per-edge feature set completes: per-edge **curve/depth/polarity** already exist (`ModulationRoute.curve`, mapping `depth`, polarity = negative depth — VERIFIED routing.py l.55–70); this packet adds **lag** (one-pole smoother with `ms` time constant, fps-aware coefficient) and **S+H** (`rate_hz` resample-and-hold) as `process_signal` step types, AND an optional per-mapping `processing: [...]` list applied inside `resolve_routings` before blending (operator-level `processing` keeps working — per-edge runs after it). State keyed `(op_id, mapping_index, step_index)` in the engine's persistent state dict so lag/S+H survive across frames and reset on seek.
- **Scope (VERIFIED paths):** `backend/src/modulation/processor.py` (`_lag`, `_sample_hold` + dispatch), `backend/src/modulation/routing.py` (per-mapping processing application + state plumb), `backend/src/modulation/engine.py` (pass state through; `apply_modulation` l.241 seam — read first), `frontend/src/shared/types.ts` (`OperatorMapping`-side optional `processing` — coordinate with P5b.21's axis fields if landed: append, never reshape), `frontend/src/renderer/stores/operators.ts` (validator: ms/rate finite + clamped), persistence rides the existing operator save path (assert in test), NEW `backend/tests/test_modulation/test_edge_lag_sh.py`.
- **DO-NOT-TOUCH:** existing step types' math; `_blend_contributions`; SG-5 break ordering; `MAX_MOD_EDGES_TOTAL` (P5b.21's constant — consume if present, never add).
- **TEST PLAN:** named: `test_lag_converges_to_input_with_time_constant`, `test_lag_fps_aware_same_settle_seconds_at_30_and_60fps`, `test_sample_hold_holds_between_resample_ticks`, `test_per_edge_processing_independent_of_operator_processing`, `test_edge_state_resets_on_seek`, `test_lag_ms_clamped_finite`, `test_mapping_processing_roundtrips_through_save`. Export determinism: `test_lagged_edge_export_byte_identical_x2` (state is frame-sequential → deterministic). Full suites.
- **ACCEPTANCE GATES:** per-edge lag audibly/visibly smooths a centroid→param route in preview (smoke); export ×2 byte-identical; zero regressions in `test_modulation/`.
- **ROLLBACK:** revert PR — `processing` optional, absent = today's behavior.
- **EVIDENCE:** pytest output; before/after capture of a lagged route; hash pair.
- **Model:** Sonnet.

### T3.8 — Matrix UI in the I2 Routing Canvas: audio sources + the deferred edge-inspector controls

- **ID:** T3.8 · **Branch:** `feat/t3-b2-matrix-canvas` · **Base:** `origin/main` · **Est:** ~4h
- **Depends-on:** T3.7 merged; **P6.10 merged (RoutingCanvas exists — this packet extends it IN PLACE; a parallel matrix component is an automatic FAIL, PR #154 precedent).**
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  git ls-tree origin/main frontend/src/renderer/components/routing-canvas/ --name-only | grep -q RoutingCanvas.tsx || { echo "STOP: P6.10 not merged — no canvas to extend"; exit 1; }
  git grep -q "sample_hold" origin/main -- backend/src/modulation/processor.py || { echo "STOP: T3.7 not merged"; exit 1; }
  git grep -n "srcAxis" origin/main -- frontend/src/shared/types.ts | head -1
  #   non-empty (P5b.21 landed) → ALSO surface per-edge srcAxis/dstAxis/bindingRule pickers here (P6.10 deferred them
  #   to B4-full, VERIFIED: "curve/lag/axis-binding deferred to B4-full — they have no backend storage yet");
  #   EMPTY → ship curve/lag/S+H only and note the axis pickers as a follow-up rider on P5b.24.
  ```
- **Goal:** The canvas becomes the matrix surface: (1) sources column gains an **Audio** group (master-scope audio_follower ops incl. centroid/bands — bright when routed, one-click "add centroid source" affordance creating the operator); (2) edge inspector gains **curve picker + lag(ms) + S+H(rate)** controls writing the T3.7 per-mapping fields through `updateMapping` (undoable); (3) axis/binding pickers per the precondition branch; (4) persistence round-trip proven (edge with lag survives save/reload and re-renders identically).
- **Scope (VERIFIED paths):** `frontend/src/renderer/components/routing-canvas/{RoutingCanvas,EdgeInspector,NodeColumn}.tsx` (extend in place), `stores/operators.ts` (consume `addMapping`/`updateMapping` l.162/211 — never bypass undo), Vitest.
- **DO-NOT-TOUCH:** canvas open/close/fetch race handling (P6.10 hardened it); `backend/**`; xyflow/SVG substrate choice (P4.0's verdict stands).
- **TEST PLAN:** Vitest `frontend/src/__tests__/components/routing-canvas/matrix-extension.test.tsx` — named: `audio sources group lists master-scope operators`, `add centroid source creates operator via store`, `edge inspector writes lag through updateMapping`, `sample hold rate clamped finite at input`, `edge edits undoable`, `matrix edge round-trips through save/load`, plus (branch-dependent) `axis pickers write srcAxis dstAxis through validator`. Full vitest.
- **ACCEPTANCE GATES:** drag centroid→param on the canvas → param modulates in preview → reopen canvas shows the routed edge with its lag value (single-source-of-truth proof); **vision-B2 COMPLETE** — mark ✅ in ROADMAP §2 in this PR.
- **ROLLBACK:** revert PR — canvas reverts to P6.10 shape; edges created remain valid data.
- **EVIDENCE:** vitest output; screen capture of the audio-routed edge + lag edit; round-trip note.
- **Model:** Sonnet.

---

## Track C — F3 macro device fold (ROADMAP §2.5 locked decision 1: F3 FOLDS INTO Tier 3)

### T3.9 — Macro model + engine: knob → N targets with per-edge depth/curve

- **ID:** T3.9 · **Branch:** `feat/t3-f3-macro-engine` · **Base:** `origin/main` · **Est:** ~4h
- **Depends-on:** none hard (pure frontend chain-transform; composes with T3.8's canvas later).
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  git grep -rn "applyMacroModulations" origin/main -- frontend/src | head -1            # MUST be EMPTY — else F3 already built, STOP
  git grep -n "modRoutes" origin/main -- frontend/src/shared/types.ts | head -1         # expect l.344 (INJ-1 #152 rename) — Pad machinery this reuses
  git grep -n "interface MacroMapping" origin/main -- frontend/src/shared/types.ts | head -1   # expect l.456 (NOT l.400-406 as the F3 plan doc claims — doc rot, plan predates #152/#157 churn)
  git grep -rn "applyCCModulations(" origin/main -- frontend/src/renderer/App.tsx | head -2    # locate the chain-transform call site (F3 plan cites ~l.660 — re-anchor, do not trust the line)
  ```
- **Goal:** First-class live macros per the F3 plan (on main, `docs/plans/2026-05-04-cross-modal-features-plan.md` §F3) upgraded to Tier-3 shape: `Macro = {id, label, value (0–1), routes: ModulationRoute[]}` — **routes reuse `ModulationRoute` verbatim** (per-edge `depth/min/max/curve` already in the type, l.239 — the locked decision's "reuse Pad modRoutes machinery"); NEW pure `applyMacroModulations(chain, macros): EffectInstance[]` mirroring `applyCCModulations` (structuredClone, finite-guard, curve application per route); wired into the chain-transform pipeline at the same call site; persisted as an optional `macros` array on the project (no migration — absent = no macros). Cap: 16 macros × 16 routes frontend-validated (if `MAX_MACRO_EDGES_TOTAL` exists in `security.py` — P5a.11's — mirror its value; EMPTY today, VERIFIED).
- **Scope (VERIFIED paths):** `frontend/src/shared/types.ts` (Macro type — keep `MacroMapping` l.456 untouched for Presets/DeviceGroups), NEW `frontend/src/renderer/components/performance/applyMacroModulations.ts`, NEW `frontend/src/renderer/stores/macros.ts` (Zustand, follows existing store conventions), `frontend/src/renderer/App.tsx` chain-transform call site (one line), `frontend/src/renderer/project-persistence.ts` (optional field + load validator dropping malformed macros), Vitest.
- **DO-NOT-TOUCH:** `applyCCModulations.ts`/`applyPadModulations.ts` internals (mirror, never modify); `Pad.modRoutes` semantics; backend (macros are a frontend chain transform like CC/pads).
- **TEST PLAN:** Vitest `frontend/src/__tests__/components/performance/apply-macro-modulations.test.ts` — named: `knob 0.5 with route min 0 max 1 writes 0.5`, `one knob drives N targets simultaneously`, `per-route curve shapes the value`, `NaN and Inf knob values clamped to 0` (F3 plan security I2, verbatim), `route to missing effect skipped without crash`, `empty macros returns chain unchanged (referential)`, `macros round-trip through save/load`, `malformed macro dropped at load`. Full vitest.
- **ACCEPTANCE GATES:** all named tests green; chain-transform order documented in a comment at the call site (Base → pads → CC → macros → automation, matching vision §5 signal order); zero regressions.
- **ROLLBACK:** revert PR — optional field, additive function.
- **EVIDENCE:** vitest output; the call-site diff hunk.
- **Model:** Sonnet.

### T3.10 — Macro UI: MacroDevice container + MacroKnob revival + "Map to Macro" affordance

- **ID:** T3.10 · **Branch:** `feat/t3-f3-macro-ui` · **Base:** `origin/main` · **Est:** ~4h
- **Depends-on:** T3.9 merged.
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  git grep -q "applyMacroModulations" origin/main -- frontend/src/renderer/App.tsx || { echo "STOP: T3.9 not merged"; exit 1; }
  git grep -rln "MacroKnob" origin/main -- frontend/src/renderer | grep -v __tests__ | grep -v "MacroKnob.tsx"
  #   MUST be EMPTY (VERIFIED today: zero prod importers — the component is unmounted). Non-empty → someone mounted it; re-scope to extend that mount.
  ```
- **Goal:** Macros become touchable: NEW `frontend/src/renderer/components/macros/MacroDevice.tsx` container (default 4, max 16 knobs) **mounting the existing `components/library/MacroKnob.tsx` — revival, not reimplementation** (`feedback_read-existing-component-before-parallel-build`; adapt via a thin prop mapper if `MacroMapping`-shaped props don't fit the new `Macro` type — extend MacroKnob's props additively in place if needed); per-knob route-list panel (route rows: target, depth, curve, delete); right-click "Map to Macro N" affordance on param rows in the effects panel (locate the param-row component via `git grep -rn "ParamPanel\|param-row" frontend/src/renderer/components/effects/` at packet start); mounted in the performance surface near PadGrid (read `components/performance/` layout first).
- **Scope (VERIFIED paths):** NEW `components/macros/{MacroDevice.tsx,index.ts}` + BEM CSS, `components/library/MacroKnob.tsx` (additive prop extension ONLY if required), param-row context-menu affordance, `stores/macros.ts` actions (all undoable), Vitest.
- **DO-NOT-TOUCH:** root layout grid rows; PadGrid/PadEditor internals; `EffectBrowser.tsx`.
- **TEST PLAN:** Vitest `frontend/src/__tests__/components/macros/macro-device.test.tsx` — named: `renders four knobs by default`, `knob drag updates macro value and chain`, `map to macro adds route with param min max`, `route delete is undoable`, `sixteen macro cap enforced at UI`, `deselect/unmount cleans listeners` (Gate-14 wiring checklist: every prop passed, entry AND exit paths). Full vitest + live-runtime smoke per Gate 18 (name the runtime path).
- **ACCEPTANCE GATES:** turn one knob → N params move in preview (the Arca "everything moves at once" moment, F3 plan §Why); MacroKnob no longer dead code (grep shows the import); **F3 fold COMPLETE** — note in ROADMAP §2.5 decision 1 + cross-modal ledger row in this PR.
- **ROLLBACK:** revert PR — components additive.
- **EVIDENCE:** vitest output; screen capture of one-knob-many-params; importer grep.
- **Model:** Sonnet.

---

## Track D — Effects-as-sources + single-tick feedback (vision C6 lineage, scalar-tap subset)

> Decision honored (vision §6 C6 + §7): self-referential modulation is legal ONLY through a **1-frame delay** — the tap a frame-N consumer reads was computed at frame N-1. That single tick is what makes feedback edges acyclic-in-time while the instantaneous graph stays a DAG. Full C6 (pixel/DCT/latent feedback) stays Tier 5 (`🚧SG-3`); this track ships the scalar-tap subset that needs no latent machinery.

### T3.11 — Render tap registry: post-composite scalar taps as mod sources · RISK:HIGH (hot render path)

- **ID:** T3.11 · **Branch:** `feat/t3-fx-tap-registry` · **Base:** `origin/main` · **Est:** ~4h
- **Depends-on:** **P5b.6–P5b.8 merged (SG-5 GREEN — hard precondition per the brief: feedback-capable sources do not ship before deterministic cycle handling exists).** Composes with P5b.4's SG-3 output gate if landed (tap reads the SAME post-composite choke point — read it first; tap must sit AFTER the finite gate so taps never ingest NaN).
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  git grep -q "break_cycles" origin/main -- backend/src/modulation/ || { echo "STOP: SG-5 (P5b.7) not integrated — feedback sources premature"; exit 1; }
  git grep -n "render_tap" origin/main -- backend/src | head -1            # MUST be EMPTY — else STOP
  git grep -n "def analyze_luminance\|def analyze_motion" origin/main -- backend/src/modulation/video_analyzer.py | head -2   # expect l.66/l.75 — the reused analyzers
  git grep -n "lane_aborted" origin/main -- backend/src/zmq_server.py | head -1
  #   non-empty = SG-3 clause-2 (P5b.4) landed: place the tap AFTER its finite gate; EMPTY = place at the compositor-exit choke point and note SG-3 will wrap it later.
  ```
- **Goal:** NEW `backend/src/modulation/render_taps.py`: after each composite render, compute scalar taps on the OUTPUT frame — `mean_luma` (`analyze_luminance(downscale_proxy(out))`) and `motion_mag` (`analyze_motion` vs previous OUTPUT proxy) — into a per-session single-slot delay buffer `{tap_id: {value, frame_index}}`. `SignalEngine.evaluate_all` gains op type `render_tap` (params `{tap: 'mean_luma'|'motion_mag'}`) whose value is **the previous frame's tap** (frame N reads N-1; frame 0 reads 0.0) — the single-tick delay by construction. Perf budget: one 64×64 proxy + two reductions, <1ms @1080p (same class as the existing video_analyzer path).
- **Scope (VERIFIED paths):** NEW `backend/src/modulation/render_taps.py`, `backend/src/zmq_server.py` (tap update at the composite-exit choke point + state carried beside `self._signal_state`; seek/transport reset clears the buffer), `backend/src/modulation/engine.py` (dispatch arm, mirrors `video_analyzer`'s shape l.198), `backend/src/engine/export.py` (export jobs get their OWN tap buffer — never share preview state; frames are sequential in export so the delay chain is deterministic), NEW `backend/tests/test_modulation/test_render_taps.py`.
- **DO-NOT-TOUCH:** `video_analyzer.py` internals (consume only); compositor math; SG-3 gate logic; preview seeding.
- **TEST PLAN:** named: `test_tap_reads_previous_frame_value_never_current`, `test_frame_zero_tap_is_zero`, `test_mean_luma_tracks_output_brightness`, `test_motion_mag_zero_on_static_output`, `test_seek_resets_tap_buffer`, `test_export_taps_isolated_from_preview_state`, `test_tap_values_clamped_finite`, `test_tap_overhead_under_budget` (perf smoke, ms printed). Full backend suite.
- **ACCEPTANCE GATES:** a `render_tap(mean_luma)` op mapped to a param produces a 1-frame-lagged response (proven by the previous-frame test, not eyeballing); zero measurable render regression (>1ms fails); export determinism untouched.
- **ROLLBACK:** revert PR; the choke-point insertion + dispatch arm named in the commit body for targeted revert.
- **EVIDENCE:** pytest output incl. perf number; the choke-point diff hunk.
- **Model:** Opus/Fable (RISK:HIGH).

### T3.12 — Feedback-edge wiring: delay-edges legal in the cycle graph + deterministic-break test · RISK:HIGH (SG-5 coupling)

- **ID:** T3.12 · **Branch:** `feat/t3-fx-feedback-edges` · **Base:** `origin/main` · **Est:** ~4h
- **Depends-on:** T3.11 merged.
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  git grep -q "render_tap" origin/main -- backend/src/modulation/engine.py || { echo "STOP: T3.11 not merged"; exit 1; }
  git grep -n "_handle_check_dag" origin/main -- backend/src/zmq_server.py | head -1   # expect l.1472 — frontend pre-flight this packet teaches about delay edges
  git grep -q "cycle_safe_edge_addition" origin/main -- backend/src/safety/cycle_detection.py || { echo "STOP: P5b.6 payload absent"; exit 1; }
  ```
- **Goal:** Feedback becomes authorable, bounded, and deterministic: (1) edges whose source is a `render_tap` op are **delay edges** — excluded from the instantaneous cycle graph in `_topological_sort`'s adapter, `cycle_safe_edge_addition` pre-flight, and `_handle_check_dag`, because the 1-frame delay already breaks them in time (an instantaneous cycle THROUGH only delay edges is legal; a mixed cycle with ≥1 instantaneous edge through the same nodes still breaks via SG-5 — defense in depth); (2) **runaway clamp** (vision C6): tap-sourced contributions pass a mandatory output clamp + default `lag` step (T3.7's, 120ms) so brightness→brightness loops converge instead of strobing — author can reduce lag, never remove the clamp; (3) frontend: tap sources selectable as operators, feedback edges get a "↻ 1-frame" badge in the canvas/device chain.
- **Scope (VERIFIED paths):** the SG-5 adapter in `backend/src/modulation/` (P5b.7's — extend its edge classification), `backend/src/zmq_server.py` `_handle_check_dag` (delay-edge filter, payload marks tap sources), `backend/src/modulation/routing.py` (mandatory clamp + default-lag injection for tap-sourced mappings), frontend operator type picker + canvas badge (extend in place), NEW `backend/tests/test_modulation/test_feedback_edges.py`, Vitest for the badge/picker.
- **DO-NOT-TOUCH:** `cycle_detection.py` algorithm internals (classification happens in the adapter); SG-5 break ordering for instantaneous cycles (regression-guard); export hashing.
- **TEST PLAN:** named: `test_pure_delay_cycle_is_legal_and_renders`, `test_mixed_instantaneous_cycle_still_broken_by_sg5`, `test_break_decision_deterministic_with_feedback_edges_present` (the brief's deterministic-break test: 100 repeated sorts, same break), `test_runaway_clamp_converges_luma_feedback_loop` (synthetic brightness→brightness, assert bounded, non-strobing within 30 frames), `test_check_dag_accepts_delay_edge_rejects_instant_cycle`, `test_feedback_export_byte_identical_x2`. Vitest: `tap source selectable`, `feedback edge shows one-frame badge`. Full suites.
- **ACCEPTANCE GATES:** the canonical demo — output luma modulating its own blur depth — runs live without crash, converges, and exports byte-identically ×2; SG-5's existing test suite untouched-green; **effects-as-sources COMPLETE**.
- **ROLLBACK:** revert PR — tap edges become save-rejected again (validator narrows), tap registry (T3.11) stays inert.
- **EVIDENCE:** pytest+vitest output; capture of the luma→blur loop; export hash pair.
- **Model:** Opus/Fable (RISK:HIGH).

---

## Track E — E5 Launchpad bridge (draft #145 cherry-pick + live wiring) — owned HERE (phase-6 deferred it to tier; phase-7 P7.14/D9 consumes it)

### T3.13 — E5 cherry-pick: land the MIDI registry + 3 Launchpad templates · RISK:HIGH (stale merge-base)

- **ID:** T3.13 · **Branch:** `feat/t3-e5-midi-pick` · **Base:** `origin/main` · **Est:** ~1.5h
- **Depends-on:** none.
- **Goal:** Land draft PR #145's payload — `MIDIMappingRegistry`/`MIDIBinding`/`MIDISource` + Launchpad X / Mini Mk3 / Pro Mk3 templates + 28 tests — via cherry-pick per §0.2, NOT a branch merge. **Source-of-truth correction (verified 2026-06-11): the `~/Development/entropic-q7-e5` worktree sits on `feat/tier1-b1-b4lite-c1-c7` @ `7a2c756` — the WRONG branch. The real source is the branch `feat/q7-e5-midi-learn` (local + origin; gh PR #145 headRefName matches). Payload = the single TIP commit `004a47a` only** — everything below it (`f877439` SG-5, `bc0ea0b` I3, `2d2ac79` I2 graph, …) belongs to P5b.6/P3.6 and is NOT E5.
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  cd ~/Development/entropic-v2challenger && git fetch origin
  gh pr view 145 --repo nissimdirect/entropic-v2challenger --json headRefName,state -q '.headRefName + " " + .state'   # MUST print: feat/q7-e5-midi-learn OPEN — else STOP
  git log --oneline -1 feat/q7-e5-midi-learn    # MUST show 004a47a "[q7] feat: PR #27 E5 Hardware MIDI Learn + 3 Launchpad templates (28 tests)" — else re-enumerate, STOP
  git show --stat 004a47a | tail -6
  #   MUST show EXACTLY 4 files, all new: backend/src/midi/__init__.py, backend/src/midi/registry.py,
  #   backend/src/midi/templates.py, backend/tests/test_q7_benchmark/test_midi_learn.py (+691 total) — anything else → STOP
  git ls-tree origin/main backend/src/midi/     # MUST be EMPTY (not already landed) — else STOP
  ```
- **Steps:** `git -C ~/Development/entropic-v2challenger worktree add ../t3-e5 -b feat/t3-e5-midi-pick origin/main` → `git cherry-pick 004a47a` (clean expected — all 4 files new-namespace; `backend/tests/test_q7_benchmark/` exists on main) → any conflict = STOP per §0.2. PR body: close #145 as "landed via T3.13" naming the SHA; comment on #145 documenting the worktree/branch discrepancy so nobody picks from `entropic-q7-e5` later.
- **DO-NOT-TOUCH:** every other commit on `feat/q7-e5-midi-learn`; the `entropic-q7-e5` worktree (leave it; it belongs to the Tier-1 lineage); frontend (T3.14).
- **TEST PLAN:** `cd backend && python -m pytest tests/test_q7_benchmark/test_midi_learn.py -x --tb=short` (expect 28 pass per commit message — the run's actual count is authoritative) → full backend suite.
- **ACCEPTANCE GATES:** payload tests green; `git diff origin/main --stat` shows ONLY the 4 payload files; full suite zero regressions; #145 closed pointing here.
- **ROLLBACK:** delete branch / revert — leaf-namespace, zero coupling.
- **EVIDENCE:** the four precondition outputs pasted in the PR body (§0.2 contract) + pytest pass count.
- **Model:** Sonnet (mechanical but cherry-pick-rule-bound).

### T3.14 — E5 live wiring: template loading + MIDI Learn against macros/params/pads

- **ID:** T3.14 · **Branch:** `feat/t3-e5-live-wiring` · **Base:** `origin/main` · **Est:** ~4h
- **Depends-on:** T3.13 merged; T3.9 merged (macros are the canonical Launchpad knob destination per spec-1 row 96 "Vision E5 hardware bridge maps to these macro destinations").
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  git grep -q "MIDIMappingRegistry" origin/main -- backend/src/midi/registry.py || { echo "STOP: T3.13 not merged"; exit 1; }
  git grep -q "applyMacroModulations" origin/main -- frontend/src/renderer/App.tsx || { echo "STOP: T3.9 not merged"; exit 1; }
  git grep -n "learnTarget" origin/main -- frontend/src/renderer/stores/midi.ts | head -2   # expect l.16/l.62 (VERIFIED) — else re-survey the learn seam
  git grep -n "echo\|suppression" origin/main -- frontend/src/renderer/stores/midi.ts | head -2
  #   non-empty = P5b.25 (SG-H3 seam) landed: CONSUME it for motorized-fader echo; EMPTY = note "SG-H3 absent —
  #   echo tests deferred to P5b.25" in the PR body and DO NOT implement suppression here (P5b.25 is the sole owner).
  ```
- **Goal:** The Launchpad workflow becomes real: (1) template picker in `MIDISettings.tsx` (X / Mini Mk3 / Pro Mk3) loading the T3.13 template over IPC into the session registry, hydrating frontend `CCMapping`/pad maps from the template's bindings; (2) `LearnTarget` union extended with `{type: 'macro', macroId}` — Learn-mode touch of a MacroKnob binds the next incoming CC to that macro's value (the template's "perform mode knobs 1-8" land on macros 1–8 by default); (3) faders/pads/knobs map to **macro OR param OR pad** per vision E5 ("axis OR param OR macro" — axis targets arrive with P5b.24's pickers; note as rider, don't block); (4) template + learned overrides persist via the existing `MIDIPersistData` path.
- **Scope (VERIFIED paths):** `frontend/src/renderer/components/performance/MIDISettings.tsx` + `MIDILearnOverlay.tsx` (extend in place), `frontend/src/renderer/stores/midi.ts` (learn branch l.75–83 gains the macro arm; intake stays behind P5b.25's rate limiter if present), `frontend/src/shared/types.ts` (`LearnTarget` union member — additive), `stores/macros.ts` (CC→macro write path, clamped finite), backend `zmq_server.py` (one `midi_template_get` handler returning template JSON — registry stays backend-canonical), Vitest both sides.
- **DO-NOT-TOUCH:** `useMIDI.ts` device enumeration; pad trigger semantics; `backend/src/midi/{registry,templates}.py` internals (consume; modify only if a genuinely missing accessor — justify in PR body); SG-H3 implementation (P5b.25 owns).
- **TEST PLAN:** Vitest `frontend/src/__tests__/components/performance/midi-template-wiring.test.tsx` — named: `template picker lists three launchpad models`, `loading template hydrates cc mappings`, `learn mode binds next cc to touched macro`, `macro cc input clamped finite`, `template plus learned overrides round-trip through persistence`, `unknown template id rejected with toast not crash`. Backend: `test_midi_template_get_handler_shape` added to the cherry-picked suite's file pattern (new file `backend/tests/test_midi/test_template_ipc.py`). Full suites. Hardware smoke is OPTIONAL (no Launchpad on CI) — if a device is present, run it and say so; never claim hardware-verified without it (`feedback_dont-claim-untested-coverage`).
- **ACCEPTANCE GATES:** template load → synthetic CC 21 message moves macro 1 → N params move in preview (full chain T3.13→T3.14→T3.9); **E5 COMPLETE — unblocks P7.14a's external dependency D9** (note it in the phase-7 file per the ledger-correction protocol).
- **ROLLBACK:** revert PR — backend payload (T3.13) survives standalone.
- **EVIDENCE:** vitest+pytest output; capture of CC→macro→params; the SG-H3 branch note.
- **Model:** Sonnet.

---

## Track F — SG-H2 FD-management (vision §10 cross-cutting hygiene; sole owner per ROADMAP G3 "SG-H2 = packet stub in the EXECUTION-PLAN §5 Tier-3 row")

### T3.15 — SG-H2: raise NOFILE at startup + FD telemetry + idle-handle LRU close

- **ID:** T3.15 · **Branch:** `feat/t3-sgh2-fd-management` · **Base:** `origin/main` · **Est:** ~3.5h
- **Depends-on:** none hard. Probe-composes with P5b.1 (`pressure_status` poll surface) if landed.
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  git grep -n "RLIMIT_AS" origin/main -- backend/src/main.py | head -1        # expect l.39 — the startup rlimit site this extends
  git grep -n "RLIMIT_NOFILE" origin/main -- backend/src | head -1            # MUST be EMPTY — else STOP (already built)
  git grep -n "_max_readers" origin/main -- backend/src/zmq_server.py | head -1   # expect l.75 — the existing count-based reader LRU this upgrades
  git grep -n "pressure_status" origin/main -- backend/src/zmq_server.py | head -1   # non-empty = P5b.1 landed → surface fd stats there; EMPTY = log-only, note in PR body
  ```
- **Goal:** Vision SG-H2 verbatim: "raise ulimit at startup; LRU-close idle handles." (1) At sidecar startup (next to the RLIMIT_AS block, `main.py:39–40`): raise `RLIMIT_NOFILE` soft → `min(hard, 8192)`, log before/after, never lower, never crash if the call fails (log + continue — macOS hard limits vary); (2) NEW `backend/src/safety/fd_monitor.py`: `count_open_fds()` (macOS: `len(os.listdir('/dev/fd'))` in a try/except), `fd_headroom()` vs the soft limit; (3) idle-handle sweep: the reader pool (zmq_server.py:75/1542) gains a **time-based** idle close (reader untouched >120s → closed, reopened lazily on next touch) on top of the existing count cap — Tier-3/5b features multiply FD consumers (frame-bank slots P5b.9, ONNX session P5b.14, field sources P6.3, MIDI devices T3.13) and the count-10 cap alone doesn't cover them; (4) warn-log at <20% headroom (+ `pressure_status` field per the probe branch).
- **Scope (VERIFIED paths):** `backend/src/main.py` (startup block), NEW `backend/src/safety/fd_monitor.py`, `backend/src/zmq_server.py` (idle sweep on the existing reader OrderedDict + last-touch timestamps; the sweep piggybacks an existing periodic seam — find the heartbeat/tick first, read before editing), NEW `backend/tests/test_safety/test_fd_management.py`.
- **DO-NOT-TOUCH:** `RLIMIT_AS` value/semantics; `_max_readers` count cap (keep both bounds); reader decode logic; frame-bank/interp pools (they register their OWN disposal with SG-8 — this packet only monitors + sweeps the reader pool).
- **TEST PLAN:** `cd backend && python -m pytest tests/test_safety/test_fd_management.py -x --tb=short` — named: `test_nofile_soft_limit_raised_at_startup`, `test_raise_failure_logs_and_continues`, `test_count_open_fds_returns_positive_int`, `test_idle_reader_closed_after_timeout_and_reopens_lazily`, `test_recently_touched_reader_not_swept`, `test_headroom_warning_logged_under_threshold` (mocked limit), plus (branch) `test_pressure_status_includes_fd_stats`. Full backend suite — the 12K-test suite itself is the best FD-regression canary; zero new "too many open files" flakes.
- **ACCEPTANCE GATES:** startup log proves the raise on a real run; idle sweep provably closes + lazily reopens without a playback glitch (test simulates); **SG-H2 GREEN** in the ROADMAP G3 ledger (fix the row in this PR).
- **ROLLBACK:** revert PR — monitoring additive; the sweep is one seam insertion named in the commit body.
- **EVIDENCE:** pytest output; the before/after rlimit log line; sweep diff hunk.
- **Model:** Sonnet.

---

## Sequencing summary

```
Startable once P1.1 (#158) + P6.1 land:
  T3.1 → T3.2 → T3.3                          (B4-full standard rules; single-flight on axis-binding.ts/schema.py,
                                               queue behind P5b.21+22 if in flight)
Gated on P6.2+P6.3 (field infra):
  T3.3 → T3.4 → T3.5                          (painted; T3.5 also needs P6.6)
Startable now (flag-state handled in-packet):
  T3.6 → T3.7                                  (cross-modal sources + per-edge lag/S+H)
Gated on P6.10 (canvas):
  T3.7 → T3.8                                  (matrix UI; axis pickers branch on P5b.21)
Startable now:
  T3.9 → T3.10                                 (F3 macros)
  T3.13 → T3.14                                (E5; T3.14 also needs T3.9)
  T3.15                                        (SG-H2, independent)
Gated on SG-5 GREEN (P5b.6–8):
  T3.11 → T3.12                                (effects-as-sources + feedback)

Tier-3 exit artifact (campaign rule 2, "exit criteria are artifacts"):
  one committed demo project + capture in which a Launchpad CC drives a macro,
  whole-audio centroid drives a painted-masked lane via scanOver, and output
  luma feeds back into its own blur through a 1-frame delay edge — rendered,
  exported ×2 byte-identical. That file existing and hashing equal IS Tier 3 done.
```

**Carve-outs filed, not packetized (explicit, so nobody improvises):**
- **vision-B3 mod-as-track** — in the Tier-3 stub row but deliberately not authored here (spec-1 row 27: "Defer to Tier 3+; depends on B4 full ship"). It needs B4-full (this file) + a `Track.type` union change (the P6.8 hazard class). Author as T3.16+ at the next boundary once T3.1–T3.8 are merged reality.
- `hilbert` / `polar` / `learned` binding rules — research tier (Tier 6+ per axis-binding.ts header; `learned` hard-needs SG-3).
- Video→audio direction of the B2 matrix (vision says "both directions") — no audio-effect destinations exist on main; revisit when audio effects ship.
- Full C6/C8 pixel/DCT/latent feedback — Tier 5, SG-3-gated; T3.11/12's scalar taps are the deliberate subset.
- Launchpad **axis** targets (pads → axis values) — rider on P5b.24's axis pickers, noted in T3.14.
