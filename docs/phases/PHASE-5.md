# Phase 5: Basic Performance

> Keyboard triggers, choke groups — play effects like an instrument.
> **Goal:** You can perform with video in real-time using the keyboard.
> **Sessions:** 2-3
> **Depends on:** Phase 4 (timeline working)
> **Architecture ref:** DATA-SCHEMAS.md §5 (PerformanceEvent, Pad, DrumRack)

---

## Acceptance Criteria

1. Pad grid UI (4x4 default) visible in a dedicated panel
2. Each pad mappable to a keyboard key (QWERTY layout by default)
3. Press key → effect activates (gate mode: active while held)
4. Toggle mode: press once = on, press again = off
5. One-shot mode: press = trigger ADSR envelope, release = start release phase
6. ADSR envelope per pad (attack, decay, sustain, release in frames)
7. Each pad maps to one or more effect params via `ModulationRoute`
8. Choke groups: pads in same group — activating one silences others
9. Velocity: keyboard uses fixed velocity (1.0). MIDI velocity support deferred to Phase 9.
10. Visual feedback: pad lights up when active, dims during release phase

---

## Deliverables

### Pad Grid UI
```
frontend/src/renderer/components/performance/
├── PadGrid.tsx           # 4x4 grid of pads
├── Pad.tsx               # Single pad: label, key binding, active state, color
├── PadEditor.tsx         # Edit mode: set key, mode, choke group, ADSR, mappings
└── useKeyboardTrigger.ts # Global keyboard listener for pad activation
```

### Pad Engine (backend)
```
backend/src/signal/
└── performance.py        # Pad state management, ADSR evaluation, choke logic
```

```python
class PadEngine:
    def evaluate(self, pad_states: dict[str, PadState], frame_index: int) -> dict[str, float]:
        """
        For each active pad, compute its current envelope value.
        Returns: {pad_id: envelope_value (0.0-1.0)}
        """
        results = {}
        for pad_id, state in pad_states.items():
            if state.active:
                results[pad_id] = self._compute_adsr(state, frame_index)
        return results
```

### IPC
- Frontend sends pad events via ZMQ: `{cmd: "pad_event", pad_id, action: "press"|"release"}`
- Python evaluates envelope, applies to mapped params

### Zustand Store
```
frontend/src/renderer/stores/
└── performance.ts        # Pad states, key bindings, choke groups
```

### Testing
- Pad: press → value goes to 1.0 (no ADSR)
- ADSR: attack of 10 frames → value reaches 1.0 after 10 frames
- Choke: activate pad A (group 1) → pad B (group 1) silences
- Gate: hold key → active, release → inactive
- Toggle: press → active, press again → inactive

---

## NOT in Phase 5

- No MIDI input (Phase 9)
- No Drum Rack 8x8 mode (Phase 9)
- No performance recording/retro-capture (Phase 9)
- No performance track in timeline (Phase 9)
- No velocity sensitivity from keyboard (fixed 1.0)
