import { describe, it, expect, beforeEach } from 'vitest';
import { midiNoteToName } from '../../../shared/midi-utils';
import { useMIDIStore } from '../../../renderer/stores/midi';
import { usePerformanceStore } from '../../../renderer/stores/performance';

/**
 * Reset stores before each test.
 */
beforeEach(() => {
  useMIDIStore.getState().resetMIDI();
  // Reset pad midiNotes
  const pads = usePerformanceStore.getState().drumRack.pads;
  for (const pad of pads) {
    if (pad.midiNote !== null) {
      usePerformanceStore.getState().updatePad(pad.id, { midiNote: null });
    }
  }
});

// Helper: build a MIDI message Uint8Array
function midiMsg(status: number, byte1: number, byte2: number): Uint8Array {
  return new Uint8Array([status, byte1, byte2]);
}

describe('midiNoteToName', () => {
  it('converts middle C (60) to C4', () => {
    expect(midiNoteToName(60)).toBe('C4');
  });

  it('converts A0 (21) correctly', () => {
    expect(midiNoteToName(21)).toBe('A0');
  });

  it('converts G9 (127) correctly', () => {
    expect(midiNoteToName(127)).toBe('G9');
  });

  it('converts note 0 to C-1', () => {
    expect(midiNoteToName(0)).toBe('C-1');
  });

  it('returns ? for negative values', () => {
    expect(midiNoteToName(-1)).toBe('?');
  });

  it('returns ? for values above 127', () => {
    expect(midiNoteToName(128)).toBe('?');
  });

  it('returns ? for non-integer values', () => {
    expect(midiNoteToName(60.5)).toBe('?');
  });

  it('returns ? for NaN', () => {
    expect(midiNoteToName(NaN)).toBe('?');
  });
});

describe('MIDI Learn mode', () => {
  it('pad learn assigns midiNote on note-on', () => {
    const pads = usePerformanceStore.getState().drumRack.pads;
    const padId = pads[0].id;

    useMIDIStore.getState().setLearnTarget({ type: 'pad', padId });
    expect(useMIDIStore.getState().learnTarget).not.toBeNull();

    // Send note-on for note 60, velocity 100
    useMIDIStore.getState().handleMIDIMessage(midiMsg(0x90, 60, 100), 0);

    // Learn target should be cleared
    expect(useMIDIStore.getState().learnTarget).toBeNull();

    // Pad should have midiNote = 60
    const updatedPad = usePerformanceStore.getState().drumRack.pads.find((p) => p.id === padId);
    expect(updatedPad?.midiNote).toBe(60);
  });

  it('pad learn steals midiNote from another pad', () => {
    const pads = usePerformanceStore.getState().drumRack.pads;
    const pad0Id = pads[0].id;
    const pad1Id = pads[1].id;

    // Assign note 60 to pad 0
    usePerformanceStore.getState().updatePad(pad0Id, { midiNote: 60 });

    // Now learn note 60 on pad 1
    useMIDIStore.getState().setLearnTarget({ type: 'pad', padId: pad1Id });
    useMIDIStore.getState().handleMIDIMessage(midiMsg(0x90, 60, 100), 0);

    // pad 0 should have midiNote cleared
    const updatedPad0 = usePerformanceStore.getState().drumRack.pads.find((p) => p.id === pad0Id);
    expect(updatedPad0?.midiNote).toBeNull();

    // pad 1 should have midiNote 60
    const updatedPad1 = usePerformanceStore.getState().drumRack.pads.find((p) => p.id === pad1Id);
    expect(updatedPad1?.midiNote).toBe(60);
  });

  it('CC learn creates CC mapping when CC message received', () => {
    useMIDIStore.getState().setLearnTarget({
      type: 'cc',
      effectId: 'effect-1',
      paramKey: 'amount',
    });

    // Send CC #7, value 64
    useMIDIStore.getState().handleMIDIMessage(midiMsg(0xb0, 7, 64), 0);

    expect(useMIDIStore.getState().learnTarget).toBeNull();
    expect(useMIDIStore.getState().ccMappings).toHaveLength(1);
    expect(useMIDIStore.getState().ccMappings[0]).toEqual({
      cc: 7,
      effectId: 'effect-1',
      paramKey: 'amount',
    });
  });

  it('cancel clears learnTarget', () => {
    useMIDIStore.getState().setLearnTarget({ type: 'pad', padId: 'pad-1' });
    expect(useMIDIStore.getState().learnTarget).not.toBeNull();

    useMIDIStore.getState().setLearnTarget(null);
    expect(useMIDIStore.getState().learnTarget).toBeNull();
  });

  it('note-off does not assign midiNote (only note-on with velocity > 0)', () => {
    const pads = usePerformanceStore.getState().drumRack.pads;
    const padId = pads[0].id;

    useMIDIStore.getState().setLearnTarget({ type: 'pad', padId });

    // Send note-off (0x80)
    useMIDIStore.getState().handleMIDIMessage(midiMsg(0x80, 60, 0), 0);

    // Learn target should still be active
    expect(useMIDIStore.getState().learnTarget).not.toBeNull();

    // Pad should NOT have midiNote assigned
    const updatedPad = usePerformanceStore.getState().drumRack.pads.find((p) => p.id === padId);
    expect(updatedPad?.midiNote).toBeNull();
  });

  it('note-on with velocity 0 does not assign (treated as note-off)', () => {
    const pads = usePerformanceStore.getState().drumRack.pads;
    const padId = pads[0].id;

    useMIDIStore.getState().setLearnTarget({ type: 'pad', padId });

    // Note-on with velocity 0 = note-off
    useMIDIStore.getState().handleMIDIMessage(midiMsg(0x90, 60, 0), 0);

    // Learn target should still be active
    expect(useMIDIStore.getState().learnTarget).not.toBeNull();
  });

  it('CC learn on pad target is ignored (wrong learn type)', () => {
    const pads = usePerformanceStore.getState().drumRack.pads;
    const padId = pads[0].id;

    useMIDIStore.getState().setLearnTarget({ type: 'pad', padId });

    // Send CC message - should be ignored for pad learn
    useMIDIStore.getState().handleMIDIMessage(midiMsg(0xb0, 7, 64), 0);

    // Learn target should still be active (CC ignored for pad learn)
    expect(useMIDIStore.getState().learnTarget).not.toBeNull();
  });

  it('pad learn on CC message is ignored (wrong learn type)', () => {
    useMIDIStore.getState().setLearnTarget({
      type: 'cc',
      effectId: 'effect-1',
      paramKey: 'amount',
    });

    // Send note-on - should be ignored for CC learn
    useMIDIStore.getState().handleMIDIMessage(midiMsg(0x90, 60, 100), 0);

    // Learn target should still be active (note ignored for CC learn)
    expect(useMIDIStore.getState().learnTarget).not.toBeNull();
    expect(useMIDIStore.getState().ccMappings).toHaveLength(0);
  });

  it('CC mapping shows in ccMappings after learn', () => {
    useMIDIStore.getState().setLearnTarget({
      type: 'cc',
      effectId: 'fx-123',
      paramKey: 'freq',
    });

    useMIDIStore.getState().handleMIDIMessage(midiMsg(0xb0, 11, 80), 0);

    const mappings = useMIDIStore.getState().ccMappings;
    expect(mappings).toHaveLength(1);
    expect(mappings[0].cc).toBe(11);
    expect(mappings[0].effectId).toBe('fx-123');
    expect(mappings[0].paramKey).toBe('freq');
  });

  it('learn consumes message (does not trigger pad)', () => {
    const pads = usePerformanceStore.getState().drumRack.pads;
    const pad0Id = pads[0].id;
    const pad1Id = pads[1].id;

    // Assign note 60 to pad 0
    usePerformanceStore.getState().updatePad(pad0Id, { midiNote: 60 });

    // Start learn for pad 1
    useMIDIStore.getState().setLearnTarget({ type: 'pad', padId: pad1Id });

    // Send note-on for note 60 — should be consumed by learn, not trigger pad 0
    useMIDIStore.getState().handleMIDIMessage(midiMsg(0x90, 60, 100), 0);

    // Pad 0 should NOT be triggered (phase should be idle)
    const state = usePerformanceStore.getState().padStates[pad0Id];
    const phase = state?.phase ?? 'idle';
    expect(phase).toBe('idle');
  });
});
