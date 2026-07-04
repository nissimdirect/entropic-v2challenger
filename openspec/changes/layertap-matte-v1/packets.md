# Packets — layertap-matte-v1

**Emitted:** 2026-07-04 by /packetize. **Plan:** `plan.md` (same dir — packets POINT to its
line-anchored normative sections + code ground truths #1-#20; do not re-derive the wire
contracts, formulas, or citations, quote/point instead). **Decisions:** ALL LOCKED —
`proposal.md` "T1 Verdicts" (2026-07-03, SCOPE OVERRIDE: OD-1+OD-3 overridden, full §9
contract — `stage: pre AND post`, full 9-value read taxonomy; OD-2/OD-4/OD-5/OD-6 accepted
as originally written). Do not re-open any OD or the T1 verdict. **Route:** /eng Phase 3M.

**Branching rule (every packet):** cut from `origin/main`, never from a local checkout that
may be owned by a parallel session (check `~/.claude/.locks/` / `git worktree list` first
per Gate 18b). PR-only; squash; no `.github/workflows/**` edits.

**Merge gate (every packet, STRICT FULL-TIER):** full backend pytest (`cd backend && python
-m pytest -x -n auto --tb=short`) + full vitest green (`cd frontend && npx --no vitest run`
— on main-checkout or CI, never a worktree executor) → `Skill(review)` via Skill tool
(ship-gate hook) → preview/export parity check via the single-clip path where the packet
touches `zmq_server.py`/`export.py` (code ground truth #7 — "preview/export parity is a
house landmine, not optional") → full CI green incl. e2e-full + sidecar.

**Pre-flight (all packets):** this change's proposal.md is currently marked "Status:
PLANNING ONLY. No build follows from this change." Packetizing does not lift that gate —
before PK.1 is dispatched, confirm with the user/orchestrator that the PLANNING-ONLY status
has been explicitly lifted for this change. Separately, confirm `wave0-prerouted-presets`
PK.00 (main CI stabilization) has merged and `gh run list --branch main -L 1` shows green —
this change's packets assume a green main baseline for their byte-identical rollback
oracles to mean anything.

**Cross-change constraints checked:** this change touches `backend/src/masking/*`,
`backend/src/zmq_server.py`, `backend/src/engine/export.py`, `backend/src/engine/
compositor.py`, `backend/src/engine/composite_tree.py`, `frontend/src/renderer/App.tsx`,
`frontend/src/renderer/stores/timeline.ts`,
`frontend/src/renderer/stores/aiMatte.ts`, `frontend/src/renderer/components/masking/
MaskStackPanel.tsx`. It does **not** touch `frontend/src/renderer/stores/operators.ts` or
`backend/src/modulation/routing.py` (that is `masking/routing.py` — a different module,
confirmed via code ground truth #4/#7) — the wave0 "rebase after operators.ts/modulation-
routing.py changes merge" constraint does **not** bind these packets. The
browser-folders/multiwindow-stage-a/fx-afterimage∥fx-backspin shared-contract constraints
are likewise inapplicable (disjoint file surface). The one constraint that DOES apply:
**every new numeric param ships curve+unit metadata (live calibration test)** — flagged
explicitly in PK.1 and PK.8 below, since `gain`/`gamma`/`read_params.hue`/`read_params.
softness` are mask-stack node params, not `ParamDef`-registry effect params, and it is
unverified whether the existing `test_numeric_params_have_unit`-class calibration harness
scans mask-stack params at all — PK.1's oracle includes a check for this.

---

### PK.1 — Schema: 9th kind + full param surface + evaluator registration (flat-0.5 stub)
- **Scope:** everything in `plan.md:346-389`. Add `"layer"` to backend
  `_VALID_KINDS` (`masking/schema.py`) and frontend `MatteNodeKind`/`VALID_MATTE_KINDS`; add
  `evaluate_layer_tap` to `masking/stack.py` registered via the existing generic
  `register_evaluator` seam (zero `resolve_stack` dispatch changes, per code ground truth
  #2) — for PK.1 alone this ALWAYS returns flat 0.5 regardless of stage/read (safe-degrade
  stub; PK.2-PK.7 wire the real behavior incrementally). Full T1-scope param validation:
  `track_id` (missing → flat-0.5 at eval time, not a schema rejection), `stage` (both
  `pre`/`post` stored; anything else degrades to `pre`), `read` (all 9 values stored;
  anything else → `luma` + one-time log), `gain` clamp ±4 (reuse `clampGain` from
  `frontend/src/shared/field-param.ts`), `gamma` clamp [0.2, 4] (new helper mirroring
  `clampGain`'s shape), `invert` (bool), `read_params` (object; container-type check +
  NaN/Inf sanitization on numeric leaves only). **`schema.py`'s `_sanitize_params` (`:75-91`)
  has NO existing dict-value handling — per its own comment at `:90` it currently DROPS every
  dict-valued param entirely, so this packet must EXTEND it with a new branch that
  container-type-checks `read_params`, sanitizes numeric leaves (NaN/Inf → 0.0), and drops
  non-numeric/non-string leaves; without this extension a `read_params` value never round-trips
  (silently vanishes on load) even though the oracle below asserts it does.** The frontend
  mirror needs the identical new branch in `validateMatteNode`'s params loop
  (`project-persistence.ts:225-244` — same gap, its own comment at `:243` says "any other type
  → dropped"), and `MatteNode.params`'s type (`types.ts:265`) must widen from `Record<string,
  number | string | number[] | number[][]>` to also admit `Record<string, number | string>` for
  the nested `read_params` shape.
- **Non-scope:** any real (non-stub) read/stage behavior (PK.2-PK.7); any UI (PK.8); the
  calibration-harness question below is investigated, not necessarily fixed, in this packet
  — if it needs a fix, that fix is still in-scope here since it gates PK.1's own oracle.
- **Files (ownership claim — PK.1 only):** `backend/src/masking/schema.py` (`_VALID_KINDS`,
  line ~30-41, AND `_sanitize_params` `:75-91` — new `read_params` dict branch),
  `backend/src/masking/stack.py` (new `evaluate_layer_tap` fn +
  `register_evaluator` call — additive, no edits to existing dispatch code),
  `frontend/src/shared/types.ts:231-239` (`MatteNodeKind`) AND `frontend/src/shared/
  types.ts:265` (`MatteNode.params` type widening), `frontend/src/renderer/
  project-persistence.ts:156-159` (`VALID_MATTE_KINDS`) AND `frontend/src/renderer/
  project-persistence.ts:225-244` (`validateMatteNode`'s sanitize loop — new `read_params`
  dict branch), new `backend/tests/test_masking_layer_tap_schema.py`.
- **Depends:** none — dispatchable now (subject to the Pre-flight check above). **Blocks:**
  PK.2, PK.3 (both need the schema + registered-but-stubbed evaluator to exist first); PK.4-
  PK.8 transitively.
- **Risk:** LOW.
- **Hard oracle:** `MatteNode.from_dict({..., "kind": "layer", "params": {...}})` accepts a
  well-formed node for both `stage` values (new test, must FAIL on pre-packet main since
  `"layer"` is rejected there today per code ground truth #1 — anti-dead-flag proof, capture
  both runs); missing `track_id` still parses (schema-time acceptance, not rejection);
  gain/gamma out-of-range values clamp; unknown `read`/`stage` stored as-is at schema layer
  (evaluator-time degrade, not validator rejection); `read_params` round-trips for both the
  colorkey `{hue, softness}` and ai_person `{matte_path, start_frame}` shapes without
  raising; `resolve_stack([layer_node], ctx, (h,w))` returns flat-0.5 `(h,w)` array without
  raising for every stage/read combination. **Additionally:** run whatever calibration test
  currently backs `test_numeric_params_have_unit` (see `wave0-prerouted-presets/plan.md`
  citation) against a project containing a `'layer'` node's `gain`/`gamma` — record in the
  PR body whether it scans mask-stack params at all; if it does and flags them, add
  unit/curve metadata for `gain` (unit: `"linear"`) and `gamma` (unit: `"gamma"`, curve:
  `"linear"`) to make it pass — do not silently skip a failing calibration check.
- **Test plan:** unit (backend) — `test_masking_layer_tap_schema.py` as above; unit
  (frontend) — `project-persistence.ts` validator round-trip test for the same shapes.
- **Trust-boundary rule:** the REAL production boundary is `MatteNode.from_dict` (called on
  every project load/rehydration, verified via caller grep on `from_dict(` in
  `masking/schema.py` and its callers in `project/schema.py`/persistence path) and frontend
  `project-persistence.ts`'s load-time validator — NOT a standalone deserializer that's
  never invoked from a real load path. Do not add validation anywhere else.
- **STOP:** if `_STATIC_KINDS`/`procedural_count` (`stack.py:74`, `:193-199`) need ANY edit
  to make `'layer'` count against the budget correctly — code ground truth #3 says this
  should be automatic; if it isn't, the ground-truth claim is stale and the plan needs
  re-verification before continuing, not a silent workaround.
- **Executor brief:** Sonnet-tier. Inline verbatim: Core Rule 1 ("Read files before editing —
  never Edit without prior Read"); Gate 6 ("fixing a bug → RUN the failing code first,
  capture the actual error/stack trace... You need the real output" — applies here to
  proving the anti-dead-flag pre/post-change oracle contrast); the Trust-boundary rule
  above. Last line of your final report: `PK.1 done — PR #<n>, oracle evidence: <pytest/
  vitest output paths>, calibration-harness verdict: <scans mask-stack params: yes/no>`.

### PK.2 — Pre-stage cross-layer frame cache + compositor wiring — **RISK: HIGH**
- **Scope:** everything in `plan.md:391-460` plus code ground truth #21's `composite_tree.py`
  wiring. Add the `track_id` wire field to video/text layer serialization (`App.tsx`); build
  the OD-2 pre-pass (decode+transform, NOT device-chain, every layer into
  `pre_frames_by_track_id` before the existing per-layer loop in `_handle_render_composite`);
  wire `ctx.extra['tap_frames_pre']` into `apply_masks_to_chain` calls; flesh out
  `evaluate_layer_tap`'s `stage == 'pre'` branch to a temporary raw-luma read (real read
  taxonomy lands in PK.4); apply the IDENTICAL pre-pass at BOTH export.py composite call sites
  (`:965-967`, `:1138-1140`, `:1731-1733` region) — preview/export parity is not optional (code
  ground truth #7). New/extended tap-cache mechanism reusing `matte_source.py`'s LRU pattern,
  keyed `(track_id, "pre", frame_index)`. **Also thread `extra={'tap_frames_pre':
  pre_frames_by_track_id}` into `composite_tree.py::expand_group_layer`'s `leaf_ctx` (`:243`)
  and `branch_ctx` (`:287-289`) FrameCtx constructions** (code ground truth #21) — these are a
  3rd/4th `apply_masks_to_chain` call site reachable via GROUP-layer (Sample Rack) expansion
  and are otherwise silently unwired, degrading any `'layer'` tap inside a rack leaf/branch
  `mask_stack` to flat 0.5 forever.
- **Non-scope:** `stage: 'post'` (PK.3); any read beyond the temporary raw-luma placeholder
  (PK.4-PK.7); instrument/rack layers as tap sources (explicitly deferred — video/text track
  layers only per plan.md:435-444, not a PRD requirement for v1).
- **Files (ownership claim):** `backend/src/masking/matte_source.py` OR new sibling
  `backend/src/masking/tap_cache.py` (implementer's call per plan.md — must reuse, not
  duplicate, the eviction/budget shape), `backend/src/zmq_server.py` (`_handle_render_
  composite` pre-pass insertion before `:1458`'s loop; single-clip path `:792-819` gets
  empty `extra={}`), `backend/src/engine/export.py` (`_composite_export_frame` +
  2 sibling call sites — all 3 must land together), `backend/src/engine/composite_tree.py`
  (`expand_group_layer`'s `leaf_ctx` `:243` and `branch_ctx` `:287-289` — add
  `extra={'tap_frames_pre': ...}`, code ground truth #21), `backend/src/masking/stack.py`
  (`evaluate_layer_tap`'s `pre` branch), `frontend/src/renderer/App.tsx` (`:1509-1522` video,
  `:1525-1542` text — `track_id` field addition), new/shared
  `backend/tests/test_layer_tap_composite.py`.
- **Depends:** PK.1 (schema + registered stub must exist). **Blocks:** PK.3 (hard — shares
  `ctx.extra`, the tap-cache module, and the `track_id` wire field; PK.3 cannot start its
  dependency-graph work meaningfully before this lands), PK.4/PK.6/PK.7 (need a resolved
  `pre` frame to read from), PK.5's pre-stage cases (post-stage cases wait on PK.3).
- **Risk:** **HIGH** → Opus-tier executor + mandatory `Skill(qa-redteam)` before merge (this
  packet touches the shared `apply_masks_to_chain` seam across BOTH preview and export call
  sites and must preserve the byte-identical rollback guarantee for every project without a
  `'layer'` node — a regression here silently corrupts every existing project's render).
- **Hard oracle:** `test_layer_tap_composite.py` — (a) 2-layer composite, B taps A's
  `track_id` `stage: pre`, temp-luma read: B's output differs from an unmasked render and
  correlates with A's real pre-chain luma, not a placeholder constant (must FAIL on
  pre-packet main — anti-dead-flag: today `'layer'` nodes don't exist so this scenario is
  unbuildable, capture both states); (b) missing/unknown `track_id` → flat 0.5, no
  exception; (c) **fan-out**: one source tapped by 2+ consumers in the same frame — decode/
  resolve instrumented counter asserts exactly ONE resolution (§9.3); (d) **rollback**: a
  project with zero `'layer'` nodes renders BYTE-IDENTICAL to pre-change output, and the
  pre-pass computation itself is instrumented to prove it never runs when no consumer
  references it (cheap early-out, mirrors `masking/routing.py:202-205`'s pattern — assert via
  call-count, not just output equality); (e) **Sample Rack / group-layer consumer** (code
  ground truth #21): a `'layer'` node inside a Sample-Rack leaf voice's or branch's
  `mask_stack`, `stage: pre`, tapping a top-level track — assert the tap resolves via
  `composite_tree.py::expand_group_layer`'s `leaf_ctx`/`branch_ctx` to a real (non-0.5) value,
  not a silent degrade (must FAIL on pre-packet main since no tap-frame wiring exists there).
- **Test plan:** integration (`test_layer_tap_composite.py`, new, shared file with PK.3's
  post-stage cases — this packet writes ONLY the pre-stage tests (a)-(d) above); regression —
  full existing `masking/` + `zmq_server`/composite pytest suites must stay green (rollback
  guarantee is only credible if the WHOLE suite, not just new tests, stays green).
- **Trust-boundary rule:** the wire boundary is the composite-render IPC payload
  (`raw_layers` in `_handle_render_composite`) — `track_id` is attacker-shaped input only in
  the sense that a malformed/absent value must degrade (flat 0.5), never crash; verified via
  caller grep on `params['track_id']` reads in `evaluate_layer_tap`, not a standalone parser.
- **STOP:** if the byte-identical rollback oracle (d) fails on first attempt and the fix
  requires touching `apply_masks_to_chain`'s existing (non-tap) code path — STOP, this means
  the early-out design assumption in plan.md's OD-2 was wrong and needs re-verification
  before continuing, not a patch-around. If `App.tsx`'s layer-serialization call sites have
  materially changed from `plan.md:435-444`'s citations (parallel session activity), STOP and
  re-verify line numbers before editing.
- **Executor brief:** Opus-tier. Inline verbatim: Gate 6 ("RUN the failing code first,
  capture the actual error/stack trace... You need the real output"); the Trust-boundary rule
  above; code ground truth #7 ("preview/export parity is a house landmine, not optional —
  TWO call sites that must both change together"). Last line: `PK.2 done — PR #<n>, oracle
  evidence: <(a)-(d) pytest output>, qa-redteam verdict: <pass/findings>`.

### PK.3 — Post-stage cross-layer dependency pass + cycle guard — **RISK: HIGH (highest in this change)**
- **Scope:** everything in `plan.md:462-559` — this is the packet the T1 override actually
  added and is the highest-risk packet in the whole change. Build the `stage == 'post'`
  evaluator branch; the dependency-graph pre-pass (early-out when no post-stage tap exists;
  build `dict[track_id, set[track_id]]` edges; DFS cycle guard with deterministic
  lex-smallest-id break per code ground truth #20); dependency-ordered resolution that
  reuses/shares `layer_states[layer_id]` for tracks that are BOTH tapped-in-post AND an
  ordinary visible layer this frame (code ground truth #15 — the load-bearing constraint:
  never invoke a stateful device's `apply_chain` twice per frame against two different state
  slots); shadow-only render + dedicated `tap_post::<track_id>` state key (code ground truth
  #16) for tracks with no ordinary layer entry; identical logic at all 3 export.py call
  sites via a shared helper (`resolve_post_tap_order`, pure function, unit-testable in
  isolation); thread the existing `project_seed` (code ground truth #19), never re-derive.
  Also thread the sibling `extra={'tap_frames_post': ...}` key into
  `composite_tree.py::expand_group_layer`'s `leaf_ctx` (`:243`) and `branch_ctx` (`:287-289`)
  (code ground truth #21), onto the SAME `FrameCtx.extra` dict PK.2 wired `tap_frames_pre`
  onto.
- **Non-scope:** any read implementation (PK.4-PK.7 populate the actual dispatch); UI (PK.8).
- **Files (ownership claim):** `backend/src/masking/stack.py` (`post` branch),
  `backend/src/zmq_server.py` (`_handle_render_composite` — second pre-pass, after PK.2's
  `pre` pre-pass and before the main per-layer loop), `backend/src/engine/export.py` (all 3
  call sites, shared helper, job-local state dict — no scrub-reset needed there),
  `backend/src/engine/composite_tree.py` (`expand_group_layer`'s `leaf_ctx` `:243` and
  `branch_ctx` `:287-289` — add the sibling `tap_frames_post` key, code ground truth #21),
  new shared helper module/function `resolve_post_tap_order` (implementer's call: `masking/
  stack.py` or new `masking/tap_dependency.py`), `backend/tests/
  test_layer_tap_composite.py` (post-stage cases, same file PK.2 created), new
  `backend/tests/test_layer_tap_post_order.py`.
- **Depends:** PK.1, PK.2 (hard — shares `ctx.extra`, tap-cache module, `track_id` wire
  field; cannot start meaningfully before PK.2's `pre` pass exists per plan.md Sequencing).
  **Blocks:** PK.5's post-stage cases (needs this packet's state-slot machinery), PK.8's
  full (non-xfail) integration oracles.
- **Risk:** **HIGH** (plan.md itself flags this VERY HIGH — treat as the top of the HIGH
  tier: Opus-tier executor + mandatory `Skill(qa-redteam)` + a SECOND independent reviewer
  pass on the state-consistency mechanics specifically before merge, given the failure mode
  is silent double-invocation of stateful devices corrupting both the real render AND the
  tap's definition of "post").
- **Hard oracle:** `test_layer_tap_composite.py` post-stage cases — (a) B taps A `stage:
  post`; A carries a device that visibly transforms the frame (invert/solid-paint); assert
  B's tap matches A's POST-chain pixels, not pre-chain (must FAIL on pre-PK.3 main — the
  post branch doesn't exist yet, anti-dead-flag); (b) **stateful-device single-invocation**:
  A carries a stateful device (datamosh or test double with an internal state counter); B
  taps A in `post`; run 3 consecutive frames; assert the counter advances by exactly 1/frame,
  not 2 — this is the load-bearing proof of code ground truth #15; (c) **cycle guard**: A
  post-taps B, B post-taps A; render completes without raising, exactly one edge degrades to
  flat 0.5 deterministically (same cycle → same broken edge across repeated runs), the other
  edge resolves to a real value; (d) **preview/export parity for a post tap**: identical
  2-layer post-tap setup through BOTH `_handle_render_composite` and `_composite_export_frame`
  for the same frame index → byte-identical composited frame AND byte-identical resolved
  matte value; (e) **rollback**: zero post-stage `'layer'` nodes (some may have pre-stage
  nodes) never triggers the dependency-graph build at all — assert via call-count
  instrumentation on the graph-builder, not just output equality; the pre-only path stays
  byte-identical and equally cheap whether or not this packet's code exists in the binary;
  (f) **Sample Rack / group-layer consumer** (code ground truth #21): a `'layer'` node inside
  a Sample-Rack leaf voice's or branch's `mask_stack`, `stage: post`, tapping a top-level
  track — assert the tap resolves through `composite_tree.py::expand_group_layer`'s
  dependency-ordered pass to the tapped track's POST-chain value, not a silent flat-0.5
  degrade (must FAIL on pre-packet main).
  Additionally `test_layer_tap_post_order.py` (direct unit test on the pure helper): linear
  chain resolves deps-before-dependents; diamond fan-out resolves the shared source exactly
  once; self-tap (OD-5 backend-graceful case) treated as a 1-node cycle, degrades to flat
  0.5, never infinite-loops; the 2-cycle case asserts the SAME lex-smallest-id break decision
  as the composite-level oracle (c) — this unit test is what actually pins the determinism
  claim.
- **Test plan:** integration (post-stage cases above, same file as PK.2); unit
  (`test_layer_tap_post_order.py`, exercises the dependency/cycle logic without a full
  composite render per case — cheap, fast, isolates the algorithmic claim from rendering);
  regression — full existing suites green (same rollback-credibility bar as PK.2, now for
  the SECOND pre-pass specifically).
- **Trust-boundary rule:** no new external-input trust boundary — the cycle guard is a
  render-time safety mechanism (self-inflicted by project structure, not attacker input),
  but it must still never raise/crash on a hand-edited or malformed project file (same
  degrade-not-crash convention as every other boundary in this codebase).
- **STOP:** if a stateful device's state counter advances by 2 in oracle (b) on first
  attempt (i.e., the shared-state-slot design doesn't actually prevent double-invocation) —
  STOP immediately, this is the exact failure mode code ground truth #15 exists to prevent
  and needs a design re-check, not a quick patch. If preview/export parity oracle (d) fails
  and the fix would require export.py's job-local state dict to gain scrub-reset logic (it
  shouldn't need one per code ground truth #16, exports are monotonic by construction) — STOP
  and re-verify the ground-truth claim.
- **Executor brief:** Opus-tier. Inline verbatim: Gate 6 (reproduce/capture real output);
  Gate 13 shape applied to backend state ("trace the FULL chain... identify ALL clamps,
  guards, and transforms... fix the actual bottleneck" — here: trace `layer_states` /
  `new_states` / `_composite_states` end to end before touching any of them, per code ground
  truth #15/#16); code ground truth #19 ("thread the EXISTING `project_seed`, never
  re-derive"). Last line: `PK.3 done — PR #<n>, oracle evidence: <(a)-(e) + post_order unit
  test output>, qa-redteam verdict + second-reviewer verdict on state-consistency`.

### PK.4 — Read taxonomy: luma · R · G · B · alpha
- **Scope:** `plan.md:561-583`. Replace PK.2's temporary raw-luma fallback with the real
  per-read dispatch for all 5 direct per-pixel reads; resize-to-consumer-resolution
  (bilinear); apply gain/gamma/invert tail; clip [0,1]. Works identically for `pre` and
  `post` once PK.3 lands (no read-specific post work needed).
- **Non-scope:** motion/edges/colorkey/ai_person (PK.5-PK.7); UI (PK.8).
- **Files (ownership claim):** `backend/src/masking/stack.py` (per-read dispatch block —
  single-flight with PK.5/PK.6/PK.7, see Single-flight map), extends
  `backend/tests/test_layer_tap_composite.py`.
- **Depends:** PK.2 (needs a resolved `pre` frame). **Blocks:** PK.5 (shares resize/gain/
  gamma/invert tail), PK.6 (same), PK.7 (same), PK.8.
- **Risk:** STD (MED per plan.md).
- **Hard oracle:** synthetic frame with known per-channel/alpha/luma values → each of the 5
  reads extracts the expected value, for BOTH stage values (pre reuses PK.2's fixtures, post
  reuses PK.3's — must FAIL on pre-PK.4 main since the stub still returns flat 0.5/raw luma
  only); alpha-less source → alpha read returns field 1.0 (§10.4, not an error); C-contiguous
  numpy array assertion on the hot path (house landmine — the PR #416 4.7× measured mandate
  cited in plan.md:571-572).
- **Test plan:** unit (`masking/stack.py` — 5 reads × 2 stages against synthetic frames);
  extends the composite integration file for end-to-end confirmation.
- **STOP:** if matching `video_analyzer.py::_to_gray`'s exact BT.601/709 weights produces a
  visible mismatch against an existing luma-based procedural kind's output on the same input
  — STOP and report the discrepancy before picking a weight set unilaterally.
- **Executor brief:** Sonnet-tier. Inline verbatim: Core Rule 1 (read before edit); the
  C-contiguous/hoisted-float house landmine text above (paste it verbatim into your PR
  description as evidence you applied it, per repo convention). Last line: `PK.4 done — PR
  #<n>, oracle evidence: <5-read × 2-stage test output>`.

### PK.5 — Read taxonomy: motion · edges — **RISK: HIGH**
- **Scope:** `plan.md:585-640`. `edges`: per-pixel Sobel-magnitude field (new field-
  resolution code, formula-shape only reused from `video_analyzer.py`, not the function
  itself — code ground truth #13). `motion`: per-pixel delta against a persisted
  `tap_prev::<track_id>::<stage>` half-res state; frame-0/cold-start → flat 0.5 (T1-specified,
  a deliberate divergence from the scalar analyzer's 0.0 convention); state write once per
  `(track_id, stage)` per frame regardless of fan-out.
- **Non-scope:** colorkey/ai_person (PK.6/PK.7); UI (PK.8).
- **Files (ownership claim):** `backend/src/masking/stack.py` (single-flight with PK.4/PK.6/
  PK.7 — see Single-flight map), `backend/src/zmq_server.py` + `backend/src/engine/
  export.py` (thread `tap_prev::*` keys through PK.3's existing state-slot mechanism — no
  new persistence mechanism), extends `test_layer_tap_composite.py`.
- **Depends:** PK.3 (state-slot machinery for `post`-stage cases — `pre`-stage motion/edges
  can land against PK.2 alone with post cases marked `xfail` until PK.3 merges, per plan.md
  Sequencing), PK.4 (shares resize/gain/gamma/invert tail).
- **Risk:** **HIGH** → Opus-tier + mandatory `Skill(qa-redteam)` (new field-resolution
  numerics AND new per-tap persisted state — the only read pair with a temporal dependency;
  determinism/reproducibility claims are load-bearing and non-obvious here).
- **Hard oracle:** (a) `edges` on a synthetic hard-edge (half black/half white) frame → edge
  region scores higher than flat regions; (b) `motion` frame-0 (no prior `tap_prev` state) →
  uniformly 0.5 field, both stages (must FAIL pre-PK.5 — the read doesn't exist yet); (c)
  `motion` **determinism**: same 3-frame sequence rendered twice (same seed, scrub-free) →
  BYTE-IDENTICAL motion fields on frames 2/3 across both runs (pins code ground truth #19 for
  a temporally-stateful read specifically); (d) `motion` delta correctness: two consecutive
  synthetic frames with a KNOWN changed region → elevated field exactly there on frame 2,
  flat 0.5 on frame 1; (e) `motion` fan-out: 2 consumers reading motion off the same
  `(track_id, stage)` in one frame → tap-prev state written exactly ONCE (instrumented
  counter), not once per consumer.
- **Test plan:** unit (`masking/stack.py` — edges/motion against synthetic frames incl.
  frame-0, determinism, fan-out-state-once); extends the composite integration file.
- **Trust-boundary rule:** the `tap_prev` state key namespace must never collide with a real
  `layer_id` (verified: `tap_post::<track_id>` / `tap_prev::<track_id>::<stage>` prefixes are
  namespace-distinct by construction, per code ground truth #16) — grep every write site to
  `_composite_states` before adding a new key shape to confirm no collision is possible.
- **STOP:** if determinism oracle (c) fails intermittently (not deterministically) — STOP,
  this points at an unseeded or non-deterministic operation somewhere in the motion path
  that must be found and fixed, not retried until it passes.
- **Executor brief:** Opus-tier. Inline verbatim: Gate 6 (reproduce/capture real output — for
  the frame-0 and determinism oracles specifically, run them and look at actual arrays, don't
  reason about them); the Trust-boundary rule above; code ground truth #19 (project_seed
  threading, verbatim). Last line: `PK.5 done — PR #<n>, oracle evidence: <(a)-(e) output,
  incl. the byte-identity diff for (c)>, qa-redteam verdict`.

### PK.6 — Read taxonomy: colorkey (Δhue / softness)
- **Scope:** `plan.md:642-669`. `colorkey` branch: HSV conversion, `key_kernels.
  _hue_distance_deg` reuse (code ground truth #17, imported and called, NOT reimplemented),
  `field = 1.0 - clip(delta_hue / softness, 0, 1)`, softness default 60° (T1-specified,
  verbatim), hue default 120.0 (reused from the existing `chroma_key` convention), divide-
  by-zero floor (`max(0.1, softness)`).
- **Non-scope:** ai_person/motion/edges (PK.5/PK.7); UI (PK.8).
- **Files (ownership claim):** `backend/src/masking/stack.py` (single-flight, see map),
  `backend/src/masking/schema.py` (confirm `read_params.hue`/`softness` sanitization only —
  no new validator), extends `test_layer_tap_composite.py`.
- **Depends:** PK.4 (shares resize/gain/gamma/invert tail); independent of PK.5.
- **Risk:** STD (MED).
- **Hard oracle:** synthetic frame with a known solid hue → field ≈1.0 at that hue, falls off
  monotonically as `read_params.hue` moves away; softness widening broadens falloff; the
  T1-specified default (`read_params: {}`) matches an explicit `{hue: 120, softness: 60}`
  call BYTE-FOR-BYTE (pins the 60° default precisely, not just "some default" — must FAIL
  pre-PK.6 since the read doesn't exist).
- **Test plan:** unit (`masking/stack.py` — hue falloff, softness widening, default-equals-
  explicit byte match); extends composite integration file.
- **STOP:** if `key_kernels._hue_distance_deg` cannot be imported into `masking/stack.py`
  without a circular import — STOP and report, do not reimplement the hue-distance math a
  second time (defeats the whole point of code ground truth #17's reuse citation).
- **Executor brief:** Sonnet-tier. Inline verbatim: Core Rule 1 (read before edit); code
  ground truth #17 (import-and-call, not reimplement, verbatim). Last line: `PK.6 done — PR
  #<n>, oracle evidence: <hue-falloff + byte-match-default test output>`.

### PK.7 — Read taxonomy: ai_person (ai_matte pathway, generalized) — **RISK: HIGH**
- **Scope:** `plan.md:671-718`. Backend: `ai_person` branch delegates VERBATIM to
  `masking.ai_matte.evaluate_ai_matte`'s pathway (zero duplication of jail-check/reader-
  cache/wrap-clamp logic, code ground truth #18) against `read_params.matte_path`/
  `start_frame` (scoped under `read_params`, distinct from an `ai_matte`-kind node's
  top-level `matte_path`). Frontend: new `generateAiMattePreviewForTrack(sourceTrackId,
  consumerClipId, nodeId)` sibling to `generateAiMatte` — resolves the SOURCE track's asset
  (not the consuming clip's), reuses the SAME `mask_ai_generate`/`mask_ai_status` IPC
  round-trip, writes `read_params.matte_path` via `updateMatteNode` (NOT `addAiMatteNode` —
  that would add a competing node of the wrong kind).
- **Non-scope:** the UI trigger button itself lives in PK.8; motion/edges/colorkey (PK.5/6).
- **Files (ownership claim):** `backend/src/masking/stack.py` (single-flight, see map),
  `frontend/src/renderer/stores/aiMatte.ts` (new sibling function only — `generateAiMatte`
  itself untouched), extends `test_layer_tap_composite.py`, new
  `frontend/src/__tests__/MaskStackPanel.layertap.test.tsx` (this file is shared/created
  here and extended by PK.8 — see Single-flight map).
- **Depends:** PK.4 (shares resize/clip tail); independent of PK.5/PK.6.
- **Risk:** **HIGH** → Opus-tier + mandatory `Skill(qa-redteam)`. Backend reuse is low-risk
  (verbatim pathway), but this is the one packet where a path-traversal-shaped input
  (`matte_path`) crosses a NEW call site into an existing jail-check — the regression this
  packet is most likely to introduce is calling the jail-check on the wrong id (consumer vs.
  source track), which is exactly a trust-boundary bug, hence HIGH not MED.
- **Hard oracle:** backend — a `'layer'` node with `read: ai_person` + a valid pre-baked
  `matte_path` resolves through `evaluate_layer_tap` to BYTE-IDENTICAL values vs. an
  equivalent `ai_matte`-kind node on the same file (proves verbatim call-through, not a
  parallel reimplementation); missing/jail-rejected `matte_path` → flat 0.5, no exception
  (mirrors `ai_matte.py`'s existing contract exactly — must FAIL pre-PK.7 since the branch
  doesn't exist). Frontend — selecting `read: ai_person` calls
  `generateAiMattePreviewForTrack` with the TAPPED track's id, NOT the consuming clip's id
  (the specific regression this flow is most prone to, given `generateAiMatte`'s existing
  clipId-only shape); on mock-IPC success, `updateMatteNode` is called with
  `read_params.matte_path` set — `addMatteNode`/`addAiMatteNode` is NOT called.
- **Test plan:** backend integration (byte-identical-to-`ai_matte`-node proof, jail-rejection
  case); frontend component (`MaskStackPanel.layertap.test.tsx`, mock IPC — the wrong-id
  regression case specifically).
- **Trust-boundary rule:** the REAL boundary is `ai_matte.py`'s existing jail check
  (`is_valid_matte_path`), called an EXTRA time from this new call site — verify via caller
  grep that `evaluate_layer_tap`'s `ai_person` branch actually calls into the same jail-check
  function object, not a copy-pasted or loosened version of it.
- **STOP:** if delegating to `evaluate_ai_matte` requires ANY change to that function's
  existing signature or behavior (vs. calling it as-is or via a thin adapter) — STOP, this
  risks regressing the existing `ai_matte`-kind node path and needs explicit sign-off.
- **Executor brief:** Opus-tier. Inline verbatim: the Trust-boundary rule above; code ground
  truth #18 ("ZERO duplication of the jail-check/reader-cache/wrap-clamp logic," verbatim);
  Core Rule 3 ("Do what was asked, nothing more — no bonus features," since the temptation
  here is to build a fuller async-loading UI than PK.8 scopes). Last line: `PK.7 done — PR
  #<n>, oracle evidence: <byte-identical + wrong-id-regression test output>, qa-redteam
  verdict`.

### PK.8 — MaskStackPanel UI: tap chip (stage toggle + full read dropdown) + hover-audition — **RISK: HIGH**
- **Scope:** `plan.md:720-809`. `NodeCard`'s `node.kind === 'layer'` branch: live thumbnail,
  REAL stage TOGGLE (`pre`/`post`, no longer display-only — PRD decision 3's hollow/filled
  semantics), read DROPDOWN with all 9 values, read-specific sub-controls (colorkey hue/
  softness inputs; ai_person "Generate matte" button wired to PK.7's
  `generateAiMattePreviewForTrack`), mini-strip popover (gain/gamma/invert, new `clampGain`/
  `clampGamma` helpers), press-and-hold solo. New "+ From layer…" header control: track
  picker excluding own track (OD-5), debounced (~150ms) hover-audition IPC call (thumbnail
  live preview), commit constructs the exact §9.1 node shape (`stage: pre`, `read: luma` as
  NEW-NODE defaults). Backend: extend `_handle_mask_thumbnail` (or a sibling handler) to
  special-case `kind == "layer"` — resolve the REQUESTED stage/read for audition (a `post`
  audition IS a full chain render for the candidate track, intentionally more expensive,
  debounced client-side only per OD-4). Undo-description upgrade (`timeline.ts:2893`) —
  `'Add matte node'` → includes `node.kind` (benefits ALL existing call sites). Track-
  deletion: confirm the chip's red-dashed state is a DERIVED check
  (`!tracks.some(t => t.id === node.params.track_id)`), not a stored flag.
- **Non-scope:** any backend read/stage logic beyond wiring the audition request through to
  the already-real evaluator (PK.2-PK.7 own that); route inspector/transform gizmo (out of
  v1 scope per proposal.md non-goals, untouched by T1).
- **Files (ownership claim):** `frontend/src/renderer/components/masking/
  MaskStackPanel.tsx` (`NodeCard` extension + header "+ From layer…" control),
  `backend/src/zmq_server.py` (`_handle_mask_thumbnail` extension or new sibling handler —
  single-flight with PK.2/PK.3/PK.4/PK.5, see map — this packet's edits land LAST in that
  file), `frontend/src/renderer/stores/timeline.ts:2893` (undo description — additive,
  benefits existing rect/ellipse/polygon/ai_matte call sites too), extends
  `frontend/src/__tests__/MaskStackPanel.layertap.test.tsx` (created in PK.7).
- **Depends:** PK.1 (layout/interaction work can start against the flat-0.5 stub in parallel
  with PK.2-PK.7, per plan.md Sequencing — mark integration assertions `xfail`/skip until
  dependency packets land, repo convention for stub-dependent tests); **strict pass requires
  PK.2, PK.3, PK.4, PK.5, PK.6, PK.7 all merged** (the audition/thumbnail path needs every
  stage × every read to be real, not stubbed, before the full oracle below is meaningful).
  **Blocks:** none (terminal packet in this change).
- **Risk:** **HIGH** (plan.md: MED-HIGH, rounded up given the genuinely new interactive
  hover-audition/track-picker surface) → Opus-tier + mandatory `Skill(qa-redteam)`.
- **Hard oracle:** `MaskStackPanel.layertap.test.tsx` — (a) render a clip with `'layer'`-kind
  nodes (one `pre`, one `post` fixture); chip DOM renders correctly for all 9 reads × both
  stages without crashing (must FAIL/not-exist pre-PK.8); (b) "+ From layer…" flow: own
  track excluded from picker, commit calls `addMatteNode` with the exact §9.1 shape
  (`stage: pre`, `read: luma` defaults); (c) stage toggle on an existing node →
  `updateMatteNode` called with `params.stage` flipped AND thumbnail re-fetch triggered with
  the NEW stage (not stale); (d) deleted-source track → red-dashed class present (derived-
  check, no store mutation), for both stages; (e) undo-stack top entry description contains
  `"layer"`, not the generic `"Add matte node"`; (f) `ai_person` sub-control calls
  `generateAiMattePreviewForTrack` with the TAPPED track's id (re-asserted at chip-
  integration level, not just PK.7's store-function level — this is the regression most
  likely to survive a unit-level pass but fail at integration). Backend: hover-audition IPC
  contract test including a `post`-stage audition request that runs a real chain.
- **Test plan:** component (`MaskStackPanel.layertap.test.tsx`, mock IPC per repo
  convention — `window.entropic.sendCommand` stubbed); component regression — assert the
  EXISTING `DeviceCard.tsx` test suite passes UNMODIFIED with a `'layer'`-kind node present
  in `maskNodes`, for both stages (proves code ground truth #8/#9's "zero changes needed"
  claim empirically, not just by assertion); backend integration (audition IPC, incl. a
  `post` full-chain audition case).
- **UAT journey (user-facing packet):** open a clip's mask stack → click "+ From layer…" →
  confirm own track is absent from the candidate list → hover a candidate track → confirm a
  live thumbnail appears in the picker within ~150ms debounce (verify visually against the
  panel's `--cx-*` accent/border tokens — no raw hex comparison) → commit → confirm a new tap
  chip appears with stage=pre/read=luma defaults and a live thumbnail matching the source →
  toggle stage to `post` → confirm the thumbnail visibly updates to reflect the source's
  post-chain frame (build the source clip with an obvious device — e.g. invert — so
  pre-vs-post is visually distinguishable in the UAT) → open the read dropdown → cycle
  through all 9 values, confirming each renders a visually distinct, non-crashing thumbnail,
  with colorkey showing hue/softness inputs and ai_person showing a "Generate matte" button
  → delete the source track → confirm the chip flips to the red-dashed error state
  (`--cx-error`-class token, not a hard-coded red hex) and a toast fires once (rate-limited,
  source-keyed per this repo's Toast Conventions) → undo the delete → confirm the chip
  recovers → check the undo history panel shows `"Add layer matte"` (or equivalent
  kind-specific text), not the generic `"Add matte node"`.
- **Trust-boundary rule:** no new external-input boundary in the UI itself; the derived-check
  pattern for deletion (PLAY-002/PLAY-004 conventions) must be verified by grepping
  `removeTrack` in `timeline.ts` for any OTHER store that might need symmetric cleanup for a
  `'layer'`-kind tap (deletion is a distributed transaction — confirm nothing needs an
  explicit teardown beyond the derived check).
- **STOP:** if `_handle_mask_thumbnail`'s existing clip_id-keyed cache assumptions make a
  `kind == "layer"` special-case awkward to bolt on — STOP and confirm with the user/
  orchestrator before building a new sibling handler (plan.md leaves this as an implementer's
  call but flags the ambiguity; don't silently pick the more invasive option). If PK.2-PK.7
  are not ALL merged when this packet's integration oracles are run for real (non-`xfail`) —
  STOP, do not mark them passing by leaving them `xfail` past that point.
- **Executor brief:** Opus-tier. Inline verbatim: Gate 14 Wiring Check ("finished building a
  new component that mounts in a parent → BEFORE shipping, verify: (a) all props declared
  are actually passed... (c) all interactive elements receive events... (d) entry AND exit
  paths work (select AND deselect...)..."); Gate 15 Research Gate ("building a new
  interactive UI component (overlay, drag handler,... custom control) → BEFORE writing code,
  search for established open-source implementations... cite the reference implementation in
  a code comment" — applies to the hover-audition track picker); the Toast Conventions block
  from this repo's root CLAUDE.md (rate-limited, source-keyed, text-node only, verbatim).
  Last line: `PK.8 done — PR #<n>, oracle evidence: <(a)-(f) + DeviceCard-regression output>,
  UAT journey screenshot paths, qa-redteam verdict`.

---

## Single-flight map
| File | Packets | Order |
|---|---|---|
| `backend/src/masking/stack.py` | PK.1 (stub) → PK.2 (pre) → PK.3 (post) → PK.4 (luma/RGB/alpha) → PK.5 (motion/edges) → PK.6 (colorkey) → PK.7 (ai_person) | 1→2→3→4→{5,6,7 parallel} |
| `backend/src/zmq_server.py` | PK.2 (pre pre-pass), PK.3 (post pre-pass), PK.5 (tap_prev threading), PK.8 (`_handle_mask_thumbnail`) | 2→3→5→8 |
| `backend/src/engine/export.py` | PK.2, PK.3, PK.5 | 2→3→5 |
| `backend/src/engine/composite_tree.py` | PK.2 (`tap_frames_pre` on `leaf_ctx`/`branch_ctx`), PK.3 (`tap_frames_post`, same ctx) | 2→3 |
| `backend/src/masking/schema.py` | PK.1, PK.6 (confirm-only) | 1→6 |
| `frontend/src/renderer/App.tsx` | PK.2 (`track_id` field) | 2 only |
| `frontend/src/renderer/stores/timeline.ts` | PK.8 (`:2893` undo description) | 8 only |
| `frontend/src/renderer/stores/aiMatte.ts` | PK.7 (new sibling fn) | 7 only |
| `frontend/src/__tests__/MaskStackPanel.layertap.test.tsx` | PK.7 (created), PK.8 (extended) | 7→8 |
| `backend/tests/test_layer_tap_composite.py` | PK.2 (created, pre cases), PK.3 (post cases), PK.4/5/6/7 (read cases) | 2→3→{4,5,6,7} |

**Serial chain:** 1 → 2 → 3 → 4 → 8 (8 needs 4 for the full integration pass). **Parallel
after 4:** 5 (also needs 3), 6, 7 (5/6/7 are mutually independent, all touch
`masking/stack.py` so serialize commit order among themselves even though they can be
developed in parallel — last one to land rebases on the other two). 8's layout work can
start against 1's stub in parallel with 2-7, per plan.md Sequencing, but its oracles only
run "for real" (non-`xfail`) after 2-7 all merge.

## Coverage check (plan.md → packets)
Every plan.md packet maps 1:1: Packet 1→PK.1, Packet 2→PK.2, Packet 3→PK.3, Packet 4→PK.4,
Packet 5→PK.5, Packet 6→PK.6, Packet 7→PK.7, Packet 8→PK.8. Normative wire contracts (§9.1,
§9.2, §9.3, §9.4, §10.4) are each cited in the packet(s) that implement them (PK.1 schema
shape; PK.2/PK.3 stage semantics + fan-out cache; PK.4-PK.7 read formulas; all packets'
resize tail for §10.4). All 21 code ground truths are cited in at least one packet above.
BDD scenario coverage (plan.md:856-877) maps to PK.2/PK.3 (full-color source), PK.4-PK.7
(read taxonomy, no longer OD-3-narrowed), PK.8 (new track-level source type + error
containment). Regression/full-suite-green requirements are folded into every packet's Test
plan, not a separate packet.

**Explicit descopes (proposal.md Non-goals, UNTOUCHED by the T1 override — do not build in
any packet above):** `FieldKind: 'layer'` (v1.5); matrix source `'layer_tap'` operator (v2);
`paint` source (v2, T1 did not reopen this); route inspector / on-canvas transform gizmo /
edge-policy UI (v1 ships `transform`/`edge_policy` at identity/`"black"` defaults only, per
PK.1's schema scope and PK.8's non-scope); matte tracks / promote-to-matte-track / DAG cloud
/ W-overview / route stepper / frame-delayed feedback edges / System Monitor / browser
taxonomy / backspin / afterimage (unrelated sections); group bus taps (a `'layer'` node
pointing at a group id degrades to flat 0.5, treated as unknown-track, not a bus tap —
covered by PK.2/PK.3's existing "unknown track_id" oracle, no new code); standalone
dual-surface browser `fx.*` person-key/color-key effects (v2-adjacent). No plan.md item is
silently narrowed beyond what proposal.md's Non-goals + T1 Verdicts already state.

## Ledger
| Packet | Status | PR | Oracle evidence |
|--------|--------|----|-----------------|
| PK.1 | ⬜ | — | — |
| PK.2 | ⬜ | — | — |
| PK.3 | ⬜ | — | — |
| PK.4 | ⬜ | — | — |
| PK.5 | ⬜ | — | — |
| PK.6 | ⬜ | — | — |
| PK.7 | ⬜ | — | — |
| PK.8 | ⬜ | — | — |
