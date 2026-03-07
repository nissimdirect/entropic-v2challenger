import { describe, it, expect } from 'vitest'
import { evaluateAutomationOverrides } from '../../renderer/utils/evaluateAutomationOverrides'
import type { AutomationLane, EffectInfo } from '../../shared/types'

function makeLane(overrides: Partial<AutomationLane> = {}): AutomationLane {
  return {
    id: 'lane-1',
    paramPath: 'fx-1.amount',
    color: '#4ade80',
    isVisible: true,
    points: [
      { time: 0, value: 0, curve: 0 },
      { time: 10, value: 1, curve: 0 },
    ],
    ...overrides,
  }
}

const registry: EffectInfo[] = [
  {
    id: 'fx-1',
    name: 'Test Effect',
    category: 'test',
    params: {
      amount: { type: 'float', min: 0, max: 100, default: 50, label: 'Amount' },
      rate: { type: 'float', min: 0.1, max: 10, default: 1, label: 'Rate' },
    },
  },
  {
    id: 'fx-2',
    name: 'Other Effect',
    category: 'test',
    params: {
      mix: { type: 'float', min: 0, max: 1, default: 0.5, label: 'Mix' },
    },
  },
]

describe('evaluateAutomationOverrides', () => {
  it('returns empty object for empty lanes array', () => {
    expect(evaluateAutomationOverrides([], 5, registry)).toEqual({})
  })

  it('evaluates a single lane and denormalizes to param range', () => {
    const lane = makeLane()
    const result = evaluateAutomationOverrides([lane], 5, registry)
    // At t=5, normalized = 0.5, denormalized to [0,100] = 50
    expect(result['fx-1.amount']).toBeCloseTo(50)
  })

  it('evaluates multiple lanes across different effects', () => {
    const lane1 = makeLane({ id: 'lane-1', paramPath: 'fx-1.amount' })
    const lane2 = makeLane({
      id: 'lane-2',
      paramPath: 'fx-2.mix',
      points: [
        { time: 0, value: 0.2, curve: 0 },
        { time: 10, value: 0.8, curve: 0 },
      ],
    })
    const result = evaluateAutomationOverrides([lane1, lane2], 5, registry)
    expect(result['fx-1.amount']).toBeCloseTo(50)
    // normalized = 0.5 (midpoint of 0.2-0.8), denorm to [0,1] = 0.5
    expect(result['fx-2.mix']).toBeCloseTo(0.5)
  })

  it('skips invisible lanes', () => {
    const lane = makeLane({ isVisible: false })
    const result = evaluateAutomationOverrides([lane], 5, registry)
    expect(result).toEqual({})
  })

  it('skips lanes with empty points', () => {
    const lane = makeLane({ points: [] })
    const result = evaluateAutomationOverrides([lane], 5, registry)
    expect(result).toEqual({})
  })

  it('skips lanes with malformed paramPath (no dot)', () => {
    const lane = makeLane({ paramPath: 'nodot' })
    const result = evaluateAutomationOverrides([lane], 5, registry)
    expect(result).toEqual({})
  })

  it('defaults to [0,1] range when effect not found in registry', () => {
    const lane = makeLane({ paramPath: 'unknown-fx.param' })
    const result = evaluateAutomationOverrides([lane], 5, registry)
    // normalized=0.5, denorm to [0,1] = 0.5
    expect(result['unknown-fx.param']).toBeCloseTo(0.5)
  })

  it('defaults to [0,1] range when param not found in effect', () => {
    const lane = makeLane({ paramPath: 'fx-1.unknownParam' })
    const result = evaluateAutomationOverrides([lane], 5, registry)
    expect(result['fx-1.unknownParam']).toBeCloseTo(0.5)
  })

  it('denormalizes correctly at boundaries (t=0 and t=10)', () => {
    const lane = makeLane()
    const atStart = evaluateAutomationOverrides([lane], 0, registry)
    const atEnd = evaluateAutomationOverrides([lane], 10, registry)
    expect(atStart['fx-1.amount']).toBeCloseTo(0)   // normalized=0, denorm=0
    expect(atEnd['fx-1.amount']).toBeCloseTo(100)    // normalized=1, denorm=100
  })

  it('handles lane with single point (constant value)', () => {
    const lane = makeLane({
      points: [{ time: 3, value: 0.75, curve: 0 }],
    })
    const result = evaluateAutomationOverrides([lane], 0, registry)
    // Single point = constant 0.75, denorm to [0,100] = 75
    expect(result['fx-1.amount']).toBeCloseTo(75)
  })

  it('uses non-default param range (rate: 0.1-10)', () => {
    const lane = makeLane({
      paramPath: 'fx-1.rate',
      points: [
        { time: 0, value: 0, curve: 0 },
        { time: 10, value: 1, curve: 0 },
      ],
    })
    const result = evaluateAutomationOverrides([lane], 5, registry)
    // normalized=0.5, denorm to [0.1, 10] = 5.05
    expect(result['fx-1.rate']).toBeCloseTo(5.05)
  })
})
