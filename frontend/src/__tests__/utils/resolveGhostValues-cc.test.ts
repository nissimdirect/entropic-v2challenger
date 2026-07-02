import { describe, it, expect } from 'vitest'
import { resolveGhostValues } from '../../renderer/utils/resolveGhostValues'
import type { Operator, ParamDef } from '../../shared/types'

const EFFECT_ID = 'fx-1'

function makeParamDefs(overrides: Record<string, Partial<ParamDef>> = {}): Record<string, ParamDef> {
  return {
    amount: {
      type: 'float',
      min: 0,
      max: 1,
      default: 0.5,
      label: 'Amount',
      ...overrides.amount,
    },
    rate: {
      type: 'float',
      min: 0,
      max: 1,
      default: 0.5,
      label: 'Rate',
      ...overrides.rate,
    },
  }
}

describe('resolveGhostValues — CC overrides', () => {
  it('CC override replaces value after automation', () => {
    const paramDefs = makeParamDefs()
    const baseParams = { amount: 0.5 }
    const automationOverrides = { [`${EFFECT_ID}.amount`]: 0.3 }
    const ccOverrides = { amount: 0.8 }

    const result = resolveGhostValues(
      EFFECT_ID,
      paramDefs,
      baseParams,
      [],
      {},
      automationOverrides,
      ccOverrides,
    )

    expect(result.amount).toBe(0.8)
  })

  it('CC override without automation', () => {
    const paramDefs = makeParamDefs()
    const baseParams = { amount: 0.5 }
    const ccOverrides = { amount: 0.7 }

    const result = resolveGhostValues(
      EFFECT_ID,
      paramDefs,
      baseParams,
      [],
      {},
      undefined,
      ccOverrides,
    )

    expect(result.amount).toBe(0.7)
  })

  it('CC override clamped to param range', () => {
    const paramDefs = makeParamDefs()
    const baseParams = { amount: 0.5 }
    const ccOverrides = { amount: 1.5 }

    const result = resolveGhostValues(
      EFFECT_ID,
      paramDefs,
      baseParams,
      [],
      {},
      undefined,
      ccOverrides,
    )

    expect(result.amount).toBe(1.0)
  })

  it('CC override only affects matching param keys', () => {
    const paramDefs = makeParamDefs()
    const baseParams = { amount: 0.5, rate: 0.5 }
    const ccOverrides = { amount: 0.9 }

    const result = resolveGhostValues(
      EFFECT_ID,
      paramDefs,
      baseParams,
      [],
      {},
      undefined,
      ccOverrides,
    )

    expect(result.amount).toBe(0.9)
    expect(result.rate).toBeUndefined()
  })

  it('empty ccOverrides has no effect', () => {
    const paramDefs = makeParamDefs()
    const baseParams = { amount: 0.5, rate: 0.5 }

    const withEmpty = resolveGhostValues(
      EFFECT_ID,
      paramDefs,
      baseParams,
      [],
      {},
      undefined,
      {},
    )

    const without = resolveGhostValues(
      EFFECT_ID,
      paramDefs,
      baseParams,
      [],
      {},
      undefined,
      undefined,
    )

    expect(withEmpty).toEqual(without)
  })

  it('undefined ccOverrides has no effect (backward compat)', () => {
    const paramDefs = makeParamDefs()
    const baseParams = { amount: 0.5, rate: 0.5 }

    const withoutArg = resolveGhostValues(
      EFFECT_ID,
      paramDefs,
      baseParams,
      [],
      {},
    )

    const withUndefined = resolveGhostValues(
      EFFECT_ID,
      paramDefs,
      baseParams,
      [],
      {},
      undefined,
      undefined,
    )

    expect(withoutArg).toEqual(withUndefined)
  })

  it('CC override included in result even when equal to base', () => {
    const paramDefs = makeParamDefs()
    const baseParams = { amount: 0.5 }
    const ccOverrides = { amount: 0.5 }

    const result = resolveGhostValues(
      EFFECT_ID,
      paramDefs,
      baseParams,
      [],
      {},
      undefined,
      ccOverrides,
    )

    // CC is active so key must appear in result even though value == base
    expect(result).toHaveProperty('amount')
    expect(result.amount).toBe(0.5)
  })
})
