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
    expect(usePerformanceStore.getState().drumRack.pads[0].modRoutes).toHaveLength(1);

    useUndoStore.getState().undo();
    expect(usePerformanceStore.getState().drumRack.pads[0].modRoutes).toHaveLength(0);
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
    expect(usePerformanceStore.getState().drumRack.pads[0].modRoutes).toHaveLength(0);

    useUndoStore.getState().undo();
    expect(usePerformanceStore.getState().drumRack.pads[0].modRoutes).toHaveLength(1);
  });

  it('P1-1: undo reverts key binding steal', () => {
    usePerformanceStore.getState().setPadKeyBinding('pad-1', 'Digit1');
    expect(usePerformanceStore.getState().drumRack.pads[0].keyBinding).toBeNull();
    expect(usePerformanceStore.getState().drumRack.pads[1].keyBinding).toBe('Digit1');

    useUndoStore.getState().undo();
    expect(usePerformanceStore.getState().drumRack.pads[0].keyBinding).toBe('Digit1');
    expect(usePerformanceStore.getState().drumRack.pads[1].keyBinding).toBe('Digit2');
  });

  // --- P5a.3: modal perform-mode flag RETIRED — arming is track-selection based ---
  // (setPerformMode removed from store; arming = selectedTrack.type === 'performance')

  it('P5a.3: pad trigger appends a TriggerEvent to the owning track event log', () => {
    const store = usePerformanceStore.getState();
    store.triggerPad('pad-0', 42, 'track-perf-1');

    const events = usePerformanceStore.getState().trackEvents['track-perf-1'];
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('trigger');
    expect(events[0].frameIndex).toBe(42);
    expect(events[0].instrumentId).toBe('track-perf-1');
  });

  it('P5a.3: pads are armed when a performance track is selected (no modal flag)', () => {
    // Arming is a derived value in App.tsx — the store does NOT expose the old flag.
    const state = usePerformanceStore.getState();
    expect('setPerformMode' in state).toBe(false);
    // trackEvents is the new per-track event log
    expect('trackEvents' in state).toBe(true);
  });

  it('P5a.3: panicAll clears all tracks active voices (trackEvents emptied)', () => {
    const store = usePerformanceStore.getState();
    store.triggerPad('pad-0', 0, 'track-1');
    store.triggerPad('pad-1', 0, 'track-2');
    expect(Object.keys(usePerformanceStore.getState().trackEvents).length).toBeGreaterThan(0);

    store.panicAll();
    expect(Object.keys(usePerformanceStore.getState().padStates)).toHaveLength(0);
    expect(Object.keys(usePerformanceStore.getState().trackEvents)).toHaveLength(0);
  });

  it('P5a.3: trigger with non-finite frameIndex is dropped at the store boundary (negative)', () => {
    const store = usePerformanceStore.getState();
    store.triggerPad('pad-0', NaN, 'track-nan');
    // No TriggerEvent should be appended for the track when frameIndex is non-finite.
    const events = usePerformanceStore.getState().trackEvents['track-nan'];
    expect(events).toBeUndefined();
  });

  // --- resetDrumRack ---

  it('resetDrumRack restores defaults', () => {
    usePerformanceStore.getState().updatePad('pad-0', { label: 'Custom' });
    usePerformanceStore.getState().triggerPad('pad-0', 0, 'track-x');

    usePerformanceStore.getState().resetDrumRack();

    const state = usePerformanceStore.getState();
    expect(state.drumRack.pads[0].label).toBe('Pad 1');
    expect(Object.keys(state.padStates)).toHaveLength(0);
    // P5a.3: trackEvents cleared on reset
    expect(Object.keys(state.trackEvents)).toHaveLength(0);
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
        modRoutes: [],
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

/**
 * UH.2 — clearRackPadEvents is an event-LOG edit (document state) → undoable.
 * Live triggerRackPad/triggerPad/releasePad appends remain EXEMT (performance
 * input, not document state). These tests FAIL on origin/main (clearRackPadEvents
 * used a raw set()) and PASS on this branch.
 */
describe('performance store undo — clearRackPadEvents (event-log edit)', () => {
  beforeEach(resetStores);

  const T1 = 'track-1';
  const PAD = 'rackpad-1';

  it('clearRackPadEvents → undo restores the FULL event log', () => {
    // Build a captured log via two live rack-pad triggers (the appends themselves
    // are NOT undoable — only the clear is).
    usePerformanceStore.getState().triggerRackPad(T1, PAD, 10);
    usePerformanceStore.getState().triggerRackPad(T1, PAD, 20);
    const key = `${T1}:${PAD}`;
    const before = usePerformanceStore.getState().trackEvents[key];
    expect(before).toHaveLength(2);
    // live triggers must NOT have pushed any undo entries
    expect(useUndoStore.getState().past).toHaveLength(0);

    usePerformanceStore.getState().clearRackPadEvents(T1, PAD);
    expect(usePerformanceStore.getState().trackEvents[key]).toBeUndefined();
    expect(useUndoStore.getState().past).toHaveLength(1);

    useUndoStore.getState().undo();
    const restored = usePerformanceStore.getState().trackEvents[key];
    expect(restored).toHaveLength(2);
    expect(restored[0].frameIndex).toBe(10);
    expect(restored[1].frameIndex).toBe(20);
  });

  it('redo re-clears the event log', () => {
    usePerformanceStore.getState().triggerRackPad(T1, PAD, 5);
    const key = `${T1}:${PAD}`;
    usePerformanceStore.getState().clearRackPadEvents(T1, PAD);
    useUndoStore.getState().undo();
    expect(usePerformanceStore.getState().trackEvents[key]).toHaveLength(1);

    useUndoStore.getState().redo();
    expect(usePerformanceStore.getState().trackEvents[key]).toBeUndefined();
  });

  it('clearRackPadEvents on an absent key is a no-op (no undo entry, no crash)', () => {
    expect(() => usePerformanceStore.getState().clearRackPadEvents(T1, 'nope')).not.toThrow();
    expect(useUndoStore.getState().past).toHaveLength(0);
  });

  it('live triggerPad/releasePad do NOT push undo entries (performance input is exempt)', () => {
    // triggerPad appends to a real drumRack pad's log; releasePad too. Neither is
    // an undoable document edit.
    const padId = usePerformanceStore.getState().drumRack.pads[0].id;
    usePerformanceStore.getState().triggerPad(padId, 1, T1);
    usePerformanceStore.getState().releasePad(padId, 2, T1);
    expect(useUndoStore.getState().past).toHaveLength(0);
  });
});
