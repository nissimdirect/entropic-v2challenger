import { describe, it, expect } from 'vitest'
import { evaluateAutomation, applyEasing, denormalize } from '../../renderer/utils/automation-evaluate'
import type { AutomationLane } from '../../shared/types'

function makeLane(points: Array<{ time: number; value: number; curve?: number }>): AutomationLane {
  return {
    id: 'test-lane',
    paramPath: 'fx-1.amount',
    color: '#4ade80',
    isVisible: true,
    points: points.map(p => ({ time: p.time, value: p.value, curve: p.curve ?? 0 })),
  }
}

describe('evaluateAutomation', () => {
  it('returns null for empty lane', () => {
    const lane = makeLane([])
    expect(evaluateAutomation(lane, 5)).toBeNull()
  })

  it('returns constant value for single point regardless of time', () => {
    const lane = makeLane([{ time: 2, value: 0.7 }])
    expect(evaluateAutomation(lane, 0)).toBe(0.7)
    expect(evaluateAutomation(lane, 2)).toBe(0.7)
    expect(evaluateAutomation(lane, 100)).toBe(0.7)
  })

  it('linearly interpolates between two points (curve=0)', () => {
    const lane = makeLane([
      { time: 0, value: 0 },
      { time: 10, value: 1 },
    ])
    expect(evaluateAutomation(lane, 5)).toBeCloseTo(0.5)
    expect(evaluateAutomation(lane, 2.5)).toBeCloseTo(0.25)
  })

  it('ease-in curve produces value below linear midpoint', () => {
    const lane = makeLane([
      { time: 0, value: 0, curve: -1 },
      { time: 10, value: 1 },
    ])
    const val = evaluateAutomation(lane, 5)!
    expect(val).toBeLessThan(0.5)
  })

  it('ease-out curve produces value above linear midpoint', () => {
    const lane = makeLane([
      { time: 0, value: 0, curve: 1 },
      { time: 10, value: 1 },
    ])
    const val = evaluateAutomation(lane, 5)!
    expect(val).toBeGreaterThan(0.5)
  })

  it('returns first point value before first point time', () => {
    const lane = makeLane([
      { time: 5, value: 0.3 },
      { time: 10, value: 0.8 },
    ])
    expect(evaluateAutomation(lane, 0)).toBe(0.3)
    expect(evaluateAutomation(lane, 4.99)).toBe(0.3)
  })

  it('returns last point value after last point time', () => {
    const lane = makeLane([
      { time: 0, value: 0.1 },
      { time: 5, value: 0.9 },
    ])
    expect(evaluateAutomation(lane, 5)).toBe(0.9)
    expect(evaluateAutomation(lane, 100)).toBe(0.9)
  })

  it('binary search is correct with 100 points', () => {
    const points = Array.from({ length: 100 }, (_, i) => ({
      time: i,
      value: i / 99,
    }))
    const lane = makeLane(points)
    // Midpoint of segment [50, 51] at t=50.5 with linear curve
    const val = evaluateAutomation(lane, 50.5)!
    const expected = (50 / 99 + 51 / 99) / 2
    expect(val).toBeCloseTo(expected, 6)
  })

  it('handles zero-duration segment (same time) without crash', () => {
    const lane = makeLane([
      { time: 5, value: 0.2 },
      { time: 5, value: 0.8 },
    ])
    const val = evaluateAutomation(lane, 5)
    expect(val).toBe(0.2)
  })

  it('handles duplicate time points gracefully', () => {
    const lane = makeLane([
      { time: 0, value: 0 },
      { time: 5, value: 0.4 },
      { time: 5, value: 0.6 },
      { time: 10, value: 1 },
    ])
    // Should not crash; value at time 5 should come from one of the duplicate points
    const val = evaluateAutomation(lane, 5)
    expect(val).not.toBeNull()
    expect(val).toBeGreaterThanOrEqual(0)
    expect(val).toBeLessThanOrEqual(1)
  })
})

describe('denormalize', () => {
  it('maps 0 to min, 1 to max, 0.5 to midpoint', () => {
    expect(denormalize(0, 20, 80)).toBe(20)
    expect(denormalize(1, 20, 80)).toBe(80)
    expect(denormalize(0.5, 20, 80)).toBe(50)
  })
})

describe('applyEasing', () => {
  it('returns 0.5 for linear curve at midpoint', () => {
    expect(applyEasing(0.5, 0)).toBe(0.5)
  })
})
