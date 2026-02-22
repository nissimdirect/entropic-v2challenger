import { describe, it, expect } from 'vitest'

/**
 * Tests for preview canvas logic — frame display, scrub behavior.
 */

function frameIndexFromTime(timeSeconds: number, fps: number): number {
  return Math.floor(timeSeconds * fps)
}

function clampFrame(index: number, totalFrames: number): number {
  return Math.max(0, Math.min(index, totalFrames - 1))
}

function scrubToPercent(percent: number, totalFrames: number): number {
  const index = Math.round(percent * (totalFrames - 1))
  return clampFrame(index, totalFrames)
}

describe('PreviewCanvas frame logic', () => {
  it('converts time to frame index', () => {
    expect(frameIndexFromTime(0, 30)).toBe(0)
    expect(frameIndexFromTime(1.0, 30)).toBe(30)
    expect(frameIndexFromTime(0.5, 30)).toBe(15)
  })

  it('clamps frame to valid range', () => {
    expect(clampFrame(-1, 150)).toBe(0)
    expect(clampFrame(0, 150)).toBe(0)
    expect(clampFrame(149, 150)).toBe(149)
    expect(clampFrame(200, 150)).toBe(149)
  })

  it('scrubs to start at 0%', () => {
    expect(scrubToPercent(0, 150)).toBe(0)
  })

  it('scrubs to end at 100%', () => {
    expect(scrubToPercent(1.0, 150)).toBe(149)
  })

  it('scrubs to middle at 50%', () => {
    const frame = scrubToPercent(0.5, 150)
    expect(frame).toBeGreaterThan(60)
    expect(frame).toBeLessThan(90)
  })

  it('handles single frame video', () => {
    expect(scrubToPercent(0, 1)).toBe(0)
    expect(scrubToPercent(1, 1)).toBe(0)
  })
})
