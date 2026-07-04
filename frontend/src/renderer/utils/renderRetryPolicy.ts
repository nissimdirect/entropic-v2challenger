/**
 * Policy for the render-frame empty-chain auto-retry (F-0514-1 / #429).
 *
 * The empty-chain retry exists ONLY to paper over the import-race: right after
 * a clip is imported the sidecar can momentarily reject the effect chain before
 * it has decoded/primed, and re-issuing the frame with an empty chain lets the
 * canvas show *something* instead of an error flash. That is an acceptable
 * one-shot fallback while paused.
 *
 * During PLAYBACK the same retry is a P1 bug: it silently drops the user's
 * effects and renders the WRONG frame (effect-free) with only a transient
 * toast. And a TIMEOUT ("Engine took too long to respond") is never an
 * import-race — it means the engine is overloaded — so it must never trigger
 * the empty-chain fallback regardless of playback state. When we decline the
 * retry the caller should HOLD the last good frame rather than render a wrong
 * one.
 */
export interface RetryDecisionInput {
  /** Length of the effect chain that just failed to render. */
  chainLength: number
  /** Whether transport is currently playing (audio- or timer-driven). */
  isPlaying: boolean
  /** The engine's error string from the failed render, if any. */
  error: string | undefined
}

/** True only when re-rendering the frame with an empty chain is appropriate. */
export function shouldRetryWithEmptyChain(input: RetryDecisionInput): boolean {
  // Already empty — there is nothing left to drop, so a retry would be
  // identical and pointless (and would recurse).
  if (input.chainLength <= 0) return false

  // Never silently drop the user's effects mid-playback — that renders a
  // visibly wrong frame. Hold the last good frame instead.
  if (input.isPlaying) return false

  // A timeout is an overload signal, not an import-race; dropping the chain
  // would "fix" the timeout by rendering the wrong thing.
  const err = (input.error ?? '').toLowerCase()
  if (
    err.includes('too long') ||
    err.includes('timed out') ||
    err.includes('timeout') ||
    err.includes('etimedout')
  ) {
    return false
  }

  return true
}

/**
 * Number of consecutive frames that may fail-and-hold during playback before we
 * escalate to a user-visible toast.
 *
 * Because the empty-chain retry is suppressed during playback (#429), a
 * persistent engine fault would otherwise freeze the preview on the last good
 * frame indefinitely with only console noise — a regression from the pre-fix
 * rate-limited error toast. We ride out one-off transients silently (they clear
 * within 1-2 frames) but surface a warning once the held run crosses this
 * threshold.
 *
 * 12 frames ≈ 0.4s at 30fps / 0.2s at 60fps: long enough that a normal
 * single-frame hiccup never toasts, short enough that a real stall is reported
 * within half a second.
 */
export const RENDER_STALL_THRESHOLD = 12

/**
 * True when a run of `consecutiveHeldFrames` failed-during-playback frames has
 * lasted long enough to warrant a stall toast. Callers increment the run on
 * each held frame, reset it to 0 on any successful frame, and rely on the toast
 * store's per-source rate limiting to avoid spamming while the stall persists.
 */
export function shouldEscalateStall(consecutiveHeldFrames: number): boolean {
  return consecutiveHeldFrames >= RENDER_STALL_THRESHOLD
}
