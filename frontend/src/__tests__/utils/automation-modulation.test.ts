/**
 * AA.2 — modulation lane composition: pure blend-math unit tests for
 * automation-evaluate.ts's applyBlendOp/composeModulatedValue/isModulationLane.
 *
 * See evaluateAutomationOverrides-aa2.test.ts for the end-to-end
 * (denormalize + clamp + parity + back-compat) integration coverage.
 */
import { describe, it, expect } from 'vitest'
import {
  applyBlendOp,
  composeModulatedValue,
  isModulationLane,
} from '../../renderer/utils/automation-evaluate'

describe('isModulationLane', () => {
  it("is true only when kind === 'modulation'", () => {
    expect(isModulationLane({ kind: 'modulation' })).toBe(true)
    expect(isModulationLane({ kind: 'absolute' })).toBe(false)
    expect(isModulationLane({})).toBe(false)
    expect(isModulationLane({ kind: undefined })).toBe(false)
  })
})

describe('applyBlendOp', () => {
  it("'add' sums base and modValue (also the default when op is omitted)", () => {
    expect(applyBlendOp(0.5, 0.2, 'add')).toBeCloseTo(0.7)
    expect(applyBlendOp(0.5, 0.2)).toBeCloseTo(0.7)
  })

  it("'multiply' multiplies base by modValue", () => {
    expect(applyBlendOp(0.5, 0.4, 'multiply')).toBeCloseTo(0.2)
  })

  it("'max' takes the larger of base/modValue", () => {
    expect(applyBlendOp(0.5, 0.8, 'max')).toBeCloseTo(0.8)
    expect(applyBlendOp(0.5, 0.3, 'max')).toBeCloseTo(0.5)
  })
})

describe('composeModulatedValue — HARD ORACLE (a) blend ops', () => {
  it("absolute 0.5 + modulation 'add' 0.2 -> 0.7", () => {
    expect(composeModulatedValue(0.5, [{ value: 0.2, blendOp: 'add' }])).toBeCloseTo(0.7)
  })

  it("absolute 0.5 + modulation 'multiply' factor 0.4 -> 0.5*0.4 = 0.2", () => {
    expect(composeModulatedValue(0.5, [{ value: 0.4, blendOp: 'multiply' }])).toBeCloseTo(0.2)
  })

  it("absolute 0.5 + modulation 'max' 0.8 -> max(0.5, 0.8) = 0.8", () => {
    expect(composeModulatedValue(0.5, [{ value: 0.8, blendOp: 'max' }])).toBeCloseTo(0.8)
  })

  it("absolute 0.5 + modulation 'max' 0.3 (smaller) -> stays 0.5", () => {
    expect(composeModulatedValue(0.5, [{ value: 0.3, blendOp: 'max' }])).toBeCloseTo(0.5)
  })

  it('multiple modulation lanes fold sequentially in array order', () => {
    // 0.5 add 0.2 (=0.7), then multiply by 0.5 (=0.35)
    const result = composeModulatedValue(0.5, [
      { value: 0.2, blendOp: 'add' },
      { value: 0.5, blendOp: 'multiply' },
    ])
    expect(result).toBeCloseTo(0.35)
  })
})

describe('composeModulatedValue — HARD ORACLE (c) clamp to [0,1] normalized range', () => {
  it('clamps an overflowing add to 1', () => {
    expect(composeModulatedValue(0.9, [{ value: 0.5, blendOp: 'add' }])).toBe(1)
  })

  it('clamps a negative result to 0', () => {
    expect(composeModulatedValue(0.1, [{ value: -0.5, blendOp: 'add' }])).toBe(0)
  })
})

describe('composeModulatedValue — no absolute lane (modulation-only param)', () => {
  it('seeds from the first modulation value when baseValue is null', () => {
    expect(composeModulatedValue(null, [{ value: 0.4, blendOp: 'add' }])).toBeCloseTo(0.4)
  })

  it('folds additional modulation lanes onto the seed', () => {
    const result = composeModulatedValue(null, [
      { value: 0.4, blendOp: 'add' },
      { value: 0.1, blendOp: 'add' },
    ])
    expect(result).toBeCloseTo(0.5)
  })

  it('returns null when there is neither a base value nor any modulation', () => {
    expect(composeModulatedValue(null, [])).toBeNull()
  })
})

describe('composeModulatedValue — HARD ORACLE (e) back-compat pass-through', () => {
  it('returns baseValue UNCHANGED (no clamp) when there are no modulation contributions', () => {
    // Deliberately out-of-[0,1]-range base value — pre-AA.2 code never
    // clamped, so this proves the empty-mods path is a true no-op pass-through.
    expect(composeModulatedValue(1.5, [])).toBe(1.5)
    expect(composeModulatedValue(-0.3, [])).toBe(-0.3)
  })
})
