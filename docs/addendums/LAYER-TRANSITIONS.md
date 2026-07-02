# Layer Transitions — Entropic v2 Addendum

> Generated: 2026-02-19
> Status: APPROVED CONCEPT — add as later phases, not in current build plan
> User directive: "All this is gonna be fucking sick. Keep all the content."

---

## Concept

When a layer is triggered (via keyboard, MIDI, or timeline), **how** it enters and exits the canvas is an expressive creative choice. This is not just a transition — it's part of the performance.

A flattened/rendered transition can then be fed INTO a glitch effect, and the transition itself gets moshed/corrupted, creating unique artifacts.

---

## Transition Categories

### Geometric Reveals (15)

| # | Name | Description |
|---|------|-------------|
| 1 | Column Cascade | Vertical columns fill left→right |
| 2 | Column Cascade Reverse | Right→left |
| 3 | Row Waterfall | Horizontal rows fill top→down |
| 4 | Row Rise | Rows fill bottom→up |
| 5 | Venetian Blinds H | Horizontal slats alternate in |
| 6 | Venetian Blinds V | Vertical slats alternate in |
| 7 | Iris Open | Circle expands from center |
| 8 | Iris Close-Open | Circle shrinks to point then reopens with new layer |
| 9 | Clock Wipe | Rotational reveal like a clock hand |
| 10 | Diamond Expand | Diamond shape grows from center |
| 11 | Diagonal Slash | Diagonal line sweeps corner to corner |
| 12 | Checkerboard | Alternating grid squares fill in |
| 13 | Spiral In | Spiral from edges to center |
| 14 | Spiral Out | Spiral from center to edges |
| 15 | Hexagonal Tiles | Hex grid fills in a wave pattern |

### Pixel/Digital Reveals (9)

| # | Name | Description |
|---|------|-------------|
| 16 | Pixel Dissolve | Random pixels flip to new layer, density increases |
| 17 | Scanline Reveal | One scanline at a time, CRT style |
| 18 | Interlace | Odd lines first, then even lines |
| 19 | Resolution Step | Appears at 1px, then 2px, 4px, 8px... full res |
| 20 | Dither Reveal | Floyd-Steinberg dithering pattern emerges |
| 21 | ASCII Phase | Briefly renders as ASCII during transition |
| 22 | Block Load | JPEG-style 8x8 blocks load in random order |
| 23 | Progressive JPEG | Blurry full image → sharpens progressively |
| 24 | Matrix Rain | Columns of characters cascade down, revealing layer behind |

### Glitch-Native Reveals (11)

| # | Name | Description |
|---|------|-------------|
| 25 | Channel Shift Arrival | R channel arrives first, then G, then B |
| 26 | Compression Artifact | New layer appears as JPEG macro-blocks, then cleans up |
| 27 | Buffer Overflow | Scanlines from new layer overflow into old layer |
| 28 | Frame Drop Reveal | Random frames of old layer drop out, showing new |
| 29 | Bitcrush Step | New layer at 1-bit → 2-bit → 4-bit → 8-bit |
| 30 | VHS Tracking | Horizontal tracking lines reveal new layer |
| 31 | Signal Interference | Old and new interfere like radio static |
| 32 | Pixel Sort Edge | Sort threshold IS the transition boundary, sweeping |
| 33 | Datamosh Blend | P-frames from old, I-frames from new |
| 34 | Corruption Creep | Byte corruption starts at one edge and spreads |
| 35 | Mosaic Defrag | Screen shatters into tiles, each flips to new |

### Physics/Organic Reveals (11)

| # | Name | Description |
|---|------|-------------|
| 36 | Liquid Pour | New layer pours from top with gravity |
| 37 | Ink Bleed | Organic blob expands from trigger point |
| 38 | Shatter | Old layer breaks into fragments, new behind |
| 39 | Paper Burn | Old layer burns away from edge |
| 40 | Freeze Crystallize | Ice crystal pattern grows across frame |
| 41 | Smoke Reveal | Wispy smoke reveals new layer |
| 42 | Ripple Emerge | Water ripple from center, new layer in cleared areas |
| 43 | Erosion | Old layer erodes like sand |
| 44 | Cellular Automata | Game of Life pattern spreads from seed |
| 45 | Gravity Pull | Old layer pixels fall with gravity |
| 46 | Magnetic Attract | New layer pixels fly in from edges |

### Audio-Synced Reveals (7)

| # | Name | Description |
|---|------|-------------|
| 47 | Beat Cascade | Each column/row appears on a beat subdivision |
| 48 | Amplitude Reveal | Louder audio = faster reveal |
| 49 | Frequency Paint | Bass fills bottom, mids fill middle, treble fills top |
| 50 | Waveform Wipe | Audio waveform shape IS the reveal mask edge |
| 51 | Oscillator Edge | Reveal boundary follows wave shape |
| 52 | Sidechain Pump | Reveal pulses forward on kicks, retreats between |
| 53 | Transient Flash | Full layer flashes on transients, fades between |

**Total: 53 transition types**

---

## Performance Modifiers

Stack on top of any transition to change HOW it behaves based on input:

| Modifier | What It Does |
|----------|-------------|
| Velocity → Speed | MIDI velocity controls transition speed |
| Velocity → Intensity | Harder hit = more opaque layer |
| Hold Mode | Layer visible while key held. Release = exit plays |
| Toggle Mode | Press = enter. Press again = exit |
| One-Shot | Enter, play duration, exit automatically |
| Staccato | Brief flash, auto-retrigger on beat if held |
| Legato | Smooth crossfade when switching between layers |
| Retrigger | If triggered mid-transition, restart |
| Glide | When switching transitions, morph between them |
| Quantize to Grid | Transition start snaps to nearest beat division |
| Swing | Timing gets swing offset |
| Reverse | Any transition plays in reverse for exit |
| Loop | Continuously cycles (enter→exit→enter→...) |
| Probability | X% chance the transition fires. Otherwise silent |
| Round Robin | Each trigger picks next transition from a list |

---

## Extended Concepts

### Choke Group Transitions
When one layer kills another (choke group), the dying layer's exit transition and new layer's enter transition play simultaneously. The handoff between effects becomes part of the composition.

### Follow Actions
When a layer's transition completes, auto-trigger the next layer. Build cascading visual sequences.

### Transition Presets
Bundle transitions into named presets: "Vintage TV" = column cascade + scanline + VHS tracking. Shareable via recipe system.

### Transition Recording
In Perform mode, record which transitions triggered, when, with what velocity. Play back as automation.

### Per-Region Transitions
Apply different transitions to different masked regions of the same layer.

### Feeding Transitions Into Effects
A rendered/flattened transition can be fed into a glitch effect. The transition itself gets corrupted, creating unique artifacts that are impossible to achieve otherwise.

---

## Architecture Notes

Transitions are effects. They use the same pure-function signature:
```
(frame_a, frame_b, params, progress, state_in) → (result, state_out)
```

Where:
- `frame_a` = outgoing layer frame
- `frame_b` = incoming layer frame
- `progress` = 0.0 → 1.0 (transition progress)
- `params` = transition-specific parameters
- `state_in/state_out` = for stateful transitions (physics, cellular automata)

This means transitions are composable with the existing effect chain, shareable via the recipe/preset system, and community-extensible.

---

## UX Accessibility (Keep It Simple)

The transition system must NOT overwhelm users. Design principles:

1. **Default = no transition.** Layers appear/disappear instantly unless the user opts in. Zero complexity by default.
2. **Premiere analogy:** Think of transitions like drag-and-drop fade-in/fade-out on a clip in Premiere. The user sees their clip on the timeline, drags a transition onto the edge, done. Not a separate mode or panel.
3. **Ableton MIDI effects analogy:** In Ableton, MIDI effects sit *before* an instrument in the chain. Similarly, transitions could be properties on the layer/clip itself — visible in the inspector panel when a layer is selected. One dropdown: "Enter: None / Column Cascade / Pixel Dissolve / ..." and "Exit: None / Reverse / Fade / ...".
4. **Progressive disclosure:** Phase 5 ships with 5-10 simple geometric reveals. Advanced transitions (physics, audio-synced) come later. Users discover complexity gradually.
5. **Don't add a "transitions panel."** Transitions are a property of the layer, not their own workflow. Keep the UI surface small.

---

## Phase Placement

**Phase 5 (Basic Performance):** Add enter/exit transition selection per layer. Ship 5-10 geometric reveals as proof of concept.
**Phase 12+ (Post-v1):** Full transition library (53+), all performance modifiers, follow actions, per-region transitions.

**Architectural requirement for Phase 5:** The Layer data model must have `enter_transition` and `exit_transition` properties. The layer compositor must support a transition progress state. This is a small addition to the Phase 5 spec.
