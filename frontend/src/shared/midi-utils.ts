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
 * Rate limiter for MIDI CC intake.
 *
 * Each controlId gets an independent throttle bucket.  Calling `shouldWrite`
 * returns `true` when ≥ CC_THROTTLE_INTERVAL_MS has elapsed since the last
 * allowed write for that controlId, and records the timestamp.  Distinct
 * controlIds are never cross-limited.
 *
 * Usage:
 *   const limiter = new MIDICCRateLimiter();
 *   if (limiter.shouldWrite(ccNumber, now)) { /* perform store write *\/ }
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

  /**
   * Returns `true` if the CC message for `controlId` should be written to the
   * store; `false` if it is within the flood-throttle window or the echo-
   * suppression window.
   *
   * @param controlId  MIDI CC number (0-127, already clamped by caller).
   * @param rawValue   Raw MIDI byte value (0-127), used for echo detection.
   * @param now        Monotonic timestamp in ms (e.g. performance.now()).
   */
  shouldWrite(controlId: number, rawValue: number, now: number): boolean {
    // ── Echo suppression (SG-H3) ─────────────────────────────────────────
    const echo = this._echo.get(controlId);
    if (echo !== undefined && echo.value === rawValue && now - echo.emittedAt < this._echoMs) {
      return false;
    }

    // ── Flood throttle ───────────────────────────────────────────────────
    const entry = this._throttle.get(controlId);
    if (entry !== undefined && now - entry.lastWriteTime < this._throttleMs) {
      return false;
    }

    // Allowed — record the write time.
    this._throttle.set(controlId, { lastWriteTime: now });
    return true;
  }

  /**
   * Record an outbound emission for echo suppression.
   * Call this when software sends a value to a motorized fader so the
   * echoed-back CC is ignored within the suppression window.
   *
   * @param controlId  MIDI CC number (0-127).
   * @param rawValue   Raw MIDI byte value (0-127) we emitted.
   * @param now        Monotonic timestamp in ms.
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
