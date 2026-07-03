import { describe, it, expect } from 'vitest'
import { evaluateAutomation, applyEasing, denormalize, isTriggerLane, isParamAutomated } from '../../renderer/utils/automation-evaluate'
import type { AutomationLane, InterpolationMode } from '../../shared/types'

function makeLane(points: Array<{ time: number; value: number; curve?: number }>, mode: InterpolationMode = 'smooth'): AutomationLane {
  return {
    id: 'test-lane',
    paramPath: 'fx-1.amount',
    color: '#4ade80',
    isVisible: true,
    mode,
    points: points.map(p => ({ time: p.time, value: p.value, curve: p.curve ?? 0 })),
  }
}

describe('PR-B Commit-1: InterpolationMode', () => {
  it("'step' mode holds the left point's value (no interpolation)", () => {
    const lane = makeLane([{ time: 0, value: 0 }, { time: 10, value: 1 }], 'step')
    expect(evaluateAutomation(lane, 5)).toBe(0) // smooth would give 0.5
    expect(evaluateAutomation(lane, 9.999)).toBe(0)
    expect(evaluateAutomation(lane, 10)).toBe(1)
  })

  it("'smooth' mode still interpolates linearly", () => {
    const lane = makeLane([{ time: 0, value: 0 }, { time: 10, value: 1 }], 'smooth')
    expect(evaluateAutomation(lane, 5)).toBeCloseTo(0.5)
  })

  it('isTriggerLane is true only for gate/oneShot', () => {
    expect(isTriggerLane({ mode: 'gate' })).toBe(true)
    expect(isTriggerLane({ mode: 'oneShot' })).toBe(true)
    expect(isTriggerLane({ mode: 'smooth' })).toBe(false)
    expect(isTriggerLane({ mode: 'step' })).toBe(false)
  })
})

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

// AA.6 — per-control "is-automated" indicator (Ableton parity §25.1).
// isParamAutomated is the pure helper the LED/dot indicator subscribes to:
// true iff some lane targets the given paramPath AND has >=1 point recorded.
describe('isParamAutomated', () => {
  it('returns true when a lane with matching paramPath has >=1 point', () => {
    const lane = makeLane([{ time: 0, value: 0.5 }])
    lane.paramPath = 'fx-1.amount'
    expect(isParamAutomated('fx-1.amount', [lane])).toBe(true)
  })

  it('returns false when the matching lane has zero points (created but empty)', () => {
    const lane = makeLane([])
    lane.paramPath = 'fx-1.amount'
    expect(isParamAutomated('fx-1.amount', [lane])).toBe(false)
  })

  it('returns false for an empty lanes array', () => {
    expect(isParamAutomated('fx-1.amount', [])).toBe(false)
  })

  it('returns false when no lane matches the paramPath', () => {
    const lane = makeLane([{ time: 0, value: 0.5 }])
    lane.paramPath = 'fx-1.other-param'
    expect(isParamAutomated('fx-1.amount', [lane])).toBe(false)
  })

  it('returns true when matching lane is among several non-matching lanes', () => {
    const matching = makeLane([{ time: 0, value: 1 }])
    matching.paramPath = 'fx-2.rate'
    const nonMatching1 = makeLane([{ time: 0, value: 0 }])
    nonMatching1.paramPath = 'fx-1.amount'
    const nonMatchingEmpty = makeLane([])
    nonMatchingEmpty.paramPath = 'fx-2.rate' // matches path but has no points
    expect(isParamAutomated('fx-2.rate', [nonMatching1, matching, nonMatchingEmpty])).toBe(true)
  })

  it('is paramPath-exact — does not match on prefix/substring (e.g. different effect instance)', () => {
    const lane = makeLane([{ time: 0, value: 0.5 }])
    lane.paramPath = 'fx-10.amount'
    expect(isParamAutomated('fx-1.amount', [lane])).toBe(false)
  })
})

// AA.1 — regression guard: curve=0 everywhere must stay byte-identical to
// plain linear interpolation, proving the curve-tension work in this pass
// (AutomationNode alt-drag, automation-simplify re-fit) didn't perturb the
// no-curve playback path.
describe('AA.1 regression: curve=0 is byte-identical to linear interpolation', () => {
  function linearInterp(points: Array<{ time: number; value: number }>, time: number): number | null {
    if (points.length === 0) return null
    if (points.length === 1) return points[0].value
    if (time <= points[0].time) return points[0].value
    if (time >= points[points.length - 1].time) return points[points.length - 1].value
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i]
      const b = points[i + 1]
      if (time >= a.time && time <= b.time) {
        const duration = b.time - a.time
        if (duration === 0) return a.value
        const t = (time - a.time) / duration
        return a.value + (b.value - a.value) * t
      }
    }
    return null
  }

  it('matches a hand-rolled linear interpolation at many sample times (all curve=0)', () => {
    const rawPoints = [
      { time: 0, value: 0 },
      { time: 3, value: 0.25 },
      { time: 5, value: 0.9 },
      { time: 8, value: 0.1 },
      { time: 12, value: 0.6 },
    ]
    const lane = makeLane(rawPoints) // curve defaults to 0 via makeLane's ?? 0
    const boundaryTimes = new Set(rawPoints.map(p => p.time))

    // Use i * 0.25 (exact in binary, 0.25 = 2^-2) instead of accumulating
    // `time += 0.25`, which drifts by ~1e-16 per step and can nudge a sample
    // time to sit just off an exact point boundary — genuinely ambiguous
    // segment selection (a+(b-a) !== b is a known FP identity, not something
    // this pass changed), which is a false-positive regression signal, not
    // a real one. Boundary times themselves are skipped for the same reason.
    for (let i = -4; i <= 52; i++) {
      const time = i * 0.25
      if (boundaryTimes.has(time)) continue
      const actual = evaluateAutomation(lane, time)
      const expected = linearInterp(rawPoints, time)
      expect(actual).toBe(expected)
    }
  })

  it('applyEasing(t, 0) is the identity function for all t (byte-identical, not just close)', () => {
    for (let t = 0; t <= 1; t += 0.05) {
      expect(applyEasing(t, 0)).toBe(t)
    }
  })

  it('a two-point curve=0 lane matches the linear-interpolation smoke test above', () => {
    const lane = makeLane([
      { time: 0, value: 0 },
      { time: 10, value: 1 },
    ])
    expect(evaluateAutomation(lane, 5)).toBe(0.5)
    expect(evaluateAutomation(lane, 2.5)).toBe(0.25)
    expect(evaluateAutomation(lane, 7.5)).toBe(0.75)
  })
})
