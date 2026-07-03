/**
 * Shared pad trigger/release actions with retro-capture integration.
 * Eliminates duplication between keyboard handler (App.tsx) and MIDI handler (midi.ts).
 *
 * P5a.1: `modRoutes` is NO LONGER embedded in the captured event payload.
 * INSTRUMENTS.md §10 P1-2 requires that replay events carry no pad-state snapshots —
 * `modRoutes` embedded at trigger time creates stale data when pads are edited after
 * capture. The `timestamp` field is kept for rolling-buffer hygiene ONLY; it is never
 * used as a replay input (see retro-capture.ts).
 */
import type { Pad, PadRuntimeState } from '../../../shared/types';
import { pushEvent } from '../../utils/retro-capture';

interface PerfStoreActions {
  // H6: `velocity` (MIDI note-on velocity, 0-127) is optional — matches
  // usePerformanceStore.triggerPad's signature. Callers that have no
  // velocity source (keyboard, mouse) simply omit it; the store defaults
  // to 127 (full intensity), so this is byte-identical for those sources.
  triggerPad: (padId: string, frameIndex: number, trackId?: string, velocity?: number) => void;
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
  velocity?: number,
): void {
  perfStore.triggerPad(pad.id, frameIndex, undefined, velocity);
  pushEvent({
    // timestamp is performance.now() for buffer-trim hygiene ONLY — never a replay input.
    timestamp: performance.now(),
    frameIndex,
    padId: pad.id,
    eventType: 'trigger',
    source,
    // modRoutes intentionally OMITTED: per P5a.1, pad-state snapshots must not be
    // embedded in capture events. See retro-capture.captureToAutomation for how
    // the CURRENT modRoutes are applied at automation-write time.
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
    // timestamp is performance.now() for buffer-trim hygiene ONLY — never a replay input.
    timestamp: performance.now(),
    frameIndex,
    padId: pad.id,
    eventType: 'release',
    source,
    // modRoutes intentionally OMITTED: per P5a.1 (see triggerPadWithCapture comment).
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
  velocity?: number,
): void {
  if (pad.mode === 'toggle') {
    const state = perfStore.padStates[pad.id];
    if (state && state.phase !== 'idle' && state.phase !== 'release') {
      releasePadWithCapture(pad, perfStore, frameIndex, source);
    } else {
      triggerPadWithCapture(pad, perfStore, frameIndex, source, velocity);
    }
  } else {
    triggerPadWithCapture(pad, perfStore, frameIndex, source, velocity);
  }
}
