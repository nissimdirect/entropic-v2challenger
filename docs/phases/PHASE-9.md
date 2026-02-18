# Phase 9: Full Perform + MIDI

> MIDI input, 8x8 drum rack, retro-capture, performance recording.
> **Goal:** Entropic is a live performance instrument, not just an editor.
> **Sessions:** 3-4
> **Depends on:** Phase 5 (basic performance), Phase 4 (timeline for recording)
> **Architecture ref:** DATA-SCHEMAS.md §5 (PerformanceEvent, Pad, DrumRack)

---

## Acceptance Criteria

1. MIDI input: select MIDI device, note-on/note-off triggers pads
2. MIDI velocity: maps to pad envelope depth (0.0-1.0)
3. MIDI CC: map CC numbers to any effect parameter
4. 8x8 drum rack mode (expanded from 4x4 in Phase 5)
5. Drum rack pages: switch between banks of 64 pads
6. Performance track: dedicated timeline track type showing trigger events as blocks
7. Performance recording: arm track → play → keyboard/MIDI triggers recorded to timeline
8. Retro-capture: buffer last N seconds of triggers, retroactively write to timeline (like Ableton's capture)
9. Retro-capture buffer: 60 seconds of trigger history (configurable)
10. Performance clips: editable like audio clips — move, trim, delete triggers
11. Performance quantize: snap triggers to beat grid (1/4, 1/8, 1/16, 1/32, off)
12. MIDI learn: click param → press MIDI knob → param mapped to CC
13. MIDI note → operator trigger: note-on triggers envelope operator attack

---

## Deliverables

### MIDI Interface
```
frontend/native/
├── src/
│   └── midi.cc             # PortMIDI device enumeration + input callback (~200 LOC)
└── index.d.ts              # Add MIDI API types
```

```typescript
interface MIDIEngine {
  listDevices(): MIDIDevice[];
  openDevice(deviceId: number): void;
  closeDevice(): void;
  onNoteOn(callback: (note: number, velocity: number, channel: number) => void): void;
  onNoteOff(callback: (note: number, channel: number) => void): void;
  onCC(callback: (cc: number, value: number, channel: number) => void): void;
}
```

### Expanded Pad Grid
```
frontend/src/renderer/components/performance/
├── PadGrid.tsx            # Updated: support 4x4 and 8x8 modes
├── DrumRackEditor.tsx     # Bank switching, pad assignment
├── MIDILearn.tsx          # Click-to-learn overlay
├── MIDISettings.tsx       # Device selection, channel filter
└── PerformanceTrack.tsx   # Timeline track showing trigger blocks
```

### Performance Recording
```
frontend/src/renderer/stores/
└── performance.ts         # Updated: recording state, retro-capture buffer, quantize

frontend/src/renderer/utils/
├── retro-capture.ts       # Ring buffer of last 60s of trigger events
└── quantize.ts            # Snap events to beat grid
```

```typescript
class RetroCaptureBuffer {
  private buffer: PerformanceEvent[] = [];
  private maxDuration = 60; // seconds

  push(event: PerformanceEvent): void {
    this.buffer.push(event);
    // Prune events older than maxDuration from current time
    const cutoff = event.time - this.maxDuration;
    this.buffer = this.buffer.filter(e => e.time >= cutoff);
  }

  capture(): PerformanceEvent[] {
    // Return all buffered events and clear
    const events = [...this.buffer];
    this.buffer = [];
    return events;
  }
}
```

### IPC Commands (additions)
```python
# New commands in zmq_server.py
"midi_note_trigger":  # {pad_id, velocity, action: "on"|"off"} → ack
"midi_cc_update":     # {cc_number, value, mapping} → ack
```

### Testing
- MIDI note-on → pad activates with correct velocity
- MIDI note-off → pad deactivates
- MIDI CC → mapped parameter changes
- 8x8 grid: all 64 pads addressable
- Recording: arm + play + triggers → events on timeline
- Retro-capture: play without arm → press capture → last 60s written to timeline
- Quantize: event at 0.13s with 1/4 grid at 120BPM (0.5s) → snaps to 0.0s
- Performance clip: drag to move, trim edges
- MIDI learn: click param → play note → param mapped

---

## NOT in Phase 9

- No MIDI output (sending MIDI to other devices — post-launch)
- No MIDI clock sync (sync to external sequencer — post-launch)
- No MPE (MIDI Polyphonic Expression — post-launch)
- No OSC input (post-launch)
