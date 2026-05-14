---
title: Cross-Modal Features Release
status: planned
type: release
phase: v1.1
date: 2026-05-04
revision: v3 (rewritten from ground truth, 2026-05-05)
---

# Cross-Modal Features Release Plan

Four small features that exploit existing Entropic infrastructure to deliver cross-modal control (MIDI/optical/macro/chord-driven visuals). The unifying architectural insight is that **the existing `applyCCModulations` pattern is sufficient for all four features** — pure functions that take an effect chain plus a modulation source and return a chain with overridden param values. No operator remount required, no new IPC paths, no new backend modules except one optional extension to `video_analyzer.py`.

## Revision history

- **v1 (2026-05-04):** Initial four-feature plan.
- **v2 (2026-05-04):** Post-CTO-review amendments — added F0 prerequisite, perf budgets, security threat model, UX-path E2E gate.
- **v3 (2026-05-05):** **Plan rewritten from ground truth.** Three parallel review agents (security-sentinel, architecture-strategist, code-simplicity-reviewer) verified that v1 and v2 were anchored on fabricated codebase claims: `backend/src/core/` and `backend/src/operators/` do not exist (correct path is `backend/src/modulation/`), `PROJECT_VERSION = '2.0.0'` already exists at `frontend/src/renderer/project-persistence.ts:19` and `backend/src/project/schema.py:7`, F1 MIDI Learn is already wired (`stores/midi.ts:14-40`, `applyCCModulations.ts`, `MIDILearnOverlay.tsx`), `MacroMapping` already typed at `frontend/src/shared/types.ts:400` and `MacroKnob.tsx` already exists, the H.264 ffmpeg-piping constraint that justified F1's JPEG-only scope was fictional. v3 is rebuilt on verified file:line citations only.

## Ground truth (every claim below has a file:line citation, verified 2026-05-05)

| Claim | Source |
|-------|--------|
| Project schema versioning is already in place | `frontend/src/renderer/project-persistence.ts:19` (`PROJECT_VERSION = '2.0.0'`), `backend/src/project/schema.py:7` (`CURRENT_VERSION = "2.0.0"`) |
| Modulation matrix iterates dynamically over operator instances | `frontend/src/renderer/components/operators/ModulationMatrix.tsx:15-33` |
| MIDI Learn pipeline already implemented | `frontend/src/renderer/stores/midi.ts:14` (`ccMappings`), `:16` (`learnTarget`), `:26` (`setLearnTarget`), `:38-40` (state init) |
| CC → param override pure function exists | `frontend/src/renderer/components/performance/applyCCModulations.ts` (full file) |
| MIDI Learn UI exists | `frontend/src/renderer/components/performance/MIDILearnOverlay.tsx` |
| Macro mapping type defined | `frontend/src/shared/types.ts:400-406` (`interface MacroMapping`) |
| Macro knob component exists | `frontend/src/renderer/components/library/MacroKnob.tsx:1-30` |
| Macro mappings already persisted in Presets and DeviceGroups | `frontend/src/shared/types.ts:380, 422` |
| Step sequencer operator already implemented | `backend/src/modulation/step_sequencer.py` (full file, `evaluate_step_seq()`) |
| Video analyzer extracts: luminance, motion (scalar pixel delta), color, edges, histogram_peak | `backend/src/modulation/video_analyzer.py:1-12, :75-92` |
| Datamosh effects are pure NumPy/PIL per-frame functions (no ffmpeg piping) | `backend/src/effects/fx/datamosh.py`, `backend/src/effects/fx/datamosh_real.py` (per-frame `apply()`) |
| Operators are intentionally unmounted; backend IPC still accepts operator payload | `frontend/src/renderer/App.tsx:47` ("Operators removed from UI (Sprint 2)"); state-of-union §4 |
| State-of-union recommends "v1 without operators; remount as v1.1" | `docs/audits/2026-04-16-state-of-union.md:230-265` |
| `OperatorType` is a string-literal TS union | `frontend/src/shared/types.ts:332` (`'lfo' \| 'envelope' \| 'video_analyzer' \| 'audio_follower' \| 'step_sequencer' \| 'fusion'`) |
| Frontend-computed value injection IPC field is `automation_overrides` | `backend/src/zmq_server.py:453` |

## Architectural premise

This release ships v1.1 (after v1 ships per state-of-union Tier 0). All four features use the same pattern:

1. **Frontend-side modulation source** (MIDI sequencer, motion analyzer, macro knob, chord parser) emits a pure value or set of values per render tick.
2. **Pure function** (`apply{Source}Modulations(chain, source) → chain`) writes the values into effect param overrides, mirroring the existing `applyCCModulations` signature.
3. **Existing IPC** carries the modified chain to backend. No new IPC commands.
4. **Backend stays oblivious** to where the modulation came from — chain values are just chain values.

Benefits: zero operator remount work; no new IPC contract; no backend Python writes except one optional `video_analyzer.py` extension; cycle detection unnecessary (no inter-source feedback); persistence piggybacks on existing project schema (extend `MacroMapping`-style types only).

This is a smaller, more honest plan than v2. ~1.5–2 sprints total.

## Feature inventory

| # | Codename | Existing infrastructure reused | Net new code |
|---|----------|-------------------------------|--------------|
| F1 | Datamosh Sequencer | `stores/midi.ts` MIDI Learn pipeline; `applyCCModulations.ts` pattern; trigger-lane keyframe writer; `effects/fx/datamosh.py` + `datamosh_real.py` (both per-frame, both controllable) | 16-step grid component; `applyStepGridModulations.ts` pure function; project persistence for grid state |
| F2 | Optical Motion Angle | `backend/src/modulation/video_analyzer.py` (extends `analyze_motion`); existing IPC `operator_values` telemetry channel | `motion_angle` + `motion_centroid_x` + `motion_centroid_y` outputs from a Farneback global mean; UI surfacing in modulation matrix when remounted (v1.1 only) |
| F3 | Live Macro Device | `MacroMapping` type; `MacroKnob.tsx`; persistence shape in Presets and DeviceGroups; `applyCCModulations.ts` pattern | `MacroDevice.tsx` container; `applyMacroModulations.ts` pure function; right-click "Map to Macro" affordance on param knobs |
| F4 | Chord-to-Param Modulator | `stores/midi.ts` Web MIDI input; `applyCCModulations.ts` pattern; existing chain payload IPC | Frontend `chord_parser.ts` (~150 LoC); `applyChordModulations.ts` pure function; chord-mapping UI alongside CC mapping UI |

No F0 prerequisite. The mod-source registry, schema migration framework, and DAG cycle detection that v2 proposed were all solving non-problems against the actual codebase.

## Sequencing

Each feature ships independently as its own PR off `main`. F1 + F3 + F4 share the `applyXModulations` pattern and can be authored in parallel. F2 is the only backend touch.

Recommended order, fastest first:
1. **F2** (extend `video_analyzer.py`, ~1 day)
2. **F3** (Live Macro Device, ~3 days — most scaffolding exists)
3. **F1** (Datamosh Sequencer, ~3 days — most scaffolding exists)
4. **F4** (Chord parser + ChordModulations, ~4 days)

---

## F1 — Datamosh Sequencer

### Scope
A 16-step grid that drives `datamosh.py` and `datamosh_real.py` `intensity` and `corruption` params via the existing MIDI Learn pipeline. Each grid step holds a (intensity, corruption) value pair; the grid scrubs at a project-defined rate; MIDI Learn is wired exactly like `applyCCModulations` so any controller knob/CC binds to step-edit.

### Why now
JPEG byte-corruption datamosh and Farneback datamosh are Entropic's most distinctive effects. No competitor offers grid-sequenced datamosh control. The existing `evaluate_step_seq` operator (`backend/src/modulation/step_sequencer.py`) already proves the math; we want the same paradigm exposed at the effect-param level via a UI panel without requiring operator-mount.

### Branch: `feat/f1-datamosh-sequencer`

### Build Checklist
- [ ] `frontend/src/renderer/components/datamosh/StepGridPanel.tsx` — 16-step grid component, two value tracks (intensity, corruption)
- [ ] `frontend/src/renderer/components/performance/applyStepGridModulations.ts` — pure function mirroring `applyCCModulations.ts` signature: `(chain, gridState, frameIndex, bpm) → chain`
- [ ] Wire grid output into the same chain-transform pipeline that consumes `applyCCModulations` (`App.tsx:660-668` is the existing call site for this pattern)
- [ ] MIDI Learn extension: surface "step value" as a learnable target alongside existing param targets (extend `LearnTarget` type at `frontend/src/shared/types.ts`)
- [ ] Persist grid state in project file by extending the existing project schema with an optional `stepGrids: StepGridState[]` field — no migration needed, optional field hydration is the established pattern (see `project-persistence.ts:232,237,242,247`)

### Test Plan
- Unit:
  - [ ] `test_apply_step_grid_modulations.ts` — 4-step grid, scrub through 16 frames at known BPM, assert chain[i].params.intensity matches expected step at each frame
  - [ ] `test_step_grid_persistence.ts` — save with grid populated, load, deep-equal
  - [ ] `test_step_grid_midi_learn.ts` — bind a CC to grid step 3 intensity, send mock CC, store updates
- **UX-path E2E (merge gate):** `phase-perf/datamosh-step-grid.spec.ts` — load a clip, place grid kicks at steps 1+5+9+13, play, assert frame-pixel difference at the corresponding frame indices vs constant-param baseline.

### UAT
- [ ] Hook up an APC40, MIDI Learn the grid scrub speed, twist the controller, confirm the grid scrubs at the controller-driven rate
- [ ] Set grid pattern, save project, reload, pattern survives
- [ ] Disable MIDI device mid-play, sequencer continues without crash

### Performance budget
- 16-step lookup per render tick: <0.1 ms.
- No new per-frame backend cost (datamosh effects already process per frame).

### Security
- CC range validation (0–127) is already enforced (`stores/midi.ts:189-197`).
- New cap: `stepGrids.length` ≤ 8 per project; `steps.length` exactly 16; values clamped 0.0–1.0 at hydration.

### NOT in Scope
- Operator-rack-driven step sequencer (already exists at `backend/src/modulation/step_sequencer.py` — not part of this release; that path requires the v1.1 operator remount).
- Per-step waveform editing.
- Velocity curves and preset slots (deferred to user request).

---

## F2 — Optical Motion Angle

### Scope
Extend `backend/src/modulation/video_analyzer.py:analyze_motion` so its output expands from the current scalar pixel delta to four floats: `motion_magnitude`, `motion_angle_global`, `motion_centroid_x`, `motion_centroid_y`. Use Farneback dense optical flow at the existing 64×64 proxy resolution (Farneback is already a project dependency — used in `effects/fx/flow_distort.py:65` and `datamosh.py:92`). Surface the new outputs as additional fields in the existing operator-values telemetry response (`zmq_server.py:486-487`).

### Why now
A single richer video-analyzer output retroactively powers any future user routing once operators remount in v1.1. The bare `motion` scalar today (mean abs pixel delta) is too coarse to drive interesting modulation.

### Branch: `feat/f2-motion-angle`

### Build Checklist
- [ ] Extend `analyze_motion()` in `video_analyzer.py` to compute Farneback flow at 64×64 proxy and reduce to (magnitude, angle, centroid_x, centroid_y) — fall back to (delta, 0, 0.5, 0.5) if previous frame is None
- [ ] Add a new method enum value `'motion_v2'` in `video_analyzer.py` so existing `'motion'` projects keep their scalar contract (zero breaking change)
- [ ] Extend operator-values response in `zmq_server.py:486-487` to include the additional fields (extra fields, no breaking change)
- [ ] Add the `motion_v2` option in `frontend/src/renderer/components/operators/VideoAnalyzerEditor.tsx:5-10` (visible only when operators remount in v1.1)

### Test Plan
- Unit:
  - [ ] `test_motion_v2_translation.py` — synthetic translating-rectangle clip → `motion_angle_global` matches translation direction within ±15° (looser than v2 plan claimed because Farneback at 64×64 is grainy)
  - [ ] `test_motion_v2_zero_motion.py` — static clip → magnitude < epsilon, angle held at last value (or 0 if first frame), no random noise
  - [ ] `test_motion_v2_zoom.py` — zoom-in clip → magnitude > 0, angle near-random — DOCUMENT this as expected
  - [ ] `test_motion_v2_backward_compat.py` — existing `'motion'` method unchanged (regression)
- Oracle: extend `tests/oracles/test_video_analyzer_oracle.py` with `motion_v2` assertions

### UAT
- [ ] When operators remount in v1.1, place a VideoAnalyzer with method `motion_v2`, route `motion_angle_global` → `hue_shift.hue` on a clip with rigid pan, confirm hue follows pan direction.

### Performance budget
- Farneback @ 64×64: ~2 ms/frame on M-series CPU. Existing usage at `flow_distort.py` runs full-resolution and stays under budget; 64×64 is trivial.

### Security
- Optical-flow output values are session-only telemetry. **They MUST NOT be written to** `~/.entropic/logs/*`, `~/.entropic/crash_reports/*`, autosave `.glitch`, or any persisted project field. Add `test_motion_v2_not_logged.py` that runs the analyzer, then greps the log directory for `motion_*` field names — fails if found. (This is the I5 finding from the parallel security review and applies regardless of feature scope.)

### NOT in Scope
- OSC sender (no in-release consumer; cut entirely).
- LAN broadcast UI.
- Vector-field output (one global angle is the v1.1 contract; quadrant or zone-based outputs are a future plan if user demand emerges).
- Frontend modulation matrix changes (gated on operator remount in v1.1).

---

## F3 — Live Macro Device

### Scope
A live "Macro Device" container that wraps N user-defined `MacroKnob`s. Each knob 0.0–1.0 drives any number of mapped effect params via `applyMacroModulations.ts`, mirroring the `applyCCModulations` pattern. The `MacroMapping` type already exists (`types.ts:400-406`) and is already used in Presets (`types.ts:422`) and Device Groups (`types.ts:380`); this feature exposes them as a first-class live device.

### Why now
The Arca-style "everything moves at once" aesthetic is what users want; the type system and knob component already exist. The missing piece is a live container plus the chain-transform pure function.

### Branch: `feat/f3-macro-device`

### Build Checklist
- [ ] `frontend/src/renderer/components/macros/MacroDevice.tsx` — container with N (default 4, max 16) `MacroKnob`s plus a per-knob mapping list panel
- [ ] `frontend/src/renderer/components/performance/applyMacroModulations.ts` — pure function: `(chain, macros, knobValues) → chain`. Mirror `applyCCModulations.ts` exactly: structured-clone the chain, write `min + (max - min) * knobValue` to each mapped (effectId, paramKey)
- [ ] Right-click affordance on any knob in `ParamPanel`: "Map to Macro N" — adds a `MacroMapping` to that macro's list with the param's existing min/max
- [ ] Wire `applyMacroModulations` into the chain-transform pipeline at the same call site as `applyCCModulations`
- [ ] Persist macros in the project file by extending the existing schema with optional `macros: { id, label, value, mappings: MacroMapping[] }[]` — optional field, no migration

### Test Plan
- Unit:
  - [ ] `test_apply_macro_modulations.ts` — knob=0.5 with mapping (min=0, max=1), assert chain effect param = 0.5
  - [ ] `test_apply_macro_modulations_clamp.ts` — `NaN` and `±Inf` knob values clamped to 0.0 (security I2 from parallel security review)
  - [ ] `test_macro_persistence.ts` — save device with 4 knobs and 8 mappings, reload, deep-equal
  - [ ] `test_macro_param_remapping.ts` — delete an effect that a macro mapped to, confirm mapping is dropped on next save (no silent retarget)
- **UX-path E2E (merge gate):** `phase-ux/macro-device.spec.ts` — create macro device, map 3 effect params, twist the macro knob from 0 to 1, assert all 3 effect params change in the rendered output frames (not just store state).

### UAT
- [ ] Map vhs.intensity + bitcrush.depth + chromatic_aberration.shift to macro 1; twist knob; all three change live in preview
- [ ] Reload project, macro state preserved
- [ ] Map then delete the underlying effect; mapping removed cleanly

### Performance budget
- 16 macros × 16 mappings × 60 fps = 15 360 evals/sec; structured-clone of a 10-effect chain ~0.05 ms. Total <0.5 ms/frame.

### Security
- Cap macros per project at 64 (security I2 / weaponized project files).
- Cap mappings per macro at 16.
- Clamp knob values 0.0–1.0 at hydration; reject `NaN` / `±Inf` (per `feedback_numeric-trust-boundary.md`).
- New `mappable: boolean` flag on `ParamDef` (default true); flag transport/export/file-system params as `mappable: false`. Macro mapping UI hides non-mappable params. (Extends security I4 across the entire param surface.)

### NOT in Scope
- Curve types beyond linear (`curve: 'linear' | 'exp' | 'log'` → start with linear; defer exp/log to user request).
- Hand-drawn / organic curves (deferred — large component, low ROI for v1.1).
- Macro driving macro (forbidden by design; no nesting).

---

## F4 — Chord-to-Param Modulator

### Scope
Frontend chord parser reads MIDI note-on/note-off events from `stores/midi.ts`; identifies (root, quality) of the currently-held set; emits two values (`chord_root` 0–11, `chord_quality_index` 0–4 for maj/min/dim/aug/sus); `applyChordModulations.ts` writes them into mapped effect params via the same `applyCCModulations` pattern. Includes a chord-mapping UI alongside the CC-mapping UI.

### Why now
No competitor parses harmony — Synesthesia.live and Fractal Forge stop at pitch class. Chord identity gives Entropic users a richer modulation source for color/hue effects with minimal architectural footprint.

### Branch: `feat/f4-chord-modulator`

### Build Checklist
- [ ] `frontend/src/renderer/utils/chord_parser.ts` — parse held note set into (root: 0–11, quality: 'maj' | 'min' | 'dim' | 'aug' | 'sus'). Reject sets larger than 12 (security clamp). Stateless function.
- [ ] `frontend/src/renderer/components/performance/applyChordModulations.ts` — pure function mirroring `applyCCModulations.ts`: takes chain + chord mappings + (root, quality) values, returns chain
- [ ] Extend `LearnTarget` type and MIDI Learn UI to include "chord_root" and "chord_quality" as learnable sources (alongside CC sources)
- [ ] Hook into the existing render-tick chain transform pipeline at the same call site
- [ ] Persist chord mappings on the project file as optional `chordMappings: ChordMapping[]` (one mapping = (effectId, paramKey, source: 'root' | 'quality', min, max))

### Test Plan
- Unit:
  - [ ] `test_chord_parser.ts` — C-E-G → (root=0, quality='maj'); C-Eb-G → (0, 'min'); C-Eb-Gb → (0, 'dim'); empty set → null; 13 notes → null (clamp)
  - [ ] `test_apply_chord_modulations.ts` — root=0 + mapping (param min=0, max=11) → param=0.0; root=7 → param ≈ 0.636
  - [ ] `test_chord_persistence.ts` — save, reload, mappings survive
  - [ ] `test_chord_param_revalidate.ts` — load project mapping a deleted param, mapping is dropped (security I1 from parallel review)
- **UX-path E2E (merge gate):** `phase-modulation/chord-modulator.spec.ts` — send mock MIDI Cmaj → `chord_root=0` → mapped `hue_shift.hue` → assert rendered frame hue shifted

### UAT
- [ ] MIDI keyboard, play C-E-G; mapped hue shifts to red; switch to Fmaj; hue shifts to position 5/12

### Performance budget
- Parse on note-on/off only (event-driven), not per frame: <0.1 ms per event.
- `applyChordModulations` per render tick: identical cost to `applyCCModulations`.

### Security
- Cap held-notes-considered at 12 (key-mash protection).
- Filter MIDI message types at ingest: only Note On/Off, CC, Pitch Bend, Channel Pressure pass through. Reject SysEx, MIDI Time Code, Active Sensing (security I1 + I3 from parallel review). This filter belongs in `stores/midi.ts:handleMIDIMessage` and benefits F1 + F4 simultaneously.
- Verify Electron `session.setPermissionRequestHandler` scopes Web MIDI to the main renderer only (security I3 from parallel review). Add `test_webmidi_permission_scoped.ts`.
- Rate-limit ingest: max 1000 events/sec/device (drops above; one warn-toast per second).
- Drop chord-change pulse if > 50 chord changes/sec.

### NOT in Scope
- `mode_brightness` (Lydian/Phrygian inference) — deferred. Mode inference is the most expensive sub-feature for the smallest user-visible payoff. Add when a user asks.
- `chord_change_pulse` decay envelope — deferred unless trivially derivable.
- Microtonal scales.
- ChordAnalyzer as an `Operator` type — out of scope; this feature uses the same chain-transform pattern as MIDI CC and macros, not the operator system.

---

## Cross-cutting policies

### Backend modulation engine: topological-sort fix (10-line cleanup)
The architecture review found that `backend/src/modulation/engine.py:51-148` evaluates operators in declaration order. `Fusion` operators that reference operators declared later read 0.0 silently. Fix is a 10-line topological sort of the operator list before the for-loop, using each operator's declared dependencies. Land this as a self-contained fix on `feat/modulation-toposort` separately from the four cross-modal features. **This is the only F0-style cleanup the parallel review confirmed as load-bearing.** Schema migrations, mod source registry, and DAG cycle detection in v2 were all solving non-problems.

### Determinism
All randomness (e.g., F1 grid scrub jitter if any, F3 macro curve animation if added later) uses `make_rng(seed + frame_index)` per `backend/src/engine/determinism.py`. No `Math.random()` / `random.random()` in any new path.

### Project file hardening (carried from parallel security review C1)
Project files are user-supplied data. `loadProject` (`project-persistence.ts:288-338`) currently calls `validateProject` then `hydrateStores` directly. Add a depth/key/proto-pollution validator:
- max JSON nesting depth 32
- max object keys per node 1024
- reject keys `__proto__` / `constructor` / `prototype` recursively
- reject arrays > 10k entries
- reject `version` strings > 16 chars
- reject `schemaVersion: > current` with toast "Project saved by a newer Entropic version"

Land this as `feat/project-load-hardening` separately from the four features. **Affects every existing user, not just this release**, so it is its own PR. Same review confirmed it is the highest-leverage security work in the entire roadmap.

### UX-path E2E as merge gate (per existing `docs/solutions/2026-02-28-ux-blind-qa-prevention.md`)
Every PR that adds a new chain-transform pure function must include an E2E test asserting **rendered output frames** reflect the change, not just that components render. PRs with only component tests are rejected.

### Performance regression check
Run the existing baseline (`docs/PERF-OPTIMIZATION-PLAN.md`) and confirm 1080p chain timing has not regressed >5%. None of the four features add per-frame backend cost (F2 motion is replacing existing scalar with a 4-tuple at the same proxy resolution).

## Cost estimates

| Branch | Estimate |
|--------|----------|
| `feat/modulation-toposort` (cross-cutting cleanup) | ~0.5 day |
| `feat/project-load-hardening` (cross-cutting security) | ~1 day |
| `feat/f2-motion-angle` | ~1 day |
| `feat/f3-macro-device` | ~3 days |
| `feat/f1-datamosh-sequencer` | ~3 days |
| `feat/f4-chord-modulator` | ~4 days |
| **Total** | **~1.5–2 sprints** |

## Open bugs (verified against `docs/COMPONENT-ACCEPTANCE-CRITERIA.md`, 2026-05-05)

BUG-12 and BUG-13 are already fixed (struck through in source). Open at planning time: **BUG-6 (effect list hidden), BUG-8 (export dock overlap), BUG-11 (track rename)**. F1 sequencer panel adds a new dock zone; verify against BUG-8 reproduction before merge.

## NOT in Scope (release-wide)

- Operator rack remount (separate v1.1 task per state-of-union §Tier 0)
- New effects (this release leverages existing 193)
- Performance regression fixes (separate sprints)
- v1 ship-blocker bug fixes (BUG-6, BUG-8, BUG-11 stay open through this release)
- OSC sender (cut — no in-release consumer)
- F0-style mod source registry, DAG cycle detection, schema migration framework (cut — solving non-problems against actual codebase)
- Mode inference / `mode_brightness` (deferred)
- Hand-drawn macro curves (deferred)
- Backend MIDI plumbing (architecturally rejected — Web MIDI is renderer-only by design)
- ChordAnalyzer / MacroDevice / DatamoshSequencer as `Operator` types (gated on v1.1 operator remount; this release uses the chain-transform pattern instead)

## Smoke baseline

To be captured on the `feat/modulation-toposort` branch when first feature work begins. All subsequent feature branches rebase from there and meet-or-exceed before merge.
