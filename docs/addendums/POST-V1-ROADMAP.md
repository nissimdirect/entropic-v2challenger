# Post-v1 Roadmap — Entropic v2 Addendum

> Generated: 2026-02-19
> Status: APPROVED CONCEPTS — tacked onto end of roadmap, not in current build plan
> Source: Strategy + Synthesize session, user directives
> Related: MUSICIAN-NATIVE-FEATURES.md, LAYER-TRANSITIONS.md, COMMUNITY-ECOSYSTEM.md, COMPETITIVE-MOAT-ANALYSIS.md

---

## Guiding Principle

These items are explicitly NOT in Phases 0A-11. They are future work that extends Entropic after the core v1 ships. Some require **architectural preparation in earlier phases** (noted in MUSICIAN-NATIVE-FEATURES.md "Architectural Decisions Needed" table) — those are data model considerations, not scope additions.

---

## v1.1: Cross-Modal Release (planned 2026-05)

The first post-v1 release. Four small features that exploit existing infrastructure to deliver MIDI-driven, motion-driven, macro-driven, and chord-driven control over effect chains. Architecturally distinct from later phases: every feature uses the existing `applyCCModulations` pure-function pattern — no operator remount, no new IPC, no new backend modules except one optional `video_analyzer.py` extension.

| Feature | Description | Reuses | Status |
|---------|-------------|--------|--------|
| F1 — Datamosh Sequencer | 16-step MIDI-driven grid for `intensity` + `corruption` on `datamosh.py` and `datamosh_real.py` | `stores/midi.ts` MIDI Learn pipeline; `applyCCModulations.ts` pattern | planned |
| F2 — Optical Motion Angle | Extends `video_analyzer.py:analyze_motion` from scalar pixel-delta to (magnitude, angle, centroid_x, centroid_y) via Farneback at 64×64 proxy | existing VideoAnalyzer operator | planned |
| F3 — Live Macro Device | One knob → N mapped effect params via `applyMacroModulations.ts` mirroring `applyCCModulations` | `MacroMapping` type, `MacroKnob.tsx`, persistence shape in Presets and DeviceGroups | planned |
| F4 — Chord-to-Param Modulator | Frontend chord parser → `chord_root` + `chord_quality_index` mod values via `applyChordModulations.ts` | `stores/midi.ts` Web MIDI input; `applyCCModulations.ts` pattern | planned |

Foundation work (cross-cutting, completed during planning):

| PR | Description | Status |
|----|-------------|--------|
| #36 | Cross-modal features release plan v3 (canonical plan doc) | open |
| #37 | `feat/modulation-toposort` — fixes silent-zero bug where Fusion operators read 0.0 from sources declared later in operator list | open, 12 new tests + 5327 backend smoke green |
| #38 | `feat/project-load-hardening` — depth-bomb / proto-pollution / key-bomb / forward-version validator before `validateProject` runs | open, 19 new tests + 50 existing persistence green |

Estimate: ~1.5–2 sprints total for F1–F4 after foundations land. Plan doc: `docs/plans/2026-05-04-cross-modal-features-plan.md`.

**Gated on:** v1 ship per state-of-union §Tier 0. Operator rack stays unmounted; this release uses the chain-transform pattern instead.

**NOT in scope:** OSC sender, mode-brightness chord inference, hand-drawn macro curves, backend MIDI plumbing, schema migration framework, mod source registry, DAG cycle detection — all rejected as solving non-problems against the actual codebase per the parallel review pass on PR #36.

---

## Phase 12: Tempo + Musical Time

| Feature | Description | Source |
|---------|-------------|--------|
| Project BPM (optional) | Off by default. When on, timeline shows beat grid. | User directive |
| Tap tempo | Set BPM by tapping | Standard UX |
| Tempo automation | BPM changes over time via lane | User directive |
| Beat detection | Auto-detect beats from audio, create markers | Musician-native |
| Time divisions | 1/64 through 8 bar phrases | User directive |
| Triplet toggle | Triplet variants of each division | User directive |
| Swing/shuffle % | Offset every other subdivision | Ableton analogy |
| Quantize on/off | Grid snap toggle per track or global | User directive |
| Tempo-syncable parameters | Any time-based param toggles between absolute (ms/frames) and musical division | User directive: "anything that can be parameterized for time can also be tempo synced" |

**Architectural prep (Phase 2A):** Parameter type system needs a `time` type with absolute/synced modes.
**Architectural prep (Phase 4):** Timeline data model must support both frame-based and beat-based time addressing.

---

## Phase 13: Full Transition Library

| Feature | Description | Source |
|---------|-------------|--------|
| 53+ transition types | Geometric, pixel/digital, glitch-native, physics/organic, audio-synced | Layer Transitions addendum |
| 15 performance modifiers | Velocity→speed, hold/toggle/one-shot, staccato, legato, retrigger, probability, round robin | Layer Transitions addendum |
| Follow actions | Auto-trigger next layer when transition completes | User approved |
| Choke group transitions | Dying layer's exit + new layer's enter play simultaneously | User approved |
| Transition presets | Bundle transitions into named presets, shareable via .recipe | User approved |
| Transition recording | Record which transitions triggered, when, with what velocity | User approved |
| Per-region transitions | Different transitions on different masked regions of same layer | User approved |
| Feed transitions into effects | Flattened/rendered transition fed into glitch effects | User directive: "if you have flattened video that's been transitioned, you could feed that into a glitch" |

**Architectural prep (Phase 5):** Layer data model needs `enter_transition` and `exit_transition` properties. Ship 5-10 simple geometric reveals as proof of concept.

---

## Phase 14: Audio-Reactive Modulators

| Feature | Description | Source |
|---------|-------------|--------|
| Universal Audio Follower | Audio input → modulation values mappable to ANY parameter (amplitude, frequency, spectral centroid, onset) | User directive |
| Frequency Band Splitter | Split audio into 2-8 bands, each drives a different parameter | User directive + Mosh-Pro study |
| Envelope Follower | Audio amplitude → smooth 0-1 control signal with attack/release shaping | Musician-native |
| Transient Shaper | Emphasize/de-emphasize beat attack vs sustained body, applied to effect intensity | Musician-native |

**Architectural prep (Phase 6):** DAG routing must accept audio analysis nodes as modulation sources.

---

## Phase 15: Pre-Input Modulators

| Feature | Description | Source |
|---------|-------------|--------|
| Pixel Jitter | Random per-pixel displacement (noise-based UV distortion) | User directive |
| Directional Drift | All pixels slowly moving in one direction | Musician-native |
| Breathing | Subtle scale in/out | Musician-native |
| Camera Shake | Simulated handheld movement | Musician-native |
| Step Sequencer | 16-step pattern cycling displacement values at tempo | Musician-native |
| Euclidean Rhythm | Algorithmically distributed triggers | Musician-native |
| Sample & Hold | Random value held steady, re-rolled at tempo-synced intervals | Musician-native |

---

## Phase 16: Beat Effects

| Feature | Description | Source |
|---------|-------------|--------|
| Beat Repeat | Stutter/repeat a section of video, quantized to grid (like Ableton's Beat Repeat) | User directive: "we should also have beat repeats as an effect" |
| Stutter | Rapid re-trigger of current frame at musical subdivisions | Musician-native |
| Time-synced Delay | Frame echo with tempo-locked delay times | Musician-native |
| Time-synced LFO | LFO speed as musical division, not Hz | Musician-native |

---

## Phase 17: Monitoring Tools as Effect Sources

| Tool | As Monitor | As Renderable Effect Source |
|------|-----------|---------------------------|
| Oscilloscope | Show any parameter value over time | Render oscilloscope waveform into video |
| XY / Lissajous | Show audio L/R as Lissajous pattern | Render Lissajous into video as overlay |
| Spectrum Analyzer | Show audio frequency spectrum | Render spectrum bars into video |
| Waveform Overview | Show audio waveform under timeline | Render waveform into video |
| Vectorscope | Show color distribution | Render vectorscope into video |
| Histogram | Show color histogram (already in v2 Color Suite) | Render histogram into video |
| Level Meters | Audio level next to video tracks | Render level bars into video |

---

## Phase 18: Community Ecosystem

| Feature | Description | Source |
|---------|-------------|--------|
| Recipe gallery | Public web page, searchable by tags, GitHub-based submission | COMMUNITY-ECOSYSTEM.md |
| Community effects | Single-file Python effects with metadata header, submitted via PR | COMMUNITY-ECOSYSTEM.md |
| Open project format | .entropic files (JSON, human-readable, diffable, forward-compatible) | COMMUNITY-ECOSYSTEM.md |
| Effect attribution | Credit chain preserved through forks/remixes | COMMUNITY-ECOSYSTEM.md |

---

## Phase 19: Cannibalization Sprint

| Target | What We Take | License | Priority |
|--------|-------------|---------|----------|
| Datamosher-Pro | 30+ glitch effect functions → audit against our 126, port novel ones | MIT | HIGH — audit first, port gaps |
| FFglitch | Bitstream-level codec access (motion vectors, DCT coefficients, quantization params). Research: can PyAV expose these? If not, can ffedit run as subprocess/library? | LGPL | MEDIUM — deep FFmpeg research needed |
| Mosh-Pro concepts | Frequency band → parameter mapping UX, modulator chaining UX, accessibility patterns | Study only (proprietary) | LOW — inform our Phase 14 design |
| Datamosh 2 concepts | Mosh Maps (spatial region → effect intensity), marker-based triggering, 60 algorithm variants as R&D inspiration | Study only (proprietary) | LOW — inform our Phase 8 design |

---

## Dimensional Translation (Infrastructure — Partially Shipped)

Core compositing infrastructure for resize, scale, position, rotate, flip, and multi-track layering. PRD at `docs/DIMENSIONAL-TRANSLATION-PRD.md`.

### Shipped (2026-04-10)

| Feature | Status |
|---------|--------|
| Expanded ClipTransform (scaleX/Y, anchorX/Y, flipH/V) | DONE |
| Per-clip opacity model (`Clip.opacity`) | DONE |
| Canvas resolution in project store + persistence | DONE |
| Multi-track video rendering (all tracks composited, not just first) | DONE |
| Track opacity + blend mode wired to compositor | DONE |
| Backend: independent scaleX/scaleY, anchor rotation, flip, expanded clamps (10000% scale, ±36000° rotation) | DONE |
| TransformPanel: split W/H scale, aspect lock toggle, Fill button, Flip H/V, unit labels, per-property reset | DONE |
| BoundingBoxOverlay: SVG handles (8 handles, move/scale/rotate), undo transactions, arrow key nudge | DONE |
| Snap guides (center + edge indicators) | DONE |
| Coordinate conversion utilities (DOM ↔ Canvas ↔ Transform) | DONE |
| Import auto-fit uses canvas resolution | DONE |

### Remaining — Transform Keyframe Animation

| Feature | Description | Priority |
|---------|-------------|----------|
| Keyframe diamonds per transform property | Click to set keyframe at current playhead time | P1 |
| Stopwatch model (first click enables, subsequent add) | Premiere/AE convention | P1 |
| Reuse existing AutomationLane + evaluateAutomation() | Extend paramPath convention: `clip:{clipId}.transform.{property}` | P1 |
| Keyframe navigation (prev/next arrows) | In TransformPanel, flanking diamond | P1 |
| Keyframe indicators on timeline clips | Small diamonds on clip at keyframed times | P1 |
| Copy/paste keyframes | Cmd+C/V with keyframe selected | P2 |
| Disable all keyframes (stopwatch off) | Warn user, deletes all keyframes for property | P1 |

**Architectural prep (done):** AutomationLane system exists with binary search + easing interpolation. Extend paramPath to `clip:{clipId}.transform.x` etc. Values are absolute (px/multiplier/degrees), not normalized 0-1 — needs denormalization step.

### Remaining — Polish

| Feature | Description | Priority |
|---------|-------------|----------|
| User-created guide lines | Drag from ruler area to create persistent guides | P2 |
| Safe zone overlay (title-safe 80%, action-safe 90%) | Toggle via shortcut or menu | P2 |
| Crop (L/R/T/B + aspect presets) | Separate from transform — crops visible area | P2 |
| Scrubby sliders on numeric fields | Hover+drag to change value (Shift=faster, Cmd=finer) | P1 |
| ARIA labels on TransformPanel | Screen reader accessibility | P2 |
| Math expressions in numeric fields (e.g. "50+25") | Nice-to-have, common in creative tools | P2 |
| Multi-clip group transform | Group bounding box, batch reposition/scale/rotate | P2 |
| CSS transform during drag for 60fps | Cache frame as img, apply CSS transform during drag, backend on mouseup | P1 |
| Canvas resolution UI panel | Dropdown with presets + custom WxH | P1 |

---

## Way Later (No Phase Number)

| Feature | Description | Source |
|---------|-------------|--------|
| Hydra-style networking | Multiple Entropic instances sharing a visual canvas | Study Hydra's WebRTC approach |
| Clip launcher view | Resolume-style clip grid (launcher, not timeline) | User: "way way later" |
| VST hosting | Load VST plugins for audio processing inside Entropic | TouchDesigner concept |
| Live streaming I/O | OBS/NDI integration for live performance streaming | Competitive posture |
| Audio concept ports | Sends/returns, buss processing, video compressor/limiter, video EQ, A/B monitoring | User: "mediocre, way later if ever" |
| Practice mode | Slow-motion playback for learning effect timing | Posture shift |
| Accessibility-first | Screen reader support, high contrast, keyboard-only workflows | Posture shift |
| Category naming | Art Director exploration — "Glitch Video DAW" needs better language | User: "shit phrase, good idea" |

---

## Outreach (Non-Engineering)

Detailed in COMPETITIVE-MOAT-ANALYSIS.md and COMMUNITY-ECOSYSTEM.md:
- 5-tier outreach list (glitch artists → VJs → music producers → high-profile dream list)
- Demo content per phase (each phase ships = a shareable demo video/GIF)
- Build-in-public strategy (Twitter/X, Reddit, YouTube, Instagram, TikTok)
- "Don't cold pitch. Ship something impressive first."
