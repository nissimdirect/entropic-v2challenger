# Entropic v2 — Product Requirements Document

> What we're building, why, and what success looks like.
> Grounded in: ARCHITECTURE.md (technical truth), BUILD-BLUEPRINT.md (phase plan), EFFECTS-INVENTORY.md (capability scope).
> Informed by: v2 Challenger spec PRD.md v2.2, v1 Entropic lessons learned.

---

## 1. Product Vision

**Entropic is a Performance-Capable Visual Instrument.**

A desktop application that treats video the way Ableton treats audio — with real-time effects, modulation, automation, and live performance capabilities. Not a video editor. Not a VJ tool. A glitch video DAW.

### 1.1 Core Principle
**Stability > Features. Usability > Complexity.**

If it's not stable, it doesn't ship. If it's not intuitive, it gets redesigned. Every feature must be discoverable within 30 seconds of first encountering it.

### 1.2 Platform
- **Desktop application:** Electron + React/TypeScript (frontend) + Python sidecar (backend)
- **macOS first**, Windows planned post-launch
- **Distribution:** PWYW (pay what you want) + open source
- **No cloud dependency.** Everything runs locally.

### 1.3 Target User
1. **Glitch artists** who currently use FFmpeg scripts, Processing, or manual hex editing
2. **VJs and live performers** who need real-time visual manipulation tied to audio/MIDI
3. **Music video creators** who want effects beyond what Premiere/After Effects offer
4. **Experimental filmmakers** who want non-destructive, parametric video destruction

### 1.4 Non-Users (Explicitly Not For)
- Professional colorists (use DaVinci Resolve)
- Motion graphics artists (use After Effects)
- General video editors (use Premiere/Final Cut)
- Social media video creators (use CapCut)

---

## 2. Core Modules

### 2.1 Video Import & Validation
- **Entry:** Drag-and-drop onto canvas or browser panel. Native file dialog (Cmd+O).
- **Formats:** MP4, MOV, AVI, MKV, WebM. Any codec PyAV can decode.
- **Validation:**
  - Check for Variable Frame Rate (VFR) → prompt transcode to CFR
  - Generate thumbnail strip for timeline display
  - Extract metadata (duration, resolution, fps, codec, audio streams)
- **Phase:** 1

### 2.2 Effect Engine
- **171 effects** across 3 tiers (see EFFECTS-INVENTORY.md):
  - **Tools** (`util.*`): Non-destructive utilities — levels, curves, HSL, color balance, blur, chroma key
  - **Effects** (`fx.*`): Destructive/generative — pixel sort, datamosh, VHS, feedback, codec archaeology, optics
  - **Operators** (`mod.*` / `op.*`): Control signals — LFO, envelope, audio follower, step sequencer, fusion
- **Effect Contract:** Pure function `apply(frame, params, state_in, *, frame_index, seed, resolution) → (frame, state_out)`. No globals. Seeded determinism. `frame_index` is a required keyword arg — prevents 12 v1 bugs. (see EFFECT-CONTRACT.md)
- **Effect Container:** Every effect wrapped in Mask → Process → Mix pipeline. Free masking and dry/wet on every effect.
- **Phase:** 1 (core 10), 3 (color suite), 8 (R&D 45 new)

### 2.3 Parameter UX
- **Ghost Handle:** Every knob shows base value (solid) + actual value after modulation/automation (ghost, 30% opacity)
- **Curve scaling:** Linear, logarithmic, exponential, S-curve per parameter
- **Fine-tune:** Shift+drag for 10x precision
- **Direct entry:** Double-click any knob to type exact value
- **Reset:** Right-click to reset to default
- **Phase:** 2A

### 2.4 Audio Pipeline
- **Native audio:** PortAudio (not Web Audio) for low-latency desktop playback
- **A/V sync:** Audio is master clock, video is slave. Audio never stutters — video drops frames if needed.
- **Audio-reactive:** RMS amplitude, frequency bands, onset detection → control signals for modulation
- **Phase:** 2B

### 2.5 Timeline Engine
- **Multi-track:** Video tracks (pixels) + Performance tracks (signals)
- **Clips:** Drag, trim, split (Cmd+Shift+K), duplicate (Alt+drag)
- **Track controls:** Opacity, blend mode (9 modes), mute, solo
- **Per-track effect chain:** Independent effect rack per track
- **Loop region:** Set in/out points, playback loops
- **Markers:** Cmd+M to add, color-coded
- **Phase:** 4

### 2.6 Modulation System
- **Operators generate control signals (0.0-1.0) per frame** — they don't process pixels
- **4-layer signal path:** Source → Extraction → Processing → Routing
- **Routing:** One-to-many, many-to-one, with DAG enforcement (no cycles)
- **Signal order:** Base → Modulation → Automation → Clamp
- **Modulation Matrix:** Grid view of all active operator-to-parameter routings
- **Phase:** 6

### 2.7 Automation System
- **Time-locked parameter control** on the timeline
- **Modes:** Read, Touch, Latch, Draw
- **Curve types:** Linear, ease-in, ease-out, S-curve per segment
- **Simplify:** Ramer-Douglas-Peucker algorithm for point reduction
- **Stacks with modulation** (not replaces — both can affect same param)
- **Phase:** 7

### 2.8 Performance System
- **Pad grid:** 4x4 (Phase 5) expanding to 8x8 (Phase 9)
- **Input:** Computer keyboard (QWERTY mapped) + MIDI controllers
- **Modes:** Gate (hold=on), Toggle (press=flip), One-Shot (trigger ADSR)
- **Choke groups:** Activating one pad silences others in same group
- **ADSR envelope** per pad for shaped parameter control
- **Retro-capture:** Rolling 60-second buffer, retroactively write performance to timeline
- **Performance recording:** Arm track → play → triggers recorded to timeline as clips
- **Phase:** 5 (basic), 9 (full + MIDI)

### 2.9 Freeze / Flatten
- **Freeze:** Cache effect chain prefix to disk. Frozen effects skip re-rendering.
- **Flatten:** Bake frozen output into new video asset (destructive).
- **Auto-freeze:** At 90% RAM, automatically freeze longest idle prefix chain.
- **Phase:** 10

### 2.10 Preset Library
- **Single-effect presets** + **Chain presets** (with macro mappings)
- **File format:** `.glitchpreset` JSON
- **Browser:** Searchable, filterable, favorites
- **Factory presets:** 50+ curated across key effects
- **User folder:** `~/Documents/Entropic/Presets/`
- **Phase:** 10

### 2.11 Export
- **Formats:** MP4 (H.264, H.265), ProRes (422, 4444), GIF, image sequence (PNG/TIFF/JPEG)
- **Settings:** Resolution, frame rate, bitrate/quality, audio muxing
- **Region:** Full timeline, loop region, custom in/out
- **Render queue:** Batch multiple jobs
- **Phase:** 11

### 2.12 Undo / Redo
- **Unlimited** (500 steps in RAM, overflow to disk)
- **History panel:** Photoshop-style, click any entry to jump to state
- **Two systems:** Command pattern (timeline ops) + state diff (param changes)
- **50MB RAM cap**, overflow oldest entries to disk
- **Phase:** 4

---

## 3. System Health & Resource Management

### 3.1 System Dashboard ("The Cockpit")
- **Toolbar meters:** CPU, RAM, Frame Time, Disk cache
- **Toast alerts:**
  - RAM > 80%: "Consider freezing effects"
  - Frame time > 66ms: "Consider lowering resolution"
  - Disk cache > 10GB: "Consider clearing cache"

### 3.2 Dynamic Resolution Scaling
- During playback: if frame render > 33ms, drop resolution tier (75% → 50% → 25%)
- When stopped: always full resolution (user never sees degraded static frame)

### 3.3 Resource Envelope (Targets)
| Resource | Target | Maximum |
|----------|--------|---------|
| CPU | Sustained 140-160% | 200% |
| RAM | 8-12 GB | 16 GB cap |
| Frame cache | 4-10 GB MJPEG | Configurable |
| Undo history | 50 MB RAM | + disk overflow |

---

## 4. Usability Requirements

### 4.1 Learnability
- **First 5 minutes:** User can import video, apply an effect, see result, export
- **First 30 minutes:** User understands effect chaining, basic timeline, undo
- **First session:** User can create a 30-second glitch video from scratch

### 4.2 Discoverability
- Every control has a tooltip (name, value, unit, description, shortcut)
- No hidden parameters (scroll affordance on overflow panels)
- Effect browser categories match mental models (destruction vs correction vs modulation)

### 4.3 Error Recovery
- Undo is always available (never irreversible except Flatten)
- Auto-save every 60 seconds (non-blocking)
- Crash recovery: React is SSOT → spawn new Python sidecar → flush state → resume
- Human-readable errors with recovery suggestions (never stack traces)

### 4.4 Performance Perception
- Preview updates within 100ms for all color tools at 1080p
- Any single effect < 100ms at 1080p (R&D effects allowed slight tolerance)
- Audio playback never stutters (video drops frames instead)

### 4.5 Keyboard-First Design
- Every action has a keyboard shortcut (NLE conventions: JKL, Cmd+Z, etc.)
- All shortcuts user-customizable
- Tab navigation through all panels

---

## 5. Non-Functional Requirements

### 5.1 Security
- See SECURITY.md for full security posture
- Project file validation on load (reject malformed JSON)
- No eval() or dynamic code execution from user data
- contextBridge isolates renderer from Node.js APIs
- mmap bounds checking on all shared memory access

### 5.2 Privacy
- No telemetry (v1)
- No network calls except auto-update check
- All processing local

### 5.3 Distribution
- macOS: DMG (signed + notarized)
- Windows: NSIS installer (planned post-launch)
- Auto-update via electron-updater + GitHub Releases
- PWYW pricing (no license enforcement, no DRM)

### 5.4 Stability Targets
- Zero data loss crashes (React SSOT + auto-save + crash recovery)
- < 1 crash per 8 hours of active use
- All 171 effects run without crash at any parameter boundary (0% and 100%)

---

## 6. Phase Build Order

| Phase | Name | Sessions | Key Deliverable |
|-------|------|----------|-----------------|
| 0A | Skeleton | 2 | Electron + Python + ZMQ + mmap connected |
| 0B | Shared Memory | 2-3 | 4-slot MJPEG ring buffer, zero-copy frames |
| 1 | Core Pipeline | 5-7 | Upload, effects (10), preview, export (basic) |
| 2A | Parameter UX | 2-3 | Ghost Handle, curve scaling, fine-tune |
| 2B | Audio Sprint | 2-3 | PortAudio playback, A/V sync, waveform |
| 3 | Color Suite | 3-4 | Levels, Curves, HSL, Color Balance, Histogram |
| 4 | Timeline + Tracks | 4-5 | Multi-track, clips, undo, project save/load |
| 5 | Basic Performance | 2-3 | 4x4 pad grid, keyboard triggers, choke groups |
| 6 | Operators + Modulation | 4-5 | LFO, envelope, sidechain, routing, matrix |
| 7 | Automation | 3-4 | Lanes, nodes, Touch/Latch/Draw, simplify |
| 8 | Physics + R&D Effects | 5-7 | 45 new effects (codec, optics, emergent, etc.) |
| 9 | Full Perform + MIDI | 3-4 | MIDI input, 8x8 grid, retro-capture, recording |
| 10 | Freeze/Flatten + Library | 3-4 | Freeze, presets, macro knobs |
| 11 | Export + Polish | 3-4 | Full export, render queue, shortcuts, welcome |

**Total estimated sessions: 43-58**

---

## 7. Success Metrics (Post-Launch)

| Metric | Target | How |
|--------|--------|-----|
| First-session completion | 80% complete a basic glitch video | Analytics (opt-in) |
| Crash rate | < 1 per 8 hours | Sentry (opt-in) |
| Effect usage breadth | 30+ effects used by typical user | Analytics |
| Performance recording adoption | 20%+ of users try performance mode | Analytics |
| Community presets | 100+ shared presets within 3 months | Preset repository |

---

## 8. Future Roadmap (Post V1)

- **Media Pool:** Dedicated asset organization/tagging panel
- **Render Queue:** Advanced batch export manager
- **GPU Acceleration:** CUDA/Metal for compute-heavy effects
- **Plugin SDK:** Third-party effect development
- **Collaborative Editing:** Shared sessions
- **OSC Input:** For integration with lighting/VJ rigs
- **MPE / MIDI 2.0:** Advanced MIDI expressiveness
- **Cloud Presets:** Community preset sharing

---

## Source Attribution

This PRD synthesizes and rebuilds from:
- v2 Challenger ARCHITECTURE.md, BUILD-BLUEPRINT.md, EFFECTS-INVENTORY.md (system of record)
- v2 Gemini spec PRD.md v2.2 (vision, modules, resource envelope)
- v1 Entropic shipping experience (126 effects, 3,610 tests, UAT lessons)
- Phase blueprints (PHASE-0A through PHASE-11)

All requirements grounded in Challenger architecture. Where v2 Gemini spec was aspirational, this PRD is scoped to what the architecture actually supports.
