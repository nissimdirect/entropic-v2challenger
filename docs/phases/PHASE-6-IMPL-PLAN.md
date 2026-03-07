---
title: "Phase 6: Operators + Modulation"
status: draft
project: entropic-v2challenger
phase: 6
depends_on: Phase 2A (parameter UX), Phase 2B (audio pipeline for audio-reactive), Phase 5 (performance pads — completed)
sessions: 5-7
created: 2026-03-07
---

# Phase 6: Operators + Modulation — Implementation Plan

## Context

Phase 5 (Basic Performance) is complete with 604 frontend tests + 3,788 backend tests = 4,392 all green. Pad ADSR envelopes modulate effect parameters from the frontend via `applyPadModulations()`. Phase 6 builds the **general-purpose modulation system**: operators (LFO, envelope, video analyzer, audio follower, step sequencer, fusion) that generate control signals (0.0-1.0) and route them to any effect parameter.

**Architecture refs:** SIGNAL-ARCHITECTURE.md (4-layer system), DATA-SCHEMAS.md §6 (Operator types), PHASE-6.md (14 acceptance criteria).

**Key architectural question:** Where does signal evaluation happen? Phase 5 pads evaluate in the frontend (Python never sees pads). Operators are different — video analyzers need the current frame, audio followers need PCM data. Both live in the backend.

---

## Decision Gates

> These are scoping questions that must be answered before implementation begins.
> **Stakeholder:** answer each gate inline, then mark `status: approved`.

### DG-1: Phase Split (6A / 6B)

**Question:** Phase 6 spec has 14 acceptance criteria spanning 6 operator types, DAG routing, modulation matrix, ghost handles, and signal processing chains. This is ~2x the scope of Phase 5. Split into 6A (core engine + LFO + routing) and 6B (analyzers + fusion + matrix + ghost handle)?

**Recommendation:** Split. 6A delivers the wiring that makes everything else possible. 6B adds the exotic sources. Users get value from LFO alone — it's the most-used modulator in every DAW.

**6A scope:** LFO operator, envelope operator, step sequencer, operator store, routing (one-to-many, many-to-one), signal processing chain, operator rack UI, IPC (`evaluate_signals`), DAG check, persistence.

**6B scope:** Video analyzer, audio follower, fusion operator, modulation matrix panel, ghost handle on knobs, routing lines SVG, 64x64 proxy.

| Option | Sessions | Deliverables |
|--------|----------|-------------|
| Full Phase 6 | 6-7 | Everything at once |
| 6A then 6B | 3-4 + 3-4 | LFO/envelope/step first, analyzers/matrix second |

**Decision:** `_________________` | **Status:** `pending`

---

### DG-2: Signal Evaluation Location

**Question:** Where do operators evaluate?

| Option | Pros | Cons |
|--------|------|------|
| **Backend** (Python) | Video analyzer needs frame, audio follower needs PCM, numpy for math, single evaluation point | Extra IPC round-trip, operator state in Python |
| **Frontend** (TypeScript) | No IPC latency, simpler for LFO/step seq | Can't access frame/audio data, two evaluation systems (pads + operators) |
| **Hybrid** | LFO/step/envelope in frontend (fast), video/audio in backend (needs data) | Two code paths, state split, complexity |

**Recommendation:** Backend-only. The `render_frame` IPC already sends the frame — we extend it to also evaluate operators in the same call. One evaluation point, one state machine, one language. LFO math in Python is trivial (<0.01ms). The IPC already exists — no new round-trip needed if we piggyback on `render_frame`.

**Implication:** The `render_frame` response gains an `operator_values: Record<string, number>` field. Frontend uses these to update ghost handles and modulation matrix display. Backend applies modulations to the chain *before* processing effects.

**Decision:** `_________________` | **Status:** `pending`

---

### DG-3: Operator-Pad Relationship

**Question:** Phase 5 pads already modulate params via `applyPadModulations()` in the frontend. Phase 6 operators modulate params via the backend signal engine. How do these coexist?

| Option | Description |
|--------|-------------|
| **A: Replace** | Pads become a special operator type. All modulation goes through backend. Remove `applyPadModulations()`. |
| **B: Coexist** | Pads stay frontend-only (instant response). Operators go through backend. Signal order: Base → Pad Modulation → Operator Modulation → Automation → Clamp. |
| **C: Defer** | Keep both for now. Unify in Phase 9 (full performance system). |

**Recommendation:** Option C. Pad response time matters (they're live-performance, latency-sensitive). Backend operators run at frame rate (~33ms). Unifying in Phase 9 when MIDI and retro-capture come in makes more sense than disrupting working Phase 5 code now.

**Decision:** `_________________` | **Status:** `pending`

---

### DG-4: Ghost Handle Scope

**Question:** Ghost handles (spec item 10) require modifying the existing `Knob` component to show a semi-transparent ring at the modulated value. This touches Phase 2A's param UX system. Include in 6A, defer to 6B, or skip entirely?

**Recommendation:** Defer to 6B. Ghost handles are visual polish — operators work without them. The data flow (operator values → ghost position) needs the operator store to exist first. Building the store in 6A, then adding ghost handles in 6B, is cleaner.

**Decision:** `_________________` | **Status:** `pending`

---

### DG-5: Modulation Matrix Priority

**Question:** The modulation matrix (spec item 14) is a grid panel showing all active routings (operators as rows, params as columns, depth at intersections). It's useful for debugging but not required for operators to function. Include in 6A or 6B?

**Recommendation:** 6B. The matrix is a read-only visualization of routing state. Operators + routing work without it. Deferring keeps 6A focused on the engine.

**Decision:** `_________________` | **Status:** `pending`

---

### DG-6: Step Sequencer vs Audio Follower Priority

**Question:** Both are acceptance criteria. Step sequencer is self-contained (no external data). Audio follower requires Phase 2B audio pipeline (PCM access). Which gets priority?

**Recommendation:** Step sequencer in 6A (it's just a lookup table — trivial). Audio follower in 6B (depends on PCM being available from the audio decode pipeline). If Phase 2B isn't complete, audio follower gets stubbed.

**Decision:** `_________________` | **Status:** `pending`

---

### DG-7: Operator State Persistence

**Question:** Operators have runtime state (LFO phase, envelope stage, previous frame for motion detection). Where does this live?

| Option | Where | Persistence |
|--------|-------|-------------|
| **Backend state dict** | Python `states` dict, keyed by operator ID | Wiped on sidecar restart. Config (operator definitions) saved in project. Runtime state is ephemeral. |
| **Frontend + backend** | Config in Zustand, runtime in Python | Config persists in project file. Runtime always recalculated. |

**Recommendation:** Config in Zustand (persisted in project file). Runtime state in Python (ephemeral, like effect state). This matches exactly how effects work: `EffectInstance` config lives in the frontend store, `state_in/state_out` lives in the backend pipeline.

**Decision:** `_________________` | **Status:** `pending`

---

### DG-8: IPC Pattern for Signal Evaluation

**Question:** How does signal evaluation integrate with the existing `render_frame` IPC?

| Option | How |
|--------|-----|
| **A: Extend render_frame** | Add `operators` field to `render_frame` request. Backend evaluates operators, applies modulations to chain params, then processes effects. Response includes `operator_values`. |
| **B: Separate IPC call** | New `evaluate_signals` command. Frontend calls it before `render_frame`, gets values, applies modulations to chain, then sends modulated chain to `render_frame`. |
| **C: Backend-internal** | Operators are part of the chain data. Backend evaluates them inline during `apply_chain`. No new IPC command. |

**Recommendation:** Option A. One round-trip per frame (no latency increase). Backend has the frame + audio + state needed for evaluation. Response `operator_values` lets frontend update UI (ghost handles, matrix).

**Implication for `render_frame`:**
```python
# Current
{"cmd": "render_frame", "chain": [...], "frame_index": 0}

# Extended
{"cmd": "render_frame", "chain": [...], "frame_index": 0, "operators": [...], "routings": [...]}

# Response gains
{"ok": true, "frame": "...", "operator_values": {"lfo-1": 0.73, "env-1": 0.0}}
```

**Decision:** `_________________` | **Status:** `pending`

---

## What Already Exists

### Relevant Code (read, don't modify unless noted)

| File | What's There | Relevance |
|------|-------------|-----------|
| `frontend/src/shared/types.ts` | `ModulationRoute`, `EffectInstance.modulations` | Modulation routing type already exists. Extend for operators. |
| `frontend/src/renderer/stores/performance.ts` | Pad store, `applyPadModulations()` | Pattern for operator store. Coexistence question (DG-3). |
| `frontend/src/renderer/components/performance/computeADSR.ts` | Frontend ADSR math | Reference for backend envelope operator (different implementation). |
| `backend/src/engine/pipeline.py` | `apply_chain()` with per-effect state | Signal evaluation hooks into this. |
| `backend/src/zmq_server.py` | `render_frame` handler | Needs extension for operators (DG-8). |
| `frontend/src/renderer/project-persistence.ts` | `serializeProject()`, `hydrateStores()` | Must add operators + routings. |
| `docs/SIGNAL-ARCHITECTURE.md` | 4-layer signal model | Implementation spec. |
| `docs/DATA-SCHEMAS.md` §6 | `Operator`, `SignalValue`, `ResolvedParam` | Type definitions. |

### Key Constraints

1. **SEC-7:** Chain depth limit = 10 effects. Operators are NOT effects — they don't count toward this limit. But we need a separate operator count limit (suggest 16).
2. **Frame budget:** 33ms at 30fps. Operator evaluation must be <5ms total (all operators combined). Video analyzer on 64x64 proxy = ~0.01ms. LFO/step/envelope = ~0.001ms each.
3. **Signal range:** All operator outputs are 0.0-1.0. Clamped at source. NaN/Infinity → 0.0 (same pattern as Phase 5 ADSR).
4. **State model:** Operator runtime state follows the same pattern as effect state: `state_in` → process → `state_out`, keyed by operator ID.

---

## Implementation Plan

> Assumes DG-1 = "split" (6A first). If DG-1 = "full", merge all sprints below.

## Phase 6A: Core Signal Engine + LFO + Routing

### Sprint 1: Types + Backend Signal Engine

- [ ] **1.1** Add operator types to `frontend/src/shared/types.ts`
  - `OperatorType = 'lfo' | 'envelope' | 'video_analyzer' | 'audio_follower' | 'step_sequencer' | 'fusion'`
  - `LFOWaveform = 'sine' | 'saw' | 'square' | 'triangle' | 'random' | 'noise' | 'sample_hold'`
  - `SignalProcessingStep = { type: 'threshold' | 'smooth' | 'quantize' | 'invert' | 'scale', params: Record<string, number> }`
  - `Operator { id, type: OperatorType, label, parameters: Record<string, number | string | boolean>, processing: SignalProcessingStep[], mappings: OperatorMapping[], isEnabled: boolean }`
  - `OperatorMapping { targetEffectId: string, targetParamKey: string, depth: number, min: number, max: number, curve: 'linear' | 'exponential' | 'logarithmic' | 's-curve', blendMode?: 'add' | 'multiply' | 'max' | 'min' | 'average' }`
  - Extend `Project` with `operators?: Operator[]`

- [ ] **1.2** Create `backend/src/signal/__init__.py` (empty)

- [ ] **1.3** Create `backend/src/signal/lfo.py`
  - Pure function: `evaluate_lfo(waveform, rate_hz, phase_offset, frame_index, fps, state_in) -> (value, state_out)`
  - 7 waveforms: sine, saw (ascending ramp), square (50% duty), triangle, random (new random each cycle), noise (new random each frame), sample & hold (random held per cycle)
  - Rate in Hz, converted to frames-per-cycle: `frames_per_cycle = fps / rate_hz`
  - Phase: `phase = ((frame_index / frames_per_cycle) + phase_offset) % 1.0`
  - All outputs 0.0-1.0 (sine is `(sin(2*pi*phase) + 1) / 2`, not bipolar)
  - NaN/Infinity guard → 0.0
  - State: `{ last_random: float, last_sh_phase_cycle: int }` for random/S&H waveforms

- [ ] **1.4** Create `backend/tests/test_signal_lfo.py`
  - Sine at 1Hz, 30fps: frame 0 → 0.5, frame 7 → ~1.0 (peak quarter), frame 15 → 0.5, frame 22 → ~0.0 (trough)
  - Square at 1Hz: frames 0-14 → 1.0, frames 15-29 → 0.0
  - Saw at 1Hz: frame 0 → 0.0, frame 15 → 0.5, frame 29 → ~1.0
  - Triangle: frame 0 → 0.0, frame 7 → ~0.5, frame 15 → 1.0, frame 22 → ~0.5
  - Phase offset 0.5: sine shifted by half cycle
  - Rate 0.01Hz (very slow), rate 50Hz (very fast): no crash
  - Random: different value each cycle, same value within cycle
  - S&H: holds random value for full cycle, changes on next cycle
  - Noise: potentially different value every frame
  - NaN rate → 0.0
  - Zero rate → 0.0 (no division by zero)

- [ ] **1.5** Create `backend/src/signal/envelope.py`
  - `evaluate_envelope(trigger, attack, decay, sustain, release, frame_index, state_in) -> (value, state_out)`
  - Trigger modes: `manual` (trigger bool from frontend), `threshold` (value > threshold triggers)
  - State machine: idle → attack → decay → sustain → release → idle (same phases as Phase 5 frontend ADSR but in Python)
  - Linear ramps, 0-frame = instant transition
  - State: `{ phase, trigger_frame, release_frame, current_value, release_start_value }`
  - NaN/Infinity/negative frame guards

- [ ] **1.6** Create `backend/tests/test_signal_envelope.py`
  - Manual trigger: idle → attack → decay → sustain
  - Manual release: sustain → release → idle
  - 0-frame attack: instant peak
  - Threshold trigger: value crosses threshold → triggers
  - Threshold release: value drops below threshold → releases
  - Retrigger during attack: restart from 0
  - NaN values → 0.0
  - ~12 tests

- [ ] **1.7** Create `backend/src/signal/step_sequencer.py`
  - `evaluate_step_seq(steps: list[float], rate_hz: float, frame_index: int, fps: int) -> float`
  - 16-step grid (or fewer), each step is 0.0-1.0
  - Rate = steps-per-second. At 1Hz with 16 steps, full cycle = 16 seconds.
  - `step_index = int((frame_index / fps * rate_hz) % len(steps))`
  - Returns `steps[step_index]`
  - Pure function, no state needed

- [ ] **1.8** Create `backend/tests/test_signal_step_seq.py`
  - 4 steps [1.0, 0.5, 0.0, 0.75], rate 1Hz, 30fps: step changes every 7.5 frames
  - 16 steps at 2Hz: full cycle in 0.5 seconds
  - Empty steps → 0.0
  - Rate 0 → 0.0
  - ~6 tests

- [ ] **1.9** Create `backend/src/signal/processor.py`
  - `process_signal(value: float, chain: list[dict]) -> float`
  - Operations: threshold, smooth, quantize, invert, scale (from SIGNAL-ARCHITECTURE.md §4)
  - Each step: `{ "type": "threshold", "params": { "threshold": 0.5 } }`
  - Smooth requires previous value — pass as param: `{ "type": "smooth", "params": { "amount": 0.8, "prev": 0.3 } }`
  - Output always clamped 0.0-1.0
  - NaN guard on each step

- [ ] **1.10** Create `backend/tests/test_signal_processor.py`
  - Threshold: 0.3 with threshold 0.5 → 0.0; 0.8 with threshold 0.5 → 0.6
  - Smooth: slew limiting
  - Quantize: 4 steps → values snap to 0, 0.25, 0.5, 0.75, 1.0
  - Invert: 0.3 → 0.7
  - Scale: 0.5 with range [0.2, 0.8] → 0.5
  - Chain: threshold + invert + scale
  - NaN input → 0.0
  - Empty chain → passthrough
  - ~10 tests

- [ ] **1.11** Create `backend/src/signal/routing.py`
  - `resolve_routings(operator_values: dict[str, float], operators: list[dict], chain: list[dict]) -> list[dict]`
  - For each operator mapping: find target effect + param, accumulate modulation deltas
  - Many-to-one: blend modes (add, multiply, max, min, average)
  - Apply: `new_value = base + sum(deltas)`, clamped to param's [min, max]
  - Returns modified chain (deep copy)
  - `check_cycle(routings: dict, new_edge: tuple) -> bool` — BFS cycle detection

- [ ] **1.12** Create `backend/tests/test_signal_routing.py`
  - One-to-many: LFO → 2 params, both modulated independently
  - Many-to-one: 2 LFOs → same param, add mode
  - Many-to-one: multiply mode
  - Clamp to param bounds
  - Missing effect → skip (no crash)
  - Depth 0 → no change
  - DAG cycle detection: A→B→C, C→A = cycle detected
  - DAG: A→B, A→C = no cycle (fan-out ok)
  - ~12 tests

### Sprint 2: IPC Integration + Signal Engine Orchestrator

- [ ] **2.1** Create `backend/src/signal/engine.py`
  - `class SignalEngine`
  - `evaluate_all(operators: list[dict], frame_index: int, fps: int, state: dict) -> tuple[dict[str, float], dict]`
  - Dispatches to lfo/envelope/step_seq based on `operator.type`
  - Applies processing chain per operator
  - Returns `{operator_id: processed_value}` and updated state
  - Video analyzer and audio follower: stub returns 0.0 (deferred to 6B)
  - Fusion: stub returns 0.0 (deferred to 6B)
  - Max 16 operators (SEC-style limit)
  - Total evaluation budget assertion: <5ms for 16 operators

- [ ] **2.2** Create `backend/tests/test_signal_engine.py`
  - 2 LFOs + 1 envelope → all evaluated correctly
  - Unknown operator type → skipped, no crash
  - State persistence across calls (LFO phase continues)
  - Empty operators list → empty results
  - 16 operators → <5ms assertion
  - ~8 tests

- [ ] **2.3** Modify `backend/src/zmq_server.py` — extend `render_frame`
  - If `operators` field present in message:
    1. Evaluate all operators via `SignalEngine.evaluate_all()`
    2. Resolve routings via `routing.resolve_routings()`
    3. Pass modulated chain to `apply_chain()`
    4. Include `operator_values` in response
  - If `operators` field absent: existing behavior (backward compat)
  - Add operator state to server instance (like effect states)
  - Import SignalEngine lazily to avoid import overhead when not used

- [ ] **2.4** Create `backend/tests/test_zmq_signal_integration.py`
  - `render_frame` with operators: response includes `operator_values`
  - `render_frame` without operators: backward compat, no `operator_values`
  - LFO modulating hue_shift amount: output frame differs from unmodulated
  - Invalid operator skipped, rest still evaluated
  - `check_dag` IPC command: validates cycle detection
  - ~6 tests

- [ ] **2.5** Add `check_dag` command to `zmq_server.py`
  - Request: `{ "cmd": "check_dag", "routings": {...}, "new_edge": [src, tgt] }`
  - Response: `{ "ok": true, "is_valid": bool }`
  - Uses `routing.check_cycle()`

### Sprint 3: Frontend Store + Operator Rack UI

- [ ] **3.1** Create `frontend/src/renderer/stores/operators.ts`
  - State: `operators: Operator[]`
  - Actions:
    - `addOperator(type: OperatorType) -> string` (returns new ID)
    - `removeOperator(id: string)`
    - `updateOperator(id: string, updates: Partial<Operator>)`
    - `addMapping(operatorId: string, mapping: OperatorMapping)`
    - `removeMapping(operatorId: string, index: number)`
    - `updateMapping(operatorId: string, index: number, updates: Partial<OperatorMapping>)`
    - `reorderOperators(fromIndex: number, toIndex: number)`
    - `setOperatorEnabled(id: string, enabled: boolean)`
    - `resetOperators()`
    - `loadOperators(operators: Operator[])`
  - All mutations through `useUndoStore.getState().execute()` (undo support)
  - Selector: `getSerializedOperators()` — returns operators in IPC-ready format

- [ ] **3.2** Create `frontend/src/__tests__/stores/operators.test.ts`
  - Add/remove operators
  - Update operator parameters
  - Add/remove/update mappings
  - Reorder operators
  - Enable/disable
  - Undo/redo for all mutations
  - Reset clears all
  - Load from project data
  - ~16 tests

- [ ] **3.3** Create `frontend/src/renderer/styles/operators.css`
  - BEM: `.operator-rack`, `.operator-card`, `.operator-card--lfo/--envelope/--step-seq`
  - Horizontal scrolling rack (like effect rack)
  - Operator type color coding
  - Active/disabled states

- [ ] **3.4** Create `frontend/src/renderer/components/operators/OperatorRack.tsx`
  - Horizontal chain of operator cards
  - "Add Operator" dropdown (LFO, Envelope, Step Sequencer; Video Analyzer/Audio Follower/Fusion grayed out with "Coming soon")
  - Drag-to-reorder (if drag infrastructure exists, otherwise skip)
  - Reads from `useOperatorStore`

- [ ] **3.5** Create `frontend/src/renderer/components/operators/LFOEditor.tsx`
  - Waveform selector: 7 buttons with waveform icons (text labels fine for now)
  - Rate knob: 0.01-50 Hz (logarithmic curve)
  - Sync-to-BPM toggle (stores rate as BPM division, converts to Hz using project BPM — stub if no BPM system yet)
  - Depth slider: 0-100%
  - Phase offset knob: 0-360 degrees (display), stored as 0.0-1.0
  - Waveform preview: simple canvas showing ~2 cycles of the selected waveform (optional polish)
  - Mappings list: effect dropdown + param dropdown + depth slider + remove button (reuse PadEditor pattern)

- [ ] **3.6** Create `frontend/src/renderer/components/operators/EnvelopeEditor.tsx`
  - ADSR sliders (reuse Phase 5 pattern from PadEditor)
  - Trigger mode selector: Manual button / Threshold input
  - Threshold slider (when threshold mode selected)

- [ ] **3.7** Create `frontend/src/renderer/components/operators/StepSequencerEditor.tsx`
  - 16 vertical bars (draggable height = 0.0-1.0 value)
  - Rate knob
  - Step count selector (4, 8, 16, 32)
  - Current step indicator (highlight during playback)

- [ ] **3.8** Modify `frontend/src/renderer/App.tsx`
  - Import OperatorRack, useOperatorStore
  - Add operator rack to the bottom bar area (alongside performance panel)
  - Wire operators into `render_frame` IPC call:
    ```typescript
    const operators = useOperatorStore.getState().getSerializedOperators();
    // Add to render_frame request
    { cmd: 'render_frame', chain, frame_index, operators, routings: ... }
    ```
  - Read `operator_values` from response, store for UI updates

- [ ] **3.9** Create `frontend/src/__tests__/components/operators/lfo-editor.test.ts`
  - Waveform selection updates store
  - Rate change updates store
  - Phase offset change updates store
  - Add/remove mapping
  - ~6 tests

### Sprint 4: Persistence + Integration Tests + Polish

- [ ] **4.1** Modify `frontend/src/renderer/project-persistence.ts`
  - `serializeProject()`: add `operators: operatorStore.operators`
  - `validateProject()`: optional operators validation (array of objects with type/id)
  - `hydrateStores()`: add `loadOperators()` call
  - `newProject()`: add `resetOperators()` call
  - Backward compat: missing `operators` field → empty array

- [ ] **4.2** Create `frontend/src/__tests__/stores/operators-persistence.test.ts`
  - Round-trip: create operators → serialize → load → verify
  - Missing operators field → empty array (backward compat)
  - Operator mappings preserved
  - Operator processing chain preserved
  - ~6 tests

- [ ] **4.3** Modify `frontend/src/shared/ipc-serialize.ts` (if needed)
  - Add operator serialization: camelCase → snake_case for backend
  - `serializeOperators(operators: Operator[]) -> dict[]`
  - `deserializeOperatorValues(response) -> Record<string, number>`

- [ ] **4.4** Integration test: LFO → effect param end-to-end
  - Create LFO operator, add mapping to hue_shift.amount
  - Call render_frame with operators
  - Verify operator_values in response
  - Verify output frame differs from unmodulated baseline
  - ~3 tests

- [ ] **4.5** Visual polish
  - Operator card type icons (or colored letters: L/E/S)
  - Active indicator (green dot when generating non-zero signal)
  - Mapping count badge on operator card
  - Disabled state (grayed out, strikethrough label)

---

## Phase 6B: Analyzers + Fusion + Matrix + Ghost Handle

> Implemented. All items complete.

- [x] Video Analyzer operator (luminance, motion, color, edges, histogram peak)
- [x] 64x64 proxy downscale in backend
- [x] Audio Follower operator (RMS, frequency band, onset) — completed in 6A
- [x] Fusion operator (weighted blend of 2+ signals)
- [x] Modulation Matrix panel (grid view)
- [x] Ghost Handle on Knob component (wired to operator values)
- [x] Routing Lines SVG (operator → param visual connection)

---

## Files Summary (Phase 6A)

### New Files (Backend: 8)
| File | Purpose |
|------|---------|
| `backend/src/signal/__init__.py` | Package init |
| `backend/src/signal/lfo.py` | LFO evaluation (7 waveforms) |
| `backend/src/signal/envelope.py` | ADSR envelope operator |
| `backend/src/signal/step_sequencer.py` | Step grid evaluation |
| `backend/src/signal/processor.py` | Signal processing chain |
| `backend/src/signal/routing.py` | Routing resolution + DAG check |
| `backend/src/signal/engine.py` | Orchestrator: evaluate all operators |
| `backend/tests/test_signal_lfo.py` | LFO tests |
| `backend/tests/test_signal_envelope.py` | Envelope tests |
| `backend/tests/test_signal_step_seq.py` | Step sequencer tests |
| `backend/tests/test_signal_processor.py` | Processing chain tests |
| `backend/tests/test_signal_routing.py` | Routing + DAG tests |
| `backend/tests/test_signal_engine.py` | Engine orchestrator tests |
| `backend/tests/test_zmq_signal_integration.py` | IPC integration tests |

### New Files (Frontend: 9)
| File | Purpose |
|------|---------|
| `frontend/src/renderer/stores/operators.ts` | Zustand operator store |
| `frontend/src/renderer/styles/operators.css` | BEM styles |
| `frontend/src/renderer/components/operators/OperatorRack.tsx` | Horizontal operator chain |
| `frontend/src/renderer/components/operators/LFOEditor.tsx` | LFO config UI |
| `frontend/src/renderer/components/operators/EnvelopeEditor.tsx` | Envelope config UI |
| `frontend/src/renderer/components/operators/StepSequencerEditor.tsx` | Step sequencer UI |
| `frontend/src/__tests__/stores/operators.test.ts` | Store tests |
| `frontend/src/__tests__/stores/operators-persistence.test.ts` | Persistence tests |
| `frontend/src/__tests__/components/operators/lfo-editor.test.ts` | LFO editor tests |

### Modified Files (3-4)
| File | Changes |
|------|---------|
| `frontend/src/shared/types.ts` | +Operator types, extend Project |
| `frontend/src/renderer/App.tsx` | +OperatorRack in layout, wire operators into render_frame IPC |
| `frontend/src/renderer/project-persistence.ts` | +operators serialization/hydration/validation |
| `backend/src/zmq_server.py` | +operators in render_frame, +check_dag command |

---

## Test Plan (Phase 6A)

### Unit Tests

| Area | Location | Count |
|------|----------|-------|
| LFO math | `backend/tests/test_signal_lfo.py` | ~14 |
| Envelope | `backend/tests/test_signal_envelope.py` | ~12 |
| Step sequencer | `backend/tests/test_signal_step_seq.py` | ~6 |
| Signal processor | `backend/tests/test_signal_processor.py` | ~10 |
| Routing + DAG | `backend/tests/test_signal_routing.py` | ~12 |
| Engine orchestrator | `backend/tests/test_signal_engine.py` | ~8 |
| IPC integration | `backend/tests/test_zmq_signal_integration.py` | ~6 |
| Operator store | `frontend/src/__tests__/stores/operators.test.ts` | ~16 |
| Persistence | `frontend/src/__tests__/stores/operators-persistence.test.ts` | ~6 |
| LFO editor | `frontend/src/__tests__/components/operators/lfo-editor.test.ts` | ~6 |
| **Total 6A** | | **~96 new tests** |

### Edge Cases

- [ ] LFO rate = 0: no division by zero, output = 0.0
- [ ] LFO rate = 50Hz at 30fps: aliasing — still produces values, just not smooth
- [ ] All 16 operators active: <5ms total evaluation
- [ ] Operator mapped to deleted effect: gracefully skipped
- [ ] Two operators → same param: additive, clamped to ParamDef bounds
- [ ] DAG cycle in routing: rejected, UI grays out
- [ ] NaN/Infinity in any operator output: clamped to 0.0
- [ ] Empty processing chain: value passes through unchanged
- [ ] Quantize with 0 steps: returns 0.0 (guard against division by zero)
- [ ] Smooth with amount = 1.0: no change (infinite slew)
- [ ] Project file without operators field: backward compat, empty array
- [ ] Undo/redo operator add/remove/update

### Verification Commands

```bash
# Backend
cd backend && python -m pytest tests/test_signal_*.py -x -n auto --tb=short

# Full backend regression
cd backend && python -m pytest -x -n auto --tb=short

# Frontend
cd frontend && npx vitest run

# TypeScript
cd frontend && npx tsc --noEmit
```

### Manual UAT Steps (Phase 6A)

1. Launch app, load a video, add hue_shift effect
2. Click "Add Operator" → LFO. Verify LFO card appears in operator rack.
3. Set LFO to sine, 1Hz, depth 100%. Add mapping: hue_shift → amount.
4. Press Play — observe hue shifting cyclically with LFO.
5. Change waveform to square — observe binary switching.
6. Change rate to 0.1Hz — observe slow cycle.
7. Add second LFO → same param — observe additive modulation.
8. Add envelope operator, manual trigger, A=10 D=5 S=0.7 R=20.
9. Click trigger button — observe envelope-shaped modulation.
10. Add step sequencer, 8 steps, varied values — observe stepped modulation.
11. Save project (Cmd+S), close, reopen → operators restored.
12. Cmd+Z after adding operator → operator removed.
13. New project (Cmd+N) → operators cleared.
14. Disable operator → modulation stops. Re-enable → resumes.

---

## Design Rationale

### 1. Backend Signal Evaluation (if DG-2 = backend)

All operator evaluation in Python. Reasons:
- Video analyzer MUST be in backend (needs frame data)
- Audio follower MUST be in backend (needs PCM data)
- Consistency: all operators in one place, one language
- LFO/envelope/step math is trivial in Python (~0.001ms per evaluation)
- Single state machine, single evaluation point per frame
- No additional IPC round-trip (piggybacks on render_frame)

### 2. Operator ≠ Effect

Operators generate 0.0-1.0 control signals. They don't process pixels. They are NOT in the effect chain and don't count toward SEC-7's 10-effect limit. This matches the modular synth paradigm: CV/modulation sources are separate from audio processors.

### 3. Processing Chain (Post-Extraction)

Every operator's raw output goes through an optional processing chain before routing. This is the equivalent of a "signal shaping" section on a modular synth. It keeps the individual operator types simple (they just generate raw signals) while allowing complex behavior through composition.

### 4. Routing Resolution in Backend

The backend resolves all routings in a single pass before `apply_chain()`. This means the effect chain received by `apply_chain()` already has modulated parameter values. Effects don't know or care about modulation — they just see param values. Clean separation.
