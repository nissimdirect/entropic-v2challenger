/**
 * MIDI utility functions.
 */

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Convert MIDI note number to name. Uses octave convention where middle C (60) = "C4".
 */
export function midiNoteToName(note: number): string {
  if (note < 0 || note > 127 || !Number.isInteger(note)) return '?';
  const name = NOTE_NAMES[note % 12];
  const octave = Math.floor(note / 12) - 1;
  return `${name}${octave}`;
}

// ─── B10 Rate-limiter (P5b.25) ───────────────────────────────────────────────

/**
 * Minimum interval (ms) between CC store-writes for the same controlId.
 * 33 ms ≈ 30 writes/second ceiling — collapses floods from stuck/motorized
 * controllers without cross-limiting distinct controlIds.
 */
export const CC_THROTTLE_INTERVAL_MS = 33;

/**
 * Echo-suppression window (ms) — SG-H3.
 * A motorized fader echoes the value we just sent. Ignore incoming CC events
 * whose raw byte value matches the last-emitted value for the same CC within
 * this window.
 */
export const CC_ECHO_SUPPRESS_MS = 80;

/**
 * Decision returned by {@link MIDICCRateLimiter.classify}.
 *
 * - `'write'`   — apply this value to the store NOW (leading edge; window open).
 * - `'defer'`   — within the throttle window; coalesce as the pending latest
 *                 value and schedule a trailing-edge flush. The value is NEVER
 *                 discarded — only rate-limited.
 * - `'suppress'`— echo of a value we just emitted (SG-H3); ignore entirely.
 */
export type CCDecision = 'write' | 'defer' | 'suppress';

/**
 * Per-CC throttle entry.
 */
interface ThrottleEntry {
  lastWriteTime: number;
}

/**
 * Per-CC echo-suppression entry.
 */
interface EchoEntry {
  value: number;      // raw MIDI byte value (0-127) we last emitted
  emittedAt: number;  // performance.now() timestamp of the emission
}

/**
 * Rate limiter for MIDI CC intake — TRAILING-EDGE throttle.
 *
 * A rate cap must never lose the LATEST value (dropping the final knob position
 * is a correctness bug).  Each controlId gets an independent throttle bucket:
 *
 *   - The FIRST event in a burst writes immediately (leading edge).
 *   - Events inside the window are COALESCED: the most-recent value is kept as
 *     `pending` and a flush is scheduled for when the window elapses. Only the
 *     last value in a burst is written, but it IS written — never discarded.
 *   - Distinct controlIds are never cross-limited.
 *
 * The limiter is clock-agnostic: callers pass a monotonic `now` (ms). For
 * trailing flushes, the store both (a) flushes any elapsed pending value at the
 * start of the next event for that controlId ("flush-on-next-event"), and
 * (b) schedules a real timer flush so the final value of a burst still lands
 * when no further events arrive.
 *
 * Usage:
 *   const decision = limiter.classify(cc, value, now);
 *   if (decision === 'write') applyToStore(cc, value);
 *   else if (decision === 'defer') schedulePendingFlush(cc, value, dueAt);
 *   // 'suppress' → ignore
 */
export class MIDICCRateLimiter {
  private readonly _throttle = new Map<number, ThrottleEntry>();
  private readonly _echo = new Map<number, EchoEntry>();
  private readonly _throttleMs: number;
  private readonly _echoMs: number;

  constructor(throttleMs = CC_THROTTLE_INTERVAL_MS, echoMs = CC_ECHO_SUPPRESS_MS) {
    this._throttleMs = throttleMs;
    this._echoMs = echoMs;
  }

  /** Throttle interval in ms (read-only). */
  get throttleMs(): number {
    return this._throttleMs;
  }

  /**
   * Classify an incoming CC event without mutating throttle state on a
   * suppressed/deferred result. Mutates state only when the result is `'write'`
   * (records the write time) so the caller can rely on `classify` being the
   * single source of truth for the leading edge.
   *
   * @param controlId  MIDI CC number (0-127, already clamped by caller).
   * @param rawValue   Raw MIDI byte value (0-127), used for echo detection.
   * @param now        Monotonic timestamp in ms (e.g. performance.now()).
   */
  classify(controlId: number, rawValue: number, now: number): CCDecision {
    // ── Echo suppression (SG-H3) — DORMANT until outbound MIDI path exists ──
    // `_echo` is only populated by `recordEmit()`, which is never called in
    // production today (no `access.outputs` writer). This branch will become
    // active when a motorized-fader-send path is added (SG-H3). Until then,
    // `_echo` is always empty and this guard never fires.
    const echo = this._echo.get(controlId);
    if (echo !== undefined && echo.value === rawValue && now - echo.emittedAt < this._echoMs) {
      return 'suppress';
    }

    // ── Flood throttle ───────────────────────────────────────────────────
    const entry = this._throttle.get(controlId);
    if (entry !== undefined && now - entry.lastWriteTime < this._throttleMs) {
      // Within window — defer (coalesce); the latest value will be flushed.
      return 'defer';
    }

    // Window open — write now (leading edge) and record the write time.
    this._throttle.set(controlId, { lastWriteTime: now });
    return 'write';
  }

  /**
   * Mark a trailing-edge flush as written at `now` for `controlId`. The caller
   * invokes this when it actually applies a deferred (pending) value to the
   * store, so the throttle window restarts from the flush time.
   */
  markFlushed(controlId: number, now: number): void {
    this._throttle.set(controlId, { lastWriteTime: now });
  }

  /**
   * Timestamp (ms) at which the throttle window for `controlId` next opens, or
   * `now` if it is already open. Used to schedule trailing-edge flush timers.
   */
  nextWriteTime(controlId: number, now: number): number {
    const entry = this._throttle.get(controlId);
    if (entry === undefined) return now;
    const due = entry.lastWriteTime + this._throttleMs;
    return due > now ? due : now;
  }

  /**
   * Backwards-compatible boolean form of {@link classify}: returns `true` only
   * when the event should be written immediately (leading edge). NOTE: this
   * collapses `'defer'` and `'suppress'` into `false`, so it is only suitable
   * for pure rate-cap accounting (e.g. counting writes/sec), NOT for the store
   * path which must also handle the trailing-edge flush. Retained for the
   * deterministic flood-rate unit tests.
   */
  shouldWrite(controlId: number, rawValue: number, now: number): boolean {
    return this.classify(controlId, rawValue, now) === 'write';
  }

  /**
   * Record an outbound emission for echo suppression.
   * Call this when software sends a value to a motorized fader so the
   * echoed-back CC is ignored within the suppression window.
   *
   * @param controlId  MIDI CC number (0-127).
   * @param rawValue   Raw MIDI byte value (0-127) we emitted.
   * @param now        Monotonic timestamp in ms.
   *
   * DORMANT SEAM — SG-H3 (motorized fader echo suppression):
   * This method is NOT called in production today because there is no outbound
   * MIDI path yet (no `access.outputs` writer exists). The echo-suppression
   * machinery (`_echo` map + the 'suppress' branch in `classify`) is a
   * forward-seam for a future feature. Do not add UI or log messages that imply
   * echo-suppression is currently active — it is not wired until an
   * outbound-MIDI-send path (SG-H3) is implemented.
   */
  recordEmit(controlId: number, rawValue: number, now: number): void {
    this._echo.set(controlId, { value: rawValue, emittedAt: now });
  }

  /** Reset all throttle and echo state (e.g. on device change or resetMIDI). */
  reset(): void {
    this._throttle.clear();
    this._echo.clear();
  }
}
