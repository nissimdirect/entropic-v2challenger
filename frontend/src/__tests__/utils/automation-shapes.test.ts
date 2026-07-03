/**
 * AA.3a — Insert Automation Shape: pure shape generator (generateShapePoints).
 *
 * Hard oracle:
 * - sine has correct zero-crossings/peaks
 * - triangle has correct zero-crossings/peaks (same phase convention as sine)
 * - ramp-up/ramp-down are monotonic (ignore `cycles`)
 * - square alternates between two levels
 * - saw-up/saw-down have opposite sign progression within a cycle
 * - count/amplitude honored
 * - values always clamped to [min, max]
 * - random is a seeded sample-and-hold (deterministic per `phase`, held over steps)
 */
import { describe, it, expect } from 'vitest'
import { generateShapePoints, defaultShapePointCount } from '../../renderer/utils/automation-shapes'

describe('generateShapePoints', () => {
  it('sine: zero-crossings at u=0/0.5/1, peak at u=0.25, trough at u=0.75', () => {
    const pts = generateShapePoints('sine', {
      cycles: 1,
      amplitude: 1,
      min: 0,
      max: 1,
      startTime: 0,
      endTime: 4,
      count: 5, // u = 0, 0.25, 0.5, 0.75, 1
    })
    expect(pts).toHaveLength(5)
    expect(pts[0].value).toBeCloseTo(0.5) // zero crossing (center)
    expect(pts[1].value).toBeCloseTo(1.0) // peak
    expect(pts[2].value).toBeCloseTo(0.5) // zero crossing
    expect(pts[3].value).toBeCloseTo(0.0) // trough
    expect(pts[4].value).toBeCloseTo(0.5) // zero crossing
  })

  it('triangle: same zero-crossing/peak/trough positions as sine', () => {
    const pts = generateShapePoints('triangle', {
      cycles: 1,
      amplitude: 1,
      min: 0,
      max: 1,
      startTime: 0,
      endTime: 4,
      count: 5,
    })
    expect(pts[0].value).toBeCloseTo(0.5)
    expect(pts[1].value).toBeCloseTo(1.0)
    expect(pts[2].value).toBeCloseTo(0.5)
    expect(pts[3].value).toBeCloseTo(0.0)
    expect(pts[4].value).toBeCloseTo(0.5)
  })

  it('triangle is piecewise-linear (unlike sine) between the same landmarks', () => {
    const pts = generateShapePoints('triangle', {
      cycles: 1,
      amplitude: 1,
      min: 0,
      max: 1,
      startTime: 0,
      endTime: 8,
      count: 9, // u steps of 0.125
    })
    // Rising segment 0 -> 0.25 (indices 0,1,2) is exactly linear.
    const step = pts[1].value - pts[0].value
    expect(pts[2].value - pts[1].value).toBeCloseTo(step)
  })

  it('ramp-up is strictly monotonic increasing, ignoring `cycles`', () => {
    for (const cycles of [1, 4, 17]) {
      const pts = generateShapePoints('ramp-up', {
        cycles,
        amplitude: 1,
        min: 0,
        max: 1,
        startTime: 0,
        endTime: 10,
        count: 20,
      })
      for (let i = 1; i < pts.length; i++) {
        expect(pts[i].value).toBeGreaterThanOrEqual(pts[i - 1].value)
      }
      expect(pts[0].value).toBeCloseTo(0)
      expect(pts[pts.length - 1].value).toBeCloseTo(1)
    }
  })

  it('ramp-down is strictly monotonic decreasing, ignoring `cycles`', () => {
    const pts = generateShapePoints('ramp-down', {
      cycles: 9,
      amplitude: 1,
      min: 0,
      max: 1,
      startTime: 0,
      endTime: 10,
      count: 20,
    })
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i].value).toBeLessThanOrEqual(pts[i - 1].value)
    }
    expect(pts[0].value).toBeCloseTo(1)
    expect(pts[pts.length - 1].value).toBeCloseTo(0)
  })

  it('square alternates between exactly two levels, half a cycle apart', () => {
    const pts = generateShapePoints('square', {
      cycles: 2,
      amplitude: 1,
      min: 0,
      max: 1,
      startTime: 0,
      endTime: 8,
      count: 9, // u = 0, 0.125, ..., 1 -> cyclePos = 0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2
    })
    const values = pts.map((p) => p.value)
    const uniq = new Set(values.map((v) => Math.round(v * 1000) / 1000))
    expect(uniq.size).toBe(2)
    expect(Math.min(...values)).toBeCloseTo(0)
    expect(Math.max(...values)).toBeCloseTo(1)
    // Alternation: within the first cycle, first half differs from second half.
    expect(values[0]).not.toBeCloseTo(values[2]) // u=0 (cyclePos 0) vs u=0.25 (cyclePos 0.5)
  })

  it('saw-up rises within each cycle (starts low, ends near-high, then resets)', () => {
    const pts = generateShapePoints('saw-up', {
      cycles: 1,
      amplitude: 1,
      min: 0,
      max: 1,
      startTime: 0,
      endTime: 4,
      count: 5,
    })
    expect(pts[0].value).toBeCloseTo(0) // start of cycle -> min
    expect(pts[1].value).toBeGreaterThan(pts[0].value)
    expect(pts[2].value).toBeGreaterThan(pts[1].value)
    expect(pts[3].value).toBeGreaterThan(pts[2].value)
  })

  it('saw-down falls within each cycle (starts high, ends near-low) — opposite sign of saw-up', () => {
    const up = generateShapePoints('saw-up', {
      cycles: 1, amplitude: 1, min: 0, max: 1, startTime: 0, endTime: 4, count: 5,
    })
    const down = generateShapePoints('saw-down', {
      cycles: 1, amplitude: 1, min: 0, max: 1, startTime: 0, endTime: 4, count: 5,
    })
    expect(down[0].value).toBeCloseTo(1) // start of cycle -> max
    expect(down[1].value).toBeLessThan(down[0].value)
    // Opposite progression from saw-up at every interior sample.
    for (let i = 0; i < 4; i++) {
      expect(down[i].value).toBeCloseTo(1 - up[i].value)
    }
  })

  it('count is honored — exact output length (clamped to >= 2 for a non-zero span)', () => {
    expect(generateShapePoints('sine', { cycles: 1, amplitude: 1, startTime: 0, endTime: 1, count: 33 })).toHaveLength(33)
    expect(generateShapePoints('sine', { cycles: 1, amplitude: 1, startTime: 0, endTime: 1, count: 1 })).toHaveLength(2)
    expect(generateShapePoints('sine', { cycles: 1, amplitude: 1, startTime: 0, endTime: 1, count: 0 })).toHaveLength(2)
  })

  it('points are evenly spaced across [startTime, endTime], inclusive of both ends', () => {
    const pts = generateShapePoints('sine', { cycles: 1, amplitude: 1, startTime: 10, endTime: 20, count: 5 })
    expect(pts.map((p) => p.time)).toEqual([10, 12.5, 15, 17.5, 20])
  })

  it('amplitude is honored — scales deviation from the [min,max] midpoint', () => {
    const full = generateShapePoints('sine', { cycles: 1, amplitude: 1, min: 0, max: 1, startTime: 0, endTime: 4, count: 5 })
    const half = generateShapePoints('sine', { cycles: 1, amplitude: 0.5, min: 0, max: 1, startTime: 0, endTime: 4, count: 5 })
    const zero = generateShapePoints('sine', { cycles: 1, amplitude: 0, min: 0, max: 1, startTime: 0, endTime: 4, count: 5 })
    expect(full[1].value).toBeCloseTo(1.0) // peak at full amplitude -> touches max
    expect(half[1].value).toBeCloseTo(0.75) // half swing -> halfway to max
    expect(zero.every((p) => Math.abs(p.value - 0.5) < 1e-9)).toBe(true) // amplitude 0 -> flat line at midpoint
  })

  it('values are always clamped to [min, max] even with an out-of-range amplitude', () => {
    const pts = generateShapePoints('sine', { cycles: 1, amplitude: 5, min: 0.2, max: 0.8, startTime: 0, endTime: 4, count: 9 })
    for (const p of pts) {
      expect(p.value).toBeGreaterThanOrEqual(0.2)
      expect(p.value).toBeLessThanOrEqual(0.8)
    }
  })

  it('min/max can be given in reversed order without breaking clamping', () => {
    const pts = generateShapePoints('sine', { cycles: 1, amplitude: 1, min: 1, max: 0, startTime: 0, endTime: 4, count: 5 })
    for (const p of pts) {
      expect(p.value).toBeGreaterThanOrEqual(0)
      expect(p.value).toBeLessThanOrEqual(1)
    }
  })

  it('random: deterministic per `phase` (same seed -> identical sequence)', () => {
    const a = generateShapePoints('random', { cycles: 4, amplitude: 1, phase: 0.42, startTime: 0, endTime: 8, count: 32 })
    const b = generateShapePoints('random', { cycles: 4, amplitude: 1, phase: 0.42, startTime: 0, endTime: 8, count: 32 })
    expect(a.map((p) => p.value)).toEqual(b.map((p) => p.value))
  })

  it('random: a different `phase` seed produces a different sequence', () => {
    const a = generateShapePoints('random', { cycles: 4, amplitude: 1, phase: 0.1, startTime: 0, endTime: 8, count: 32 })
    const b = generateShapePoints('random', { cycles: 4, amplitude: 1, phase: 0.9, startTime: 0, endTime: 8, count: 32 })
    expect(a.map((p) => p.value)).not.toEqual(b.map((p) => p.value))
  })

  it('random: sample-and-hold — value is held constant across the points within one step', () => {
    // 4 steps ("cycles" reused as step count for random) over 32 points -> 8 points/step.
    const pts = generateShapePoints('random', { cycles: 4, amplitude: 1, phase: 0.7, min: 0, max: 1, startTime: 0, endTime: 8, count: 32 })
    // First 8 points (step 0) should all share the same value.
    const step0 = pts.slice(0, 8).map((p) => p.value)
    expect(new Set(step0.map((v) => Math.round(v * 1e9))).size).toBe(1)
    // Different steps should (almost certainly) differ.
    expect(pts[0].value).not.toBeCloseTo(pts[8].value)
  })

  it('random: values stay within [min, max]', () => {
    const pts = generateShapePoints('random', { cycles: 5, amplitude: 1, min: 0.1, max: 0.9, startTime: 0, endTime: 5, count: 25 })
    for (const p of pts) {
      expect(p.value).toBeGreaterThanOrEqual(0.1)
      expect(p.value).toBeLessThanOrEqual(0.9)
    }
  })

  it('every generated point carries curve: 0 (linear)', () => {
    const pts = generateShapePoints('sine', { cycles: 1, amplitude: 1, startTime: 0, endTime: 4, count: 5 })
    expect(pts.every((p) => p.curve === 0)).toBe(true)
  })

  it('degenerate zero-width span (startTime === endTime) returns a single point, not NaN', () => {
    const pts = generateShapePoints('sine', { cycles: 1, amplitude: 1, startTime: 3, endTime: 3, count: 5 })
    expect(pts).toHaveLength(1)
    expect(pts[0].time).toBe(3)
    expect(Number.isFinite(pts[0].value)).toBe(true)
  })
})

describe('defaultShapePointCount', () => {
  it('scales with cycles and is clamped to [8, 512]', () => {
    expect(defaultShapePointCount(1)).toBe(16)
    expect(defaultShapePointCount(0.1)).toBe(8) // clamped up to the floor
    expect(defaultShapePointCount(100)).toBe(512) // clamped down to the ceiling
  })

  it('falls back to cycles=1 behavior for invalid input', () => {
    expect(defaultShapePointCount(NaN)).toBe(defaultShapePointCount(1))
    expect(defaultShapePointCount(-3)).toBe(defaultShapePointCount(1))
  })
})
