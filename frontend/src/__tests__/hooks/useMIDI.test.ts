import { describe, it, expect, beforeEach } from 'vitest';
import { useMIDIStore } from '../../renderer/stores/midi';
import { usePerformanceStore } from '../../renderer/stores/performance';
import { useUndoStore } from '../../renderer/stores/undo';

// Mock MIDI API setup helper
function createMockMIDIAccess() {
  const mockInput = {
    id: 'input-1',
    name: 'Test Controller',
    manufacturer: 'Test Corp',
    state: 'connected' as MIDIPortDeviceState,
    onmidimessage: null as ((e: MIDIMessageEvent) => void) | null,
  };

  const inputs = new Map([['input-1', mockInput]]);

  const mockAccess = {
    inputs,
    onstatechange: null as (() => void) | null,
  };

  return { mockAccess, mockInput };
}

describe('useMIDI hook — store integration', () => {
  beforeEach(() => {
    useMIDIStore.getState().resetMIDI();
    useMIDIStore.setState({
      devices: [],
      activeDeviceId: null,
      isSupported: false,
    });
  });

  it('store starts with isSupported false', () => {
    expect(useMIDIStore.getState().isSupported).toBe(false);
  });

  it('setDevices populates device list', () => {
    const { mockAccess } = createMockMIDIAccess();
    const devices = Array.from(mockAccess.inputs.values()).map((input) => ({
      id: input.id,
      name: input.name,
      manufacturer: input.manufacturer,
      state: input.state,
    }));

    useMIDIStore.getState().setDevices(devices);
    expect(useMIDIStore.getState().devices).toHaveLength(1);
    expect(useMIDIStore.getState().devices[0].name).toBe('Test Controller');
  });

  it('setActiveDevice sets device id', () => {
    useMIDIStore.getState().setActiveDevice('input-1');
    expect(useMIDIStore.getState().activeDeviceId).toBe('input-1');
  });

  it('setActiveDevice null clears selection', () => {
    useMIDIStore.getState().setActiveDevice('input-1');
    useMIDIStore.getState().setActiveDevice(null);
    expect(useMIDIStore.getState().activeDeviceId).toBeNull();
  });

  it('setIsSupported updates flag', () => {
    useMIDIStore.getState().setIsSupported(true);
    expect(useMIDIStore.getState().isSupported).toBe(true);
  });

  it('multiple devices can be set', () => {
    useMIDIStore.getState().setDevices([
      { id: 'a', name: 'Device A', manufacturer: 'Test', state: 'connected' },
      { id: 'b', name: 'Device B', manufacturer: 'Test', state: 'connected' },
    ]);
    expect(useMIDIStore.getState().devices).toHaveLength(2);
  });

  it('handleMIDIMessage processes note-on correctly', () => {
    usePerformanceStore.getState().resetDrumRack();
    useUndoStore.getState().clear();
    usePerformanceStore.getState().updatePad('pad-0', { midiNote: 60 });

    useMIDIStore.getState().setIsSupported(true);
    useMIDIStore.getState().handleMIDIMessage(new Uint8Array([0x90, 60, 100]), 0);

    const padState = usePerformanceStore.getState().padStates['pad-0'];
    expect(padState).toBeDefined();
    expect(padState.phase).toBe('attack');
  });

  it('cleanup resets learn target', () => {
    useMIDIStore.getState().setLearnTarget({ type: 'pad', padId: 'pad-0' });
    expect(useMIDIStore.getState().learnTarget).not.toBeNull();

    useMIDIStore.getState().resetMIDI();
    expect(useMIDIStore.getState().learnTarget).toBeNull();
  });
});
