import { describe, it, expect, beforeEach } from 'vitest';
import { usePerformanceStore } from '../../renderer/stores/performance';
import { useUndoStore } from '../../renderer/stores/undo';
import { DEFAULT_PAD_BINDINGS, RESERVED_KEYS } from '../../shared/constants';

function resetStores() {
  usePerformanceStore.getState().resetDrumRack();
  useUndoStore.getState().clear();
}

describe('Performance Store', () => {
  beforeEach(resetStores);

  // --- Initialization ---

  it('initializes with 16 pads', () => {
    const { drumRack } = usePerformanceStore.getState();
    expect(drumRack.pads).toHaveLength(16);
    expect(drumRack.grid).toBe('4x4');
  });

  it('pads have correct default key bindings', () => {
    const { drumRack } = usePerformanceStore.getState();
    drumRack.pads.forEach((pad, i) => {
      expect(pad.keyBinding).toBe(DEFAULT_PAD_BINDINGS[i]);
    });
  });

  it('pads default to gate mode', () => {
    const { drumRack } = usePerformanceStore.getState();
    drumRack.pads.forEach((pad) => {
      expect(pad.mode).toBe('gate');
    });
  });

  // --- Trigger / Release ---

  it('triggerPad sets phase to attack', () => {
    const store = usePerformanceStore.getState();
    store.triggerPad('pad-0', 100);

    const state = usePerformanceStore.getState().padStates['pad-0'];
    expect(state.phase).toBe('attack');
    expect(state.triggerFrame).toBe(100);
  });

  it('releasePad sets phase to release', () => {
    const store = usePerformanceStore.getState();
    store.triggerPad('pad-0', 0);

    // Need envelope with non-zero attack to have a non-idle state
    usePerformanceStore.getState().releasePad('pad-0', 5);
    const state = usePerformanceStore.getState().padStates['pad-0'];
    expect(state.phase).toBe('release');
    expect(state.releaseFrame).toBe(5);
  });

  it('forceOffPad sets phase to idle immediately', () => {
    const store = usePerformanceStore.getState();
    store.triggerPad('pad-0', 0);
    store.forceOffPad('pad-0');

    const state = usePerformanceStore.getState().padStates['pad-0'];
    expect(state.phase).toBe('idle');
    expect(state.currentValue).toBe(0);
  });

  it('panicAll clears all pad states', () => {
    const store = usePerformanceStore.getState();
    store.triggerPad('pad-0', 0);
    store.triggerPad('pad-1', 0);
    store.panicAll();

    const states = usePerformanceStore.getState().padStates;
    expect(Object.keys(states)).toHaveLength(0);
  });

  // --- Choke Groups ---

  it('triggering pad in same choke group force-offs others', () => {
    const store = usePerformanceStore.getState();

    // Set choke groups via direct mutation for test setup (not through undo)
    const { drumRack } = usePerformanceStore.getState();
    const pads = [...drumRack.pads];
    pads[0] = { ...pads[0], chokeGroup: 1 };
    pads[1] = { ...pads[1], chokeGroup: 1 };
    pads[2] = { ...pads[2], chokeGroup: 2 };
    usePerformanceStore.setState({ drumRack: { ...drumRack, pads } });

    // Trigger pad-0
    usePerformanceStore.getState().triggerPad('pad-0', 0);
    expect(usePerformanceStore.getState().padStates['pad-0'].phase).toBe('attack');

    // Trigger pad-1 (same group) — should choke pad-0
    usePerformanceStore.getState().triggerPad('pad-1', 1);
    expect(usePerformanceStore.getState().padStates['pad-0'].phase).toBe('idle');
    expect(usePerformanceStore.getState().padStates['pad-1'].phase).toBe('attack');
  });

  it('pad in different choke group unaffected', () => {
    const { drumRack } = usePerformanceStore.getState();
    const pads = [...drumRack.pads];
    pads[0] = { ...pads[0], chokeGroup: 1 };
    pads[2] = { ...pads[2], chokeGroup: 2 };
    usePerformanceStore.setState({ drumRack: { ...drumRack, pads } });

    usePerformanceStore.getState().triggerPad('pad-2', 0);
    usePerformanceStore.getState().triggerPad('pad-0', 1);

    // pad-2 should be unaffected (different group)
    expect(usePerformanceStore.getState().padStates['pad-2'].phase).toBe('attack');
    expect(usePerformanceStore.getState().padStates['pad-0'].phase).toBe('attack');
  });

  it('H1: same-frame choke — both triggered, last survives', () => {
    const { drumRack } = usePerformanceStore.getState();
    const pads = [...drumRack.pads];
    pads[0] = { ...pads[0], chokeGroup: 1 };
    pads[1] = { ...pads[1], chokeGroup: 1 };
    usePerformanceStore.setState({ drumRack: { ...drumRack, pads } });

    usePerformanceStore.getState().triggerPad('pad-0', 0);
    usePerformanceStore.getState().triggerPad('pad-1', 0);

    expect(usePerformanceStore.getState().padStates['pad-0'].phase).toBe('idle');
    expect(usePerformanceStore.getState().padStates['pad-1'].phase).toBe('attack');
  });

  // --- getEnvelopeValues ---

  it('getEnvelopeValues returns values for active pads', () => {
    usePerformanceStore.getState().triggerPad('pad-0', 0);
    const values = usePerformanceStore.getState().getEnvelopeValues(0);
    // Default ADSR is instant (0/0/1.0/0), so value should be 1.0
    expect(values['pad-0']).toBe(1.0);
  });

  it('getEnvelopeValues skips idle pads', () => {
    const values = usePerformanceStore.getState().getEnvelopeValues(0);
    expect(Object.keys(values)).toHaveLength(0);
  });

  // --- ADSR Clamping ---

  it('C2: updatePad clamps ADSR values', () => {
    usePerformanceStore.getState().updatePad('pad-0', {
      envelope: { attack: -5, decay: 500, sustain: 2.0, release: NaN },
    });

    const pad = usePerformanceStore.getState().drumRack.pads[0];
    expect(pad.envelope.attack).toBe(0);
    expect(pad.envelope.decay).toBe(300);
    expect(pad.envelope.sustain).toBe(1.0);
    expect(pad.envelope.release).toBe(0);
  });

  // --- Key Binding ---

  it('H4: duplicate key binding steals from old pad', () => {
    // pad-0 has Digit1, pad-1 has Digit2
    usePerformanceStore.getState().setPadKeyBinding('pad-1', 'Digit1');

    const pads = usePerformanceStore.getState().drumRack.pads;
    expect(pads[0].keyBinding).toBeNull(); // stolen
    expect(pads[1].keyBinding).toBe('Digit1');
  });

  it('RESERVED_KEYS rejected', () => {
    usePerformanceStore.getState().setPadKeyBinding('pad-0', 'Space');
    const pad = usePerformanceStore.getState().drumRack.pads[0];
    expect(pad.keyBinding).toBe('Digit1'); // unchanged
  });

  it('setting key to null clears binding', () => {
    usePerformanceStore.getState().setPadKeyBinding('pad-0', null);
    const pad = usePerformanceStore.getState().drumRack.pads[0];
    expect(pad.keyBinding).toBeNull();
  });

  // --- Undo Integration ---

  it('P1-1: undo reverts pad config change', () => {
    const originalLabel = usePerformanceStore.getState().drumRack.pads[0].label;
    usePerformanceStore.getState().updatePad('pad-0', { label: 'Kick' });
    expect(usePerformanceStore.getState().drumRack.pads[0].label).toBe('Kick');

    useUndoStore.getState().undo();
    expect(usePerformanceStore.getState().drumRack.pads[0].label).toBe(originalLabel);
  });

  it('P1-1: redo restores pad config change', () => {
    usePerformanceStore.getState().updatePad('pad-0', { label: 'Kick' });
    useUndoStore.getState().undo();
    useUndoStore.getState().redo();
    expect(usePerformanceStore.getState().drumRack.pads[0].label).toBe('Kick');
  });

  it('P1-1: undo reverts addPadMapping', () => {
    const mapping = {
      sourceId: 'pad-0',
      depth: 1.0,
      min: 0,
      max: 1,
      curve: 'linear' as const,
      effectId: 'effect-1',
      paramKey: 'amount',
    };
    usePerformanceStore.getState().addPadMapping('pad-0', mapping);
    expect(usePerformanceStore.getState().drumRack.pads[0].mappings).toHaveLength(1);

    useUndoStore.getState().undo();
    expect(usePerformanceStore.getState().drumRack.pads[0].mappings).toHaveLength(0);
  });

  it('P1-1: undo reverts removePadMapping', () => {
    const mapping = {
      sourceId: 'pad-0',
      depth: 1.0,
      min: 0,
      max: 1,
      curve: 'linear' as const,
      effectId: 'effect-1',
      paramKey: 'amount',
    };
    usePerformanceStore.getState().addPadMapping('pad-0', mapping);
    usePerformanceStore.getState().removePadMapping('pad-0', 0);
    expect(usePerformanceStore.getState().drumRack.pads[0].mappings).toHaveLength(0);

    useUndoStore.getState().undo();
    expect(usePerformanceStore.getState().drumRack.pads[0].mappings).toHaveLength(1);
  });

  it('P1-1: undo reverts key binding steal', () => {
    usePerformanceStore.getState().setPadKeyBinding('pad-1', 'Digit1');
    expect(usePerformanceStore.getState().drumRack.pads[0].keyBinding).toBeNull();
    expect(usePerformanceStore.getState().drumRack.pads[1].keyBinding).toBe('Digit1');

    useUndoStore.getState().undo();
    expect(usePerformanceStore.getState().drumRack.pads[0].keyBinding).toBe('Digit1');
    expect(usePerformanceStore.getState().drumRack.pads[1].keyBinding).toBe('Digit2');
  });

  // --- setPerformMode ---

  it('H5: setPerformMode(false) calls panicAll', () => {
    const store = usePerformanceStore.getState();
    store.triggerPad('pad-0', 0);
    store.triggerPad('pad-1', 0);
    store.setPerformMode(true);

    expect(usePerformanceStore.getState().isPerformMode).toBe(true);
    // Pads still active
    expect(Object.keys(usePerformanceStore.getState().padStates).length).toBeGreaterThan(0);

    usePerformanceStore.getState().setPerformMode(false);
    expect(usePerformanceStore.getState().isPerformMode).toBe(false);
    expect(Object.keys(usePerformanceStore.getState().padStates)).toHaveLength(0);
  });

  // --- resetDrumRack ---

  it('resetDrumRack restores defaults', () => {
    usePerformanceStore.getState().updatePad('pad-0', { label: 'Custom' });
    usePerformanceStore.getState().triggerPad('pad-0', 0);
    usePerformanceStore.getState().setPerformMode(true);

    usePerformanceStore.getState().resetDrumRack();

    const state = usePerformanceStore.getState();
    expect(state.drumRack.pads[0].label).toBe('Pad 1');
    expect(Object.keys(state.padStates)).toHaveLength(0);
    expect(state.isPerformMode).toBe(false);
  });

  // --- loadDrumRack ---

  it('loadDrumRack loads and clamps ADSR', () => {
    const rack = {
      grid: '4x4' as const,
      pads: [{
        id: 'custom-1',
        label: 'Custom',
        keyBinding: 'KeyQ',
        mode: 'toggle' as const,
        chokeGroup: null,
        envelope: { attack: 999, decay: -1, sustain: 5, release: NaN },
        mappings: [],
        color: '#ff0000',
      }],
    };

    usePerformanceStore.getState().loadDrumRack(rack);
    const pad = usePerformanceStore.getState().drumRack.pads[0];
    expect(pad.label).toBe('Custom');
    expect(pad.envelope.attack).toBe(300);
    expect(pad.envelope.decay).toBe(0);
    expect(pad.envelope.sustain).toBe(1);
    expect(pad.envelope.release).toBe(0);
  });
});
