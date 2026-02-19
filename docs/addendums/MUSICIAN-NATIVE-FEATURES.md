# Musician-Native Features — Entropic v2 Addendum

> Generated: 2026-02-19
> Status: APPROVED CONCEPTS — add as later phases unless noted
> User directives:
> - Tempo must be OPTIONAL. Video-first mode = no tempo, just destroy. Music-first mode = tempo grid.
> - Don't force music vocabulary where it doesn't fit. Call things what they are.
> - Audio concept ports (limiter, compressor for video) = mediocre, way later if ever.
> - Beat repeat/stutter quantized to tempo = yes.
> - Any time-based parameter should be tempo-syncable.

---

## Core Principle: Two UX Routes

Entropic serves TWO personas:
1. **Video-first:** "I want to destroy this video." No tempo. No grid. One-shot. Pure.
2. **Music-first:** "I want to perform video effects to my track." Tempo. Grid. Quantize. Beat-sync.

The default is video-first. Tempo is opt-in. When tempo is off, all time-based parameters show in seconds/frames. When tempo is on, they can toggle to musical time divisions.

---

## Temporal/Rhythm Features

### Tempo System (Phase 12+, unless Phase 4 timeline needs it)

| Feature | Description | Notes |
|---------|-------------|-------|
| Project BPM | Optional tempo setting (off by default) | When off, timeline shows frames/seconds only |
| Tempo automation | BPM can change over time via automation lane | Enables tempo ramps, drops |
| Tap tempo | Set BPM by tapping a button/key | Standard UX |
| Beat detection | Auto-detect beats from audio track, create markers | Phase 2B audio sprint gives us the audio data |
| Quantize on/off | Grid snap toggle per track or global | When on, triggered events snap to grid |
| Time divisions | 1/64, 1/32, 1/16, 1/8, 1/4, 1/2, 1 bar, 2 bar, 4 bar, 8 bar | Standard musical subdivisions |
| Triplet toggle | Triplet variants of each division | 1/8T, 1/16T, etc. |
| Swing/shuffle % | Offset every other subdivision for groove feel | 0-100% like MPC swing |

### Quantize vs Frame Alignment (Technical Note)

At 30fps, a frame = 33.33ms. At 128 BPM, a 16th note = 117.19ms = 3.52 frames.

**Solution:** Quantize to nearest frame. The timing error is <33ms at 30fps, which is below human visual temporal resolution (~40-60ms). For sub-frame precision, the timeline internally tracks at sub-frame resolution and rounds to nearest frame for rendering.

**This is a Phase 4 (Timeline) consideration** — the timeline data model must support both frame-based and beat-based time addressing from the start.

### Tempo-Syncable Parameters

Any effect parameter that represents time (delay length, stutter rate, LFO speed, etc.) should have a **sync toggle**:
- Off: value in ms/seconds/frames
- On: value as musical division (1/4, 1/8, 1/16, etc.) relative to project BPM

**This is a Phase 2A (Parameter UX) consideration** — the parameter type system needs a `time` type that supports both absolute and synced modes.

---

## Audio-Reactive Modulators (Phase 12+)

### Universal Audio Follower
A generic modulator that takes audio input and outputs modulation values mappable to ANY parameter:
- Amplitude (volume level)
- Frequency (pitch detection)
- Spectral centroid (brightness of sound)
- Onset detection (beat/transient triggers)

### Frequency Band Splitter
Split audio into bands → each drives a different parameter:
- Low (20-200Hz) → e.g., blur amount
- Mid (200-2kHz) → e.g., hue shift
- High (2kHz-20kHz) → e.g., pixel sort threshold
- Number of bands configurable (2-8)

### Envelope Follower
Audio amplitude → smooth control signal with attack/release shaping. Outputs a value from 0-1 that tracks the audio energy.

### Transient Shaper
Emphasize or de-emphasize the sharp attack of beats vs the sustained body. Applied to effect intensity — fast attack = effects punch on every kick.

---

## Pre-Input Modulators (Phase 12+)

Modify the video BEFORE it hits an effect, adding motion or variation to the source:

| Modulator | Description |
|-----------|-------------|
| Pixel Jitter | Random per-pixel displacement. Noise-based UV distortion. |
| Directional Drift | All pixels slowly moving in one direction |
| Breathing | Subtle scale in/out |
| Camera Shake | Simulated handheld movement |
| Step Sequencer | 16-step pattern cycling displacement values at tempo |
| Euclidean Rhythm | Algorithmically distributed triggers |
| Sample & Hold | Random value held steady, re-rolled at tempo-synced intervals |

---

## Beat Effects (Phase 12+)

| Effect | Description |
|--------|-------------|
| Beat Repeat | Stutter/repeat a section of video, quantized to grid. Like Ableton's Beat Repeat. |
| Stutter | Rapid re-trigger of current frame at musical subdivisions |
| Time-synced delay | Frame echo with tempo-locked delay times |
| Time-synced LFO | LFO speed as musical division, not Hz |

---

## Monitoring Tools (Dual-Purpose: Monitor + Effect Source)

Each of these serves as both a monitoring tool in the UI AND a renderable effect source that can be composited into the video:

| Tool | As Monitor | As Effect Source |
|------|-----------|-----------------|
| Oscilloscope | Show any parameter value over time | Render oscilloscope waveform into video |
| XY / Lissajous | Show audio L/R as Lissajous pattern | Render Lissajous into video as overlay |
| Spectrum analyzer | Show audio frequency spectrum | Render spectrum bars into video |
| Waveform overview | Show audio waveform under timeline | Render waveform into video |
| Vectorscope | Show color distribution | Render vectorscope into video |
| Histogram | Show color histogram (already in v2) | Render histogram into video |
| Level meters | Audio level next to video tracks | Render level bars into video |

---

## Audio Concept Ports (LOW PRIORITY — way later if ever)

User feedback: "mediocre, trying hard to fit the mental model but isn't adding much value."

Kept here for reference, not for near-term roadmap:
- Sends/Returns (parallel effect routing)
- Buss processing (track groups)
- Video compressor/limiter (intensity control)
- Video EQ (spatial frequency)
- Stem export
- Bounce in place
- A/B monitoring
- Reference track

---

## Architectural Decisions Needed in Earlier Phases

| Decision | Affects Phase | What Needs to Happen |
|----------|--------------|---------------------|
| Timeline supports both frame-based and beat-based addressing | Phase 4 (Timeline) | Time model must be dual-mode from day one |
| Parameter type system supports tempo-sync toggle | Phase 2A (Parameter UX) | `time` parameter type with absolute/synced modes |
| Audio analysis available as modulation source type | Phase 6 (Operators) | DAG routing must accept audio analysis nodes |
| Layer data model has enter/exit transition properties | Phase 5 (Performance) | Small addition to Layer schema |

These are NOT scope additions to existing phases — they're data model considerations that enable the later features without rework.
