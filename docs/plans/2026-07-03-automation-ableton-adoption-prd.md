---
title: Automation — Consume Ableton's model, cross it with Creatrix's spatial axis
status: approved-research / ready-to-packetize
created: 2026-07-03
source: ableton-research agent (Ableton Live 12 Manual Ch.25 + Clip Envelopes) + in-repo verification
strategic-frame: adopt Ableton's relative/absolute two-layer model + editing craft, implement ALL of it
  DOMAIN-AGNOSTIC so every borrowed feature gets a spatial (Y/X-axis) second life Ableton can't follow.
---

# Automation Adoption PRD — "spatial automation"

**User intent (verbatim):** "i effectively want to consume ableton's features there" — bring Ableton's
automation maturity into Creatrix.

**Thesis:** Creatrix is NOT "Ableton for video." It's the first tool where **automation has a shape in
the frame.** Ableton indexes every envelope by *time*; Creatrix already indexes by scanline-**Y** / column-**X**
(`axisBinding.domain`, verified `frontend/src/shared/axis-lanes.ts`). We adopt Ableton's editing craft +
its relative/absolute two-layer model, but build every operator **domain-agnostic** — a sine "over T" is an
LFO; the same sine "over Y" is a spatial ripple. Two features for the price of one; Ableton structurally
cannot follow onto the spatial axis.

## What we VERIFIED in-repo (ground truth, not assumed)
- **HAVE:** timeline automation lanes; R/L/T/D = Read/Latch/Touch/Draw; replace vs overdub write modes
  (`utils/automation-record.ts`); axis-domain lanes t/y/x with dense sampled `curve[]` profile
  (`shared/axis-lanes.ts`); draw strokes; Simplify; quantize grid; hardware-CC→automation (MIDI-learn);
  clip-transform keyframe lanes (A1/A2); an **operator system** (LFO/Kentaro/env-follower) as a separate
  modulation substrate.
- **`AutomationPoint` already carries a `curve: number` field — hardcoded to 0** everywhere
  (`utils/automation-record.ts:25/69/92`). Curved segments = wire it up, NOT a schema change.
- **LACK (confirmed absent):** relative-modulation-over-absolute layer; breakpoint marquee multi-select;
  transform/stretch box; per-lane procedural generators (sine/LFO/audio-follower baked onto an automation
  lane); envelope pin (timeline-lock vs clip-lock).

## Adoption packets (build order = cheapest-quality-win → strategic core → demo magnet)

### AA.1 — Curved segments (ease handles) · effort S · FIRST
The `AutomationPoint.curve` field exists but is always 0. **Wire it end-to-end:** Alt-drag a segment to
bend (set `curve` tension ∈ [-1,1]); Alt-double-click to straighten (curve→0); the per-frame evaluator
interpolates the curve (backend + `computeSamplerVoice`/axis-lane samplers must honor it — audit which
already do). Simplify must preserve/re-fit tension; grid snaps breakpoint *times*, curve stays continuous.
- Verify: linear playback byte-identical when all curve=0 (regression guard); a bent segment renders a
  visibly eased ramp; parity preview==export. **Highest polish-per-effort; ship first.**

### AA.2 — Modulation lanes (relative envelope, cross-domain) · effort M · STRATEGIC CORE
A param can carry, ALONGSIDE its absolute lane, one+ **modulation** lanes that only *influence* the absolute
value via a blend op (add | multiply | clamp-max), rendered in a distinct colour (mirror Ableton blue vs red).
Final = `blend(absolute(t), modulation(domain))`, clamped. Modulation lane may use a **different domain** than
its base (absolute over T + relative wiggle over Y). This is NOT overdub (overdub adds points into the same
absolute lane; modulation is a separate relative layer that can't destroy the scripted move).
- Lane model gains `kind: 'absolute' | 'modulation'` + `blendOp`; AutomationToolbar gains "+ Mod".
- **One hard part (nail once):** the cross-domain compositing contract — how a Y-indexed modulation composes
  with a T-indexed base at one rendered frame (evaluate base at frame-time; mod per-scanline; blend per
  scanline; clamp). Reuse the SG-3 finite-guard on the blended output (numeric trust boundary).
- Consider grounding on the existing operator system as the modulation-source substrate rather than a new one.

### AA.3 — Procedural generators + audio-follower on a lane · effort M · DEMO MAGNET (dep AA.2)
On a modulation lane, pick {sine, tri, saw, square, random/S&H, **audio-follower**} with rate (grid units or
Hz), depth, phase. "Insert shape" bakes into a selected range as breakpoints (Ableton §25.5.5); "live" stays
generative; audio-follower reads the project soundtrack envelope each frame. Over T = LFO; **over Y = spatial
ripple** — same control, new meaning.
- **One hard part:** the audio-follower clock — map soundtrack amplitude onto the frame timeline with correct
  latency/lookahead so reactions land on the beat, **identically in preview and export** (hold the
  preview==export invariant; export bakes the follower deterministically).
- This is the audio-reactive-video killer feature — drive scale/rotation/glitch from the soundtrack.

### AA.4 — Breakpoint transform box (stretch / skew) · effort M · dep marquee-select
Marquee-select a range of breakpoints → a box with corner/edge/center handles scales points in **time & value**
+ skew, along the lane's domain (Ableton §25.5.3). (Prerequisite: breakpoint marquee multi-select, currently
absent — build it as part of this packet.)
- **One hard part:** non-destructive reversible scaling near grid/bounds — clamp to range, optional re-snap,
  never collapse coincident points or lose sort order.

### AA.5 — Envelope pin (timeline-lock vs clip-lock) · effort S
Per-lane toggle: travel with the clip, or stay pinned to absolute timeline when the clip moves (Ableton
§25.5.6). A lock glyph on the lane header. Kills the "my automation slid when I moved the clip" bug class
(a color-grade ramp rides the clip; a downbeat flash stays pinned to the timeline).
- **One hard part:** anchor conversion when flipped mid-project — rebase breakpoint times
  clip-relative↔timeline-absolute so nothing visibly jumps.

## Lean-into-the-moat requirements (thread through ALL packets)
- **Domain is a first-class, VISIBLE lane property** — each lane header shows t/y/x with a one-click switch
  (not a hidden mode). When domain is as easy to change as the parameter, users discover spatial automation.
- **Every editing operator (curve, transform box, generator, simplify) works over ALL domains equally.** Never
  special-case T. A sine over Y is a spatial ripple for free.
- **Message it as "spatial automation."**

## Sequencing & gates
Build order: **AA.1 → AA.2 → AA.3 → AA.4 → AA.5.** Each: own branch/PR, vitest + a preview==export parity
test (automation is a render-payload contract — the P1-B/A2b seam class), Opus-redteam AA.2/AA.3 (they touch
the render/compositing + audio clock). Single-flight on `stores/automation.ts`, `shared/axis-lanes.ts`, and
the per-frame evaluator — serialize the packets, don't parallelize onto the same files.

## Out of scope (Ableton has, low value for video — do NOT build)
Tempo/warp automation (→ maybe global playback-rate later), send/return automation (depends on shared-bus
arch), per-clip envelope layered over track lane (partially covered by clip-transform lanes already).

## Open verification before AA.1 packet
- Confirm which evaluators already read `AutomationPoint.curve` (backend export.py + axis-lane sampler +
  computeSamplerVoice) so AA.1 wires the missing ones, not all.
