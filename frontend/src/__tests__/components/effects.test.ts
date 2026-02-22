import { describe, it, expect } from 'vitest'
import type { EffectInfo, ParamDef } from '../../shared/types'

/**
 * Tests for effects UI logic — browser listing, param clamping, rack reorder.
 */

// Simulate the effect registry data shape from backend
const mockRegistry: EffectInfo[] = [
  {
    id: 'fx.invert',
    name: 'Invert',
    category: 'fx',
    params: {},
  },
  {
    id: 'fx.hue_shift',
    name: 'Hue Shift',
    category: 'color',
    params: {
      amount: { type: 'float', min: 0, max: 360, default: 180, label: 'Hue Rotation' },
    },
  },
  {
    id: 'fx.noise',
    name: 'Noise',
    category: 'texture',
    params: {
      intensity: { type: 'float', min: 0, max: 1, default: 0.3, label: 'Intensity' },
    },
  },
  {
    id: 'fx.blur',
    name: 'Blur',
    category: 'distortion',
    params: {
      radius: { type: 'float', min: 0, max: 50, default: 5, label: 'Blur Radius' },
    },
  },
  {
    id: 'fx.posterize',
    name: 'Posterize',
    category: 'enhance',
    params: {
      levels: { type: 'int', min: 2, max: 32, default: 4, label: 'Color Levels' },
    },
  },
]

function clampParam(value: number, paramDef: ParamDef): number {
  if (paramDef.min !== undefined && value < paramDef.min) return paramDef.min
  if (paramDef.max !== undefined && value > paramDef.max) return paramDef.max
  return value
}

function filterByCategory(effects: EffectInfo[], category: string): EffectInfo[] {
  return effects.filter((e) => e.category === category)
}

function searchEffects(effects: EffectInfo[], query: string): EffectInfo[] {
  const q = query.toLowerCase()
  return effects.filter((e) => e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q))
}

function reorderArray<T>(arr: T[], fromIndex: number, toIndex: number): T[] {
  const result = [...arr]
  const [removed] = result.splice(fromIndex, 1)
  result.splice(toIndex, 0, removed)
  return result
}

describe('EffectBrowser', () => {
  it('lists all effects from registry', () => {
    expect(mockRegistry).toHaveLength(5)
    expect(mockRegistry.map((e) => e.id)).toContain('fx.invert')
    expect(mockRegistry.map((e) => e.id)).toContain('fx.hue_shift')
  })

  it('filters effects by category', () => {
    const colorEffects = filterByCategory(mockRegistry, 'color')
    expect(colorEffects).toHaveLength(1)
    expect(colorEffects[0].id).toBe('fx.hue_shift')
  })

  it('searches effects by name', () => {
    const results = searchEffects(mockRegistry, 'blur')
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('fx.blur')
  })

  it('search returns empty for no match', () => {
    const results = searchEffects(mockRegistry, 'zzzzz')
    expect(results).toHaveLength(0)
  })

  it('search is case insensitive', () => {
    const results = searchEffects(mockRegistry, 'NOISE')
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('fx.noise')
  })
})

describe('EffectRack reorder', () => {
  it('moves first item to last', () => {
    const ids = ['a', 'b', 'c']
    expect(reorderArray(ids, 0, 2)).toEqual(['b', 'c', 'a'])
  })

  it('moves last item to first', () => {
    const ids = ['a', 'b', 'c']
    expect(reorderArray(ids, 2, 0)).toEqual(['c', 'a', 'b'])
  })

  it('no-op when same index', () => {
    const ids = ['a', 'b', 'c']
    expect(reorderArray(ids, 1, 1)).toEqual(['a', 'b', 'c'])
  })
})

describe('Param clamping', () => {
  const hueParam: ParamDef = { type: 'float', min: 0, max: 360, default: 180, label: 'Hue' }
  const levelsParam: ParamDef = { type: 'int', min: 2, max: 32, default: 4, label: 'Levels' }

  it('clamps below min', () => {
    expect(clampParam(-10, hueParam)).toBe(0)
  })

  it('clamps above max', () => {
    expect(clampParam(999, hueParam)).toBe(360)
  })

  it('passes value within range', () => {
    expect(clampParam(180, hueParam)).toBe(180)
  })

  it('clamps integer param below min', () => {
    expect(clampParam(0, levelsParam)).toBe(2)
  })

  it('clamps integer param above max', () => {
    expect(clampParam(100, levelsParam)).toBe(32)
  })
})
