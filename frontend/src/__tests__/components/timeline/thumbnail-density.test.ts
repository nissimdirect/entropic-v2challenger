/**
 * Task #19 — Timeline clip thumbnail density tests
 *
 * Named tests:
 * 1. thumbnailCount is monotonic non-decreasing as clip px width grows
 * 2. thumbnailCount caps at THUMBNAIL_MAX_COUNT for huge widths
 * 3. thumbnailCount never drops below THUMBNAIL_MIN_COUNT (min 1) at low zoom
 * 4. thumbnailCount handles degenerate input (0, negative, NaN, Infinity) (NEGATIVE)
 * 5. selectThumbnails evenly subsamples down to the requested count
 * 6. selectThumbnails returns the pool unchanged when pool <= count (NEGATIVE)
 */

import { describe, it, expect } from 'vitest'
import {
  thumbnailCount,
  selectThumbnails,
  THUMBNAIL_MIN_COUNT,
  THUMBNAIL_MAX_COUNT,
  THUMBNAIL_PX_PER_FRAME,
} from '../../../renderer/utils/thumbnail-density'

// ============================================================
// 1. monotonic non-decreasing across small/medium/huge widths
// ============================================================
describe('thumbnailCount is monotonic non-decreasing', () => {
  it('never decreases as clip px width grows', () => {
    const widths = [0, 1, 10, 50, 80, 100, 150, 200, 350, 500, 800, 1200, 2000, 5000, 50000]
    let prev = -Infinity
    for (const w of widths) {
      const count = thumbnailCount(w)
      expect(count).toBeGreaterThanOrEqual(prev)
      prev = count
    }
  })

  it('gives a wider clip strictly more (or equal) thumbnails than a narrower one', () => {
    const narrow = thumbnailCount(50) // < 1 frame worth of px -> min
    const medium = thumbnailCount(400) // several frames worth
    const huge = thumbnailCount(5000) // far beyond max
    expect(medium).toBeGreaterThan(narrow)
    expect(huge).toBeGreaterThan(medium)
  })
})

// ============================================================
// 2. capped at THUMBNAIL_MAX_COUNT
// ============================================================
describe('thumbnailCount caps at THUMBNAIL_MAX_COUNT', () => {
  it('huge width (50000px) does not exceed the cap', () => {
    expect(thumbnailCount(50000)).toBe(THUMBNAIL_MAX_COUNT)
  })

  it('exactly at the cap boundary width', () => {
    const boundaryWidth = THUMBNAIL_PX_PER_FRAME * THUMBNAIL_MAX_COUNT
    expect(thumbnailCount(boundaryWidth)).toBe(THUMBNAIL_MAX_COUNT)
    expect(thumbnailCount(boundaryWidth * 10)).toBe(THUMBNAIL_MAX_COUNT)
  })
})

// ============================================================
// 3. min 1 at low zoom (graceful degradation)
// ============================================================
describe('thumbnailCount never drops below THUMBNAIL_MIN_COUNT', () => {
  it('tiny clip width (small px) still yields at least 1', () => {
    expect(thumbnailCount(1)).toBe(THUMBNAIL_MIN_COUNT)
    expect(thumbnailCount(10)).toBe(THUMBNAIL_MIN_COUNT)
  })
})

// ============================================================
// 4. degenerate input (NEGATIVE)
// ============================================================
describe('thumbnailCount handles degenerate input', () => {
  it('zero width yields min count, not zero', () => {
    expect(thumbnailCount(0)).toBe(THUMBNAIL_MIN_COUNT)
  })

  it('negative width yields min count, never negative/NaN', () => {
    expect(thumbnailCount(-100)).toBe(THUMBNAIL_MIN_COUNT)
  })

  it('NaN width yields min count, not NaN', () => {
    expect(thumbnailCount(NaN)).toBe(THUMBNAIL_MIN_COUNT)
  })

  it('Infinity width is clamped to the max, not Infinity', () => {
    expect(thumbnailCount(Infinity)).toBe(THUMBNAIL_MAX_COUNT)
  })
})

// ============================================================
// 5. selectThumbnails evenly subsamples
// ============================================================
describe('selectThumbnails evenly subsamples the pool', () => {
  it('picks the requested count, including first and last items', () => {
    const pool = Array.from({ length: 12 }, (_, i) => i)
    const picked = selectThumbnails(pool, 4)
    expect(picked.length).toBe(4)
    expect(picked[0]).toBe(0)
    expect(picked[picked.length - 1]).toBe(11)
  })

  it('count of 1 returns just the first item', () => {
    const pool = Array.from({ length: 12 }, (_, i) => i)
    expect(selectThumbnails(pool, 1)).toEqual([0])
  })

  it('preserves original ordering (playback order)', () => {
    const pool = Array.from({ length: 12 }, (_, i) => i)
    const picked = selectThumbnails(pool, 5)
    const sorted = [...picked].sort((a, b) => a - b)
    expect(picked).toEqual(sorted)
  })
})

// ============================================================
// 6. pool smaller than requested count (NEGATIVE)
// ============================================================
describe('selectThumbnails does not fabricate frames', () => {
  it('returns the pool unchanged when pool.length <= count', () => {
    const pool = [0, 1, 2]
    expect(selectThumbnails(pool, 12)).toBe(pool)
  })

  it('empty pool returns empty array', () => {
    expect(selectThumbnails([], 8)).toEqual([])
  })
})
