# Work Packets — Selection / Masking / Alpha (MK.1–MK.14 + MK.CU)

**Authored:** 2026-06-12 · against `origin/main` @ `95e9b1b` (all anchors verified at that SHA;
re-run each packet's PRECONDITIONS at pickup — they are the contract, not the SHA).
**Spec:** `docs/roadmap/SELECTION-MASKING-SPEC.md` (the architecture; §11 gates govern).
**Contract:** every packet follows `EXECUTION-PLAN.md` §1 incl. rules 10 (frontend packets run
`npm install --prefer-offline` in the fresh worktree BEFORE preconditions) and 11 (monotonic gates —
"≥ baseline", never pinned absolute counts).

**Conventions:** fresh worktree per packet (`git worktree add ~/Development/creatrix-mk<N>-wt -b
<branch> origin/main`); backend `cd backend && python -m pytest -x -n auto --tb=short`; frontend
`cd frontend && npx --no vitest run` (the `--no` is mandatory); one PR per packet; ≤4h each.
**Single-flight hotspots:** `backend/src/engine/compositor.py` (MK.2 only owner while in flight),
`backend/src/zmq_server.py` dispatch (MK.3/MK.6/MK.9/MK.12 queue behind any other in-flight zmq
packet), `frontend/src/shared/types.ts` (coordinate between MK.1/MK.4/MK.9).
**Live-runtime (Gate 18):** every UI-facing packet (MK.3–MK.9, MK.11–MK.13) ends with a
verification step in the RUNNING app and names the runtime path (`ps aux | grep -i electron`);
Zustand store-shape changes require kill+relaunch.

**Two-tier test policy (CU visual gates — mandatory):** every UI-touching packet's TEST PLAN has
(a) the named vitest/pytest tests AND (b) a **CU VISUAL GATE** — a computer-use-executable check:
launch the app per repo CLAUDE.md (`cd frontend && npm start`), request CU access (Electron, full
tier — launch + access mechanics per memory `visual-uat-entropic.md`), perform the packet's headline
interaction using element-anchored steps (never raw coordinates), screenshot, and judge a pass
criterion **from the screenshot alone**. Screenshots named `masking/<date>/<packet>-<step>.png`,
attached as PR evidence. Backend-only packets keep code tests and NAME the downstream packet whose
CU gate covers them. The consolidated journey suite is **MK.CU** (runs at Phase A exit, again at
Phase B exit, and joins the campaign rule-9 live smoke once masking merges).

**Supersession note (rides MK.4's and MK.9's PR bodies):** MK.4 supersedes `parallel-track.md` PD.5
(task #45a); MK.9 supersedes PD.6 (task #45b). Mark both rows superseded in the same PRs
(ledger-correction protocol, ROADMAP §3 rule 8).

---

## Dependency graph

```
MK.1 (matte model) ──┬── MK.3 (routing wrapper) ──┬── MK.12 (split-by-matte / RVM)
                     ├── MK.7 (matte ops)         │
                     ├── MK.8 (keys + lanes) ─────┼── MK.11 (lanes + mod-source + kf transforms)
                     └── MK.4 (marquee+delete) ───┤        [MK.11 mod-source half gated SG-5]
MK.2 (alpha blend) ──┬─────┘   │                  │
                     └── MK.10 (alpha export)     │
MK.4 ── MK.5 (lasso)                              │
MK.4 ── MK.6 (wand + color range)                 │
MK.4/5/6 + PR-A P3.2 ── MK.13 (tool tab + ants) ──┘
MK.14 (motion-track spike): MK.1 only
MK.CU (CU journey suite): MK.1–MK.10 merged — the Phase A exit gate; reruns at Phase B exit
```

Merge order = numbering unless depends-on says otherwise. MK.2 and MK.1 are independent and may run
in parallel (different files).

---

## MK.1 — Matte data model, budget, cache, persistence

- **ID:** MK.1 · **Branch:** `feat/mk1-matte-model` · **Base:** `origin/main` · **Depends-on:** none
- **Model:** Sonnet · **Est:** ~4h
- **Goal:** The `MatteNode`/mask-stack schema exists on both sides of the IPC boundary with budgets,
  an LRU cache for static mattes, stack resolution (boolean combine + invert/feather/grow), and
  project persistence — no UI, no render-path consumption yet (MK.2/MK.3/MK.4 consume).
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  cd ~/Development/entropic-v2challenger && git fetch origin
  git ls-tree --name-only origin/main backend/src/masking/ 2>/dev/null | head -1 | grep -q . && { echo "STOP: masking/ already exists — re-scope"; exit 1; } || echo OK-greenfield
  git grep -rn "MatteNode\|maskStack\|mask_stack" origin/main -- frontend/src backend/src | head -1 | grep -q . && { echo "STOP: matte schema already present"; exit 1; } || echo OK-clean
  git grep -n "FIELD_CACHE_MAX_BYTES" origin/main -- backend/src/effects/field_source.py >/dev/null 2>&1 && echo "NOTE: P6.3 landed — mirror its cache_stats() shape" || echo "NOTE: P6.3 not landed — this cache is the first of the two"
  git grep -n "def pressure_percent" origin/main -- backend/src/safety/pressure/budget.py || { echo "STOP: SG-8 lib missing"; exit 1; }
  ```
- **Scope (VERIFIED paths):**
  - NEW `backend/src/masking/__init__.py`, `backend/src/masking/schema.py` (MatteNode dataclass per
    SPEC §3.2 — `from_dict`/`to_dict`, validator: kind enum, id regex `^[A-Za-z0-9_-]{1,64}$`, params
    finite-clamped, feather [0,100], growShrink [−50,50], `MAX_MATTE_NODES_PER_CLIP = 8`)
  - NEW `backend/src/masking/matte_source.py` (static-shape rasterizers rect/ellipse/polygon/bitmap →
    float32 (H,W) [0,1]; LRU cache keyed `(clip_id, node_id, resolution, params_hash)`;
    `MATTE_CACHE_MAX_ENTRIES = 32`, `MATTE_CACHE_MAX_BYTES = 128 * 1024 * 1024`; `cache_stats()`
    `{entries, bytes, hits, misses, evictions}`; SG-8 hook: at `pressure_percent() ≥ 82` halve the
    byte cap and evict)
  - NEW `backend/src/masking/stack.py` (`resolve_stack(nodes, frame_ctx, resolution) -> np.ndarray` —
    add/subtract/intersect fold, per-node invert→feather(gaussian)→grow/shrink(cv2 morphology) order
    documented in the docstring; procedural kinds raise `NotImplementedError` here until MK.8/MK.12
    register evaluators via a kind→evaluator registry dict)
  - `frontend/src/shared/types.ts` — `MatteNode`, `Clip.maskStack?: MatteNode[]` (additive optional;
    **no `PROJECT_VERSION` bump**, UE.7 precedent)
  - `frontend/src/renderer/project-persistence.ts` — load-time validator: malformed node → dropped +
    toast; out-of-range numerics clamped (P6.6 pattern)
  - NEW `backend/tests/test_masking/test_schema.py`, `test_matte_source.py`, `test_stack.py`;
    NEW `frontend/src/__tests__/stores/mask-stack-persistence.test.ts`
- **DO-NOT-TOUCH:** `backend/src/engine/**` (MK.2/MK.3 own render-path integration),
  `backend/src/zmq_server.py` (MK.3), `frontend/src/renderer/components/**` (MK.4), existing
  `effects/field_params.py` LANE2D constants (different budget by design — SPEC GT-11).
- **Steps:** schema → rasterizers → cache → stack fold → frontend types → persistence validator → tests.
- **TEST PLAN:**
  ```bash
  cd backend && python -m pytest tests/test_masking/ -x --tb=short && python -m pytest -x -n auto --tb=short
  cd ../frontend && npx --no vitest run
  ```
  Named tests: `test_matte_node_roundtrip`, `test_rect_and_ellipse_rasterize_exact_coverage` (analytic
  area vs matte sum, tolerance 1%), `test_polygon_rasterizes_inside_one_outside_zero`,
  `test_stack_add_subtract_intersect_fold`, `test_feather_then_grow_order_matches_docstring`,
  `test_unknown_kind_rejected` (**negative**), `test_node_params_nan_inf_clamped` (**negative** —
  NaN/Inf feather/growShrink → clamped finite, never raises), `test_ninth_node_rejected` (**negative**
  — `MAX_MATTE_NODES_PER_CLIP`), `test_lru_eviction_under_entry_and_byte_caps` (33 distinct mattes →
  evictions ≥ 1, `bytes ≤ 134,217,728`), `test_sg8_pressure_halves_cache` (mock `pressure_percent` →
  cap halved + evicted), `test_cache_hit_resolve_under_1ms` (median-of-20). Frontend:
  `mask stack survives save and load round trip` (**integration, full persistence chain**: set stack →
  serialize → deserialize → deep-equal), `malformed matte node dropped with toast on load`
  (**negative**), `legacy project without maskStack loads clean` (**negative**).
- **ACCEPTANCE GATES (quantified):** full suites green ≥ baseline; cache byte-cap proven via
  `cache_stats()` printout (≤ 134,217,728); rasterizer coverage within 1% analytic; cache-hit < 1 ms
  median-of-20; all 14 named tests green; `PROJECT_VERSION` diff = 0 lines.
- **Failure modes:** rasterizer coordinate convention drift (y-down vs y-up) → the exact-coverage test
  with an off-center rect pins it; cache key omitting params_hash → stale matte after node edit (the
  roundtrip + a `test_param_change_invalidates_cache` assertion inside the LRU test); persistence
  validator too strict (drops valid nodes) → legacy-load negative is the guard.
- **CU coverage:** backend/schema-only — covered downstream by MK.4's CU gate (committed node visible
  after app relaunch) and MK.CU journey J1.
- **ROLLBACK:** revert PR — nothing consumes `masking/` yet; saved projects with `maskStack` still load
  after revert (unknown-field tolerance — assert in the legacy test's sibling).
- **EVIDENCE:** test output, `cache_stats()` printout, PR URL.

---

## MK.2 — Per-pixel alpha in the composite path **[RISK: HIGH]**

- **ID:** MK.2 · **Branch:** `feat/mk2-alpha-composite` · **Base:** `origin/main` · **Depends-on:**
  none (P2.2c shipped — SPEC GT-8; single-flight owner of `compositor.py` while in flight)
- **Model:** Opus/Fable (RISK:HIGH — render-math change touching every composite) + `/qa-redteam`
  before merge · **Est:** ~4h
- **Goal:** Per-pixel alpha is HONORED, not just carried (SPEC GT-2): all 9 blend modes weight by
  `w = layer_alpha · scalar_opacity` per pixel (straight alpha, SPEC §7-2); output alpha = over-
  composite; preview flattens the final RGBA canvas onto opaque `#0B0B10` before `encode_mjpeg`.
  Side effect: `fx.chroma_key`/`fx.luma_key` become visible for the first time (GT-3).
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  cd ~/Development/entropic-v2challenger && git fetch origin
  git grep -n "BLEND_MODES = {" origin/main -- backend/src/engine/compositor.py | grep -q ":69:" || echo "WARN: anchor moved — re-verify the 9 modes before editing"
  git grep -c "def _blend_" origin/main -- backend/src/engine/compositor.py | grep -q "9" || { echo "STOP: blend-mode count != 9 — re-scope"; exit 1; }
  git grep -n "def _resolve_compositing" origin/main -- backend/src/engine/compositor.py >/dev/null || { echo "STOP: P2.2c terminal-composite resolution missing — ground truth changed"; exit 1; }
  git grep -rn "alpha_weight\|per_pixel_alpha" origin/main -- backend/src/engine/ | head -1 | grep -q . && { echo "STOP: alpha weighting already present"; exit 1; } || echo OK
  ```
- **Scope (VERIFIED paths):** `backend/src/engine/compositor.py` (the 9 `_blend_*` functions gain a
  per-pixel weight array; `render_composite` computes `w` from `processed[:, :, 3]` × resolved
  opacity; canvas alpha = over-composite) · `backend/src/engine/cache.py` `encode_mjpeg` callers OR a
  new `flatten_rgba(frame, bg=(11, 11, 16))` helper in compositor.py called at the preview boundary
  (`zmq_server.py` render reply assembly — locate the `encode_mjpeg` call sites at packet start and
  list them in the PR body) · NEW `backend/tests/test_alpha_composite.py`.
- **DO-NOT-TOUCH:** `BLEND_MODES` dict keys and `_resolve_compositing`/`_clip_opacity` semantics
  (extend the math, never the contract); `engine/export.py` (MK.10); `container.py` (MK.3);
  `frontend/**`; the INJ-3 layer caps.
- **Steps:** (1) weight-array refactor of the 9 blend fns (signature gains `w: np.ndarray | float` —
  scalar fast-path preserved for fully-opaque layers: skip the alpha extract when
  `processed[:, :, 3].min() == 255`, keeping the hot path allocation-free). (2) Output-alpha
  over-composite. (3) Preview flatten at the encode boundary. (4) Measure: composite stage delta.
- **TEST PLAN:**
  ```bash
  cd backend && python -m pytest tests/test_alpha_composite.py -x --tb=short && python -m pytest -x -n auto --tb=short
  cd frontend && npx playwright test tests/e2e/smoke.spec.ts
  ```
  Named tests: `test_fully_opaque_layers_byte_identical_to_legacy` (**THE no-regression golden gate**:
  4-layer composite, all alpha=255, every blend mode → byte-equal to a pre-change captured reference;
  capture method documented in-test), `test_zero_alpha_pixels_do_not_paint` (keyed-out region leaves
  base untouched — the GT-2 bug proof, fails on main before this PR), `test_half_alpha_blends_half`
  (a=128 → 50% weight within ±1/255), `test_output_alpha_is_over_composite`,
  `test_each_of_9_modes_alpha_weighted` (parameterized ×9), `test_chroma_key_now_visible_in_composite`
  (**integration, full chain**: layer with `fx.chroma_key` in chain → `render_composite` → keyed
  region shows base layer pixels — proves GT-3 fixed end-to-end through apply_chain → blend),
  `test_nan_alpha_sanitized` (**negative**: NaN in alpha plane → treated as opaque, no propagation),
  `test_preview_flatten_produces_opaque_rgb` (flattened output alpha ≡ 255; bg = #0B0B10 where canvas
  was transparent), `test_composite_stage_timing_budget` (4 layers @640×360, median-of-20: ≤ legacy
  median × 1.15 — CI-scale proxy for the ≤ +0.25 ms/layer @1080p gate).
- **ACCEPTANCE GATES (quantified):** golden byte-identity test green (zero-diff on opaque inputs);
  9/9 mode tests green; scripted 1080p measurement: composite stage ≤ 3.0 ms @4 layers (PERF-MODEL
  stage 4) with the ms numbers pasted in the PR; full backend green ≥ baseline; E2E smoke green;
  `/qa-redteam` findings resolved.
- **Failure modes:** the scalar fast-path diverges from the array path (parameterized both-paths
  equality test inside the ×9 suite); flatten applied twice (preview + export both flatten → export
  darkens) — export untouched here, assert via the DO-NOT-TOUCH diff; memory blow-up from per-mode
  float casts (reuse the existing single float32 conversion, no extra full-frame copies — reviewer
  checklist item); CI red after merge → revert first (ROADMAP §3 rule 3).
- **CU VISUAL GATE (this packet — keys become visible is screenshot-judgeable):** launch app, add
  `fx.chroma_key` to a green-screen test clip over a second track, screenshot
  `masking/<date>/mk2-keyed-composite.png` — **pass: keyed region shows the lower layer's pixels (or
  the surface-0 backdrop on a single layer), NOT the original green** (this exact view is a no-op on
  pre-MK.2 main — the screenshot is the GT-3 fix proof).
- **ROLLBACK:** revert PR — no schema/persistence impact; preview returns to alpha-blind behavior.
- **EVIDENCE:** golden-test output, before/after PNG pair of a chroma-keyed composite, the CU gate
  screenshot, 1080p stage timing numbers, `/qa-redteam` summary, PR URL.

---

## MK.3 — Universal mask-routing wrapper (per-device + per-chain) **[HEADLINE]**

- **ID:** MK.3 · **Branch:** `feat/mk3-mask-routing` · **Base:** `origin/main` · **Depends-on:** MK.1
  (matte resolution); MK.2 not required (the `_mask` blend is alpha-independent) but merges before by
  numbering. Queues behind any in-flight `zmq_server.py` packet (single-flight rule 7).
- **Model:** Opus (architecture-setting: the C4-spatial-twin seam every later packet consumes) ·
  **Est:** ~4h
- **Goal:** Any device chain applies THROUGH a matte (SPEC §4.2): per-device `maskRef` resolves to a
  matte injected as `_mask` (the orphaned `container.py:58/:130–133` seam — GT-6); per-chain
  `chain_mask` = whole-chain wet/dry (`out = in·(1−m) + chain(in)·m`) in `apply_chain`. Invertible.
  Frontend: maskRef assignment on devices (minimal control; rich UI in MK.13), snake_case IPC.
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  cd ~/Development/entropic-v2challenger && git fetch origin
  git grep -n 'effect_params.pop("_mask", None)' origin/main -- backend/src/engine/container.py || { echo "STOP: container _mask seam moved/removed"; exit 1; }
  git grep -rn "_mask" origin/main -- frontend/src backend/src/zmq_server.py | head -1 | grep -q . && { echo "STOP: _mask has a sender now — re-scope around it"; exit 1; } || echo OK-orphan-confirmed
  git grep -n "def resolve_stack" origin/main -- backend/src/masking/stack.py || { echo "STOP: MK.1 not merged"; exit 1; }
  git grep -n "def apply_chain" origin/main -- backend/src/engine/pipeline.py || { echo "STOP: apply_chain moved"; exit 1; }
  ```
- **Scope (VERIFIED paths):** `frontend/src/shared/types.ts` (`EffectInstance.maskRef?: MatteRef`;
  chain-level mask on the track's chain container — locate the chain owner in `stores/timeline.ts` /
  `stores/effects.ts` at pickup, record choice) · `frontend/src/renderer/App.tsx` render-payload
  assembly (attach `mask_ref`/`chain_mask` snake_case via `ipc-serialize.ts`; omit when absent) ·
  `backend/src/zmq_server.py` render handlers (resolve refs via `masking.stack.resolve_stack` against
  the layer's `mask_stack`, inject `_mask` per device; trust boundary: unknown node id / malformed ref
  → skip + warn, never crash the frame) · `backend/src/engine/pipeline.py` (`apply_chain` optional
  `chain_mask: np.ndarray | None` — input snapshot + final blend; document interaction with
  `freeze_cut`) · minimal device-chain UI: "mask" row on `DeviceCard.tsx` (assign from clip's stack
  nodes + invert toggle, undoable) · NEW `backend/tests/test_mask_routing.py` + Vitest files.
- **DO-NOT-TOUCH:** `container.py` (consume the seam as-is — zero diff), `compositor.py` blend math
  (MK.2's), `MAX_CHAIN_DEPTH`/SEC-7 checks, `EffectBrowser.tsx` (PR-A territory).
- **Steps:** types → payload → backend resolve+inject → `chain_mask` blend → DeviceCard control →
  tests. Cite C4's universal band wrapper as the design precedent in the module docstring.
- **TEST PLAN:**
  ```bash
  cd backend && python -m pytest tests/test_mask_routing.py -x --tb=short && python -m pytest -x -n auto --tb=short
  cd ../frontend && npx --no vitest run
  ```
  Named tests: `test_mask_all_ones_byte_equals_unmasked_render` (degenerate proof 1),
  `test_mask_all_zeros_byte_equals_dry_frame` (degenerate proof 2),
  `test_half_mask_blends_dry_wet_50_50`, `test_invert_flag_flips_routing`,
  `test_chain_mask_whole_chain_wet_dry_not_per_device` (3-effect chain: chain_mask result ≠ per-device
  result on a crafted frame — semantics pinned), `test_unknown_mask_node_id_skipped_with_warning`
  (**negative** — render continues), `test_malformed_mask_ref_payload_rejected_clean` (**negative**:
  params=42 / wrong shape → structured skip, sidecar alive), `test_mask_resolution_mismatch_resized`
  (matte at clip res, render at other res → bilinear, never raise),
  `test_masked_device_blend_under_1ms` (class B gate: 1080p, median-of-20, the wrapper blend step
  alone). Frontend: `assigning device mask sends mask_ref in render payload` (mock IPC), `mask
  assignment is undoable`, `device with maskRef shows mask row`. **Integration (full chain, named):**
  `test_device_mask_routes_effect_through_matte_end_to_end` — sidecar-level: payload with
  `mask_stack` (one rect node) + device `mask_ref` → `_handle_render` → frame bytes: inside-rect
  pixels = effected, outside = dry (exact pixel assertions at 4 probe points).
- **ACCEPTANCE GATES (quantified):** both degenerate byte-equality proofs green; wrapper blend ≤ 1.0 ms
  @1080p median-of-20 (PERF-MODEL class B — number pasted); full suites green ≥ baseline; zero diff on
  `container.py` (`git diff --stat` pasted); integration test green.
- **Failure modes:** double application (mask injected as `_mask` AND chain_mask on the same matte →
  quadratic falloff) — the 50/50 blend test on a combined case pins single application; `_mask` shape
  (H,W) vs frame (H,W,4) broadcast error on non-matching res (covered: resize negative); payload bloat
  (matte arrays must NEVER ride the IPC payload — only refs; backend resolves; assert payload size in
  the mock-IPC test); freeze_cut + chain_mask interaction (snapshot the post-freeze input — documented
  + tested if freeze_cut present in fixtures).
- **CU VISUAL GATE:** launch app, assign a rect matte (seeded via a test project until MK.4 lands) to
  a device via the DeviceCard mask row, screenshot `masking/<date>/mk3-routed-effect.png` — **pass:
  the effect is visible ONLY inside the rect region; outside is the unprocessed frame; the mask row
  shows on the device card.**
- **ROLLBACK:** revert PR — `mask_ref`/`chain_mask` are additive payload keys; absent → byte-identical
  legacy behavior (proof: degenerate test 1 doubles as the rollback guarantee).
- **EVIDENCE:** degenerate-proof output, 4-probe integration output, blend ms, CU gate screenshot
  (background glitched, figure dry), PR URL.

---

## MK.4 — Rect/ellipse marquee on preview → MatteNode + delete-in/out + fill (absorbs PD.5 / #45a)

- **ID:** MK.4 · **Branch:** `feat/mk4-preview-marquee` · **Base:** `origin/main` · **Depends-on:**
  MK.1 + MK.2 (delete = alpha) ; MK.3 useful not required
- **Model:** Sonnet · **Est:** ~4h
- **Goal:** Drag on the preview canvas draws a rect (Shift⇢ellipse constraint ⇢ record convention)
  selection → committed as a `rect`/`ellipse` MatteNode on the active clip's stack; operations:
  delete-inside / delete-outside (alpha via stack consumption in the render payload), fill-with-color.
  Esc/click-off clears the in-progress selection. **Supersedes PD.5** (same overlay surface; product
  is a MatteNode).
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  cd ~/Development/entropic-v2challenger && git fetch origin
  git ls-tree --name-only origin/main frontend/src/renderer/components/preview/ | grep -q "BoundingBoxOverlay.tsx" || { echo "STOP: coordinate-idiom source missing"; exit 1; }
  git grep -rn "RegionSelectOverlay" origin/main -- frontend/src | head -1 | grep -q . && { echo "STOP: PD.5 shipped independently — reconcile"; exit 1; } || echo OK-greenfield
  git grep -n "maskStack" origin/main -- frontend/src/shared/types.ts || { echo "STOP: MK.1 not merged"; exit 1; }
  ```
- **Scope (VERIFIED paths):** NEW `frontend/src/renderer/components/preview/MaskSelectOverlay.tsx`
  (**Research Gate / read-existing-component rule:** read `BoundingBoxOverlay.tsx` + `SnapGuides.tsx`
  first — reuse their canvas→frame letterbox mapping, cite in a code comment) · selection-in-progress
  state in the store owning preview interaction (record choice in PR body) · `addMatteNode` /
  `removeMatteNode` / `updateMatteNode` store actions wrapped in `undoable()` ·
  `PreviewControls.tsx` mode toggle (rect/ellipse; full tool stack = MK.13) · delete-in/out + fill
  actions (set a stack-consumption flag on the clip: `maskMode: 'deleteInside' | 'deleteOutside' |
  'fill'` + fill color from the 8-swatch DESIGN-SPEC palette) riding the render payload from MK.3's
  plumbing · committed-selection affordance: static dashed MOD outline + 65% outside-dim (the full
  animated marching ants land in MK.13) · shortcut registrations per `MASKING-INTERACTIONS.md` §8:
  `q` (marquee), `Cmd+Shift+A` deselect, `Cmd+Shift+I` invert, `Cmd+Shift+H` hide ants,
  `Alt+Backspace` delete-outside (ShortcutRegistry categories `tool`/`mask`) · the unified 7-level
  Escape dispatcher + Backspace priority chain (`MASKING-INTERACTIONS.md` §9/§4 — replaces the
  `App.tsx:736–747` split; levels whose features aren't built yet no-op until their packets land) ·
  component + store tests.
- **DO-NOT-TOUCH:** timeline `MarqueeOverlay.tsx` (different feature — UE.3, clips), `useFrameDisplay.ts`
  internals, backend (consumption shipped in MK.2/MK.3), drag-reorder logic.
- **Steps:** (1) overlay drag rect (pointer-down/move/up; drag-end suppresses synthetic click per
  `feedback_drag-end-suppresses-click.md`). (2) canvas→frame transform (letterbox-aware, copied idiom).
  (3) commit → MatteNode with Shift/Alt boolean op per SPEC §5. (4) delete/fill ops. (5) Esc cancels.
- **TEST PLAN:**
  ```bash
  cd frontend && npx --no vitest run src/__tests__/components/preview/ src/__tests__/stores/
  cd backend && python -m pytest tests/test_masking/ -x --tb=short
  ```
  Named tests: `marquee drag commits rect matte node in frame coords` (exact numbers on a 1920×1080
  frame in an 800×450 canvas with 25px letterbox — the PD.5 gate inherited), `shift modifier sets add
  op and alt sets subtract`, `escape mid-drag cancels without node` (**negative**), `zero-area drag
  creates no node` (**negative**), `drag-end does not trigger click-off deselect` (**negative**),
  `delete inside sets maskMode and is undoable`, `fill uses a design-spec swatch hex` (asserts the hex
  ∈ the 8-swatch array). **Integration (full chain, named):** `marquee to transparent render round
  trip` — E2E (`frontend/tests/e2e/`): draw marquee in the real UI → delete-inside → rendered preview
  frame's region differs from pre-delete frame while outside region is pixel-stable (existing
  `_electron` harness).
- **ACCEPTANCE GATES (quantified):** coordinate test exact at 2 zoom/letterbox geometries; all 7 named
  Vitest green; E2E integration green; full suite ≥ baseline; chaos pass noted in PR (rapid
  double-drag, drag starting outside canvas).
- **Failure modes:** letterbox math drift vs BoundingBoxOverlay (shared transform + exact test);
  synthetic click clearing fresh selection (named negative); store-shape change without relaunch
  (Gate 18 note: kill+relaunch).
- **CU VISUAL GATE (covers MK.1 + MK.2 downstream too):** launch app, drag a marquee over a region,
  apply delete-inside, screenshots `masking/<date>/mk4-marquee.png` + `mk4-delete-inside.png` —
  **pass: (1) the drag rect is visible during the gesture; (2) after delete, pixels inside the region
  render the surface-0 backdrop / underlying layer, pixels outside are unchanged from the pre-delete
  screenshot.**
- **ROLLBACK:** revert PR — overlay + actions additive.
- **EVIDENCE:** named tests, E2E output, CU gate screenshots (runtime path named), PR URL.
  **PR body marks PD.5 superseded.**

---

## MK.5 — Lasso: freehand + polygon

- **ID:** MK.5 · **Branch:** `feat/mk5-lasso` · **Base:** `origin/main` · **Depends-on:** MK.4
  (overlay + commit infra)
- **Model:** Sonnet · **Est:** ~3h
- **Goal:** Freehand lasso (sampled polyline → RDP-simplified ≤ 256 vertices) and polygon lasso
  (click-to-place, double-click/Enter closes, Esc cancels) commit `polygon` MatteNodes through MK.4's
  pipeline.
- **PRECONDITIONS:** `git grep -n "MaskSelectOverlay" origin/main -- frontend/src/renderer/components/preview/ || { echo "STOP: MK.4 not merged"; exit 1; }`
- **Scope:** `MaskSelectOverlay.tsx` (two new modes), NEW `frontend/src/renderer/utils/rdp-simplify.ts`
  (pure, unit-tested), `PreviewControls.tsx` mode entries, tests. Backend `polygon` rasterizer exists
  (MK.1).
- **DO-NOT-TOUCH:** rect/ellipse paths (regression-guard), backend.
- **TEST PLAN:** `cd frontend && npx --no vitest run` — named: `freehand path simplifies to at most
  256 vertices` (10,000-point synthetic scribble → ≤256, max deviation ≤ 2px), `polygon closes on
  double click and commits node`, `polygon esc mid-placement cancels` (**negative**), `self-intersecting
  polygon still rasterizes without crash` (**negative** — even-odd rule documented), `two-point
  polygon rejected` (**negative**). **Integration (named):** `lasso to matte node to store round trip`
  — pointer sequence → node committed → store stack length + vertex payload asserted.
- **ACCEPTANCE GATES (quantified):** vertex cap 256 enforced; RDP deviation ≤ 2px asserted; 5 named +
  integration green; full suite ≥ baseline.
- **Failure modes:** unbounded freehand point arrays during drag (sample at ≥ 4px movement deltas —
  asserted via the simplify test input); double-click also firing single-click placement (covered by
  the close test).
- **CU VISUAL GATE:** freehand-lasso an irregular region, screenshot
  `masking/<date>/mk5-lasso-outline.png` — **pass: the committed outline follows the drawn path (not
  a bounding rect) and the node appears in the clip's stack count badge.**
- **ROLLBACK:** revert PR. · **EVIDENCE:** tests + CU gate screenshot (runtime path named), PR URL. ·
  **Model:** Sonnet.

---

## MK.6 — Magic wand + Select Color Range ("delete a color throughout")

- **ID:** MK.6 · **Branch:** `feat/mk6-wand-color-range` · **Base:** `origin/main` · **Depends-on:**
  MK.4 (tool surface), MK.1. Queues behind in-flight zmq packets (new IPC cmd).
- **Model:** Sonnet · **Est:** ~4h
- **Goal:** (a) **Magic wand**: click a preview pixel → backend contiguous flood-fill at the current
  frame (RGB distance ≤ tolerance) → baked `bitmap` MatteNode (PNG sidecar). (b) **Select Color
  Range**: pick a color (eyedropper) → procedural `color_range` node (global, non-contiguous,
  tolerance + softness) re-evaluated EVERY frame — **this is the "delete a specific color throughout
  the clip" user story**: color_range node + delete-inside = the color vanishes across all frames.
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  cd ~/Development/entropic-v2challenger && git fetch origin
  git grep -n "def resolve_stack" origin/main -- backend/src/masking/stack.py || { echo "STOP: MK.1 missing"; exit 1; }
  git grep -rn "flood_fill\|magic_wand" origin/main -- backend/src | head -1 | grep -q . && { echo "STOP: wand exists"; exit 1; } || echo OK
  ```
- **Scope:** NEW `backend/src/masking/wand.py` (`flood_fill(frame, seed_xy, tolerance) -> matte` via
  `cv2.floodFill`; seed validated in-bounds) · `color_range` evaluator registered in `stack.py`'s
  kind registry (vectorized RGB distance + softness ramp; **class C**: ≤ 4 ms @1080p, half-res preview
  degrade per PERF-MODEL §3.1) · `backend/src/zmq_server.py` new cmd `mask_wand_sample`
  (`{clip_id, frame_index, x, y, tolerance}` → bakes the bitmap node, returns node payload; all fields
  trust-boundary validated) · frontend: wand + eyedropper modes in `MaskSelectOverlay.tsx`, tolerance
  slider · PNG sidecar write through the granted-path validation pattern (`.glitch.bak` precedent,
  `file-handlers.ts`) · tests both layers.
- **DO-NOT-TOUCH:** existing `fx.chroma_key`/`fx.luma_key` (MK.8), `container.py`, `compositor.py`.
- **TEST PLAN:**
  ```bash
  cd backend && python -m pytest tests/test_masking/test_wand.py tests/test_masking/test_color_range.py -x --tb=short
  cd ../frontend && npx --no vitest run
  ```
  Named: `test_wand_selects_contiguous_region_only` (two same-color regions, one seeded → other
  unselected — the contiguity proof), `test_wand_tolerance_zero_selects_exact_color_only`,
  `test_wand_seed_out_of_bounds_rejected` (**negative** — structured error, no crash),
  `test_color_range_selects_noncontiguous_globally` (both regions selected — the wand contrast),
  `test_color_range_reevaluates_per_frame` (frame N vs N+1 with moved color patch → matte follows:
  **the temporal/delete-throughout proof**), `test_color_range_softness_ramp_monotonic`,
  `test_color_range_1080p_under_4ms_or_degrades` (median-of-20; or half-res branch test-asserted),
  `test_bitmap_sidecar_path_validated` (**negative**: traversal path rejected). Frontend: `wand click
  sends sample command with frame coords`, `eyedropper sets color range node params`. **Integration
  (named):** `test_color_range_delete_removes_color_across_frames` — sidecar render of 3 different
  frame indices with the same color_range node + deleteInside → target color absent (pixel probes) in
  all 3 outputs.
- **ACCEPTANCE GATES (quantified):** contiguity + globality proofs green; per-frame re-eval proven on
  ≥3 frame indices; color_range eval ≤ 4 ms @1080p (or degrade branch asserted) with ms pasted; all
  named + integration green; suites ≥ baseline.
- **Failure modes:** floodFill on RGBA (pass RGB slice — wrong-channel test caught by exact-color
  test); tolerance in different color spaces between wand and color_range (document: both RGB
  euclidean; one shared helper); sidecar PNG orphaned on node delete (delete action removes file —
  assert in store test).
- **CU VISUAL GATE:** eyedrop a color present at multiple disconnected spots, apply color-range +
  delete-inside, scrub 2 seconds, screenshots `masking/<date>/mk6-colorrange-f0.png` + `-f60.png` —
  **pass: the picked color is absent at BOTH frame positions (the delete-throughout proof), other
  colors untouched.**
- **ROLLBACK:** revert PR. · **EVIDENCE:** tests, 3-frame probe output, CU gate screenshots (runtime
  path), PR URL.

---

## MK.7 — Matte ops surfaced: invert / feather / grow-shrink / boolean editing UI

- **ID:** MK.7 · **Branch:** `feat/mk7-matte-ops-ui` · **Base:** `origin/main` · **Depends-on:** MK.4
  (stack exists in UI); MK.1 (the math already ships there — this packet is the editing surface +
  the kernels' quality pass)
- **Model:** Sonnet · **Est:** ~3h
- **Goal:** The clip's mask stack is editable: per-node invert toggle, feather slider (px), grow/shrink
  slider (px), boolean op selector (add/subtract/intersect), node reorder + delete, enable/disable.
  Stack panel lives beside the device chain (clip-selected inspector surface; minimal — MK.13 polishes).
- **PRECONDITIONS:** `git grep -n "addMatteNode" origin/main -- frontend/src/renderer/stores/ || { echo "STOP: MK.4 actions missing"; exit 1; }`
- **Scope:** NEW `frontend/src/renderer/components/masking/MaskStackPanel.tsx` (BEM, surface-3 cards,
  lowercase mono labels per DESIGN-SPEC §8) · store: `reorderMatteNode`, `toggleMatteNode` (undoable) ·
  backend: none (MK.1 kernels) · tests.
- **DO-NOT-TOUCH:** `global.css` grid rows (`feedback_test-layout-changes.md` — panel mounts inside an
  existing region), backend masking modules.
- **TEST PLAN:** `cd frontend && npx --no vitest run` — named: `feather slider clamps to 0..100`,
  `grow shrink clamps to -50..50` (**negative** boundary pair), `boolean op change re-renders preview`
  (mock IPC: payload re-sent), `node reorder changes stack fold order` (store-level order assertion),
  `disable node excludes it from payload`, `delete node removes sidecar bitmap reference`.
  **Integration (named):** `stack edit round trip: reorder plus invert survives save reload and
  payload reflects both` — edit → persistence round-trip → render payload assertion in one test.
- **ACCEPTANCE GATES (quantified):** clamp boundaries exact (0/100/−50/50 + out-of-range inputs); 6
  named + integration green; suite ≥ baseline; panel renders ≤ 8 nodes without overflow (cap from
  MK.1).
- **Failure modes:** slider spam re-rendering per pixel of drag (debounce to pointer-up commit +
  optimistic local preview — note pattern in PR); reorder breaking undo coalescing (one undo entry
  per gesture asserted).
- **CU VISUAL GATE:** on a hard-edged rect matte with a routed effect, drag feather 0 → 40px,
  screenshots `masking/<date>/mk7-feather-0.png` + `-40.png` — **pass: the effect boundary is hard in
  the first and visibly soft/gradual in the second; the stack panel shows the node with feather 40.**
- **ROLLBACK:** revert PR. · **EVIDENCE:** tests + CU gate screenshots (runtime path), PR URL.

---

## MK.8 — Chroma + luma key as procedural mattes, spill suppression, key params as LANES (day one)

- **ID:** MK.8 · **Branch:** `feat/mk8-key-mattes-lanes` · **Base:** `origin/main` · **Depends-on:**
  MK.1 (kind registry); MK.7 helpful for UI but not required
- **Model:** Opus (touches shipped effects + the modulation seam) · **Est:** ~4h
- **Goal:** (a) NEW shared `backend/src/masking/key_kernels.py` — chroma (HSV target/tolerance/
  softness) **+ spill suppression**, luma (threshold/softness/mode); registered as `chroma_key` /
  `luma_key` procedural matte evaluators. (b) The existing `fx.chroma_key`/`fx.luma_key` effects
  **refactor to call the same kernels** (no parallel math — single source of truth; GT-3/§13-5).
  (c) **Keying-as-performance:** key node params are lane-addressable synthetic targets
  `mask.<node_id>.<param>` riding the F-0516-9 `_mix` mechanism — sidechain/LFO/beat-gate a key live.
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  cd ~/Development/entropic-v2challenger && git fetch origin
  git grep -n "EFFECT_ID = \"fx.chroma_key\"" origin/main -- backend/src/effects/fx/chroma_key.py || { echo "STOP: key effect moved"; exit 1; }
  git grep -n "_mix" origin/main -- frontend/src/renderer/components/operators/ModulationMatrix.tsx | head -1 || { echo "STOP: F-0516-9 synthetic-target precedent missing"; exit 1; }
  git grep -n "registry" origin/main -- backend/src/masking/stack.py || { echo "STOP: MK.1 kind registry missing"; exit 1; }
  ```
- **Scope:** NEW `backend/src/masking/key_kernels.py` (pure, finite-guarded; spill: desaturate toward
  luma within `spill` radius of key hue, [0,1] strength) · `effects/fx/chroma_key.py` +
  `effects/fx/luma_key.py` refactored to consume kernels (PARAMS unchanged + new `spill` param on
  chroma, default 0 = legacy behavior) · `stack.py` evaluator registration (procedural; counts toward
  `MAX_PROCEDURAL_MATTES_PER_RENDER`) · frontend: `ModulationMatrix.tsx` prepends `mask.<node_id>.
  <param>` synthetic targets for key nodes on the selected clip (mirror the `_mix` block at :20–31) ·
  render payload carries per-frame resolved key params (the lane-modulated values) ·
  NEW `backend/tests/test_masking/test_key_kernels.py` + Vitest.
- **DO-NOT-TOUCH:** key effects' PARAMS defaults/ranges (back-compat: projects with the old effects
  render identically at spill=0 — regression-pinned), `container.py`, `modulation/engine.py` internals
  (consume `automation_overrides` flow as-is).
- **TEST PLAN:**
  ```bash
  cd backend && python -m pytest tests/test_masking/test_key_kernels.py tests/ -k "chroma or luma" -x --tb=short && python -m pytest -x -n auto --tb=short
  cd ../frontend && npx --no vitest run
  ```
  Named: `test_chroma_kernel_keys_target_hue_within_tolerance`,
  `test_spill_zero_matches_legacy_effect_output` (**THE back-compat golden**: refactored fx.chroma_key
  at spill=0 byte-equals pre-refactor captured output on a green-screen fixture),
  `test_spill_suppression_desaturates_edge_fringe` (green fringe pixel saturation strictly decreases),
  `test_luma_kernel_dark_and_bright_modes`, `test_key_params_nan_clamped` (**negative**),
  `test_fifth_procedural_matte_rejected` (**negative** — cap from MK.1, structured error),
  `test_wraparound_hue_tolerance` (hue 350±30 keys 0–20 — the modulo seam),
  `test_key_eval_1080p_under_4ms_or_halfres_degrade` (class C contract). Frontend: `key node params
  appear as modulation targets`, `modulated tolerance rides render payload per frame` (mock IPC two
  frames, different values). **Integration (named):** `test_lfo_on_key_tolerance_changes_matte_over_time`
  — sidecar: same frame index rendered with two payload tolerance values (simulating lane output) →
  matte coverage differs monotonically with tolerance (the keying-as-performance proof at this layer;
  full UI→lane→render E2E rides MK.11).
- **ACCEPTANCE GATES (quantified):** spill=0 golden byte-equal; 8 backend + 2 frontend named +
  integration green; key eval ms pasted (≤ 4 ms or degrade asserted); full suites ≥ baseline; zero
  diff on key-effect PARAMS ranges.
- **Failure modes:** kernel refactor drifting the legacy effects (the spill=0 golden is the catch);
  synthetic-target id collisions with `_mix` (namespace prefix `mask.` + a collision test in the
  Vitest); per-frame param resolution bypassing the trust boundary (every payload value clamps —
  NaN negative covers).
- **CU VISUAL GATE:** add a chroma-key matte node on green-screen footage with spill at 0 then 0.8,
  screenshots `masking/<date>/mk8-key-nospill.png` + `-spill.png` — **pass: subject isolated in both;
  green edge fringe visibly reduced in the spill screenshot; the key node's params appear in the
  modulation target list (screenshot of the picker `mk8-lane-targets.png`).**
- **ROLLBACK:** revert PR — effects return to inline math; matte kinds unregister (stack.py raises
  NotImplementedError for chroma/luma nodes again, render skips with warning per MK.3 semantics).
- **EVIDENCE:** golden output, spill before/after PNG, CU gate screenshots, monotonic-coverage table,
  PR URL.

---

## MK.9 — Cut / copy region to new track (absorbs PD.6 / task #45b)

- **ID:** MK.9 · **Branch:** `feat/mk9-cut-copy-to-track` · **Base:** `origin/main` · **Depends-on:**
  MK.4 (selection exists) + MK.2 (the hole is transparent) + MK.3 (maskRef on clips). Queues behind
  in-flight zmq packets if it adds IPC (it shouldn't — refs only).
- **Model:** Opus (render-path correctness — PD.6's tier, inherited) · **Est:** ~4h
- **Goal:** With a selection: **Copy to New Track** = duplicate clip on a new track above, carrying
  the matte as delete-outside (only the region shows); **Cut to New Track** = same + original gains
  the inverse (delete-inside) — the region visually "lifts" to its own layer with its own chain.
  One undo entry each. Internal only (no system clipboard, PD.6 v1 scope inherited).
- **PRECONDITIONS:**
  ```bash
  cd ~/Development/entropic-v2challenger && git fetch origin
  git grep -n "maskStack" origin/main -- frontend/src/shared/types.ts || { echo "STOP: MK.1 missing"; exit 1; }
  git grep -n "addTrack" origin/main -- frontend/src/renderer/stores/timeline.ts | head -1 || { echo "STOP: addTrack moved"; exit 1; }
  git grep -n "mask_ref\|chain_mask" origin/main -- backend/src/zmq_server.py | head -1 || { echo "STOP: MK.3 plumbing missing"; exit 1; }
  ```
- **Scope:** `stores/timeline.ts` — `cutRegionToTrack(clipId)` / `copyRegionToTrack(clipId)` composing
  existing `addTrack` + clip duplication + maskStack assignment, each ONE `undoable()` transaction ·
  context-menu + `Cmd+J` (copy to new track) / `Cmd+Shift+J` (cut to new track) entries — bindings
  per `MASKING-INTERACTIONS.md` §4/§8, both unbound @ 95e9b1b (NOT ⌘⇧C/⌘⇧X: `Cmd+Shift+C` is
  automation copy; re-run the collision check at pickup, record in PR) · tests.
  Backend: none (MK.2/MK.3 already render it).
- **DO-NOT-TOUCH:** `removeClip`/`moveClip` contracts (compose, never modify — UE.2 precedent),
  `MAX_COMPOSITE_LAYERS` (50; a cut adds 1 layer — guard: refuse at 50 with toast), export.
- **Steps:** (1) store actions (one `undoable()` txn each) → (2) context-menu + `Cmd+J`/`Cmd+Shift+J`
  entries → (3) layer-cap guard + toasts → (4) tests + sidecar golden.
- **TEST PLAN:** `cd frontend && npx --no vitest run src/__tests__/stores/` — named: `cut region
  creates masked clip on new track and inverse on original`, `copy region leaves original untouched`,
  `cut is one undo entry restoring both clips` (HistoryPanel row count = 1, undo → deep-equal
  pre-state), `cut with no selection is a no-op toast` (**negative**), `cut at composite layer cap
  refused with toast` (**negative** — 50-layer fixture), `shortcut collision check recorded`.
  **Integration (full chain, named):** `test_cut_region_renders_region_on_top_layer_and_hole_below` —
  sidecar golden-frame: post-cut two-layer payload → region pixels from the top layer's chain, hole in
  the original shows whatever is below (oracle-pattern tolerance, cite the suite's threshold).
- **ACCEPTANCE GATES (quantified):** exactly 1 undo entry per op; layer-cap negative green;
  golden-frame diff ≤ oracle tolerance (cited); all 6 named + integration green; suites ≥ baseline.
- **Failure modes:** inverse matte and copy matte sharing one node object (mutation aliasing — undo
  test catches via deep-equal); new track inheriting the source chain unintentionally (decide + pin:
  new track starts with EMPTY chain, the point is independent processing — asserted); stale selection
  after source clip deleted (no-op toast negative inherited from PD.6).
- **CU VISUAL GATE:** marquee a region, Cut to New Track, add a visible effect to the NEW track's
  chain, screenshot `masking/<date>/mk9-cut-to-track.png` — **pass: a new track row exists in the
  timeline; the effect renders only within the lifted region; the original's hole shows the layer
  below / backdrop.**
- **ROLLBACK:** revert PR. · **EVIDENCE:** tests, golden output, CU gate screenshot (runtime path),
  PR URL. **PR body marks PD.6 superseded.**

---

## MK.10 — Alpha decode + export round-trip (ProRes 4444; WebM/VP9 optional)

- **ID:** MK.10 · **Branch:** `feat/mk10-alpha-export` · **Base:** `origin/main` · **Depends-on:** MK.2
  (composited alpha is real)
- **Model:** Sonnet · **Est:** ~3h
- **Goal:** Close GT-4/GT-5: `VideoWriter` stops destroying alpha for alpha-capable codecs; decode
  alpha preservation gets verification tests; the workstream's signature integration proof lands —
  **keyed clip → export ProRes 4444 → reimport → alpha intact**. WebM/VP9-alpha registry entry
  included IF open-decision §14-3 is YES at pickup (one conditional scope row, say which in the PR).
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  cd ~/Development/entropic-v2challenger && git fetch origin
  git grep -n 'frame_rgba\[:, :, :3\], format="rgb24"' origin/main -- backend/src/video/writer.py || { echo "STOP: writer slice moved — re-locate before fixing"; exit 1; }
  git grep -n '"pix_fmt": "yuva444p10le"' origin/main -- backend/src/engine/codecs.py || { echo "STOP: prores_4444 entry changed"; exit 1; }
  python3 -c "import av; av.CodecContext.create('prores_ks','w')" 2>/dev/null && echo OK-prores || { echo "STOP: prores_ks unavailable in local PyAV"; exit 1; }
  ```
- **Scope:** `backend/src/video/writer.py` — pix_fmt-aware `write_frame`: alpha-capable target
  (`'a' in pix_fmt` per the registry entry) → `from_ndarray(frame_rgba, format="rgba")` and let PyAV
  reformat; RGB targets keep the existing slice **byte-identically** · `backend/src/engine/codecs.py`
  — optional `webm_vp9_alpha` entry (`libvpx-vp9`, `yuva420p`) behind `validate_codec_availability` ·
  decode verification tests (no reader code change expected — GT-5) · NEW
  `backend/tests/test_alpha_roundtrip.py` + a small committed ProRes 4444 fixture (≤ 1 MB, generated
  by a committed script for reproducibility).
- **DO-NOT-TOUCH:** export job-queue logic, determinism seed plumbing (#160), `encode_mjpeg` (preview
  stays RGB by design — MK.2 flatten), audio/gif export modules.
- **TEST PLAN:**
  ```bash
  cd backend && python -m pytest tests/test_alpha_roundtrip.py -x --tb=short && python -m pytest -x -n auto --tb=short
  ```
  Named: `test_decode_preserves_nonuniform_alpha_plane` (4444 fixture → alpha plane variance > 0,
  exact probe pixels), `test_decode_opaque_source_alpha_255` (h264 fixture → alpha ≡ 255),
  `test_writer_rgb_codecs_byte_identical_to_legacy` (**negative/no-regression**: h264 export of a
  fixture hashes equal before/after this PR), `test_export_prores4444_carries_alpha` (encode → probe
  the muxed file's pix_fmt + decode-back alpha variance), `test_export_rgb_codec_with_transparent_frame_flattens_not_crashes`
  (**negative**: transparent content → opaque output, no exception),
  **`test_keyed_clip_alpha_roundtrip` (THE integration test, full chain):** synth clip → chain with
  `fx.luma_key` → composite → export prores_4444 → reimport via `VideoReader` → alpha plane mean |Δ| ≤
  2/255 AND SSIM ≥ 0.97 vs the pre-export composite alpha on ≥3 sampled frames (SPEC §11 gate) ·
  (conditional) `test_webm_vp9_alpha_roundtrip_or_skipped_with_reason`.
- **ACCEPTANCE GATES (quantified):** round-trip gate numbers pasted (mean Δ, SSIM per sampled frame);
  RGB-codec byte-identity green; full backend green ≥ baseline; fixture + generator script committed;
  export throughput on the fixture not silently > 2× slower than baseline (PERF-MODEL §1.2 — number
  pasted).
- **Failure modes:** PyAV silently dropping alpha in rgba→yuva reformat on some versions (the probe
  test catches; if it fails, reformat explicitly via `frame.reformat(format=pix_fmt)` before encode);
  10-bit quantization pushing SSIM under gate (sample frames chosen with soft edges deliberately —
  if genuinely < 0.97, report numbers and STOP, don't loosen the gate unilaterally).
- **CU VISUAL GATE (the J5 verification step — the code-side SSIM gate's CU twin):** export the keyed
  clip as ProRes 4444 via the UI, then open the exported file in **QuickTime Player via CU**
  (Finder/`open` is a read-level op; QuickTime is full tier), screenshot
  `masking/<date>/mk10-quicktime-alpha.png` — **pass: QuickTime renders the keyed region as
  transparent (its own backdrop shows through), not green/black-filled.**
- **ROLLBACK:** revert PR — writer returns to rgb24-only; no schema impact.
- **EVIDENCE:** round-trip numbers table, `ffprobe`-style pix_fmt printout of the exported file, CU
  gate screenshot, test output, PR URL.

---

## MK.CU — Masking CU regression suite (Phase A exit gate; reruns at Phase B exit)

- **ID:** MK.CU · **Branch:** `docs/mk-cu-journey-suite` · **Base:** `origin/main` · **Depends-on:**
  MK.1–MK.10 merged (Phase A complete) — this packet IS the Phase A exit artifact
- **Model:** Sonnet (authoring + one full execution run) · **Est:** ~4h
- **Goal:** The J1–J5 masking journeys from **`docs/roadmap/MASKING-INTERACTIONS.md` §0** (authored
  concurrently by another agent — **reference that file for the step definitions, never duplicate
  them here**; if it is absent at pickup → STOP and report, do not invent journeys) become a
  repeatable computer-use regression suite, executed once as this packet's evidence and re-runnable
  at Phase B exit and in the campaign rule-9 live smoke.
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  cd ~/Development/entropic-v2challenger && git fetch origin
  test -f docs/roadmap/MASKING-INTERACTIONS.md || { echo "STOP: journey source doc not on main — coordinate with its author"; exit 1; }
  grep -q "J5" docs/roadmap/MASKING-INTERACTIONS.md || { echo "STOP: J1–J5 section missing from the interactions doc"; exit 1; }
  git grep -n "MaskSelectOverlay" origin/main -- frontend/src/renderer/components/preview/ || { echo "STOP: Phase A not merged"; exit 1; }
  ```
- **Scope:** NEW `docs/roadmap/specs/masking-cu-suite.md` — the runbook: (1) launch per repo CLAUDE.md
  (`cd frontend && npm start`) + Gate 18 runtime-path check; (2) CU access request (**Electron, full
  tier**) per memory `visual-uat-entropic.md` (launch + access mechanics live there — cite, don't
  restate); (3) per journey J1–J5: a pointer to its MASKING-INTERACTIONS.md §0 step list,
  **element-anchored** CU steps (anchor on labels/roles/visible text — never raw coordinates),
  screenshot checkpoints named `masking/<date>/<journey>-<step>.png`, and a per-journey **pass
  criterion judgeable from the screenshots alone** (J5's criterion = MK.10's QuickTime alpha check);
  (4) failure protocol: any journey FAIL → file finding, bisect the merged MK packets, fix-or-revert
  before Phase B dispatches (campaign rule-9 reaction, inherited).
- **DO-NOT-TOUCH:** application code (this is a docs + execution packet; zero `src/` diff),
  MASKING-INTERACTIONS.md itself (other agent's file — propose edits via its PR, never edit here).
- **TEST PLAN / EXECUTION:** run the full suite once against merged Phase A main: all 5 journeys,
  every checkpoint screenshot captured and named per convention. **Negative check (named):** J-NEG —
  attempt a masking interaction that must NOT work (e.g. a 9th matte node, or delete-inside with no
  selection) and screenshot the refusing toast — proves the suite can detect failure states, not just
  rubber-stamp (`feedback_dont-claim-untested-coverage.md` discipline).
- **ACCEPTANCE GATES (quantified):** 5/5 journeys PASS with every checkpoint screenshot present under
  `masking/<date>/` (count the files, paste the `ls`); J-NEG captured; the runbook's rerun command
  sequence reproduces the run without improvisation; runtime path named (Gate 18); suite wall-time
  ≤ 30 min (it must stay cheap enough to rerun at Phase B exit + live smokes).
- **Failure modes:** journeys drift as UI evolves (element-anchored steps mitigate; raw coordinates
  are FORBIDDEN — review checklist item); interactions doc revs mid-packet (pin the §0 revision SHA
  in the runbook header); CU access not granted (the suite documents the request step; if the user
  declines, the packet STOPs — CU is the gate, `feedback_computer-use-as-acceptance-gate.md`).
- **ROLLBACK:** revert PR (docs + screenshots only).
- **EVIDENCE:** the runbook, the full screenshot set `ls -la`, per-journey verdict table, runtime
  path, PR URL.

---

## MK.11 — Phase B: mask params as lanes (all ops) + matte-as-mod-source + keyframed matte transforms

- **ID:** MK.11 · **Branch:** `feat/mk11-mask-lanes-modsource` · **Base:** `origin/main` ·
  **Depends-on:** MK.7 + MK.8 merged. **Mod-source half HARD-GATED on SG-5 merged** (`git grep -q
  "break_cycles" origin/main -- backend/src/modulation/ || defer that half` — same gate as T3.11; if
  SG-5 absent at pickup, ship the lanes + keyframes halves and file the mod-source as MK.11b, saying
  so in the PR).
- **Model:** Opus (modulation-graph surface) · **Est:** ~4h
- **Goal:** (a) ALL matte node params (feather, growShrink, transform x/y/scale, color-range
  tolerance/softness) become lane targets via the MK.8 `mask.<node_id>.<param>` mechanism. (b)
  `mask_coverage(node_id)` mod SOURCE: mean of the resolved matte on a 64×64 proxy, previous-frame
  value (single-tick delay — T3.11 contract verbatim). (c) Keyframed matte transforms: `transform`
  T/Y/X/scale interpolation between keyframes (static shapes move/scale over time; **shape morphing
  stays out** — spike MK.14 adjacency).
- **PRECONDITIONS:** MK.7/MK.8 greps (`MaskStackPanel`, `key_kernels`) + the SG-5 gate above; `git
  grep -n "render_tap" origin/main -- backend/src | head -1` (if T3.11 landed, REGISTER mask_coverage
  in its registry instead of a parallel one — read it first, evolve in place).
- **Scope:** `ModulationMatrix.tsx` target prepend extended to all node params · backend per-frame
  param resolution (the MK.8 payload path generalized) · NEW `backend/src/masking/coverage_tap.py`
  (or a T3.11-registry entry) · `stack.py` transform interpolation (lerp x/y/scale at frame t between
  keyframe dicts; cache key includes interpolated transform quantized to 1e-3 — bounded cache churn) ·
  Vitest + pytest.
- **DO-NOT-TOUCH:** `sample_lane` internals (hot path), SG-5 module, MK.8's spill=0 golden behavior.
- **TEST PLAN:** named: `test_feather_lane_value_rides_payload_per_frame`,
  `test_transform_lerp_midpoint_exact` (kf at t=0 x=0, t=2 x=100 → t=1 x=50),
  `test_transform_cache_quantization_bounds_entries` (animated transform over 300 frames → cache
  entries ≤ 32 — the churn guard), `test_coverage_tap_reads_previous_frame` (frame N returns N−1's
  coverage; frame 0 → 0.0), `test_coverage_proxy_under_1ms`, `test_coverage_feedback_cycle_raises_or_breaks_per_sg5`
  (**negative**: coverage → param feeding the same matte → SG-5 path exercised, never a hang),
  `test_lane_nan_to_mask_param_clamped` (**negative**). **Integration (named, full chain):**
  `lfo on feather animates matte over rendered frames end-to-end` — E2E or sidecar-level: lane on
  `mask.<id>.feather` → 3 frame renders → matte edge width strictly ordered with the LFO phase.
- **ACCEPTANCE GATES (quantified):** lerp exact; cache ≤ 32 entries under animation; tap < 1 ms;
  cycle negative green; integration ordering proven on 3 frames; suites ≥ baseline.
- **Failure modes:** transform-animated static mattes thrashing the LRU (quantization test is the
  catch); coverage tap reading the CURRENT frame (single-tick test); double registry if T3.11 landed
  mid-flight (precondition + evolve-in-place rule).
- **CU VISUAL GATE:** route an LFO to `mask.<id>.feather`, press play, screenshots at two playhead
  positions `masking/<date>/mk11-lfo-feather-a.png` + `-b.png` — **pass: the matte edge softness
  visibly differs between the two screenshots while the underlying frame content is comparable (the
  keying-as-performance proof, judgeable by eye).**
- **ROLLBACK:** revert PR — lanes/tap additive; transforms degrade to static (first keyframe).
- **EVIDENCE:** ordering table, cache stats under animation, CU gate screenshots, tests, PR URL.

---

## MK.12 — Subject/background dual-chain routing via local RVM (figure-isolator port)

- **ID:** MK.12 · **Branch:** `feat/mk12-rvm-split-by-matte` · **Base:** `origin/main` ·
  **Depends-on:** MK.1 + MK.3 (+ MK.2 merged in practice). Promoted from spike per directive.
  Queues behind in-flight zmq packets (new job IPC).
- **Model:** Opus (new heavy dependency + job lifecycle) · **Est:** ~4h (port only; tuning excluded)
- **Goal:** (a) Port `~/Development/figure-isolator/backends/rvm_local.py` (RVM resnet50, CPU,
  `output_format="alpha"`) into the sidecar as an **offline matte-generation job**: clip → grayscale
  matte video cached at `~/.creatrix/mattes/<content_hash>.mp4` → `ai_matte` MatteNode (procedural:
  per-frame lookup via the SG-7-wrapped `VideoReader`). (b) **"Split by matte"** command: one click →
  twin track (same source), `maskRef` on one, inverted on the other → figure chain + background chain
  (SPEC §4.2 — zero new engine machinery). **Cloud BiRefNet explicitly OUT** (user-touch, SPEC §14-2).
- **PRECONDITIONS (mismatch → STOP):**
  ```bash
  cd ~/Development/entropic-v2challenger && git fetch origin
  test -f ~/Development/figure-isolator/backends/rvm_local.py || { echo "STOP: port source missing"; exit 1; }
  python3 -c "import torch" 2>/dev/null && echo torch-present || echo "NOTE: torch absent — optional extra [masking-ai] installs it; job refuses with actionable error when missing"
  test -f ~/.cache/torch/hub/checkpoints/rvm_resnet50.pth && echo weights-cached || echo "NOTE: first run downloads 103MB — job must surface progress"
  git grep -n "class ExportJob\|ExportStatus" origin/main -- backend/src/engine/export.py | head -2 || { echo "STOP: job-pattern source moved"; exit 1; }
  ```
- **Scope:** NEW `backend/src/masking/ai_matte.py` (RVM runner adapted: torch import-guarded
  (`rvm_available() -> bool`, the P6.4 MLX pattern), `downsample_ratio=0.25`, `max_dimension=1080`
  default; writes the matte video; **memory guard:** refuse start if SG-8 headroom < 2 GiB) ·
  `pyproject.toml` optional extra `masking-ai = ["torch>=2.10"]` · `zmq_server.py` cmds
  `mask_ai_generate` (async job, progress events via the export-job pattern — read `export.py`
  first, mirror, never fork), `mask_ai_status`, `mask_ai_cancel` · `ai_matte` evaluator in `stack.py`
  registry (frame lookup, wrap-clamp out-of-range, flat-0.5 fallback on missing file — P6.3
  convention) · frontend: clip context-menu "Generate AI matte (local)…" + progress toast + **"Split
  by matte"** action (`stores/timeline.ts`, one undo entry) · tests.
- **DO-NOT-TOUCH:** decode internals (only the SG-7-wrapped reader), export job queue itself (mirror
  the pattern in a separate job class), cloud/fal.ai code paths (do not port `fal_birefnet.py`).
- **TEST PLAN:**
  ```bash
  cd backend && python -m pytest tests/test_masking/test_ai_matte.py -x --tb=short && python -m pytest -x -n auto --tb=short
  cd ../frontend && npx --no vitest run
  ```
  Named: `test_rvm_unavailable_returns_actionable_error` (**negative**: no torch → structured error
  naming the extra, no traceback), `test_job_cancel_mid_run_leaves_no_partial_cache_file`
  (**negative**: cancel → temp file removed), `test_matte_video_cache_keyed_by_content_hash` (same
  clip twice → second is cache-hit, no rerun), `test_ai_matte_node_resolves_per_frame`,
  `test_missing_matte_file_flat_field_fallback_and_warns` (**negative**),
  `test_headroom_guard_refuses_under_2gib` (**negative**: mocked SG-8 → refusal),
  `test_split_by_matte_creates_twin_with_inverted_ref` (store), `test_split_is_one_undo_entry`.
  **Real-model smoke (dev machine, not CI):** 2-second 480p fixture through actual RVM — wall time
  and a matte PNG pasted as evidence (CI runs the mocked-model tests only — say so in the PR).
  **Integration (named, full chain):** `test_split_by_matte_renders_independent_chains` — sidecar:
  twin-track payload with a synthetic matte video, glitch chain on background track only → figure
  pixels byte-stable vs unsplit render, background pixels changed (the music-video proof).
- **ACCEPTANCE GATES (quantified):** all 8 named + integration green; mocked-CI suite green ≥
  baseline; real-model smoke evidence attached (≤ 60 s for the 2 s/480p fixture, matte visually
  plausible); cache-hit proven (0 reruns); zero torch import at sidecar startup when extra absent
  (`python -c "import zmq_server"` clean — import-guard proof).
- **Failure modes:** torch import at module top crashing torch-less installs (the import-guard test);
  RVM recurrent state misuse across chunks (port the `rec` state loop faithfully — fidelity diff vs
  figure-isolator output on the fixture, pasted); 4K source OOM (max_dimension cap + headroom guard);
  job blocking the render loop (job runs on the export-pattern worker thread — heartbeat stays < 1 s,
  asserted in the job test).
- **CU VISUAL GATE:** on a person-containing clip: Generate AI matte (local) → Split by matte → add a
  heavy glitch chain to the background twin, screenshot `masking/<date>/mk12-split-by-matte.png` —
  **pass: the figure is clean and the background is glitched in one frame (the music-video shot); two
  tracks visible in the timeline.**
- **ROLLBACK:** revert PR — `ai_matte` nodes degrade to flat-0.5 + warning (MK.3 skip semantics);
  cached matte videos are inert files.
- **EVIDENCE:** matte PNG, wall-time, independent-chains probe output, import-guard proof, CU gate
  screenshot, PR URL.

---

## MK.13 — Tool-mode stack in PR-A's tool tab + marching-ants overlay + mask chips

- **ID:** MK.13 · **Branch:** `feat/mk13-mask-tool-ui` · **Base:** `origin/main` · **Depends-on:**
  PR-A **P3.2 merged** (tool tab exists — hard gate) + MK.4/5/6 (tools exist to surface)
- **Model:** Sonnet · **Est:** ~4h
- **Goal:** The masking UX graduates from PreviewControls toggles to the real instrument surface:
  tool modes (marquee/ellipse/lasso/polygon/wand/key-picker) in the P3.2 tool tab + statusbar chip;
  marching-ants overlay (decimated ≤ 256-vertex outline, dashed 1px MOD violet,
  `stroke-dashoffset` animation, `prefers-reduced-motion` honored); 64×36 matte thumbnail chips on
  masked DeviceCards; mask-stack badge on clip headers. DESIGN-SPEC voice throughout.
- **PRECONDITIONS:**
  ```bash
  cd ~/Development/entropic-v2challenger && git fetch origin
  git grep -n "tool" origin/main -- frontend/src/renderer/components/effects/EffectBrowser.tsx | head -2 || { echo "STOP: P3.2 tool tab not merged — packet gated"; exit 1; }
  git grep -n "MaskSelectOverlay" origin/main -- frontend/src/renderer/components/preview/ || { echo "STOP: MK.4 missing"; exit 1; }
  ```
- **Scope:** tool registrations in the P3.2 cursor-mode stack (follow its `isTextInputActive` guard
  verbatim) · `MaskSelectOverlay.tsx` marching-ants SVG layer (RDP decimation reused from MK.5;
  compositor-only animation) · `DeviceCard.tsx` matte chip (thumbnail from a backend
  `mask_thumbnail` reply — 64×36 proxy, cached, MOD tick) · clip-header badge · CSS in the masking
  BEM namespace (no `global.css` grid edits) · tests.
- **DO-NOT-TOUCH:** P3.2's drag-payload/nonce machinery, `EffectBrowser.tsx` beyond tool-tab entries
  (in-place rule, verbatim: *Modify EffectBrowser.tsx and existing components IN PLACE. Creating a
  new parallel shell/browser/panel component is an automatic FAIL (PR #154 precedent).*)
- **TEST PLAN:** `cd frontend && npx --no vitest run` — named: `tool tab lists six mask tools`,
  `selecting mask tool sets cursor mode and statusbar chip`, `ants polyline capped at 256 vertices`,
  `reduced motion disables ants animation` (**negative**), `bare-letter tool hotkey suppressed while
  input focused` (**negative** — P3.2 guard inherited), `masked device renders matte chip`,
  `unmasked device renders no chip` (**negative**). **Integration (named):** `tool selection to
  committed node via tool tab end-to-end` — select lasso in the tab → pointer sequence on preview →
  node in store → chip appears, one test.
- **ACCEPTANCE GATES (quantified):** 7 named + integration green; suite ≥ baseline; ants overlay adds
- **Mode banner (DESIGN-SPEC §10.2) renders within 120ms of tool activation, swaps hints mid-gesture, names the next Escape level — HARD GATE per MASKING-INTERACTIONS §14.9; statusbar-chip-only = FAIL.**
  < 8 ms to pointer-move handlers (PERF-MODEL §1.2 UI rule — perf test, P3.4 pattern); contrast of
  MOD ants on preview surround ≥ 3:1 (computed, DESIGN-SPEC §9 method).
- **Failure modes:** SVG ants layer stealing pointer events from the canvas (`pointer-events: none`
  on the ants layer — `feedback_svg-zorder-hooks.md`); thumbnail IPC storm on parameter drag
  (thumbnail refreshes on commit only — asserted via mock-IPC call count).
- **CU VISUAL GATE:** open the tool tab, select lasso, draw, screenshot
  `masking/<date>/mk13-tooltab-ants.png` — **pass: marching ants (dashed MOD-violet outline) visible
  on the selection; statusbar chip names the active tool; the masked device shows its matte chip.**
- **ROLLBACK:** revert PR — tools fall back to MK.4's PreviewControls toggles.
- **EVIDENCE:** tests, CU gate screenshot (runtime path), perf number, PR URL.

---

## MK.14 — SPIKE: motion-tracked masks (research, grep-checkable deliverable)

- **ID:** MK.14 · **Branch:** `spike/mk14-motion-tracked-masks` · **Base:** `origin/main` ·
  **Depends-on:** MK.1 (vocabulary) · **Model:** Sonnet · **Est:** ~4h hard cap (spike discipline)
- **Goal:** Answer with evidence, not opinion: can a static matte FOLLOW motion? Candidates to
  evaluate against the same 3 fixtures (talking head / fast pan / occlusion): (a) `cv2.calcOpticalFlowFarneback`
  warp of the matte, (b) sparse LK feature tracking driving the MK.11 transform keyframes, (c) defer
  to RVM-per-frame (MK.12 already solves person-shaped cases). Shape morphing feasibility note rides
  along (SPEC §8's deferred item).
- **Deliverable (the exit-bearing artifact, `feedback_verb-ask-deliverable-is-the-result.md`):**
  `docs/roadmap/specs/masking-motion-track-spike.md` — per-candidate: wall-time @480p, qualitative
  drift frames (PNGs committed beside it), a GO/NO-GO per candidate, and IF GO a draft MK.15 packet
  skeleton. Plus a runnable `backend/scripts/spike_motion_mask.py` (committed, reproducible).
- **PRECONDITIONS:** `test -f docs/roadmap/specs/masking-motion-track-spike.md && { echo "STOP: spike already run"; exit 1; } || echo OK`
- **DO-NOT-TOUCH:** everything under `backend/src/` (spike code lives in `scripts/` only — no
  production seams from a spike).
- **TEST PLAN / ACCEPTANCE (quantified):** the spike doc EXISTS with all 3 candidates × 3 fixtures
  (9 rows, wall-time + verdict each); the script reruns end-to-end via one command (paste it); ≥ 6
  evidence PNGs committed; **negative discipline:** any candidate that fails gets its failure frames
  shown, not omitted (`feedback_silent-exception-swallowing.md`).
- **ROLLBACK:** revert PR (docs + script only). · **EVIDENCE:** the doc itself + PNGs + rerun command
  output, PR URL.

---

## Thickness scorecard (authored 2026-06-12 @ 95e9b1b)

Rubric (EXECUTION-PLAN §1): ① anchors verified · ② full contract + model tier · ③ named behavior
tests + exact commands (+ live-runtime where UI) · ④ quantified gates · ⑤ failure modes + ≥1 negative
· ⑥ full-chain integration test · ⑦ depends-on resolves.

| Packet | ① | ② | ③ | ④ | ⑤ | ⑥ | ⑦ |
|---|---|---|---|---|---|---|---|
| MK.1 model | ✅ greps + SG-8 lib | ✅ Sonnet | ✅ | ✅ caps/ms/% | ✅ 4 negatives | ✅ persistence round trip | ✅ none |
| MK.2 alpha | ✅ :69 9-modes, GT-8 | ✅ Opus+redteam | ✅ | ✅ byte-identity + ms | ✅ NaN-alpha | ✅ chroma-key-visible chain | ✅ none |
| MK.3 routing | ✅ container :58/:130 orphan re-proven | ✅ Opus | ✅ | ✅ degenerate proofs + 1ms | ✅ 2 negatives | ✅ 4-probe sidecar test | ✅ MK.1 |
| MK.4 marquee | ✅ preview components + PD.5 inherit | ✅ Sonnet | ✅ +live | ✅ exact coords ×2 | ✅ 3 negatives | ✅ E2E delete round trip | ✅ MK.1/2 |
| MK.5 lasso | ✅ | ✅ Sonnet | ✅ +live | ✅ 256-cap/2px | ✅ 3 negatives | ✅ pointer→store | ✅ MK.4 |
| MK.6 wand/range | ✅ | ✅ Sonnet | ✅ +live | ✅ 4ms + contiguity | ✅ 3 negatives | ✅ 3-frame delete-throughout | ✅ MK.4 |
| MK.7 ops UI | ✅ | ✅ Sonnet | ✅ +live | ✅ clamp boundaries | ✅ boundary pair | ✅ edit round trip | ✅ MK.4 |
| MK.8 keys+lanes | ✅ fx.chroma_key + F-0516-9 | ✅ Opus | ✅ | ✅ spill-0 golden + 4ms | ✅ 3 negatives | ✅ tolerance-sweep sidecar | ✅ MK.1 |
| MK.9 cut/copy | ✅ addTrack + caps | ✅ Opus (PD.6 tier) | ✅ +live | ✅ 1-undo + oracle tol | ✅ 2 negatives | ✅ golden two-layer | ✅ MK.2/3/4 |
| MK.10 export | ✅ writer :44–46, codecs :34 | ✅ Sonnet | ✅ | ✅ Δ≤2/255 SSIM≥.97 | ✅ 2 negatives | ✅ THE round trip | ✅ MK.2 |
| MK.11 lanes/tap | ✅ T3.11 contract cited | ✅ Opus | ✅ | ✅ lerp/32-entries/1ms | ✅ cycle + NaN | ✅ LFO-feather E2E | ✅ MK.7/8 + SG-5 gate |
| MK.12 RVM split | ✅ rvm_local.py + job pattern | ✅ Opus | ✅ +live | ✅ headroom/60s/0-rerun | ✅ 4 negatives | ✅ independent-chains | ✅ MK.1/3 |
| MK.13 tool UI | ✅ P3.2 anchors | ✅ Sonnet | ✅ +live | ✅ <8ms + 3:1 | ✅ 3 negatives | ✅ tab→node→chip | ✅ P3.2 gate explicit |
| MK.14 spike | ✅ | ✅ Sonnet, capped | ✅ artifact-exit | ✅ 9-row matrix | ✅ show-failures rule | ✅ (artifact IS the proof) | ✅ MK.1 |
| MK.CU suite | ✅ interactions-doc gate | ✅ Sonnet | ✅ CU-native | ✅ 5/5 + file count + ≤30min | ✅ J-NEG refusal proof | ✅ (the journeys ARE the chain) | ✅ MK.1–MK.10 |

Column ③ includes each UI packet's **CU VISUAL GATE** (two-tier policy, header) — screenshots named
`masking/<date>/<packet>-<step>.png`; backend-only packets (MK.1, MK.10's decode half) name their
downstream CU coverage inline.

**Known unfixables / by-design:** MK.11's mod-source half cannot ship before SG-5 (same reason as
T3.11 — feedback edges need deterministic cycle handling); the packet's split rule (MK.11b) keeps the
rest unblocked. MK.13 is gated on PR-A P3.2 which has no merge date — MK.4's PreviewControls toggles
are the deliberate interim so Phase A never waits on PR-A.
