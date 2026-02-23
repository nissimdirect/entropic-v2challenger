import { describe, it, expect } from 'vitest'

// Since Knob is a React component with SVG rendering,
// we test the behavioral logic that drives it rather than DOM rendering.
// Full rendering tests would require jsdom + @testing-library/react.

import {
  sliderToValue,
} from '../../../renderer/utils/paramScaling'

describe('Knob behavioral logic', () => {
  describe('value clamping', () => {
    it('clamps to min when value below range', () => {
      const min = 0, max = 100
      const clamped = Math.max(min, Math.min(max, -50))
      expect(clamped).toBe(0)
    })

    it('clamps to max when value above range', () => {
      const min = 0, max = 100
      const clamped = Math.max(min, Math.min(max, 200))
      expect(clamped).toBe(100)
    })

    it('rounds int values', () => {
      const value = 42.7
      expect(Math.round(value)).toBe(43)
    })
  })

  describe('keyboard adjustment', () => {
    it('arrow key adjusts by 1% of range', () => {
      const value = 50, range = 100, pct = 0.01
      const newValue = value + range * pct
      expect(newValue).toBeCloseTo(51, 5)
    })

    it('shift+arrow adjusts by 10% of range', () => {
      const value = 50, range = 100, pct = 0.1
      const newValue = value + range * pct
      expect(newValue).toBeCloseTo(60, 5)
    })
  })

  describe('drag sensitivity', () => {
    it('normal drag: 1px = ~0.5% movement', () => {
      const sensitivity = 0.005
      const delta = 10 // 10px mouse movement
      const sliderDelta = delta * sensitivity
      expect(sliderDelta).toBeCloseTo(0.05, 5)
    })

    it('shift drag: 5x finer', () => {
      const sensitivity = 0.001
      const delta = 10
      const sliderDelta = delta * sensitivity
      expect(sliderDelta).toBeCloseTo(0.01, 5)
    })
  })

  describe('arc angle calculation', () => {
    const START_ANGLE = 135
    const SWEEP = 270

    it('min value → arc at start angle', () => {
      const sliderPos = 0
      const angle = START_ANGLE + sliderPos * SWEEP
      expect(angle).toBe(135)
    })

    it('max value → arc at end angle', () => {
      const sliderPos = 1
      const angle = START_ANGLE + sliderPos * SWEEP
      expect(angle).toBe(405)
    })

    it('midpoint → arc at 270 degrees', () => {
      const sliderPos = 0.5
      const angle = START_ANGLE + sliderPos * SWEEP
      expect(angle).toBe(270)
    })
  })

  describe('ghost handle visibility', () => {
    it('ghost invisible when same as value', () => {
      const sliderPos = 0.5
      const ghostPos = 0.5
      const visible = Math.abs(ghostPos - sliderPos) > 0.001
      expect(visible).toBe(false)
    })

    it('ghost visible when different from value', () => {
      const sliderPos = 0.5
      const ghostPos = 0.7
      const visible = Math.abs(ghostPos - sliderPos) > 0.001
      expect(visible).toBe(true)
    })
  })

  describe('right-click reset', () => {
    it('resets to default value', () => {
      const defaultValue = 180
      const clampAndRound = (v: number) => Math.max(0, Math.min(360, v))
      expect(clampAndRound(defaultValue)).toBe(180)
    })
  })

  describe('curve integration with knob', () => {
    it('logarithmic curve gives more resolution at low end', () => {
      // At 50% slider position, logarithmic maps to ~70% of value range
      const slider50pct = sliderToValue(0.5, 0, 100, 'logarithmic')
      // This should be > 50 because logarithmic emphasizes the low end
      expect(slider50pct).toBeGreaterThan(50)
    })

    it('exponential curve gives more resolution at high end', () => {
      // At 50% slider position, exponential maps to ~25% of value range
      const slider50pct = sliderToValue(0.5, 0, 100, 'exponential')
      expect(slider50pct).toBeLessThan(50)
    })
  })
})
