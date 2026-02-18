# Phase 6: Operators + Modulation

> LFO, envelope, sidechain, audio-reactive — make everything move.
> **Goal:** Parameters can be modulated by signals. The DAW is alive.
> **Sessions:** 4-5
> **Depends on:** Phase 2A (parameter UX), Phase 2B (audio pipeline for audio-reactive)
> **Architecture ref:** SIGNAL-ARCHITECTURE.md (all 4 layers), DATA-SCHEMAS.md §6 (Operator, ModulationRoute)

---

## Acceptance Criteria

1. LFO operator: sine, saw, square, triangle, random, noise, S&H waveforms
2. LFO parameters: rate (0.01-50 Hz), depth (0-100%), phase offset, sync-to-BPM toggle
3. Envelope operator: ADSR (attack/decay/sustain/release in frames), manual or threshold trigger
4. Video Analyzer operator: extracts luminance, motion, color channel, edge density, histogram peak
5. Audio Follower operator: extracts RMS amplitude, frequency band energy, onset detection
6. Step Sequencer operator: programmable 16-step grid, per-step value (0.0-1.0)
7. Multimodal Fusion operator: weighted blend of 2+ signals (add, multiply, max, min, average)
8. One-to-many routing: one operator → multiple effect params with independent depth/range/curve
9. Many-to-one routing: multiple operators → one param with blend mode
10. Ghost Handle on knobs: ghost ring shows actual value after modulation (from Phase 2A)
11. DAG enforcement: UI greys out routing options that would create cycles
12. Signal processing chain: threshold → ADSR → smooth → quantize → invert → scale (per operator)
13. Video analysis on 64x64 proxy (not full frame) — performance requirement
14. Modulation Matrix panel: grid view showing all active routings

---

## Deliverables

### Operator UI
```
frontend/src/renderer/components/operators/
├── OperatorRack.tsx       # Horizontal chain of operators (like Effect Rack)
├── LFOEditor.tsx          # Waveform selector, rate knob, depth, phase
├── EnvelopeEditor.tsx     # ADSR curve editor
├── AnalyzerEditor.tsx     # Source selector (video/audio), extraction method
├── StepSequencerEditor.tsx # 16-step grid
├── FusionEditor.tsx       # Source inputs + weight sliders + blend mode
├── ModulationMatrix.tsx   # Grid: operators (rows) × params (cols) → depth cells
└── RoutingLine.tsx        # SVG line connecting operator output to param knob
```

### Signal Engine (backend)
```
backend/src/signal/
├── lfo.py                 # LFO evaluation (all 7 waveforms)
├── envelope.py            # ADSR state machine
├── video_analyzer.py      # Frame extraction (luminance, motion, color, edges, histogram)
├── audio_follower.py      # PCM analysis (RMS, frequency band, onset)
├── step_sequencer.py      # Step grid evaluation
├── fusion.py              # Weighted signal combination
├── signal_processor.py    # Processing chain (threshold, smooth, quantize, etc.)
├── routing.py             # Resolve all routings, DAG check, many-to-one blend
└── proxy.py               # 64x64 downscale for video analysis
```

```python
class SignalEngine:
    def evaluate_all(self, operators: list[Operator], frame: np.ndarray,
                     audio_pcm: np.ndarray | None, frame_index: int,
                     state: dict) -> tuple[dict[str, float], dict]:
        """
        Evaluate all operators for current frame.
        Returns: ({operator_id: signal_value}, new_state)
        """
        results = {}
        proxy = cv2.resize(frame, (64, 64))  # Always analyze proxy
        for op in operators:
            value, state[op.id] = self._evaluate_one(op, proxy, audio_pcm, frame_index, state.get(op.id))
            results[op.id] = self._process_signal(value, op.processing_chain)
        return results, state
```

### IPC Commands (additions)
```python
# New commands in zmq_server.py
"evaluate_signals":  # {operators, frame_index} → {operator_id: value}
"check_dag":         # {routing, new_edge} → {is_valid: bool}
```

### Zustand Store
```
frontend/src/renderer/stores/
└── operators.ts           # Operator instances, routings, modulation matrix
```

### Testing
- LFO: sine at 1Hz → value cycles 0→1→0 in 30 frames (at 30fps)
- LFO: square wave → binary flip at correct rate
- Envelope: ADSR with A=5, D=5, S=0.7, R=10 → correct curve shape
- Video Analyzer: solid white frame → luminance = 1.0
- Video Analyzer: static frames → motion = 0.0
- Audio Follower: silence → RMS = 0.0
- Routing: one LFO → two params → both modulated independently
- DAG: A→B→C, attempt C→A → rejected
- Signal Processing: threshold 0.5 + value 0.3 → output 0.0
- Fusion: two signals (0.6, 0.4) with weights (0.5, 0.5) → 0.5

---

## NOT in Phase 6

- No automation lanes (Phase 7 — automation is timeline-based, operators are free-running)
- No MIDI input for operators (Phase 9)
- No macro knob mapping (Phase 10)
- No performance-triggered envelopes (Phase 9 — keyboard/MIDI triggers)
