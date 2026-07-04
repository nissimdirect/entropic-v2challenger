# UAT — fx-backspin (PRE-BUILD)

**Companion docs whose runtime protocol applies verbatim:** `docs/UAT-PLAN-2026-07-02-live-cu.md`
(launch from the canonical checkout `cd frontend && npm start`, live-runtime path check before any
verdict, kill+relaunch on any store-shape change, throwaway projects for destructive steps, evidence =
screenshot-per-verdict, verdicts ✅ ❌ 🐛 ⏸ only) and `docs/UAT-CU-ADDENDUM-2026-07-03.md` (row/table
style, Trap-column discipline). Source contract: `openspec/changes/fx-backspin/plan.md` (normative
param table + semantics, §1–§5) and `packets.md` (P1–P5 scope/oracle split). Do not re-derive
normative values — every quoted param name, choice value, and preset curve below is copied verbatim
from `plan.md` §1.

**Why this doc exists (pre-build):** authored BEFORE any fx-backspin packet has merged. Every
new-UI/new-behavior row is **EXPECTED-ABSENT** today — running this suite against current `main`
should draw zero backspin surface anywhere in the app. As each packet (P1→P5) lands, its rows flip
from "correctly absent" to "present and correct"; a row that's absent when its packet's PR says
"merged" is a build-completion miss, not a UAT false-negative. Do not rubber-stamp EXPECTED-ABSENT
as "not applicable, skip" — actively look for the surface and confirm it is NOT there pre-packet.

**Hard rules inherited (apply to every row below):**
- Temporal/stateful effects → verdict only during multi-frame Play; a single paused frame proves
  nothing about spin/ADSR/stop-mode behavior (learning #44). Rows needing this are tagged `▶multi-frame`.
- Alpha/matte claims → export the frame + decode with PIL; never judge alpha from the JPEG preview
  (preview transport drops alpha).
- Destructive/state-mutating steps (undo chains, project hand-edits, save/reload) → run in a
  **throwaway project**, never a real user project.
- **effect-amount-nonzero precheck**: before any "render broken" / "effect not working" verdict,
  confirm in the Inspector/param panel that the relevant param (spin fired, curve nonzero, mix > 0)
  actually reads a nonzero/active value — the P1-A lesson (a defaulted-off param and a broken effect
  look identical from the render alone).
- Every row anchored to a param **name**, **choice value**, or **preset curve number** below quotes
  it verbatim from `plan.md` §1. Where `plan.md` does NOT fix an exact rendered *label* string (the
  numeric params' `def.label` and the effect's `EFFECT_NAME` display string are implementer choices,
  not specified in `plan.md`/`proposal.md`), the row anchors on the **param key** (e.g. `duration_s`)
  or **structural position** instead of inventing label text — record whatever literal string the
  build actually renders rather than asserting one that isn't normative.

---

## P1 — Backend effect core (`fx.backspin` registration + ring/ADSR logic) — backend-only, shell oracles

No frontend surface of its own (per packets.md: "frontend rendering (P3)" is explicit non-scope).
Verified entirely via pytest; its behavior only becomes CU-visible once P3 mounts it (see Definition
of done). Run all commands from `backend/`.

| # | Check (Setup + Drive) | Oracle (falsifiable) | Trap |
|---|---|---|---|
| P1-1 | Setup: on current `main`, run `python -m pytest -k backspin --collect-only -q` (baseline). Drive: after the P1 PR merges, run `python -m pytest tests/test_effects/test_backspin.py -x --tb=short`. | Baseline collects **0** tests (file does not exist pre-packet). Post-packet: exit code 0, **≥6** tests collected, all PASSED. | Rubber-stamp risk: running only the post-packet command and never capturing the 0-collected baseline — without it, a suite of trivially-true stub tests (e.g. `assert True`) would look identical to a real pass. |
| P1-2 | Drive: `python -m pytest -k backspin tests/test_effect_harness.py -v`. | `fx.backspin` appears as a parametrize id inside `TestEffectSurvival`, `TestEffectDeterminism`, `TestEffectStateful`; all PASSED; `git diff origin/main -- tests/test_effect_harness.py` is **empty** (zero new harness code — registry-driven auto-parametrization only). | Passing because the harness silently skipped/xfailed the new id (e.g. an exception swallowed by a broad try/except) rather than actually exercising it — read the verbose `-v` output line for `fx.backspin`, don't just check the summary line's pass count. |
| P1-3 | Drive: `python -m pytest tests/test_effects/test_calibration.py -k backspin -v`. | All 8 numeric params — `stop_frame`, `duration_s`, `curve_a`, `curve_d`, `curve_s`, `curve_r`, `ring_frames`, `mix` (verbatim from `plan.md` §1) — each declare both `curve` and `unit` keys, and every `curve` value is one of `{"linear","logarithmic","exponential","s-curve"}`. | Trusting an aggregate "test passed" without naming all 8 params explicitly — a test that only asserts "≥1 param has curve+unit" would pass even if 7 of 8 are missing it; cross-check the failure list is empty, not just exit code 0. |
| P1-4 | Drive: `grep -c "backspin" backend/src/effects/registry.py`. | Exactly **2** (one import-tuple line, one `phase12_mods` list entry) — the explicit-import convention, no orphan list invented. | A count of 1 (import only, effect never actually registered — `list_all()` won't surface it) or >2 (duplicate/orphan entry) both look like "it's in there somewhere" from a casual glance; the count must be exactly 2. |
| P1-5 | Setup: `git log --oneline -- backend/src/effects/fx/copy_machine.py` — confirm PR #408/#418 (the `feedback_amount` unit-metadata fix) are present in history. Drive: `python -m pytest -x -n auto --tb=short` (full backend suite). | 100% green, **zero** failures of any kind. | Assuming any red test is "the known pre-existing `feedback_amount` failure" without re-running the `git log` check first (Gate 6: verify, don't assume) — per `plan.md` §4 that failure is RESOLVED on current `main`, so any red today is a fx-backspin regression, full stop. |
| P1-6 | Drive: `python -m pytest tests/test_effects/test_backspin.py -k "no_op or empty" -v` (or the equivalent test name the PR ships). | Calling `apply()` with `spin=True` and `state_in=None` (or a ring shorter than the minimum-fire length) returns the frame **byte-identical** to the input — precheck the test itself asserts `np.array_equal`, not a fuzzy/tolerance comparison. | Treating "the effect doesn't crash on an empty ring" as sufficient — the actual contract is byte-identical no-op, and a version that silently returns a blank/black frame instead of the untouched input would still "not crash" while violating the semantic in `plan.md` §1 ("Empty/insufficient ring → pulse is a NO-OP (no crash, no blank)"). |
| P1-7 | Drive: `python -m pytest tests/test_effects/test_backspin.py -k adsr -v`. | Per-preset monotonicity holds: `hard_cut`/`long_brake`/`tape_stop` show A-rises, D-falls-to-S, S-flat, R-falls-to-0 across sampled points; `rubber_band` gets its documented non-monotone-but-bounded exception on the R phase (damped oscillation) — confirm the test explicitly names this exception rather than loosening the assertion for all 4 presets. | A single shared "curve is bounded [0,1]" assertion across all 4 presets would pass even if `hard_cut`'s curve were flat-then-random noise — must confirm true monotonic segments are checked per-phase for the 3 non-oscillating presets. |

## P2 — `tempo_div` plumbing (`_fps`/`_bpm` synthetic keys) — backend-only, shell oracles — RISK: HIGH

Touches the shared `container.py`/render-call-site hot path for all 220 registered effects. Every row
here is a regression gate for effects OTHER than backspin, not just a backspin feature check.

| # | Check (Setup + Drive) | Oracle (falsifiable) | Trap |
|---|---|---|---|
| P2-1 | Setup: on pre-packet `main`, confirm the new synthetic-params test doesn't exist / fails to collect. Drive: post-packet, run the new test (`backend/tests/test_engine/test_synthetic_params.py` or wherever it lands) that renders `fx.backspin` with `stop_mode=tempo` AND separately renders `fx.copy_machine` (or any other registered effect) through the same call path. | `fx.backspin`'s `apply()` receives `_bpm`/`_fps` matching the render request's `bpm`/`reader.fps`. The OTHER effect's `params` dict has **no** `_bpm`/`_fps` keys at all (not present-but-ignored — literally absent). Test must FAIL on pre-packet `main`, PASS post-packet (anti-dead-flag). | Verifying only the positive half (backspin receives the keys) and skipping the negative half (every other effect stays byte-identical) — a leak that injects `_bpm`/`_fps` into ALL effects' params would still make the positive assertion pass. |
| P2-2 | Drive: `python -m pytest -x -n auto --tb=short` (full backend suite), plus a manual spot-check: dump `fx.copy_machine`'s and 2 other unrelated effects' test-fixture output frames before and after the P2 diff and diff them byte-for-byte. | Full suite 100% green AND the spot-checked non-backspin effects' output frames are **byte-identical** pre/post diff. | "Full suite green" alone is not proof of byte-identity if an existing assertion is loose (e.g. shape-only, no pixel comparison) — the explicit spot-check diff is the real oracle, not the suite's pass/fail count. |
| P2-3 | Drive: on the P2 branch, `git diff --stat origin/main...HEAD -- backend/`. | Only 2 files touched: `backend/src/engine/container.py` and exactly one render-call-site file (`pipeline.py` or `zmq_server.py`) — matches the packet's own STOP clause ("If injecting `_fps`/`_bpm` requires touching more than the two named files, STOP and report"). | Scope creep merged silently because tests still pass — a diff touching a third file (e.g. an unrelated engine helper) is a STOP condition regardless of test outcome, not a pass with a note. |
| P2-4 | Drive: `git diff origin/main...HEAD -- backend/src/engine/container.py \| grep -n "clamp_finite\|message.get"`. | **No** new `clamp_finite`/raw `message.get(...)` call inside `container.py`'s injection code — it must consume the value already clamped at `zmq_server.py:739-751`, not re-validate the raw message itself. | An executor "playing it safe" by re-validating bpm/fps a second time in `container.py` looks like extra rigor but creates a second, potentially divergent trust boundary — the plan explicitly forbids this (OD-1(b) trust-boundary rule), and it would pass every functional test while still being wrong. |

---

## P3 — Frontend param rendering + trigger-lane verification (`fx.backspin`, no new component)

Generic-rendering verification only (packets.md: "verification-only packet... If the generic mechanism
has a real gap, the fix packet is scoped fresh, not absorbed silently here"). **EXPECTED-ABSENT until
P1+P3 both merge** — before that, none of these rows should find anything (EffectBrowser has no
"backspin" hit, no `codec_archaeology` category count bump).

Setup common to this section: launch the DEV Electron (`cd frontend && npm start`), throwaway project,
import one clip onto a video track.

| # | Check (Setup + Drive, literal UI labels where they exist today) | Oracle (falsifiable) | Trap |
|---|---|---|---|
| P3-1 | **EXPECTED-ABSENT pre-P1/P3.** Drive: open the left-dock browser, `EFFECTS` tab, type `backspin` into the search box (`data-testid="browser-search-input"`, placeholder `Search...`). Screenshot the `codec_archaeology` category's item count before and after typing. | Post-packet: exactly one result surfaces whose effect id is `fx.backspin` (confirm via the "Hover an effect for details" tooltip or its detail panel showing the id). The `codec_archaeology` category count increments by exactly 1 from its pre-packet value. Pre-packet: zero results for "backspin", category count unchanged. | Accepting a fuzzy search hit on an unrelated effect (e.g. "spin" substring matching something else) as proof `fx.backspin` exists — confirm the matched entry's effect id specifically, not just that *a* result appeared. |
| P3-2 | Drive: drag/click-add the matched entry onto the clip's device chain (bottom rack). Screenshot the device card. | Device card renders: a **choice** control whose options are exactly `frame`, `duration`, `tempo`, `gate` (verbatim `stop_mode` options, `plan.md` §1) defaulting to `duration`; a second **choice** control whose options are exactly `hard_cut`, `long_brake`, `rubber_band`, `tape_stop`, `custom` (verbatim `preset` options) defaulting to `long_brake`; **8** numeric knob/input controls bound to `stop_frame`, `duration_s`, `curve_a`, `curve_d`, `curve_s`, `curve_r`, `ring_frames`, `mix` (all 8 per the explicit `plan.md` §1 table — do not undercount to 6 if a summary elsewhere implies fewer; count every one). | Counting only the numeric controls that are visually distinct "knobs" and skipping ones rendered as plain number inputs (e.g. `stop_frame`, `ring_frames` might render as int spinners, not dials) — `ParamPanel.tsx`/`Knob.tsx` render ALL numeric types through the same generic path per plan.md §2, so the count must be 8 regardless of visual widget sub-type. |
| P3-3 | Drive: change `tempo_div` (choice control). Screenshot its option list. | Options present are exactly `1/4`, `1/2`, `1`, `2`, `4` (bars — verbatim `plan.md` §1), defaulting to `1`. | Confusing `tempo_div`'s options with `stop_mode`'s `tempo` value (a different param) — these are two separate controls; verify `tempo_div` only becomes meaningfully relevant when `stop_mode=tempo` is selected, but the control itself should always be present (generic rendering, no conditional-hide claimed in plan.md). |
| P3-4 | Drive: with the device card focused, open the Automation toolbar's trigger-lane picker (`+ Trigger` button, `data-testid="add-trigger-btn"`, opens the `Add Trigger Lane` picker). Screenshot the picker's param list. Then open the continuous picker (`+ Lane`, `data-testid="add-lane-btn"`, `Add Automation Lane`) and screenshot its list. | `spin` and `gate` (both bool per `plan.md` §1) appear in the **trigger-lane** picker's option list (`data-testid="param-option-spin"` / `param-option-gate"`) and do **NOT** appear anywhere in the continuous **lane** picker's option list. All other backspin params (`stop_mode`, `stop_frame`, `duration_s`, `tempo_div`, `curve_a/d/s/r`, `preset`, `ring_frames`, `mix`) appear in the continuous picker (float/int/choice types), not the trigger picker. | Checking only that `spin`/`gate` show up *somewhere* without confirming their **absence** from the continuous picker — the actual regression this guards is a bool param leaking into the wrong lane type, which only shows by screenshotting BOTH pickers side by side, matching the `AutomationToolbar.tsx:214-227` `isBool → boolOnly` filter this packet claims is inherited for free. |
| P3-5 (Vitest, not CU) | Drive: `cd frontend && npx --no vitest run -t backspin` (or the picker-filter test file P3 extends). | Automated assertion passes: `fx.backspin`'s `spin`/`gate` are present in `pickerMode === 'trigger'` results and absent from continuous-lane results — must FAIL if `fx.backspin` is unregistered or its bool params aren't declared `type: 'bool'`. | Trusting the CU screenshot pass (P3-4) alone without also running the automated regression test — the Vitest assertion is what actually pins this behavior against future refactors of `AutomationToolbar.tsx`; a screenshot-only pass gives no regression coverage. |
| P3-6 | Drive: right-click the track header hosting the backspin instance; open the automation submenu. Screenshot the menu. | Two entries read `Add Trigger: <effect display name> > <spin's label>` and `Add Trigger: <effect display name> > <gate's label>` (structure per `Track.tsx:118-123`'s `Add Trigger: ${info.name} > ${def.label}` pattern) — **no** sibling `Add Lane: ... > Spin` / `Add Lane: ... > Gate` entries exist. Record the actual literal `<effect display name>` and param labels rendered (not fixed by `plan.md`, implementer's choice) for use in later UAT passes. | Assuming the exact string "Backspin" / "Spin" / "Gate" without checking what the implementer actually named `EFFECT_NAME`/`def.label` — the plan does not fix these strings, so failing this row for a differently-worded-but-structurally-correct label would be a false failure; the falsifiable part is the **Add Trigger-only** structural rule, not the exact wording. |

---

## P4 — Preset → curve cascade (OD-3, `DeviceChain.tsx` transaction wiring)

**EXPECTED-ABSENT/FAIL until P4 merges** — run these on a throwaway project. Pre-packet, selecting a
preset (once `fx.backspin` exists via P1/P3) writes `curve_a/d/s/r` + `preset` as **5 separate**
History entries (today's plain `dispatchChain().updateParam()` per-field behavior) — that 5-row result
IS the expected pre-packet baseline, not a bug; it becomes the anti-dead-flag proof once P4 lands it
down to 1.

Setup common to this section: throwaway project, clip with `fx.backspin` added (per P3), History panel
open via **Edit → Undo History** (menu label per `menu.ts`; floating panel titled "Undo History",
entries listed as `.history-panel__entry` rows showing `entry.description` text).

| # | Check (Setup + Drive) | Oracle (falsifiable) | Trap |
|---|---|---|---|
| P4-1 | Setup: open Undo History panel, note current entry count `N`. Drive: change the `preset` control to `long_brake`. | `curve_a/d/s/r` update on-screen to **exactly** `A=.05 D=.3 S=.6 R=.6` (verbatim `plan.md` §1 preset table). Undo History gains **exactly one** new entry (count = `N+1`), and that entry's description text reads `Set backspin preset: long_brake` (per the packet's own quoted `undoable()` description convention). Pre-P4: gains 5 new entries instead of 1 (4 curve writes + 1 preset write) — record which behavior is observed. | Confirming the curve values updated correctly (real, and would pass even pre-P4) but not counting Undo History entries — the ATOMIC-cascade claim is specifically about entry count, not whether the values end up correct; a 5-entry write can still land on the right final values while failing the "one Ledger row" contract. |
| P4-2 | Setup: preset is currently NOT `custom` (e.g. still `long_brake` from P4-1). Drive: drag/edit `curve_a` (or any single `curve_*`) to a new value. | The `preset` control's displayed value flips to `custom` in the SAME action — Undo History gains exactly **one** new entry (not two), and that single entry reflects both the curve_a change and the preset→custom flip (inspect via undo: one Cmd+Z should revert BOTH). | Watching only the curve slider move and not checking whether `preset` silently stayed on `long_brake` (a stale/inconsistent display) or flipped via a SEPARATE, second Undo History entry (two-step cascade, still a partial-transaction bug even though the end state looks right). |
| P4-3 | Drive: from the post-P4-2 state, press Cmd+Z once. | ALL 5 fields (`preset`, `curve_a`, `curve_d`, `curve_s`, `curve_r`) atomically revert together to their P4-1 post-preset-apply values in the single undo step — screenshot device card before Cmd+Z and after, diff all 5 fields at once. | Undoing and only checking that `curve_a` reverted (the field you just edited) while missing that `preset` stayed stuck on `custom` (a partial/non-atomic undo) — must check the full 5-field snapshot, not just the field that was last touched. |
| P4-4 (Vitest, not CU) | Drive: `cd frontend && npx --no vitest run -t backspin-preset-cascade` (or the exact new test file path P4 ships). | The 3 oracle bullets above (P4-1/2/3) are asserted programmatically against `useUndoStore.getState().past` length deltas and full param-snapshot equality; the test file's own PR description documents it FAILING on pre-packet `main` and PASSING post-packet (anti-dead-flag requirement from packets.md). | Accepting a passing Vitest run without confirming (via the PR body or a local checkout of pre-packet `main`) that the SAME test genuinely fails before the fix — a test that passes both before and after the diff is testing nothing about the cascade. |

---

## P5 — BDD scenarios + docs follow-up flag — backend-only (docs artifact), shell/diff oracle

Not user-facing; produces a `Feature: fx.backspin` file, not app behavior. No CU journey — a
review/diff oracle only.

| # | Check (Setup + Drive) | Oracle (falsifiable) | Trap |
|---|---|---|---|
| P5-1 | Setup: locate the sibling BDD convention: `find . -iname '*.feature'` (repo-root). Drive: after P5 merges, `git show --stat <P5 PR SHA>` to see the new file's path. | The new `Feature: fx.backspin` file exists at the SAME directory convention the `find` search identified pre-packet (not a newly-invented location) — OR, if `find` returned zero results, the PR body explicitly documents the STOP-and-report per packets.md ("if no sibling BDD suite/convention is actually findable... do not invent a new BDD framework/location unilaterally") rather than silently picking a location. | Accepting a new feature file dropped in an arbitrary/invented directory without the PR body showing the `find` command's actual pre-packet output — the packet's own STOP clause requires that evidence, not just "a .feature file exists somewhere." |
| P5-2 | Drive: manually cross-reference every scenario in the new file against `plan.md` §5's 7 acceptance oracles (ring caps, rising-edge pulse, per-`stop_mode` termination, ADSR monotonicity, no-op on empty ring, determinism, resume continuity) plus P4's 3 cascade oracles (atomic preset-apply, atomic curve→custom flip, atomic undo) — build a 10-row coverage table. | Every one of the 10 oracle bullets has a corresponding scenario (1:1, no gaps); zero scenarios assert behavior NOT present in `plan.md`/`proposal.md`/`packets.md` (Hard Rule #3 — no invented normative contract text). | Skimming the feature file and eyeballing "looks comprehensive" — the explicit 10-row cross-reference table is the only way to catch a silently-dropped oracle (e.g. the `rubber_band` non-monotone exception is easy to omit) or an invented scenario that reads plausibly but isn't grounded in the plan. |

---

## Definition of done — end-to-end journey (proves P1+P2+P3+P4 together)

**Single story, run last, only meaningful once ALL of P1–P4 have merged** (P5 is docs, not required
for this journey). Throwaway project. This is the one journey a user would actually run, and it is the
real proof the change works — every packet above is necessary but insufficient in isolation (P1 alone
is invisible without P3's mount; P3 alone renders params nobody can verify actually spin the ring; P4
alone has nothing to cascade without P1's preset table).

1. Launch the DEV Electron from the canonical checkout; confirm live-runtime path (per
   `docs/UAT-PLAN-2026-07-02-live-cu.md`'s runtime guard) before touching anything.
2. New throwaway project → import one clip with visibly distinct content per frame (e.g. a
   moving-subject clip, not a static color card — the spin must be visually detectable frame-to-frame)
   → add it to a video track.
3. Add `fx.backspin` from the EffectBrowser (per P3-1) onto the clip's device chain. **Precheck**
   (effect-amount-nonzero rule): confirm `mix` reads its default `1.0` and the effect's output differs
   from the unprocessed source at all before judging anything downstream.
4. Set `preset` to `rubber_band` (per P4-1's cascade: confirm `curve_a/d/s/r` become `.1 .2 .8 .3` in
   ONE Undo History entry).
5. Add a trigger lane for `spin` (per P3-4/P3-6: `Add Trigger:` entry, never `Add Lane:`). Click once
   on the trigger lane at ~2s to place a pulse, click again ~0.5s later to close it.
6. Press Play from before the pulse and let playback run through and past it. **`▶multi-frame`
   verdict only** — capture at minimum 4 frames: pre-pulse, early-pulse (attack/decay), mid-pulse
   (sustain), and post-release (the rubber_band damped-oscillation tail on R). The mid-pulse frames
   must show content playing in reverse relative to pre-pulse frame order (ring rewinding); the
   post-release frames must show the damped-oscillation overshoot-then-settle described in
   `plan.md` §1's `rubber_band` note, then resume forward playback from the landed frame (resume
   continuity — the landed frame matches what forward playback would show at that point, per
   `plan.md` §1 "Resume re-seeds from the landed frame").
7. Change `stop_mode` to `tempo`, set `tempo_div` to `1/2`, set the project BPM field (transport,
   top-left) to a distinctive non-default value (e.g. 140). Trigger `spin` again via the trigger lane
   and confirm (via P2's plumbing) the spin's duration visibly tracks the BPM — change BPM to a very
   different value (e.g. 70) and trigger again; the spin should now last roughly 2x as long
   (`▶multi-frame`, compare elapsed-frame counts between the two triggers by scrubbing to each spin's
   start/end).
8. Change `stop_mode` to `gate`; draw a gate lane (per P3-4's structural rule — `gate` only ever
   appears as a trigger/lane target, never a plain knob drag) high for ~1s then low. Confirm spin runs
   for exactly the gated-high duration and resumes on the falling edge.
9. Export the range covering steps 6–8 (File → Export, MP4/H.264 default). Decode 3 frames from the
   export with ffmpeg + PIL at the same timeline positions as 3 of the live-preview screenshots from
   step 6; pixel-compare — confirms preview==export parity (no separate/divergent export code path).
10. If the clip carries an alpha channel (e.g. stack a rect matte via `q` marquee on the clip first),
    repeat the export in step 9 with an alpha-preserving codec (ProRes 4444) and confirm via PIL that
    the alpha channel survived the backspin ring untouched (RGB-only ring storage, alpha re-concatenated
    at output — the House Landmines alpha-split rule in `plan.md` §3) — **alpha must be checked via the
    decoded export file, never the JPEG preview** (hard rule).
11. Undo back through the whole sequence (preset change, trigger placements, mode changes) via Edit →
    Undo History — each entry should read a specific, human-legible description (not a generic "Update
    param"), and jumping to any entry in the panel (click-to-jump) should reproduce that exact
    intermediate state.

**Pass bar:** every numbered step produces the stated falsifiable evidence (screenshot set, PIL pixel
comparison, or Undo History entry text) with no step requiring undocumented knowledge or a workaround.
Any step that only "looks right" in a single paused frame is not a pass — re-run it across multiple
frames per the temporal hard rule before recording a verdict.
