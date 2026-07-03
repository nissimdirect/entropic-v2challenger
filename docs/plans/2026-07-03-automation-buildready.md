---
title: Automation editing suite — BUILD-READY packet specs (post-audit)
status: ready-to-dispatch
created: 2026-07-03
grounds: docs/plans/2026-07-03-automation-ableton-adoption-prd.md (+ #383 correction)
source: automation-audit agent — read-only, file:line evidence per packet
---

# Automation editing suite — build-ready (verified against code)

The audit corrected the PRD: AA.1 is far more built than written, AA.2's compositor already
exists in `routing.py`, and AA.5 exposed a live bug. Each packet below is scoped to the VERIFIED
gap only — do NOT rebuild what exists.

**Single-flight surface (serialize packets touching these):** `components/automation/{AutomationLane,
AutomationNode,AutomationDraw,AutomationToolbar,CurveSegment}.tsx` · `utils/{automation-evaluate,
automation-record,automation-simplify,evaluateAutomationOverrides,transformLanes}.ts` ·
`stores/{automation,operators}.ts` · `shared/{axis-lanes,axis-binding}.ts` + the AutomationLane/Point
slice of `shared/types.ts` · backend `engine/{export,pipeline}.py`, `modulation/{engine,routing,
field_eval,lane_reader,audio_follower,lfo}.py`.

## AA.1 — Curved segments POLISH · effort S · SHIP FIRST · no deps
**Already done:** `AutomationPoint.curve` (types.ts:461); Alt+click preset-cycle sets it
(AutomationNode.tsx:56-60, CURVE_MODES=[0,-1,1,0.5]); CurveSegment.tsx:29-48 renders quadratic bezier;
ALL evaluators honor it via identical `applyEasing(t,curve)` — frontend automation-evaluate.ts:15-19,
export pre-bake into automation_by_frame (export.py:676-715 consumes verbatim), axis-lanes.ts:107-115.
**Gap (build ONLY this):** (1) continuous **alt-drag tension** in [-1,1] + alt-double-click→straighten
(replace/augment the preset cycle) in `AutomationNode.tsx`; (2) `automation-simplify.ts` RDP must
**re-fit tension** on kept segments (today it inherits `first.curve` verbatim — wrong shape); (3) a
**regression test**: all-curve=0 playback byte-identical pre/post. NO evaluator changes.
**Files:** `AutomationNode.tsx`, `automation-simplify.ts`, + test. **Verify:** parity preview==export.

## AA.2 — Modulation lanes (drawn relative layer) · effort M · dep none · STRATEGIC
**Already done (reuse, don't rebuild):** `OperatorMapping` (operators.ts:397-414) carries depth/min/max/
curve/**blendMode**(default 'add') + srcAxis/dstAxis/bindingRule (cross-domain). Backend blend math at
`routing.py:224,258,421,533` — the exact `blend(base, mod, depth, min, max, blend_mode)` clamped contract.
**Gap:** lift it to a **lane concept** — `AutomationLane.kind:'absolute'|'modulation'` + operator-source
ref + blendOp; "+ Mod" toolbar button; distinct-color render on the lane (Ableton blue-vs-red); a
modulation lane may draw a relative envelope AND/OR bind an existing operator. Cross-domain compose is
ALREADY proven in routing.py — AA.2 is UI/schema, not new compositing.
**Files:** `shared/types.ts` (lane kind + source ref), `AutomationToolbar.tsx`, `AutomationLane.tsx`/new,
`stores/automation.ts`; backend thin adapter if lanes emit operator-mapping-shaped payloads. **Opus-redteam**
(touches render payload). **Verify:** relative layer superimposes on absolute without overwriting; parity.

## AA.3 — Procedural generators + audio-follower on a lane · effort M · dep AA.2 · DEMO MAGNET
**Already done:** `lfo` operator (operators.ts:18, backend lfo.py), `audio_follower` operator
(operators.ts:21, backend audio_follower.py). **Gap:** a **bake-to-breakpoints** util (sample an
operator's signal across a time/domain range → write AutomationPoint[]; template = sampleLaneCurve) +
a generator picker on the lane header; "live" mode = AA.2's mod-lane pointing at the operator.
**One hard part:** audio-follower preview==export determinism (latency/lookahead) — **PRE-AA.3: read
`backend/src/modulation/audio_follower.py` internals** (audit did not). Over-T = LFO; over-Y = spatial ripple.
**Files:** new `automation-bake.ts`, `AutomationToolbar.tsx`, `stores/automation.ts`. **Opus-redteam.**

## AA.4 — Transform box + marquee multi-select · effort M · greenfield
**Absent (confirmed):** no breakpoint selection state, no marquee, only clip/mask marquees exist. **Gap:
everything** — marquee-select over breakpoints (reuse `MarqueeOverlay.tsx` pattern from timeline),
`selectedPoints` state in stores/automation.ts, and the transform box (scale/skew handles, per-domain).
**One hard part:** non-destructive reversible scaling near grid/bounds; never collapse coincident points
or lose sort order. **Files:** `stores/automation.ts`, `AutomationLane.tsx`, new `AutomationTransformBox.tsx`.

## AA.5 — Envelope pin + FIX THE LIVE CLIP-MOVE DESYNC BUG · effort M · HIGHER PRIORITY THAN WRITTEN
**LIVE BUG (audit-found):** clip-transform lanes (transformLanes.ts) key paramPath to clipId but store
RAW timeline-time points; `moveClip` (timeline.ts:1152) never rebases them → moving a clip leaves its
transform keyframes at OLD absolute times, misaligned with the footage. Filed as task #17.
**Gap:** (1) per-lane **pin toggle** (clip-relative vs timeline-absolute) + lock glyph on lane header;
(2) a `moveClip` **rebase hook** that shifts clip-relative lane times when the clip moves. **PRODUCT
DECISION NEEDED (user):** default per lane type — clip-transform lanes probably default clip-relative
(ride the footage), track-level effect lanes default timeline-absolute (downbeat flash stays put).
**Files:** `shared/types.ts` (pin field), `stores/timeline.ts:1152 moveClip` (rebase), `stores/automation.ts`,
lane header. **Note:** the bug-fix half (rebase) is worth doing regardless of the toggle.

## Also absent (fold into packets or file separately)
- **Grid-snap on draw** — AutomationDraw.tsx/automation-record.ts have no quantize (Cmd+U only snaps
  timeline clips). Fold into AA.1 or AA.4.
- **Per-control "is-automated" indicator** — no effect-panel control shows it's under an active lane.
  Small UX packet (AA.6, optional).

## Revised build order
**AA.1 (S, ship first) → AA.5-bugfix (the rebase half — fixes a live bug) → AA.2 (strategic) →
AA.3 (dep AA.2) → AA.4 → AA.5-toggle (needs product decision).** Each: own PR, vitest + preview==export
parity test, Opus-redteam AA.2/AA.3. Serialize on the single-flight surface above.
