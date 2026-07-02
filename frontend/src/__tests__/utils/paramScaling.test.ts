import { describe, it, expect } from 'vitest'
import {
  normalizedToScaled,
  scaledToNormalized,
  valueToSlider,
  sliderToValue,
  formatParamValue,
} from '../../renderer/utils/paramScaling'

describe('normalizedToScaled', () => {
  it('linear: 0.5 → 0.5', () => {
    expect(normalizedToScaled(0.5, 'linear')).toBeCloseTo(0.5, 5)
  })

  it('linear: boundaries 0 and 1', () => {
    expect(normalizedToScaled(0, 'linear')).toBe(0)
    expect(normalizedToScaled(1, 'linear')).toBe(1)
  })

  it('logarithmic: 0.5 → ~0.74', () => {
    const result = normalizedToScaled(0.5, 'logarithmic')
    // log1p(0.5 * 9) / log(10) = log1p(4.5) / log(10) ≈ 0.7404
    expect(result).toBeCloseTo(0.7404, 2)
  })

  it('logarithmic: boundaries', () => {
    expect(normalizedToScaled(0, 'logarithmic')).toBeCloseTo(0, 5)
    expect(normalizedToScaled(1, 'logarithmic')).toBeCloseTo(1, 5)
  })

  it('exponential: 0.5 → ~0.24', () => {
    const result = normalizedToScaled(0.5, 'exponential')
    // (10^0.5 - 1) / 9 ≈ 0.2403
    expect(result).toBeCloseTo(0.2403, 2)
  })

  it('exponential: boundaries', () => {
    expect(normalizedToScaled(0, 'exponential')).toBeCloseTo(0, 5)
    expect(normalizedToScaled(1, 'exponential')).toBeCloseTo(1, 5)
  })

  it('s-curve: 0.5 → 0.5 (inflection point)', () => {
    expect(normalizedToScaled(0.5, 's-curve')).toBeCloseTo(0.5, 5)
  })

  it('s-curve: boundaries', () => {
    expect(normalizedToScaled(0, 's-curve')).toBeCloseTo(0, 5)
    expect(normalizedToScaled(1, 's-curve')).toBeCloseTo(1, 5)
  })

  it('clamps input to [0, 1]', () => {
    expect(normalizedToScaled(-0.5, 'linear')).toBe(0)
    expect(normalizedToScaled(1.5, 'linear')).toBe(1)
  })
})

describe('scaledToNormalized', () => {
  it('linear round-trip', () => {
    for (const x of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
      expect(scaledToNormalized(normalizedToScaled(x, 'linear'), 'linear')).toBeCloseTo(x, 5)
    }
  })

  it('logarithmic round-trip', () => {
    for (const x of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
      expect(scaledToNormalized(normalizedToScaled(x, 'logarithmic'), 'logarithmic')).toBeCloseTo(x, 3)
    }
  })

  it('exponential round-trip', () => {
    for (const x of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
      expect(scaledToNormalized(normalizedToScaled(x, 'exponential'), 'exponential')).toBeCloseTo(x, 3)
    }
  })

  it('s-curve round-trip', () => {
    for (const x of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
      expect(scaledToNormalized(normalizedToScaled(x, 's-curve'), 's-curve')).toBeCloseTo(x, 3)
    }
  })
})

describe('valueToSlider / sliderToValue', () => {
  it('linear: value at midpoint → slider at 0.5', () => {
    expect(valueToSlider(50, 0, 100, 'linear')).toBeCloseTo(0.5, 5)
  })

  it('linear: slider at 0.5 → value at midpoint', () => {
    expect(sliderToValue(0.5, 0, 100, 'linear')).toBeCloseTo(50, 5)
  })

  it('round-trip with logarithmic curve', () => {
    const original = 25
    const slider = valueToSlider(original, 0, 100, 'logarithmic')
    const recovered = sliderToValue(slider, 0, 100, 'logarithmic')
    expect(recovered).toBeCloseTo(original, 1)
  })

  it('round-trip with exponential curve', () => {
    const original = 75
    const slider = valueToSlider(original, 0, 100, 'exponential')
    const recovered = sliderToValue(slider, 0, 100, 'exponential')
    expect(recovered).toBeCloseTo(original, 1)
  })

  it('handles zero range gracefully', () => {
    expect(valueToSlider(5, 5, 5, 'linear')).toBe(0)
  })

  it('clamps values outside range', () => {
    const slider = valueToSlider(150, 0, 100, 'linear')
    expect(slider).toBeLessThanOrEqual(1)
  })
})

// UAT P5 — Color Invert "1.00%" label bug. A 0..1 `%`-unit param (e.g.
// color_invert.amount, default 1.0) must render as a true percentage, not
// the raw fraction with a '%' suffix glued on.
describe('formatParamValue', () => {
  it('0..1 %-unit param: 1.0 → "100%" (the reported bug — was "1.00%")', () => {
    expect(formatParamValue(1.0, 'float', '%', 1.0)).toBe('100%')
  })

  it('0..1 %-unit param: 0.5 → "50%"', () => {
    expect(formatParamValue(0.5, 'float', '%', 1.0)).toBe('50%')
  })

  it('0..1 %-unit param: 0.0 → "0%"', () => {
    expect(formatParamValue(0.0, 'float', '%', 1.0)).toBe('0%')
  })

  it('a %-unit param already on a 0-100 range is left unscaled (no double-scale)', () => {
    // Mirrors backend registry params like byte_corrupt.jpeg_quality (min=1,max=95)
    // and hsl_adjust.saturation (min=-100,max=100) found by the P5 registry sweep.
    expect(formatParamValue(40, 'float', '%', 95)).toBe('40.00%')
    expect(formatParamValue(-25, 'float', '%', 100)).toBe('-25.00%')
  })

  it('non-% unit param is unaffected', () => {
    expect(formatParamValue(0.5, 'float', 'Hz', 1.0)).toBe('0.50Hz')
    expect(formatParamValue(120, 'int', 'Hz', 1000)).toBe('120Hz')
  })

  it('%-unit param with unknown max (caller did not pass max) keeps prior raw-fraction behavior', () => {
    expect(formatParamValue(1.0, 'float', '%')).toBe('1.00%')
  })

  it('param with no unit is unaffected regardless of max', () => {
    expect(formatParamValue(0.5, 'float', undefined, 1.0)).toBe('0.50')
  })

  it('int type rounds and applies the same %-scaling guard', () => {
    expect(formatParamValue(1, 'int', '%', 1)).toBe('100%')
  })
})
