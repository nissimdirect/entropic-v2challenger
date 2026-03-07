import { describe, it, expect } from 'vitest'
import { evaluateAutomationOverrides } from '../../renderer/utils/evaluateAutomationOverrides'
import type { AutomationLane, EffectInfo } from '../../shared/types'

function makeLane(
  paramPath: string,
  points: Array<{ time: number; value: number; curve?: number }>,
  visible = true,
): AutomationLane {
  return {
    id: `lane-${paramPath}`,
    paramPath,
    color: '#4ade80',
    isVisible: visible,
    points: points.map((p) => ({ time: p.time, value: p.value, curve: p.curve ?? 0 })),
  }
}

const testRegistry: EffectInfo[] = [
  {
    id: 'hue_shift',
    name: 'Hue Shift',
    category: 'color',
    params: {
      amount: { type: 'float', min: 0, max: 360, default: 0, label: 'Amount' },
      intensity: { type: 'float', min: 0, max: 1, default: 0.5, label: 'Intensity' },
    },
  },
  {
    id: 'blur',
    name: 'Blur',
    category: 'filter',
    params: {
      radius: { type: 'float', min: 0, max: 50, default: 5, label: 'Radius' },
    },
  },
]

describe('evaluateAutomationOverrides', () => {
  it('lane targeting effect param returns denormalized value', () => {
    const lanes = [makeLane('hue_shift.amount', [{ time: 0, value: 0.5 }, { time: 10, value: 1.0 }])]
    const result = evaluateAutomationOverrides(lanes, 0, testRegistry)
    // value 0.5 denormalized to [0, 360] = 180
    expect(result['hue_shift.amount']).toBe(180)
  })

  it('no lane data at time returns empty overrides for empty lane', () => {
    const lanes = [makeLane('hue_shift.amount', [])]
    const result = evaluateAutomationOverrides(lanes, 5, testRegistry)
    expect(Object.keys(result)).toHaveLength(0)
  })

  it('multiple lanes on different effects all applied', () => {
    const lanes = [
      makeLane('hue_shift.amount', [{ time: 0, value: 0.25 }]),
      makeLane('blur.radius', [{ time: 0, value: 0.5 }]),
    ]
    const result = evaluateAutomationOverrides(lanes, 0, testRegistry)
    expect(result['hue_shift.amount']).toBe(90) // 0.25 * 360
    expect(result['blur.radius']).toBe(25) // 0.5 * 50
  })

  it('invisible lane is skipped', () => {
    const lanes = [makeLane('hue_shift.amount', [{ time: 0, value: 0.5 }], false)]
    const result = evaluateAutomationOverrides(lanes, 0, testRegistry)
    expect(Object.keys(result)).toHaveLength(0)
  })

  it('unknown effect uses 0-1 range', () => {
    const lanes = [makeLane('unknown_fx.param', [{ time: 0, value: 0.7 }])]
    const result = evaluateAutomationOverrides(lanes, 0, testRegistry)
    expect(result['unknown_fx.param']).toBeCloseTo(0.7)
  })

  it('empty lanes array returns empty overrides', () => {
    const result = evaluateAutomationOverrides([], 5, testRegistry)
    expect(Object.keys(result)).toHaveLength(0)
  })

  it('interpolates between points at midpoint', () => {
    const lanes = [makeLane('hue_shift.amount', [
      { time: 0, value: 0 },
      { time: 10, value: 1.0 },
    ])]
    const result = evaluateAutomationOverrides(lanes, 5, testRegistry)
    // Linear interpolation at t=5: value 0.5, denormalized to 180
    expect(result['hue_shift.amount']).toBeCloseTo(180, 0)
  })

  it('clamps to param bounds', () => {
    // Value 1.0 denormalized to max 360
    const lanes = [makeLane('hue_shift.amount', [{ time: 0, value: 1.0 }])]
    const result = evaluateAutomationOverrides(lanes, 0, testRegistry)
    expect(result['hue_shift.amount']).toBe(360)
  })
})
