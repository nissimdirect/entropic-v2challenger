# UAT — fx-afterimage (PRE-BUILD)

**Status:** written BEFORE any packet lands. Every UI row in this doc is
**EXPECTED-ABSENT today** — a fail is not a bug, it's the correct pre-build
state. Re-run this doc packet-by-packet as PK.1→PK.4 ship; a row flipping
PASS is itself the build-completion signal for that packet.

**Companion docs (protocol inherited verbatim):**
`docs/UAT-PLAN-2026-07-02-live-cu.md` (runtime protocol: canonical checkout
launch + live-runtime path check before any verdict, throwaway projects,
screenshot-per-verdict, ✅❌🐛⏸ only) and
`docs/UAT-CU-ADDENDUM-2026-07-03.md` (row/header format, Trap-column
discipline). **Source of truth for every claim below:**
`openspec/changes/fx-afterimage/plan.md` (line-anchored — do not re-derive
param values; quote them) and `packets.md` (packet scope/oracles).

**Hard rules (repeated here per house convention, do not skip):**
- Temporal/stateful effects → verdict ONLY during multi-frame Play (single
  frame proves nothing — learning #44). `fx.afterimage` is a stateful
  recursive-buffer effect in BOTH engines — every visual-verdict row below
  is marked **▶multi-frame** and must not be judged from one screenshot.
- Alpha claims → export + PIL pixel assertion, never preview (JPEG preview
  drops alpha; only the exported file's alpha channel is trustworthy).
- Destructive/mutating steps run on a **throwaway project**, never a real
  one.
- **Effect-amount-nonzero precheck**: before judging any "render
  unaffected / broken" verdict, screenshot the relevant knob's on-screen
  value and confirm it reads nonzero (per the P1-A lesson) — a zeroed
  knob and a broken effect look identical on screen.
- New-UI rows note **EXPECTED-ABSENT until [PK.n] ships** — these rows
  double as the build-completion detector for that packet; do not
  rubber-stamp a "not found" as a pass without checking the packet's
  ledger status first.

**Live UI grounding (verified by Read/Grep this session, not assumed):**
- `EFFECT_NAME = "Afterimage"` (`backend/src/effects/fx/afterimage.py:6`) —
  this is the literal string shown in the Effect Browser search results
  and the `ParamPanel` header (`ParamPanel.tsx:189`,
  `effectInfo.name`).
- Zero frontend files reference `afterimage` today (`grep -rln afterimage
  frontend/src` = empty) — every row below exercises the **generic**
  `EffectBrowser` + `ParamPanel`/`Knob`/`ParamChoice` renderer, driven
  purely by the backend `PARAMS` schema. There is no dedicated Afterimage
  component to inspect — the schema IS the UI.
- No `visibleIf`/`dependsOn` mechanism exists anywhere in `ParamPanel.tsx`
  or the `fx.copy_machine` precedent it's modeled on (grepped, zero hits)
  — **all params render simultaneously regardless of the `style`
  discriminator's value.** This is the existing house pattern (copy_machine
  shows `cell_size`/`glyph_set` knobs even when `machine≠"ascii"`), NOT a
  bug to file against this change. A row below pins this expectation
  explicitly so it isn't false-failed.
- Numeric param display format (`frontend/src/renderer/utils/paramScaling.ts:101-107`,
  read this session): `unit==="%"` AND `max<=1` → renders `Math.round(value*100)+"%"`
  (e.g. `opacity` default 0.9 → **"90%"**); otherwise
  `${value.toFixed(2) or value}${unit}` **with no separating space** (e.g.
  `delay_frames` default 1, `unit:"frames"` per plan.md §2 → literal
  **"1frames"**, no space — quote this exact string, do not "fix" it to
  "1 frames" when eyeballing). `color_drift` (`unit:"°"`, not %-eligible
  since `max=60>1`) → **"0.00°"** at default.
- Every Afterimage instance ALSO carries the generic per-effect
  `ParamMix` "Dry/Wet Mix" slider (`ParamPanel.tsx` bottom, below the
  divider, `effect.mix` — a top-level field, NOT inside `PARAMS`). Plan.md
  §2 independently adds a NEW `mix` key **inside** the echo-style `PARAMS`
  dict (dry/wet into the echo composite, default 1.0). These are two
  different fields (`effect.mix` vs `effect.parameters.mix`) that will
  render as two visually similar mix-labeled controls on the SAME panel —
  flagged as a dedicated trap row below, not assumed benign.
- `EFFECT_CATEGORY` changes `"misc"` → `"temporal"` (plan.md §1).
  `"temporal"` is an existing, populated Effect Browser category (grep
  confirms `beat_repeat`, `decimator`, `frame_drop`, `granulator`,
  `sample_and_hold`, `temporal_freeze`, `strobe`, `temporal_blend`,
  `tremolo` already live there) — Afterimage MOVING into that group's
  count, and OUT of "misc"'s count, is a mechanically verifiable screenshot
  diff, not a vibe check.

---

## PK.1 — Effect core rewrite (combo dispatcher) + oracle fix

User-facing surface: none of this is new frontend code, but the merged
`PARAMS` dict renders automatically through the generic `ParamPanel` the
moment PK.1 lands — so this packet IS CU-testable, via the Effect Browser
and the generic param renderer, not a dedicated component.

| # | Check (Setup + Drive) | Oracle (falsifiable) | Trap guarded |
|---|---|---|---|
| AI.1 ⚠EXPECTED-ABSENT until PK.1 ships | Throwaway project. Import any clip onto a track. Open the Effects browser, expand the `misc` category group and locate **"Afterimage"** (`EFFECT_NAME`, confirmed literal string). Drag it onto the clip's device chain. Open its `ParamPanel`. | **Today (pre-PK.1):** the panel shows exactly 2 knobs — "Adaptation Rate" and "Strength" — no choice dropdown above them, and Afterimage lists under the `misc` category group. **Post-PK.1:** a `style` **choice dropdown** (`echo`\|`ghost` options, default `echo`) appears at the TOP of the panel above the numeric knobs, Afterimage now lists under the `temporal` category group (its `misc` count drops by 1, `temporal`'s count rises by 1 — screenshot both group headers), and ~10 additional echo-style knobs/dropdowns appear (delay/feedback/opacity/mode/echo_transform/transform_amount/color_drift/tint/threshold/mix — key names per plan.md §2; exact on-screen `label` text is NOT pinned by plan.md, only the param keys and semantics are — do not fail on label wording alone, verify by hovering/inspecting the underlying param key via DevTools if the label is ambiguous). | Counting only "a dropdown appeared" as done, without checking the category-group move (an easy miss: `EFFECT_CATEGORY` is a one-line change that's easy to leave as `"misc"` while everything else ships) — the count-diff on BOTH groups is the falsifiable half of this row. |
| AI.2 ▶multi-frame ⚠EXPECTED-ABSENT until PK.1 ships | Same panel, `style=echo` (default). Screenshot the knob values to confirm nonzero defaults (`delay_frames`≈1, `feedback`≈75%, `opacity`≈90% — precheck, per Rule 5/P1-A lesson). Press Play and let it run 3-5 seconds continuously over moving content, screenshotting 3 frames ~1s apart. | At `delay_frames=1` (the "classic smear" default per plan.md §2) the 3 screenshots show a visible motion-smear trail behind moving content that changes frame-to-frame (not a static overlay) — confirms the echo engine is live, not a no-op default. | Judging "effect added, no visible change" from a single paused frame — the smear is genuinely invisible on a still frame and only reads on delayed motion across multiple frames (learning #44); a CU pass that screenshots once and calls it broken would be false-failing a working default. |
| AI.3 ▶multi-frame ⚠EXPECTED-ABSENT until PK.1 ships | Same clip. Set `opacity` knob to its minimum (0%). Export a short MP4 (File → Export, H.264, default codec) covering 2+ seconds. Then remove the Afterimage effect entirely and export the SAME frame range again. | Decode the same frame index from both exports via ffmpeg + PIL — pixel-**identical** (bit-for-bit) between "Afterimage present at opacity=0" and "Afterimage absent." Repeat once more with `feedback` at minimum (0%) instead of `opacity`, same identity expected. This is plan.md §3's purity law ("`feedback=0` OR `opacity=0` ⇒ byte-identical passthrough") made CU-observable. | A shallow pass would eyeball "the preview looks unchanged" without the actual export+PIL byte comparison — a near-invisible-but-nonzero residual (e.g. a stray `+1` rounding leak) would pass a vibe check but fail the real purity contract; this is exactly the kind of regression oracle 1 (plan.md §4.1) exists to catch, made visible at the UI layer. |
| AI.4 ▶multi-frame ⚠EXPECTED-ABSENT until PK.1 ships | Same clip, `style=echo`. Set `mode` dropdown to `max`, export 2s. Set `mode` to `lighten` (all other knobs unchanged), export the same 2s again. | Decode matching frames from both exports via PIL — pixel-**identical**. This is the OD-3 aliasing the module docstring must document (plan.md: "both call the same `np.maximum`/compositor `_blend_lighten` kernel — do not 'fix' into two formulas"). | Assuming `max` and `lighten` must differ because they're separate dropdown entries — a naive re-reviewer might "fix" this into two formulas later, silently drifting from the documented contract; this row is the regression tripwire for that drift, not just a build check. |
| AI.5 ▶multi-frame ⚠EXPECTED-ABSENT until PK.1 ships | Same clip. Set `delay_frames` to a large value (e.g. 12 — mirrors the not-yet-shipped `stutter` preset's number, entered by hand since PK.4 presets aren't in scope here). Press Play from the very start of the clip and step/scrub frame-by-frame across the first ~15 frames, screenshotting every frame. | The first ~12 frames show a hard passthrough (current frame only, per plan.md §3's "No echo history yet" branch) — NOT a black/gray seeded frame. The first visible discrete echo appears at approximately frame index 12 (±1 frame tolerance for CU screenshot cadence; the EXACT off-by-one boundary is pinned by PK.2's backend impulse-test oracle, not this row — this row only needs to confirm the delay is roughly `delay_frames`, not exactly). | Seeding the echo buffer with a black/gray frame during the passthrough window (rather than pure passthrough) would show as a visible darkening/flash in the first ~12 frames — a CU pass that doesn't watch this specific window (and instead jumps straight to frame 20+) would miss it entirely. |
| AI.6 ▶multi-frame ⚠EXPECTED-ABSENT until PK.1 ships | Same clip, `style=echo`. Confirm both the NEW `mix` knob (inside the echo `PARAMS`, near the top with the other echo knobs) and the pre-existing generic "Dry/Wet Mix" slider (bottom of panel, below the divider) are BOTH present simultaneously. Drag each to 0% independently (one at a time, resetting the other to its default between tests), Play + export each case. | Setting the generic bottom "Dry/Wet Mix" to 0% must fully bypass Afterimage (export byte-identical to no-effect, same as AI.3's method) regardless of the top `mix` knob's value — that control operates on the whole effect. Setting the TOP echo-`mix` knob to 0% while the bottom slider stays at 100% must show ZERO echo trail but the CURRENT frame still passes through normally (per plan.md's dry/wet-into-echo-composite semantics) — a narrower, different effect than the bottom slider. The two controls must behave measurably differently from each other. | A build that accidentally reuses the same store key for both mixes (or that silently no-ops one of them) would make the two sliders visually redundant — a shallow pass that only tests ONE of the two mix controls would miss the collision; this row forces testing both, independently, and confirming they're NOT the same knob wearing two skins. |
| AI.7 ▶multi-frame ⚠EXPECTED-ABSENT until PK.1 ships | Same clip. Switch `style` to `ghost`. Confirm the "Adaptation Rate" / "Strength" knobs are still present (they were already visible before the switch, per the no-`visibleIf` house pattern noted above — do NOT expect the echo-only knobs to disappear). Play 3-5s. | Output visibly matches the CURRENT (pre-PK.1) ghost behavior — an inverted/negative afterimage trailing effect, distinct in character from the `echo` mode's forward-smear (compare against a screenshot taken with `style=echo` at matched Adaptation-Rate-equivalent settings, or against `docs/EFFECTS-INVENTORY.md`'s existing "Afterimage" row description if still accurate at build time). All 10 echo-only knobs remain VISIBLE (not hidden) but their dragging has no visible effect on output while `style=ghost` — confirm by dragging `delay_frames` to its max while `style=ghost` and observing zero output change. | Expecting the echo knobs to vanish under `style=ghost` (they won't — no conditional-visibility mechanism exists in this codebase) and false-filing that as a bug; conversely, NOT dragging an echo knob while on `style=ghost` would miss a real cross-style leak bug if the dispatcher accidentally reads the wrong style's params. |
| AI.8 ⚠EXPECTED-ABSENT until PK.1 ships | Setup (shell, in a throwaway `~/.creatrix/projects/` copy): with the app closed, hand-edit a `.glitch` project JSON that already has an `fx.afterimage` effect instance with only `{"adaptation_rate": ..., "strength": ...}` in its `parameters` (no `"style"` key at all — simulating a pre-this-change saved project). Drive: launch the app, File → Open Project on the hand-edited file, open the effect's `ParamPanel`. | The `style` dropdown reads **`echo`** (not `ghost`, not blank/unset) — confirms the documented clean-break default (`params.get("style", "echo")`, plan.md §1/§3, PR-body-required note per packets.md PK.1 STOP). The panel does NOT show a validation error/toast about a missing `style` key. | Assuming old projects should keep their prior (ghost-only) look-and-feel on reload — the T1 combo verdict explicitly chose the OPPOSITE (clean-break to `echo`) specifically because it's a visible behavior change for old data; a CU pass that expects `ghost` here would be checking the wrong contract. |

---

## PK.2 — Dedicated unit test file (`backend/tests/test_afterimage.py`, new)

**Backend-only — no frontend surface, no CU rows.** Additive test file;
correctness is proven entirely by the pytest suite itself per
packets.md's hard oracle. Shell-command oracle rows only.

| # | Check (Setup + Drive) | Oracle (falsifiable evidence) | Trap guarded |
|---|---|---|---|
| BE.1 ⚠EXPECTED-ABSENT until PK.2 ships | Shell, pre-packet: `cd backend && python -m pytest --collect-only -k afterimage tests/test_afterimage.py 2>&1` | Command exits non-zero / reports "file or directory not found" (file does not exist yet — pre-build baseline). | Skipping the pre-packet baseline capture and only running the post-packet check — without the "0 tests today" baseline in hand, a collection count of e.g. 8 (short of the required ≥13) could be mistaken for full coverage. |
| BE.2 ⚠EXPECTED-ABSENT until PK.2 ships | Shell, post-packet: `cd backend && python -m pytest --collect-only -k afterimage tests/test_afterimage.py 2>&1 \| tail -5` | Reports **≥13 tests collected** (11 echo oracles + oracle 12 ghost-byte-identical + oracle 13 style-switch-default, per plan.md §4.1/§4.1a and packets.md PK.2's anti-dead-flag). | Accepting any nonzero count as "done" — the packet's own anti-dead-flag names the floor as ≥13; a build that ships only the 11 echo cases and skips the two combo oracles would read as "tests exist" on a shallow glance but silently drop the T1-combo-specific coverage. |
| BE.3 ⚠EXPECTED-ABSENT until PK.2 ships | Shell: `cd backend && python -m pytest tests/test_afterimage.py -x --tb=short` | All collected tests **PASS**, zero skips, zero xfails silently swallowing a real failure. | A green run with hidden skips (e.g. `pytest.mark.skip` sprinkled on the harder oracles — 4 impulse-spacing, 6 geometric-compounding, 12 byte-identical) would show "0 failed" while quietly not testing the risky parts; grep the output for "skipped" explicitly, don't just check the exit code. |
| BE.4 ⚠EXPECTED-ABSENT until PK.2 ships | Shell: `grep -n "adaptation = adaptation + adaptation_rate" backend/tests/test_afterimage.py` (the oracle-12 hand-copied reference formula, per packets.md PK.2's hard oracle) | The exact 4-line formula from `plan.md §4.1a` / the original `afterimage.py` lines 43-69 appears **inlined literally in the test file**, not imported from the production module and not re-derived/paraphrased. | A test that imports `_apply_ghost` and asserts it equals itself (tautology) would trivially pass while proving nothing about correctness — the whole point of oracle 12 is an INDEPENDENT hand-copied reference; this grep is the cheap check that the independence wasn't silently dropped for convenience. |

---

## PK.3 — Parameter-sweep `DEPENDENT_PARAMS` registration audit

**Backend-only — no frontend surface, no CU rows.** Shared file with
`fx-backspin`'s P1 (cross-change dedupe clause) — shell-command oracle
rows only.

| # | Check (Setup + Drive) | Oracle (falsifiable evidence) | Trap guarded |
|---|---|---|---|
| BE.5 ⚠EXPECTED-ABSENT until PK.3 ships | Shell, post-PK.1/pre-PK.3: `cd backend && python -m pytest tests/test_parameter_sweep.py -k afterimage -x --tb=short 2>&1 \| tail -20` | `adaptation_rate` and `strength` sweep cases FAIL or report `diff==0.0` unexpectedly (per packets.md PK.3's anti-dead-flag — they're live params the naive sweep can't reach while `style` sits at its default `echo`). | Running ONLY the post-PK.3 command and skipping this pre-PK.3 capture — without seeing the expected-red baseline, a post-fix green run can't be distinguished from "the sweep never exercised these params at all" (a silently-vacuous pass). |
| BE.6 ⚠EXPECTED-ABSENT until PK.3 ships | Shell, post-PK.3: same command as BE.5. | Green, zero unexplained skips. `grep -n '"fx.afterimage", "adaptation_rate"\|"fx.afterimage", "strength"' backend/tests/test_parameter_sweep.py` shows both entries present, each with an explanatory comment (house convention, mirroring `("fx.copy_machine", "cell_size")`'s comment style — not a bare tuple). | Adding the tuples with no comment (or a copy-pasted comment that doesn't actually explain the afterimage-specific reason) would pass the pytest run but violate the packet's own stated house-convention requirement — this row's grep must inspect the comment text, not just tuple presence. |
| BE.7 ⚠EXPECTED-ABSENT until PK.3 ships | Shell: `grep -n '"fx.afterimage", "style"' backend/tests/test_parameter_sweep.py` | **Zero matches.** `style` itself must NOT appear in `DEPENDENT_PARAMS` — sweeping `echo`→`ghost` must show a real diff (the engines produce different math) per plan.md §4.3(b)'s explicit "confirm this is not accidentally suppressed." | A defensive-but-wrong instinct to "just register everything that touches the dispatcher" could add `style` to the inert-list, silently hiding a real regression if the two engines ever converged to the same output by accident — this negative-space grep is the only way to catch that. |
| BE.8 ⚠EXPECTED-ABSENT until PK.3 ships | Shell: `git log --oneline -- backend/tests/test_parameter_sweep.py | head -5` cross-referenced against `fx-backspin`'s packets ledger. | Confirms which change (fx-afterimage's PK.3 or fx-backspin's P1) landed first, per the dedupe STOP clause — if `fx-backspin` landed first and formalized a `DEPENDENT_PARAMS` registry module, PK.3's diff must CONSUME that module, not rebuild an ad-hoc `set`. | Building the ad-hoc entry style even though a formalized registry already exists (because the executor didn't check) would immediately diverge from the sibling change's convention and create two competing patterns in the same file — this is a real single-flight-map risk named explicitly in packets.md, not hypothetical. |

---

## PK.4 — Ship 4 named presets (`vaporwave`/`smear`/`stutter`/`ink_ghost`) — STOP-gated

**CONTINGENT SECTION.** Per packets.md, PK.4's own first action is a STOP
that must be resolved (persistence pattern (a)/(b)/(c)) before any code is
written — it may not ship in this build cycle at all, or may land as a
follow-up change with a different UI shape than guessed here. Every row
below is EXPECTED-ABSENT and additionally CONTINGENT on which STOP branch
was taken; do not fail this section blank if the ledger shows PK.4 was
escalated-and-deferred rather than built — that is a valid, in-spec
outcome (option (c)).

| # | Check (Setup + Drive) | Oracle (falsifiable evidence) | Trap guarded |
|---|---|---|---|
| PR.1 ⚠EXPECTED-ABSENT/CONTINGENT | Shell: `grep -n "STOP" openspec/changes/fx-afterimage/packets.md \| grep -A2 PK.4` cross-referenced against the PK.4 row in packets.md's Ledger table. | Ledger shows PK.4 as either (i) still ⬜ not started, (ii) an escalation report with no PR (option (c) deferred), or (iii) a merged PR with a stated persistence pattern. Read whichever applies BEFORE running any row below. | Assuming PK.4 "should" have shipped alongside PK.1-3 and marking this whole section a failure/blocker — the packet's own design explicitly allows halting here with zero code; that is success for this packet, not a gap. |
| PR.2 ⚠EXPECTED-ABSENT/CONTINGENT — only if ledger shows (a) `fx.backspin`-style `preset` choice param adopted | Throwaway project, Afterimage added, `style=echo`. Look for a NEW `preset` choice dropdown among the echo params with options `vaporwave`/`smear`/`stutter`/`ink_ghost`/`custom`. Select `vaporwave`. | `delay_frames`/`feedback`/`opacity`/`mode`/`color_drift`/`echo_transform`/`transform_amount` knobs all update, in one gesture, to the exact values in plan.md §2's table (`6`/`0.85`/`0.8`/`screen`/`+14°`/`blur`/`0.2`) — screenshot each knob's new reading. Playing 3-5s shows a visibly warmer/hue-shifted, softer echo trail vs the plain `echo` default. | Selecting a preset and only checking ONE knob updated (e.g. just `mode`) would miss a partial-cascade bug where some preset fields silently fail to write — all 7 non-default preset fields must be individually confirmed, not sampled. |
| PR.3 ⚠EXPECTED-ABSENT/CONTINGENT — only if ledger shows (b) a module-level `PRESETS` dict / new UI surface | (Cannot be pinned in advance — no such UI exists anywhere in the effects layer today, confirmed by this session's own `grep -rn "PRESETS\b" backend/src/effects/fx/*.py` returning zero per-effect hits.) Locate wherever the chosen mechanism surfaces (new panel, new browser tab entry, etc.) using the PR description as the map. | 4 presets are reachable and each one applies without a render error/crash (Play 3-5s per preset, screenshot). Preset param values match plan.md §2's table exactly, same verification method as PR.2. | Because this is genuinely new plumbing invented mid-build, a CU pass that doesn't first read the actual PR body/diff to find the entry point would waste the whole session hunting — this row's real job is "confirm the PR body's own claimed UI location matches what's actually on screen," not rediscover it blind. |
| PR.4 ⚠EXPECTED-ABSENT/CONTINGENT | Backend shell, whichever pattern landed: locate the preset value source (new `PRESETS` dict or embedded default table) and run a quick Python check that each of the 4 presets' numeric fields falls within the corresponding `PARAMS` entry's `min`/`max` (packets.md PK.4's own stated oracle). | All 4×7 checked values pass range validation; non-black/non-trivial rendered output for each (mirrors `wave0-prerouted-presets`' "non-black assertion" pattern per packets.md). | A preset shipped with a typo'd out-of-range value (e.g. `transform_amount: 1.2` when max is `1.0`) could silently clamp at apply-time and LOOK fine on screen while the saved preset data itself is invalid — this row must check the raw preset values, not just the rendered result. |

---

## Definition of done — end-to-end user journey

Run this LAST, only once PK.1 (required) has shipped — PK.2/PK.3 are
backend-only and don't change this journey's observable steps; PK.4 is
optional per its own STOP and is called out inline where it would enrich
the journey if it landed.

**Journey: "I want a vaporwave-style trailing echo on my clip, then I want
the classic ghost-trail look on a different clip, and both need to survive
a real export."**

1. Throwaway project. Import one clip with visible motion (not a static
   frame — the smear needs motion to be visible). Add **"Afterimage"**
   from the Effects browser, `misc`→`temporal` category group (screenshot
   the group header count as evidence PK.1 shipped).
2. Leave `style` at its default (`echo`). Confirm on-screen knob values
   read nonzero defaults (Rule 5 precheck). Press Play, watch 5+ seconds
   continuously (▶multi-frame, learning #44) — a soft 1-frame smear trails
   moving content.
3. Raise `delay_frames` toward ~8-12 and `feedback` toward its max
   (0.98) via the knobs; Play again — the single soft smear becomes
   distinct, discrete stutter-echoes spaced roughly `delay_frames` frames
   apart (AI.5's approximate spacing check, live). *(If PK.4 shipped:
   instead select the `stutter` preset and confirm the same discrete-echo
   character in one click — PR.2/PR.3.)*
4. Set `mode` to `min` — echoes visibly darken/ink-tint rather than
   brighten (plan.md's "min = ink ghosts" note). Toggle between `max` and
   `lighten` and confirm the export is pixel-identical either way (AI.4) —
   proves the OD-3 aliasing survived to the final build, not just PK.1's
   own PR.
5. Add a SECOND clip on a new track. Add Afterimage to it, switch its
   `style` dropdown to `ghost`. Confirm the "Adaptation Rate"/"Strength"
   knobs (unchanged from the pre-change effect) now drive an inverted
   opponent-process trail distinct in character from clip 1's echo trail
   — both effects, both engines, coexisting in the same project.
6. Export the whole project to MP4 (File → Export, H.264 default). Decode
   3 frames spanning clip 1's echo region and clip 2's ghost region via
   ffmpeg + PIL; visually confirm both trail effects are present in the
   exported file and match what Play showed live (preview==export
   invariant — no silent divergence between the live preview path and the
   export/render path).
7. Save the project, quit the app fully, relaunch, reopen it. Both
   effects' `style` dropdowns and all knob values round-trip exactly
   (screenshot-compare against step 5/6's readings) — confirms the merged
   `PARAMS` schema persists correctly through a real save/load cycle, not
   just in-session.

**Pass bar:** all 7 steps complete without a crash, without a stray toast,
and with every screenshot/export comparison in this journey matching its
stated oracle. A failure at ANY step blocks calling `fx-afterimage`
done — this is the single story that proves the T1 combo verdict (one
effect, two engines, clean-break default) actually works for a real user,
not just in isolated packet-level pytest runs.
