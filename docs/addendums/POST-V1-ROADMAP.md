# Post-v1 Roadmap — Entropic v2 Addendum

> Generated: 2026-02-19
> Status: APPROVED CONCEPTS — tacked onto end of roadmap, not in current build plan
> Source: Strategy + Synthesize session, user directives
> Related: MUSICIAN-NATIVE-FEATURES.md, LAYER-TRANSITIONS.md, COMMUNITY-ECOSYSTEM.md, COMPETITIVE-MOAT-ANALYSIS.md

---

## Guiding Principle

These items are explicitly NOT in Phases 0A-11. They are future work that extends Entropic after the core v1 ships. Some require **architectural preparation in earlier phases** (noted in MUSICIAN-NATIVE-FEATURES.md "Architectural Decisions Needed" table) — those are data model considerations, not scope additions.

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
