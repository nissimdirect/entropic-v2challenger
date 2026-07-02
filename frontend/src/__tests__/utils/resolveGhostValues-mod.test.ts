/**
 * resolveGhostValues — operator modulation path tests.
 *
 * Loop 48 (LFO auto) — synthesis Iter 28/29 named "LFO auto / live IPC + visual"
 * for Playwright. This vitest layer covers the pure-function modulation math
 * (operator signal × mapping → param delta → clamped) so the data semantics
 * cannot regress silently. Playwright still owns the live IPC + visual round.
 *
 * Existing tests in resolveGhostValues-cc.test.ts cover only the CC override
 * branch. The OPERATOR branch is the bulk of the function and was uncovered.
 */
import { describe, it, expect } from 'vitest'
import { resolveGhostValues } from '../../renderer/utils/resolveGhostValues'
import type { Operator, ParamDef } from '../../shared/types'

function fxParams(): Record<string, ParamDef> {
  return {
    amount: { type: 'float', label: 'Amount', default: 0.5, min: 0, max: 1 } as ParamDef,
    intensity: { type: 'float', label: 'Intensity', default: 50, min: 0, max: 100 } as ParamDef,
    seed: { type: 'int', label: 'Seed', default: 42, min: 0, max: 1000 } as ParamDef,
    mode: { type: 'choice', label: 'Mode', default: 'a', options: ['a', 'b'] } as unknown as ParamDef,
  }
}

function makeOperator(overrides: Partial<Operator> = {}): Operator {
  return {
    id: 'lfo-1',
    type: 'lfo',
    label: 'LFO 1',
    isEnabled: true,
    parameters: { waveform: 'sine', rate_hz: 1.0, phase_offset: 0 },
    processing: [],
    mappings: [],
    ...overrides,
  }
}

describe('resolveGhostValues — operator modulation (LFO/auto)', () => {
  it('LFO signal=0.5 with mapping {min:0,max:1,depth:1} adds 0.5 × range to base', () => {
    const op = makeOperator({
      mappings: [
        {
          targetEffectId: 'fx1',
          targetParamKey: 'amount',
          depth: 1.0,
          min: 0,
          max: 1,
          curve: 'linear',
        },
      ],
    })
    const result = resolveGhostValues(
      'fx1',
      fxParams(),
      { amount: 0.2 },
      [op],
      { 'lfo-1': 0.5 },
    )
    // baseValue 0.2 + modDelta (0 + 0.5*(1-0)) * 1.0 * pRange (1) = 0.2 + 0.5 = 0.7
    expect(result.amount).toBeCloseTo(0.7, 5)
  })

  it('disabled operator contributes nothing', () => {
    const op = makeOperator({
      isEnabled: false,
      mappings: [
        {
          targetEffectId: 'fx1',
          targetParamKey: 'amount',
          depth: 1.0,
          min: 0,
          max: 1,
          curve: 'linear',
        },
      ],
    })
    const result = resolveGhostValues('fx1', fxParams(), { amount: 0.2 }, [op], {
      'lfo-1': 0.9,
    })
    // No mod → base unchanged → not in result dict
    expect(result.amount).toBeUndefined()
  })

  it('signal=0 produces zero modDelta (base value unchanged → omitted)', () => {
    const op = makeOperator({
      mappings: [
        {
          targetEffectId: 'fx1',
          targetParamKey: 'amount',
          depth: 1.0,
          min: 0,
          max: 1,
          curve: 'linear',
        },
      ],
    })
    const result = resolveGhostValues('fx1', fxParams(), { amount: 0.3 }, [op], {
      'lfo-1': 0,
    })
    expect(result.amount).toBeUndefined()
  })

  it('multiple operators on the same target accumulate modDelta', () => {
    const op1 = makeOperator({
      id: 'lfo-a',
      mappings: [
        {
          targetEffectId: 'fx1',
          targetParamKey: 'amount',
          depth: 1.0,
          min: 0,
          max: 1,
          curve: 'linear',
        },
      ],
    })
    const op2 = makeOperator({
      id: 'lfo-b',
      mappings: [
        {
          targetEffectId: 'fx1',
          targetParamKey: 'amount',
          depth: 1.0,
          min: 0,
          max: 1,
          curve: 'linear',
        },
      ],
    })
    const result = resolveGhostValues(
      'fx1',
      fxParams(),
      { amount: 0.0 },
      [op1, op2],
      { 'lfo-a': 0.3, 'lfo-b': 0.2 },
    )
    // base 0 + (0.3 * 1.0) + (0.2 * 1.0) = 0.5
    expect(result.amount).toBeCloseTo(0.5, 5)
  })

  it('mapping for a different effect is ignored', () => {
    const op = makeOperator({
      mappings: [
        {
          targetEffectId: 'fxOTHER',
          targetParamKey: 'amount',
          depth: 1.0,
          min: 0,
          max: 1,
          curve: 'linear',
        },
      ],
    })
    const result = resolveGhostValues('fx1', fxParams(), { amount: 0.5 }, [op], {
      'lfo-1': 0.8,
    })
    expect(result.amount).toBeUndefined()
  })

  it('mapping for a different param key is ignored', () => {
    const op = makeOperator({
      mappings: [
        {
          targetEffectId: 'fx1',
          targetParamKey: 'intensity',
          depth: 1.0,
          min: 0,
          max: 100,
          curve: 'linear',
        },
      ],
    })
    const result = resolveGhostValues(
      'fx1',
      fxParams(),
      { amount: 0.5, intensity: 50 },
      [op],
      { 'lfo-1': 0.5 },
    )
    expect(result.amount).toBeUndefined()
    expect(result.intensity).toBeCloseTo(100, 1) // 50 + 0.5*100 = 100, clamped to 100
  })

  it('clamps to param max when modulation would exceed it', () => {
    const op = makeOperator({
      mappings: [
        {
          targetEffectId: 'fx1',
          targetParamKey: 'amount',
          depth: 1.0,
          min: 0,
          max: 1,
          curve: 'linear',
        },
      ],
    })
    const result = resolveGhostValues('fx1', fxParams(), { amount: 0.8 }, [op], {
      'lfo-1': 1.0,
    })
    // base 0.8 + 1.0 = 1.8, clamped to pMax (1)
    expect(result.amount).toBe(1)
  })

  it('clamps to param min when modulation would go below it', () => {
    const op = makeOperator({
      mappings: [
        {
          targetEffectId: 'fx1',
          targetParamKey: 'amount',
          depth: 1.0,
          min: -1, // inverted mapping
          max: 0,
          curve: 'linear',
        },
      ],
    })
    // Inverted mapping range [-1, 0]: signal 0 maps to -1, signal 1 maps to 0.
    // With signal=0, scaled=-1, modDelta = -1 * pRange (1) = -1 → 0.2 + (-1) = -0.8 → clamp to 0.
    const result = resolveGhostValues('fx1', fxParams(), { amount: 0.2 }, [op], {
      'lfo-1': 0,
    })
    expect(result.amount).toBe(0)
  })

  it('depth scales the contribution (depth=0.5 → half the delta)', () => {
    const opFull = makeOperator({
      mappings: [
        {
          targetEffectId: 'fx1',
          targetParamKey: 'amount',
          depth: 1.0,
          min: 0,
          max: 1,
          curve: 'linear',
        },
      ],
    })
    const opHalf = makeOperator({
      mappings: [
        {
          targetEffectId: 'fx1',
          targetParamKey: 'amount',
          depth: 0.5,
          min: 0,
          max: 1,
          curve: 'linear',
        },
      ],
    })
    const full = resolveGhostValues('fx1', fxParams(), { amount: 0 }, [opFull], {
      'lfo-1': 1.0,
    })
    const half = resolveGhostValues('fx1', fxParams(), { amount: 0 }, [opHalf], {
      'lfo-1': 1.0,
    })
    expect(full.amount).toBeCloseTo(1.0, 5)
    expect(half.amount).toBeCloseTo(0.5, 5)
  })

  it('signal order: automation override REPLACES base+mod (not adds)', () => {
    const op = makeOperator({
      mappings: [
        {
          targetEffectId: 'fx1',
          targetParamKey: 'amount',
          depth: 1.0,
          min: 0,
          max: 1,
          curve: 'linear',
        },
      ],
    })
    const result = resolveGhostValues(
      'fx1',
      fxParams(),
      { amount: 0 },
      [op],
      { 'lfo-1': 1.0 }, // would give amount=1
      { 'fx1.amount': 0.42 }, // automation override
    )
    expect(result.amount).toBeCloseTo(0.42, 5)
  })

  it('signal order: CC override beats automation (last in chain)', () => {
    const op = makeOperator({
      mappings: [
        {
          targetEffectId: 'fx1',
          targetParamKey: 'amount',
          depth: 1.0,
          min: 0,
          max: 1,
          curve: 'linear',
        },
      ],
    })
    const result = resolveGhostValues(
      'fx1',
      fxParams(),
      { amount: 0 },
      [op],
      { 'lfo-1': 1.0 },
      { 'fx1.amount': 0.42 }, // automation
      { amount: 0.91 }, // CC — wins
    )
    expect(result.amount).toBeCloseTo(0.91, 5)
  })

  it('non-numeric (enum) params are skipped entirely', () => {
    const op = makeOperator({
      mappings: [
        {
          targetEffectId: 'fx1',
          targetParamKey: 'mode',
          depth: 1.0,
          min: 0,
          max: 1,
          curve: 'linear',
        },
      ],
    })
    const result = resolveGhostValues(
      'fx1',
      fxParams(),
      { amount: 0.5, mode: 'a' },
      [op],
      { 'lfo-1': 0.7 },
    )
    expect('mode' in result).toBe(false)
  })

  it('int params receive modulation (not just float)', () => {
    const op = makeOperator({
      mappings: [
        {
          targetEffectId: 'fx1',
          targetParamKey: 'seed',
          depth: 1.0,
          min: 0,
          max: 1,
          curve: 'linear',
        },
      ],
    })
    const result = resolveGhostValues(
      'fx1',
      fxParams(),
      { seed: 100 },
      [op],
      { 'lfo-1': 0.5 },
    )
    // base 100 + 0.5 * 1000 = 600 (note: not int-quantized, that's a separate step)
    expect(result.seed).toBeCloseTo(600, 1)
  })
})
