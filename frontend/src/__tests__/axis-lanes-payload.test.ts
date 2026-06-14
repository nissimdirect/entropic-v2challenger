/**
 * P6.6 — axis_lanes render-payload builder tests.
 *
 * Covers (named in packet TEST PLAN):
 *   - attaches axis_lanes only for y/x domains
 *   - omits key when empty (no y/x lanes → empty array)
 *   - omits entry for empty curve (negative)
 *   - snake_case serialization
 */
import { describe, it, expect } from 'vitest'
import { buildAxisLanes, sampleLaneCurve, AXIS_LANE_N_BANDS } from '../shared/axis-lanes'
import type { AutomationLane } from '../shared/types'

function lane(overrides: Partial<AutomationLane> = {}): AutomationLane {
  return {
    id: 'l1',
    paramPath: 'fx.blur.radius',
    color: '#fff',
    isVisible: true,
    points: [
      { time: 0, value: 0, curve: 0 },
      { time: 1, value: 1, curve: 0 },
    ],
    mode: 'smooth',
    ...overrides,
  }
}

describe('buildAxisLanes', () => {
  it('attaches axis_lanes only for y/x domains', () => {
    const lanes: AutomationLane[] = [
      lane({ id: 'y', axisBinding: { domain: 'y', bindingRule: 'broadcast', interpolationMode: 'linear' } }),
      lane({ id: 'x', axisBinding: { domain: 'x', bindingRule: 'broadcast', interpolationMode: 'linear' } }),
      lane({ id: 't', axisBinding: { domain: 't', bindingRule: 'broadcast', interpolationMode: 'linear' } }),
      lane({ id: 'c', axisBinding: { domain: 'c', bindingRule: 'broadcast', interpolationMode: 'linear' } }),
      lane({ id: 'none' }), // no axisBinding
    ]
    const out = buildAxisLanes(lanes)
    const domains = out.map((e) => e.domain).sort()
    expect(domains).toEqual(['x', 'y'])
  })

  it('omits key when empty (no y/x lanes returns [])', () => {
    const lanes = [
      lane({ id: 't', axisBinding: { domain: 't', bindingRule: 'broadcast', interpolationMode: 'linear' } }),
      lane({ id: 'none' }),
    ]
    expect(buildAxisLanes(lanes)).toEqual([])
  })

  it('omits entry for empty curve (negative)', () => {
    // A y-domain lane with ZERO points → empty curve → must be omitted entirely.
    const lanes = [
      lane({ id: 'empty', points: [], axisBinding: { domain: 'y', bindingRule: 'broadcast', interpolationMode: 'linear' } }),
      lane({ id: 'good', axisBinding: { domain: 'y', bindingRule: 'broadcast', interpolationMode: 'linear' } }),
    ]
    const out = buildAxisLanes(lanes)
    expect(out).toHaveLength(1)
    expect(out[0].curve.length).toBeGreaterThan(0)
    // never emit curve: []
    for (const entry of out) expect(entry.curve.length).toBeGreaterThan(0)
  })

  it('snake_case serialization', () => {
    const lanes = [
      lane({ paramPath: 'fx.glow.intensity', axisBinding: { domain: 'y', bindingRule: 'broadcast', interpolationMode: 'linear' } }),
    ]
    const [entry] = buildAxisLanes(lanes)
    expect(entry).toMatchObject({
      effect_id: 'fx.glow',
      param: 'intensity',
      domain: 'y',
      direction: 1.0,
      interp_mode: 'linear',
      loop_mode: 'off',
      n_bands: AXIS_LANE_N_BANDS,
    })
    expect(Array.isArray(entry.curve)).toBe(true)
    // explicit: no camelCase keys leaked
    expect(Object.keys(entry)).not.toContain('effectId')
    expect(Object.keys(entry)).not.toContain('interpMode')
  })

  it('skips hidden lanes', () => {
    const lanes = [
      lane({ isVisible: false, axisBinding: { domain: 'y', bindingRule: 'broadcast', interpolationMode: 'linear' } }),
    ]
    expect(buildAxisLanes(lanes)).toEqual([])
  })

  it('curve is finite-guarded', () => {
    const lanes = [
      lane({
        points: [
          { time: 0, value: NaN, curve: 0 },
          { time: 1, value: Infinity, curve: 0 },
        ],
        axisBinding: { domain: 'y', bindingRule: 'broadcast', interpolationMode: 'linear' },
      }),
    ]
    const [entry] = buildAxisLanes(lanes)
    for (const v of entry.curve) expect(Number.isFinite(v)).toBe(true)
  })
})

describe('sampleLaneCurve', () => {
  it('returns empty for zero-point lane', () => {
    expect(sampleLaneCurve(lane({ points: [] }))).toEqual([])
  })

  it('returns a flat array for single-point lane', () => {
    const out = sampleLaneCurve(lane({ points: [{ time: 0, value: 0.7, curve: 0 }] }), 8)
    expect(out).toHaveLength(8)
    expect(out.every((v) => v === 0.7)).toBe(true)
  })

  it('ramp produces monotonically increasing samples', () => {
    const out = sampleLaneCurve(lane(), 16)
    for (let i = 1; i < out.length; i++) {
      expect(out[i]).toBeGreaterThanOrEqual(out[i - 1])
    }
    expect(out[0]).toBeCloseTo(0, 5)
    expect(out[out.length - 1]).toBeCloseTo(1, 5)
  })
})
