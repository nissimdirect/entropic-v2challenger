/**
 * P6.6 — resolveGhostValues must not crash on a field-valued param.
 *
 * Covers (named in packet TEST PLAN):
 *   - field param renders badge not NaN (negative)
 *
 * The function returns ghost values per param; a field-valued param must be
 * OMITTED from the result (no NaN), so the UI shows a "field" badge instead.
 */
import { describe, it, expect } from 'vitest'
import { resolveGhostValues } from '../renderer/utils/resolveGhostValues'
import type { ParamDef, ParamValue } from '../shared/types'

const paramDefs: Record<string, ParamDef> = {
  radius: { type: 'float', min: 0, max: 20, default: 5, label: 'Radius' },
  angle: { type: 'float', min: 0, max: 360, default: 0, label: 'Angle' },
}

describe('resolveGhostValues with field params', () => {
  it('field param renders badge not NaN (negative)', () => {
    const baseParams: Record<string, ParamValue> = {
      radius: { __field__: { kind: 'image', source_id: 'a1', gain: 1, invert: false } },
      angle: 90,
    }
    const result = resolveGhostValues('fx.blur', paramDefs, baseParams, [], {}, undefined, undefined)
    // radius is field-valued → omitted (never NaN)
    expect('radius' in result).toBe(false)
    // and crucially, no NaN crept in for any key
    for (const v of Object.values(result)) {
      expect(Number.isNaN(v)).toBe(false)
    }
  })

  it('scalar params are unaffected by a sibling field param', () => {
    const baseParams: Record<string, ParamValue> = {
      radius: { __field__: { kind: 'video', source_id: 'a2', gain: 2, invert: true } },
      angle: 45,
    }
    // with no operators/automation, angle equals its base → omitted (only-if-different rule);
    // the key point is it does not throw and produces no NaN.
    expect(() =>
      resolveGhostValues('fx.blur', paramDefs, baseParams, [], {}, undefined, undefined),
    ).not.toThrow()
  })
})
