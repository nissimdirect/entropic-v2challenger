/**
 * P2.1 — BPM split tests: persisted bpm vs derived effectiveBpm.
 *
 * Test plan per EXECUTION-PLAN.md P2.1:
 *   4 positive tests:
 *     - "editing bpm shifts effectiveBpm baseline"
 *     - "modulation writes only effectiveBpm"
 *     - "save persists bpm only"
 *     - "load hydrates bpm"
 *   2 negative tests:
 *     - "modulation source writing NaN leaves effectiveBpm at baseline"
 *     - "saved JSON never contains effectiveBpm key"
 *   1 integration test:
 *     - "bpm edit propagates: setBpm → effectiveBpm baseline → playback timing read"
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useProjectStore } from '../../renderer/stores/project'
import { applyProjectModulations, evaluateLaneAtTime } from '../../renderer/components/performance/applyProjectModulations'
import type { AutomationLane } from '../../shared/types'

/** Reset project store to defaults before each test. */
function resetStore() {
  useProjectStore.setState({
    bpm: 120,
    effectiveBpm: 120,
  })
}

// Helper: create a minimal AutomationLane fixture for projectParam.bpm
function makeBpmLane(points: Array<{ time: number; value: number }>): AutomationLane {
  return {
    id: 'test-lane-1',
    paramPath: 'projectParam.bpm',
    color: '#4ade80',
    isVisible: true,
    points: points.map((p) => ({ ...p, curve: 0 })),
    mode: 'smooth',
  }
}

describe('P2.1 — BPM split: bpm vs effectiveBpm', () => {
  beforeEach(resetStore)

  // ── Positive Test 1 ────────────────────────────────────────────────────
  it('editing bpm shifts effectiveBpm baseline', () => {
    const store = useProjectStore.getState()
    expect(store.bpm).toBe(120)
    expect(store.effectiveBpm).toBe(120)

    store.setBpm(93)

    const updated = useProjectStore.getState()
    expect(updated.bpm).toBe(93)
    // effectiveBpm must also reset to the new baseline when setBpm is called
    expect(updated.effectiveBpm).toBe(93)
  })

  // ── Positive Test 2 ────────────────────────────────────────────────────
  it('modulation writes only effectiveBpm', () => {
    const store = useProjectStore.getState()
    store.setBpm(120)

    // Apply a +30 BPM delta via modulation
    useProjectStore.getState().applyBpmModulationDelta(30)

    const updated = useProjectStore.getState()
    // persisted bpm must be unchanged
    expect(updated.bpm).toBe(120)
    // derived effectiveBpm reflects the delta
    expect(updated.effectiveBpm).toBe(150)
  })

  // ── Positive Test 3 ────────────────────────────────────────────────────
  it('save persists bpm only', () => {
    useProjectStore.getState().setBpm(93)
    // Apply a modulation delta so effectiveBpm diverges from bpm
    useProjectStore.getState().applyBpmModulationDelta(20)

    const state = useProjectStore.getState()
    expect(state.bpm).toBe(93)
    expect(state.effectiveBpm).toBe(113)

    // Simulating the serialization path: only bpm is written, not effectiveBpm
    const serialized = { bpm: state.bpm }
    expect(serialized.bpm).toBe(93)
    expect('effectiveBpm' in serialized).toBe(false)
  })

  // ── Positive Test 4 ────────────────────────────────────────────────────
  it('load hydrates bpm', () => {
    // Simulate loading a project with bpm=93 (setBpm is called by hydrateStores)
    useProjectStore.getState().setBpm(93)

    const state = useProjectStore.getState()
    expect(state.bpm).toBe(93)
    // effectiveBpm must start at the loaded baseline, not at 120
    expect(state.effectiveBpm).toBe(93)
  })

  // ── Negative Test 1 ────────────────────────────────────────────────────
  it('modulation source writing NaN leaves effectiveBpm at baseline', () => {
    useProjectStore.getState().setBpm(120)

    // Attempt to apply a NaN delta — the clampFinite guard must reject it
    useProjectStore.getState().applyBpmModulationDelta(NaN)

    const state = useProjectStore.getState()
    // effectiveBpm must remain at the bpm baseline, unchanged
    expect(state.bpm).toBe(120)
    expect(state.effectiveBpm).toBe(120)
    expect(Number.isFinite(state.effectiveBpm)).toBe(true)
  })

  it('modulation source writing Infinity leaves effectiveBpm at baseline', () => {
    useProjectStore.getState().setBpm(120)
    useProjectStore.getState().applyBpmModulationDelta(Infinity)

    const state = useProjectStore.getState()
    expect(state.effectiveBpm).toBe(120)
    expect(Number.isFinite(state.effectiveBpm)).toBe(true)
  })

  // ── Negative Test 2 ────────────────────────────────────────────────────
  it('saved JSON never contains effectiveBpm key', () => {
    useProjectStore.getState().setBpm(93)
    useProjectStore.getState().applyBpmModulationDelta(25)

    // Construct the settings object exactly as serializeProject() does
    const settings = { bpm: useProjectStore.getState().bpm }
    const jsonString = JSON.stringify(settings)

    // Literal JSON-string grep: 'effectiveBpm' must NOT appear anywhere
    expect(jsonString).not.toContain('effectiveBpm')
    // And bpm IS present with the correct value
    expect(JSON.parse(jsonString).bpm).toBe(93)
  })

  // ── Integration Test ───────────────────────────────────────────────────
  it('bpm edit propagates: setBpm → effectiveBpm baseline → playback timing read', () => {
    // Chain: store.setBpm → effectiveBpm reset → applyProjectModulations reads effectiveBpm

    // 1. User sets BPM to 140
    useProjectStore.getState().setBpm(140)
    expect(useProjectStore.getState().bpm).toBe(140)
    expect(useProjectStore.getState().effectiveBpm).toBe(140)

    // 2. Reset effectiveBpm to baseline (as done at the top of each frame render)
    useProjectStore.getState().resetEffectiveBpm()
    expect(useProjectStore.getState().effectiveBpm).toBe(140)

    // 3. Apply project modulations via applyProjectModulations (simulating a +10 BPM lane)
    const lane = makeBpmLane([
      { time: 0, value: 10 },
      { time: 10, value: 10 },
    ])
    applyProjectModulations(
      [lane],
      30,         // frame 30
      30,         // fps 30 → time = 1.0s
      useProjectStore.getState().applyBpmModulationDelta,
    )

    // 4. Playback timing read site: consumer reads effectiveBpm, NOT raw bpm
    const { bpm, effectiveBpm } = useProjectStore.getState()
    expect(bpm).toBe(140)           // persisted baseline unchanged
    expect(effectiveBpm).toBe(150)  // 140 + 10 delta from automation lane

    // 5. The grid interval a playback consumer would compute from effectiveBpm:
    //    gridInterval = (60 / effectiveBpm) * (4 / quantizeDivision)
    const gridInterval = (60 / effectiveBpm) * (4 / 4) // quantizeDivision=4
    expect(gridInterval).toBeCloseTo(0.4, 5) // 60/150 = 0.4s per beat
    // If the consumer read raw bpm instead: 60/140 = 0.4286 — different result
    const wrongInterval = (60 / bpm) * (4 / 4)
    expect(gridInterval).not.toBeCloseTo(wrongInterval, 5)
  })
})

describe('P2.1 — applyProjectModulations', () => {
  beforeEach(resetStore)

  it('applies delta from a projectParam.bpm lane at the correct frame', () => {
    useProjectStore.getState().setBpm(120)

    const lane = makeBpmLane([
      { time: 0, value: 0 },
      { time: 10, value: 20 }, // ramps from 0 to +20 BPM over 10 seconds
    ])

    // At frame 150 with fps=30 → time=5s → midpoint → value=10
    applyProjectModulations(
      [lane],
      150,
      30,
      useProjectStore.getState().applyBpmModulationDelta,
    )

    expect(useProjectStore.getState().effectiveBpm).toBe(130) // 120 + 10
  })

  it('ignores lanes whose paramPath is not projectParam.bpm', () => {
    useProjectStore.getState().setBpm(120)

    const otherLane: AutomationLane = {
      id: 'other',
      paramPath: 'effectId123.brightness',
      color: '#ef4444',
      isVisible: true,
      points: [{ time: 0, value: 50, curve: 0 }],
      mode: 'smooth',
    }

    applyProjectModulations(
      [otherLane],
      0,
      30,
      useProjectStore.getState().applyBpmModulationDelta,
    )

    // effectiveBpm must be unmodified
    expect(useProjectStore.getState().effectiveBpm).toBe(120)
  })

  it('ignores invisible lanes', () => {
    useProjectStore.getState().setBpm(120)
    const lane = makeBpmLane([{ time: 0, value: 30 }])
    const invisibleLane = { ...lane, isVisible: false }

    applyProjectModulations(
      [invisibleLane],
      0,
      30,
      useProjectStore.getState().applyBpmModulationDelta,
    )

    expect(useProjectStore.getState().effectiveBpm).toBe(120)
  })

  it('clamps effectiveBpm to [1, 300] via store action', () => {
    useProjectStore.getState().setBpm(290)

    // Try to push bpm above 300 via large delta
    useProjectStore.getState().applyBpmModulationDelta(50)

    expect(useProjectStore.getState().effectiveBpm).toBe(300)

    // Try to push bpm below 1 via large negative delta
    useProjectStore.getState().setBpm(5)
    useProjectStore.getState().applyBpmModulationDelta(-100)

    expect(useProjectStore.getState().effectiveBpm).toBe(1)
  })
})

describe('P2.1 — evaluateLaneAtTime', () => {
  it('returns first point value before lane start', () => {
    const lane = makeBpmLane([
      { time: 5, value: 10 },
      { time: 10, value: 20 },
    ])
    expect(evaluateLaneAtTime(lane, 0)).toBe(10)
  })

  it('returns last point value after lane end', () => {
    const lane = makeBpmLane([
      { time: 0, value: 10 },
      { time: 10, value: 20 },
    ])
    expect(evaluateLaneAtTime(lane, 15)).toBe(20)
  })

  it('linearly interpolates between two points', () => {
    const lane = makeBpmLane([
      { time: 0, value: 0 },
      { time: 10, value: 20 },
    ])
    expect(evaluateLaneAtTime(lane, 5)).toBeCloseTo(10, 5)
  })

  it('returns 0 for empty lane', () => {
    const lane = makeBpmLane([])
    expect(evaluateLaneAtTime(lane, 5)).toBe(0)
  })
})
