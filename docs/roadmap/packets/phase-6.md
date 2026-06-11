# Phase 6 Work Packets — Tier 2b: Field Params + Routing Surfaces

**Authored:** 2026-06-11 · against `origin/main` @ `d821ae8` (PR #166)
**Scope:** C2 Frame-as-Parameter-Lane · C3 Per-Pixel Parameter Fields (Metal codegen) + SG-1 real Metal binding · I1 Inspector Track · I2 Routing Canvas
**Sources:** `docs/roadmap/plans/entropic-synth-paradigm-vision.md` §6 C/I + §10 SG-1 · `docs/roadmap/specs/entropic-spec-3-safety-gates.md` §2 · `docs/roadmap/specs/entropic-spec-1-crosswalk.md` §3/§5 · `docs/roadmap/ROADMAP.md` Phase 6
**UI design source:** `~/.claude/plans/entropic-inspector-mockups.html` (I1/I2/I3 surfaces; Routing Canvas ⌘⇧I 3-column layout verified present in the file)

---

## Global rules (apply to every packet)

1. **Base:** every branch cuts from `origin/main`. First command of every packet:
   ```bash
   cd ~/Development/entropic-v2challenger && git fetch origin && git rev-parse origin/main
   ```
   `origin/main` must be `d821ae8` **or a descendant**. If it has moved, re-verify the packet's VERIFIED paths before starting (paths below were verified at `d821ae8`).
2. **CHERRY-PICK RULE (parked q7 drafts):** the q7 branches have a **stale merge-base** (cut before ~10 later merges; raw-merging them falsely reverts merged work — see `memory/feedback_cherry-pick-stale-scaffold-branches.md`). **Never `git merge` a q7 branch.** Enumerate payload with `git log origin/main..<branch> --oneline`, identify the single tip commit that is the actual payload, `git cherry-pick <sha>` onto a fresh branch off `origin/main`. Payload commits verified 2026-06-11:
   - I1 probe registry: `d85828e` (tip of `feat/q7-i1-inspector`, PR #140) — 3 files, +428
   - I2 routing graph: `2d2ac79` (tip of `feat/q7-i2-routing-canvas`, PR #142) — 2 files, +509 — **pick owned by Phase-5b P5b.6** (SG-5 dependency); P6.9 wires only
   - I3 inline actions: `bc0ea0b` (tip of `feat/q7-i3-inline-probe`, PR #143) — **NOT in Phase 6 scope** (I3 full UI gated on PR-A; inline-actions shell already on main via #148)
3. **Test commands (canonical, from repo CLAUDE.md):**
   - Backend: `cd backend && python -m pytest -x -n auto --tb=short`
   - Frontend unit: `cd frontend && npx --no vitest run` (the `--no` is mandatory)
   - Metal-gated: `cd backend && python -m pytest -m metal` (pyproject marker exists: `backend/pyproject.toml:32`)
4. **Conventions:** effects are pure `(frame, params, state_in) -> (result, state_out)`; IPC camelCase TS ↔ snake_case Python; BEM CSS; commit scopes `effects, timeline, zmq, automation, …`.
5. **Sizing:** each packet ≤ 4h. If you blow past 4h, stop, push WIP branch, report.
6. **PR per packet.** No stacking unless the packet says so.

### Phase-entry preconditions (check once before ANY packet)

```bash
cd ~/Development/entropic-v2challenger && git fetch origin
# 1. PR-B slice 2 (#158 axis-binding store wiring) must be MERGED — Phase 6 builds on it:
git grep -q "setLaneAxisBinding" origin/main -- frontend/src/renderer/stores/automation.ts && echo OK-158 || { echo "STOP: #158 not merged"; exit 1; }
# 2. SG-1 lib must be on main (merged via #163):
git cat-file -e origin/main:backend/src/safety/gpu_resources.py && echo OK-SG1-LIB || { echo "STOP: SG-1 lib missing"; exit 1; }
# 3. Backend B1 lane schema on main (merged via #148):
git cat-file -e origin/main:backend/src/modulation/lane_reader.py && echo OK-B1 || { echo "STOP: lane_reader missing"; exit 1; }
```
**As of 2026-06-11, check 1 FAILS — #157/#158/#160 are still open (Phase 1/2 of the roadmap not done).** Packets P6.1 and P6.6 hard-require #158; all other packets only require checks 2–3 and can start now.

---

## Dependency graph

```
P6.1 (CPU y/x render unlock)  ──┐
P6.2 (C3 schema + top-25) ──┬───┼── P6.6 (field UI + IPC)
P6.3 (C2 field sources) ────┘   │
P6.4 (SG-1 Metal binding) ──── P6.5 (Metal codegen) ──┐
P6.7 (I1 backend) ── P6.8 (I1 frontend track)         ├── P6.11 (integration + docs)
P6.7 ── P6.9 (I2 backend) ── P6.10 (I2 canvas UI) ────┘
```

---

## P6.1 — CPU row-banded lane evaluation: the `domain='y'/'x'` live render unlock

- **Branch:** `feat/p6-c3-cpu-row-bands`
- **Base:** `origin/main`
- **Depends-on:** PR #158 merged (hard), PR #157 merged (transitively)
- **Goal:** A lane with `axisBinding.domain='y'` (or `'x'`) actually changes the *rendered* frame — per-scanline-band parameter variation in the live render path. This is the unlock PR #158 explicitly deferred ("y/x persist + validate now but only render once C2/C3 lands"). CPU-only, effect-agnostic, no Metal.
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  cd ~/Development/entropic-v2challenger && git fetch origin
  git grep -q "setLaneAxisBinding" origin/main -- frontend/src/renderer/stores/automation.ts || { echo "STOP: #158 not merged"; exit 1; }
  git grep -q "def sample_lane_row" origin/main -- backend/src/modulation/lane_reader.py || { echo "STOP: sample_lane_row missing from lane_reader"; exit 1; }
  git grep -qn "automation_overrides" origin/main -- backend/src/zmq_server.py || { echo "STOP: automation_overrides intake missing"; exit 1; }
  ```
- **Scope (VERIFIED paths @ d821ae8):**
  - `backend/src/modulation/lane_reader.py` — `sample_lane`, `sample_lane_row`, `FrameCoord` (read-only reuse)
  - `backend/src/modulation/schema.py` — `Lane`, `LaneDomain`, `from_dict` (read-only reuse)
  - `backend/src/engine/pipeline.py` — `apply_chain` (line ~103) (extend)
  - `backend/src/zmq_server.py` — `render_frame` handler (~line 269) + `automation_overrides` intake (~line 557) (extend)
  - NEW: `backend/src/modulation/field_eval.py`
  - NEW: `backend/tests/test_field_eval.py`
- **DO-NOT-TOUCH:** `frontend/**` (P6.6 owns the sender side), `backend/src/effects/fx/**` (no per-effect edits — this is container-level), `backend/src/engine/export.py` determinism logic, `EXPERIMENTAL_AUDIO_TRACKS` flag.
- **Steps:**
  1. New `field_eval.py`: `def evaluate_axis_lane_bands(curve, lane, t_norm, n_bands=32) -> list[float]` — wraps `sample_lane_row` for `domain in (Y, X)`; returns one scalar per horizontal (Y) or vertical (X) band. Clamp `n_bands` to [2, 128].
  2. Extend the `render_frame` ZMQ message with optional `axis_lanes`: `[{effect_id, param, curve: [float], domain, direction, interp_mode, loop_mode}]` (snake_case; reuse `Lane.from_dict`). Absent → exact current behavior (additive, backward-compatible).
  3. In the render path (where `automation_overrides` are applied via `modulation/engine.py` before `apply_chain`): when `axis_lanes` is present for an effect, split the frame into `n_bands` strips along the lane's axis, run that effect once per strip with the band's scalar for the bound param, reassemble. Implement as a wrapper in `field_eval.py` called from `pipeline.apply_chain` (new optional `axis_lanes` argument), NOT inside individual effects. Per-strip state handling: pass `state_in` only to band 0 and propagate band-0 `state_out` (document this limitation in a docstring — stateful effects get approximate banding).
  4. Perf guard: if `len(chain_with_axis_lanes_effects) * n_bands > 512` invocations per frame, log a warning and reduce `n_bands` to stay under budget (mirror the precedent of #166's render-budget clamp).
- **TEST PLAN:**
  ```bash
  cd ~/Development/entropic-v2challenger/backend && python -m pytest tests/test_field_eval.py -x --tb=short
  python -m pytest -x -n auto --tb=short   # full backend, zero regressions
  ```
  Named tests (write all): `test_y_domain_lane_produces_per_band_values`, `test_x_domain_bands_are_vertical_strips`, `test_no_axis_lanes_renders_byte_identical_to_main` (golden: render a frame with and without the new arg absent → identical hash), `test_t_domain_lane_rejected_from_axis_lanes` (T stays in `automation_overrides` path), `test_band_count_clamped`, `test_stateful_effect_band0_state_propagation`, `test_direction_negative_reverses_band_order`, `test_render_frame_ipc_accepts_axis_lanes_payload`.
- **ACCEPTANCE GATES:**
  - Full backend suite green; the byte-identical no-op test proves zero render change when feature unused.
  - A scripted render (extend `backend/scripts/demo_trilogy/render_demos.py` patterns, do not modify that file) of `fx.blur` with a Y-domain ramp lane visibly blurs the bottom more than the top — save PNG evidence.
- **ROLLBACK:** revert the single PR commit; `axis_lanes` is additive to the IPC payload so no schema migration to unwind.
- **EVIDENCE:** test output, before/after PNG pair, `git log -1 --oneline` on branch + PR URL.

---

## P6.2 — C3 schema: scalar-OR-field params + the top-25 list

- **Branch:** `feat/p6-c3-field-schema`
- **Base:** `origin/main`
- **Depends-on:** none (backend-only, independent of #158)
- **Goal:** Backend schema for a param that is either a scalar or a 2D field, plus the frozen, reviewable top-25 effect list with an explicit selection criterion. No rendering yet (P6.5/P6.1 consume this).
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  cd ~/Development/entropic-v2challenger && git fetch origin
  git grep -q "RESERVED_PARAM_PREFIX" origin/main -- backend/src/effects/registry.py || { echo "STOP: RESERVED_PARAM_PREFIX guard missing from registry"; exit 1; }
  git ls-tree origin/main --name-only backend/src/effects/fx/ | wc -l   # expect ~144 files
  ```
- **Scope (VERIFIED paths):**
  - `backend/src/effects/registry.py` — `register()`, `list_all()`, `_REGISTRY` (extend)
  - NEW: `backend/src/effects/field_params.py` (FieldRef descriptor + validation)
  - NEW: `backend/src/effects/field_top25.py` (frozen constant list)
  - NEW: `backend/scripts/gen_field_top25.py` (generator, committed for reproducibility)
  - NEW: `backend/tests/test_field_params.py`
- **DO-NOT-TOUCH:** individual effect modules in `backend/src/effects/fx/` (capability is declared registry-side, not per-effect, in this packet), `frontend/**`, `backend/src/engine/**`.
- **Steps:**
  1. `field_params.py`: `FieldRef` dataclass — `{kind: 'image'|'video'|'lane2d', source_id: str, gain: float = 1.0, invert: bool = False}` with `to_dict`/`from_dict` and a validator (gain finite + clamped [-4, 4]; unknown `kind` → `ValueError`). A param value of shape `{"__field__": {...}}` deserializes to `FieldRef`; everything else stays scalar. The `__field__` key deliberately uses the reserved `_*`-adjacent style but is a dict VALUE not a param KEY, so it does not collide with the `RESERVED_PARAM_PREFIX` registration guard — add a test proving registration still rejects `_foo` keys.
  2. Registry: add optional `field_capable: set[str]` metadata per effect at registration (default empty). `list_all()` exposes it as `fieldParams: [...]` so the frontend can render the field toggle.
  3. **Top-25 selection criterion (the list source — this is normative):**
     - Candidates = all registered effects whose `PARAMS` contain ≥1 `type: 'float'` param with `min < max` (continuous).
     - Classify each candidate **pointwise** (output pixel depends only on input pixel + params: e.g. `brightness_exposure`, `hue_shift`, `invert`-family, `bitcrush`, `noise`, `channelshift`) vs **spatial** (kernel/area: e.g. `blur`, `pixel-sort` family). Classification is by inspection, recorded as a field in the list.
     - Rank: all pointwise candidates first (true per-pixel fields), then spatial candidates (field applied **banded**, per P6.1 semantics), tie-broken by category coverage — at least one effect from every effect category that has a candidate, then alphabetical.
     - Take 25. Freeze as `FIELD_TOP25: list[FieldTop25Entry]` in `field_top25.py` with `{effect_id, params: [...], mode: 'pointwise'|'banded'}` per entry.
  4. `gen_field_top25.py` regenerates the candidate table from the live registry and diffs it against the frozen file (CI-runnable; drift = printed warning, not failure). The frozen file is the source of truth; the PR review is where the human ratifies the 25.
  5. Wire validation: `apply_chain` (pipeline.py) gets a guard — if a param arrives as a `__field__` dict for an effect/param not in `FIELD_TOP25`, raise `ValueError` with an actionable message. (Guard only; evaluation lands in P6.1-banded / P6.5-Metal.)
- **TEST PLAN:**
  ```bash
  cd backend && python -m pytest tests/test_field_params.py -x --tb=short && python -m pytest -x -n auto --tb=short
  python scripts/gen_field_top25.py --check
  ```
  Named tests: `test_fieldref_roundtrip`, `test_fieldref_rejects_unknown_kind`, `test_fieldref_gain_clamped`, `test_scalar_params_unaffected`, `test_field_param_on_unlisted_effect_raises`, `test_top25_all_entries_registered_effects`, `test_top25_params_exist_in_effect_PARAMS`, `test_top25_has_exactly_25`, `test_reserved_param_prefix_guard_still_fires`.
- **ACCEPTANCE GATES:** full backend green; `gen_field_top25.py --check` passes; the frozen list names exactly 25 real effect ids (verified against `registry.list_all()` in test).
- **ROLLBACK:** revert PR; no persisted-project schema change (FieldRef only appears in projects once UI ships in P6.6).
- **EVIDENCE:** test output, the frozen top-25 table pasted into the PR body with pointwise/banded classification, PR URL.

---

## P6.3 — C2 field sources: image/video ref → 2D field provider

- **Branch:** `feat/p6-c2-field-source`
- **Base:** `origin/main`
- **Depends-on:** P6.2 merged (consumes `FieldRef`)
- **Goal:** Resolve a `FieldRef` to an actual normalized 2D `np.ndarray` field: still image → static luma field; video ref → per-frame luma field. The field itself is modulatable via `gain`/`invert` (v1 of "field itself modulatable"). LRU-cached.
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  cd ~/Development/entropic-v2challenger && git fetch origin
  git grep -q "class FieldRef" origin/main -- backend/src/effects/field_params.py || { echo "STOP: P6.2 not merged"; exit 1; }
  git grep -qn "codec timeout\|decode_timeout\|TimeoutError" origin/main -- backend/src/engine/codecs.py || echo "WARN: verify SG-7 wrap location before reusing"
  ```
- **Scope (VERIFIED paths):**
  - NEW: `backend/src/effects/field_source.py` (provider + LRU cache)
  - `backend/src/engine/codecs.py` — reuse existing SG-7-wrapped decode helpers (read-only reuse; verify exact function names at packet start — SG-7 merged via #149 wrapped 8 callsites)
  - NEW: `backend/tests/test_field_source.py`
- **DO-NOT-TOUCH:** `backend/src/engine/pipeline.py` (P6.1/P6.5 own integration), `frontend/**`, decode internals (only call existing wrapped helpers — never raw `av.open`, SG-7 exists for a reason).
- **Steps:**
  1. `FieldProvider.resolve(ref: FieldRef, frame_index: int, resolution: (w, h)) -> np.ndarray` — float32, shape `(h, w)`, range [0, 1] after luma conversion (Rec. 709 weights), bilinear-resized to render resolution, then `gain` applied and `invert` as `1 - f`, final clamp to [0, 1]. **Numeric trust boundary:** NaN/Inf in decoded frames → `np.nan_to_num` + clamp (per `memory/feedback_numeric-trust-boundary.md`).
  2. LRU cache keyed `(source_id, frame_index_bucket, resolution)`; cap ≈ 64 entries or 256MB, whichever first; expose `cache_stats()` for the EVIDENCE step.
  3. Video refs: map render `frame_index` → source frame by wrapping (loop) — document; decode through the existing SG-7 timeout-wrapped path only.
  4. Missing/corrupt source → return a flat 0.5 field + log warning (render must never crash on a dead ref; mirrors effect-health auto-disable philosophy in `pipeline.py`).
- **TEST PLAN:**
  ```bash
  cd backend && python -m pytest tests/test_field_source.py -x --tb=short && python -m pytest -x -n auto --tb=short
  ```
  Named tests: `test_image_ref_resolves_to_unit_range_field`, `test_field_resized_to_render_resolution`, `test_gain_and_invert_applied`, `test_nan_input_sanitized`, `test_missing_source_returns_flat_field_and_warns`, `test_lru_eviction_under_cap`, `test_video_ref_frame_wraps`, `test_cache_hit_skips_decode` (mock decode counter).
- **ACCEPTANCE GATES:** full backend green; a scripted resolve of a real PNG produces a plausible field (save grayscale PNG of the field as evidence); zero raw `av.open` calls added (`git grep "av.open" -- backend/src/effects/` → empty).
- **ROLLBACK:** revert PR — nothing else imports `field_source` until P6.5/P6.6.
- **EVIDENCE:** test output, field-visualization PNG, cache_stats() printout, PR URL.

---

## P6.4 — SG-1 real Metal binding (MLX) + forbidden-pattern AST lint **[RISK: HIGH]**

- **Branch:** `feat/p6-sg1-metal-binding`
- **Base:** `origin/main`
- **Depends-on:** none (SG-1 lib already on main via #163)
- **Goal:** Close the two gaps PR #163 explicitly deferred to "first Tier-2 GPU effect" — which is this phase: **(gap 6)** a real Metal-backed `GPUResource` via **MLX** (the codebase's committed Metal backend — pytest marker `metal: real GPU/Metal-backend tests (skipped without MLX)` at `backend/pyproject.toml:32`), and **(gap 5)** the forbidden-pattern AST lint (no raw Metal/MLX allocations outside wrappers — SPEC-3 §2.2).
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  cd ~/Development/entropic-v2challenger && git fetch origin
  git grep -q "class MockGPUResource" origin/main -- backend/src/safety/gpu_resources.py || { echo "STOP: SG-1 MockGPUResource missing"; exit 1; }
  git grep -q "metal: real GPU" origin/main -- backend/pyproject.toml || { echo "STOP: metal pytest marker missing"; exit 1; }
  python -c "import mlx.core" 2>/dev/null && echo MLX-AVAILABLE || echo "WARN: MLX not installed locally — metal tests will skip; CI-mock tests still must pass"
  ```
- **Scope (VERIFIED paths):**
  - `backend/src/safety/gpu_resources.py` — `GPUResource` protocol, `_release_raw_handle` (line ~128: the documented seam — "for the Metal binding this is where `mtl_texture.setPurgeableState_` …"), `GPUResourcePool`, `GlobalPoolRegistry` (extend)
  - `backend/tests/test_q7_benchmark/test_gpu_resources.py` — existing 33 tests incl. gated `@pytest.mark.metal` RSS variant (extend)
  - NEW: `backend/src/safety/mlx_resources.py` (`MLXGPUResource`)
  - NEW: `backend/scripts/lint_gpu_patterns.py` (AST lint) + CI hook
  - `backend/pyproject.toml` — add `mlx` as optional extra `[project.optional-dependencies] metal = ["mlx>=…"]` (verify current MLX version at packet time)
- **DO-NOT-TOUCH:** the existing `MockGPUResource` semantics and all 33 existing tests (they are the contract — extend, never weaken), `backend/src/effects/**`, anything frontend.
- **Steps:**
  1. `MLXGPUResource` implementing the `GPUResource` protocol: wraps an `mlx.core.array` (unified-memory buffer); `destroy()` drops the reference + calls `mlx.core.clear_cache()` when pool drains; `size_bytes` from dtype × shape; `raw` raises `DestroyedHandleError` after destroy; `weakref.finalize` fallback identical to mock (same code path — that was #163's design intent).
  2. Import-guard MLX (`try: import mlx.core except ImportError`) so non-Apple CI never breaks; expose `mlx_available() -> bool`.
  3. Make the existing `@pytest.mark.metal` RSS leak test (SPEC-3 §2.5 literal form: 10k acquire/destroy, heap returns to baseline ± tolerance) run against `MLXGPUResource` for real.
  4. AST lint (`lint_gpu_patterns.py`): walk `backend/src/`, flag (a) `mlx.core` allocation calls (`zeros|ones|array|full`) outside `safety/mlx_resources.py`, (b) module-level GPU objects, (c) any `Metal`/`MTL` pyobjc usage anywhere. Exit 1 on findings. Wire into CI next to existing lint steps (locate the CI workflow file at packet start; DO NOT modify unrelated workflow steps — workflow changes need user merge per standing rules, so put the lint in a `pyproject` script + invoke from the existing test job if possible, otherwise flag for user).
  5. Run lint on current tree; existing legit MLX usage (e.g. `effects/spectral/`) gets an explicit allowlist entry with justification comments.
- **TEST PLAN:**
  ```bash
  cd backend && python -m pytest tests/test_q7_benchmark/test_gpu_resources.py -x --tb=short   # all 33 existing + new
  python -m pytest -m metal --tb=short    # on the M-series dev machine; report skip-count if MLX absent
  python scripts/lint_gpu_patterns.py
  python -m pytest -x -n auto --tb=short
  ```
  Named new tests: `test_mlx_resource_implements_protocol`, `test_mlx_destroy_idempotent`, `test_mlx_raw_after_destroy_raises`, `test_mlx_finalizer_frees_forgotten_handle` (metal-marked), `test_mlx_10k_acquire_destroy_rss_baseline` (metal-marked), `test_pool_evicts_mlx_resources_lru` (metal-marked), `test_mlx_unavailable_importerror_clean`, `test_lint_flags_raw_mlx_alloc` + `test_lint_passes_clean_tree` (lint self-tests on fixture strings).
- **ACCEPTANCE GATES:**
  - All pre-existing 33 SG-1 tests still green, untouched.
  - `pytest -m metal` green on the dev Mac (this is the gate the whole phase is named for — **paste the run output in the PR**). If MLX cannot be installed, the packet is NOT done — STOP and report.
  - Lint runs clean on the tree and catches a seeded violation in its self-test.
- **ROLLBACK:** revert PR; `mlx` extra is optional so no environment breakage; lint un-wires with the revert.
- **EVIDENCE:** `pytest -m metal` output with real allocation counts, lint output, PR URL.

---

## P6.5 — C3 Metal codegen: per-pixel field application on GPU **[RISK: HIGH]**

- **Branch:** `feat/p6-c3-metal-codegen`
- **Base:** `origin/main`
- **Depends-on:** P6.2 + P6.4 merged. (P6.3 useful but not required — tests can use synthetic fields.)
- **Goal:** GPU path that applies a per-pixel 2D field to a param for the **pointwise** subset of the top-25, via MLX elementwise kernels, with every buffer owned by SG-1 pools. CPU parity fallback for machines without MLX. Spatial (`banded`) entries keep the P6.1 CPU path — that is by design, not a gap: a per-pixel-varying gaussian radius is not expressible as one elementwise kernel.
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  cd ~/Development/entropic-v2challenger && git fetch origin
  git grep -q "FIELD_TOP25" origin/main -- backend/src/effects/field_top25.py || { echo "STOP: P6.2 not merged"; exit 1; }
  git grep -q "class MLXGPUResource" origin/main -- backend/src/safety/mlx_resources.py || { echo "STOP: P6.4 not merged"; exit 1; }
  cd backend && python -m pytest -m metal --co -q | tail -2   # metal tests must exist and collect
  ```
- **Scope (VERIFIED paths):**
  - NEW: `backend/src/effects/field_codegen.py` (kernel templates + dispatch)
  - `backend/src/engine/pipeline.py` — `apply_chain`: route field-params for `mode='pointwise'` top-25 entries through codegen (extend the guard added in P6.2)
  - `backend/src/safety/mlx_resources.py`, `gpu_resources.py` — consume only (pool registration keyed by effect-instance-id per SPEC-3 §2.4)
  - NEW: `backend/tests/test_field_codegen.py`
- **DO-NOT-TOUCH:** effect module internals (`fx/*.py` stay pure CPU functions — codegen wraps, never edits), the SG-1 wrapper layer (consume only), `frontend/**`, export determinism (`engine/determinism.py`).
- **Steps:**
  1. Kernel strategy v1 (honest scope): a **generic param-field composite** — for a pointwise effect `E` and param `p` with field `F`: compute `E(frame, p=p_min)` and `E(frame, p=p_max)` on CPU (2 invocations), then GPU-lerp per pixel: `out = lerp(E_min, E_max, F)` via MLX elementwise ops. This is exact for params the effect applies linearly and a documented approximation otherwise; record per-entry `approx: bool` in `field_top25.py`. (True per-effect shader transpilation is Tier-2-follow-up; do not attempt it inside a 4h packet.)
  2. Every MLX buffer (frame upload, field, output) acquired through a `GPUResourcePool` registered per effect-instance-id; pool destroyed on effect unmount / chain removal (enforcement point per SPEC-3 §2.4 — find the chain-removal path in `pipeline.py`/`zmq_server.py` `flush_state` and hook it).
  3. Dispatch rule in `apply_chain`: param is `FieldRef` AND entry `mode='pointwise'` AND `mlx_available()` → codegen path; `mode='pointwise'` without MLX → CPU lerp fallback (same math, numpy); `mode='banded'` → P6.1 band path with the field row/column-averaged to per-band scalars.
  4. Determinism: GPU and CPU paths must agree within tolerance — parity test `max_abs_diff ≤ 2/255`; export path forces the CPU fallback until parity is proven tighter (flag `FIELD_GPU_IN_EXPORT = False` constant, documented).
- **TEST PLAN:**
  ```bash
  cd backend && python -m pytest tests/test_field_codegen.py -x --tb=short
  python -m pytest -m metal --tb=short
  python -m pytest -x -n auto --tb=short
  ```
  Named tests: `test_pointwise_field_lerp_cpu_reference`, `test_gpu_cpu_parity_within_tolerance` (metal), `test_flat_field_equals_scalar_render` (field≡0.5 const ≈ scalar midpoint — the key correctness anchor), `test_pool_registered_per_effect_instance`, `test_effect_unmount_destroys_pool` (SPEC-3 §2.5 `test_effect_unmount_clears_its_pool` analog at the codegen layer), `test_banded_mode_field_collapses_to_bands`, `test_no_mlx_falls_back_cpu`, `test_export_uses_cpu_path`, `test_10_renders_no_handle_growth` (metal; pool stats flat across 10 frames).
- **ACCEPTANCE GATES:** parity test green on dev Mac; pool-stats-flat test green (THE SG-1-confirmed gate for Tier 2b per vision §8); full suite green; visible evidence render — `fx.brightness_exposure` (or first pointwise top-25 entry) driven by a radial-gradient field produces a vignette. 
- **ROLLBACK:** revert PR; dispatch rule collapses to the P6.2 guard (field params rejected at render) — no data loss.
- **EVIDENCE:** parity numbers, pool stats before/after 10 renders, vignette PNG, `pytest -m metal` output, PR URL.

---

## P6.6 — Frontend field params + axis-lane render wiring (C2/C3 UI)

- **Branch:** `feat/p6-field-ui`
- **Base:** `origin/main`
- **Depends-on:** P6.1 + P6.2 + P6.3 merged; #158 merged (hard).
- **Goal:** Users can (a) set a lane Domain to Y/X and *see it render live* (remove #158's "only renders once C2/C3 lands" tooltip caveat), (b) assign an image from the library as a 2D field on a top-25 effect param. Design source: `~/.claude/plans/entropic-inspector-mockups.html`.
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  cd ~/Development/entropic-v2challenger && git fetch origin
  git grep -q "setLaneAxisBinding" origin/main -- frontend/src/renderer/stores/automation.ts || { echo "STOP: #158 not merged"; exit 1; }
  git grep -q "axis_lanes" origin/main -- backend/src/zmq_server.py || { echo "STOP: P6.1 not merged"; exit 1; }
  git grep -q "fieldParams" origin/main -- backend/src/effects/registry.py || { echo "STOP: P6.2 not merged"; exit 1; }
  ```
- **Scope (VERIFIED paths):**
  - `frontend/src/renderer/App.tsx` — render-payload assembly (~line 923, where `automation_overrides` is attached): also attach `axis_lanes` for lanes with `axisBinding.domain` `'y'|'x'`, serialized snake_case via `frontend/src/shared/ipc-serialize.ts`
  - `frontend/src/renderer/stores/automation.ts` + `frontend/src/shared/axis-binding.ts` (consume; #158 added the domain selector — find it in `frontend/src/renderer/components/automation/` at packet start and update its tooltip)
  - `frontend/src/renderer/components/effects/` — param row: "Field…" assignment control shown only for params present in `list_effects` `fieldParams`
  - `frontend/src/shared/types.ts` — `EffectInstance` param value union extension (scalar | FieldRef-shaped object); `frontend/src/shared/validate.ts` if it validates param shapes (check at packet start)
  - NEW tests under `frontend/src/__tests__/`
- **DO-NOT-TOUCH:** `backend/**` (all backend landed in P6.1–P6.3), timeline grid CSS (`memory/feedback_test-layout-changes.md`), undo store internals (use existing undoable-action patterns from `setLaneAxisBinding`).
- **Steps:**
  1. Render payload: for each armed track's lanes with `domain in ('y','x')`, evaluate the lane's point curve to a sampled `curve: number[]` (reuse the same sampling the automation overrides use; verify in `resolveGhostValues.ts` + store) and attach `axis_lanes`. Gate on array non-empty (don't bloat every render IPC).
  2. Param "Field…" control: dropdown/button on field-capable params → pick a library media item → param value becomes `{__field__: {kind, source_id, gain: 1, invert: false}}`; small gain slider + invert toggle inline; "Clear field" restores last scalar (keep scalar in component state for restore). All changes undoable.
  3. Ghost values: `resolveGhostValues.ts` must not crash on field-valued params — display "field" badge instead of a number.
  4. Update the #158 domain-selector tooltip: Y/X now render live.
  5. Persistence: field-valued params ride the existing project save path as plain JSON (`__field__` dict) — add a load-time validator that drops malformed field dicts to the param default (trust boundary).
- **TEST PLAN:**
  ```bash
  cd frontend && npx --no vitest run    # full unit suite
  ```
  Named tests: `axis-lanes-payload.test.ts` (`attaches axis_lanes only for y/x domains`, `omits key when empty`, `snake_case serialization`), `field-param-control.test.tsx` (`field option only on fieldParams entries`, `assign sets __field__ value`, `clear restores scalar`, `undo round-trip`), `resolveGhostValues-field.test.ts` (`field param renders badge not NaN`), `project-load-field-validation.test.ts` (`malformed field dict dropped to default`).
- **ACCEPTANCE GATES:** vitest full suite green at-or-above main's baseline (1,814+); manual UAT (launch app per repo CLAUDE.md, **verify live runtime path = this worktree before claiming anything works**): Y-domain lane on blur visibly gradients the preview; field-assigned brightness shows the field shape.
- **ROLLBACK:** revert PR; saved projects with `__field__` params degrade gracefully via the load validator from this same PR — note: if reverting AFTER users saved field params, those params silently reset to defaults (acceptable: pre-1.0, zero external users per G11).
- **EVIDENCE:** vitest count, screen capture of Y-gradient render + field render, PR URL.

---

## P6.7 — I1 backend: cherry-pick probe registry + wire real record() sites

- **Branch:** `feat/p6-i1-probe-backend`
- **Base:** `origin/main`
- **Depends-on:** none
- **Goal:** Land draft #140's probe registry (clean, tested, but **wired to nothing**) and make it real: `record()` calls at the four probe sites in the live render path + a ZMQ snapshot command.
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  cd ~/Development/entropic-q7-i1 && git fetch origin
  git log origin/main..feat/q7-i1-inspector --oneline | head -1 | grep -q "d85828e" || { echo "STOP: payload tip moved — re-enumerate"; exit 1; }
  cd ~/Development/entropic-v2challenger && git cat-file -e origin/main:backend/src/inspector/__init__.py 2>/dev/null && { echo "STOP: inspector pkg already on main (P5b.6 may have created the init) — rebase packet: pick d85828e minus the init, keep main's"; exit 1; } || echo OK-clean
  ```
- **Scope:**
  - CHERRY-PICK `d85828e` → lands `backend/src/inspector/__init__.py`, `backend/src/inspector/registry.py` (ProbeKind/Probe/ProbeReading/ProbeSnapshot/ProbeRegistry, MAX_HISTORY_PER_PROBE=32, mount/unmount no-op gate), `backend/tests/test_q7_benchmark/test_inspector_probes.py` (18 tests). Resolve any conflict by keeping payload content; if the pick conflicts on >2 files STOP and report (stale-base symptom).
  - WIRE (new work, VERIFIED paths): `backend/src/modulation/engine.py` (~line 247 `automation_overrides` application — record `param_input` / `param_postmod` / `mod_amount` around the override merge) · `backend/src/modulation/lane_reader.py` callers in the render path for `lane_output` (record at the zmq render handler where lanes are evaluated, NOT inside `sample_lane` — it's a hot pure function) · `backend/src/zmq_server.py` new cmds `probe_snapshot`, `probe_mount`, `probe_unmount`, `probe_register`, `probe_unregister` (follow the existing `elif cmd ==` dispatch at ~line 244ff)
  - NEW: `backend/tests/test_probe_wiring.py`
- **DO-NOT-TOUCH:** `sample_lane`/`sample_lane_row` bodies (hot path purity), `pipeline.apply_chain` effect loop beyond a single guarded record call, anything frontend, the cherry-picked test file (extend in the NEW file instead).
- **Steps:**
  1. `git checkout -b feat/p6-i1-probe-backend origin/main && git cherry-pick d85828e`
  2. Run the picked tests as-is — they must pass before any wiring (proves clean pick).
  3. Add record() sites (guard: registry `mounted` is a single bit — the unmounted cost must be one attr check; the draft already makes `record()` a no-op when unmounted).
  4. ZMQ commands: `probe_snapshot` serializes `ProbeSnapshot` (probes + latest readings + bounded history) to camelCase via existing serialization conventions; `probe_mount/unmount` toggle; registration carries `{probe_id, kind, label, track_id, effect_id, param_path}`.
  5. `clear_history()` hooked into project unload/`flush_state` (find the existing flush path in `zmq_server.py` ~line 388).
- **TEST PLAN:**
  ```bash
  cd backend && python -m pytest tests/test_q7_benchmark/test_inspector_probes.py -x --tb=short   # 18 picked tests, unmodified
  python -m pytest tests/test_probe_wiring.py -x --tb=short
  python -m pytest -x -n auto --tb=short
  ```
  Named new tests: `test_render_with_mounted_probe_records_param_postmod`, `test_unmounted_probe_zero_overhead_no_history`, `test_probe_snapshot_zmq_roundtrip`, `test_probe_mount_unmount_via_zmq`, `test_flush_state_clears_probe_history`, `test_lane_output_recorded_per_render_tick`, `test_unknown_probe_cmd_fields_rejected` (trust boundary on the new IPC surface).
- **ACCEPTANCE GATES:** 18 picked tests green unmodified; full suite green; render-loop benchmark sanity — 100 renders with 0 mounted probes vs baseline within noise (print timing).
- **ROLLBACK:** revert PR (pick + wiring are one PR, two commits — revert both); no schema/persistence impact.
- **EVIDENCE:** picked-tests output, wiring-tests output, timing comparison, PR URL. Note in PR body: payload cherry-picked from #140 tip `d85828e`; #140 should be closed pointing at this PR.

---

## P6.8 — I1 frontend: Inspector Track in the timeline **[RISK: HIGH — Track.type union change touches save/load]**

- **Branch:** `feat/p6-i1-inspector-track`
- **Base:** `origin/main`
- **Depends-on:** P6.7 merged
- **Goal:** Vision I1 Surface A: a first-class track type below the timeline; probes added by drag-from-param; probes mute/solo like instruments; always-visible live scopes. Design source: `~/.claude/plans/entropic-inspector-mockups.html`. **Descoped from vision, explicitly:** probe-recordings-to-disk (vision says "per SG-H1 policy" — SG-H1 is not built; file a follow-up issue, do not improvise disk writes).
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  cd ~/Development/entropic-v2challenger && git fetch origin
  git grep -q "probe_snapshot" origin/main -- backend/src/zmq_server.py || { echo "STOP: P6.7 not merged"; exit 1; }
  git grep -n '"video" | "performance" | "text" | "audio"' origin/main -- frontend/src/shared/types.ts || { echo "STOP: Track.type union moved — re-verify"; exit 1; }
  ```
- **Scope (VERIFIED paths):**
  - `frontend/src/shared/types.ts` — `Track.type` union (line ~59) gains `"inspector"`; new `ProbeBinding` type
  - `frontend/src/renderer/stores/timeline.ts` — track CRUD accepts the new type; **grep every `track.type ===` predicate across `frontend/src` and audit each one** (guard-state coupling rule: `memory/feedback_guard-state-coupling.md`) — exhaustive switch sites must handle `"inspector"`
  - `frontend/src/renderer/components/timeline/` — new `InspectorTrack.tsx` + probe row rendering (mute/solo reuse existing track header controls)
  - `frontend/src/renderer/components/effects/` — param rows get drag-source for probe creation (drag-from-param per vision; respect `memory/feedback_drag-end-suppresses-click.md`)
  - NEW: `frontend/src/renderer/components/timeline/ProbeScope.tsx` — canvas sparkline polling `probe_snapshot` (~10Hz while mounted, stop on unmount; mount/unmount IPC tied to track visibility)
  - Project save/load: wherever tracks serialize (`stores/project.ts`) — inspector tracks persist; **legacy projects without them load unchanged** (wiring-check gate e)
- **DO-NOT-TOUCH:** `backend/**`, root layout `grid-template-rows` (`memory/feedback_test-layout-changes.md`), audio/video track render paths, Zustand store shapes beyond additive fields (and tell the user to fully relaunch — HMR won't rehydrate store-shape changes).
- **Steps:**
  1. Type union + exhaustive-predicate audit (list every touched predicate in the PR body — this is the evidence for the RISK gate).
  2. Track creation: "+ Inspector Track" in the existing add-track surface; max 1 inspector track v1 (simplification, documented).
  3. Drag-from-param → creates probe binding `{probeId, kind: 'param_postmod', effectId, paramPath, trackId}` → `probe_register` IPC → row appears with label + scope.
  4. ProbeScope canvas: ring-buffer of last 32 readings (matches backend MAX_HISTORY_PER_PROBE), 60fps-safe (rAF, draw only on new data), muted probes pause polling for that probe.
  5. Mute/solo semantics: mute = stop polling + dim; solo = poll only soloed (pure frontend concern v1).
  6. Persistence round-trip + legacy-load test.
- **TEST PLAN:**
  ```bash
  cd frontend && npx --no vitest run
  ```
  Named tests: `inspector-track-type.test.ts` (`add inspector track`, `legacy project without inspector tracks loads`, `save/load round-trip with probes`), `probe-binding.test.tsx` (`drag-from-param registers probe via IPC mock`, `delete probe unregisters`), `probe-scope.test.tsx` (`renders sparkline from mock snapshot`, `mute pauses polling`, `unmount sends probe_unmount`), plus the predicate-audit test: `track-type-exhaustive.test.ts` asserting every `Track["type"]` switch handles `"inspector"` (type-level test via `satisfies`/never-check).
- **ACCEPTANCE GATES:** vitest green ≥ baseline; typecheck clean (`npx --no tsc --noEmit` if that's the repo's check — verify script name in `package.json`); manual UAT: drag param → live scope moves with playback; mute stops it; relaunch app and probes persist; a pre-Phase-6 `.glitch` project loads clean.
- **ROLLBACK:** revert PR. Projects saved WITH inspector tracks then opened on reverted build: the load path must already tolerate unknown track types — verify during step 6; if it does not, add forward-tolerance to THIS PR's load validator (drop unknown track types with toast) so rollback is safe.
- **EVIDENCE:** predicate-audit list, vitest/tsc output, screen capture of live scope, legacy-load proof, PR URL.

---

## P6.9 — I2 backend: graph-sync wiring ONLY (routing-graph cherry-pick owned by Phase-5b P5b.6)

- **Branch:** `feat/p6-i2-routing-backend`
- **Base:** `origin/main`
- **Depends-on:** **P5b.6 merged** (it owns the `2d2ac79` cherry-pick of `backend/src/inspector/routing_graph.py` + the package init and is the sole closer of #142's graph payload); P6.7 merged (probe registry)
- **Goal:** Make the already-landed `RoutingGraph` (via P5b.6 — clean but **synced to nothing**) authoritative: build it from real project state (operator `modRoutes` + automation lanes) and expose it over ZMQ for the canvas. **This packet contains NO cherry-pick.**
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  cd ~/Development/entropic-v2challenger && git fetch origin
  git cat-file -e origin/main:backend/src/inspector/routing_graph.py || { echo "STOP: routing_graph.py not on main (lands via P5b.6) — schedule/finish P5b.6 first"; exit 1; }
  git cat-file -e origin/main:backend/src/inspector/registry.py || { echo "STOP: P6.7 not merged (probe registry missing)"; exit 1; }
  ```
- **Scope:**
  - WIRE (new work, VERIFIED paths): NEW `backend/src/inspector/graph_sync.py` — `build_graph_from_project(operators: list[dict], lanes_by_track, chain_by_track) -> RoutingGraph`, reading the same operator `modRoutes`/`mappings` shape `modulation/routing.py:resolve_routings` consumes (operator → effect-param edges) and automation lanes (lane → param edges) · `backend/src/zmq_server.py` new cmds `routing_graph_get` (build + serialize) and `routing_edge_update` (depth/amount change → mutate the UNDERLYING operator mapping, then rebuild — the graph is a projection, the stores stay authoritative)
  - NEW: `backend/tests/test_graph_sync.py`
- **DO-NOT-TOUCH:** `backend/src/inspector/routing_graph.py` + its 25 picked tests (P5b.6's payload — consume only), `modulation/routing.py` resolve logic, `modulation/schema.py` `ModEdge` (no live ModEdge storage exists on main — the canvas projects operators+lanes; B4-full ModEdges are Tier 3, do NOT invent storage for them here).
- **Steps:**
  1. `git checkout -b feat/p6-i2-routing-backend origin/main`; confirm the P5b.6-landed `test_routing_graph.py` suite passes untouched.
  2. `graph_sync.py`: deterministic node ids (`op:{id}`, `fx:{track}:{effect_id}`, `lane:{track}:{laneId}`), edges from operator mappings (`amount` from mapping depth, clamped) and from automation lanes (amount 1.0).
  3. `routing_graph_get`: accepts the project state in the message (frontend is source of truth for stores, mirroring how `render_frame` receives chains) — do NOT cache server-side across calls.
  4. `routing_edge_update`: validates edge id → maps back to the owning operator mapping → returns updated mapping for the frontend to commit to its store (round-trip authority stays frontend; backend validates ranges).
  5. `has_cycle()` surfaced in the `routing_graph_get` response (`hasCycle: bool` + cycle node ids) so the canvas can badge it — consistent with INJ-2's `ModulationCycleError` semantics (#150) but non-throwing here (view-layer).
- **TEST PLAN:**
  ```bash
  cd backend && python -m pytest tests/test_q7_benchmark/test_routing_graph.py -x --tb=short   # P5b.6's 25 tests, untouched regression guard
  python -m pytest tests/test_graph_sync.py -x --tb=short
  python -m pytest -x -n auto --tb=short
  ```
  Named new tests: `test_build_graph_from_operators_modroutes`, `test_build_graph_from_automation_lanes`, `test_node_ids_deterministic`, `test_edge_amount_clamped_from_mapping`, `test_routing_graph_get_zmq_roundtrip`, `test_edge_update_maps_back_to_operator_mapping`, `test_edge_update_rejects_out_of_range`, `test_cycle_flag_in_response`, `test_empty_project_empty_graph`.
- **ACCEPTANCE GATES:** P5b.6's 25 routing-graph tests green untouched; full backend green; a fixture project with 2 operators + 1 lane yields the exact expected node/edge set (snapshot-asserted).
- **ROLLBACK:** revert PR; graph is a stateless projection — nothing persisted.
- **EVIDENCE:** test output, fixture graph dump, PR URL. (#142 is closed by P5b.6, the payload owner — this PR only references it.)

---

## P6.10 — I2 frontend: Routing Canvas overlay (⌘⇧I) **[RISK: HIGH — react-xyflow prototype gate]**

- **Branch:** `feat/p6-i2-routing-canvas-ui`
- **Base:** `origin/main`
- **Depends-on:** P6.9 merged
- **Goal:** Vision I2 Surface B: modal overlay on ⌘⇧I — 3-column (sources / graph / destinations), bright=routed dim=available, drag source→destination creates an edge, edge inspector strip at bottom (depth / polarity / delete; curve/lag/axis-binding deferred to B4-full — they have no backend storage yet), filter/search both sides. Design source: `~/.claude/plans/entropic-inspector-mockups.html` (Routing Canvas mockup verified present, lines ~390–690). "Kills the Map-to modal": main has no Map-to modal — what exists is the I3 inline-action *menu* stubs (`useInlineActions.ts` "Map to LFO 1") — leave them; the canvas supersedes nothing yet.
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  cd ~/Development/entropic-v2challenger && git fetch origin
  git grep -q "routing_graph_get" origin/main -- backend/src/zmq_server.py || { echo "STOP: P6.9 not merged"; exit 1; }
  test -f docs/perf/p4-xyflow-gate-result.md && grep -n "VERDICT:" docs/perf/p4-xyflow-gate-result.md || echo "verdict doc absent — run P4.0 first (see step 1)"
  grep -q "@xyflow/react\|reactflow" frontend/package.json && echo "already present" || echo "will add dep IF verdict doc says PASS"
  ```
- **Scope (VERIFIED paths):**
  - NEW: `frontend/src/renderer/components/routing-canvas/` (`RoutingCanvas.tsx`, `EdgeInspector.tsx`, `NodeColumn.tsx`, `index.ts`)
  - Keyboard: register ⌘⇧I where existing global shortcuts live (grep `Cmd+B`/`metaKey` handler — `App.tsx` or a hotkeys util; verify at packet start). Note ⌘I = Import media already taken; ⌘⇧I is free per repo CLAUDE.md table.
  - `frontend/package.json` — add `@xyflow/react` ONLY if `docs/perf/p4-xyflow-gate-result.md` says `VERDICT: PASS` (the PLAN.md PR-C decision: "react-xyflow only, vis-network dropped"; P4.0 owns the gate)
  - Stores: read `operators.ts` + `automation.ts` to assemble the `routing_graph_get` payload; commit `routing_edge_update` results back via existing store actions (find the operator-mapping update action; do not bypass undo)
- **DO-NOT-TOUCH:** `backend/**`, existing operator device-chain UI, inline-actions components, global layout CSS rows.
- **Steps:**
  1. **Read the single canonical xyflow gate verdict FIRST: `docs/perf/p4-xyflow-gate-result.md` (P4.0's artifact).** If the doc is absent → STOP and run P4.0 first; do NOT run a local prototype gate here (P4.0 is the one owner of this measurement). `VERDICT: PASS` → use `@xyflow/react` at the version pinned in the doc; `VERDICT: FAIL` → bare-SVG with rAF batching (pull the pattern from P4.0's spike branch / P4.5's implementation). Quote the verdict line in the PR.
  2. Modal overlay component (portal, Escape closes, focus-trapped) on ⌘⇧I.
  3. Data: open → assemble store state → `routing_graph_get` → render. Sources column = operators + lanes; destinations = effects/params; bright/dim from edge presence; search input filters each column.
  4. Drag source→destination: creates an operator mapping via existing store action (undoable) → re-fetch graph. v1 creates `broadcast`-equivalent routes only (Tier-1 rule — axis-binding pickers are B4-full).
  5. Edge click → bottom inspector: depth slider (maps to `routing_edge_update` round-trip then store commit), polarity toggle (negate depth), delete (removes mapping, undoable).
  6. Race hygiene: in-flight fetch cancelled on close; no setState after unmount (this component is a candidate for the julik review — async overlay + drag).
- **TEST PLAN:**
  ```bash
  cd frontend && npx --no vitest run
  ```
  Named tests: `routing-canvas-open.test.tsx` (`cmd-shift-i opens`, `escape closes`, `fetches graph on open`, `no fetch race after close`), `routing-canvas-edges.test.tsx` (`drag creates mapping via store action`, `created edge undoable`, `depth slider round-trips`, `delete removes mapping`), `routing-canvas-columns.test.tsx` (`routed nodes bright`, `search filters`), plus the perf gate as a documented manual measurement (not vitest).
- **ACCEPTANCE GATES:** vitest green ≥ baseline; P4.0 verdict line quoted in PR and the implementation matches it (dep added ⟺ VERDICT: PASS); manual UAT: create a route on the canvas → parameter visibly modulates in preview → same route visible in device-chain UI (single-source-of-truth proof); undo removes it.
- **ROLLBACK:** revert PR (removes dep + components + shortcut); zero persistence impact (mappings created through pre-existing store actions remain valid project data).
- **EVIDENCE:** perf measurement, vitest output, screen capture of drag-create + modulation, PR URL.

---

## P6.11 — Phase 6 integration, UAT, and docs closeout

- **Branch:** `feat/p6-closeout`
- **Base:** `origin/main`
- **Depends-on:** P6.1–P6.10 merged (run last; if any packet was descoped, document it here instead of silently shrinking)
- **Goal:** Cross-feature verification + documentation debt paid BEFORE reporting the phase done (`memory/feedback_update-docs-before-reporting.md`), + close the superseded draft PRs.
- **PRECONDITIONS:**
  ```bash
  cd ~/Development/entropic-v2challenger && git fetch origin
  for f in backend/src/modulation/field_eval.py backend/src/effects/field_top25.py backend/src/effects/field_source.py backend/src/safety/mlx_resources.py backend/src/effects/field_codegen.py backend/src/inspector/registry.py backend/src/inspector/routing_graph.py; do git cat-file -e origin/main:$f || { echo "STOP missing: $f"; exit 1; }; done
  ```
- **Scope (VERIFIED paths):**
  - NEW: `backend/tests/test_phase6_integration.py` — field param + axis lane + probe + graph in ONE project fixture
  - `docs/UAT-UIT-GUIDE.md` — add Phase-6 test section (field assignment, Y-domain render, inspector track, routing canvas)
  - `docs/roadmap/ROADMAP.md` — flip Phase-6 ledger rows (C2/C3/I1/I2/SG-1-Metal) with PR numbers
  - GitHub: close #140 with a comment naming the superseding PR (cherry-picked payload); verify #142 was already closed by P5b.6 (its payload owner) — if still open, escalate, don't close it here; #143 stays open (I3, Tier-gated on PR-A)
- **DO-NOT-TOUCH:** feature code (this packet ships tests + docs only; integration failures spawn fix packets, they don't get hot-fixed inside the closeout PR).
- **Steps:**
  1. Integration fixture: project with (a) a top-25 effect with an image field, (b) a second effect with a Y-domain lane, (c) a mounted probe on the field effect's param, (d) one operator route — render 10 frames; assert: no crash, probe history populated, graph projection contains all 4 node kinds, frames non-identical across the Y gradient.
  2. Soak sanity: 500-frame render loop with probes mounted; assert RSS growth < 50MB and (on the dev Mac) GPU pool stats flat — the SG-1 "confirmed" stamp for Tier 2b (vision §8).
  3. Docs + ledger updates; UAT guide entries follow the existing numbered-test format.
  4. Close superseded PRs with cross-links.
- **TEST PLAN:**
  ```bash
  cd backend && python -m pytest tests/test_phase6_integration.py -x --tb=short
  python -m pytest -m metal --tb=short
  python -m pytest -x -n auto --tb=short && cd ../frontend && npx --no vitest run
  ```
  Named tests: `test_combined_field_lane_probe_graph_render`, `test_500_frame_soak_rss_bounded`, `test_gpu_pool_flat_over_soak` (metal), `test_probe_history_populated_after_render`, `test_graph_projection_complete_fixture`.
- **ACCEPTANCE GATES:** all suites green; soak numbers in PR body; ROADMAP ledger accurate (each Phase-6 row links a merged PR); #140 closed, #142 closure (owned by P5b.6) verified. **Comprehensive-done check:** PR body must contain the full/shipped/remaining tally for the phase.
- **ROLLBACK:** revert PR (docs + tests only).
- **EVIDENCE:** soak numbers, suite counts, ledger diff, closed-PR links.

---

## Out of scope for Phase 6 (explicit, so nobody improvises)

| Item | Why out | Where it lives |
|---|---|---|
| I3 full UI / inline probe mapping (#143, `bc0ea0b`) | Gated on PR-A layout redesign (ROADMAP G2); shell already on main via #148 | Phase 3 / Tier 3 |
| SG-5 dynamic cycle detection (#144) + E5 Launchpad (#145) cherry-picks | Tier 3 items; ROADMAP Phase 6 says "when their tiers open" — they haven't | Phase after PR-C |
| B4-full binding rules (sample-at / scan-over / integrate / painted), edge curve/lag/axis-binding inspectors | Tier 3 (vision §8); no ModEdge live storage exists on main | Tier 3 |
| Probe recording-to-disk (SG-H1) | SG-H1 hygiene gate unbuilt | file issue in P6.8 |
| True per-effect shader transpilation | P6.5 ships generic lerp codegen; full transpiler is follow-up | Tier 2 follow-up |
| Export-path GPU field rendering | parity-gated off (`FIELD_GPU_IN_EXPORT = False`) | follow-up after parity hardening |
