import { describe, it, expect } from 'vitest'
import { recordPoint, recordDrawStroke } from '../../renderer/utils/automation-record'
import type { AutomationPoint } from '../../shared/types'

function pt(time: number, value: number, curve = 0): AutomationPoint {
  return { time, value, curve }
}

describe('recordPoint', () => {
  it('inserts into empty array', () => {
    const result = recordPoint([], 1.0, 0.5)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual(pt(1.0, 0.5))
  })

  it('replaces nearby point within threshold', () => {
    const existing = [pt(0, 0), pt(1.0, 0.3), pt(2, 1)]
    const result = recordPoint(existing, 1.02, 0.8, 0.033)
    expect(result).toHaveLength(3)
    // The point at t=1.0 should be replaced
    expect(result[1]).toEqual(pt(1.02, 0.8))
  })

  it('inserts in sorted order', () => {
    const existing = [pt(0, 0), pt(2, 1)]
    const result = recordPoint(existing, 1, 0.5)
    expect(result).toHaveLength(3)
    expect(result[0].time).toBe(0)
    expect(result[1].time).toBe(1)
    expect(result[2].time).toBe(2)
  })
})

describe('recordDrawStroke', () => {
  it('merges stroke with existing points', () => {
    const existing = [pt(0, 0), pt(1, 0.5, 0.5), pt(2, 1)]
    const stroke = [
      { time: 0.5, value: 0.3 },
      { time: 1.0005, value: 0.7 }, // within 0.001 of existing t=1
      { time: 1.5, value: 0.9 },
    ]
    const result = recordDrawStroke(existing, stroke)

    // t=1 existing should be replaced by stroke point at 1.0005
    expect(result.find((p) => p.time === 1)).toBeUndefined()
    expect(result.find((p) => p.time === 1.0005)).toBeDefined()

    // Result should be sorted
    for (let i = 1; i < result.length; i++) {
      expect(result[i].time).toBeGreaterThanOrEqual(result[i - 1].time)
    }

    // All stroke points have curve=0
    const strokeTimes = new Set([0.5, 1.0005, 1.5])
    result
      .filter((p) => strokeTimes.has(p.time))
      .forEach((p) => expect(p.curve).toBe(0))
  })
})
