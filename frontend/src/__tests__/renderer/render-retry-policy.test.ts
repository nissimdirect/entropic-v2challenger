/**
 * #429 — empty-chain auto-retry policy.
 *
 * The retry may fire ONLY for the paused import-race. It must NOT fire during
 * playback (silent effect drop → wrong frame, the P1) and must NOT fire on a
 * timeout (overload, not an import-race).
 */
import { describe, it, expect } from 'vitest'
import {
  shouldRetryWithEmptyChain,
  shouldEscalateStall,
  RENDER_STALL_THRESHOLD,
} from '../../renderer/utils/renderRetryPolicy'

describe('shouldRetryWithEmptyChain (#429)', () => {
  it('retries a non-empty chain when paused and the error is not a timeout', () => {
    expect(
      shouldRetryWithEmptyChain({
        chainLength: 2,
        isPlaying: false,
        error: 'Engine error: chain not ready',
      }),
    ).toBe(true)
  })

  it('does NOT retry during playback (would silently drop effects)', () => {
    expect(
      shouldRetryWithEmptyChain({
        chainLength: 2,
        isPlaying: true,
        error: 'Engine error: chain not ready',
      }),
    ).toBe(false)
  })

  it('does NOT retry on a timeout, even when paused', () => {
    for (const error of [
      'Engine took too long to respond. Try removing the last effect or reducing chain length.',
      'Socket receive operation timed out',
      'ETIMEDOUT',
    ]) {
      expect(
        shouldRetryWithEmptyChain({ chainLength: 2, isPlaying: false, error }),
      ).toBe(false)
    }
  })

  it('does NOT retry a timeout during playback (the exact #429 repro)', () => {
    expect(
      shouldRetryWithEmptyChain({
        chainLength: 1,
        isPlaying: true,
        error: 'Engine took too long to respond.',
      }),
    ).toBe(false)
  })

  it('does NOT retry an already-empty chain (nothing left to drop)', () => {
    expect(
      shouldRetryWithEmptyChain({ chainLength: 0, isPlaying: false, error: 'boom' }),
    ).toBe(false)
  })

  it('treats undefined/empty error as a non-timeout (retries when paused)', () => {
    expect(
      shouldRetryWithEmptyChain({ chainLength: 3, isPlaying: false, error: undefined }),
    ).toBe(true)
  })
})

describe('shouldEscalateStall (#429 held-frame escalation)', () => {
  it('does NOT escalate a short transient (below threshold)', () => {
    for (let n = 0; n < RENDER_STALL_THRESHOLD; n++) {
      expect(shouldEscalateStall(n)).toBe(false)
    }
  })

  it('escalates once the held run reaches the threshold', () => {
    expect(shouldEscalateStall(RENDER_STALL_THRESHOLD)).toBe(true)
  })

  it('stays escalated while the stall persists (>= threshold)', () => {
    expect(shouldEscalateStall(RENDER_STALL_THRESHOLD + 50)).toBe(true)
  })

  it('a single held frame never escalates (threshold > 1)', () => {
    expect(RENDER_STALL_THRESHOLD).toBeGreaterThan(1)
    expect(shouldEscalateStall(1)).toBe(false)
  })

  it('models reset-on-good-frame: counter back to 0 does not escalate', () => {
    // Simulate a stall that escalates, then a good frame resets the run.
    expect(shouldEscalateStall(RENDER_STALL_THRESHOLD)).toBe(true)
    const afterGoodFrame = 0
    expect(shouldEscalateStall(afterGoodFrame)).toBe(false)
  })
})
