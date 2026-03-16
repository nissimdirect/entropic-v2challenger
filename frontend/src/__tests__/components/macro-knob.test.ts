import { describe, it, expect } from 'vitest'
import type { MacroMapping } from '../../shared/types'

describe('MacroKnob logic', () => {
  it('normalizes value to percentage', () => {
    const macro: MacroMapping = { label: 'Test', effectIndex: 0, paramKey: 'amount', min: 0, max: 1 }
    const value = 0.5
    const normalized = (value - macro.min) / (macro.max - macro.min)
    expect(Math.round(normalized * 100)).toBe(50)
  })

  it('handles non-zero min', () => {
    const macro: MacroMapping = { label: 'Test', effectIndex: 0, paramKey: 'freq', min: 100, max: 500 }
    const value = 300
    const normalized = (value - macro.min) / (macro.max - macro.min)
    expect(Math.round(normalized * 100)).toBe(50)
  })

  it('clamps at boundaries', () => {
    const macro: MacroMapping = { label: 'Test', effectIndex: 0, paramKey: 'x', min: 0, max: 10 }
    const atMin = (0 - macro.min) / (macro.max - macro.min)
    const atMax = (10 - macro.min) / (macro.max - macro.min)
    expect(atMin).toBe(0)
    expect(atMax).toBe(1)
  })
})
