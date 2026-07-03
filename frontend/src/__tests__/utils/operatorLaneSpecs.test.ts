/**
 * AA.3-A — operator-sourced automation lanes: operatorLaneSpecs.ts, the
 * frontend half of the parity seam (spec §5 items 2-3).
 *
 * Covers the test plan from
 * docs/plans/2026-07-03-aa3-live-generators-spec.md §6:
 *   - buildSyntheticLaneOperators: one op per operator lane, mappings:[],
 *     correct id.
 *   - buildOperatorLaneSpecs: base = absolute+drawn compose; specs carry
 *     blendOp/depth/min/max; domain:'t' filter drops non-t lanes; empty when
 *     no operator lanes.
 *   - evaluateAutomationOverrides skips source:'operator' lanes (no REPLACE
 *     emitted for their paramPath).
 *   - Back-compat: a project with zero operator lanes produces byte-identical
 *     operators + automation_overrides payloads (snapshot test).
 */
import { describe, it, expect } from 'vitest'
import {
  buildSyntheticLaneOperators,
  buildOperatorLaneSpecs,
  laneOperatorId,
} from '../../renderer/utils/operatorLaneSpecs'
import { evaluateAutomationOverrides } from '../../renderer/utils/evaluateAutomationOverrides'
import type { AutomationLane, EffectInfo } from '../../shared/types'

const registry: EffectInfo[] = [
  {
    id: 'fx-1',
    name: 'Test Effect',
    category: 'test',
    params: {
      amount: { type: 'float', min: 0, max: 100, default: 50, label: 'Amount' },
    },
  },
]

function operatorLane(overrides: Partial<AutomationLane> = {}): AutomationLane {
  return {
    id: 'op-lane-1',
    paramPath: 'fx-1.amount',
    color: '#3b82f6',
    isVisible: true,
    mode: 'smooth',
    points: [],
    kind: 'modulation',
    blendOp: 'add',
    source: 'operator',
    operator: { type: 'lfo', params: { waveform: 'sine', rate_hz: 2, phase_offset: 0 }, depth: 1, min: 0, max: 1 },
    ...overrides,
  }
}

function absoluteLane(overrides: Partial<AutomationLane> = {}): AutomationLane {
  return {
    id: 'abs-1',
    paramPath: 'fx-1.amount',
    color: '#4ade80',
    isVisible: true,
    mode: 'smooth',
    points: [{ time: 0, value: 0.5, curve: 0 }],
    ...overrides,
  }
}

function drawnModLane(overrides: Partial<AutomationLane> = {}): AutomationLane {
  return {
    id: 'drawn-mod-1',
    paramPath: 'fx-1.amount',
    color: '#3b82f6',
    isVisible: true,
    mode: 'smooth',
    kind: 'modulation',
    blendOp: 'add',
    points: [{ time: 0, value: 0.2, curve: 0 }],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// buildSyntheticLaneOperators
// ---------------------------------------------------------------------------

describe('buildSyntheticLaneOperators', () => {
  it('emits one op per operator lane, mappings:[], correct id', () => {
    const ops = buildSyntheticLaneOperators([operatorLane()])
    expect(ops).toHaveLength(1)
    expect(ops[0]).toEqual({
      id: laneOperatorId('op-lane-1'),
      type: 'lfo',
      is_enabled: true,
      parameters: { waveform: 'sine', rate_hz: 2, phase_offset: 0 },
      processing: [],
      mappings: [],
    })
  })

  it('id is namespaced with the __lane__ prefix + the lane id', () => {
    const ops = buildSyntheticLaneOperators([operatorLane({ id: 'auto-42' })])
    expect(ops[0].id).toBe('__lane__auto-42')
  })

  it('skips drawn (non-operator) lanes', () => {
    expect(buildSyntheticLaneOperators([absoluteLane(), drawnModLane()])).toEqual([])
  })

  it('skips invisible operator lanes', () => {
    expect(buildSyntheticLaneOperators([operatorLane({ isVisible: false })])).toEqual([])
  })

  it('skips a source:"operator" lane missing its operator config', () => {
    const lane = operatorLane()
    // @ts-expect-error deliberately malformed for the guard test
    delete lane.operator
    expect(buildSyntheticLaneOperators([lane])).toEqual([])
  })

  it('skips a non-t-domain operator lane (§3.2 spatial-lane guard)', () => {
    const lane = operatorLane({ axisBinding: { domain: 'y', bindingRule: 'broadcast', interpolationMode: 'linear' } })
    expect(buildSyntheticLaneOperators([lane])).toEqual([])
  })

  it('emits one op per lane for multiple operator lanes', () => {
    const ops = buildSyntheticLaneOperators([
      operatorLane({ id: 'a' }),
      operatorLane({ id: 'b', paramPath: 'fx-1.other' }),
    ])
    expect(ops.map((o) => o.id).sort()).toEqual(['__lane__a', '__lane__b'])
  })
})

// ---------------------------------------------------------------------------
// buildOperatorLaneSpecs
// ---------------------------------------------------------------------------

describe('buildOperatorLaneSpecs', () => {
  it('is empty when no operator lanes exist', () => {
    const { specs, baseNormalized } = buildOperatorLaneSpecs([absoluteLane(), drawnModLane()], 0, registry)
    expect(specs).toEqual([])
    expect(baseNormalized).toEqual({})
  })

  it('specs carry param_path/operator_id/blend_op/depth/min/max', () => {
    const lane = operatorLane({ blendOp: 'multiply', operator: { type: 'lfo', params: {}, depth: 0.5, min: 0.1, max: 0.9 } })
    const { specs } = buildOperatorLaneSpecs([lane], 0, registry)
    expect(specs).toEqual([
      {
        param_path: 'fx-1.amount',
        operator_id: '__lane__op-lane-1',
        blend_op: 'multiply',
        depth: 0.5,
        min: 0.1,
        max: 0.9,
      },
    ])
  })

  it('depth/min/max default to 1/0/1 when absent', () => {
    const lane = operatorLane({ operator: { type: 'lfo', params: {} } })
    const { specs } = buildOperatorLaneSpecs([lane], 0, registry)
    expect(specs[0]).toMatchObject({ depth: 1, min: 0, max: 1 })
  })

  it('domain:"t" filter drops non-t operator lanes from specs too', () => {
    const lane = operatorLane({ axisBinding: { domain: 'x', bindingRule: 'broadcast', interpolationMode: 'linear' } })
    const { specs } = buildOperatorLaneSpecs([lane], 0, registry)
    expect(specs).toEqual([])
  })

  it('baseNormalized = compose(absolute, drawn-mod) at the given time, for an operator-lane paramPath', () => {
    // absolute 0.5 + drawn mod 0.2 (add) -> 0.7, mirrors evaluateAutomationOverrides math.
    const lanes = [absoluteLane(), drawnModLane(), operatorLane()]
    const { baseNormalized } = buildOperatorLaneSpecs(lanes, 0, registry)
    expect(baseNormalized['fx-1.amount']).toBeCloseTo(0.7)
  })

  it('baseNormalized is null when no absolute/drawn lane exists on the paramPath', () => {
    const { baseNormalized } = buildOperatorLaneSpecs([operatorLane()], 0, registry)
    expect(baseNormalized['fx-1.amount']).toBeNull()
  })

  it('the operator lane itself never contributes to baseNormalized (excluded from drawn composition)', () => {
    // Two operator lanes on the same param, no absolute/drawn lane at all —
    // base must stay null, NOT be seeded from either operator lane's config.
    const lanes = [operatorLane({ id: 'a' }), operatorLane({ id: 'b' })]
    const { baseNormalized } = buildOperatorLaneSpecs(lanes, 0, registry)
    expect(baseNormalized['fx-1.amount']).toBeNull()
  })

  it('respects last-absolute-wins + same-domain-only drawn mod folding (mirrors evaluateAutomationOverrides)', () => {
    const firstAbs = absoluteLane({ id: 'a', points: [{ time: 0, value: 0.1, curve: 0 }] })
    const secondAbs = absoluteLane({ id: 'b', points: [{ time: 0, value: 0.9, curve: 0 }] })
    const lanes = [firstAbs, secondAbs, operatorLane()]
    const { baseNormalized } = buildOperatorLaneSpecs(lanes, 0, registry)
    expect(baseNormalized['fx-1.amount']).toBeCloseTo(0.9) // last absolute wins
  })
})

// ---------------------------------------------------------------------------
// evaluateAutomationOverrides skips source:'operator' lanes
// ---------------------------------------------------------------------------

describe('evaluateAutomationOverrides — AA.3 guard: skips operator-sourced lanes', () => {
  it('emits no REPLACE for a paramPath with ONLY an operator lane', () => {
    const result = evaluateAutomationOverrides([operatorLane()], 0, registry)
    expect(result['fx-1.amount']).toBeUndefined()
  })

  it('an absolute lane sharing the paramPath still emits (operator lane is simply excluded from the group)', () => {
    const result = evaluateAutomationOverrides([absoluteLane(), operatorLane()], 0, registry)
    // Absolute alone -> 0.5 -> denorm [0,100] = 50 (operator lane contributes nothing here)
    expect(result['fx-1.amount']).toBeCloseTo(50)
  })

  it('a drawn modulation lane still composes normally alongside a (skipped) operator lane on a DIFFERENT param', () => {
    const result = evaluateAutomationOverrides(
      [absoluteLane(), drawnModLane(), operatorLane({ paramPath: 'fx-1.other' })],
      0,
      registry,
    )
    expect(result['fx-1.amount']).toBeCloseTo(70) // unaffected by the unrelated operator lane
    expect(result['fx-1.other']).toBeUndefined() // operator-only param never emits
  })
})

// ---------------------------------------------------------------------------
// Back-compat: zero operator lanes -> byte-identical payload
// ---------------------------------------------------------------------------

describe('back-compat — zero operator lanes produces empty/unaffected AA.3 payloads', () => {
  it('buildSyntheticLaneOperators returns [] for an AA.2-only lane set', () => {
    const lanes = [absoluteLane(), drawnModLane()]
    expect(buildSyntheticLaneOperators(lanes)).toEqual([])
  })

  it('buildOperatorLaneSpecs returns {specs:[], baseNormalized:{}} for an AA.2-only lane set', () => {
    const lanes = [absoluteLane(), drawnModLane()]
    expect(buildOperatorLaneSpecs(lanes, 0, registry)).toEqual({ specs: [], baseNormalized: {} })
  })

  it('evaluateAutomationOverrides output is IDENTICAL with and without the AA.3 guard present (no operator lanes in play)', () => {
    const lanes = [absoluteLane(), drawnModLane()]
    // The guard only ever short-circuits lane.source === 'operator'; with no
    // such lanes present, output must be byte-identical to pre-AA.3 (this
    // pins the guard as a true no-op for AA.2-only projects).
    expect(evaluateAutomationOverrides(lanes, 0, registry)).toEqual({ 'fx-1.amount': 70 })
  })
})
