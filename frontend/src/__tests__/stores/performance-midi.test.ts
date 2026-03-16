import { describe, it, expect, beforeEach } from 'vitest';
import { usePerformanceStore } from '../../renderer/stores/performance';
import { useUndoStore } from '../../renderer/stores/undo';
import type { DrumRack, PadMode } from '../../shared/types';
import { DEFAULT_ADSR } from '../../shared/constants';

function resetStores() {
  usePerformanceStore.getState().resetDrumRack();
  useUndoStore.getState().clear();
}

describe('Performance Store — midiNote field', () => {
  beforeEach(resetStores);

  // --- 1. Default pads have midiNote: null ---

  it('default pads have midiNote === null', () => {
    const { drumRack } = usePerformanceStore.getState();
    expect(drumRack.pads).toHaveLength(16);
    for (const pad of drumRack.pads) {
      expect(pad.midiNote).toBeNull();
    }
  });

  // --- 2. updatePad can set midiNote ---

  it('updatePad sets midiNote to a number', () => {
    usePerformanceStore.getState().updatePad('pad-0', { midiNote: 60 });
    const pad = usePerformanceStore.getState().drumRack.pads[0];
    expect(pad.midiNote).toBe(60);
  });

  // --- 3. updatePad can clear midiNote ---

  it('updatePad clears midiNote back to null', () => {
    usePerformanceStore.getState().updatePad('pad-0', { midiNote: 60 });
    expect(usePerformanceStore.getState().drumRack.pads[0].midiNote).toBe(60);

    usePerformanceStore.getState().updatePad('pad-0', { midiNote: null });
    expect(usePerformanceStore.getState().drumRack.pads[0].midiNote).toBeNull();
  });

  // --- 4. resetDrumRack clears midiNotes ---

  it('resetDrumRack resets midiNote to null', () => {
    usePerformanceStore.getState().updatePad('pad-0', { midiNote: 60 });
    expect(usePerformanceStore.getState().drumRack.pads[0].midiNote).toBe(60);

    usePerformanceStore.getState().resetDrumRack();
    const pad = usePerformanceStore.getState().drumRack.pads[0];
    expect(pad.midiNote).toBeNull();
  });

  // --- 5. loadDrumRack preserves midiNote ---

  it('loadDrumRack preserves midiNote from rack data', () => {
    const rack: DrumRack = {
      grid: '4x4',
      pads: [{
        id: 'pad-0',
        label: 'Kick',
        keyBinding: 'Digit1',
        midiNote: 48,
        mode: 'gate' as PadMode,
        chokeGroup: null,
        envelope: { ...DEFAULT_ADSR },
        mappings: [],
        color: '#4ade80',
      }],
    };

    usePerformanceStore.getState().loadDrumRack(rack);
    const pad = usePerformanceStore.getState().drumRack.pads[0];
    expect(pad.midiNote).toBe(48);
  });

  // --- 6. loadDrumRack handles missing midiNote (backward compat) ---

  it('loadDrumRack handles old format without midiNote field', () => {
    // Simulate old rack data that lacks the midiNote field
    const oldFormatRack = {
      grid: '4x4' as const,
      pads: [{
        id: 'pad-0',
        label: 'Legacy Pad',
        keyBinding: 'Digit1',
        mode: 'gate' as PadMode,
        chokeGroup: null,
        envelope: { ...DEFAULT_ADSR },
        mappings: [],
        color: '#4ade80',
        // no midiNote field
      }],
    };

    // Cast to DrumRack to simulate loading old data
    usePerformanceStore.getState().loadDrumRack(oldFormatRack as unknown as DrumRack);
    const pad = usePerformanceStore.getState().drumRack.pads[0];
    // Field is missing from source data, so it will be undefined
    expect(pad.midiNote).toBeUndefined();
  });

  // --- 7. Undo reverts midiNote change ---

  it('undo reverts midiNote change', () => {
    const padBefore = usePerformanceStore.getState().drumRack.pads[0];
    expect(padBefore.midiNote).toBeNull();

    usePerformanceStore.getState().updatePad('pad-0', { midiNote: 60 });
    expect(usePerformanceStore.getState().drumRack.pads[0].midiNote).toBe(60);

    useUndoStore.getState().undo();
    expect(usePerformanceStore.getState().drumRack.pads[0].midiNote).toBeNull();
  });

  it('redo restores midiNote change', () => {
    usePerformanceStore.getState().updatePad('pad-0', { midiNote: 60 });
    useUndoStore.getState().undo();
    expect(usePerformanceStore.getState().drumRack.pads[0].midiNote).toBeNull();

    useUndoStore.getState().redo();
    expect(usePerformanceStore.getState().drumRack.pads[0].midiNote).toBe(60);
  });
});
