/**
 * Retro-capture buffer — records pad trigger/release events for dumping to automation.
 * Module-level state (not Zustand) to avoid re-render cost at 30fps.
 */
import type { AutomationPoint, ModulationRoute } from '../../shared/types';

export interface CapturedEvent {
  timestamp: number;        // performance.now() at capture time
  frameIndex: number;       // current frame when captured
  padId: string;
  eventType: 'trigger' | 'release';
  source: 'keyboard' | 'midi';
  mappings: ModulationRoute[];  // snapshot of pad mappings at capture time
}

const MAX_EVENTS = 10_000;
const MAX_AGE_MS = 60_000; // 60 seconds

let buffer: CapturedEvent[] = [];

/** Push an event to the buffer. Auto-prunes old events. */
export function pushEvent(event: CapturedEvent): void {
  // Time-based prune
  const cutoff = performance.now() - MAX_AGE_MS;
  buffer = buffer.filter((e) => e.timestamp >= cutoff);

  buffer.push(event);

  // Cap-based prune (defense against MIDI flood)
  if (buffer.length > MAX_EVENTS) {
    buffer = buffer.slice(buffer.length - MAX_EVENTS);
  }
}

/** Get a copy of the current buffer. */
export function getBuffer(): CapturedEvent[] {
  return [...buffer];
}

/** Clear the buffer. */
export function clearBuffer(): void {
  buffer = [];
}

/** Get buffer length (for testing). */
export function getBufferLength(): number {
  return buffer.length;
}

/**
 * Convert captured events to automation points grouped by paramPath.
 * Maps buffer timestamps to timeline time relative to a reference point.
 *
 * @param fps - Project frame rate for time conversion
 * @param referenceTime - Timeline time (seconds) corresponding to the most recent event
 * @returns Map of paramPath → AutomationPoint[]
 */
export function captureToAutomation(
  fps: number,
  referenceTime: number,
): Record<string, AutomationPoint[]> {
  if (buffer.length === 0 || fps <= 0) return {};

  const result: Record<string, AutomationPoint[]> = {};
  const now = performance.now();

  for (const event of buffer) {
    // Convert timestamp to timeline time
    // offset = how many seconds ago this event happened
    const ageMs = now - event.timestamp;
    const ageSec = ageMs / 1000;
    const timelineTime = Math.max(0, referenceTime - ageSec);

    for (const mapping of event.mappings) {
      if (!mapping.effectId || !mapping.paramKey) continue;

      const paramPath = `${mapping.effectId}.${mapping.paramKey}`;

      if (!result[paramPath]) {
        result[paramPath] = [];
      }

      // Trigger → value based on depth * sustain (mapping.depth * mapping.max)
      // Release → 0 (return to base)
      const value = event.eventType === 'trigger'
        ? Math.max(0, Math.min(1, mapping.depth))
        : 0;

      result[paramPath].push({
        time: timelineTime,
        value,
        curve: 0, // linear
      });
    }
  }

  // Sort each paramPath's points by time
  for (const points of Object.values(result)) {
    points.sort((a, b) => a.time - b.time);
  }

  return result;
}
