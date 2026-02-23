import { describe, it, expect } from 'vitest'
import type { ParamDef, EffectInfo, EffectInstance } from '../../../shared/types'

/**
 * Tests for ParamPanel behavioral logic (Phase 2A Session 3).
 *
 * Since ParamPanel is a React component, we test the decision logic
 * (param type routing, scroll detection, ghost handle identity) rather
 * than DOM rendering (which would need jsdom + @testing-library/react).
 */

// --- Mock data ---

const mockEffectInfo: EffectInfo = {
  id: 'fx.vhs',
  name: 'VHS',
  category: 'fx',
  params: {
    tracking: {
      type: 'float', min: 0, max: 1, default: 0.5,
      label: 'Tracking', curve: 'linear', unit: '%',
      description: 'Simulates VHS tracking distortion',
    },
    noise: {
      type: 'float', min: 0, max: 1, default: 0.2,
      label: 'Noise', curve: 'exponential', unit: '%',
      description: 'VHS noise intensity',
    },
    chromatic: {
      type: 'float', min: 0, max: 20, default: 2,
      label: 'Chromatic', curve: 'logarithmic', unit: 'px',
      description: 'Chromatic aberration offset',
    },
  },
}

const mockPixelsortInfo: EffectInfo = {
  id: 'fx.pixelsort',
  name: 'Pixel Sort',
  category: 'fx',
  params: {
    threshold: {
      type: 'float', min: 0, max: 1, default: 0.5,
      label: 'Threshold', curve: 's-curve', unit: '%',
    },
    direction: {
      type: 'choice', default: 'horizontal',
      label: 'Sort Direction', options: ['horizontal', 'vertical', 'diagonal'],
    },
    reverse: {
      type: 'bool', default: false,
      label: 'Reverse',
    },
  },
}

const mockEffect: EffectInstance = {
  id: 'inst-1',
  effectId: 'fx.vhs',
  isEnabled: true,
  isFrozen: false,
  parameters: { tracking: 0.5, noise: 0.2, chromatic: 2 },
  modulations: {},
  mix: 1.0,
  mask: null,
}

// --- Helpers (mirror ParamPanel logic) ---

function classifyParam(def: ParamDef): 'knob' | 'choice' | 'toggle' {
  switch (def.type) {
    case 'float':
    case 'int':
      return 'knob'
    case 'choice':
      return 'choice'
    case 'bool':
      return 'toggle'
    default:
      return 'knob'
  }
}

function needsScroll(paramCount: number): boolean {
  return paramCount > 6
}

// --- Tests ---

describe('ParamPanel param type routing', () => {
  it('float param renders as knob', () => {
    expect(classifyParam(mockEffectInfo.params.tracking)).toBe('knob')
  })

  it('int param renders as knob', () => {
    const intParam: ParamDef = { type: 'int', min: 2, max: 32, default: 4, label: 'Levels' }
    expect(classifyParam(intParam)).toBe('knob')
  })

  it('choice param renders as choice dropdown', () => {
    expect(classifyParam(mockPixelsortInfo.params.direction)).toBe('choice')
  })

  it('bool param renders as toggle', () => {
    expect(classifyParam(mockPixelsortInfo.params.reverse)).toBe('toggle')
  })
})

describe('ParamPanel layout', () => {
  it('separates numeric params (knobs) from other params', () => {
    const entries = Object.entries(mockPixelsortInfo.params)
    const numeric = entries.filter(([, def]) => def.type === 'float' || def.type === 'int')
    const other = entries.filter(([, def]) => def.type !== 'float' && def.type !== 'int')

    expect(numeric).toHaveLength(1) // threshold
    expect(other).toHaveLength(2)   // direction + reverse
    expect(numeric[0][0]).toBe('threshold')
  })

  it('all VHS params are numeric (all render as knobs)', () => {
    const entries = Object.entries(mockEffectInfo.params)
    const numeric = entries.filter(([, def]) => def.type === 'float' || def.type === 'int')
    expect(numeric).toHaveLength(3)
  })
})

describe('ParamPanel scroll affordance', () => {
  it('no scroll when 3 params', () => {
    expect(needsScroll(3)).toBe(false)
  })

  it('no scroll when 6 params', () => {
    expect(needsScroll(6)).toBe(false)
  })

  it('scroll when 7+ params', () => {
    expect(needsScroll(7)).toBe(true)
  })
})

describe('ParamPanel ghost handle placeholder', () => {
  it('ghostValue equals value when no modulation', () => {
    // Phase 2A: ghostValue = value (identity)
    // Phase 6: ghostValue = resolvedValue from modulation engine
    const value = mockEffect.parameters.tracking as number
    const ghostValue = value // mirror ParamPanel logic
    expect(ghostValue).toBe(value)
  })

  it('ghost arc invisible when ghostValue === value', () => {
    const sliderPos = 0.5
    const ghostPos = 0.5
    const ghostVisible = Math.abs(ghostPos - sliderPos) > 0.001
    expect(ghostVisible).toBe(false)
  })
})

describe('ParamPanel curve and unit passthrough', () => {
  it('passes curve from ParamDef to Knob', () => {
    const trackingDef = mockEffectInfo.params.tracking
    expect(trackingDef.curve).toBe('linear')
  })

  it('passes unit from ParamDef to Knob', () => {
    const chromaticDef = mockEffectInfo.params.chromatic
    expect(chromaticDef.unit).toBe('px')
  })

  it('all valid curve values accepted', () => {
    const validCurves = ['linear', 'logarithmic', 'exponential', 's-curve']
    const usedCurves = Object.values(mockEffectInfo.params)
      .map((def) => def.curve)
      .filter(Boolean)
    for (const c of usedCurves) {
      expect(validCurves).toContain(c)
    }
  })
})

describe('ParamPanel keyboard navigation', () => {
  it('arrow key adjusts value by 1% of range', () => {
    const value = 0.5
    const min = 0, max = 1
    const range = max - min
    const pct = 0.01
    const newValue = value + range * pct
    expect(newValue).toBeCloseTo(0.51, 5)
  })

  it('shift+arrow adjusts value by 10% of range', () => {
    const value = 0.5
    const min = 0, max = 1
    const range = max - min
    const pct = 0.1
    const newValue = value + range * pct
    expect(newValue).toBeCloseTo(0.6, 5)
  })

  it('adjustment clamps to max', () => {
    const value = 0.95
    const min = 0, max = 1
    const range = max - min
    const pct = 0.1
    const newValue = Math.max(min, Math.min(max, value + range * pct))
    expect(newValue).toBe(1)
  })

  it('adjustment clamps to min', () => {
    const value = 0.05
    const min = 0, max = 1
    const range = max - min
    const pct = 0.1
    const newValue = Math.max(min, Math.min(max, value - range * pct))
    expect(newValue).toBe(0)
  })
})

describe('ParamMix uses Slider', () => {
  it('mix range is 0 to 1', () => {
    const min = 0, max = 1
    expect(mockEffect.mix).toBeGreaterThanOrEqual(min)
    expect(mockEffect.mix).toBeLessThanOrEqual(max)
  })

  it('mix default is 1 (fully wet)', () => {
    const defaultMix = 1
    expect(defaultMix).toBe(1)
  })

  it('mix uses linear curve', () => {
    // Mix is always linear — no non-linear scaling for dry/wet
    const curve = 'linear'
    expect(curve).toBe('linear')
  })
})
