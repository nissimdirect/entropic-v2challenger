---
title: Automation editing gestures — Ableton-parity breakpoint editing (AA.4b)
status: ready-to-packetize
created: 2026-07-03
depends-on: AA.4 (marquee-select + move — in flight, wave-1) provides the selection substrate
source: user request 2026-07-03 ("different editing options like Ableton automation editing —
  flatten, box drag one side down, etc") + Ableton Live 12 Manual §25.5.2–25.5.5
---

# Automation editing gestures (AA.4b)

AA.4 (in flight) adds marquee-select + move + copy/paste + quantize. This packet adds the RICH
Ableton breakpoint-editing gestures on top of that selection. Every gesture is **domain-agnostic**
(works on a t/y/x lane equally — a "flatten over Y" is a spatial flatten, which Ableton can't do).

## The transform box (the "drag one side down" the user means)
When breakpoints are selected, a **transform box** wraps them with edge + corner handles (Ableton
§25.5.3). Handles scale the selection within the box:
- **Drag an EDGE inward/outward** → scale that dimension (time on the left/right edges, value on the
  top/bottom edges). Points compress/expand proportionally.
- **Drag ONE side down (top-right handle down)** → **skew/tilt** the selection — e.g. drag the right
  edge down and a flat selection becomes a downward ramp. This is the user's "drag one side down."
- **Drag a CORNER** → scale both time and value at once.
- Reversible, non-destructive: dragging is live-preview; release commits. Clamp to lane bounds; never
  collapse coincident points or lose sort order.

## Flatten
- **Flatten selection → constant:** collapse all selected breakpoints to a single value (the average,
  or the value where you release) — a horizontal line. (Ableton: drag the box's top/bottom edges fully
  together = zero value-range = flat.) Expose as a one-gesture "flatten" (double-click an edge, or a
  context action) in addition to the manual squash.
- **Flatten to a line (ramp between endpoints):** replace the selected interior points with a straight
  line from first→last selected (removes wiggle, keeps the trend). This is the "make it a clean ramp"
  operation.

## The rest of the Ableton editing set (fold in — cheap once the box exists)
- **Ramp / line draw:** shift-draw or a line tool draws a straight segment between two clicks (vs
  freehand). Complements the existing Draw mode.
- **Nudge:** arrow keys move selected points by one grid unit (time) / a small value step; shift = larger.
- **Scale all values:** drag the top edge of the whole lane (no selection) to scale the entire envelope's
  amplitude (Ableton clip-envelope value-scale) — useful for "make the whole automation gentler."
- **Delete selection:** already implied by AA.4; ensure it's wired.
- **Insert shape into selection:** (this is AA.3 territory — sine/ramp/random into the selected range;
  note the overlap, build once).

## Slots into
- `stores/automation.ts` — selection already there (AA.4); add transform-box ops (scale/skew/flatten as
  pure array transforms on the selected points).
- New `AutomationTransformBox.tsx` — the box overlay + handles on `AutomationLane`.
- `AutomationLane.tsx` — render the box when a selection exists; keyboard (nudge) + line-tool gesture.
- Quantize: box-edge time-scaling snaps to grid when quantize is on (same toggle as clips).

## One hard part
The transform math must be a **pure, reversible mapping** of the selected points (affine scale+skew in
(time,value) space, then clamp + optional grid-snap), computed live during drag and committed on release
as ONE undo step. Flatten and ramp are special cases of the same mapping (value-range → 0, or interior →
line). Nail the affine transform once; every gesture is a parameterization of it.

## Test plan
- Transform box: select 4 points → drag right edge down → assert they now form the expected skewed ramp
  (specific coords). Drag top edge down → values scale toward flat. Corner → both scale.
- Flatten: selection → flatten → all selected share one value (the release value / average).
- Ramp: selection → line → interior points lie on the first→last straight line.
- Nudge: arrow moves by one grid unit; quantize-on lands on grid.
- Undo: each gesture is exactly ONE undo step; undo restores the pre-gesture points byte-for-byte.
- Domain: run the same transform on a y-domain lane — works identically (spatial skew/flatten).

## Build order
Ships AFTER AA.4 (needs its selection). Then: transform-box (scale+skew) → flatten/ramp → nudge/line/
scale-all. Opus-redteam not required (pure UI/array math, no render-payload change) but a parity test
confirms the evaluator still reads the transformed points correctly.
