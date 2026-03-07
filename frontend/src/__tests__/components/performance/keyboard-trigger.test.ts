import { describe, it, expect, beforeEach } from 'vitest';
import { usePerformanceStore } from '../../../renderer/stores/performance';
import { useUndoStore } from '../../../renderer/stores/undo';
import { DEFAULT_PAD_BINDINGS } from '../../../shared/constants';

function resetStores() {
  usePerformanceStore.getState().resetDrumRack();
  useUndoStore.getState().clear();
}

// Simulate the keyboard handler logic from App.tsx
// (We test the store interactions, not the DOM events)
function simulateKeyDown(code: string, options: {
  meta?: boolean;
  repeat?: boolean;
  isInput?: boolean;
} = {}) {
  const perfStore = usePerformanceStore.getState();
  const mod = options.meta ?? false;

  if (options.isInput) return { handled: false };

  // P toggle — always works
  if (code === 'KeyP' && !mod) {
    perfStore.setPerformMode(!perfStore.isPerformMode);
    return { handled: true, action: 'toggle-perform' };
  }

  // Perform mode gate
  if (perfStore.isPerformMode && !mod) {
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

function simulateKeyUp(code: string) {
  const perfStore = usePerformanceStore.getState();
  if (!perfStore.isPerformMode) return;
  if (perfStore.isPadEditorOpen) return;

  const pad = perfStore.drumRack.pads.find((p) => p.keyBinding === code);
  if (!pad) return;

  if (pad.mode === 'gate' || pad.mode === 'one-shot') {
    perfStore.releasePad(pad.id, 0);
  }
}

describe('Keyboard Trigger', () => {
  beforeEach(resetStores);

  it('uses e.code for pad lookup (not e.key)', () => {
    usePerformanceStore.getState().setPerformMode(true);
    const result = simulateKeyDown('KeyQ');
    expect(result.action).toBe('pad-trigger');
  });

  it('modifier keys cause fallthrough (not consumed by pads)', () => {
    usePerformanceStore.getState().setPerformMode(true);
    const result = simulateKeyDown('KeyQ', { meta: true });
    expect(result.handled).toBe(false);
  });

  it('repeat events are ignored', () => {
    usePerformanceStore.getState().setPerformMode(true);
    const result = simulateKeyDown('KeyQ', { repeat: true });
    expect(result.action).toBe('repeat-ignored');
  });

  it('INPUT element bypass', () => {
    usePerformanceStore.getState().setPerformMode(true);
    const result = simulateKeyDown('KeyQ', { isInput: true });
    expect(result.handled).toBe(false);
  });

  it('gate: keydown=trigger, keyup=release', () => {
    usePerformanceStore.getState().setPerformMode(true);
    simulateKeyDown('KeyQ');

    const state1 = usePerformanceStore.getState().padStates['pad-4']; // KeyQ is pad index 4
    expect(state1.phase).toBe('attack');

    simulateKeyUp('KeyQ');
    const state2 = usePerformanceStore.getState().padStates['pad-4'];
    expect(state2.phase).toBe('release');
  });

  it('toggle: keydown=trigger, keydown again=release', () => {
    // Set pad to toggle mode
    const { drumRack } = usePerformanceStore.getState();
    const pads = [...drumRack.pads];
    pads[4] = { ...pads[4], mode: 'toggle' };
    usePerformanceStore.setState({ drumRack: { ...drumRack, pads } });

    usePerformanceStore.getState().setPerformMode(true);

    simulateKeyDown('KeyQ');
    const state1 = usePerformanceStore.getState().padStates['pad-4'];
    expect(state1.phase).toBe('attack');

    simulateKeyDown('KeyQ');
    const state2 = usePerformanceStore.getState().padStates['pad-4'];
    expect(state2.phase).toBe('release');
  });

  it('one-shot: keydown=trigger, keyup=start release', () => {
    const { drumRack } = usePerformanceStore.getState();
    const pads = [...drumRack.pads];
    pads[4] = { ...pads[4], mode: 'one-shot' };
    usePerformanceStore.setState({ drumRack: { ...drumRack, pads } });

    usePerformanceStore.getState().setPerformMode(true);
    simulateKeyDown('KeyQ');

    const state1 = usePerformanceStore.getState().padStates['pad-4'];
    expect(state1.phase).toBe('attack');

    simulateKeyUp('KeyQ');
    const state2 = usePerformanceStore.getState().padStates['pad-4'];
    expect(state2.phase).toBe('release');
  });

  it('Escape = panic (all pads off)', () => {
    usePerformanceStore.getState().setPerformMode(true);
    usePerformanceStore.getState().triggerPad('pad-0', 0);
    usePerformanceStore.getState().triggerPad('pad-1', 0);

    simulateKeyDown('Escape');
    expect(Object.keys(usePerformanceStore.getState().padStates)).toHaveLength(0);
  });

  it('P toggles perform mode on', () => {
    expect(usePerformanceStore.getState().isPerformMode).toBe(false);
    simulateKeyDown('KeyP');
    expect(usePerformanceStore.getState().isPerformMode).toBe(true);
  });

  it('P toggles perform mode off', () => {
    usePerformanceStore.getState().setPerformMode(true);
    simulateKeyDown('KeyP');
    expect(usePerformanceStore.getState().isPerformMode).toBe(false);
  });

  it('M4: PadEditor open → keys dont trigger pads', () => {
    usePerformanceStore.getState().setPerformMode(true);
    usePerformanceStore.setState({ isPadEditorOpen: true });

    const result = simulateKeyDown('KeyQ');
    expect(result.action).toBe('editor-swallow');
    expect(usePerformanceStore.getState().padStates['pad-4']).toBeUndefined();
  });

  it('H2: Window blur → all pads released (panicAll)', () => {
    usePerformanceStore.getState().setPerformMode(true);
    usePerformanceStore.getState().triggerPad('pad-0', 0);
    usePerformanceStore.getState().triggerPad('pad-1', 0);

    // Simulate blur
    usePerformanceStore.getState().panicAll();
    expect(Object.keys(usePerformanceStore.getState().padStates)).toHaveLength(0);
  });

  it('bare keys consumed in perform mode (blocks i/o shortcuts)', () => {
    usePerformanceStore.getState().setPerformMode(true);
    // KeyI is not bound to any pad (reserved), but still consumed
    const result = simulateKeyDown('KeyI');
    expect(result.handled).toBe(true);
    expect(result.action).toBe('consumed');
  });

  it('Cmd+Z still works in perform mode (modifier key)', () => {
    usePerformanceStore.getState().setPerformMode(true);
    const result = simulateKeyDown('KeyZ', { meta: true });
    expect(result.handled).toBe(false); // Falls through to normal handler
  });

  it('perform mode off: pad keys dont trigger', () => {
    expect(usePerformanceStore.getState().isPerformMode).toBe(false);
    const result = simulateKeyDown('KeyQ');
    expect(result.handled).toBe(false);
  });

  it('all 16 default pad bindings are correct codes', () => {
    const pads = usePerformanceStore.getState().drumRack.pads;
    pads.forEach((pad, i) => {
      expect(pad.keyBinding).toBe(DEFAULT_PAD_BINDINGS[i]);
    });
  });
});
