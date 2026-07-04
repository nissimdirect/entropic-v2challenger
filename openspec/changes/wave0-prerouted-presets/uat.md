# PRE-BUILD UAT — wave0-prerouted-presets

**Companion to** `docs/UAT-PLAN-2026-07-02-live-cu.md` (runtime protocol applies verbatim: canonical
DEV checkout launch + live-runtime path check, throwaway projects for anything destructive,
screenshot-per-verdict, ✅❌🐛⏸ only) **and** `docs/UAT-CU-ADDENDUM-2026-07-03.md` (row/header style).
**Source:** `openspec/changes/wave0-prerouted-presets/packets.md` + `plan.md` (post-reinforcement,
all decisions LOCKED: UD-1..UD-5).

**Why this doc exists:** this UAT is written BEFORE the packets are built. Every row traces to a
packet id so the executor (and the packet's own PR) can be checked off against it after PK.00→PK.5
land. Rows whose UI is new (PK.2 folders/search/tags, PK.4 `_mix` knob, PK.5 curve picker) are
explicitly marked **EXPECTED-ABSENT pre-ship** — running this row against today's main is a
build-completion detector, not a bug report.

**Hard rules inherited (binding on every row below):**
- Temporal/stateful effects → verdict only during multi-frame Play; a single paused frame proves
  nothing (learning #44).
- Alpha/matte claims → export + PIL pixel assertion, never the live preview (JPEG drops alpha).
  Not directly exercised by this change, restated because PK.3's thumbnail pipeline is new.
- Destructive/malformed-input steps run on a **throwaway project**, never a user's real project file.
- **Effect-amount-nonzero precheck** before any "render broken" verdict — confirm the underlying
  effect actually has a nonzero parameter/route driving it before concluding modulation is absent.
- **Preview ≠ export path (MK.8 landmine):** any parity claim (preset apply renders identically to a
  hand-built chain) MUST use the **single-clip render/export path**, never the composite-preview —
  `zmq_server.py:1688` confirms composite-preview carries no per-frame operator values.
- Every new-UI row states its EXPECTED-ABSENT-pre-ship status explicitly.

**Runtime target:** `cd frontend && npm start` (DEV Electron on :5173) — NEVER
`~/Desktop/Creatrix.app`. Confirm via DevTools before any verdict (live-runtime rule).

---

## PK.00 — CI stabilization to full green (backend-only; shell-command oracle)

No user-facing surface — `App.tsx:4373`'s fix is a type-level widening with no behavior change.
Verified via CI + compiler, not the app.

| # | Check (Setup + Drive) | Oracle | Trap |
|---|---|---|---|
| 1 | Shell: `gh run list --branch main -L 1 --json databaseId,conclusion -q '.[0].conclusion'` after PK.00 merges. | Prints `success`. | Checking a run from BEFORE the PK.00 merge commit and rubber-stamping green — must confirm the run's head SHA is the PK.00 merge commit, not a stale prior run. |
| 2 | Shell: `gh run view <id> --json jobs -q '.jobs[] | "\(.name): \(.conclusion)"'` (pull exact job names from `.github/workflows/*.yml` at execution time, per packets.md — don't assume literal `e2e-full`/`sidecar` strings). | Every job listed, including the e2e-full and sidecar jobs (whatever they're actually named), shows `success`. | Grepping for a job name that no longer exists (workflow was renamed) and reporting "not found = presumably fine" — a missing job name is itself a finding, not a pass. |
| 3 | Shell: `cd frontend && npx tsc -b`. | Exit code 0, zero errors (specifically: no error at `App.tsx:4373` / `PresetSaveDialog.tsx:10`). | Running `tsc` without `-b` (project-reference mode) and missing an error tsc-b would have caught. |
| 4 | Shell: `cd backend && python -m pytest tests/test_effects/test_calibration.py::test_numeric_params_have_unit tests/test_effects/test_calibration.py -k zmq -x --tb=short` (adjust to the actual `test_zmq*` node ids once known from the CI log). | All named tests pass; specifically `fx.copy_machine.feedback_amount` now carries a `unit` key. | Declaring PK.00 done because CI is "mostly green" — the merge gate (UD-3) is STRICT full-tier; any red job blocks every other packet's merge. |
| 5 (regression) | Setup: throwaway project, add any effect to a clip. Drive: open the existing "Save as Preset…" / "Save Chain as Preset…" context-menu flow (per `docs/UAT-CU-ADDENDUM-2026-07-03.md` X216-1/X186-1) and confirm the dialog still opens, accepts a name, and saves without a new TS-runtime error in the console. | Dialog opens and saves cleanly; DevTools console shows zero new errors referencing `PresetSaveDialog` or `parameters`. | Assuming a pure type-level fix can't have a runtime effect — a bad narrowing cast at the call site (vs. the correct prop-type widen) could silently drop parameter data at save time; must actually save and inspect the resulting JSON (see PK.1 row 1) not just watch the dialog close. |

---

## PK.0a — History Ledger discipline (backend-only; shell-command oracle)

Non-scope explicitly excludes HistoryPanel UI (that's Lane-2). No app-visible surface to drive.

| # | Check (Setup + Drive) | Oracle | Trap |
|---|---|---|---|
| 1 | Shell: on the pre-packet tree, `cd frontend && npx --no vitest run src/__tests__/stores/ledger-lint.test.ts` (or wherever it lands). | Test FAILS on the pre-packet tree (anti-dead-flag proof — capture the failure output). | Writing the lint test loose enough that it trivially passes on both trees — the packet's own oracle requires the fail-then-pass transition, not just a final green. |
| 2 | Shell: same test, on the post-packet tree. | Test PASSES; full `npx --no vitest run` still green (no collateral breakage from renamed descriptions). | Fixing only enough call sites to make the NEW test pass while leaving other Wave-0-touched `project.ts` sites on the deny-list (bare `'Add effect'` etc.) — grep-count the remaining generic descriptions and confirm the count matches what the PR body claims, don't just trust the test result. |
| 3 | Shell: `grep -c "'Add effect'" frontend/src/renderer/stores/project.ts` before vs. after. | Count drops in Wave-0-touched paths per the PR body's stated delta. | Accepting "the lint test is green" as proof the actual strings improved — a lint test with a narrow deny-list could pass while `project.ts` still emits generic text through a code path the test doesn't cover. |

---

## PK.1 — Preset routes: schema + save + apply + instance addressing (UD-1) — RISK HIGH

User-facing via the existing "Save Chain as Preset…" dialog and the Presets apply flow (click/drag);
the hard oracles are byte/JSON-level, so most rows pair a UI Drive step with a shell/PIL Oracle.
**This is the load-bearing packet — `/qa-redteam` is mandatory on its PR per the plan; these rows are
its acceptance surface, not a substitute for that review.**

| # | Check (Setup + Drive) | Oracle | Trap |
|---|---|---|---|
| 1 (build-completion detector — EXPECTED-ABSENT pre-ship) | Setup: throwaway project, 2 effects, wire a Routing Canvas edge (Cmd+Shift+I) from an LFO to one effect's param. Drive: right-click the device chain → "Save Chain as Preset…" → save as `wave0-route-test`. Shell: `cat ~/Documents/Creatrix/Presets/wave0-route-test.glitchpreset \| jq '.chainData.routes, .presetSchemaVersion'`. | **Pre-PK.1:** `jq` returns `null`/key-absent for both fields (today's schema has no `routes` or `presetSchemaVersion` at all — confirmed code-ground). **Post-PK.1:** `chainData.routes` is a non-empty array of snake_case objects (`target_effect_id`, `target_param_key`, `depth`, …) and `presetSchemaVersion` is a number. | Treating "the dialog saved without error" as sufficient — pre-packet the dialog saves happily too, it just silently drops the route. Must inspect the actual JSON on disk. |
| 2 | Setup: preset from row 1 (post-PK.1, contains a route). Drive: apply it into a **fresh throwaway project** via the PresetBrowser card (click-apply). Shell: diff the applied route's `target_effect_id` in the reloaded project's saved JSON against the ORIGINAL preset file's `target_effect_id`. | The two ids differ (the applied route now points at the freshly-generated instance id, not the id captured at save time) — this is the id-remap test. Confirm functionally too: open Routing Canvas, the edge is visible and its target highlights the correct device. | Comparing only that "an edge exists post-apply" — a stale/dangling id that happens to render an edge in the UI (pointing at nothing, silently no-op) would still show a line on the canvas. Must confirm the id VALUE actually changed via the JSON diff, not just visual edge presence. |
| 3 (headline hard oracle — impossible pre-PK.1) | Setup: build (or hand-author) a preset containing **two `fx.datamosh` instances**, with a route targeting only ONE of them. Drive: apply into a fresh throwaway project; confirm both instances show nonzero datamosh params (effect-amount-nonzero precheck); press Play and let it run 3+ seconds. | Multi-frame screenshots (≥3, spaced ~1s) show the TARGETED instance's corruption pattern visibly changing frame-to-frame while the UNTARGETED instance's pattern stays static relative to its own un-driven baseline. This test must FAIL on main (TYPE-keyed collision — last-writer-wins) and PASS after PK.1. | Judging from a single frame (temporal effect — can't show "changing" in one screenshot) — or assuming both instances got routed because they render the same effect type and "look similar" at a glance. |
| 4 | Setup: preset with ≥1 macro captured on save (macros ARE captured today per code-ground — this row proves they now also APPLY). Drive: apply the preset; open Routing Canvas or Modulation Matrix. | An edge/mapping exists whose target `effectId`+`paramKey` matches the preset's `chainData.macros[]` entry — pre-PK.1 this is silently dropped (confirmed: no macro-materialization code exists in `onApplyPreset` today), so pre-ship this row FAILS (no such edge), post-PK.1 it PASSES. | Confirming only that the preset's saved JSON still contains the macro (that part already worked pre-packet) and stopping there — the packet's actual claim is APPLY-time materialization, which requires checking the post-apply live state, not the saved file. |
| 5 | Setup: apply a preset containing 3+ effects + a route + a macro (rows 1-4 combined) into a fresh throwaway project. Drive: immediately press Cmd+Z **exactly once**. | Screenshot before Cmd+Z (full chain + edges present) vs. after ONE Cmd+Z press: chain is back to the pre-apply empty state — proves the whole apply is ONE undo entry (`beginTransaction`/`commitTransaction("Apply preset: <name>")`), not N generic entries. | Pressing Cmd+Z repeatedly until the chain clears and calling that a pass — must verify it fully reverts after exactly one press; a "N `'Add effect'` entries" regression would still eventually clear given enough presses. |
| 6 | Setup: shell-craft a legacy-shape `.glitchpreset` (no `routes`, no `presetSchemaVersion` — mirrors pre-PK.1 output) by copying an existing old preset or hand-stripping those fields from a new one; drop it into `~/Documents/Creatrix/Presets/`. Drive: relaunch, open Presets tab, apply it. | Applies cleanly, no malformed-JSON toast, chain renders identical to the same preset applied on main today (screenshot compare). | Only testing NEW-shape presets (which trivially work) — the backward-compat claim specifically requires exercising a routes-ABSENT file; skipping this row leaves the fallback path unverified. |
| 7 | Setup: same throwaway project. Shell: copy a valid post-PK.1 preset and corrupt one route (`"depth": "NaN"` or drop a required key). Drive: apply the corrupted preset via the UI. | A visible reject signal appears (toast — record the LITERAL text observed) for the malformed route; the rest of the chain (valid effects) still applies; app does not crash. | Accepting total silence (preset "applies" with the malformed route just silently missing) as "handled gracefully" — the oracle requires a VISIBLE signal, not merely the absence of a crash; also confirm the malformed route didn't get applied with a garbage/NaN value instead of being skipped. |
| 8 (boundary) | Shell-craft two presets: one with exactly 24 effects, one with 25. Drive: attempt to apply/load both via the Presets UI. | The 24-effect preset loads and shows 24 devices in the chain; the 25-effect preset is rejected (schema `maxItems: 24`) with a visible signal, not silently truncated to 24 or silently accepted at 25. | Testing only comfortably-under-the-limit presets and never touching the boundary itself — off-by-one errors live exactly at 24/25. |
| 9 (regression — must not regress) | Setup: any clip with an effect. Drive: right-click the device chain, read the shortcut text next to "Save as Preset…" / "Save Chain as Preset…"; cross-check against Preferences → Shortcuts. | Byte-for-byte match between the context-menu shortcut hint and Preferences → Shortcuts (per `docs/UAT-CU-ADDENDUM-2026-07-03.md` X216-1) — PK.1 touches this same file surface and must not drift the label. | Only glancing at the context menu and not cross-checking Preferences — a stale keycap regression here is invisible without the cross-check. |
| 10 (regression — must not regress) | Drive: open "Save as Preset…", Tab through the dialog 20 times, then press Escape. | Focus stays trapped inside the dialog for all 20 tabs (X186-1); Escape closes it. | Assuming focus-trap behavior is unrelated to a prop-type fix — `PresetSaveDialog.tsx` is directly touched by this packet (both the type widen and the new routes-collection logic), so this regression check is not optional. |

---

## PK.2 — Presets Library folders (embeddable, UD-2)

**New UI, all EXPECTED-ABSENT pre-ship:** folder/pack navigation, a search box, and tag-filter chips
INSIDE the existing `PresetBrowser.tsx` (today: 85 lines, flat category filter buttons only, no
tree/search/tags — confirmed code-ground). Constraint: no new top-level tab/chrome — the sidebar's
`sidebarTab` stays 3-way (`effects | presets | instruments`).

| # | Check (Setup + Drive) | Oracle | Trap |
|---|---|---|---|
| 1 (build-completion detector — EXPECTED-ABSENT pre-ship) | Setup: at least one pack subfolder exists under `<Documents>/Creatrix/Presets/` (shell-create one if PK.3 hasn't landed). Drive: open the sidebar PRESETS tab. | **Pre-PK.2:** no folder/pack navigation exists — only flat category buttons. **Post-PK.2:** pack folders are browsable inside the PRESETS tab, AND the sidebar tab bar still shows exactly 3 tabs (`EFFECTS · PRESETS · INSTRUMENTS`) — no 4th/5th top-level tab was added. | Confusing the EffectBrowser's own internal 5-way sub-tab bar (`browser-tab-fx/op/composite/tool/instruments`) with a UD-2 violation — screenshot which tab bar you're inspecting before judging "new chrome." |
| 2 | Drive: type a substring of a known preset's name into the new search box. | Card list narrows to name-matching presets only; screenshot before/after shows the count drop. | A search box that exists visually but doesn't actually filter the rendered list — must confirm the DOM/count changed, not just that typing was accepted. |
| 3 | Drive: click a tag-filter chip. | Card list filters to tag-matching presets only. | Same trap as row 2 — cosmetic control vs. functional filter. |
| 4 | Setup: throwaway project with an empty device chain. Drive: drag a preset card from the browser onto the device chain (the existing `application/entropic-preset` drag channel). | Preset materializes on drop — same resulting chain as click-apply of the same preset. | Assuming drag "still works" because click-apply works — PK.2 explicitly must preserve the SAME drag channel; verify drag specifically, not just click. |
| 5 (headline hard oracle) | Setup: hand-build a chain matching a seed preset's spec (same effects/params/routes). Render/export via the **single-clip path** (not composite-preview, per MK.8) and save the frame. In a separate fresh throwaway project, apply the equivalent preset via PresetBrowser and render/export the same frame via the single-clip path. | PIL pixel-diff between the two exported frames is zero (or within a documented sub-visual tolerance). | Comparing two composite-preview screenshots instead of decoded single-clip export frames — this spuriously passes/fails on the unrelated MK.8 preview-vs-export gap, not on PK.2's actual correctness. |
| 6 (transparency invariant) | Setup: apply a full preset (chain + routes + macros) in a throwaway project; render/export a baseline frame BEFORE removing anything from a clean same-source clip. Drive: select all devices in the chain and remove them all. | Post-removal exported frame (single-clip path) is byte-identical (PIL) to a baseline frame of the same clip rendered with zero effects. | Judging "the chain looks empty" from the UI alone — an orphaned operator mapping or macro binding could survive removal and subtly alter the render even though the device-chain UI shows nothing; the byte-diff, not the screenshot, is the oracle. |
| 7 (agent-tool parity) | Setup: throwaway project. Drive: apply a preset via the same tool/IPC surface an agent would use (not human click/drag); separately apply the same preset via human click. | Resulting project state (chain/routes/macros) is identical between the two paths — JSON-diff the two saved projects. | Testing only the human path and asserting parity "because it's the same code underneath" without actually invoking the tool surface once. |
| 8 (backend-only, shell) | Shell: `grep -rn "UserFolder" frontend/src/renderer/stores/browser.ts` post-PK.2. | Either `UserFolder` now has a live caller wiring it into PK.2's folder storage, OR it has been deleted entirely — never both a dead `UserFolder` AND a newly-built parallel folder mechanism coexisting. | Accepting "folders work in the UI" as proof the old dead code was handled — the packet's own scope note requires an explicit reuse-or-delete decision; grep for it directly. |

---

## PK.3 — Seed 24 presets (primary oracle is a scripted loop; one CU spot-check)

Per the plan: "screenshot = human spot-check only, per UNIFICATION #97" — the pass/fail oracle is
the automated loop, not a screenshot. Depends on PK.1 (schema); browsing them depends on PK.2's
folder UI, noted per row.

| # | Check (Setup + Drive) | Oracle | Trap |
|---|---|---|---|
| 1 (backend-only, shell — the real oracle) | Shell: run the packet's automated integration loop (e.g. `cd backend && python -m pytest tests/test_presets/ -k seed -v`, or the documented equivalent) iterating all 24 seed presets: apply + render + hash. | 24/24 succeed; each output hash is recorded (not all identical to each other — a repeated hash across distinct presets means two presets rendered the same, a real bug); every effect id in the 24 presets resolves against the live registry (`list_all()`); zero references to `kuwahara`/`structure_tensor` (deferred, unbuilt effects). | Accepting "the loop exited 0" without inspecting the hash table for suspicious duplicates, or without the registry-id cross-check — a preset silently no-op'ing to a blank/default render would still "succeed" without those checks. |
| 2 (CU spot-check — corroborating evidence, NOT the oracle) | Depends on PK.2 folder UI. Setup: none. Drive: open PRESETS tab, browse into a pack folder, click one named 🟢 seed preset (e.g. a `cyanotype` or `datamosh`-based row from `PRESET-TOP50.md`) to apply on a clip. | Screenshot shows a non-black, visually-distinct render matching the preset's expected look — human sanity check only. | Treating this screenshot as sufficient acceptance — a preset that LOOKS fine here but fails the row-1 hash/registry check is still a FAIL; this row can never override row 1. |
| 3 | Setup: identify the ≥1 preset per pack required (per hard oracle) to carry both a route AND a macro. Drive: apply it, open Routing Canvas or Modulation Matrix. | At least one edge/mapping is visible corresponding to the preset's bundled route or macro — proves the full-bundle path (not just a flat effects list) was actually exercised for at least one seed. | Verifying only that the 24 presets render (row 1) without ever confirming at least one of them actually rides the route+macro materialization path added by PK.1 — a roster of 24 "effects-only" presets would pass row 1 but fail this requirement silently. |

---

## PK.4 — `_mix` mappable macro

**New UI, EXPECTED-ABSENT pre-ship:** a wet/dry knob on every device card (using the existing
`Knob.tsx` convention — explicitly NOT the unbuilt Knob-v3), plus `_mix` becoming a selectable
target in the operator-mapping picker. Backend needs zero changes (verified: injection/bounds/pop
already live) — these rows are entirely about wiring the frontend to what already exists.

| # | Check (Setup + Drive) | Oracle | Trap |
|---|---|---|---|
| 1 (build-completion detector — EXPECTED-ABSENT pre-ship) | Setup: throwaway project, add any effect to a device chain. Drive: inspect the DeviceCard for a wet/dry control. | **Pre-PK.4:** no such control exists on the card. **Post-PK.4:** a wet/dry knob is present, styled per the existing `Knob.tsx` convention (compare visually against another knob already on the same card — NOT the unbuilt Knob-v3 single-circumference spec), default reads 100%/1.0. | Mistaking any existing knob-like control on the card for the new one — confirm via label/tooltip that it specifically targets `_mix`. |
| 2 | Setup: add an effect with visible params, export/render a frame at default settings. | Exported frame is byte-identical (PIL/hash) to a pre-PK.4 baseline render of the same effect+params — proves default `1.0` changes nothing. | Skipping the actual byte-compare and assuming "default = same as before" because the number reads 100% — a default that's wired to the wrong param key could still show 100% while altering the render. |
| 3 | Drive: drag the new `_mix` knob to 50%, render/export. | Exported frame is a genuine ~50/50 blend between a dry-only render and a `_mix=1.0` (full-wet) render of the same effect — sample a few pixel coordinates via PIL and confirm mid-range values, not just "some blend happened." | Confirming the knob's on-screen VALUE moved to 50% without ever rendering/exporting to check the pixel-level blend — a knob wired to a no-op param would still show "50%" in its own readout. |
| 4 | Drive: drag `_mix` to 0%, render/export. | Exported frame is byte-identical to that same effect being fully bypassed/removed from the chain. | Eyeballing "looks about the same" — even a small residual wet signal (e.g. 1-2%) looks visually identical but fails a byte-diff; the oracle is the diff, not the glance. |
| 5 (temporal, multi-frame; new mapping target EXPECTED-ABSENT pre-ship) | Setup: Routing Canvas/Modulation Matrix, attempt to map `audio.rms` → the effect's `_mix` target. Confirm `_mix` is even selectable in the target picker (this itself is new — pre-PK.4 it isn't a valid target). Drive: press Play with audio playing, observe 3+ frames. | **Pre-PK.4:** `_mix` is absent from the picker's target list. **Post-PK.4:** it's selectable, and multi-frame screenshots show the effect's wet/dry balance visibly varying in sync with the audio level (precheck: confirm the underlying effect's own params are nonzero before judging modulation absent). | Judging from a single frame (temporal effect) or from a target picker snapshot alone without ever pressing Play to confirm the modulation is LIVE, not just wired-but-inert. |
| 6 (backend-only, shell) | Shell: `cd backend && python -m pytest tests/test_effects/test_calibration.py -k "unit or curve" -v`. | Green, including the new `_mix` `ParamDef` (this is the SAME gate PK.00 fixed for `fx.copy_machine` — PK.4 must satisfy it independently for `_mix`, not inherit the earlier fix). | Assuming PK.00 already "fixed the calibration test" so PK.4 is covered for free — PK.00's fix was for a different param; `_mix` needs its own `unit`+`curve` metadata to pass this same test. |

---

## PK.5 — Edge-curve applied + enum picker (UD-5)

**New UI, EXPECTED-ABSENT pre-ship:** a curve enum-picker inside `B9EdgeInspector.tsx` (the live
per-edge inspector mounted at `OperatorRack.tsx:323` — today renders depth/polarity/delete/
bindingRule ONLY, confirmed code-ground). A **separate, also-live** component,
`routing-canvas/EdgeInspector.tsx` (mounted at `RoutingCanvas.tsx:523`), gets a stale-comment fix
ONLY — no new UI ships there; do not confuse the two.

| # | Check (Setup + Drive) | Oracle | Trap |
|---|---|---|---|
| 1 (build-completion detector — EXPECTED-ABSENT pre-ship) | Setup: Operator Rack, create an operator→param mapping edge, select it to open its inspector. Drive: read the inspector's field list. | **Pre-PK.5:** fields are depth / polarity / delete / bindingRule only, no curve control. **Post-PK.5:** a curve enum-picker appears offering 5 values: `linear / exponential / logarithmic / s-curve / smoothstep`. | Opening the WRONG inspector — `RoutingCanvas.tsx:523`'s `EdgeInspector.tsx` never gets this picker (comment-fix only). Confirm you opened `B9EdgeInspector` via Operator Rack, not the Routing Canvas (Cmd+Shift+I) one, before judging absence/presence. |
| 2 (backend-only, shell) | Shell: `grep -A3 "DEFERRED" frontend/src/renderer/components/routing-canvas/EdgeInspector.tsx`. | The stale "curve … DEFERRED (B4-full; no backend storage exists for them yet)" comment is gone/updated post-PK.5. Pair with a screenshot confirming that component's own UI STILL shows no curve picker (comment-only fix). | Treating "comment updated" as license to also expect a picker in this file — the packet explicitly does NOT add UI here; a picker showing up in this component would be scope creep, not a bonus. |
| 3 (headline hard oracle — silent-change guard) | Setup: locate a mapping/preset created BEFORE PK.5 (curve field absent or `'linear'`) — reuse the legacy preset from PK.1 row 6 if convenient. Drive: render/export a frame driven by that old mapping, both pre- and post-PK.5. | PIL diff between the two renders is zero — turning curve-application ON must be a no-op for `linear`/absent. | Testing only a mapping created AFTER the picker exists (which trivially defaults clean) — the regression this guards against specifically requires an OLD mapping/preset that predates the picker. |
| 4 (temporal, multi-frame) | Setup: an LFO→param mapping. Drive: in `B9EdgeInspector`, set curve to `smoothstep`; press Play across several frames. Repeat with the same mapping set to `linear`. | Multi-frame screenshots show a visibly different modulation shape/timing between the two curve settings (ease-in/out vs. constant rate) — cannot be judged from one paused frame. | Comparing two single-frame screenshots (one per curve setting) at arbitrary, non-matched timeline positions — must compare at the SAME playhead position/phase across both curve settings, and across multiple frames each. |
| 5 | Drive: set curve to `s-curve`, save project, quit + relaunch, reload, reopen the same edge's inspector. | Picker still shows `s-curve` selected (not reset to a default); render at the same frame matches the pre-save render. | Confirming only that the picker's VALUE round-trips in the UI without also confirming the RENDER still matches — a UI-only round-trip bug (correct label, stale applied value) would pass a naive check. |
| 6 (scope-discipline, confirms NOT built) | Drive: inspect `B9EdgeInspector` for any draggable-points/Bezier control. | Absent — deferred to K1 per UD-5; this is a permanent expected-absence for THIS packet, not a build-completion detector to flip later within Wave 0. | Filing "points editor missing" as a PK.5 bug — it's explicitly out of scope, deferred by decision, not an oversight. |

---

## Definition of done — end-to-end journey

**Story:** a musician opens Creatrix, browses the seed preset library, applies a fully-wired preset
(routes + macros + a duplicate-effect-type chain) with one click, watches real temporal modulation
during playback, tweaks a curve and a wet/dry knob live, saves their tweaked chain as a new preset,
quits and relaunches, reloads, undoes the whole session in one step, and exports — with the export
matching what they saw in preview. This exercises PK.1 through PK.5 as one continuous path, not five
isolated features.

| Step | Action | Oracle | Trap |
|---|---|---|---|
| 1 | Launch DEV Electron fresh, confirm sidecar connects (`Engine: Connected`). New Project. Import a clip. | No startup error toast; clip imports and previews. | Skipping the live-runtime check (confirm this is the DEV build, not `~/Desktop/Creatrix.app`). |
| 2 | Open PRESETS tab (sidebar), browse into a pack folder (PK.2/PK.3), and click-apply a seed preset that is documented to bundle a route + a macro + two same-type effect instances. | Chain populates with the expected effect count; Routing Canvas shows the bundled route as a live edge targeting the correct (post-remap) instance; a macro-derived mapping is also visible. | Applying a preset that turns out to be effects-only and calling the journey "done" — pick the specific bundled preset the hard oracles require. |
| 3 | Press Play, let it run 5+ seconds. | Multi-frame screenshots show the routed effect instance visibly modulating while the untargeted same-type instance does not (PK.1's duplicate-effect-type invariant, alive in a real user flow, not just a synthetic test). | Verdicting from one paused frame. |
| 4 | Open the routed edge's inspector (`B9EdgeInspector` via Operator Rack), change curve from `linear` to `smoothstep`. Play again. | Modulation shape visibly changes (ease-in/out) vs. step 3's linear behavior. | Comparing at a different playhead phase than step 3, making the "difference" ambiguous. |
| 5 | On one device card, drag the new `_mix` knob to 60%. | Preview visibly shows a partial wet/dry blend (not full-wet, not bypassed). | Not actually rendering/exporting later to confirm this blend holds at export time too (step 8 closes this). |
| 6 | Right-click the device chain → "Save Chain as Preset…" → save as `wave0-dod-test`. | Saved `.glitchpreset` JSON (shell `cat \| jq`) contains the edited curve value and a route reflecting the current knob/mix state, in the wire (snake_case) shape. | Trusting the dialog's "Saved" confirmation without inspecting the actual file contents. |
| 7 | Quit the app fully. Relaunch. File → Open Recent → reload the project. | All of the above (routed edge, curve=smoothstep, `_mix`=60%, duplicate-instance targeting) survives the round-trip, verified control-by-control against pre-quit screenshots. | Trusting a visual "looks the same" without checking the specific values (curve dropdown, `_mix` knob readout) individually. |
| 8 | Export the clip (File → Export, single-clip path). Decode 2-3 frames with PIL and compare against the corresponding live-preview screenshots at the same timeline positions. | Exported frames match preview (no preview≠export drift) — this is the MK.8-adjacent parity check applied to the FULL combined feature set, not one packet in isolation. | Comparing composite-preview to export instead of the single-clip decoded frames, per the MK.8 landmine. |
| 9 | Back in the app (pre-export state or a fresh Cmd+Z chain), press Cmd+Z repeatedly and count how many presses fully revert the ORIGINAL preset-apply (step 2) back to an empty chain. | Exactly ONE undo entry reverts the entire preset-apply (routes + macros + effects), independent of however many additional edits (curve, `_mix`) were layered on top as their own separate undo steps. | Conflating "the whole session reverts in one Cmd+Z" (wrong — curve/mix edits are separate ops) with "the preset APPLY itself is one entry" (the actual PK.1 claim) — isolate the apply step's own undo boundary. |

**GO/NO-GO:** GO only if every numbered step above passes on its stated oracle AND every packet
section's headline hard-oracle rows (PK.1 rows 3/5, PK.2 rows 5/6, PK.4 rows 2/4, PK.5 row 3) pass.
A green happy path with any headline row failing is a NO-GO — per the house rule, interactions and
silent-regression guards are where this class of change actually breaks.
