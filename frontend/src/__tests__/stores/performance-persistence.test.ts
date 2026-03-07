import { describe, it, expect, beforeEach } from 'vitest';
import { usePerformanceStore } from '../../renderer/stores/performance';
import { useUndoStore } from '../../renderer/stores/undo';
import type { DrumRack, Pad } from '../../shared/types';

function resetStores() {
  usePerformanceStore.getState().resetDrumRack();
  useUndoStore.getState().clear();
}

function makeTestPad(overrides: Partial<Pad> = {}): Pad {
  return {
    id: 'test-pad-1',
    label: 'Kick',
    keyBinding: 'KeyQ',
    mode: 'toggle',
    chokeGroup: 3,
    envelope: { attack: 10, decay: 5, sustain: 0.8, release: 20 },
    mappings: [{
      sourceId: 'test-pad-1',
      depth: 0.75,
      min: 0,
      max: 360,
      curve: 'linear',
      effectId: 'effect-1',
      paramKey: 'amount',
    }],
    color: '#ff0000',
    ...overrides,
  };
}

describe('Performance Persistence', () => {
  beforeEach(resetStores);

  it('round-trip: loadDrumRack preserves all pad fields', () => {
    const testPad = makeTestPad();
    const rack: DrumRack = { grid: '4x4', pads: [testPad] };

    usePerformanceStore.getState().loadDrumRack(rack);
    const loaded = usePerformanceStore.getState().drumRack;

    expect(loaded.grid).toBe('4x4');
    expect(loaded.pads).toHaveLength(1);

    const pad = loaded.pads[0];
    expect(pad.id).toBe('test-pad-1');
    expect(pad.label).toBe('Kick');
    expect(pad.keyBinding).toBe('KeyQ');
    expect(pad.mode).toBe('toggle');
    expect(pad.chokeGroup).toBe(3);
    expect(pad.color).toBe('#ff0000');
  });

  it('ADSR values preserved on load', () => {
    const rack: DrumRack = {
      grid: '4x4',
      pads: [makeTestPad({ envelope: { attack: 15, decay: 8, sustain: 0.6, release: 30 } })],
    };

    usePerformanceStore.getState().loadDrumRack(rack);
    const env = usePerformanceStore.getState().drumRack.pads[0].envelope;

    expect(env.attack).toBe(15);
    expect(env.decay).toBe(8);
    expect(env.sustain).toBeCloseTo(0.6);
    expect(env.release).toBe(30);
  });

  it('pad mappings preserved on load', () => {
    const rack: DrumRack = { grid: '4x4', pads: [makeTestPad()] };

    usePerformanceStore.getState().loadDrumRack(rack);
    const mappings = usePerformanceStore.getState().drumRack.pads[0].mappings;

    expect(mappings).toHaveLength(1);
    expect(mappings[0].effectId).toBe('effect-1');
    expect(mappings[0].paramKey).toBe('amount');
    expect(mappings[0].depth).toBe(0.75);
  });

  it('choke groups preserved on load', () => {
    const rack: DrumRack = { grid: '4x4', pads: [makeTestPad({ chokeGroup: 5 })] };

    usePerformanceStore.getState().loadDrumRack(rack);
    expect(usePerformanceStore.getState().drumRack.pads[0].chokeGroup).toBe(5);
  });

  it('missing drumRack → defaults loaded (backward compat)', () => {
    // Simulate loading a project without drumRack
    usePerformanceStore.getState().resetDrumRack();

    const pads = usePerformanceStore.getState().drumRack.pads;
    expect(pads).toHaveLength(16);
    expect(pads[0].keyBinding).toBe('Digit1');
    expect(pads[0].mode).toBe('gate');
  });

  it('malformed drumRack data → ADSR clamped on load', () => {
    const rack: DrumRack = {
      grid: '4x4',
      pads: [makeTestPad({
        envelope: { attack: -10, decay: 999, sustain: 5, release: NaN },
      })],
    };

    usePerformanceStore.getState().loadDrumRack(rack);
    const env = usePerformanceStore.getState().drumRack.pads[0].envelope;

    expect(env.attack).toBe(0);
    expect(env.decay).toBe(300);
    expect(env.sustain).toBe(1);
    expect(env.release).toBe(0);
  });

  it('loadDrumRack clears padStates', () => {
    usePerformanceStore.getState().triggerPad('pad-0', 0);
    expect(Object.keys(usePerformanceStore.getState().padStates).length).toBeGreaterThan(0);

    const rack: DrumRack = { grid: '4x4', pads: [makeTestPad()] };
    usePerformanceStore.getState().loadDrumRack(rack);

    expect(Object.keys(usePerformanceStore.getState().padStates)).toHaveLength(0);
  });

  it('resetDrumRack resets performance store', () => {
    // Modify state
    usePerformanceStore.getState().updatePad('pad-0', { label: 'Custom' });
    usePerformanceStore.getState().triggerPad('pad-0', 0);
    usePerformanceStore.getState().setPerformMode(true);

    // Reset
    usePerformanceStore.getState().resetDrumRack();

    const state = usePerformanceStore.getState();
    expect(state.drumRack.pads).toHaveLength(16);
    expect(state.drumRack.pads[0].label).toBe('Pad 1');
    expect(state.isPerformMode).toBe(false);
    expect(state.isPadEditorOpen).toBe(false);
    expect(Object.keys(state.padStates)).toHaveLength(0);
  });
});
