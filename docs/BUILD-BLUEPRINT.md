# Entropic v2 Challenger — Build Blueprint

> Master reference document. Start here.
> All decisions locked 2026-02-18 (Gap Analysis Rev 5).

---

## What Is This

A **performance-capable visual instrument** — a glitch video DAW. Desktop application.
Destroy video in real-time. Perform with it. Export it.

**Tagline:** "Ableton for Video"
**License:** PWYW + open source
**Platform:** macOS (ARM64 primary), Windows (later)

---

## Architecture (One Paragraph)

Electron shell runs a React/TypeScript frontend (single source of truth for all state). A Python sidecar (compiled with Nuitka to native binary) processes video frames as pure functions. ZMQ carries commands between them. Shared memory (mmap ring buffer via C++ native Node.js module) carries frames at zero-copy speed. Audio plays through PortAudio (native desktop, not Web Audio). If Python crashes, the watchdog restarts it and flushes state. Nothing is lost.

---

## Documentation Index

| Document | What It Covers |
|----------|---------------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System diagram, principles, resource management, undo, audio, taxonomy |
| [TECH-STACK.md](./TECH-STACK.md) | Every dependency, version, and why |
| [FILE-STRUCTURE.md](./FILE-STRUCTURE.md) | Project directory layout |
| [IPC-PROTOCOL.md](./IPC-PROTOCOL.md) | ZMQ commands + shared memory frame transport |
| [EFFECT-CONTRACT.md](./EFFECT-CONTRACT.md) | Pure function spec, Effect Container, parameter schema, testing |
| [DATA-SCHEMAS.md](./DATA-SCHEMAS.md) | TypeScript interfaces: Project, Timeline, Track, Effect, Preset, Undo |
| [SIGNAL-ARCHITECTURE.md](./SIGNAL-ARCHITECTURE.md) | Modulation, sidechain, operators, signal order, DAG routing |
| [BUG-PREVENTION.md](./BUG-PREVENTION.md) | Every v1 bug → Challenger architectural prevention |
| [SECURITY.md](./SECURITY.md) | 17 security requirements, 10 attack vectors, per-phase checklist |
| [EFFECTS-INVENTORY.md](./EFFECTS-INVENTORY.md) | Complete catalog: 126 existing + 45 new R&D effects (171 total) |
| [RD-EFFECTS-RESEARCH.md](./RD-EFFECTS-RESEARCH.md) | Novel effect R&D: algorithms, categories, interaction matrices |
| [ADVERSARIAL-FINDINGS.md](./ADVERSARIAL-FINDINGS.md) | Refactor vs Challenger comparison, cherry-pick decisions |
| [PRD.md](./PRD.md) | Product requirements: vision, modules, success metrics, build order |
| [UX-SPEC.md](./UX-SPEC.md) | UX specification: panels, interactions, shortcuts, feedback patterns |

### Phase Blueprints

| Phase | Doc | What Ships |
|-------|-----|-----------|
| 0A | [PHASE-0A.md](./phases/PHASE-0A.md) | Electron + React + Python + ZMQ heartbeat + Nuitka build |
| 0B | [PHASE-0B.md](./phases/PHASE-0B.md) | Shared memory + frame transport + PyAV + Effect Container + validation tests |
| 1 | [PHASE-1.md](./phases/PHASE-1.md) | Core pipeline: upload → effects → preview → export |
| 2A | [PHASE-2A.md](./phases/PHASE-2A.md) | Parameter UX: Ghost Handle, sensitivity, scaling |
| 2B | [PHASE-2B.md](./phases/PHASE-2B.md) | Audio sprint: PyAV decode → PortAudio → A/V sync |
| 3 | [PHASE-3.md](./phases/PHASE-3.md) | Color Suite: Levels, Curves, HSL, Color Balance |
| 4 | [PHASE-4.md](./phases/PHASE-4.md) | Timeline + Tracks: multi-track, undo, history panel |
| 5 | [PHASE-5.md](./phases/PHASE-5.md) | Basic Performance: keyboard triggers, choke groups |
| 6 | [PHASE-6.md](./phases/PHASE-6.md) | Operators + Modulation: LFO, sidechain, audio-reactive, DAG |
| 7 | [PHASE-7.md](./phases/PHASE-7.md) | Automation: lanes, recording modes, RDP simplify |
| 8 | [PHASE-8.md](./phases/PHASE-8.md) | Physics + R&D effects (45 new), codec archaeology |
| 9 | [PHASE-9.md](./phases/PHASE-9.md) | Full Perform + MIDI: 8x8 Drum Rack, MIDI Learn, Retro-Capture |
| 10 | [PHASE-10.md](./phases/PHASE-10.md) | Freeze/Flatten + Library: presets, macro knobs |
| 11 | [PHASE-11.md](./phases/PHASE-11.md) | Export + Polish: codecs, render queue, auto-update, welcome |

### Addendums (Post-v1 Features + Strategy)

| Document | What It Covers |
|----------|---------------|
| [COMPETITIVE-MOAT-ANALYSIS.md](./addendums/COMPETITIVE-MOAT-ANALYSIS.md) | Competitive landscape, moat layers, positioning, artist outreach list |
| [MUSICIAN-NATIVE-FEATURES.md](./addendums/MUSICIAN-NATIVE-FEATURES.md) | Tempo, quantize, beat-sync, audio-reactive modulators, pre-input modulators |
| [LAYER-TRANSITIONS.md](./addendums/LAYER-TRANSITIONS.md) | 53 transition types, performance modifiers, follow actions |
| [COMMUNITY-ECOSYSTEM.md](./addendums/COMMUNITY-ECOSYSTEM.md) | .recipe spec, effect API, open project format, outreach strategy, demo plan |
| [POST-V1-ROADMAP.md](./addendums/POST-V1-ROADMAP.md) | Phases 12-19+: tempo, transitions, audio-reactive, community, cannibalization |

### External References

| Document | Location |
|----------|----------|
| Gap Analysis (Rev 5) | `~/Documents/Obsidian/projects/ENTROPIC-V2-CHALLENGER-GAP-ANALYSIS.md` |
| v2 Challenger Spec (17 files) | `~/Downloads/glitch-video-daw-extracted/documentation/` |
| Architecture Deep Dive | `~/Development/entropic/docs/ARCHITECTURE-DEEP-DIVE.md` |
| UAT Findings | `~/Development/entropic/docs/UAT-FINDINGS-2026-02-15.md` |
| R&D Effects (full source, 85KB) | `~/Development/entropic/docs/RD-EFFECTS-RESEARCH-2026-02-18.md` |
| Feature Set (126 effects) | `~/Development/entropic-2/docs/FEATURE-SET.md` |
| v2 Spec Effects & Modulation | `~/Downloads/glitch-video-daw-extracted/documentation/SPECS_EFFECTS_MODULATION.md` |

---

## Key Decisions (Quick Reference)

| Decision | Choice | Why |
|----------|--------|-----|
| Shell | Electron | React component model scales to DAW complexity |
| Frontend | React + TypeScript + Vite | SSOT, type safety, fast HMR |
| State | Zustand | Lightweight, no boilerplate |
| Backend | Python 3.12+ | Effect algorithms, NumPy, PyAV |
| Bundler | Nuitka | Native C compilation, better perf than PyInstaller |
| IPC (commands) | ZMQ REQ/REP | Reliable, ordered, easy to debug |
| IPC (frames) | mmap shared memory | Zero-copy, ~0.1ms latency |
| Native module | C++ (node-gyp) | Required for mmap access from Node.js |
| Video I/O | PyAV (read + write) | Wraps FFmpeg libav, no CLI subprocess |
| Audio | PortAudio (native) | Desktop audio, not Web Audio |
| RAM cache | MJPEG quality 95 | 10x compression, imperceptible loss |
| Effects | Pure functions | No globals, explicit state, seeded determinism |
| Undo | Command + state diff + disk overflow | 500 steps RAM, unlimited on disk |
| Business model | PWYW + open source | No license system |
| Build order | Interleaved | Effects + basic performance early |

---

## Session Estimate

**Total: 43-58 sessions** (14 phases)
> Gap Analysis Rev 5 estimated 41-55. Revised upward after Phase 8 scoped to 45 R&D effects (5-7 sessions vs original 3-4).

| Phase | Sessions | Running Total |
|-------|----------|---------------|
| 0A Skeleton | 2 | 2 |
| 0B Validation | 2-3 | 4-5 |
| 1 Core Pipeline | 5-7 | 9-12 |
| 2A Parameter UX | 2-3 | 11-15 |
| 2B Audio Sprint | 2-3 | 13-18 |
| 3 Color Suite | 3-4 | 16-22 |
| 4 Timeline + Tracks | 4-5 | 20-27 |
| 5 Basic Performance | 2-3 | 22-30 |
| 6 Operators + Modulation | 4-5 | 26-35 |
| 7 Automation | 3-4 | 29-39 |
| 8 Physics + Effects | 5-7 | 34-46 |
| 9 Full Perform + MIDI | 3-4 | 37-50 |
| 10 Freeze + Library | 3-4 | 40-54 |
| 11 Export + Polish | 3-4 | 43-58 |
