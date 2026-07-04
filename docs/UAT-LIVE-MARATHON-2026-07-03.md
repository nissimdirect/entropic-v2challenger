# UAT Live Marathon — CU-driven findings (2026-07-03, resumed)

Runtime: dev Electron (npm start :5173), main af9ba3b. "Exposed & usable" lens — what a user can
actually reach in the UI, not what exists in code. Each row: driven live, screenshot-observed.

## Divergence resolutions (PART-A audit ⚠GAP vs PART-B matrix COVERED)

### #393 AA.4 breakpoint selection — resolved toward ⚠GAP (audit was right)
- **Matrix said COVERED (plan I2 exists); audit said ⚠GAP (not wired-through).** Live verdict: the
  lane INFRA is exposed (arm a track → toolbar `+ Lane` → "Add Automation Lane" picker: Domain=Time,
  target e.g. "Mixer › BPM" → lane created; `+ Mod` then enables). BUT: (a) the created lane is not
  visibly rendered under the armed MASTER row (no obvious expand/twirl to reveal it), and (b) I could
  not reach the AA.4 **breakpoint marquee-select → move → copy/paste** surface — there are no visible
  breakpoints to marquee over. So AA.4's headline gesture is **not readily reachable via the UI**,
  matching the audit's GAP direction over the matrix's plan-existence COVERED. Needs a focused fix +
  re-test. (What's exposed ≠ what's wired.)

## New live bugs (Stage I automation reachability)

### LIVE-M1 (P1) — B3 lean track header CLIPS the automation arm-R (and lock)
- On a video track (Track 2), the B3 lean header renders `name · Normal 100% chip · M · S` and the
  fixed-width header ends there — the **R (arm-for-automation) and lock controls are clipped off**,
  even at full window width (not a DevTools artifact — verified with DevTools closed). MASTER's R IS
  visible because the master row has no blend chip eating the width.
- Impact: a user cannot start the automation-record flow from a video track's header — the arm control
  isn't reachable. Blocks Stage I on real (non-master) tracks. Same family as E-1 (B3 cramping).
- Fix: widen the lean header or overflow the M/S/R/lock cluster so arm is always reachable.

### LIVE-M2 (P2) — no right-click "automate" on effect params
- Right-clicking the Chromatic Aberration `Offset` knob shows only "Freeze up to here / Save as Preset
  / Save Chain as Preset" — **no "Add automation lane" / "Automate this param"**. Lane creation is only
  via the toolbar `+ Lane` (after arming). Discoverability gap vs the Ableton right-click-to-automate
  idiom the suite targets.

## Confirmed-again this session
- UAT-1 (P3): cold-import frame-0 `Engine error: Socket is closed` toast — reproduced on this launch.
- Arm + lane-create infra works on MASTER (positive: the toolbar flow is real).

## Continued (2026-07-04)

### X272-1 field-param control — no "Field…" affordance (consistent with audit ⚠GAP)
- Live: the Chromatic Aberration device param rows (Offset knob, Direction dropdown, MIX)
  show NO "Field…" option / field-source binding control. Matches the audit's code-verified
  claim that `registry.field_capable` defaults to `set()` and is never populated → no effect
  surfaces a Field control. (Full confirmation on a FIELD_TOP25 effect deferred — same
  expected result per the empty registry.) Another "engine-present, control-absent" instance.

### THEME CONSOLIDATION — the session's load-bearing finding
Multiple independent items reduce to ONE root pattern: **suites shipped their engine but the
UI control is clipped, unmounted, or missing** — so the feature is in-code but not usable:
- Tool rail: 14 Block icons built (#347), no rail component mounted → tools only in browser tab.
- B3 lean track header: clips the automation arm-R + lock on video tracks (LIVE-M1).
- Effect params: no right-click "automate" (LIVE-M2); no "Field…" control (X272-1).
- Masking: marquee tool activates but draw doesn't register (F-2).
- #393 AA.4: lane infra reachable, breakpoint-select surface not.
**Recommendation:** the highest-leverage fix wave is CONTROL-SURFACE, not engine — mount the
rail, un-clip the header cluster, add the missing param affordances. Then the blocked CU
journeys (Stage F masking, Stage I automation) become testable.

### LIVE-M3 (P1 — render stability) — engine timeout + silent empty-chain fallback
- Live: during playback with ONE effect (Chromatic Aberration) + one armed Master automation
  lane, the console floods with `[Render] frame N error: Engine took too long to respond. Try
  removing the last effect or reducing chain length.` followed by `[Render] retrying frame N
  with empty chain` (App.tsx:1741/1749) — 128 errors across frames 126–149+, plus a toast over
  the preview. The **empty-chain retry silently drops the effect** → the rendered/played frame
  is WRONG (no effect) with no clear user signal beyond a transient toast.
- **Confound to control for:** this dev sidecar had ~10.6h uptime (38282s) — the timeouts may be
  long-running-process degradation (memory/resource leak) rather than the light load itself.
  **Repro protocol:** relaunch fresh, import 1 clip + 1 effect, play through → if timeouts recur
  on a fresh sidecar, it's a real per-frame budget/perf bug; if only after long uptime, it's a
  sidecar leak. Either is a P1 (silent wrong-output fallback). Needs a clean-relaunch repro.
- Note: further CU verdicts on THIS instance are unreliable until relaunch (engine degraded).

### LIVE-M3 — CONFIRMED on FRESH sidecar (uptime 155s) — NOT uptime degradation
Repro ran: fresh relaunch → New Project → import test-video.mp4 → add Chromatic Aberration →
press Play. Result: console floods (114 err / 86 warn) with, during playback:
- `[Render] frame N error: Engine took too long to respond. Try removing the last effect or reducing chain length.`
- `[Render] retrying frame N with empty chain`  ← silently drops the effect → wrong output
- `[Render] frame N error: Engine error: Socket is busy writing; only one send operation may be in progress at any time`  ← **concurrency bug**
- `[Render] frame N error: Engine error: Operation cannot be accomplished in current state`
**Verdict: confirmed P1 render-stability bug.** During playback the frontend fires OVERLAPPING
render sends on the single ZMQ socket (the "Socket is busy writing" error), the engine misses the
per-frame timeout budget, and the fallback renders an EMPTY chain (effect silently dropped). One
effect is enough to trigger it — not a heavy-load edge case. The 10.6h-uptime confound is REFUTED
(reproduces at 155s uptime). Root-cause area: the playback render-request loop (App.tsx:1741/1749)
needs send-serialization / in-flight-request gating on the ZMQ socket. This likely also explains
the frame-0 "Socket is closed" (UAT-1) — same single-socket concurrency seam.

## SYSTEMIC METHOD FINDING (2026-07-04) — synthetic CU pointer events don't trigger drag-drop/canvas-draw
Across 4 independent attempts, computer-use SYNTHETIC pointer events failed to trigger this app's
drag-drop and canvas-draw handlers:
1. Instrument placement — `left_click_drag` onto a track did nothing; the app's own hint said
   "double-click to add" (double-click worked). Drag path did not.
2. Mask draw (F-2) — marquee-rect tool active, but neither synthetic drag nor manual
   down/move/up produced marching-ants.
3. Automation breakpoint drag (#393) — couldn't reach the marquee-select-then-drag surface.
4. K1 Master guard — dragging Sampler onto MASTER produced no instrument AND no rejection toast
   (inconclusive: correct silent-reject, OR the drag simply didn't register — can't distinguish).

**Implication for the CU-UAT method (important):** any UAT row whose interaction is drag-drop,
freehand draw, or canvas marquee CANNOT be reliably verdicted via computer-use synthetic events —
a PASS/FAIL there is confounded by "did the synthetic event even fire the handler." These rows
need EITHER a real human pointer OR a test-hook / Playwright `_electron` drag (which dispatches
real DOM pointer sequences). CU IS reliable for: clicks, menus, typing, single-frame visual
inspection, param knobs via click-drag-on-slider (which worked — the Offset knob dragged fine),
and reading state.

**Reclassify the combined doc's rows by interaction type:** click/menu/type/inspect → CU-verifiable;
drag-drop/freehand-draw/marquee → needs-human-or-hook. This is why the masking (Stage F) and
drag-based automation (parts of Stage I) rows kept coming back inconclusive — not app bugs
necessarily, a method limit. Playback-dependent rows are separately blocked by #429.

### K1 (Master instrument-drop guard) — INCONCLUSIVE
Sampler drag onto MASTER: no instrument added (correct if guard fired) but no rejection toast
observed. Cannot distinguish "silent-reject (toast missing = UX gap)" from "drag didn't register"
per the systemic finding above. Needs human-pointer or Playwright drag to verdict.

## CU-VERIFIABLE clean PASSES (2026-07-04, click/menu/inspect — reliable via CU)

### F_0512_37 — Help → Keyboard Shortcuts opens Prefs Shortcuts tab — ✅ PASS
Help menu → "Keyboard Shortcuts" opens Preferences with the **Shortcuts** tab active. Confirmed.

### G4 — Preferences dialog — ✅ PASS (works, 4 tabs)
Tabs: General · Shortcuts · Performance · Paths. All reachable via click.
- **Shortcuts tab:** full binding table matching code — TRANSPORT (Play/Pause space, Forward l,
  Stop k, Reverse j), EDIT (Undo meta+z, Redo shift+meta+z, Duplicate meta+d, Delete backspace,
  Ripple shift+backspace), TIMELINE (Marker m, Loop In i, Loop Out o, Split meta+k, Toggle Loop
  meta+l), VIEW (Toggle Automation a). Bindings match `default-shortcuts.ts`.
- **Performance tab:** Auto-freeze threshold (effects) = 50 · Max chain length = 20 · Render
  quality = Medium (dropdown). **Relevant to #429:** the render-timeout/empty-chain fallback fires
  at ONE effect — far below Max chain length 20 and Auto-freeze 50 — confirming #429 is a real
  per-frame/concurrency bug, not a chain-length-limit behavior. (Render quality is a user knob but
  shouldn't be needed to render 1 effect.)
- Partially addresses audit G20 "no perf rows": perf *settings* exist in Preferences; there's still
  no live perf telemetry/HUD surfaced during playback.

Menu sweep so far (native menu, CU-reliable): Help menu = Keyboard Shortcuts / Send Feedback
(⌘⇧F) / Generate Support Bundle (⌘⇧D). Menus are click-verifiable — a good CU-reliable lane vs the
drag/draw/playback lanes that are blocked.

### G3 — Edit → Undo History overlay — ✅ PASS
Edit menu shows "Undo History" (+ standard Undo ⌘Z / Redo ⌘⇧Z / Cut/Copy/Paste/Delete). Clicking it
opens the UNDO HISTORY panel (top-left) with a HISTORY section ("No actions yet" on empty project).
Prefs General tab: Theme=Dark (Light "Coming soon"), Language=English.

### CU-reliable lane status
Confirmed PASSES via click/menu/inspect: spine (import→effect→preview→export→parity), P1-B (instrument
mount no v2-reject), A7a %-labels, F_0512_37 (shortcuts tab), G4 (Preferences 4 tabs), G3 (Undo
History). This lane is reliable and productive. The remaining un-verdicted rows split into the two
blocked lanes already documented: drag/draw (synthetic-CU can't fire the handler) and playback
(#429 render-concurrency degrades the engine). So "complete via CU" ≈ the click/menu/inspect subset;
the rest needs the #429 fix + a human/Playwright pointer for drag-draw.

### Menu sweep (CU-reliable) + a drag-workaround for G1
- **Help:** Keyboard Shortcuts · Send Feedback (⌘⇧F) · Generate Support Bundle (⌘⇧D).
- **Edit:** Undo (⌘Z) · Redo (⌘⇧Z) · Undo History · Cut/Copy/Paste/Paste-Match/Delete · (macOS std).
- **Timeline:** Add Video Track · Add Text Track (⌘T) · Delete Selected Track · **Move Track Up** ·
  **Move Track Down**.
- **Insight:** the arrangement-as-layers restack (Stage G1) that couldn't be verified by DRAG (synthetic
  CU can't fire drag-drop) HAS a menu path — `Timeline → Move Track Up/Down`. So G1's z-order reorder
  is CU-drivable via menu clicks. Caveat: *verifying* the composite z-order actually changed still
  needs a render-diff, which #429 degrades during playback — so single-frame render-diff (scrub, not
  play) is the way to verdict it once #429 is addressed. General lesson: for drag-based features,
  check for a menu/keyboard equivalent before marking "not CU-verifiable."

---

## MARATHON COMPLETION STATE (2026-07-04)

**CU-reachable surface = documented.** The loop covered everything computer-use can reliably verdict
and clearly bounded what it can't.

**PASSES (click/menu/inspect/single-frame — CU-reliable):** launch, import+render, add-effect+preview,
knob-drag, export, preview==export parity, P1-B instrument mount (no v2-reject), A7a %-labels,
F_0512_37 (Help→Shortcuts tab), G4 (Preferences 4 tabs), G3 (Undo History), menu sweep (Help/Edit/Timeline).

**BUGS filed (issues #422–429):** #422 tool rail unmounted · #423 un-triggered sampler occludes lower
track · #424 B3 header slider/tab overlap · #425 masking q-hotkey + draw · #429 (P1) playback render
timeout → silent empty-chain fallback + ZMQ socket-busy concurrency. Plus doc'd: UAT-1 frame-0 socket,
E-3 icons/type-floor, LIVE-M1 header arm-clip, LIVE-M2 no right-click-automate.

**Divergence resolved via CU:** #393 AA.4 → GAP (lane infra reachable, breakpoint-select surface isn't).

**TWO BLOCKED LANES (not CU-completable — this is the honest boundary):**
1. **Drag-drop / freehand-draw / marquee rows** — synthetic CU pointer events don't fire this app's
   handlers (4 confirmations). Need a human pointer OR Playwright `_electron` real-pointer drags.
   Affected: masking J1–J5 (Stage F), drag-restack (Stage G1 — has a MENU workaround), instrument
   drag-placement, mask routing.
2. **Playback-dependent rows** — #429 degrades the engine during Play (timeout + empty-chain), so
   parity-under-playback, automation-eval, instrument-voice, transition, and granulator rows can't be
   reliably verdicted until #429 is fixed. Single-frame (scrub, not play) checks remain usable.

**What unblocks the rest:** (a) fix #429 (render-request serialization on the ZMQ socket) → re-enables
all playback rows; (b) a Playwright `_electron` drag harness OR a human-pointer pass → the drag/draw
rows. Then the combined doc's remaining rows become executable.

**Net:** the load-bearing bugs and the reachability/method limits are all captured. Further CU looping
now is low-yield until (a)/(b); the highest-leverage next work is fixing #429 + the control-surface
gaps (rail, header), which converts the biggest blocked lane into a testable one.
