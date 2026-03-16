/**
 * Shared pad trigger/release actions with retro-capture integration.
 * Eliminates duplication between keyboard handler (App.tsx) and MIDI handler (midi.ts).
 */
import type { Pad, PadRuntimeState } from '../../../shared/types';
import { pushEvent } from '../../utils/retro-capture';

interface PerfStoreActions {
  triggerPad: (padId: string, frameIndex: number) => void;
  releasePad: (padId: string, frameIndex: number) => void;
  padStates: Record<string, PadRuntimeState>;
}

/**
 * Trigger a pad and push a capture event.
 */
export function triggerPadWithCapture(
  pad: Pad,
  perfStore: PerfStoreActions,
  frameIndex: number,
  source: 'keyboard' | 'midi',
): void {
  perfStore.triggerPad(pad.id, frameIndex);
  pushEvent({
    timestamp: performance.now(),
    frameIndex,
    padId: pad.id,
    eventType: 'trigger',
    source,
    mappings: pad.mappings,
  });
}

/**
 * Release a pad and push a capture event.
 */
export function releasePadWithCapture(
  pad: Pad,
  perfStore: PerfStoreActions,
  frameIndex: number,
  source: 'keyboard' | 'midi',
): void {
  perfStore.releasePad(pad.id, frameIndex);
  pushEvent({
    timestamp: performance.now(),
    frameIndex,
    padId: pad.id,
    eventType: 'release',
    source,
    mappings: pad.mappings,
  });
}

/**
 * Handle pad trigger with toggle/gate/one-shot mode logic + capture.
 * Used by both keyboard and MIDI input handlers.
 */
export function handlePadTrigger(
  pad: Pad,
  perfStore: PerfStoreActions,
  frameIndex: number,
  source: 'keyboard' | 'midi',
): void {
  if (pad.mode === 'toggle') {
    const state = perfStore.padStates[pad.id];
    if (state && state.phase !== 'idle' && state.phase !== 'release') {
      releasePadWithCapture(pad, perfStore, frameIndex, source);
    } else {
      triggerPadWithCapture(pad, perfStore, frameIndex, source);
    }
  } else {
    triggerPadWithCapture(pad, perfStore, frameIndex, source);
  }
}
