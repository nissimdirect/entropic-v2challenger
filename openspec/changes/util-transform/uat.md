# UAT — util-transform (Pre-Build)

**Companion to** `docs/UAT-PLAN-2026-07-02-live-cu.md` (runtime protocol applies verbatim:
canonical checkout launch + live-runtime path check before any verdict, throwaway
projects for anything destructive, screenshot-per-verdict, evidence not eyeballs) and
`docs/UAT-CU-ADDENDUM-2026-07-03.md` (row style: Check/Oracle/Trap, GAP-style
EXPECTED-ABSENT rows double as build-completion detectors).

**Scope:** these are the acceptance journeys a Computer-Use agent drives AFTER
`util-transform`'s packets (`packets.md`) ship. One section per packet — PK.1/PK.2 are
backend-only (shell-command oracle rows, no CU driving); PK.3/PK.4/PK.5 are user-facing
(CU-driven rows). Every row traces to a packet ID in its section header.

**Hard rules inherited (verbatim from the house protocol):**
- Temporal/stateful effects → verdict only during multi-frame Play; a single-frame
  screenshot proves nothing (learning #44).
- Alpha/matte claims → export + PIL pixel assertion, never a preview screenshot (preview
  paths that fall back to JPEG-like encoding drop alpha silently).
- Destructive steps (hand-editing project JSON, corrupting files, repeated saves past a
  cap) → throwaway project only, never a user project file.
- Effect-amount-nonzero precheck: confirm the effect's params actually read nonzero/
  non-default in the Inspector BEFORE judging any "render broken" verdict.
- Every NEW-UI row is marked **EXPECTED-ABSENT until its packet ships** — running this
  row before that packet merges is expected to fail closed (old behavior, no crash); a
  pass on a NEW-UI row is itself evidence the packet landed. Do not silently reinterpret
  an absent control as a pass.

---

## PK.1 — Backend effect `util.transform` + registry wiring (backend-only)

No user-facing surface ships in this packet — the effect isn't reachable from any UI
until PK.4 mounts the gizmo, and even the Effect Browser listing itself is UI but not
scoped as new-UI-of-record here (PK.1's Scope is `transform.py` + `registry.py` +
its own test file). Oracle rows are shell commands, not CU drives, per the "backend-only
packets get shell-command oracle rows" instruction.

| # | Check (Setup + Drive) | Oracle (falsifiable) | Trap |
|---|---|---|---|
| PK1-1 | Setup (shell): repo at the merged `util-transform` commit, backend venv active. Drive (shell): `cd backend && python -m pytest tests/test_effects/test_util/test_transform.py tests/test_effects/test_calibration.py -x --tb=short -v`. | Exit code 0; verbose output shows each of these test names individually PASSED: `test_identity_defaults_unchanged`, `test_alpha_travels`, `test_skew_against_golden_matrix`, `test_determinism`, `test_bdd_scenario_edge_kernel`, `test_numeric_params_have_unit`, `test_numeric_params_have_curve`, `test_effect_at_defaults[util.transform]`. Grep the `-v` output for each literal name — all present, none SKIPPED. | A plain (non-`-v`) run showing "N passed" doesn't prove the *named* required tests ran — a stale/renamed test could still yield a green count. Pre-packet this file doesn't exist (collection error); post-packet it must both collect AND show every named test, not just a nonzero pass count. |
| PK1-2 | Drive (shell): `grep -n "transform," backend/src/effects/registry.py`. | Two matches: one inside the `effects.util` import block (near line 185-191), one inside the mods list (near line 284-288) alongside `auto_levels,`. | PK1-1's pytest run passing doesn't by itself prove `registry.py` was edited in production code (a test-local monkeypatch could fake registration) — the direct grep on the real file is the independent check that wiring is live, not simulated. |
| PK1-3 | Drive (shell): `cd backend && python -m pytest tests/test_effects/test_util/test_transform.py::test_bdd_scenario_edge_kernel -v` (isolated, not the full suite). | Output reads exactly `1 passed`, not `1 skipped` or `1 deselected` — this is the scripted translation of `creatrix-moire-generator-bdd.md:359-367` (x=300, scale=0.7, edge_policy=mirror → pixels moved+mirrored, alpha travels). | Running only the full-suite pass (PK1-1) can visually bury a `SKIPPED` status for this one test in scrollback; isolating it with `-v` forces an explicit PASSED/SKIPPED distinction for the one test that is a direct citation of the source spec's BDD scenario. |
| PK1-4 | Setup (shell, throwaway script — no app launch needed): construct a 3-channel (RGB, no alpha) synthetic test frame in a Python snippet, import `backend.src.effects.util.transform`, call `apply()` with a non-identity transform (e.g. `x=50, rotation=10`). Drive: run the snippet, then inspect whatever log sink PK.1's PR body names for the alpha-less degrade fallback (`grep` the sidecar log for the message string used, per the PR's own documentation of which string it chose). | `apply()` does not raise; the returned frame's vacated/degrade region is byte-identical to a hand-computed black/constant fill (not whatever `edge_policy` was requested — plan.md forces `constant`/black on alpha-less input); the log sink shows exactly one new line referencing the degrade. `grep -rn "alphaless\|alpha.*degrade" frontend/src/renderer/stores/toast.ts` returns nothing (confirms no toast channel was invented, per the packet's pre-approved log-only fallback). | Confirming "no crash" alone is not sufficient — a silently-wrong degrade (e.g. using the requested `edge_policy` instead of forcing black) would also "not crash." Must check both (a) the fill is actually black/constant regardless of requested policy, and (b) the log line actually appears — a no-op with neither a log nor a crash would look identical to this row's happy path unless both facts are checked. |

## PK.2 — `edge_policy` exactness + `tile` risk resolution (backend-only)

| # | Check (Setup + Drive) | Oracle (falsifiable) | Trap |
|---|---|---|---|
| PK2-1 | Drive (shell): `cd backend && python -m pytest tests/test_effects/test_util/test_transform.py -k "edge_policy" -x --tb=short -v`. | Exactly 7 tests collected and PASSED: `test_edge_policy_constant_transparent`, `_black`, `_white`, `_custom`, `test_edge_policy_extend`, `test_edge_policy_tile`, `test_edge_policy_mirror`. Count must equal 7, not more/fewer. | PK.1's full-file run already includes non-edge-policy tests mixed in; a rubber-stamp could eyeball "the file's tests passed" from PK1-1's run and never actually filter+count the 7 edge_policy-specific tests in isolation. |
| PK2-2 | Drive (shell): `grep -n -A15 "OD-1" openspec/changes/util-transform/proposal.md` AND re-run `cd backend && python -m pytest tests/test_effects/test_util/test_transform.py::test_edge_policy_tile -v` standalone, then write a throwaway Python snippet decoding the test's output frame and sampling the vacated-region pixel array. | `proposal.md`'s OD-1 section contains an appended follow-up note stating which path shipped ("BORDER_WRAP held" or "manual-remap fallback used"); the isolated test shows `1 passed`; the sampled vacated-region pixel array matches the SOURCE frame's wrapped-coordinate slice numerically (not just "non-zero" or "non-black") — report the actual array comparison, not a vibe check. | A rubber stamp seeing `test_edge_policy_tile` PASS could stop there — it does not prove the proposal.md documentation step happened (a packet Scope requirement), and "non-black" alone does not distinguish real wrap-around content from a solid-gray or replicated-edge fallback that would also read non-black. |

## PK.3 — Gizmo skew extension + Photoshop modifier grammar (user-facing)

Exercised against the PRE-EXISTING, unconditionally-mounted clip-transform gizmo
(`App.tsx:3913`) — PK.4's second mount is not required to test PK.3 in isolation, since
`BoundingBoxOverlay.tsx` is shared. Rows PK3-2/3/4 are regression rows for behavior that
already ships today (verified BoundingBoxOverlay.tsx:76-77,91,123) and must be re-run
AFTER PK.3's diff lands, not assumed still-passing.

| # | Check (Setup + Drive) | Oracle (falsifiable) | Trap |
|---|---|---|---|
| PK3-1 | Setup: throwaway project, import a clip, select it (the existing gizmo mounts automatically). Drive: grab an edge handle (e.g. right-center) and hold Cmd (Ctrl on non-mac) while dragging outward. **NEW-UI, EXPECTED-ABSENT until PK.3 ships.** | Preview shows a sheared parallelogram (corner angles no longer 90°), not a rectangular scale — screenshot before-drag and mid-drag, visually confirm non-perpendicular corners. Pre-packet: same drag produces a plain scale (rectangular, 90° corners preserved) — that is the expected pre-ship result, not a bug. | Seeing SOME visual change during Cmd-drag and calling it "skew confirmed" without checking the corner angles specifically — a modifier that silently no-ops to the existing plain-scale behavior would still show a visual change (the box resizes) but is not skew. |
| PK3-2 (regression) | Drive: grab a corner handle, hold Shift, drag diagonally. | Aspect ratio (width/height) of the bounding box stays constant across 3 sampled drag positions, measured off screenshot pixel dimensions. | This is PRE-EXISTING behavior — the trap is skipping it as "already known to work" when the actual regression risk is the skew-code refactor silently breaking it; PK.3's own Hard oracle requires this be proven to pass again AFTER the skew diff, not merely assumed. |
| PK3-3 (regression) | Drive: grab the rotate handle, hold Shift, drag in a slow arc. | The displayed rotation value snaps in exact 15° increments (0, 15, 30…), not continuous — screenshot the angle readout at 3 points along the arc. | Same as PK3-2: must be re-verified post-merge, not skipped as "known-good." |
| PK3-4 (regression) | Drive: grab the move handle (box body), hold Shift, drag diagonally. | The resulting position changes along ONE axis only — the other coordinate (x or y) is pixel-identical to its pre-drag value. Screenshot before/after position readout. | Same regression-preservation trap as PK3-2/3-3. |
| PK3-5 | Drive: hold Option (Alt) while dragging a corner or edge handle. **NEW-UI, EXPECTED-ABSENT until PK.3 ships.** | Transform scales/skews from the CENTER anchor — the opposite edge/corner also moves (symmetric), unlike default drag where the opposite side stays fixed. Screenshot both drag modes side-by-side showing which edge moved. Pre-packet: Option has no special handling, opposite side stays fixed (plain default drag). | Confirming Option-drag "scales at all" is not discriminating — plain drag also scales. The only falsifying evidence is whether the OPPOSITE side also moved (center-anchored) vs. stayed fixed (edge/corner-anchored default). |
| PK3-6 | Drive: change scale, rotation, or skew away from default via drag, then double-click that same handle. **NEW-UI, EXPECTED-ABSENT until PK.3 ships (grep confirmed zero `onDoubleClick`/`dblclick` hits pre-packet).** | The field resets to ITS OWN default (e.g. scale → 1.0, not 0) — screenshot the param readout before and after double-click. Pre-packet: double-click does nothing (or falls through to a stray click-select). | Confirming double-click "does something" without checking it resets to the CORRECT default per-field is not sufficient — a hardcoded reset-to-0/identity would be wrong for scale fields whose default is 1.0, not 0. |
| PK3-7 (non-goal guard) | Drive: hold Cmd and drag a CORNER handle (not an edge). | Box remains a parallelogram/rectangle — never an arbitrary quadrilateral with 4 independently-movable corners (free-distort/homography is explicitly OUT per Non-Goals). Either falls through to plain corner-scale or is a no-op. | Scope-creep risk: the modifier-grammar table's raw text mentions Cmd-corner = free distort, but PK.3's Scope explicitly excludes it — this row exists to catch an over-eager implementation that wired it anyway. |

## PK.4 — `App.tsx` second gizmo mount + chain-selection wiring (user-facing)

| # | Check (Setup + Drive) | Oracle (falsifiable) | Trap |
|---|---|---|---|
| PK4-1 | Setup: throwaway project, clip on a track. Add `util.transform` to the clip's device chain (Effect Browser — search "transform" or browse the `util` category; the effect will be listed under whatever exact label the browser renders for `EFFECT_ID = "util.transform"`, quote it once observed). Select that effect entry in the chain (not the clip itself). Drive: drag the resulting bounding-box overlay's scale handle. **NEW-UI, EXPECTED-ABSENT until PK.4 ships.** | A SECOND overlay renders, bound to the `util.transform` device's OWN param object — confirm by watching the effect's param panel values (`x`, `y`, `scale_x`, `scale_y`, …) change in lockstep with the drag, not the clip's own transform fields. Screenshot param panel + preview together, before/after. Pre-packet: selecting an effect in the chain mounts nothing new — only the pre-existing clip-bound gizmo is ever visible. | Dragging ANY visible box and seeing the preview change could rubber-stamp the PRE-EXISTING clip-transform gizmo (still always mounted) as if it were the new device-bound one. Must explicitly confirm the DEVICE's own param panel — not the clip's — changed. |
| PK4-2 | Continuing from PK4-1 (device gizmo visible). Drive: deselect the effect (click elsewhere, or select a different, non-`util.transform` effect in the chain). | The second gizmo disappears from the preview (screenshot before/after). If the clip is still selected, its own pre-existing gizmo may remain per its own rules — but no orphaned second overlay persists. | A rubber-stamp pass would test only the mount (PK4-1) and never the unmount, missing a stuck-overlay bug from an inverted/missing conditional-render guard. |
| PK4-3 | Drive (shell, precondition sanity, not CU): `git log --oneline -10 -- frontend/src/renderer/App.tsx`. | `wave0-prerouted-presets`' PK.00 (`:4373` tsc fix) and PK.1 (`:3757` apply-path edit) commits appear in history BEFORE PK.4's own `App.tsx` commit. | A CU-only pass could show PK4-1/PK4-2 both green in isolation while a silent rebase-order violation dropped wave0's unrelated fix on the same file — this shell check is the cross-change regression guard the packet's header explicitly calls out. |

## PK.5 — Gesture-group lane recording + auto-simplify wiring (user-facing)

Plan.md/packets.md give no literal UI label for the grouping control or the tolerance
preference — CU identifies both structurally, per the plan's own "locate at
implementation time" language. Quote whatever label is actually rendered once observed.

| # | Check (Setup + Drive) | Oracle (falsifiable) | Trap |
|---|---|---|---|
| PK5-1 | Setup: throwaway project, `util.transform` on a clip, arm the track/effect for automation recording. Drive: during ONE continuous gesture, touch MULTIPLE scalars at once (e.g. a combined move+scale+rotate drag) — confirm via the param panel that ≥2 of `x, y, scale_x, scale_y, rotation, skew_x, skew_y` visibly changed during the SAME gesture before judging grouping. Stop recording. **NEW-UI, EXPECTED-ABSENT until PK.5 ships (`grep -rn "gestureGroup\|laneGroup" frontend/src/renderer` returns zero hits pre-packet).** | Lane list shows ONE collapsible grouped entry (single header row with an expand/collapse affordance) containing the touched scalars, not N separate ungrouped rows. Screenshot before recording (no group exists) and after (one group header; expand it to show the ≤7 member lanes). Pre-packet: N separate ungrouped lanes appear instead. | Recording a gesture that only ever touches ONE scalar (e.g. a pure x-drag) would legitimately still produce a single lane with no grouping need — that is NOT evidence the grouping logic works. The drive step must confirm ≥2 scalars changed in the SAME gesture, or the row proves nothing. |
| PK5-2 | Drive (shell, post-merge): identify the call site PK.5's PR body names as owning `util.transform`'s lane recording (either `transform-record.ts` or `automation-record.ts` — read the PR body's resolution of its own STOP condition), then `grep -n "from.*automation-simplify" <that-file>` and `grep -n "rdp-simplify" <that-file>`. | First grep: exactly one import line from `automation-simplify.ts`. Second grep: zero hits. This is the literal OD-4 regression guard. | A CU visual check ("points look simplified after recording") cannot distinguish `simplifyPoints` (correct, `automation-simplify.ts`) from the WRONG file's RDP implementation (`rdp-simplify.ts`, the freehand-lasso mask tool's algorithm) — both would visually reduce point count. Only the grep proves the correct function was wired. |
| PK5-3 | Setup: continuing from PK5-1 or a fresh gesture. Drive: record a deliberately noisy/jittery multi-second gesture touching ≤7 scalars with the auto-simplify tolerance preference at its default (ON per OD-4); open the lane's breakpoint view and count visible points. Then locate and toggle the tolerance preference OFF (search Preferences for a `util.transform`-related simplify/tolerance entry — structural location, no fixed label given by the plan) and repeat an equivalent-noise, equivalent-duration gesture; count points again. | The default-ON recording shows a materially LOWER breakpoint count than the tolerance-OFF recording for equivalent input — report both raw numeric counts, not a visual impression (source spec §2.2's point-count-reduction claim). | Eyeballing "the curve looks smoother" without an actual before/after NUMERIC point count would rubber-stamp visual/interpolation smoothing that never touched the underlying point data, which is the actual claim under test. |

---

## Definition of done — end-to-end journey

**Story:** a user drags `util.transform` onto a clip, sculpts it with the full modifier
grammar, records a gesture-grouped automation pass, and exports — the exported file must
match what was seen live, including alpha, and must be reproducible byte-for-byte.

1. Setup: throwaway project. Import a clip that carries (or is given, via a matte) a
   non-trivial alpha channel — a uniformly-opaque clip cannot exercise the alpha-travels
   claim.
2. Add `util.transform` from the Effect Browser to the clip's device chain (quote the
   exact category/label as rendered).
3. Select the `util.transform` entry in the chain — the PK.4 device-bound gizmo appears
   on the preview (distinct from the clip's own transform box).
4. Set `edge_policy` to `mirror` in the param panel.
5. Perform, in sequence, on the device gizmo: a Cmd-drag edge (skew), a Shift-drag
   corner (proportional scale), an Option-drag corner (center-anchored scale), and a
   double-click on the rotation handle (reset to default) — screenshot each step's
   before/after.
6. Arm automation recording on the effect; perform ONE continuous multi-scalar gesture
   (touching ≥2 of the scalars at once) and stop. Confirm a single gesture-group lane
   entry appears and that the recorded curve is visibly less noisy than the raw drag
   input (auto-simplify).
7. **Effect-amount-nonzero precheck:** before judging any render, confirm the Inspector
   shows nonzero/non-default values for `x`/`scale_x`/`rotation`/etc.
8. Press Play and let playback run across at least 10 frames spanning the recorded
   gesture (temporal rule — a single frame proves nothing); screenshot 3 distinct
   timestamps showing the transform visibly animating.
9. Export the clip TWICE, to two different output folders, using a format that carries
   alpha (e.g. ProRes 4444 or a PNG sequence) — per the destructive-export caution, this
   is on the throwaway project only.
10. Decode 2–3 frames from BOTH export runs with PIL (never trust a preview screenshot
    for alpha — it may be JPEG-backed and drop the channel):
    - **Determinism:** `shasum -a 256` the corresponding frame files from the two runs —
      byte-identical.
    - **Alpha travels:** the decoded alpha channel is non-uniform and moved/skewed in
      lockstep with the RGB content (not dropped, not defaulted to opaque).
    - **Edge fill correctness:** the vacated area (from the applied transform) shows
      mirrored source content, not black or a solid fill, matching `edge_policy=mirror`.
    - **Preview==export:** the decoded export frame visually matches the live-preview
      screenshot taken at the same timeline position in step 8.

**Oracle (all must hold):** gesture-group + auto-simplify visibly present in the lane
list; skew/proportional-scale/center-scale/reset each individually confirmed via
before/after screenshots; multi-frame Play shows real animation, not a static frame;
the two export runs are byte-identical; the decoded alpha channel is present, non-
uniform, and transformed together with RGB; the mirrored edge fill is pixel-verified,
not eyeballed.

**Trap:** a rubber-stamp pass would add the effect, drag it around once, glance at a
single preview frame, and call it done — never exporting, never decoding with PIL, and
never checking determinism. Because JPEG-backed previews silently drop alpha and a
single frame cannot show either animation or the mirror-fill's correctness, this
journey's oracle requires the full export → PIL → shasum evidence chain before any
"it works" verdict is allowed to stand.
