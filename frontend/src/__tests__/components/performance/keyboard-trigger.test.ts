/**
 * P5a.3 update: modal-flag approach retired — arming is now track-selection based.
 * Pads are armed whenever a performance track is selected in the timeline.
 * The keyboard handler logic in App.tsx now checks selectedTrack.type === 'performance'
 * instead of a modal flag.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { usePerformanceStore } from '../../../renderer/stores/performance';
import { useUndoStore } from '../../../renderer/stores/undo';
import { DEFAULT_PAD_BINDINGS } from '../../../shared/constants';

function resetStores() {
  usePerformanceStore.getState().resetDrumRack();
  useUndoStore.getState().clear();
}

// Simulate the keyboard handler logic from App.tsx (P5a.3 version).
// Arming is determined by the selected track type, not a modal flag.
// Tests pass `armed` directly rather than manipulating timeline store.
function simulateKeyDown(code: string, options: {
  meta?: boolean;
  repeat?: boolean;
  isInput?: boolean;
  armed?: boolean; // true when a perf track is selected (replaces old modal flag)
} = {}) {
  const perfStore = usePerformanceStore.getState();
  const mod = options.meta ?? false;

  if (options.isInput) return { handled: false };

  const isArmed = options.armed ?? false;

  // Perform mode gate (P5a.3: armed by track selection)
  if (isArmed && !mod) {
    if (code === 'Escape') {
      perfStore.panicAll();
      return { handled: true, action: 'panic' };
    }

    if (perfStore.isPadEditorOpen) return { handled: false, action: 'editor-swallow' };
    if (options.repeat) return { handled: true, action: 'repeat-ignored' };

    const pad = perfStore.drumRack.pads.find((p) => p.keyBinding === code);
    if (pad) {
      if (pad.mode === 'toggle') {
        const state = perfStore.padStates[pad.id];
        if (state && state.phase !== 'idle' && state.phase !== 'release') {
          perfStore.releasePad(pad.id, 0);
        } else {
          perfStore.triggerPad(pad.id, 0);
        }
      } else {
        perfStore.triggerPad(pad.id, 0);
      }
      return { handled: true, action: 'pad-trigger', padId: pad.id };
    }

    return { handled: true, action: 'consumed' };
  }

  return { handled: false };
}

function simulateKeyUp(code: string, armed: boolean) {
  const perfStore = usePerformanceStore.getState();
  if (!armed) return;
  if (perfStore.isPadEditorOpen) return;

  const pad = perfStore.drumRack.pads.find((p) => p.keyBinding === code);
  if (!pad) return;

  if (pad.mode === 'gate' || pad.mode === 'one-shot') {
    perfStore.releasePad(pad.id, 0);
  }
}

describe('Keyboard Trigger (P5a.3 — track-selection arming)', () => {
  beforeEach(resetStores);

  it('uses e.code for pad lookup (not e.key)', () => {
    const result = simulateKeyDown('KeyQ', { armed: true });
    expect(result.action).toBe('pad-trigger');
  });

  it('modifier keys cause fallthrough (not consumed by pads)', () => {
    const result = simulateKeyDown('KeyQ', { armed: true, meta: true });
    expect(result.handled).toBe(false);
  });

  it('repeat events are ignored', () => {
    const result = simulateKeyDown('KeyQ', { armed: true, repeat: true });
    expect(result.action).toBe('repeat-ignored');
  });

  it('INPUT element bypass', () => {
    const result = simulateKeyDown('KeyQ', { armed: true, isInput: true });
    expect(result.handled).toBe(false);
  });

  it('gate: keydown=trigger, keyup=release', () => {
    simulateKeyDown('KeyQ', { armed: true });

    const state1 = usePerformanceStore.getState().padStates['pad-4']; // KeyQ is pad index 4
    expect(state1.phase).toBe('attack');

    simulateKeyUp('KeyQ', true);
    const state2 = usePerformanceStore.getState().padStates['pad-4'];
    expect(state2.phase).toBe('release');
  });

  it('toggle: keydown=trigger, keydown again=release', () => {
    const { drumRack } = usePerformanceStore.getState();
    const pads = [...drumRack.pads];
    pads[4] = { ...pads[4], mode: 'toggle' };
    usePerformanceStore.setState({ drumRack: { ...drumRack, pads } });

    simulateKeyDown('KeyQ', { armed: true });
    const state1 = usePerformanceStore.getState().padStates['pad-4'];
    expect(state1.phase).toBe('attack');

    simulateKeyDown('KeyQ', { armed: true });
    const state2 = usePerformanceStore.getState().padStates['pad-4'];
    expect(state2.phase).toBe('release');
  });

  it('one-shot: keydown=trigger, keyup=start release', () => {
    const { drumRack } = usePerformanceStore.getState();
    const pads = [...drumRack.pads];
    pads[4] = { ...pads[4], mode: 'one-shot' };
    usePerformanceStore.setState({ drumRack: { ...drumRack, pads } });

    simulateKeyDown('KeyQ', { armed: true });
    const state1 = usePerformanceStore.getState().padStates['pad-4'];
    expect(state1.phase).toBe('attack');

    simulateKeyUp('KeyQ', true);
    const state2 = usePerformanceStore.getState().padStates['pad-4'];
    expect(state2.phase).toBe('release');
  });

  it('Escape = panic (all pads off)', () => {
    usePerformanceStore.getState().triggerPad('pad-0', 0);
    usePerformanceStore.getState().triggerPad('pad-1', 0);

    simulateKeyDown('Escape', { armed: true });
    expect(Object.keys(usePerformanceStore.getState().padStates)).toHaveLength(0);
  });

  it('M4: PadEditor open → keys dont trigger pads', () => {
    usePerformanceStore.setState({ isPadEditorOpen: true });

    const result = simulateKeyDown('KeyQ', { armed: true });
    expect(result.action).toBe('editor-swallow');
    expect(usePerformanceStore.getState().padStates['pad-4']).toBeUndefined();
  });

  it('H2: Window blur → all pads released (panicAll)', () => {
    usePerformanceStore.getState().triggerPad('pad-0', 0);
    usePerformanceStore.getState().triggerPad('pad-1', 0);

    // Simulate blur
    usePerformanceStore.getState().panicAll();
    expect(Object.keys(usePerformanceStore.getState().padStates)).toHaveLength(0);
  });

  it('bare keys consumed when armed (blocks i/o shortcuts)', () => {
    // KeyI is not bound to any pad (reserved), but still consumed
    const result = simulateKeyDown('KeyI', { armed: true });
    expect(result.handled).toBe(true);
    expect(result.action).toBe('consumed');
  });

  it('Cmd+Z still works when armed (modifier key)', () => {
    const result = simulateKeyDown('KeyZ', { armed: true, meta: true });
    expect(result.handled).toBe(false); // Falls through to normal handler
  });

  it('not armed: pad keys dont trigger', () => {
    // P5a.3: unarmed = no performance track selected
    const result = simulateKeyDown('KeyQ', { armed: false });
    expect(result.handled).toBe(false);
  });

  it('all 16 default pad bindings are correct codes', () => {
    const pads = usePerformanceStore.getState().drumRack.pads;
    pads.forEach((pad, i) => {
      expect(pad.keyBinding).toBe(DEFAULT_PAD_BINDINGS[i]);
    });
  });
});
