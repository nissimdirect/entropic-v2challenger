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
