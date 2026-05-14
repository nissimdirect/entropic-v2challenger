/**
 * F-0512-16 follow-up: handleStop loop-region clear gate.
 *
 * Validator's 2026-05-13 UAT pass observed that Escape×2 and k×2 from a
 * ruler-clicked "0" position never fired clearLoopRegion. Root cause: the
 * strict `playheadTime === 0` gate fails on the FIRST press because a ruler
 * click typically yields a sub-epsilon float (0.0001s), and the ref-based
 * timer guard added stale-data fragility. The extracted predicate uses an
 * epsilon and drops the timer-ref check.
 */
import { describe, it, expect } from 'vitest'
import { shouldClearLoopOnStop } from '../../renderer/utils/transport-stop'

const LOOP = { in: 1.5, out: 4.0 }

describe('shouldClearLoopOnStop — F-0512-16 follow-up', () => {
  it('fires when playhead is exactly zero and no audio is playing', () => {
    expect(shouldClearLoopOnStop(0, false, LOOP)).toBe(true)
  })

  it('fires when playhead is within epsilon of zero (sub-millisecond drift)', () => {
    // Reproduces the validator scenario: clicking the ruler at the leftmost
    // pixel yielded a sub-epsilon float that failed strict-equality on the
    // first press.
    expect(shouldClearLoopOnStop(0.0001, false, LOOP)).toBe(true)
    expect(shouldClearLoopOnStop(0.005, false, LOOP)).toBe(true)
    // Just under the threshold.
    expect(shouldClearLoopOnStop(0.009, false, LOOP)).toBe(true)
  })

  it('does NOT fire above the epsilon — playhead clearly off-zero is a no-op for clear', () => {
    expect(shouldClearLoopOnStop(0.01, false, LOOP)).toBe(false)
    expect(shouldClearLoopOnStop(0.5, false, LOOP)).toBe(false)
    expect(shouldClearLoopOnStop(4.5, false, LOOP)).toBe(false)
  })

  it('respects negative drift symmetrically (Math.abs)', () => {
    // Pathological setPlayheadTime values from clamp bugs etc. shouldn't
    // accidentally bypass the gate.
    expect(shouldClearLoopOnStop(-0.001, false, LOOP)).toBe(true)
    expect(shouldClearLoopOnStop(-0.5, false, LOOP)).toBe(false)
  })

  it('does NOT fire while audio is actively playing — don\'t yank the loop mid-playback', () => {
    expect(shouldClearLoopOnStop(0, true, LOOP)).toBe(false)
    expect(shouldClearLoopOnStop(0.0001, true, LOOP)).toBe(false)
  })

  it('does NOT fire when no loop region is set — nothing to clear', () => {
    expect(shouldClearLoopOnStop(0, false, null)).toBe(false)
    expect(shouldClearLoopOnStop(0.0001, false, null)).toBe(false)
  })
})
