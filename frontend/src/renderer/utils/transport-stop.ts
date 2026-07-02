/**
 * F-0512-16 follow-up — Stop / Escape "second press clears loop region" gate.
 *
 * The original handleStop gate used strict `playheadTime === 0` plus a
 * `!isTimerPlayingRef.current` ref check. The validator pass on 2026-05-13
 * confirmed neither Escape×2 nor k×2 from a ruler-clicked "0" position fired
 * clearLoopRegion. Two compounding causes:
 *
 *   (a) Float drift — `setPlayheadTime(0)` writes machine-exact 0, but a
 *       prior ruler click typically yields a sub-epsilon float (e.g.
 *       0.0001s). Strict equality fails on the FIRST press, so the loop is
 *       never cleared by the canonical "stop, then stop again" UX.
 *
 *   (b) Stale ref — `isTimerPlayingRef.current` is synced via a useEffect.
 *       Under rapid Escape/k double-tap the ref can lag the React state by
 *       one render. The audio-playing check is sufficient to gate against
 *       "audio is currently driving the clock" — the timer check is
 *       redundant defense that was actively gating on stale data.
 *
 * Predicate semantics:
 *   - playheadTime within 10ms of zero → "at rest at frame 0"
 *   - audio not actively playing       → safe to clear (don't yank the loop
 *                                          out from under an active audio
 *                                          transport)
 *   - loopRegion is set                → there's something to clear
 */
export interface LoopRegion {
  in: number
  out: number
}

const PLAYHEAD_EPSILON_S = 0.01

export function shouldClearLoopOnStop(
  playheadTime: number,
  audioPlaying: boolean,
  loopRegion: LoopRegion | null,
): boolean {
  if (audioPlaying) return false
  if (!loopRegion) return false
  return Math.abs(playheadTime) < PLAYHEAD_EPSILON_S
}
