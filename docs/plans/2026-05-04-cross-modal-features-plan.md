---
title: Cross-Modal Features Release
status: planned
type: release
phase: post-v1
date: 2026-05-04
revision: v2 (post-CTO-review 2026-05-04)
---

# Cross-Modal Features Release Plan

Five sprints (one prerequisite + four features) that exploit existing Entropic infrastructure to ship a coherent "cross-modal" story. Each feature reuses operators, automation, and effect modules that are already live and tested. No new architecture beyond the F0 prerequisite; net-additive on existing test infra (108 vitest files, 12,768 pytest tests, 124-effect oracle suite).

## Revision history

- **v1 (2026-05-04):** Initial plan, four features (F1–F4).
- **v2 (2026-05-04):** Post-`/cto /review` amendments — added F0 prerequisite (mod registry + DAG cycle detection + project schema versioning); revised F1 to JPEG-only path; revised F4 to frontend-side chord parser; decoupled F1/F3 from F2; added per-feature performance budgets, security threat model, and UX-path E2E merge gate; corrected open-bug list; updated cost estimates to ~6 sprints total.

## Feature inventory

| # | Codename | Reuses | New code |
|---|----------|--------|----------|
| **F0** | **Mod registry + DAG + schema v2** *(prerequisite)* | `ModulationMatrix.tsx`, `project-persistence.ts`, `core/automation.py` | Source registry, cycle detector, migration registry |
| F1 | Datamosh Sequencer | `effects/fx/datamosh_real.py` (JPEG path), automation lanes, `stores/midi.ts`, PerformancePanel | MIDI Learn binding, sequencer UI |
| F2 | Optical Sidechain Bus | `VideoAnalyzer` operator (`motion` method exists), `flow_distort.py`, `pixel_flow_field.py`, modulation matrix | Vector-field output, OSC bridge |
| F3 | Mutant Macro | `core/automation.py`, AutomationToolbar, RDP decimation | Macro device component, mapping editor |
| F4 | PixelLydian (ChordAnalyzer) | `stores/midi.ts` (frontend Web MIDI API), color suite, modulation matrix | Frontend chord parser, mode-to-palette map |

## Sequencing & dependency rationale (revised)

1. **F0 first** (1 sprint). Prerequisite. Without mod source registry + cycle detection, F2/F3/F4 can create routing loops that crash playback. Without project schema versioning, F1/F3/F4 state silently breaks projects on older builds.
2. **F1 + F3 in parallel** after F0 (independent branches). Neither depends on F2 — F1 uses `AudioFollower.onset` for audio-reactive triggering as fallback, F3 drives any existing mod source.
3. **F2 third** (3 days). Pure leverage — once optical-flow magnitude + angle are mod sources, every existing effect param becomes motion-reactive automatically.
4. **F4 fourth** (1.5 sprints). New operator type, frontend-only parsing.

Each ships as its own PR off `main`. No long-lived feature branches.

---

## F0 — Mod Source Registry + DAG + Schema v2 *(prerequisite)*

### Scope

Three coupled pieces of infrastructure that every subsequent feature requires:

1. **Mod source registry.** Every operator declares its mod-source IDs (`audio_follower.rms`, `video_analyzer.motion`, etc.). The modulation matrix consumes the registry instead of hard-coding source IDs. Required because F2, F3, F4 each add new sources.
2. **DAG cycle detection.** When a user routes `Macro → VideoAnalyzer → Macro`, the matrix must reject the connection at edit time, not crash at playback. Verified absent: grep returned only `ModulationMatrix.tsx:41` (UI placeholder).
3. **Project schema v2 + migration registry.** Add `schemaVersion: 2` to project files. Maintain a named migration list (`v1_to_v2`, …). Verified absent: no `schema.version`/`projectVersion` exists in code today.

### Why now
F2/F3/F4 are blocked. Shipping them on the current modulation infrastructure invites cycle crashes and project-load regressions across the install base.

### Branch: `feat/f0-mod-registry-and-schema`

### Build Checklist
- [ ] `backend/src/operators/mod_source_registry.py` — registry data class; operators register at import time
- [ ] Refactor `ModulationMatrix.tsx` to consume the registry (drop hard-coded source list)
- [ ] `backend/src/core/mod_graph.py` — DAG with cycle detection (Tarjan or topological-sort fail-fast); reject `addEdge` calls that would form a cycle
- [ ] Frontend matrix UI displays cycle-rejection inline (toast or red highlight)
- [ ] `frontend/src/renderer/project-persistence.ts` — read `schemaVersion`; if absent, treat as v1 and migrate-up on save
- [ ] `frontend/src/renderer/migrations/v1_to_v2.ts` — no-op for now (v2 only adds optional fields)
- [ ] Schema-migration test harness: load 5 fixture projects from `test-fixtures/projects-v1/`, save as v2, reload, deep-equal

### Test Plan
- Unit:
  - [ ] `test_mod_source_registry.py` — 3 operators register, registry returns 3 unique IDs
  - [ ] `test_mod_graph_cycle.py` — A→B→A rejected; A→B→C accepted
  - [ ] `test_schema_migration.ts` — v1 project loads, persists as v2 with migration applied
- E2E:
  - [ ] `phase-modulation/cycle-rejection.spec.ts` — user attempts to wire a cycle; UI rejects, toast appears

### UAT
- [ ] Open a v1 project, save, reopen — no data loss; `schemaVersion: 2` written
- [ ] Try to route Macro → VideoAnalyzer → Macro — connection refused with visible feedback
- [ ] All 124 oracle effects continue to pass (regression baseline)

### NOT in Scope
- Schema v3 forward compatibility (handled when v3 is needed)
- Auto-resolve cycles ("break the weakest link") — explicit rejection only
- Migrating away from current modulation type names

---

## F1 — Datamosh Sequencer (JPEG path)

### Scope (revised)

Sample-accurate MIDI-driven datamoshing **on the JPEG byte-corruption path** (`effects/fx/datamosh_real.py`, verified per-frame `apply()`). Each MIDI note → a configured trigger (intensity, corruption, duration). Sequencer view exposes a 16-step grid bound to existing trigger lanes; MIDI Learn lets a hardware controller drive `intensity` / `corruption` per step.

**The H.264 datamosh path (`core/real_datamosh.py`, ffmpeg piping) is out of scope for MIDI step control** — ffmpeg pipe is a batch process and cannot accept per-frame parameter overrides without restarting the pipe. H.264 datamoshing remains controllable via existing automation lanes (per-segment).

Marketing claim: "MIDI-sequenced JPEG datamoshing + automation-driven H.264 datamoshing — first DAW that does both." Not "all datamosh sample-accurate."

### Why now
JPEG-byte-corruption datamosh is one of Entropic's most distinctive effects. No competitor offers MIDI-grid datamosh control (Supermosh, Mosh by Nuvotion non-MIDI; Glitch² audio-only). Closing the gap with a precise scope is defensible.

### Branch: `feat/f1-datamosh-sequencer`

### Build Checklist
- [ ] Extend `frontend/src/renderer/stores/midi.ts` with `learnTarget(effectId, paramId)` action and `learnedBindings` map (Web MIDI API → existing IPC pipeline)
- [ ] `frontend/src/renderer/components/datamosh/DatamoshSequencerPanel.tsx` — 16-step grid component
- [ ] Wire each step → `automation.py` keyframe at the step's beat position
- [ ] MIDI Learn UI: right-click any datamosh param → "Learn MIDI" → next CC binds
- [ ] Velocity → `intensity` mapping (configurable curve)
- [ ] Note number → preset slot (A/B/C/D variants of `intensity` + `corruption`)
- [ ] Verify `datamosh_real.py` accepts per-frame param overrides (verified — `apply()` reads `params` dict each frame)
- [ ] Persist sequencer pattern in project file (extend `project-persistence.ts`, schema-migration aware via F0)

### Test Plan
- Unit:
  - [ ] `test_midi_learn.ts` — bind CC#1 to `intensity`, send mock CC, store updates
  - [ ] `test_sequencer_pattern.ts` — set 4 steps, scrub timeline, verify keyframes at correct beat positions
  - [ ] `test_datamosh_param_override.py` — apply chain with per-frame override map, confirm output differs from constant-param run
- Oracle: `test_datamosh_sequencer_oracle.py` — 4-bar pattern → frame-diff peaks aligned to beat
- **UX-path E2E (merge gate):** `phase-perf/datamosh-sequencer.spec.ts` — load video, set 8-step pattern, play, screenshot at beats 1+5, **assert frame-pixel-difference at beat positions** vs constant-param baseline. Not just "panel renders."

### UAT
- [ ] Hook up APC40, hit MIDI Learn on `corruption`, twist a knob, confirm corruption follows
- [ ] Set 16-step pattern with notes on 1+5+9+13, play, visually confirm datamosh hits on those frames
- [ ] Save project, reload, pattern + bindings persist
- [ ] Disable MIDI device mid-play, sequencer continues without crash
- [ ] Audio-reactive fallback: route `audio_follower.onset` → `intensity` instead of MIDI; confirm equivalent triggering

### Performance budget
- JPEG re-encode at varying quality per frame: already paid by current `datamosh_real.py`. No new cost.
- Sequencer scheduler: <0.1 ms/frame (16-step lookup).

### Security
- Validate incoming MIDI CC range (0–127), reject malformed messages.
- Cap learned bindings per param at 1 (prevent runaway state).

### NOT in Scope
- H.264 datamosh per-frame MIDI control (architecturally infeasible — see scope above)
- New datamosh algorithms (MPEG-4, VP9, etc.)
- Per-step waveform editing (just on/off + velocity)

---

## F2 — Optical Sidechain Bus

### Scope
`VideoAnalyzer` already exposes `motion` as a method (`VideoAnalyzerEditor.tsx:5`, verified). Promote motion from a scalar mod source to a richer **optical-flow probe** with directional output (magnitude, dominant angle, regional intensity). Expose as new mod sources via the F0 registry. Add an OSC sender so external audio plugins (or a future companion VST) can sidechain off it.

### Why now
Lowest cost, highest leverage. Once optical-flow magnitude + angle are available, every existing effect parameter becomes motion-reactive without writing new effects.

### Branch: `feat/f2-optical-sidechain` *(starts after F0 merges)*

### Build Checklist
- [ ] `backend/src/operators/video_analyzer.py` — extend `motion` to also emit `motion_angle`, `motion_centroid_x`, `motion_centroid_y` (Farneback)
- [ ] Update `VideoAnalyzerEditor.tsx` METHODS to include `optical_flow` (richer than current `motion`)
- [ ] Register new mod source IDs via F0 registry
- [ ] `backend/src/core/osc_sender.py` — minimal OSC out, **bound to 127.0.0.1 by default**, port-configurable, default 9000, emitting `/entropic/motion/{magnitude,angle,cx,cy}` per frame
- [ ] Frontend toggle in operator panel: "Broadcast OSC" with explicit "LAN broadcast" sub-toggle (off by default; warning text)

### Test Plan
- Unit:
  - [ ] `test_optical_flow_probe.py` — synthetic translating-rectangle clip → motion vector matches translation direction within ±10°
  - [ ] `test_osc_sender.py` — mock OSC server receives 4 floats per frame
  - [ ] `test_osc_default_loopback.py` — OSC defaults to 127.0.0.1; LAN broadcast requires explicit flag
- Oracle: extend `test_video_analyzer_oracle.py` to assert `motion_angle` field present
- **UX-path E2E (merge gate):** `phase-modulation/optical-sidechain.spec.ts` — load motion clip, route `optical_flow.magnitude` → `feedback_phaser.depth`, **assert phaser depth in rendered output frames tracks motion**

### UAT
- [ ] Load clip with moving subject, route `optical_flow.magnitude` → `feedback_phaser.depth`, confirm phaser intensity follows movement
- [ ] Run `oscdump 9000` while playing, confirm streaming values
- [ ] Toggle LAN broadcast off, run external scanner from another host, confirm port 9000 is unreachable

### Performance budget
- Farneback @ 64×64 proxy (existing VideoAnalyzer cost): ~2 ms/frame on M-series CPU.
- If 64×64 angle estimation too noisy, raise to 128×128 (~6 ms/frame, still inside 33 ms/30 fps budget).
- OSC send: <0.1 ms/frame.

### Security
- OSC binds to **loopback only by default**. Motion vectors of camera/screen input could leak on hostile networks if bound 0.0.0.0.
- LAN-broadcast toggle requires explicit user opt-in; UI shows warning.
- Validate port number (1024–65535) before binding.

### NOT in Scope
- GPU optical flow (Farneback CPU at proxy resolution is sufficient)
- The companion audio VST sidecar (separate product, "A18", not in this release)
- Persistence of OSC config beyond session

---

## F3 — Mutant Macro

### Scope
"Macro Knob" device. One knob → user-mapped automation curves on up to 16 destination parameters. Curves can be linear, exponential, hand-drawn, or **non-repeating organic** (RDP-decimated noise — already implemented in `core/automation.py` for keyframe decimation; reuse as a curve generator).

### Why now
Arca-style "everything moving simultaneously" is what `core/automation.py` was built for, but only as recorded performance. Letting a single knob drive 16+ params via stored curves operationalizes that aesthetic.

### Branch: `feat/f3-mutant-macro` *(parallel with F1, after F0 merges)*

### Build Checklist
- [ ] `backend/src/core/macro.py` — Macro model (id, name, curves: `list[ParamCurve]`)
- [ ] `frontend/src/renderer/components/macros/MacroDevice.tsx` — knob UI with curve-mapping panel
- [ ] Curve types: linear, exp, hand-drawn (reuse Ghost Handle paradigm), organic (random walk + RDP, seeded via `make_rng`)
- [ ] Right-click any effect param → "Map to Macro N"
- [ ] Persist macros in project file (schema-aware via F0 migrations)
- [ ] Macro value broadcast as mod source via F0 registry
- [ ] Cycle detection (F0) prevents Macro → … → Macro loops at routing time

### Test Plan
- Unit:
  - [ ] `test_macro_curve_eval.py` — at knob=0.5 with linear curve [0,1], param value = 0.5
  - [ ] `test_macro_organic_curve.py` — same seed produces same curve (determinism, per Entropic's seeded-RNG contract)
  - [ ] `test_macro_persistence.ts` — save, reload, all 16 mappings restored
  - [ ] `test_macro_cycle_rejected.py` — wiring Macro → VideoAnalyzer → Macro rejected by F0 DAG
- **UX-path E2E (merge gate):** `phase-ux/macro-device.spec.ts` — create macro, map 3 params, twist knob, **assert all 3 params change in rendered output frames**

### UAT
- [ ] Create macro mapping `vhs.intensity` + `bitcrush.depth` + `chromatic_aberration.shift`, twist knob 0→1, all three change
- [ ] Switch curve type to "organic" → values move non-monotonically
- [ ] Reload project, macro state preserved

### Performance budget
- 16 mappings × organic curve eval × 60 fps = 960 evals/sec. <0.1 ms/frame total.

### Security
- `safety.py` preflight already clamps effect params; verify it covers macro-driven values (regression test).

### NOT in Scope
- Macros driving other macros (no nesting, avoids cycles even with F0 detection)
- LFO modulation of the macro knob itself (use existing LFO operator instead)

---

## F4 — PixelLydian (ChordAnalyzer)

### Scope (revised)

New operator: `ChordAnalyzer`. **Runs in the renderer (frontend-only)**, parses chord identity (root, quality, extensions) and modal context from MIDI input via Web MIDI API. Verified per `frontend/src/renderer/stores/midi.ts:3`: *"All MIDI processing is frontend-only."* Backend operators do not see MIDI; rebuilding that pipeline is large scope creep.

The chord parser emits `chord_root` (0–11), `chord_quality_index` (maj/min/dim/aug/sus = 0–4), `mode_brightness` (Lydian = 1.0 → Locrian = 0.0), `chord_change_pulse` (1.0 on chord change, decays) as normalized mod-source values via the existing IPC mod-value channel.

Mappings drive any color-suite effect — natural pairings: `mode_brightness` → `levels.gain` and `chord_root` → `hue_shift.hue`.

### Why now
No competitor parses harmony — Synesthesia.live and Fractal Forge stop at pitch class. Once `ChordAnalyzer` exists, every Entropic project gets harmony-aware visuals for free.

### Branch: `feat/f4-chord-analyzer` *(starts after F0 merges; parallel-safe)*

### Build Checklist
- [ ] `frontend/src/renderer/operators/chord_analyzer.ts` — chord/mode parser in TypeScript (~150 lines; no Python equivalent needed)
- [ ] `frontend/src/renderer/components/operators/ChordAnalyzerEditor.tsx`
- [ ] Add operator type to `shared/types.ts` and `useOperatorStore`
- [ ] Wire chord parser to read from `stores/midi.ts` note-on/note-off events
- [ ] Emit derived mod values via existing IPC mod-value channel (no new IPC commands)
- [ ] Register mod source IDs via F0 registry
- [ ] 12-tone color wheel preset (C=red ... B=violet) for `chord_root` → color
- [ ] Mode-brightness preset map (Lydian=brightest, Phrygian=darkest)

### Test Plan
- Unit (frontend):
  - [ ] `test_chord_parser.ts` — C-E-G → root=0, quality=maj; C-Eb-G → root=0, quality=min; C-E-G-B → maj7
  - [ ] `test_mode_inference.ts` — held C major scale + #4 (F#) → Lydian (brightness=1.0)
  - [ ] `test_chord_change_pulse.ts` — pulse fires on chord change, decays per envelope
  - [ ] `test_chord_input_bound.ts` — 100 simultaneous notes → cap at 12, no allocation explosion
- **UX-path E2E (merge gate):** `phase-modulation/chord-analyzer.spec.ts` — send mock MIDI Cmaj → assert backend received `chord_root=0` mod value → assert mapped `hue_shift.hue` updated → **assert rendered frame hue shifted**

### UAT
- [ ] Connect MIDI keyboard, play C-E-G, color preset shifts to "red"
- [ ] Modulate to Lydian (play F# over C), `mode_brightness` rises
- [ ] Route `mode_brightness` → `hsl_adjust.lightness`, play modal progression, visuals brighten/darken

### Performance budget
- Chord parse: event-driven (per MIDI note-on/off), not per frame. Sub-ms per event.
- Mod value emission: piggybacks on existing IPC; ~once per chord change (rare).

### Security
- Cap simultaneous notes parsed at 12 (key-mash protection).
- Validate MIDI message type before parsing (note-on/off only; ignore SysEx, etc.).

### NOT in Scope
- Microtonal scales (12-TET only)
- Chord recommendation / generation
- Persistence of inferred mode beyond session
- Backend chord parsing (architecturally rejected; frontend only)

---

## Cross-cutting policies (apply to every feature)

### UX-path E2E as merge gate (per 2026-02-28 UX-blind QA solution)
Every PR that ships a new mod source, operator, or UI surface must include a UX-path E2E test that asserts **rendered output frames** reflect the change, not just that components render. Reference: `docs/solutions/2026-02-28-ux-blind-qa-prevention.md`. PRs with only component tests are rejected.

### Performance regression check
Before merge, run the existing performance baseline (`docs/PERF-OPTIMIZATION-PLAN.md`) and confirm 1080p chain timing has not regressed >5% on the 10 optimized effects. If any feature's overhead pushes effects into the >100 ms tier, it must be re-optimized before merge.

### Determinism
All randomness in F1 (sequencer dithering), F3 (organic curves), F4 (chord-change envelopes) must use `make_rng(seed + frame_index)` per `engine/determinism.py`. No Python `random.random()`, no JavaScript `Math.random()`. Verified via existing oracle suite re-run on each PR.

## Cross-cutting risks

| Risk | Mitigation |
|------|------------|
| F0 schema migration regresses existing project loading | Test harness loads 5 fixture v1 projects; CI fails on any deep-equal mismatch |
| Optical flow at 64×64 too noisy for direction | F2 build allows raise to 128×128 with measured perf budget |
| Sequencer pattern + macros + chord operator inflate project file size | Measure on 5 fixture projects; if >2× growth, compress with msgpack before persisting |
| Open bugs interact: BUG-8 (export dock overlap) may worsen with new sequencer panel | Run BUG-8 reproduction with sequencer panel mounted before merging F1 |

## Cost estimates (revised)

| Feature | Original estimate | Revised estimate |
|---------|-------------------|------------------|
| F0 prerequisite | not in plan | 1 sprint |
| F1 Datamosh Sequencer (JPEG only) | 1 sprint | 1.5 sprints |
| F2 Optical Sidechain + OSC + threat hardening | 1–2 days | 3 days |
| F3 Mutant Macro (curve types + persistence) | 1 sprint | 2 sprints |
| F4 ChordAnalyzer (mode inference is non-trivial) | 1 sprint | 1.5 sprints |
| **Total** | **~3 sprints** | **~6 sprints** |

## Open bugs (corrected)

Verified against `docs/COMPONENT-ACCEPTANCE-CRITERIA.md` (lines 195, 385, 688, 711, 1349, 1427–1429): BUG-12 and BUG-13 are **already fixed** (struck through in source). Open at planning time: **BUG-6 (effect list hidden), BUG-8 (export dock overlap), BUG-11 (track rename)**. F1 sequencer panel must be tested against BUG-8 reproduction before merge.

## NOT in Scope (release-wide)

- A1 Spectral Surgeon (separate audio VST product, separate codebase)
- A10 Pointillist Drum (separate audio VST product, separate codebase)
- New effects (this release leverages existing 193)
- Performance regressions to fix (handled in tier optimization sprints)
- v1 ship-blocking bug fixes (handled in their own sprints)
- GPU acceleration (CPU is sufficient for all features in this release)
- Backend MIDI plumbing (architecturally rejected; F4 stays frontend)
- H.264 per-frame datamosh control (architecturally rejected; F1 is JPEG-only)

## Smoke baseline

To be captured at the moment the F0 branch is cut. All subsequent feature branches must rebase from F0-merged main and meet-or-exceed the baseline before their own merge.
