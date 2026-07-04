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
