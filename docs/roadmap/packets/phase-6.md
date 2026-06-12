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

- **ID:** P6.1 · **Branch:** `feat/p6-c3-cpu-row-bands` · **Base:** `origin/main` · **Est:** ~4h · **Model:** Sonnet (mechanical pipeline extension on verified seams)
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
  4. Perf guard (quantified): if `len(chain_with_axis_lanes_effects) * n_bands > 512` effect invocations per frame, log a warning and reduce `n_bands` to stay under budget. The governing number is **#166's 500ms/frame render budget @1080p** (commit `d821ae8` body states it verbatim) — a banded effect must keep the whole frame under it. Band split/reassemble overhead itself (excluding effect cost) must stay **< 10% of frame time** (it's `np.vsplit`/`np.vstack`-class work).
  5. **Failure modes (named):** (a) `axis_lanes` entry referencing an unknown `effect_id` → skip that entry + log warning, render continues (never crash the frame); (b) `curve` array empty or containing NaN/Inf → sanitize via `np.nan_to_num` + clamp, per `memory/feedback_numeric-trust-boundary.md`; (c) `n_bands` out of [2, 128] from IPC → clamp, never raise; (d) banded run of a stateful effect → approximate banding documented in docstring (step 3).
- **TEST PLAN:**
  ```bash
  cd ~/Development/entropic-v2challenger/backend && python -m pytest tests/test_field_eval.py -x --tb=short
  python -m pytest -x -n auto --tb=short   # full backend, zero regressions
  ```
  Named tests (write all, in `backend/tests/test_field_eval.py`): `test_y_domain_lane_produces_per_band_values`, `test_x_domain_bands_are_vertical_strips`, `test_no_axis_lanes_renders_byte_identical_to_main` (golden: render a frame with and without the new arg absent → identical hash), `test_t_domain_lane_rejected_from_axis_lanes` (T stays in `automation_overrides` path — **negative**), `test_band_count_clamped` (**negative**: n_bands 0 / 1 / 999 / -5 all clamp to [2, 128]), `test_unknown_effect_id_in_axis_lanes_skipped_with_warning` (**negative**), `test_nan_in_curve_sanitized_not_crash` (**negative**), `test_stateful_effect_band0_state_propagation`, `test_direction_negative_reverses_band_order`, `test_render_frame_ipc_accepts_axis_lanes_payload` (IPC→pipeline→render chain at this packet's depth; the full UI→store→IPC→backend→render chain is owned by P6.6's E2E + P6.11's integration fixture), `test_banded_render_360p_under_150ms` (perf floor at CI scale: `fx.blur`, 32 bands, 640×360, median-of-3 wall time < 150ms).
- **ACCEPTANCE GATES:**
  - Full backend suite green; the byte-identical no-op test proves zero render change when feature unused.
  - Perf: `test_banded_render_360p_under_150ms` green in CI; scripted 1080p measurement (EVIDENCE step) shows banded `fx.blur` (32 bands) ≤ **500ms/frame** (#166's render budget) — paste the ms number in the PR.
  - A scripted render (extend `backend/scripts/demo_trilogy/render_demos.py` patterns, do not modify that file) of `fx.blur` with a Y-domain ramp lane visibly blurs the bottom more than the top — save PNG evidence.
- **ROLLBACK:** revert the single PR commit; `axis_lanes` is additive to the IPC payload so no schema migration to unwind.
- **EVIDENCE:** test output, before/after PNG pair, 1080p banded-render ms measurement, `git log -1 --oneline` on branch + PR URL.

---

## P6.2 — C3 schema: scalar-OR-field params + the top-25 list

- **ID:** P6.2 · **Branch:** `feat/p6-c3-field-schema` · **Base:** `origin/main` · **Est:** ~4h · **Model:** Sonnet (schema + frozen-list work; the human-judgment step is the PR review of the 25)
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
  1. `field_params.py`: `FieldRef` dataclass — `{kind: 'image'|'video'|'lane2d', source_id: str, gain: float = 1.0, invert: bool = False}` with `to_dict`/`from_dict` and a validator (gain finite + clamped [-4, 4]; NaN/Inf gain → `ValueError`; unknown `kind` → `ValueError`; `source_id` non-empty str ≤ 256 chars). A param value of shape `{"__field__": {...}}` deserializes to `FieldRef`; everything else stays scalar. The `__field__` key deliberately uses the reserved `_*`-adjacent style but is a dict VALUE not a param KEY, so it does not collide with the `RESERVED_PARAM_PREFIX` registration guard — add a test proving registration still rejects `_foo` keys. **`kind='lane2d'` (painted per-pixel fields) is schema-reserved only in Phase 6** — painted-field UI is Tier 3 (B4-full, see out-of-scope table); when it lands, its in-memory buffer budget is **W×H×4 bytes (float32)**, paint canvases capped at **512×288 = 589,824 B ≈ 576 KiB per field**; record this cap as a constant `LANE2D_MAX_RESOLUTION = (512, 288)` in `field_params.py` NOW so the number is normative, with a docstring pointing at Tier 3.
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
  Named tests: `test_fieldref_roundtrip`, `test_fieldref_rejects_unknown_kind` (**negative**), `test_fieldref_rejects_nonfinite_gain` (**negative**: NaN, Inf, -Inf each raise), `test_fieldref_gain_clamped` (**negative**: ±100 → ±4), `test_fieldref_rejects_empty_or_oversize_source_id` (**negative**), `test_scalar_params_unaffected`, `test_field_param_on_unlisted_effect_raises` (**negative** — the pipeline guard), `test_top25_all_entries_registered_effects`, `test_top25_params_exist_in_effect_PARAMS`, `test_top25_has_exactly_25`, `test_lane2d_max_resolution_constant_is_512x288`, `test_reserved_param_prefix_guard_still_fires`.
- **ACCEPTANCE GATES:** full backend green; `gen_field_top25.py --check` passes; the frozen list names exactly **25** real effect ids (verified against `registry.list_all()` in test — count asserted, not eyeballed); failure modes covered: unknown kind / non-finite gain / unlisted effect / reserved-prefix key all have a named raising test.
- **ROLLBACK:** revert PR; no persisted-project schema change (FieldRef only appears in projects once UI ships in P6.6).
- **EVIDENCE:** test output, the frozen top-25 table pasted into the PR body with pointwise/banded classification, PR URL.

---

## P6.3 — C2 field sources: image/video ref → 2D field provider

- **ID:** P6.3 · **Branch:** `feat/p6-c2-field-source` · **Base:** `origin/main` · **Est:** ~4h · **Model:** Sonnet (provider + cache; SG-7 seams already exist)
- **Depends-on:** P6.2 merged (consumes `FieldRef`)
- **Goal:** Resolve a `FieldRef` to an actual normalized 2D `np.ndarray` field: still image → static luma field; video ref → per-frame luma field. The field itself is modulatable via `gain`/`invert` (v1 of "field itself modulatable"). LRU-cached.
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  cd ~/Development/entropic-v2challenger && git fetch origin
  git grep -q "class FieldRef" origin/main -- backend/src/effects/field_params.py || { echo "STOP: P6.2 not merged"; exit 1; }
  git grep -q "def av_open_timeout" origin/main -- backend/src/video/codec_timeout.py || { echo "STOP: SG-7 wrapper moved — re-locate before reusing"; exit 1; }
  git grep -q "def decode_frame" origin/main -- backend/src/video/reader.py || { echo "STOP: VideoReader.decode_frame missing"; exit 1; }
  ```
- **Scope (VERIFIED paths — corrected 2026-06-11: SG-7 lives in `video/`, NOT `engine/codecs.py`):**
  - NEW: `backend/src/effects/field_source.py` (provider + LRU cache)
  - `backend/src/video/codec_timeout.py` — `av_open_timeout()` (line 48), the SG-7 bounded-time `av.open` wrapper (read-only reuse; module docstring says "SG-7 codec timeout")
  - `backend/src/video/reader.py` — `VideoReader.decode_frame(frame_index)` (line 27), already routed through SG-7 (read-only reuse; verified caller of `codec_timeout`)
  - `backend/src/video/ingest.py` — still-image load path (`Image.open`, line 81) (read-only reuse)
  - NEW: `backend/tests/test_field_source.py`
- **DO-NOT-TOUCH:** `backend/src/engine/pipeline.py` (P6.1/P6.5 own integration), `frontend/**`, decode internals (only call existing wrapped helpers — never raw `av.open`, SG-7 exists for a reason), `backend/src/engine/codecs.py` (NOT the SG-7 home — earlier draft of this packet pointed there incorrectly).
- **Steps:**
  1. `FieldProvider.resolve(ref: FieldRef, frame_index: int, resolution: (w, h)) -> np.ndarray` — float32, shape `(h, w)`, range [0, 1] after luma conversion (Rec. 709 weights), bilinear-resized to render resolution, then `gain` applied and `invert` as `1 - f`, final clamp to [0, 1]. **Numeric trust boundary:** NaN/Inf in decoded frames → `np.nan_to_num` + clamp (per `memory/feedback_numeric-trust-boundary.md`).
  2. LRU cache keyed `(source_id, frame_index_bucket, resolution)`. **Memory budget (quantified):** one cached field = `W×H×4` bytes (float32 single-channel) — **8,294,400 B ≈ 7.91 MiB @1080p**, 3,686,400 B ≈ 3.5 MiB @720p. Cap = `min(64 entries, 256 MiB total)`, whichever first (256 MiB ⇒ ≈32 concurrent 1080p fields); constants `FIELD_CACHE_MAX_ENTRIES = 64`, `FIELD_CACHE_MAX_BYTES = 256 * 1024 * 1024` in `field_source.py`. Expose `cache_stats() -> {entries, bytes, hits, misses, evictions}` for the EVIDENCE step.
  3. Video refs: map render `frame_index` → source frame by **wrapping** (loop) — out-of-range and negative indices wrap modulo source length, never raise — document; decode through the existing SG-7 timeout-wrapped path only (`VideoReader.decode_frame`); SG-7 timeout fires → treat as corrupt source (step 4), never propagate the exception into the render loop.
  4. Missing/corrupt source → return a flat 0.5 field + log warning (render must never crash on a dead ref; mirrors effect-health auto-disable philosophy in `pipeline.py`). Same flat-field fallback for `kind='lane2d'` in Phase 6 (painted fields are Tier 3 — see P6.2 step 1).
  5. Source-dimension guard: any source dimension > 8192 px → refuse to build the field (flat 0.5 + warning) — a 8192×8192 float32 field alone is 268 MiB, over the whole cache budget.
  6. **Perf budgets (quantified):** cache-hit resolve < **1 ms**; cache-miss still-image resolve (decode + luma + bilinear resize) @1080p < **80 ms**; cache-miss video-frame resolve bounded by the SG-7 timeout (worst case) and typically < **250 ms** — assert the first two in tests, report the third in EVIDENCE.
- **TEST PLAN:**
  ```bash
  cd backend && python -m pytest tests/test_field_source.py -x --tb=short && python -m pytest -x -n auto --tb=short
  ```
  Named tests: `test_image_ref_resolves_to_unit_range_field`, `test_field_resized_to_render_resolution`, `test_gain_and_invert_applied`, `test_nan_input_sanitized` (**negative**: decoded frame seeded with NaN/Inf → finite [0,1] field out), `test_missing_source_returns_flat_field_and_warns` (**negative**: dead `source_id` → flat 0.5, warning logged, no raise), `test_corrupt_video_sg7_timeout_returns_flat_field` (**negative**: mock `decode_frame` raising the SG-7 timeout error → flat 0.5 + warning), `test_out_of_range_frame_index_wraps_not_raises` (**negative**: `frame_index` = −1, `len+5`, `10**9` all resolve), `test_oversize_source_dimension_refused` (**negative**: mocked 9000×9000 source → flat field + warning), `test_lane2d_kind_returns_flat_field_v1` (**negative**), `test_lru_eviction_under_entry_and_byte_caps` (insert 65 distinct fields → evictions ≥ 1 and `bytes ≤ FIELD_CACHE_MAX_BYTES`), `test_video_ref_frame_wraps`, `test_cache_hit_skips_decode` (mock decode counter), `test_cache_hit_resolve_under_1ms` (median-of-20), `test_image_miss_resolve_1080p_under_80ms` (median-of-3).
- **ACCEPTANCE GATES:** full backend green; a scripted resolve of a real PNG produces a plausible field (save grayscale PNG of the field as evidence); cache byte-cap proven by `cache_stats()` (`bytes` never exceeds 268,435,456); both perf-budget tests green; zero raw `av.open` calls added (`git grep "av.open" -- backend/src/effects/` → empty).
- **ROLLBACK:** revert PR — nothing else imports `field_source` until P6.5/P6.6.
- **EVIDENCE:** test output, field-visualization PNG, `cache_stats()` printout showing entries/bytes/evictions under caps, PR URL.

---

## P6.4 — SG-1 real Metal binding (MLX) + forbidden-pattern AST lint **[RISK: HIGH]**

- **ID:** P6.4 · **Branch:** `feat/p6-sg1-metal-binding` · **Base:** `origin/main` · **Est:** ~4h · **Model:** Opus (RISK:HIGH — real GPU memory semantics + lint design; phase-4 "Model routing" convention: RISK:HIGH ⇒ stronger model)
- **Depends-on:** none (SG-1 lib already on main via #163)
- **Goal:** Close the two gaps PR #163 explicitly deferred to "first Tier-2 GPU effect" — which is this phase: **(gap 6)** a real Metal-backed `GPUResource` via **MLX** (the codebase's committed Metal backend — pytest marker `metal: real GPU/Metal-backend tests (skipped without MLX)` at `backend/pyproject.toml:32`), and **(gap 5)** the forbidden-pattern AST lint (no raw Metal/MLX allocations outside wrappers — SPEC-3 §2.2).
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  cd ~/Development/entropic-v2challenger && git fetch origin
  git grep -q "class MockGPUResource" origin/main -- backend/src/safety/gpu_resources.py || { echo "STOP: SG-1 MockGPUResource missing"; exit 1; }
  git grep -q "metal: real GPU" origin/main -- backend/pyproject.toml || { echo "STOP: metal pytest marker missing"; exit 1; }
  git grep -q "test_create_and_destroy_10k_handles_rss_stable" origin/main -- backend/tests/test_q7_benchmark/test_gpu_resources.py || { echo "STOP: 10k RSS leak test missing/renamed"; exit 1; }
  python -c "import mlx.core" 2>/dev/null && echo MLX-AVAILABLE || echo "WARN: MLX not installed locally — metal tests will skip; CI-mock tests still must pass"
  git grep -rln "mlx" origin/main -- backend/src/ | head -3   # VERIFIED EMPTY 2026-06-11 — no MLX usage exists in backend/src today (only tests); non-empty means someone shipped MLX code first → re-scope the lint allowlist
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
  3. Make the existing `@pytest.mark.metal` RSS leak test run against `MLXGPUResource` for real. **Threshold restated exactly (verbatim from `test_gpu_resources.py:489–516` on main):** `test_create_and_destroy_10k_handles_rss_stable` — **10,000** acquire/destroy cycles through a `GPUResourcePool(max_handles=100, max_bytes=100_000_000)`; after `destroy_all()` + forced GC, `RSS_after ≤ RSS_baseline + 64 MiB` (`tolerance = 64 * 1024 * 1024` allocator slack). The mock-tier companion asserts `destroyed_count == 10_000` exactly. Exact command:
     ```bash
     cd ~/Development/entropic-v2challenger/backend && python -m pytest -m metal "tests/test_q7_benchmark/test_gpu_resources.py::test_create_and_destroy_10k_handles_rss_stable" -v --tb=short
     ```
     Swap the resource class under test from `MockGPUResource` to `MLXGPUResource` when `mlx_available()` (keep the mock variant running too — both tiers stay).
  4. AST lint (`lint_gpu_patterns.py`): walk `backend/src/`, flag (a) `mlx.core` allocation calls (`zeros|ones|array|full`) outside `safety/mlx_resources.py`, (b) module-level GPU objects, (c) any `Metal`/`MTL` pyobjc usage anywhere. Exit 1 on findings. Wire into CI next to existing lint steps (locate the CI workflow file at packet start; DO NOT modify unrelated workflow steps — workflow changes need user merge per standing rules, so put the lint in a `pyproject` script + invoke from the existing test job if possible, otherwise flag for user).
  5. Run lint on current tree. **Expected findings: ZERO** — `git grep -rln "mlx" origin/main -- backend/src/` is empty as of 2026-06-11 (the only `mlx` references on main are in test files; the earlier claim that `effects/spectral/` uses MLX was WRONG — it is numpy/scipy FFT code). The lint ships with an EMPTY allowlist; any future entry requires a justification comment. If the lint does flag something, that's new code merged since this packet was authored — investigate, don't blanket-allowlist.
- **TEST PLAN:**
  ```bash
  cd backend && python -m pytest tests/test_q7_benchmark/test_gpu_resources.py -x --tb=short   # all 33 existing + new
  python -m pytest -m metal --tb=short    # on the M-series dev machine; report skip-count if MLX absent
  python scripts/lint_gpu_patterns.py
  python -m pytest -x -n auto --tb=short
  ```
  Named new tests: `test_mlx_resource_implements_protocol`, `test_mlx_destroy_idempotent`, `test_mlx_raw_after_destroy_raises` (**negative** — use-after-free is THE failure mode SG-1 exists for), `test_mlx_finalizer_frees_forgotten_handle` (metal-marked), `test_mlx_10k_acquire_destroy_rss_baseline` (metal-marked; same 10,000-cycle / +64 MiB threshold as the existing test, but on `MLXGPUResource`), `test_pool_evicts_mlx_resources_lru` (metal-marked), `test_mlx_unavailable_importerror_clean` (**negative**: no MLX installed → clean `mlx_available() == False`, no traceback), `test_lint_flags_raw_mlx_alloc` (**negative**: seeded violation fixture → exit 1) + `test_lint_passes_clean_tree` (lint self-tests on fixture strings).
- **ACCEPTANCE GATES:**
  - All pre-existing 33 SG-1 tests still green, untouched (`git grep -c "def test_" -- backend/tests/test_q7_benchmark/test_gpu_resources.py` ≥ 33 before counting additions).
  - `pytest -m metal` green on the dev Mac (this is the gate the whole phase is named for — **paste the run output in the PR**), specifically including `test_create_and_destroy_10k_handles_rss_stable` with the command from step 3: **10,000 cycles, RSS growth ≤ 67,108,864 B**. If MLX cannot be installed, the packet is NOT done — STOP and report.
  - Lint runs clean on the tree (zero findings expected, empty allowlist) and catches a seeded violation in its self-test.
- **ROLLBACK:** revert PR; `mlx` extra is optional so no environment breakage; lint un-wires with the revert.
- **EVIDENCE:** `pytest -m metal` output with real allocation counts, lint output, PR URL.

---

## P6.5 — C3 Metal codegen: per-pixel field application on GPU **[RISK: HIGH]**

- **ID:** P6.5 · **Branch:** `feat/p6-c3-metal-codegen` · **Base:** `origin/main` · **Est:** ~4h · **Model:** Opus (RISK:HIGH — GPU dispatch + parity + pool discipline in one packet)
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
  2. Every MLX buffer (frame upload, field, output) acquired through a `GPUResourcePool` registered per effect-instance-id; pool destroyed on effect unmount / chain removal (enforcement point per SPEC-3 §2.4 — find the chain-removal path in `pipeline.py`/`zmq_server.py` `flush_state` and hook it). **Memory budget (quantified):** field buffer = `W×H×4` B float32 = **7.91 MiB @1080p**; the two CPU-rendered endpoint frames + output uploaded as float32 RGB = 3 × `W×H×3×4` B ≈ 23.7 MiB each @1080p → worst case ≈ **79 MiB resident per field-effect instance**. Pool caps per effect-instance: `max_handles=8`, `max_bytes=96 * 1024 * 1024` (96 MiB), constants in `field_codegen.py`. Over-cap acquisition → pool's existing eviction/refusal semantics, never an unbounded alloc.
  3. Dispatch rule in `apply_chain`: param is `FieldRef` AND entry `mode='pointwise'` AND `mlx_available()` → codegen path; `mode='pointwise'` without MLX → CPU lerp fallback (same math, numpy); `mode='banded'` → P6.1 band path with the field row/column-averaged to per-band scalars. **Failure modes (named):** (a) MLX raises at dispatch time (OOM, kernel error) → catch, log once per effect-instance, fall back to CPU lerp for that frame onward — render never dies on a GPU hiccup; (b) field resolution ≠ frame resolution → bilinear-resize field (P6.3 contract), never raise; (c) `FieldRef` for a `mode='banded'` entry with zero variance field → mathematically equals scalar path (covered by flat-field test).
  4. Determinism: GPU and CPU paths must agree within tolerance — parity test `max_abs_diff ≤ 2/255`; export path forces the CPU fallback until parity is proven tighter (flag `FIELD_GPU_IN_EXPORT = False` constant, documented).
  5. **Perf targets (quantified, @1080p):** GPU lerp composite step (upload + elementwise lerp + download, excluding the 2 CPU effect invocations) ≤ **12 ms** median-of-20; CPU numpy lerp fallback ≤ **40 ms** median-of-20; total field-effect render ≤ `2 × scalar render of same effect + 50 ms`; whole frame must stay inside **#166's 500 ms/frame 1080p render budget**. These are test-asserted (below), not aspirational.
- **TEST PLAN:**
  ```bash
  cd backend && python -m pytest tests/test_field_codegen.py -x --tb=short
  python -m pytest -m metal --tb=short
  python -m pytest -x -n auto --tb=short
  ```
  Named tests: `test_pointwise_field_lerp_cpu_reference`, `test_gpu_cpu_parity_within_tolerance` (metal; `max_abs_diff ≤ 2/255` asserted on a real frame + radial field), `test_flat_field_equals_scalar_render` (field≡0.5 const ≈ scalar midpoint — the key correctness anchor), `test_pool_registered_per_effect_instance`, `test_pool_byte_cap_96mib_enforced_at_1080p` (acquiring beyond `max_bytes` triggers pool semantics, not unbounded alloc), `test_effect_unmount_destroys_pool` (SPEC-3 §2.5 `test_effect_unmount_clears_its_pool` analog at the codegen layer), `test_banded_mode_field_collapses_to_bands`, `test_no_mlx_falls_back_cpu` (**negative**: `mlx_available()` mocked False → CPU path, identical math), `test_mlx_dispatch_failure_falls_back_cpu_and_warns` (**negative — the codegen fallback path**: monkeypatch the MLX lerp op to raise → frame still renders via CPU, warning logged exactly once per instance, no crash), `test_field_param_on_banded_entry_does_not_enter_codegen` (**negative**: routing guard), `test_export_uses_cpu_path`, `test_gpu_lerp_1080p_under_12ms` (metal; median-of-20), `test_cpu_lerp_1080p_under_40ms` (median-of-20), `test_10_renders_no_handle_growth` (metal; pool `active_handles`/`active_bytes` byte-identical before vs after 10 frames — zero growth, not "small growth").
- **ACCEPTANCE GATES:** parity test green on dev Mac with the measured `max_abs_diff` pasted in PR (must be ≤ 2/255 = 0.00784); both perf-budget tests green with median ms pasted (GPU ≤ 12 ms, CPU ≤ 40 ms @1080p); pool-stats-flat test green with before/after counters pasted (THE SG-1-confirmed gate for Tier 2b per vision §8); full suite green; visible evidence render — `fx.brightness_exposure` (or first pointwise top-25 entry) driven by a radial-gradient field produces a vignette.
- **ROLLBACK:** revert PR; dispatch rule collapses to the P6.2 guard (field params rejected at render) — no data loss.
- **EVIDENCE:** parity numbers, GPU/CPU lerp ms medians, pool stats before/after 10 renders, vignette PNG, `pytest -m metal` output, PR URL.

---

## P6.6 — Frontend field params + axis-lane render wiring (C2/C3 UI)

- **ID:** P6.6 · **Branch:** `feat/p6-field-ui` · **Base:** `origin/main` · **Est:** ~4h · **Model:** Opus (UI feature spanning store/IPC/persistence; full-chain E2E owner for C2/C3)
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
  5. Persistence: field-valued params ride the existing project save path as plain JSON (`__field__` dict) — add a load-time validator that drops malformed field dicts to the param default and clamps out-of-range `gain` to [-4, 4] (trust boundary). **Failure modes (named):** malformed `__field__` dict in saved project → param default + toast; `gain` NaN/out-of-range from disk → clamped; `axis_lanes` curve sampling on an empty lane → omit the entry, never send `[]`.
- **TEST PLAN:**
  ```bash
  cd frontend && npx --no vitest run    # full unit suite
  cd frontend && npx playwright test tests/e2e/phase-6/field-params.spec.ts   # full-chain E2E (file is NEW in this packet)
  ```
  Named tests: `axis-lanes-payload.test.ts` (`attaches axis_lanes only for y/x domains`, `omits key when empty`, `omits entry for empty curve` (**negative**), `snake_case serialization`), `field-param-control.test.tsx` (`field option only on fieldParams entries`, `assign sets __field__ value`, `clear restores scalar`, `undo round-trip`), `resolveGhostValues-field.test.ts` (`field param renders badge not NaN` (**negative**)), `project-load-field-validation.test.ts` (`malformed field dict dropped to default` (**negative**), `out-of-range gain clamped on load` (**negative**)).
  **Full-chain integration test (named, UI→store→IPC→backend→render):** NEW `frontend/tests/e2e/phase-6/field-params.spec.ts` — `y-domain lane changes rendered preview gradient end-to-end` (set lane domain=Y in the real UI → store → `axis_lanes` IPC → Python banded render → assert top vs bottom preview pixel rows differ) and `assigning image field changes rendered frame` (param Field… control → `__field__` value → render → frame hash changes). Runs against the real sidecar via the existing `_electron` Playwright harness (`frontend/tests/e2e/` conventions, global-setup boots the app).
- **ACCEPTANCE GATES:** vitest full suite green at-or-above main's baseline (1,814+); both named E2E specs green; manual UAT (launch app per repo CLAUDE.md): **live-runtime step (Gate 18): run `ps aux | grep -i electron`, confirm the running app's path is THIS worktree before claiming anything works — name the runtime path in the report**; Y-domain lane on blur visibly gradients the preview; field-assigned brightness shows the field shape.
- **ROLLBACK:** revert PR; saved projects with `__field__` params degrade gracefully via the load validator from this same PR — note: if reverting AFTER users saved field params, those params silently reset to defaults (acceptable: pre-1.0, zero external users per G11).
- **EVIDENCE:** vitest count, screen capture of Y-gradient render + field render, PR URL.

---

## P6.7 — I1 backend: cherry-pick probe registry + wire real record() sites

- **ID:** P6.7 · **Branch:** `feat/p6-i1-probe-backend` · **Base:** `origin/main` · **Est:** ~4h · **Model:** Sonnet (cherry-pick is mechanical under §0.2-style rules; wiring sites are pre-located below)
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
  4. ZMQ commands: `probe_snapshot` serializes `ProbeSnapshot` (probes + latest readings + bounded history) to camelCase via existing serialization conventions; `probe_mount/unmount` toggle; registration carries `{probe_id, kind, label, track_id, effect_id, param_path}` (all str fields length-capped ≤ 256 — trust boundary).
  5. **In-memory probe buffer cap (quantified):** the picked payload already bounds history at `MAX_HISTORY_PER_PROBE = 32` per probe (`registry.py:29`, `deque(maxlen=32)` — VERIFIED in `d85828e`). Add a registration ceiling this packet: `MAX_PROBES = 64` — `probe_register` beyond it → error reply, no growth. Worst-case resident probe memory = 64 probes × 32 readings × ~80 B/`ProbeReading` ≈ **160 KiB** (hard ceiling ≈ 200 KiB) — state this math in the registry docstring. (Probe-recordings-to-DISK remain deferred per SG-H1 — see P6.8; this cap is what makes the in-memory deferral safe.)
  6. `clear_history()` hooked into project unload/`flush_state` (the existing `elif cmd == "flush_state"` at `zmq_server.py:388` — VERIFIED).
- **TEST PLAN:**
  ```bash
  cd backend && python -m pytest tests/test_q7_benchmark/test_inspector_probes.py -x --tb=short   # 18 picked tests, unmodified
  python -m pytest tests/test_probe_wiring.py -x --tb=short
  python -m pytest -x -n auto --tb=short
  ```
  Named new tests: `test_render_with_mounted_probe_records_param_postmod`, `test_unmounted_probe_zero_overhead_no_history`, `test_probe_snapshot_zmq_roundtrip`, `test_probe_mount_unmount_via_zmq`, `test_flush_state_clears_probe_history`, `test_lane_output_recorded_per_render_tick`, `test_unknown_probe_cmd_fields_rejected` (**negative**: trust boundary on the new IPC surface), `test_probe_register_beyond_max_probes_rejected` (**negative**: 65th registration → error reply, registry size stays 64), `test_history_never_exceeds_32_per_probe` (record 1,000 readings → `len(history) == 32`).
- **ACCEPTANCE GATES:** 18 picked tests green unmodified; full suite green; render-loop overhead quantified — 100 renders @640×360 with 0 mounted probes vs pre-PR baseline: **median per-frame delta ≤ 1 ms** (print both medians in PR); probe memory ceiling asserted (64 × 32 bound tests green).
- **ROLLBACK:** revert PR (pick + wiring are one PR, two commits — revert both); no schema/persistence impact.
- **EVIDENCE:** picked-tests output, wiring-tests output, timing comparison, PR URL. Note in PR body: payload cherry-picked from #140 tip `d85828e`; #140 should be closed pointing at this PR.

---

## P6.8 — I1 frontend: Inspector Track in the timeline **[RISK: HIGH — Track.type union change touches save/load]**

- **ID:** P6.8 · **Branch:** `feat/p6-i1-inspector-track` · **Base:** `origin/main` · **Est:** ~4h · **Model:** Opus (RISK:HIGH — type-union change with persistence blast radius + drag interaction)
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
  2. Track creation: "+ Inspector Track" in the existing add-track surface; max 1 inspector track v1 (simplification, documented); **max 16 probes per track** (UI cap — backend allows 64 per P6.7; headroom is deliberate). 17th drag → toast, no registration.
  3. Drag-from-param → creates probe binding `{probeId, kind: 'param_postmod', effectId, paramPath, trackId}` → `probe_register` IPC → row appears with label + scope.
  4. ProbeScope canvas: ring-buffer of last 32 readings (matches backend `MAX_HISTORY_PER_PROBE = 32` — VERIFIED in payload `registry.py:29`), 60fps-safe (rAF, draw only on new data), muted probes pause polling for that probe. **Quantified budgets:** frontend ring buffers = 16 probes × 32 readings × 8 B `Float64` ≈ **4 KiB** total (trivial — the number is here so nobody "improves" it into an unbounded array); polling at **10 Hz** while mounted; per-scope canvas draw ≤ **2 ms**, so 16 scopes ≤ 32 ms worst case spread across rAF ticks (draw-on-new-data means at most one repaint per poll, not per frame). Probe-recordings-to-disk stay DEFERRED per SG-H1 (unbuilt) — the in-memory caps above are the explicit substitute; file the SG-H1 follow-up issue from this packet.
  5. Mute/solo semantics: mute = stop polling + dim; solo = poll only soloed (pure frontend concern v1).
  6. Persistence round-trip + legacy-load test.
- **TEST PLAN:**
  ```bash
  cd frontend && npx --no vitest run
  cd frontend && npx playwright test tests/e2e/phase-6/inspector-track.spec.ts   # full-chain E2E (file is NEW in this packet)
  ```
  Named tests: `inspector-track-type.test.ts` (`add inspector track`, `legacy project without inspector tracks loads` (**negative**), `unknown track type in project file dropped with toast` (**negative** — the forward-tolerance from ROLLBACK step), `save/load round-trip with probes`), `probe-binding.test.tsx` (`drag-from-param registers probe via IPC mock`, `delete probe unregisters`, `17th probe rejected with toast` (**negative**)), `probe-scope.test.tsx` (`renders sparkline from mock snapshot`, `mute pauses polling`, `unmount sends probe_unmount`, `malformed snapshot payload renders empty scope not crash` (**negative**)), plus the predicate-audit test: `track-type-exhaustive.test.ts` asserting every `Track["type"]` switch handles `"inspector"` (type-level test via `satisfies`/never-check).
  **Full-chain integration test (named, UI→store→IPC→backend→render):** NEW `frontend/tests/e2e/phase-6/inspector-track.spec.ts` — `dragging param to inspector track shows live scope values during playback` (real drag → store binding → `probe_register`/`probe_snapshot` IPC → Python registry → sparkline pixels change across two polls).
- **ACCEPTANCE GATES:** vitest green ≥ baseline; the named E2E spec green; typecheck clean (`npx --no tsc --noEmit` if that's the repo's check — verify script name in `package.json`); manual UAT with **live-runtime step (Gate 18: `ps aux | grep -i electron`, confirm runtime path = this worktree, name it in the report; store-shape change ⇒ full kill + relaunch, HMR will NOT rehydrate)**: drag param → live scope moves with playback; mute stops it; relaunch app and probes persist; a pre-Phase-6 `.glitch` project loads clean.
- **ROLLBACK:** revert PR. Projects saved WITH inspector tracks then opened on reverted build: the load path must already tolerate unknown track types — verify during step 6; if it does not, add forward-tolerance to THIS PR's load validator (drop unknown track types with toast) so rollback is safe.
- **EVIDENCE:** predicate-audit list, vitest/tsc output, screen capture of live scope, legacy-load proof, PR URL.

---

## P6.9 — I2 backend: graph-sync wiring ONLY (routing-graph cherry-pick owned by Phase-5b P5b.6)

- **ID:** P6.9 · **Branch:** `feat/p6-i2-routing-backend` · **Base:** `origin/main` · **Est:** ~3h · **Model:** Sonnet (pure projection layer over verified shapes)
- **Depends-on:** **P5b.6 merged** (`docs/roadmap/packets/phase-5b.md` P5b.6 — it owns the `2d2ac79` cherry-pick of `backend/src/inspector/routing_graph.py` (+25 tests, `has_cycle()` at line 151 of the payload — VERIFIED) + the package init and is the sole closer of #142's graph payload); P6.7 merged (probe registry)
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
  2. `graph_sync.py`: deterministic node ids (`op:{id}`, `fx:{track}:{effect_id}`, `lane:{track}:{laneId}`), edges from operator mappings (`amount` from mapping depth, clamped) and from automation lanes (amount 1.0). **Failure modes (named):** mapping whose target effect/param does not exist in the supplied chains → **orphan edge: drop it + log warning with the offending mapping id** (the canvas must never receive an edge with a dangling endpoint); duplicate node ids → last-wins + warning; non-finite depth from the payload → clamp (trust boundary). **Size/perf budgets (quantified):** graph build for **200 nodes / 500 edges ≤ 50 ms** (synthetic fixture, median-of-5); serialized `routing_graph_get` reply for that fixture ≤ **256 KiB**.
  3. `routing_graph_get`: accepts the project state in the message (frontend is source of truth for stores, mirroring how `render_frame` receives chains) — do NOT cache server-side across calls.
  4. `routing_edge_update`: validates edge id → maps back to the owning operator mapping → returns updated mapping for the frontend to commit to its store (round-trip authority stays frontend; backend validates ranges).
  5. `has_cycle()` surfaced in the `routing_graph_get` response (`hasCycle: bool` + cycle node ids) so the canvas can badge it — consistent with INJ-2's `ModulationCycleError` semantics (#150) but non-throwing here (view-layer).
- **TEST PLAN:**
  ```bash
  cd backend && python -m pytest tests/test_q7_benchmark/test_routing_graph.py -x --tb=short   # P5b.6's 25 tests, untouched regression guard
  python -m pytest tests/test_graph_sync.py -x --tb=short
  python -m pytest -x -n auto --tb=short
  ```
  Named new tests: `test_build_graph_from_operators_modroutes`, `test_build_graph_from_automation_lanes`, `test_node_ids_deterministic`, `test_edge_amount_clamped_from_mapping`, `test_routing_graph_get_zmq_roundtrip`, `test_edge_update_maps_back_to_operator_mapping`, `test_edge_update_rejects_out_of_range` (**negative**), `test_edge_update_unknown_edge_id_rejected` (**negative**), `test_orphan_edge_to_missing_target_dropped_with_warning` (**negative** — mapping pointing at a non-existent effect/param never reaches the reply), `test_cycle_flag_in_response`, `test_empty_project_empty_graph` (**negative**: zero operators + zero lanes → `{nodes: [], edges: [], hasCycle: false}`, not an error), `test_build_200_nodes_500_edges_under_50ms` (perf, median-of-5), `test_reply_size_500_edges_under_256kib`.
- **ACCEPTANCE GATES:** P5b.6's 25 routing-graph tests green untouched; full backend green; a fixture project with 2 operators + 1 lane yields the exact expected node/edge set (snapshot-asserted); perf + size budget tests green with measured numbers pasted in PR.
- **ROLLBACK:** revert PR; graph is a stateless projection — nothing persisted.
- **EVIDENCE:** test output, fixture graph dump, PR URL. (#142 is closed by P5b.6, the payload owner — this PR only references it.)

---

## P6.10 — I2 frontend: Routing Canvas overlay (⌘⇧I) **[RISK: HIGH — react-xyflow prototype gate]**

- **ID:** P6.10 · **Branch:** `feat/p6-i2-routing-canvas-ui` · **Base:** `origin/main` · **Est:** ~4h · **Model:** Opus (RISK:HIGH — canvas/drag interaction; CLAUDE.md Rule 1.5 Research Gate applies: cite the xyflow or bare-SVG reference pattern in the component header)
- **Depends-on:** P6.9 merged; P4.0 verdict doc (`docs/perf/p4-xyflow-gate-result.md`, owned by `packets/phase-4.md` P4.0)
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
  7. **Edge-count perf budget (quantified):** with a mock `routing_graph_get` payload of **100 nodes / 300 edges**: overlay open→interactive ≤ **500 ms**; node drag-hover and edge-select interaction ≤ **8 ms p95 scripting+render** (the same threshold P4.0's xyflow gate uses — `packets/phase-4.md`: "≤ 8ms p95 scripting+render"); measured in Chrome DevTools performance trace on the dev machine, numbers pasted in PR. Payloads beyond **1,000 edges** render a "graph too large — showing first 1,000" banner instead of attempting full layout (hard cap constant `CANVAS_MAX_EDGES = 1000`).
- **TEST PLAN:**
  ```bash
  cd frontend && npx --no vitest run
  ```
  Named tests: `routing-canvas-open.test.tsx` (`cmd-shift-i opens`, `escape closes`, `fetches graph on open`, `no fetch race after close` (**negative**)), `routing-canvas-edges.test.tsx` (`drag creates mapping via store action`, `created edge undoable`, `depth slider round-trips`, `delete removes mapping`), `routing-canvas-columns.test.tsx` (`routed nodes bright`, `search filters`), `routing-canvas-degenerate.test.tsx` (**negative pair**: `empty graph renders empty-state message not crash` — `{nodes: [], edges: []}` payload shows "no routings yet" and all controls disabled; `orphan edge in payload skipped with console warning` — defense-in-depth even though P6.9 filters server-side; plus `payload over 1000 edges truncated with banner`). Perf gate (step 7) is a documented manual measurement (not vitest) — numbers in PR.
  **Full-chain integration test (named, UI→store→IPC→backend→render):** the manual UAT route below doubles as it; the automatable version is owned by P6.11's integration fixture (`test_graph_projection_complete_fixture` + the E2E specs from P6.6/P6.8 — adding a third Electron E2E here would exceed the 4h box; documented descope).
- **ACCEPTANCE GATES:** vitest green ≥ baseline (including all three degenerate-payload negatives); P4.0 verdict line quoted in PR and the implementation matches it (dep added ⟺ VERDICT: PASS); perf numbers from step 7 pasted (≤ 500 ms open, ≤ 8 ms p95 interaction @ 100n/300e); manual UAT with **live-runtime step (Gate 18: confirm the running Electron's path = this worktree, name it in the report)**: create a route on the canvas → parameter visibly modulates in preview → same route visible in device-chain UI (single-source-of-truth proof); undo removes it.
- **ROLLBACK:** revert PR (removes dep + components + shortcut); zero persistence impact (mappings created through pre-existing store actions remain valid project data).
- **EVIDENCE:** perf measurement, vitest output, screen capture of drag-create + modulation, PR URL.

---

## P6.11 — Phase 6 integration, UAT, and docs closeout

- **ID:** P6.11 · **Branch:** `feat/p6-closeout` · **Base:** `origin/main` · **Est:** ~4h · **Model:** Sonnet (tests + docs; the judgment already happened upstream)
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
  1. Integration fixture: project with (a) a top-25 effect with an image field, (b) a second effect with a Y-domain lane, (c) a mounted probe on the field effect's param, (d) one operator route — render 10 frames; assert: no crash, probe history populated (`len(history) > 0` and ≤ 32), graph projection contains all 4 node kinds, frames non-identical across the Y gradient. **This is the phase's named full-chain test** (IPC→backend→render at pytest level; the UI→store legs are P6.6/P6.8's E2E specs).
  2. Soak sanity (quantified): **500-frame** render loop @640×360 with probes mounted; assert **RSS growth < 50 MB**, **GPU pool leaked handles == 0** (pool stats byte-identical start vs end, on the dev Mac), field-cache `bytes ≤ 256 MiB` throughout, and the soak completes in ≤ **5 minutes** wall — the SG-1 "confirmed" stamp for Tier 2b (vision §8).
  2b. Negative integration: same fixture but the field's `source_id` points at a deleted file — 10 frames render flat-field (P6.3 fallback), no crash, warning count == 1 per source (not per frame — log dedup check).
  3. Docs + ledger updates; UAT guide entries follow the existing numbered-test format.
  4. Close superseded PRs with cross-links.
- **TEST PLAN:**
  ```bash
  cd backend && python -m pytest tests/test_phase6_integration.py -x --tb=short
  python -m pytest -m metal --tb=short
  python -m pytest -x -n auto --tb=short && cd ../frontend && npx --no vitest run
  ```
  Named tests: `test_combined_field_lane_probe_graph_render` (the full-chain anchor), `test_500_frame_soak_rss_bounded` (< 50 MB growth), `test_gpu_pool_flat_over_soak` (metal; leaked handles == 0), `test_probe_history_populated_after_render`, `test_graph_projection_complete_fixture`, `test_dead_field_ref_soak_renders_flat_not_crash` (**negative**, step 2b).
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

---

## Thickness scorecard (pass of 2026-06-11, anchors re-verified against `origin/main` @ `d821ae8`)

Rubric: **R1** anchors git-verified + greps in preconditions · **R2** full field contract + model tier · **R3** named test files + behavior titles + exact commands (+ live-runtime step for UI) · **R4** gates quantified · **R5** failure modes named + ≥1 negative test · **R6** named full-chain integration test (feature packets) · **R7** depends-on resolve to real IDs/gates.

| Packet | R1 | R2 | R3 | R4 | R5 | R6 | R7 | Verdict | Notes |
|---|---|---|---|---|---|---|---|---|---|
| P6.1 | ✅ | ✅ | ✅ | ✅ 500ms/frame (#166), 150ms@360p CI, 512-invocation cap | ✅ 4 named + 4 negative tests | ✅ IPC-depth here; UI chain owned by P6.6 E2E | ✅ #157/#158 | THICK | lane_reader/pipeline/zmq line anchors re-verified exact (57/92/111, 103, 269, 557) |
| P6.2 | ✅ | ✅ | ✅ | ✅ exactly-25 asserted; lane2d cap 512×288 = 589,824 B | ✅ 6 negative tests | n/a (schema; guard test covers pipeline edge) | ✅ none | THICK | `RESERVED_PARAM_PREFIX` @ registry.py:19, 144 fx files — both re-verified |
| P6.3 | ✅ **fixed** | ✅ | ✅ | ✅ 7.91 MiB/field@1080p, 64-entry/256 MiB cache, <1ms hit / <80ms miss | ✅ 7 negative tests (missing/corrupt/out-of-range/oversize/lane2d) | n/a (provider; consumed by P6.5/P6.11 chains) | ✅ P6.2 | THICK | **Anchor corrected:** SG-7 lives at `video/codec_timeout.py:48` (`av_open_timeout`) + `video/reader.py:27`, NOT `engine/codecs.py` as previously written |
| P6.4 | ✅ **fixed** | ✅ Opus | ✅ exact pytest -m metal node command | ✅ 10,000 cycles / RSS ≤ baseline+64 MiB (67,108,864 B) / destroyed_count==10,000 | ✅ 4 negative tests | n/a (safety lib) | ✅ #163 | THICK | **Claim corrected:** zero MLX usage exists in `backend/src/` (grep-verified) — `effects/spectral/` is numpy/scipy, lint ships with empty allowlist. 33 existing tests re-counted exact |
| P6.5 | ✅ | ✅ Opus | ✅ | ✅ GPU ≤12ms / CPU ≤40ms @1080p, parity ≤2/255, pool 96 MiB/8 handles | ✅ 4 negative incl. dispatch-failure fallback | ✅ via flat-field anchor + P6.11 `test_combined_…` | ✅ P6.2+P6.4 | THICK | Fallback-path negative test added per known thin spot |
| P6.6 | ✅ | ✅ Opus | ✅ + Gate-18 live-runtime step | ✅ vitest ≥1,814 baseline | ✅ 5 negative tests | ✅ NEW `tests/e2e/phase-6/field-params.spec.ts` (2 named specs) | ✅ P6.1–3 + #158 | THICK | App.tsx:923 payload-assembly anchor re-verified exact |
| P6.7 | ✅ | ✅ | ✅ | ✅ MAX_HISTORY_PER_PROBE=32 (payload-verified), MAX_PROBES=64, ≈160 KiB ceiling, ≤1ms overhead/100 renders | ✅ 3 negative tests | ✅ ZMQ-roundtrip depth; UI chain in P6.8 E2E | ✅ #140 `d85828e` | THICK | Payload tip, 18 tests, deque(maxlen=32) all re-verified in worktree |
| P6.8 | ✅ | ✅ Opus | ✅ + Gate-18 + HMR-relaunch note | ✅ 16 probes/track, 10 Hz poll, ≤2ms/scope, 4 KiB buffers | ✅ 5 negative tests | ✅ NEW `tests/e2e/phase-6/inspector-track.spec.ts` | ✅ P6.7 | THICK | Track.type union @ types.ts:59 re-verified verbatim; SG-H1 disk deferral KEPT, in-memory caps quantified as substitute |
| P6.9 | ✅ | ✅ | ✅ | ✅ 200n/500e ≤50ms build, ≤256 KiB reply | ✅ 4 negative incl. orphan-edge + empty-graph | ✅ snapshot fixture + P6.11 | ⚠ P5b.6 unmerged | THICK (blocked) | `resolve_routings`/`has_cycle`/25 payload tests re-verified; blocker is by design (STOP precondition) |
| P6.10 | ✅ | ✅ Opus | ✅ + Gate-18 live-runtime step | ✅ ≤500ms open, ≤8ms p95 (P4.0's threshold), CANVAS_MAX_EDGES=1000 | ✅ 4 negative incl. empty-graph + orphan-edge | ⚠ manual UAT + P6.11 fixture (3rd Electron E2E descope documented) | ⚠ P4.0 verdict doc absent | THICK (gated) | xyflow dep + verdict doc absence re-verified; `Map to LFO 1` stub location re-verified |
| P6.11 | ✅ | ✅ | ✅ | ✅ 500 frames, <50 MB RSS, 0 leaked handles, ≤5 min, ≤256 MiB cache | ✅ dead-ref soak negative | ✅ `test_combined_field_lane_probe_graph_render` | ✅ P6.1–P6.10 | THICK | Comprehensive-done tally gate retained |

### Unfixables (external blockers — recorded, not paperable-over)

1. **#157/#158 unmerged** (phase-entry check 1 fails as of 2026-06-11): P6.1 and P6.6 cannot start; their STOP preconditions enforce this. Not fixable in this document.
2. **P5b.6 unmerged** (`backend/src/inspector/routing_graph.py` not on main — re-verified): P6.9/P6.10 blocked behind a Phase-5b packet; cross-file ownership is explicit and single-owner, but the dependency is real and outside Phase 6's control.
3. **P4.0 verdict doc absent** (`docs/perf/p4-xyflow-gate-result.md` — re-verified absent): P6.10's library decision cannot be made until P4.0 runs; the packet STOPs rather than improvises, which is correct but leaves P6.10 unstartable today.
4. **MLX install on the dev Mac is unverifiable from this docs worktree**: P6.4's "packet NOT done if MLX can't install" gate is the strongest statement a document can make; actual feasibility is a runtime fact.
5. **P6.10 full-chain E2E descoped to manual + P6.11**: a third `_electron` Playwright spec would blow the 4h packet box; the descope is documented inline rather than hidden, but it remains a real automation gap until someone funds it.
