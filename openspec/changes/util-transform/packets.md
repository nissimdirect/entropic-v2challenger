# Packets — util-transform

**Emitted:** 2026-07-04 by /packetize. **Plan:** `plan.md` (same dir — packets POINT to
its line-anchored normative sections; do not re-derive). **Decisions:** ALL LOCKED —
`proposal.md` OD-1..OD-4, T1 Verdicts section ("Accept all 33 defaults," LOCKED
2026-07-03, do not re-open). Two additional plan.md-only naming/fallback items
(shared-type name `AffineTransformLike`, toast-vs-log-only fallback for the
alpha-less degrade) are **not** re-opened as decisions here — plan.md already gives
a recommended default + fallback for each; packets below bake those in as
proceed-on-default with no STOP (cosmetic/fallback, not scope-altering).
**Route:** proposed `/eng` Phase 3 (5 packets, no marathon-scale fan-out needed —
see handoff).

**Branching rule (every packet):** cut from `origin/main`, never from a local
checkout that another session may own; PR-only; squash; no `.github/workflows/**`
edits.
**Merge gate (every packet, STRICT FULL-TIER):** full backend pytest
(`cd backend && python -m pytest -x -n auto --tb=short`) + full vitest green
(`cd frontend && npx --no vitest run`) → `Skill(review)` via Skill tool → full CI
green. PK.3 additionally requires `/qa-redteam` is NOT mandatory (risk is STD, not
HIGH — see PK.3 risk note) but a manual clip-transform regression pass is
non-negotiable before merge (see PK.3 Hard oracle).

**Cross-change constraints baked in:**
- No packet here touches `frontend/src/renderer/stores/operators.ts` or
  `backend/src/modulation/routing.py` — the `wave0-prerouted-presets` rebase-after
  rule does not apply to this change's packets. Verified: `plan.md:137-139`
  explicitly notes the `registry.py` edit is additive-only and does not collide
  with Wave-0's `modulation/routing.py` work (different file).
- **Additional (code-grounded, not in the mandated cross-change list but a real
  collision):** `frontend/src/renderer/App.tsx` is touched by BOTH this change
  (PK.4, second conditional gizmo mount near `:3913`) AND
  `wave0-prerouted-presets` (`PK.00`'s `:4373` tsc fix, `PK.1`'s apply-path edit at
  `:3757`). Per `wave0-prerouted-presets/packets.md`'s own single-flight map,
  `PK.00 → PK.1` on `App.tsx` in that change. **PK.4 in this change must rebase
  onto `main` AFTER `wave0-prerouted-presets` PK.00 and PK.1 have merged** —
  stated explicitly in PK.4's Depends below even though it is a cross-change (not
  intra-change) dependency.
- Every new numeric param in `util.transform` (`x, y, scale_x, scale_y, rotation,
  anchor_x, anchor_y, skew_x, skew_y`) ships `curve` + `unit` metadata, enforced
  live by `backend/tests/test_effects/test_calibration.py::test_numeric_params_have_unit`
  and `::test_numeric_params_have_curve` — baked into PK.1's hard oracle, not a
  separate packet.
- `DEPENDENT_PARAMS` shared registry (needed by sibling `fx-afterimage`/
  `fx-backspin` changes): per OD-3, **this change does NOT build it** —
  `util.transform`'s param set has no no-op-at-defaults param. PK.1 leaves a
  one-line TODO comment at the calibration call site so whichever of those two
  sibling changes lands first builds the registry (dedupe STOP is THEIR concern,
  not this change's — noted here only so a future packetizer of those changes
  finds the TODO).

---

### PK.1 — Backend effect `util.transform` + registry wiring

- **Scope:** new `backend/src/effects/util/transform.py` per `plan.md:9-47` in
  full: `EFFECT_ID = "util.transform"`, `EFFECT_CATEGORY = "util"`, params
  `x, y, scale_x, scale_y, rotation, anchor_x, anchor_y, skew_x, skew_y,
  edge_policy, edge_level` exactly as specified (`plan.md:13-24`) with every
  numeric param declaring `curve` + `unit`; one composed 2×3 affine matrix
  (translate-to-origin → scale+skew → rotate → translate-to-anchor → translate
  x/y, `plan.md:29-31`) and exactly one `cv2.warpAffine` call; RGBA travels
  together, no channel split (`plan.md:33-34`); alpha-less input degrade forces
  `constant`/black behavior (`plan.md:40-47`) — **default fallback (not a STOP):**
  no existing effect emits a param-level warning field today; if none is found at
  implementation time, log via the existing sidecar logger and skip the toast —
  do NOT invent a new IPC channel (out of scope per plan.md's own note). Also:
  `edge_policy` border-mapping as a **private function inside `transform.py`**
  (`_edge_policy_to_cv2`, per OD-1/plan.md:48-57) — not a new shared module (no
  second caller exists yet; extraction trigger note only, see Non-scope).
- **Non-scope:** the `tile`/`BORDER_WRAP` exactness probe and per-policy golden
  tests (PK.2 — same file, sequential); extracting `_edge_policy_to_cv2` into a
  shared module (future `layertap-matte-v1` work, not this change); the gizmo
  (PK.3/PK.4); `DEPENDENT_PARAMS` registry build-out (OD-3 — explicitly not
  needed for this param set; leave the TODO comment only).
- **Files:**
  - NEW `backend/src/effects/util/transform.py`
  - MODIFIED `backend/src/effects/registry.py` — insertion point 1 (`effects.util`
    import block, `:185-191`, add `transform,`), insertion point 2 (mods list,
    `:284-288`, add `transform,` alongside `auto_levels,`). No other registry
    changes (`plan.md:58-75`).
  - NEW `backend/tests/test_effects/test_util/test_transform.py`
- **Depends:** none (dispatchable now). **Blocks:** PK.2 (same file, sequential),
  PK.5 (needs these params to exist as lane targets).
- **Risk:** LOW. Additive/isolated module + 2-line registry insertion; calibration
  test is a build-time gate, not a runtime trust boundary.
- **Hard oracle:**
  `cd backend && python -m pytest tests/test_effects/test_util/test_transform.py tests/test_effects/test_calibration.py -x --tb=short`
  — expected: all pass, 0 failed, 0 error. Anti-dead-flag: this exact test file
  does not exist pre-packet (collection error today: `ERROR ... no tests ran /
  file or directory not found`); post-packet it must collect and pass. Required
  named tests inside the new file (per `plan.md:143-167`):
  `test_identity_defaults_unchanged` (byte-parity: `np.testing.assert_array_equal`
  at all-default params), `test_alpha_travels`, `test_skew_against_golden_matrix`,
  `test_determinism` (byte-identical twice), `test_bdd_scenario_edge_kernel`
  (scripted `creatrix-moire-generator-bdd.md:359-367`: x=300, scale=0.7,
  edge_policy=mirror → pixels moved+mirrored, alpha travels). Calibration suite
  (existing, no new file) must show `test_effect_at_defaults[util.transform]`
  auto-picked up via `list_all()` — confirms registry wiring is live, not just
  importable.
- **Test plan:** unit tier only (pure function, no I/O/ZMQ/filesystem —
  `pytestmark = pytest.mark.smoke`, matches `test_util/test_levels.py:7`
  convention). New file: `backend/tests/test_effects/test_util/test_transform.py`.
- **STOP:** if `frame.shape[2] != 4` degrade logic requires touching any existing
  IPC error/toast schema to plumb a new warning field, STOP and report — the
  default (log-only, no toast) is pre-approved; inventing a channel is not. If
  `cv2.getRotationMatrix2D` composition cannot express skew as assumed and a
  different matrix construction is needed, STOP and report the golden-matrix test
  failure (do not silently change the composition order without re-deriving
  `test_skew_against_golden_matrix`'s expected values by hand first).
- **Executor brief:** Sonnet-tier. Inline verbatim: **Core Rule 1** — "Read files
  before editing — never Edit without prior Read." **Gate 5** — "Tests? wrote or
  modified code → write tests at the RIGHT LAYER: logic/validation → Vitest unit
  test with mock IPC... " (backend equivalent: pytest unit tier, no I/O). **Toast
  Conventions** (project CLAUDE.md) — "Toast store: `stores/toast.ts` —
  rate-limited (2s dedup by `source`)... Source field required for error toasts
  from IPC to enable rate limiting" — relevant only if a warning-field path is
  found to already exist; otherwise use the log-only fallback per STOP above.
  Last line of your reply: PR # + the full pytest command output (pass count).

### PK.2 — `edge_policy` exactness + `tile` risk resolution (OD-1)

- **Scope:** per-`edge_policy`-value exact-output tests against golden/expected
  arrays for all 4 values (`constant` incl. transparent/black/white/custom,
  `extend`, `tile`, `mirror` — `plan.md:129`, source spec §4 "each edge_policy
  exact"); the OD-1 `tile`/`BORDER_WRAP` empirical probe (`proposal.md:42-52`):
  attempt `cv2.BORDER_WRAP` first inside PK.1's single `warpAffine` call; if the
  probe test shows the vacated area does NOT show wrapped-source pixels (silent
  misbehavior), fall back to computing the wrapped-coordinate grid manually and
  routing through `cv2.remap` **only for the `tile` case** (mirrors
  `backend/src/effects/shared/displacement.py:26-28`'s pattern) — this is the
  only `edge_policy` value permitted to cost a second call. Document the outcome
  (BORDER_WRAP held / fallback used) as a follow-up note appended to
  `proposal.md`'s OD-1 section in the same PR.
- **Non-scope:** re-deriving PK.1's identity/alpha/determinism tests (already
  covered); building a shared edge-fill module (future work, not this change).
- **Files:** MODIFIED `backend/src/effects/util/transform.py` (extends PK.1's
  `_edge_policy_to_cv2` helper only — do not restructure the rest of the file);
  MODIFIED `backend/tests/test_effects/test_util/test_transform.py` (adds
  `test_edge_policy_constant_transparent/_black/_white/_custom`,
  `test_edge_policy_extend`, `test_edge_policy_tile`, `test_edge_policy_mirror`).
- **Depends:** PK.1 (same file, sequential — do not dispatch before PK.1 merges).
  **Blocks:** none hard (PK.5 does not touch `transform.py`), but should land
  before PK.3/PK.4 begin manual QA of the gizmo against a fully-correct backend.
- **Risk:** STD. Correctness risk (OpenCV `BORDER_WRAP` cross-build
  inconsistency is a known upstream issue, not a security/trust-boundary
  concern), not HIGH.
- **Hard oracle:**
  `cd backend && python -m pytest tests/test_effects/test_util/test_transform.py -k "edge_policy" -x --tb=short`
  — all 7 new tests pass. Anti-dead-flag: `test_edge_policy_tile` is written to
  assert the vacated area shows wrapped-source pixels (not black/replicated) —
  against PK.1's naive "BORDER_WRAP-only" implementation this test MUST be able
  to fail (that's the entire point: it's the gate deciding which of the two
  implementations ships). Capture the actual first-run result (pass or fail) in
  the PR body — if it failed and the fallback was applied, show the before/after.
- **Test plan:** unit tier (same file/tier as PK.1, no I/O).
- **STOP:** if the `BORDER_WRAP` probe fails AND the manual-`remap` fallback
  ALSO fails to reproduce correct wrap behavior, STOP and report — do not ship a
  silently-wrong `tile` policy; this is the one edge_policy value with real
  empirical risk per OD-1.
- **Executor brief:** Sonnet-tier. Inline verbatim: **Gate 6** — "Reproduce?
  fixing a bug → RUN the failing code first, capture the actual error/stack
  trace. Reasoning about code is NOT enough. You need the real output." (applies
  directly: don't reason about whether `BORDER_WRAP` works in this environment —
  run the probe test and read its actual output before deciding the
  implementation path). **Core Rule 2** — "Verify with evidence, not claims — tool
  output or it didn't happen." Last line of your reply: PR # + which
  implementation path shipped (BORDER_WRAP or manual-remap fallback) + the
  probe-test output proving it.

### PK.3 — Gizmo skew extension + Photoshop modifier grammar (OD-2)

- **Scope:** extend `BoundingBoxOverlay.tsx` in place per OD-2's locked default
  (`proposal.md:64-73`) — do NOT fork a new component. `DragMode` union
  (`:26`) gains `'skew-t' | 'skew-b' | 'skew-l' | 'skew-r'`; Cmd/Ctrl-drag on an
  edge handle switches a plain edge-drag into skew mode; full modifier grammar
  from `proposal.md:146-153` (Shift-drag corner = proportional scale, Shift-drag
  rotate = 15° snap, Shift-drag move = axis-constrained, Option-drag =
  scale/skew from center, Cmd-drag edge = skew — **Cmd-drag corner = free
  distort is explicitly OUT per Non-Goals; do not implement corner_pin math
  here, even though the modifier table's raw text mentions it** — implement only
  the skew branch, not the free-distort/homography branch); double-click-to-reset
  on any handle (new — none exists today).
  NOTE: of the 6 modifier-grammar rows, Shift-drag corner (proportional scale),
  Shift-drag rotate (15° snap), and Shift-drag move (axis-constrain) are
  PRE-EXISTING shipped behavior (verified at BoundingBoxOverlay.tsx:76-77,91,123)
  — PK.3 adds regression tests for these three, it does not implement them.
  Only Option-drag-from-center, Cmd/Ctrl-drag-edge skew, and double-click-reset
  are new implementation work. Widen the shared prop type per
  `plan.md:91-103` option (a): add a new `AffineTransformLike` interface (name
  is a plan.md placeholder, proceed with it — not a STOP-worthy naming
  decision) with optional `skewX`/`skewY`, `ClipTransform` remains a strict
  subtype (skew always undefined for clip transforms).
- **Non-scope:** the new `App.tsx` mount wiring that actually shows this gizmo
  for a `util.transform` device (PK.4); corner_pin/free-distort behavior (Non-Goal,
  separate future change); pose-morph A/B (deferred per proposal.md).
- **Files:**
  - MODIFIED `frontend/src/renderer/components/preview/BoundingBoxOverlay.tsx`
  - MODIFIED `frontend/src/shared/types.ts` (new `AffineTransformLike` interface;
    `ClipTransform` becomes a subtype)
  - NEW `frontend/src/__tests__/components/preview/bounding-box-overlay.test.tsx`
- **Depends:** none (independent, parallel-safe with PK.1/PK.2 — disjoint files).
  **Blocks:** PK.4 (needs the widened prop type).
- **Risk:** STD — elevated within STD, not HIGH. Rationale: this touches a
  shared, currently-working, shipped component used today by every clip
  selection (`App.tsx:3913`); a regression here breaks an existing feature, not
  a trust boundary or security surface, so it does not meet this contract's
  HIGH bar (Opus + mandatory `/qa-redteam` is for trust-boundary/security risk).
  The elevated-STD treatment is: the regression suite for PRE-EXISTING
  move/scale/rotate behavior is written and passing BEFORE any skew code is
  merged (see Hard oracle) — this is non-negotiable, not optional hardening.
- **Hard oracle:**
  `cd frontend && npx --no vitest run src/__tests__/components/preview/bounding-box-overlay.test.tsx`
  — expected: all pass. Anti-dead-flag / sequencing requirement: the file's FIRST
  test block covers PRE-EXISTING move/scale(8 handles)/rotate modes against the
  UNMODIFIED component (no test file exists for this component today — write and
  run this block first, on a throwaway branch or via `git stash` of the
  skew-mode diff, to prove it passes against current `main` behavior before
  layering skew changes on top); only after that block is proven green does the
  packet add: (i) skew-drag-mode tests, Option-drag tests, and the
  double-click-reset test — each must FAIL before its corresponding handler
  exists and PASS after (true fail→pass anti-dead-flag); (ii) regression tests
  for the 3 pre-existing modifier rows (Shift-corner scale, Shift-rotate snap,
  Shift-move axis-constrain) — these MUST PASS immediately against the
  unmodified component (proving they are pre-existing, not newly built) and
  must continue passing unchanged after the skew/Option/double-click code
  lands.
- **Test plan:** component tier, mock IPC per house Gate 5 (`Knob`/handle drag
  simulated via React Testing Library `fireEvent.mouseDown/mouseMove/mouseUp` on
  SVG handle elements — read `transform-coords.test.ts` /
  `transform-record.test.ts` first for the house's existing coordinate-simulation
  idiom before writing new drag-simulation code, per `plan.md:174-177`). New
  file: `frontend/src/__tests__/components/preview/bounding-box-overlay.test.tsx`.
- **UAT journey (user-facing):** select a clip → grab an edge handle, hold
  Cmd/Ctrl → observe skew instead of scale · hold Shift while dragging a corner
  → observe aspect-locked scale · hold Shift while rotating → observe 15° snap ·
  double-click any handle → observe reset to that field's default. Pixel-verify
  via `--cx-*` design tokens (no raw hex) on the handle/cursor affordance states
  if any new visual state is added (e.g., a skew-cursor icon) — if no new visual
  token is introduced, note "no new visual surface, UAT is behavioral only" in
  the PR body instead of a screenshot diff.
- **STOP:** if adding the skew branch changes ANY existing move/scale/rotate
  test's expected output (once the pre-existing regression block above is
  written), STOP and report — do not adjust the regression test to match new
  behavior; that means the skew branch leaked into a shared code path. If Cmd
  and Ctrl detection conflicts with an existing keyboard shortcut on either
  platform (grep `App.tsx`'s hotkey table first), STOP and report before
  binding.
- **Executor brief:** Sonnet-tier. Inline verbatim: **Gate 14 (Wiring Check,
  entry/exit clause)** — "(d) Entry AND exit paths work (select AND deselect,
  open AND close, mount AND unmount)" (applies to double-click reset and mode
  transitions: drag-start/drag-end, Cmd-held/Cmd-released mid-drag). **Gate 18
  (Live Runtime Check)** — "verify the running app's process path matches where
  you edited... Zustand store-shape changes always need kill + relaunch (HMR
  won't rehydrate)" — name the live runtime path in your reply if you did any
  manual click-test. Last line of your reply: PR # + confirmation that the
  pre-existing-behavior regression block was run and passed BEFORE the skew diff
  was added (with the two separate pass outputs, before/after).

### PK.4 — `App.tsx` second gizmo mount + chain-selection wiring

- **Scope:** second conditional `BoundingBoxOverlay` mount in `App.tsx` (today:
  one unconditional mount at `:3913` bound to the selected clip). New mount
  renders only when the selected effect in the active chain is a `util.transform`
  device (selector: reuse `getActiveEffectChain()`, confirm it still exists/is
  still named that at implementation time — `01-per-track-chain-model` may have
  landed/renamed it, per `plan.md:104-110`); binds the gizmo to the device's own
  param object (via PK.3's `AffineTransformLike` adapter), not `ClipTransform`.
- **Non-scope:** the gizmo's internal drag/skew/modifier logic (PK.3, already
  landed); gesture-group lane recording (PK.5).
- **Files:** MODIFIED `frontend/src/renderer/App.tsx`; NEW
  `frontend/src/__tests__/app/util-transform-gizmo-mount.test.tsx` (exact
  location: match whatever convention existing `App.tsx`-adjacent component
  tests use — locate at implementation time, do not invent a new test directory
  pattern).
- **Depends:** PK.3 (needs the widened `AffineTransformLike` prop type) —
  intra-change. **Cross-change:** must rebase onto `main` AFTER
  `wave0-prerouted-presets` PK.00 (`:4373` tsc fix) and PK.1 (`:3757` apply-path
  edit) have merged — see header's "Additional" cross-change note; `App.tsx` is
  touched by both changes and wave0's edits land first per that change's own
  packet order. **Blocks:** PK.5 (needs this mount as the gesture-recording
  context).
- **Risk:** STD.
- **Hard oracle:**
  `cd frontend && npx --no vitest run src/__tests__/app/util-transform-gizmo-mount.test.tsx`
  — all pass. Anti-dead-flag: this test file does not exist pre-packet; write it
  to assert (a) selecting a `util.transform` device renders the second gizmo
  bound to ITS params (not the clip's — assert on the prop values passed, not
  just presence of a DOM node), (b) deselecting OR selecting a non-`util.transform`
  effect unmounts it. Both assertions must be written to FAIL against
  unmodified `App.tsx` (no such mount exists today) and pass after.
- **Test plan:** component tier, mock IPC + mock stores per house Gate 5.
- **STOP:** if `getActiveEffectChain()` no longer exists or has a different
  signature than `plan.md:108-110` assumes (the `01-per-track-chain-model` epic
  may have landed changes since this plan was written), STOP and report the
  actual current selector API — do not invent a parallel selector.
- **Executor brief:** Sonnet-tier. Inline verbatim: **Gate 14 (Wiring Check)** —
  full text: "(a) All props declared are actually passed from the parent (no
  unused props), (b) All callbacks trigger the expected side effects... (c) All
  interactive elements receive events... (d) Entry AND exit paths work (select
  AND deselect, open AND close, mount AND unmount), (e) Legacy data loads
  without crash." **Gate 18 (Live Runtime Check)** — verify the running app's
  process path matches the edited files before claiming this works; name the
  live runtime path in your reply. Last line of your reply: PR # + the
  before/after (fail/pass) output of the two mount-wiring assertions.

### PK.5 — Gesture-group lane recording + auto-simplify wiring (OD-4)

- **Scope:** "gesture group" collapsible lane-list treatment for `util.transform`'s
  ≤7 touched scalars (`x, y, scale_x, scale_y, rotation, skew_x, skew_y`) recorded
  in one gesture (`plan.md:111-117`, source spec §2.1) — new grouping data
  structure + UI treatment, scoped STRICTLY to these 7 scalars, not a general
  N-effect lane-grouping system. Auto-simplify-on-record-stop wired to
  `frontend/src/renderer/utils/automation-simplify.ts`'s `simplifyPoints`
  **— per OD-4, NOT `rdp-simplify.ts`** (that file is the freehand-lasso mask
  tool's RDP implementation, a different consumer entirely; importing it here
  would be a documentation-citation bug carried into code) — default ON with a
  new tolerance preference key, following the existing preference-store pattern
  (locate at implementation time).
- **Non-scope:** pose-morph A/B (deferred, not this change); a general
  cross-effect lane-grouping system (only these 7 scalars); building
  `DEPENDENT_PARAMS` (OD-3, not needed here).
- **Files:**
  - NEW `frontend/src/renderer/utils/affine-gesture-group.ts` (or co-located in
    `transform-record.ts` — implementer's call per `plan.md:111-113`, either is
    acceptable, note which was chosen in the PR body)
  - MODIFIED: the record-stop call site (in `transform-record.ts` or
    `automation-record.ts`, whichever wires `util.transform`'s lanes) to import
    `simplifyPoints` from `automation-simplify.ts`
  - NEW unit test file(s) for the grouping data structure + simplify wiring
    (exact path: colocate with the new/modified source file per house
    convention — e.g. `frontend/src/renderer/utils/affine-gesture-group.test.ts`)
- **Depends:** PK.1 (needs `util.transform`'s params to exist as lane
  automation targets), PK.4 (needs the gizmo mount as the gesture-recording
  context — per `plan.md:135-136`, P5 depends on P1 + P4). **Blocks:** none.
- **Risk:** STD.
- **Hard oracle:**
  `cd frontend && npx --no vitest run` (targeted to the new test file(s) by
  path) — expected: all pass. Anti-dead-flag: (a) grouping test — recording a
  gesture touching N≤7 scalars produces one visually-grouped lane set (assert on
  the grouping data structure itself, not pixels) — must fail before the
  grouping structure exists; (b) simplify test — auto-simplify-on-stop reduces
  recorded point count using `simplifyPoints`, asserted via a grep-backed import
  check (`grep -n "from.*automation-simplify" <call-site-file>` must show the
  import — this is the literal OD-4 regression guard: if a future edit
  accidentally imports `rdp-simplify.ts` instead, this grep fails) PLUS a
  reduced-point-count assertion within tolerance (source spec §2.2).
- **Test plan:** unit tier — pure logic, no DOM, no mock IPC needed (matches
  house Gate 5's "logic/validation → Vitest unit test" tier exactly, per
  `plan.md:178-181`).
- **STOP:** if the record-stop call site cannot be identified unambiguously
  between `transform-record.ts` and `automation-record.ts` (both are named in
  `proposal.md:159` as calling `recordPoint`), STOP and report which file
  actually owns `util.transform`'s lane recording before wiring the simplify
  call — do not guess and wire both.
- **Executor brief:** Sonnet-tier. Inline verbatim: **OD-4 verbatim**
  (`proposal.md:95-109`) — "the actual curved-segment/automation RDP
  implementation is a separate, independent file:
  `frontend/src/renderer/utils/automation-simplify.ts` (`simplifyPoints`)...
  wire to `automation-simplify.ts`'s `simplifyPoints`, not `rdp-simplify.ts`."
  **Gate 5** — logic/validation → Vitest unit test tier, no mock IPC needed here.
  Last line of your reply: PR # + the grep output proving the correct import
  (`automation-simplify`, not `rdp-simplify`).

---

## Single-flight map

| File | Packets | Order |
|---|---|---|
| `backend/src/effects/util/transform.py` | PK.1, PK.2 | 1 → 2 |
| `backend/tests/test_effects/test_util/test_transform.py` | PK.1, PK.2 | 1 → 2 |
| `backend/src/effects/registry.py` | PK.1 | (single-owner, no conflict) |
| `frontend/src/renderer/components/preview/BoundingBoxOverlay.tsx` | PK.3 | (single-owner within this change) |
| `frontend/src/shared/types.ts` | PK.3 | (single-owner within this change) |
| `frontend/src/renderer/App.tsx` | PK.4 (intra-change, single-owner) — **cross-change:** `wave0-prerouted-presets` PK.00, PK.1 | wave0 PK.00 → wave0 PK.1 → **this change's PK.4** |

PK.1/PK.3 are parallel-dispatchable (disjoint file sets: backend vs. frontend
component). PK.2 must wait for PK.1 to merge (same file). PK.4 must wait for
PK.3 (intra-change prop type) AND for `wave0-prerouted-presets`' App.tsx-touching
packets to merge (cross-change). PK.5 must wait for PK.1 and PK.4.

## Coverage check (plan.md → packets)

| Plan item | Covering packet |
|---|---|
| New backend effect, params, one `warpAffine` call, RGBA-together, alpha-less degrade, registry wiring | PK.1 |
| `edge_policy` per-value exactness + OD-1 `tile`/`BORDER_WRAP` resolution | PK.2 |
| Gizmo skew drag-mode + Photoshop modifier grammar + widened shared prop type (OD-2) | PK.3 |
| `App.tsx` second conditional gizmo mount + chain-selection wiring | PK.4 |
| Gesture-group lane collapse (≤7 scalars) + auto-simplify wiring (OD-4) | PK.5 |
| `DEPENDENT_PARAMS` registry (OD-3) | **Explicitly descoped** — not needed for this param set; PK.1 leaves a TODO comment only, per proposal.md OD-3 locked verdict. |
| Pose-morph A/B (source spec §2 item 4) | **Explicitly descoped** — deferred fast-follow per proposal.md Non-Goals, not built in this change. |
| `util.corner_pin`, `util.mesh_warp`, painted liquify/noise warps/lens models | **Explicitly descoped** — separate future changes / already-shipped-untouched, per proposal.md Non-Goals. |
| Toast/warning plumbing for alpha-less degrade | Folded into PK.1 as a default fallback (log-only) with a STOP only if a new IPC channel would be required — not a separate packet. |

Nothing silently narrowed: every plan.md item either has a covering packet above
or an explicit descope note matching proposal.md's own Non-Goals/OD verdicts.

## Ledger

| Packet | Status | PR | Oracle evidence |
|--------|--------|----|-----------------|
| PK.1 | ⬜ | — | — |
| PK.2 | ⬜ | — | — |
| PK.3 | ⬜ | — | — |
| PK.4 | ⬜ | — | — |
| PK.5 | ⬜ | — | — |
