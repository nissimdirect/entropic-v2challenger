/**
 * MIDI integration edge-case tests.
 * Verifies cross-store interactions between MIDI store and performance store
 * for scenarios not covered by the unit tests in midi.test.ts.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useMIDIStore } from '../../renderer/stores/midi';
import { usePerformanceStore } from '../../renderer/stores/performance';
import { useUndoStore } from '../../renderer/stores/undo';

function resetStores() {
  useMIDIStore.getState().resetMIDI();
  usePerformanceStore.getState().resetDrumRack();
  useUndoStore.getState().clear();
  useMIDIStore.setState({
    devices: [],
    activeDeviceId: null,
    isSupported: true,
  });
}

/** Build a 3-byte MIDI message. */
function msg(status: number, byte1: number, byte2: number): Uint8Array {
  return new Uint8Array([status, byte1, byte2]);
}

/** Directly set pad fields without going through undo (test-only shortcut). */
function setPadDirect(padId: string, updates: Record<string, unknown>) {
  const { drumRack } = usePerformanceStore.getState();
  const idx = drumRack.pads.findIndex((p) => p.id === padId);
  if (idx === -1) throw new Error(`Pad ${padId} not found`);
  const pads = [...drumRack.pads];
  pads[idx] = { ...pads[idx], ...updates };
  usePerformanceStore.setState({ drumRack: { ...drumRack, pads } });
}

describe('MIDI Integration Edge Cases', () => {
  beforeEach(resetStores);

  // ---------------------------------------------------------------
  // 1. MIDI note-on + keyboard trigger coexist
  // ---------------------------------------------------------------
  it('pad with both keyBinding and midiNote triggers via MIDI note-on', () => {
    // pad-0 already has keyBinding='Digit1' by default; add midiNote=60
    setPadDirect('pad-0', { midiNote: 60 });

    const pad = usePerformanceStore.getState().drumRack.pads[0];
    expect(pad.keyBinding).toBe('Digit1'); // still has key binding
    expect(pad.midiNote).toBe(60);

    // Trigger via MIDI
    useMIDIStore.getState().handleMIDIMessage(msg(0x90, 60, 100), 0);

    const state = usePerformanceStore.getState().padStates['pad-0'];
    expect(state).toBeDefined();
    expect(state.phase).toBe('attack');
  });

  // ---------------------------------------------------------------
  // 2. Learn mode steal: assigning midiNote already on another pad
  // ---------------------------------------------------------------
  it('learn mode steals midiNote from existing pad', () => {
    // pad-0 has midiNote=60
    setPadDirect('pad-0', { midiNote: 60 });

    // Enter learn for pad-1
    useMIDIStore.getState().setLearnTarget({ type: 'pad', padId: 'pad-1' });

    // Send note-on 60 during learn
    useMIDIStore.getState().handleMIDIMessage(msg(0x90, 60, 100), 0);

    const pads = usePerformanceStore.getState().drumRack.pads;
    expect(pads[1].midiNote).toBe(60); // pad-1 got note 60
    expect(pads[0].midiNote).toBeNull(); // pad-0 cleared (stolen)
    expect(useMIDIStore.getState().learnTarget).toBeNull(); // learn exited
  });

  // ---------------------------------------------------------------
  // 3. CC flood: rapid CC messages only keep latest value
  // ---------------------------------------------------------------
  it('rapid CC flood keeps only the latest value', () => {
    const ccNumber = 74;

    for (let i = 0; i < 100; i++) {
      useMIDIStore.getState().handleMIDIMessage(msg(0xb0, ccNumber, i), i);
    }

    const ccValues = useMIDIStore.getState().ccValues;
    // Last message had value 99
    expect(ccValues[ccNumber]).toBeCloseTo(99 / 127, 4);
    // Only one key for this CC number (object property, so inherently one entry)
    expect(ccValues[ccNumber]).toBeDefined();
  });

  // ---------------------------------------------------------------
  // 4. Note-on with no pads having midiNote -- no crash
  // ---------------------------------------------------------------
  it('note-on with no matching midiNote causes no crash', () => {
    // All pads have midiNote=null by default
    const allNull = usePerformanceStore.getState().drumRack.pads.every(
      (p) => p.midiNote === null,
    );
    expect(allNull).toBe(true);

    // Should not throw
    expect(() => {
      useMIDIStore.getState().handleMIDIMessage(msg(0x90, 60, 127), 0);
    }).not.toThrow();

    // No pad triggered
    const states = usePerformanceStore.getState().padStates;
    const activeCount = Object.values(states).filter(
      (s) => s.phase !== 'idle',
    ).length;
    expect(activeCount).toBe(0);
  });

  // ---------------------------------------------------------------
  // 5. Multiple CCs to different effects
  // ---------------------------------------------------------------
  it('multiple CC numbers update independently', () => {
    // Map CC1 to effect-A.amount, CC2 to effect-B.rate
    useMIDIStore.getState().addCCMapping({
      cc: 1,
      effectId: 'effect-A',
      paramKey: 'amount',
    });
    useMIDIStore.getState().addCCMapping({
      cc: 2,
      effectId: 'effect-B',
      paramKey: 'rate',
    });

    // Send CC1 with value 64
    useMIDIStore.getState().handleMIDIMessage(msg(0xb0, 1, 64), 0);
    // Send CC2 with value 100
    useMIDIStore.getState().handleMIDIMessage(msg(0xb0, 2, 100), 1);

    const ccValues = useMIDIStore.getState().ccValues;
    expect(ccValues[1]).toBeCloseTo(64 / 127, 4);
    expect(ccValues[2]).toBeCloseTo(100 / 127, 4);

    // Both mappings still present
    const mappings = useMIDIStore.getState().ccMappings;
    expect(mappings).toHaveLength(2);
    expect(mappings.find((m) => m.cc === 1)?.effectId).toBe('effect-A');
    expect(mappings.find((m) => m.cc === 2)?.effectId).toBe('effect-B');
  });

  // ---------------------------------------------------------------
  // 6. One-shot mode: MIDI note-off starts release
  // ---------------------------------------------------------------
  it('one-shot pad: MIDI note-off triggers release phase', () => {
    setPadDirect('pad-0', { midiNote: 60, mode: 'one-shot' });

    // Note-on
    useMIDIStore.getState().handleMIDIMessage(msg(0x90, 60, 100), 0);
    expect(usePerformanceStore.getState().padStates['pad-0'].phase).toBe(
      'attack',
    );

    // Note-off
    useMIDIStore.getState().handleMIDIMessage(msg(0x80, 60, 0), 5);
    expect(usePerformanceStore.getState().padStates['pad-0'].phase).toBe(
      'release',
    );
  });

  // ---------------------------------------------------------------
  // 7. Choke group interaction with MIDI
  // ---------------------------------------------------------------
  it('MIDI triggers respect choke groups', () => {
    // pad-0 (midiNote=60, chokeGroup=1), pad-1 (midiNote=61, chokeGroup=1)
    setPadDirect('pad-0', { midiNote: 60, chokeGroup: 1 });
    setPadDirect('pad-1', { midiNote: 61, chokeGroup: 1 });

    // Trigger pad-0 via MIDI
    useMIDIStore.getState().handleMIDIMessage(msg(0x90, 60, 100), 0);
    expect(usePerformanceStore.getState().padStates['pad-0'].phase).toBe(
      'attack',
    );

    // Trigger pad-1 via MIDI — should choke pad-0
    useMIDIStore.getState().handleMIDIMessage(msg(0x90, 61, 100), 1);
    expect(usePerformanceStore.getState().padStates['pad-0'].phase).toBe(
      'idle',
    );
    expect(usePerformanceStore.getState().padStates['pad-1'].phase).toBe(
      'attack',
    );
  });

  // ---------------------------------------------------------------
  // 8. Channel filter blocks learn mode
  // ---------------------------------------------------------------
  it('channel filter blocks learn mode on wrong channel', () => {
    // Filter to channel 0 only
    useMIDIStore.getState().setChannelFilter(0);

    // Enter learn for pad-2
    useMIDIStore.getState().setLearnTarget({ type: 'pad', padId: 'pad-2' });

    // Send note-on on channel 5 (0x95)
    useMIDIStore.getState().handleMIDIMessage(msg(0x95, 72, 100), 0);

    // Learn NOT activated — target still set, pad unchanged
    expect(useMIDIStore.getState().learnTarget).not.toBeNull();
    expect(usePerformanceStore.getState().drumRack.pads[2].midiNote).toBeNull();
  });

  // ---------------------------------------------------------------
  // 9. resetMIDI does not affect performance store pad states
  // ---------------------------------------------------------------
  it('resetMIDI clears MIDI state but leaves pad states untouched', () => {
    // Set up: pad with midiNote, trigger via MIDI, add CC mapping
    setPadDirect('pad-0', { midiNote: 60 });
    useMIDIStore.getState().addCCMapping({
      cc: 1,
      effectId: 'e1',
      paramKey: 'amount',
    });
    useMIDIStore.getState().handleMIDIMessage(msg(0xb0, 1, 64), 0);

    // Trigger pad via MIDI
    useMIDIStore.getState().handleMIDIMessage(msg(0x90, 60, 100), 0);
    expect(usePerformanceStore.getState().padStates['pad-0'].phase).toBe(
      'attack',
    );

    // Reset MIDI
    useMIDIStore.getState().resetMIDI();

    // MIDI state cleared
    expect(useMIDIStore.getState().ccMappings).toHaveLength(0);
    expect(Object.keys(useMIDIStore.getState().ccValues)).toHaveLength(0);
    expect(useMIDIStore.getState().learnTarget).toBeNull();
    expect(useMIDIStore.getState().channelFilter).toBeNull();

    // Pad state still active (not touched by resetMIDI)
    expect(usePerformanceStore.getState().padStates['pad-0'].phase).toBe(
      'attack',
    );
  });

  // ---------------------------------------------------------------
  // 10. CC value 0 and 127 normalize correctly
  // ---------------------------------------------------------------
  it('CC value 0 normalizes to exactly 0', () => {
    useMIDIStore.getState().handleMIDIMessage(msg(0xb0, 10, 0), 0);
    expect(useMIDIStore.getState().ccValues[10]).toBe(0);
  });

  it('CC value 127 normalizes to exactly 1', () => {
    useMIDIStore.getState().handleMIDIMessage(msg(0xb0, 10, 127), 0);
    expect(useMIDIStore.getState().ccValues[10]).toBe(1);
  });
});
