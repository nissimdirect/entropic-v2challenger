/**
 * Retro-capture buffer — records pad trigger/release events for replay and automation.
 * Module-level state (not Zustand) to avoid re-render cost at 30fps.
 *
 * P5a.1 event shape change:
 *   - `modRoutes` REMOVED from CapturedEvent (INSTRUMENTS.md §10 P1-2: embedding a
 *     snapshot of modRoutes in the event couples replay to UI state at capture time,
 *     breaking edit-after-capture determinism).
 *   - `eventIndex` ADDED — monotonically increasing counter per buffer lifetime; used
 *     as the deterministic replay key alongside `frameIndex`.
 *   - `timestamp` is kept for rolling-buffer time-based pruning ONLY.
 *     WARNING: `timestamp` is performance.now() wall-clock — NEVER use it as a replay
 *     input. Only `frameIndex` + `eventIndex` are valid replay keys.
 */
import type { AutomationPoint, ModulationRoute } from '../../shared/types';

export interface CapturedEvent {
  /** Wall-clock time of capture (performance.now()). BUFFER HYGIENE ONLY — never replay input. */
  timestamp: number;
  /** Frame in the video timeline when this event occurred. Primary replay key. */
  frameIndex: number;
  /** Monotonically increasing per-buffer counter. Secondary replay key / steal tie-breaker. */
  eventIndex: number;
  padId: string;
  eventType: 'trigger' | 'release';
  source: 'keyboard' | 'midi';
}

const MAX_EVENTS = 10_000;
const MAX_AGE_MS = 60_000; // 60 seconds

let buffer: CapturedEvent[] = [];
/** Monotonic counter — incremented on every pushEvent call. */
let nextEventIndex = 0;

/** Push an event to the buffer. Auto-assigns eventIndex. Auto-prunes old events. */
export function pushEvent(event: Omit<CapturedEvent, 'eventIndex'>): void {
  // Time-based prune from the FRONT (timestamp = the ONLY valid use of this
  // field). Events are appended in non-decreasing performance.now() order, so
  // expired ones cluster at the head — splice them once instead of filtering
  // the whole array on every push. The old O(n)-per-push filter made a MIDI
  // flood O(n²): the 10k-cap test timed out on slower CI runners.
  const cutoff = performance.now() - MAX_AGE_MS;
  let expired = 0;
  while (expired < buffer.length && buffer[expired].timestamp < cutoff) expired++;
  if (expired > 0) buffer.splice(0, expired);

  const full: CapturedEvent = { ...event, eventIndex: nextEventIndex++ };
  buffer.push(full);

  // Cap-based prune (defense against MIDI flood)
  if (buffer.length > MAX_EVENTS) {
    buffer.splice(0, buffer.length - MAX_EVENTS);
  }
}

/** Get a copy of the current buffer. */
export function getBuffer(): CapturedEvent[] {
  return [...buffer];
}

/** Clear the buffer and reset the event index counter. */
export function clearBuffer(): void {
  buffer = [];
  nextEventIndex = 0;
}

/** Get buffer length (for testing). */
export function getBufferLength(): number {
  return buffer.length;
}

/**
 * Convert captured events to automation points grouped by paramPath.
 * Maps buffer timestamps to timeline time relative to a reference point.
 *
 * P5a.1: `modRoutes` is no longer embedded in CapturedEvent. Callers must
 * pass a mapping of padId → modRoutes so automation can route correctly.
 * This preserves edit-after-capture semantics: using the CURRENT modRoutes
 * (not a stale snapshot) is intentional for automation recording.
 *
 * @param fps - Project frame rate for time conversion
 * @param referenceTime - Timeline time (seconds) corresponding to the most recent event
 * @param padModRoutes - Current modRoutes per padId (from pad configuration, not event snapshot)
 * @returns Map of paramPath → AutomationPoint[]
 */
export function captureToAutomation(
  fps: number,
  referenceTime: number,
  padModRoutes: Record<string, ModulationRoute[]> = {},
): Record<string, AutomationPoint[]> {
  if (buffer.length === 0 || fps <= 0) return {};

  const result: Record<string, AutomationPoint[]> = {};
  const now = performance.now();

  for (const event of buffer) {
    // Convert timestamp to timeline time
    // offset = how many seconds ago this event happened
    // Note: timestamp is wall-clock ONLY — it is not a replay input.
    const ageMs = now - event.timestamp;
    const ageSec = ageMs / 1000;
    const timelineTime = Math.max(0, referenceTime - ageSec);

    const routes = padModRoutes[event.padId] ?? [];
    for (const mapping of routes) {
      if (!mapping.effectId || !mapping.paramKey) continue;

      const paramPath = `${mapping.effectId}.${mapping.paramKey}`;

      if (!result[paramPath]) {
        result[paramPath] = [];
      }

      // Square-wave trigger points: trigger → 1.0, release → 0.0
      // Clamped to [0, 1] (numeric trust boundary)
      const value = event.eventType === 'trigger'
        ? 1.0
        : 0.0;

      result[paramPath].push({
        time: timelineTime,
        value,
        curve: 0, // square-wave: no interpolation
      });
    }
  }

  // Sort each paramPath's points by time
  for (const points of Object.values(result)) {
    points.sort((a, b) => a.time - b.time);
  }

  return result;
}
