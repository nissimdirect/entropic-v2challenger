import { describe, it, expect, beforeEach } from 'vitest';
import { useMIDIStore } from '../../../renderer/stores/midi';

function resetStores() {
  useMIDIStore.getState().resetMIDI();
  useMIDIStore.setState({
    devices: [],
    activeDeviceId: null,
    isSupported: true,
  });
}

describe('MIDI Settings store interactions', () => {
  beforeEach(resetStores);

  // 1. isSupported flag
  it('isSupported defaults to true after reset', () => {
    expect(useMIDIStore.getState().isSupported).toBe(true);
  });

  it('setIsSupported toggles support flag', () => {
    useMIDIStore.getState().setIsSupported(false);
    expect(useMIDIStore.getState().isSupported).toBe(false);
  });

  // 2. Device management
  it('setDevices populates device list', () => {
    const devices = [
      { id: 'dev-1', name: 'Launchpad', manufacturer: 'Novation' },
      { id: 'dev-2', name: 'KeyStep', manufacturer: 'Arturia' },
    ];
    useMIDIStore.getState().setDevices(devices);
    expect(useMIDIStore.getState().devices).toEqual(devices);
    expect(useMIDIStore.getState().devices).toHaveLength(2);
  });

  // 3. setActiveDevice
  it('setActiveDevice updates store', () => {
    useMIDIStore.getState().setActiveDevice('device-1');
    expect(useMIDIStore.getState().activeDeviceId).toBe('device-1');
  });

  it('setActiveDevice null selects all devices', () => {
    useMIDIStore.getState().setActiveDevice('device-1');
    useMIDIStore.getState().setActiveDevice(null);
    expect(useMIDIStore.getState().activeDeviceId).toBeNull();
  });

  // 4-5. Channel filter
  it('channelFilter defaults to null (all channels)', () => {
    expect(useMIDIStore.getState().channelFilter).toBeNull();
  });

  it('setChannelFilter sets numeric channel', () => {
    useMIDIStore.getState().setChannelFilter(5);
    expect(useMIDIStore.getState().channelFilter).toBe(5);
  });

  it('setChannelFilter null resets to all channels', () => {
    useMIDIStore.getState().setChannelFilter(5);
    useMIDIStore.getState().setChannelFilter(null);
    expect(useMIDIStore.getState().channelFilter).toBeNull();
  });

  it('setChannelFilter accepts 0 (channel 1)', () => {
    useMIDIStore.getState().setChannelFilter(0);
    expect(useMIDIStore.getState().channelFilter).toBe(0);
  });

  it('setChannelFilter accepts 15 (channel 16)', () => {
    useMIDIStore.getState().setChannelFilter(15);
    expect(useMIDIStore.getState().channelFilter).toBe(15);
  });

  // 6. CC mapping list
  it('addCCMapping adds mapping to list', () => {
    useMIDIStore.getState().addCCMapping({
      cc: 1,
      effectId: 'fx-1',
      paramKey: 'amount',
    });
    const mappings = useMIDIStore.getState().ccMappings;
    expect(mappings).toHaveLength(1);
    expect(mappings[0]).toEqual({ cc: 1, effectId: 'fx-1', paramKey: 'amount' });
  });

  it('addCCMapping replaces existing mapping for same CC', () => {
    useMIDIStore.getState().addCCMapping({ cc: 1, effectId: 'fx-1', paramKey: 'amount' });
    useMIDIStore.getState().addCCMapping({ cc: 1, effectId: 'fx-2', paramKey: 'rate' });
    const mappings = useMIDIStore.getState().ccMappings;
    expect(mappings).toHaveLength(1);
    expect(mappings[0].effectId).toBe('fx-2');
    expect(mappings[0].paramKey).toBe('rate');
  });

  it('multiple CC mappings for different CCs coexist', () => {
    useMIDIStore.getState().addCCMapping({ cc: 1, effectId: 'fx-1', paramKey: 'amount' });
    useMIDIStore.getState().addCCMapping({ cc: 2, effectId: 'fx-1', paramKey: 'rate' });
    useMIDIStore.getState().addCCMapping({ cc: 74, effectId: 'fx-2', paramKey: 'cutoff' });
    expect(useMIDIStore.getState().ccMappings).toHaveLength(3);
  });

  // 7. Remove mapping
  it('removeCCMapping removes by index', () => {
    useMIDIStore.getState().addCCMapping({ cc: 1, effectId: 'fx-1', paramKey: 'amount' });
    useMIDIStore.getState().addCCMapping({ cc: 2, effectId: 'fx-1', paramKey: 'rate' });
    useMIDIStore.getState().removeCCMapping(0);
    const mappings = useMIDIStore.getState().ccMappings;
    expect(mappings).toHaveLength(1);
    expect(mappings[0].cc).toBe(2);
  });

  it('removeCCMapping ignores invalid index', () => {
    useMIDIStore.getState().addCCMapping({ cc: 1, effectId: 'fx-1', paramKey: 'amount' });
    useMIDIStore.getState().removeCCMapping(5);
    expect(useMIDIStore.getState().ccMappings).toHaveLength(1);
  });

  it('removeCCMapping ignores negative index', () => {
    useMIDIStore.getState().addCCMapping({ cc: 1, effectId: 'fx-1', paramKey: 'amount' });
    useMIDIStore.getState().removeCCMapping(-1);
    expect(useMIDIStore.getState().ccMappings).toHaveLength(1);
  });

  // 8. Clear all mappings
  it('clearCCMappings removes all mappings and ccValues', () => {
    useMIDIStore.getState().addCCMapping({ cc: 1, effectId: 'fx-1', paramKey: 'amount' });
    useMIDIStore.getState().addCCMapping({ cc: 2, effectId: 'fx-1', paramKey: 'rate' });
    useMIDIStore.setState({ ccValues: { 1: 0.5, 2: 0.8 } });
    useMIDIStore.getState().clearCCMappings();
    expect(useMIDIStore.getState().ccMappings).toHaveLength(0);
    expect(useMIDIStore.getState().ccValues).toEqual({});
  });

  // 9. Empty state
  it('ccMappings starts empty after reset', () => {
    expect(useMIDIStore.getState().ccMappings).toHaveLength(0);
  });

  // 10. resetMIDI clears all MIDI state
  it('resetMIDI clears mappings, ccValues, learnTarget, channelFilter', () => {
    useMIDIStore.getState().addCCMapping({ cc: 1, effectId: 'fx-1', paramKey: 'amount' });
    useMIDIStore.getState().setChannelFilter(3);
    useMIDIStore.getState().setLearnTarget({ type: 'cc', effectId: 'fx-1', paramKey: 'amount' });
    useMIDIStore.setState({ ccValues: { 1: 0.5 } });

    useMIDIStore.getState().resetMIDI();

    const state = useMIDIStore.getState();
    expect(state.ccMappings).toHaveLength(0);
    expect(state.ccValues).toEqual({});
    expect(state.learnTarget).toBeNull();
    expect(state.channelFilter).toBeNull();
  });
});
