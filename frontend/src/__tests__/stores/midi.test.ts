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

function msg(status: number, byte1: number, byte2: number): Uint8Array {
  return new Uint8Array([status, byte1, byte2]);
}

describe('MIDI Store', () => {
  beforeEach(resetStores);

  // --- Initialization ---

  it('initializes with empty state', () => {
    const state = useMIDIStore.getState();
    expect(state.devices).toHaveLength(0);
    expect(state.activeDeviceId).toBeNull();
    expect(state.channelFilter).toBeNull();
    expect(state.ccMappings).toHaveLength(0);
    expect(Object.keys(state.ccValues)).toHaveLength(0);
    expect(state.learnTarget).toBeNull();
  });

  // --- Channel Filter ---

  it('setChannelFilter restricts channel', () => {
    useMIDIStore.getState().setChannelFilter(0); // channel 1

    // Assign midiNote to pad
    usePerformanceStore.getState().updatePad('pad-0', { midiNote: 60 });

    // Note-on channel 1 (0x90) — should trigger
    useMIDIStore.getState().handleMIDIMessage(msg(0x90, 60, 100), 0);
    expect(usePerformanceStore.getState().padStates['pad-0']?.phase).toBe('attack');

    // Reset
    usePerformanceStore.getState().panicAll();

    // Note-on channel 2 (0x91) — should be filtered
    useMIDIStore.getState().handleMIDIMessage(msg(0x91, 60, 100), 1);
    expect(usePerformanceStore.getState().padStates['pad-0']).toBeUndefined();
  });

  it('null channelFilter accepts all channels', () => {
    useMIDIStore.getState().setChannelFilter(null);
    usePerformanceStore.getState().updatePad('pad-0', { midiNote: 60 });

    // Channel 1
    useMIDIStore.getState().handleMIDIMessage(msg(0x90, 60, 100), 0);
    expect(usePerformanceStore.getState().padStates['pad-0']?.phase).toBe('attack');

    usePerformanceStore.getState().panicAll();

    // Channel 10
    useMIDIStore.getState().handleMIDIMessage(msg(0x99, 60, 100), 1);
    expect(usePerformanceStore.getState().padStates['pad-0']?.phase).toBe('attack');
  });

  // --- Note → Pad Trigger ---

  it('note-on triggers pad with matching midiNote', () => {
    usePerformanceStore.getState().updatePad('pad-0', { midiNote: 60 });

    useMIDIStore.getState().handleMIDIMessage(msg(0x90, 60, 100), 10);
    const state = usePerformanceStore.getState().padStates['pad-0'];
    expect(state).toBeDefined();
    expect(state.phase).toBe('attack');
  });

  it('note-on with no matching pad does nothing', () => {
    usePerformanceStore.getState().updatePad('pad-0', { midiNote: 60 });

    useMIDIStore.getState().handleMIDIMessage(msg(0x90, 61, 100), 10);
    expect(usePerformanceStore.getState().padStates['pad-0']).toBeUndefined();
  });

  it('note-off releases gate-mode pad', () => {
    usePerformanceStore.getState().updatePad('pad-0', { midiNote: 60 });

    // Trigger
    useMIDIStore.getState().handleMIDIMessage(msg(0x90, 60, 100), 0);
    expect(usePerformanceStore.getState().padStates['pad-0'].phase).toBe('attack');

    // Release (0x80 note-off)
    useMIDIStore.getState().handleMIDIMessage(msg(0x80, 60, 0), 5);
    expect(usePerformanceStore.getState().padStates['pad-0'].phase).toBe('release');
  });

  it('velocity 0 note-on treated as note-off', () => {
    usePerformanceStore.getState().updatePad('pad-0', { midiNote: 60 });

    useMIDIStore.getState().handleMIDIMessage(msg(0x90, 60, 100), 0);
    useMIDIStore.getState().handleMIDIMessage(msg(0x90, 60, 0), 5);
    expect(usePerformanceStore.getState().padStates['pad-0'].phase).toBe('release');
  });

  it('toggle mode: note-on toggles pad state', () => {
    usePerformanceStore.getState().updatePad('pad-0', { midiNote: 60, mode: 'toggle' });

    // First note-on → trigger
    useMIDIStore.getState().handleMIDIMessage(msg(0x90, 60, 100), 0);
    expect(usePerformanceStore.getState().padStates['pad-0'].phase).toBe('attack');

    // Second note-on → release
    useMIDIStore.getState().handleMIDIMessage(msg(0x90, 60, 100), 5);
    expect(usePerformanceStore.getState().padStates['pad-0'].phase).toBe('release');
  });

  // --- CC → ccValues ---

  it('CC message updates ccValues', () => {
    useMIDIStore.getState().handleMIDIMessage(msg(0xb0, 1, 64), 0);
    const ccValues = useMIDIStore.getState().ccValues;
    expect(ccValues[1]).toBeCloseTo(64 / 127, 4);
  });

  it('CC 0 normalizes to 0', () => {
    useMIDIStore.getState().handleMIDIMessage(msg(0xb0, 7, 0), 0);
    expect(useMIDIStore.getState().ccValues[7]).toBe(0);
  });

  it('CC 127 normalizes to 1', () => {
    useMIDIStore.getState().handleMIDIMessage(msg(0xb0, 7, 127), 0);
    expect(useMIDIStore.getState().ccValues[7]).toBe(1);
  });

  // --- CC Mappings ---

  it('addCCMapping adds mapping', () => {
    useMIDIStore.getState().addCCMapping({ cc: 1, effectId: 'e1', paramKey: 'amount' });
    expect(useMIDIStore.getState().ccMappings).toHaveLength(1);
    expect(useMIDIStore.getState().ccMappings[0]).toEqual({ cc: 1, effectId: 'e1', paramKey: 'amount' });
  });

  it('addCCMapping replaces mapping with same CC', () => {
    useMIDIStore.getState().addCCMapping({ cc: 1, effectId: 'e1', paramKey: 'amount' });
    useMIDIStore.getState().addCCMapping({ cc: 1, effectId: 'e2', paramKey: 'rate' });

    const mappings = useMIDIStore.getState().ccMappings;
    expect(mappings).toHaveLength(1);
    expect(mappings[0].effectId).toBe('e2');
  });

  it('removeCCMapping removes by index', () => {
    useMIDIStore.getState().addCCMapping({ cc: 1, effectId: 'e1', paramKey: 'amount' });
    useMIDIStore.getState().addCCMapping({ cc: 2, effectId: 'e1', paramKey: 'rate' });
    useMIDIStore.getState().removeCCMapping(0);

    const mappings = useMIDIStore.getState().ccMappings;
    expect(mappings).toHaveLength(1);
    expect(mappings[0].cc).toBe(2);
  });

  it('removeCCMapping ignores invalid index', () => {
    useMIDIStore.getState().addCCMapping({ cc: 1, effectId: 'e1', paramKey: 'amount' });
    useMIDIStore.getState().removeCCMapping(5);
    expect(useMIDIStore.getState().ccMappings).toHaveLength(1);
  });

  it('clearCCMappings resets all', () => {
    useMIDIStore.getState().addCCMapping({ cc: 1, effectId: 'e1', paramKey: 'amount' });
    useMIDIStore.getState().handleMIDIMessage(msg(0xb0, 1, 64), 0);
    useMIDIStore.getState().clearCCMappings();

    expect(useMIDIStore.getState().ccMappings).toHaveLength(0);
    expect(Object.keys(useMIDIStore.getState().ccValues)).toHaveLength(0);
  });

  // --- Learn Mode ---

  it('learn mode: note assigns midiNote to pad', () => {
    useMIDIStore.getState().setLearnTarget({ type: 'pad', padId: 'pad-3' });

    useMIDIStore.getState().handleMIDIMessage(msg(0x90, 48, 100), 0);

    // Should assign and exit learn mode
    const pad = usePerformanceStore.getState().drumRack.pads[3];
    expect(pad.midiNote).toBe(48);
    expect(useMIDIStore.getState().learnTarget).toBeNull();
  });

  it('learn mode: CC creates mapping', () => {
    useMIDIStore.getState().setLearnTarget({ type: 'cc', effectId: 'e1', paramKey: 'amount' });

    useMIDIStore.getState().handleMIDIMessage(msg(0xb0, 7, 64), 0);

    const mappings = useMIDIStore.getState().ccMappings;
    expect(mappings).toHaveLength(1);
    expect(mappings[0]).toEqual({ cc: 7, effectId: 'e1', paramKey: 'amount' });
    expect(useMIDIStore.getState().learnTarget).toBeNull();
  });

  it('learn mode: consumes message (does not also trigger pad)', () => {
    usePerformanceStore.getState().updatePad('pad-0', { midiNote: 60 });
    useMIDIStore.getState().setLearnTarget({ type: 'pad', padId: 'pad-1' });

    // This note-on matches pad-0 but learn is active — should not trigger
    useMIDIStore.getState().handleMIDIMessage(msg(0x90, 60, 100), 0);

    expect(usePerformanceStore.getState().padStates['pad-0']).toBeUndefined();
  });

  it('learn mode: note-off does not assign', () => {
    useMIDIStore.getState().setLearnTarget({ type: 'pad', padId: 'pad-3' });

    // Note-off — should be ignored in learn mode
    useMIDIStore.getState().handleMIDIMessage(msg(0x80, 48, 0), 0);

    expect(usePerformanceStore.getState().drumRack.pads[3].midiNote).toBeNull();
    expect(useMIDIStore.getState().learnTarget).not.toBeNull();
  });

  // --- SysEx / Timing / Unknown Messages ---

  it('SysEx messages are silently ignored', () => {
    usePerformanceStore.getState().updatePad('pad-0', { midiNote: 60 });

    // SysEx (0xF0)
    useMIDIStore.getState().handleMIDIMessage(new Uint8Array([0xf0, 0x7e, 0xf7]), 0);
    expect(usePerformanceStore.getState().padStates['pad-0']).toBeUndefined();
    expect(Object.keys(useMIDIStore.getState().ccValues)).toHaveLength(0);
  });

  it('timing clock (0xF8) is silently ignored', () => {
    useMIDIStore.getState().handleMIDIMessage(new Uint8Array([0xf8, 0x00]), 0);
    expect(Object.keys(useMIDIStore.getState().ccValues)).toHaveLength(0);
  });

  it('short messages (< 2 bytes) are ignored', () => {
    useMIDIStore.getState().handleMIDIMessage(new Uint8Array([0x90]), 0);
    // No crash
  });

  // --- Persistence ---

  it('getMIDIPersistData round-trips with loadMIDIMappings', () => {
    usePerformanceStore.getState().updatePad('pad-0', { midiNote: 60 });
    usePerformanceStore.getState().updatePad('pad-3', { midiNote: 48 });
    useMIDIStore.getState().addCCMapping({ cc: 1, effectId: 'e1', paramKey: 'amount' });
    useMIDIStore.getState().setChannelFilter(5);

    const data = useMIDIStore.getState().getMIDIPersistData();
    expect(data.padMidiNotes['pad-0']).toBe(60);
    expect(data.padMidiNotes['pad-3']).toBe(48);
    expect(data.ccMappings).toHaveLength(1);
    expect(data.channelFilter).toBe(5);

    // Reset and reload
    useMIDIStore.getState().resetMIDI();
    usePerformanceStore.getState().resetDrumRack();

    useMIDIStore.getState().loadMIDIMappings(data);

    expect(useMIDIStore.getState().ccMappings).toHaveLength(1);
    expect(useMIDIStore.getState().channelFilter).toBe(5);
    expect(usePerformanceStore.getState().drumRack.pads[0].midiNote).toBe(60);
    expect(usePerformanceStore.getState().drumRack.pads[3].midiNote).toBe(48);
  });

  it('resetMIDI clears state', () => {
    useMIDIStore.getState().addCCMapping({ cc: 1, effectId: 'e1', paramKey: 'amount' });
    useMIDIStore.getState().handleMIDIMessage(msg(0xb0, 1, 64), 0);
    useMIDIStore.getState().setChannelFilter(3);
    useMIDIStore.getState().setLearnTarget({ type: 'pad', padId: 'pad-0' });

    useMIDIStore.getState().resetMIDI();

    const state = useMIDIStore.getState();
    expect(state.ccMappings).toHaveLength(0);
    expect(Object.keys(state.ccValues)).toHaveLength(0);
    expect(state.channelFilter).toBeNull();
    expect(state.learnTarget).toBeNull();
  });
});
