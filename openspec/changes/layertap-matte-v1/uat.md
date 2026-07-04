# UAT — layertap-matte-v1 (PRE-BUILD)

**Status:** written BEFORE build starts. Traces to `packets.md` (PK.1–PK.8 contracts) and
`plan.md` (wire contracts §9.1–§9.4/§10.4, code ground truths #1–#21, post-reinforcement/T1
override — full `stage: pre AND post`, full 9-value read taxonomy). Run this doc AFTER each
packet merges, **in packet order PK.1 → PK.8**. A row for a packet that hasn't merged yet is
EXPECTED TO FAIL/BE-ABSENT — that failure IS the build-completion detector for that packet,
not a false negative. Do not skip a row because "the packet obviously isn't built yet";
running it and confirming the correct ABSENT state is itself evidence.

**Runtime protocol (inherited verbatim from `docs/UAT-PLAN-2026-07-02-live-cu.md`):** launch
from the canonical checkout (`cd ~/Development/entropic-v2challenger/frontend && npm start`);
verify the running app's process path matches the edited tree before any verdict; store-shape
changes since last launch → kill + relaunch, never trust HMR; screenshot per verdict; verdicts
✅ ❌ 🐛 ⏸ only, no partials.

**Hard rules (binding on every row below):**
1. **Temporal/stateful effects → verdict only during multi-frame Play** (learning #44). Applies
   to: PK.3 stateful-device single-invocation + cycle determinism, PK.5 motion, PK.8 stage
   toggle / post-stage thumbnail. A single paused frame or an instant post-click screenshot
   proves nothing for these rows.
2. **Alpha/matte claims → export + PIL, never preview** (this repo's own frame pipeline —
   decode→apply_chain→encode_mjpeg→base64→`<img>` — is JPEG/MJPEG and drops alpha). Applies to
   PK.4 `alpha` read, PK.7/PK.8 `ai_person` read, and step 6/8 of the Definition-of-Done journey.
3. **Destructive steps → throwaway project only** (track deletion PK.8, hand-edited project
   JSON PK.1/PK.6). Never a real user project.
4. **Effect-amount-nonzero precheck before any "render broken" verdict** — confirm gain/gamma
   are at non-degenerate values and the source track has real visible/alpha content before
   concluding a tap "doesn't work."
5. **Every row exercising NEW UI is marked EXPECTED-ABSENT pre-packet** — before that packet
   merges, the control must be confirmed literally missing (screenshot the panel showing its
   absence), not assumed missing from memory of the current build.

---

## PK.1 — Schema: 9th kind + full param surface + evaluator registration (backend-only, no UI)

| # | Check (Setup + Drive) | Oracle | Trap |
|---|---|---|---|
| PK1-1 | Setup: none (direct backend invocation). Drive: pre-merge, run `cd backend && python -c "from src.masking.schema import MatteNode; print(MatteNode.from_dict({'id':'t','kind':'layer','params':{'track_id':'A','stage':'pre'},'op':'add','invert':False,'feather':0,'growShrink':0,'enabled':True}))"`; post-merge, run the SAME command for both `stage: pre` and `stage: post`. | Pre-merge → prints `None` (kind rejected today, `schema.py:150-152`). Post-merge → prints a real `MatteNode` object (not `None`) for both stage values. | Accepting "no crash" as proof of acceptance — `from_dict` returning `None` on an unrecognized kind is the CURRENT correct silent-reject behavior; only a non-`None` object is the anti-dead-flag proof PK.1 actually shipped. |
| PK1-2 | Setup: build a payload with `params: {}` (no `track_id`). Drive: `MatteNode.from_dict(...)` then `resolve_stack([node], ctx, (64,64))` for `pre`/`post` × `luma`/an unknown read string. | Node parses (not dropped); `resolve_stack` returns a `(64,64)` float32 array of exactly `0.5`, no exception, for every combination. | Treating a raised exception OR a dropped node as acceptable degrade — the §9.1 contract is specifically "missing `track_id` → flat-0.5," not reject-at-parse. |
| PK1-3 | Setup: payload with `gain: 99`, `gamma: -5`. Drive: parse then re-serialize (`to_dict()`), READ the values back. | `gain` clamps to `4.0` (not 99); `gamma` clamps to `0.2` (not -5) — confirmed from the round-tripped object, not just "it didn't error." | Checking only that out-of-range values don't crash the parser while never reading back the clamped value — an unclamped 99 that "doesn't error" is a silent contract violation. |
| PK1-4 | Setup: payload A with `read_params: {hue: 200, softness: 45}` (colorkey shape); payload B with `{matte_path: "/tmp/x.png", start_frame: 3}` (ai_person shape). Drive: round-trip both through backend `MatteNode.from_dict → to_dict()` AND frontend `validateMatteNode` (targeted vitest run if PK.1 added one, else a scratch script importing `project-persistence.ts`). | Both `read_params` dicts round-trip byte-for-byte (every key AND value present) on BOTH backend and frontend paths. | This is the regression plan.md names explicitly (`_sanitize_params`'s own comment says dict values are DROPPED today) — a shallow "node parses" check misses `read_params` silently vanishing; must re-read the dict back out, not just confirm no exception. |
| PK1-5 | Setup: none. Drive: `grep -rn "test_numeric_params_have_unit" backend/tests/`, then run that calibration test against a project containing a `'layer'` node's `gain`/`gamma`. | The PR body explicitly states whether the calibration harness scans mask-stack params at all; if it does and flags them, `gain` (unit `linear`) / `gamma` (unit `gamma`, curve `linear`) metadata was added to make it pass. | Silently skipping a failing calibration check and shipping anyway — the packet's own STOP condition forbids this; confirm the PR body actually states the verdict, don't assume "tests are green" answered this specific question. |

## PK.2 — Pre-stage cross-layer frame cache + compositor wiring (backend-only, HIGH risk)

| # | Check (Setup + Drive) | Oracle | Trap |
|---|---|---|---|
| PK2-1 | Setup: none beyond the merged commit. Drive: `cd backend && python -m pytest tests/test_layer_tap_composite.py -k "pre" -v --tb=short`, then OPEN the test file to read case (a)'s assertion. | All pre-stage cases (a)-(e) pass AND case (a)'s assertion literally checks correlation with track A's real pre-chain luma — not merely "output differs from zero." | Trusting a green pytest summary count without opening the file — a tautological assertion (any nonzero output passes) would still show green while missing a placeholder-constant regression. |
| PK2-2 | Setup: none. Drive: `python -m pytest tests/test_layer_tap_composite.py -k "fan_out or rollback" -v --tb=short`, then the FULL regression: `python -m pytest -x -n auto --tb=short`. | Fan-out counter reads exactly 1 (not N); rollback call-count instrumentation shows the pre-pass function called ZERO times for a `'layer'`-free project; full suite green. | Running only the new tests and declaring victory — the rollback guarantee ("byte-identical for every existing project") is only credible if the WHOLE pre-existing suite stays green; skipping the full-suite run is the exact rubber-stamp this row catches. |
| PK2-3 | Setup: none. Drive: `python -m pytest tests/test_layer_tap_composite.py -k "group or rack or sample" -v --tb=short` (Sample-Rack/group-layer case). | Tap resolves to a real (non-0.5) value via `composite_tree.py::expand_group_layer`'s ctx — not a silent flat-0.5 degrade. | This is the ONE case code ground truth #21 exists for — verifying only the top-level `_handle_render_composite` cases (a)-(d) and never a Sample-Rack leaf/branch tap would rubber-stamp a config that silently degrades forever inside racks. |

## PK.3 — Post-stage cross-layer dependency pass + cycle guard (backend-only, HIGHEST risk)

| # | Check (Setup + Drive) | Oracle | Trap |
|---|---|---|---|
| PK3-1 | Setup: none. Drive: `python -m pytest tests/test_layer_tap_composite.py -k "post and stateful" -v --tb=short` — open the test body to confirm it runs **≥3 consecutive frames** (Hard Rule 1). | The stateful device's internal counter advances by EXACTLY 1 per frame across all 3+ frames, not 2. | A single-frame assertion would still read "green" under a 2x-per-frame double-invocation bug that only manifests as drift over multiple frames — confirm the multi-frame loop actually exists in the test. |
| PK3-2 | Setup: none. Drive: `python -m pytest tests/test_layer_tap_post_order.py -v --tb=short` AND `test_layer_tap_composite.py -k "cycle"`; then construct the SAME 2-cycle project with node creation order swapped (A-then-B vs B-then-A) and diff which edge broke. | Both creation orders degrade the SAME lex-smallest-id edge. | Mirrors X283-1's exact trap — a declaration-order fallback looks "deterministic" within one creation order; only swapping the order proves it's lex-based, not order-based. |
| PK3-3 | Setup: none. Drive: `python -m pytest tests/test_layer_tap_composite.py -k "parity and post" -v --tb=short` — read the assertion. | Byte-identical composited frame AND byte-identical resolved matte value across `_handle_render_composite` and `_composite_export_frame` for the same frame index — confirm a literal `np.array_equal`/hash compare, not a visual/approximate check. | Preview/export parity is flagged as "a house landmine, not optional" — accepting a test that only checks "both rendered something" misses silent drift between the two call sites. |
| PK3-4 | Setup: none. Drive: `python -m pytest tests/test_layer_tap_composite.py -k "rollback and post" -v --tb=short`, then full regression `python -m pytest -x -n auto --tb=short`. | Call-count instrumentation on the dependency-graph builder shows ZERO calls for a project with zero post-stage `'layer'` nodes (even if pre-stage nodes exist); full suite green. | Confirming the pre-only path "still works" is not the same as confirming the SECOND pre-pass never even executes — read the call-count assertion specifically. |

## PK.4 — Read taxonomy: luma · R · G · B · alpha (backend-only)

| # | Check (Setup + Drive) | Oracle | Trap |
|---|---|---|---|
| PK4-1 | Setup: none. Drive: `python -m pytest tests/test_layer_tap_composite.py -k "luma or r_read or g_read or b_read" -v --tb=short`, for both stage values. | Each of the 4 direct-channel reads extracts a value matching a synthetic frame's KNOWN per-channel values — confirm the fixture sets specific values and asserts an exact match, not just "field is nonzero." | Accepting "the field is nonzero" as proof of correctness — must confirm the fixture asserts the SPECIFIC known value, not merely presence of signal. |
| PK4-2 ⚠ALPHA | Setup: throwaway project; a clip with real alpha (ProRes 4444 or PNG-sequence source) tapped by another clip with `read: alpha`; also test an alpha-LESS source. Drive: **export** the composite (never judge from the live preview canvas), decode with `python -c "from PIL import Image; im=Image.open('export_frame.png'); print(im.getchannel('A').getextrema())"`. | Alpha-bearing source → decoded alpha matches the source's real alpha (not flat); alpha-less source → decoded field uniformly `1.0` per §10.4. | Judging alpha from the PREVIEW canvas — the preview pipeline is MJPEG/base64 and drops alpha entirely; a preview screenshot that "looks like it's working" is not evidence. ONLY export + PIL counts (Hard Rule 2). |
| PK4-3 | Setup: none. Drive: `grep -n "C_CONTIGUOUS\|ascontiguousarray" backend/src/masking/stack.py` and read the merged PR's description. | The hot-path array feeding gain/gamma/invert is confirmed C-contiguous, and the PR description cites this per the packet's own "paste it verbatim" instruction. | Accepting a merged PR without checking its description actually contains the contiguity note — this is a perf-regression class (PR #416's 4.7x mandate) invisible to functional tests; the row exists to catch a merge that skipped this evidence requirement. |

## PK.5 — Read taxonomy: motion · edges (backend-only, HIGH, temporal + stateful)

| # | Check (Setup + Drive) | Oracle | Trap |
|---|---|---|---|
| PK5-1 ⚠TEMPORAL | Setup: none. Drive: `python -m pytest tests/test_layer_tap_composite.py -k "motion" -v --tb=short` — READ the test to confirm it exercises **≥3 consecutive frames** (Hard Rule 1). | Frame-0 (no prior state) → uniformly `0.5` field (NOT `0.0` — the deliberate T1 divergence from the scalar analyzer's convention); frame-2 with a known changed region → elevated exactly there; frame-1 stays flat `0.5`. | A single-frame test can only ever see the frame-0 case and never exercises the delta computation — confirm the test's frame count directly; this is learning #44 transplanted into a unit test. |
| PK5-2 | Setup: none. Drive: `python -m pytest tests/test_layer_tap_composite.py -k "motion and determin" -v --tb=short`; independently re-run the SAME 3-frame sequence twice and diff. | `np.array_equal` (exact) byte-identical motion fields on frames 2/3 across both runs. | Accepting an approximate (`np.allclose` with nonzero tolerance) comparison — the contract requires BYTE-IDENTICAL, not "close enough." |
| PK5-3 | Setup: none. Drive: `python -m pytest tests/test_layer_tap_composite.py -k "motion and fan" -v --tb=short`. | Instrumented counter shows the `tap_prev` state write happens exactly ONCE per frame regardless of consumer count. | Testing only a single consumer misses a double-write bug that only appears with 2+ consumers reading `motion` off the same `(track_id, stage)` in one frame. |

## PK.6 — Read taxonomy: colorkey (Δhue / softness) (backend-only)

| # | Check (Setup + Drive) | Oracle | Trap |
|---|---|---|---|
| PK6-1 | Setup: none. Drive: `python -m pytest tests/test_layer_tap_composite.py -k "colorkey" -v --tb=short`. | Field ≈1.0 at the exact target hue, monotonic falloff as hue param moves away; `read_params: {}` (all defaults) matches an explicit `{hue: 120, softness: 60}` call BYTE-FOR-BYTE. | "Some default falls off reasonably" is not "the default is EXACTLY 60°" — a test with a loose tolerance on the default-equals-explicit comparison would rubber-stamp a wrong default that still looks plausible. |

## PK.7 — Read taxonomy: ai_person (backend + one frontend store fn, no UI yet)

| # | Check (Setup + Drive) | Oracle | Trap |
|---|---|---|---|
| PK7-1 ⚠ALPHA | Setup: throwaway project, a pre-baked matte file; build an `ai_matte`-kind node AND a `'layer'` tap node with `read: ai_person`, both pointing at the same file. Drive: `python -m pytest tests/test_layer_tap_composite.py -k "ai_person" -v --tb=short`; separately export both and PIL-diff the two exported alpha channels. | Byte-identical values between the two node kinds (proves verbatim call-through) — checked via decoded EXPORT files, never the preview (Hard Rule 2). | Same trap as PK4-2 — do not accept a preview-canvas screenshot as matte evidence; alpha only survives in the exported file. |
| PK7-2 | Setup: a `read_params.matte_path` pointing outside the allowed jail (path-traversal-shaped or an absolute path outside project asset dirs). Drive: resolve via `evaluate_layer_tap`, trace filesystem access. | Flat 0.5, no exception, and NO file read occurred outside the jail — confirm via an access trace, not just "the function returned something." | Flagged in packets.md as the packet's most-likely regression (jail-check called against the wrong id) — a test that only checks "doesn't crash" without confirming zero out-of-jail reads would miss a traversal that returns harmless-looking garbage. |
| PK7-3 EXPECTED-ABSENT-UI | Setup: none — no UI exists for this yet (PK.8 owns the button). Drive: `cd frontend && npx --no vitest run -t "generateAiMattePreviewForTrack"`. | Store-level test confirms the function is called with the TAPPED track's id (not the consuming clip's id) and calls `updateMatteNode` (not `addAiMatteNode`). | Do not treat this store-level pass as sufficient — it is RE-TESTED at UI-integration level in PK8-7; packets.md names this "the regression most likely to survive a unit-level pass but fail at integration." |

## PK.8 — MaskStackPanel UI: tap chip (stage toggle + full read dropdown) + hover-audition (USER-FACING)

| # | Check (Setup + Drive, literal/quoted UI labels) | Oracle | Trap |
|---|---|---|---|
| PK8-1 EXPECTED-ABSENT pre-packet | Setup: open a project, select a clip with a matte stack, open MaskStackPanel (auto-opens). Drive: look for a header control literally labeled **"+ From layer…"**. | Pre-PK.8: control does NOT exist — screenshot the header showing only existing controls. Post-PK.8: control exists, clickable, opens a track picker. | This row IS the build-completion detector for PK.8's header control — a pass that skips actually looking for the literal string "+ From layer…" and infers absence/presence from memory is not falsifiable. |
| PK8-2 | Setup: throwaway project, tracks A and B, clip on B selected, panel open. Drive: click **"+ From layer…"**; inspect the track list; hover candidate track A and wait ~150ms. | Track B (clip's own track) is ABSENT from the list (OD-5); a live thumbnail appears in the picker within the ~150ms debounce — timestamp before/after screenshots, not "eventually appears." | Confirming the thumbnail appears without checking the picker excludes B — a picker offering self-taps invites the OD-5 backend-graceful-but-useless flat-0.5 self-reference. |
| PK8-3 | Setup: continue from PK8-2. Drive: commit the picker selection (click track A). | New tap chip on B's stack: `stage: pre` (HOLLOW, per PRD decision 3), `read: luma`, live thumbnail matching A's current frame — screenshot, visually confirm hollow. | Confirming "a chip appeared" without checking its DEFAULTS are exactly `pre`/`luma` — a chip silently defaulting to `post` is a spec violation invisible unless the toggle's literal state is checked. |
| PK8-4 ⚠TEMPORAL | Setup: build A's clip with an OBVIOUS device (e.g. Invert) so pre/post are visually distinct, per the packet's own UAT-journey text. Drive: toggle B's chip stage control hollow→filled (post); **wait for the async re-fetch to complete, then observe across the live composite, not an instant click-frame**. | Thumbnail/composite updates to reflect A's POST-chain (inverted) frame, visibly distinct from PK8-3's pre-chain thumbnail. | Screenshotting immediately post-click, before the re-fetch completes, and calling "no visible change" a failure — confirm the loading state cleared first (Hard Rule 1). |
| PK8-5 | Setup: continue from PK8-4. Drive: open the read dropdown; cycle through all 9 values (`luma, R, G, B, alpha, motion, edges, colorkey, ai_person`), screenshotting each. | Each of the 9 renders a visually DISTINCT, non-crashing thumbnail; `colorkey` shows hue/softness inputs; `ai_person` shows a **"Generate matte"** button. | Clicking through quickly and confirming "no crash" without diffing thumbnails pairwise — a dropdown wired to the UI but whose branches all silently fall through to `luma` would still "not crash" while being functionally broken. |
| PK8-6 ⚠DESTRUCTIVE | Setup: SAME throwaway project (never a real project, Hard Rule 3). Drive: delete track A. | B's chip flips to red-dashed using the `--cx-error` design-token class (inspect computed style in DevTools, not eyeballing a red pixel), exactly ONE toast fires (rate-limited, source-keyed). Then Cmd+Z: chip recovers. | Confirming "chip goes red" without (a) checking it's the token class not a raw hex, and (b) counting toast occurrences exactly once — a spammy per-frame toast looks fine on a quick glance. |
| PK8-7 | Setup: a tap chip with `read: ai_person` selected. Drive: click **"Generate matte"**; observe which track's asset gets baked (progress toast text / resulting `matte_path`). | Bake targets the SOURCE (tapped) track's asset, not the consuming clip's own asset; `updateMatteNode` called, `addMatteNode`/`addAiMatteNode` NOT called again. | Named in packets.md as "most likely to survive a unit-level pass but fail at integration" — do not skip this because PK7-3 passed; the chip's click handler could still wire the wrong id. |
| PK8-8 | Setup: continue in the same project. Drive: open the undo history panel; find the entry for PK8-3's commit. | Entry reads **"Add layer matte"** (or equivalent kind-specific text containing "layer") — NOT the generic "Add matte node". | X216-1-shaped trap — glancing and confirming "an entry exists" without reading its literal text. |
| PK8-9 | Setup: existing test suite. Drive: `cd frontend && npx --no vitest run DeviceCard` with a `'layer'`-kind node present in `maskNodes`. | Existing `DeviceCard.tsx` suite passes UNMODIFIED, for both stage values — empirically proves code ground truth #8/#9. | Assuming "DeviceCard wasn't touched in this packet's diff, so it must still work" — the Test plan requires this be RUN, not inferred from the file-ownership map. |

---

## Definition of done — end-to-end journey (run only once PK.1–PK.8 are ALL merged)

**Setup:** throwaway project. Import 2 clips onto tracks A and B; give A's clip an obvious
device (e.g. Invert) in its chain and a source with real alpha (ProRes 4444/PNG-sequence).

1. Select B's clip, open MaskStackPanel, click **"+ From layer…"** — confirm A appears, B does
   not (own-track exclusion). Hover A, confirm a live thumbnail within ~150ms. Commit.
2. Confirm the new chip: `stage: pre` (hollow), `read: luma`, thumbnail matching A's current
   pre-chain frame. Screenshot.
3. Toggle stage to `post` (filled). **Across a multi-frame Play, not a single click-frame**
   (Hard Rule 1), confirm the composite reflects A's POST-chain (inverted) output.
4. Switch read to `colorkey`; dial hue/softness to a color known-present in A; confirm a
   visually distinct falloff thumbnail vs. the luma view.
5. Switch read to `alpha`. **Export** the composite (never judge from preview, Hard Rule 2);
   decode the exported frame with PIL; confirm the decoded alpha channel matches A's real alpha
   channel (not flat/opaque).
6. Switch read to `ai_person`; click **"Generate matte"**; confirm the bake targets track A (not
   B); wait for completion; confirm B's composite now reflects A's subject matte.
7. Delete track A (throwaway project only, Hard Rule 3). Confirm B's chip goes red-dashed
   (`--cx-error` token) with exactly one toast. Export the current frame; PIL-confirm the
   affected region reads flat mid-gray (~0.5), not black and not a crash.
8. Undo (Cmd+Z). Confirm the chip recovers and its thumbnail returns.
9. Open the undo history panel; confirm the original add-entry reads **"Add layer matte"** (or
   kind-specific equivalent), not the generic string.
10. Save → quit the app fully → relaunch → reload the project. Confirm the tap node's full
    state (stage, read, `read_params`, gain, gamma) round-trips exactly, control-by-control
    against pre-save screenshots.
11. Run the full regression suite: `cd backend && python -m pytest -x -n auto --tb=short` and
    `cd frontend && npx --no vitest run`. Both green — proving the rollback guarantee held for
    every non-`'layer'` project throughout the whole build, not just this journey's project.

**Oracle:** every numbered step's oracle above must independently hold. The journey FAILS if
any step needs undocumented knowledge, silently produces wrong output, or requires falling back
to hand-editing project JSON (which is only ever a PRE-BUILD stand-in for the not-yet-built UI,
never something the shipped feature should require of a user).

**Trap:** treating 8 individually-green packet passes as sufficient. The composability failure
class — where gain/gamma/stage/read/export/undo/persistence intersect — is where real features
break even when every packet's isolated oracle passed; this journey, not the packet ledger, is
what proves the FEATURE works end-to-end.
