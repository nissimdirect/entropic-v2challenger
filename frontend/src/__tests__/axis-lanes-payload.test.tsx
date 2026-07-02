/**
 * P6.6 — axis_lanes render-payload builder tests.
 *
 * Covers (named in packet TEST PLAN):
 *   - attaches axis_lanes only for y/x domains
 *   - omits key when empty (no y/x lanes → empty array)
 *   - omits entry for empty curve (negative)
 *   - snake_case serialization
 *
 * F7 (2026-07-02 month-audit-fix-plan) — sweep addendum. `buildAxisLanes` is
 * a pure-function unit test (legitimate — no App.tsx call-site logic is
 * reimplemented here), BUT no test anywhere proved App.tsx actually WIRES
 * `axis_lanes` onto the real IPC payload. That's the exact "not wired
 * end-to-end" bug class the granulator payload test (F7) was fixed for:
 * `axis_lanes` is an ADDITIVE-OPTIONAL key (App.tsx: `...(axisLanes.length >
 * 0 ? { axis_lanes: axisLanes } : {})`), so if the wiring silently broke,
 * nothing else in the preview would visibly change — same silent-drop risk
 * profile as `performance.granulator`. Added a render+intercept wiring test
 * below using the same helper as the granulator fix.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, waitFor } from '@testing-library/react'
import { buildAxisLanes, sampleLaneCurve, AXIS_LANE_N_BANDS } from '../shared/axis-lanes'
import type { AutomationLane } from '../shared/types'
import { useTimelineStore } from '../renderer/stores/timeline'
import { useAutomationStore } from '../renderer/stores/automation'
import { useProjectStore } from '../renderer/stores/project'
import { teardownMockEntropic } from './helpers/mock-entropic'
import { renderAppWithImportedMedia } from './helpers/render-app-with-media'

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

// ---------------------------------------------------------------------------
// F7 sweep addendum — real render + intercepted IPC wiring test.
// ---------------------------------------------------------------------------

describe('axis_lanes wiring (real render + intercepted IPC)', () => {
  afterEach(() => {
    cleanup()
    teardownMockEntropic()
    vi.restoreAllMocks()
    useTimelineStore.getState().reset()
    useAutomationStore.getState().resetAutomation()
    useProjectStore.setState({ assets: {} })
  })

  it('import media -> add a y-domain automation lane -> the REAL sendCommand payload carries axis_lanes with the exact backend contract', async () => {
    const { sendCommandCalls } = await renderAppWithImportedMedia()
    const preLaneCallCount = sendCommandCalls.length

    // The import flow auto-creates exactly one video track — attach a real
    // automation lane to it via the SAME store actions the Automation Lane
    // UI dispatches (addLane -> setLaneAxisBinding -> addPoint), not a
    // hand-built fixture.
    const trackId = useTimelineStore.getState().tracks[0]?.id
    expect(trackId).toBeDefined()

    const autoStore = useAutomationStore.getState()
    autoStore.addLane(trackId as string, 'fx.glow', 'intensity', '#4ade80')
    const laneId = useAutomationStore.getState().lanes[trackId as string]?.[0]?.id
    expect(laneId).toBeDefined()
    autoStore.setLaneAxisBinding(trackId as string, laneId as string, {
      domain: 'y',
      bindingRule: 'broadcast',
      interpolationMode: 'linear',
    })
    autoStore.addPoint(trackId as string, laneId as string, 0, 0)
    autoStore.addPoint(trackId as string, laneId as string, 1, 1)

    // requestRenderFrame reads automation lanes via `.getState()` (not a
    // reactive subscription), so we need a render RE-trigger: bump the
    // playhead the same way scrubbing does. This hits the real base render
    // effect (deps: [currentFrame, effectChain, requestRenderFrame]).
    useProjectStore.getState().setCurrentFrame(1)

    await waitFor(() => {
      expect(sendCommandCalls.length).toBeGreaterThan(preLaneCallCount)
    })
    await waitFor(() => {
      const call = sendCommandCalls.find((c) => Array.isArray(c.axis_lanes) && (c.axis_lanes as unknown[]).length > 0)
      expect(call).toBeDefined()
    })

    const call = sendCommandCalls.find(
      (c) => Array.isArray(c.axis_lanes) && (c.axis_lanes as unknown[]).length > 0,
    )!
    const axisLanes = call.axis_lanes as Record<string, unknown>[]
    const entry = axisLanes[0]

    // --- backend axis_lanes contract, field-by-field, off the ACTUAL
    // intercepted IPC payload (not a hand-copied mirror) --------------------
    expect(entry.effect_id).toBe('fx.glow')
    expect(entry.param).toBe('intensity')
    expect(entry.domain).toBe('y')
    expect(entry.interp_mode).toBe('linear')
    expect(entry.n_bands).toBe(AXIS_LANE_N_BANDS)
    expect(Array.isArray(entry.curve)).toBe(true)
    expect((entry.curve as number[]).length).toBeGreaterThan(0)
    // no camelCase keys leaked onto the wire
    expect(Object.keys(entry)).not.toContain('effectId')
    expect(Object.keys(entry)).not.toContain('interpMode')
  })

  it('no automation lanes -> the REAL sendCommand payload omits axis_lanes entirely (regression-safe)', async () => {
    const { sendCommandCalls } = await renderAppWithImportedMedia()
    // At least one real render call happened during import (asserted inside
    // the helper) — none of them should carry axis_lanes with no lanes set.
    for (const call of sendCommandCalls) {
      if (call.cmd === 'render_frame' || call.cmd === 'render_composite') {
        expect(call.axis_lanes).toBeUndefined()
      }
    }
  })
})
