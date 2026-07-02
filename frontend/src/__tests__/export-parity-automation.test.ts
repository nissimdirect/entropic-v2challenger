/**
 * P2.3 — Slice 3d: full export parity (frontend payload).
 *
 * The export must run the SAME modulation engine the preview render path runs.
 * For automation (which is time-based and evaluated frontend-side in preview),
 * the export PRE-RESOLVES the override map per source frame using the SAME
 * `evaluateAutomationOverrides` evaluator preview uses — so the exported values
 * are byte-identical to preview, with no second backend evaluator that could
 * drift. This test pins that pre-resolution loop (the exact logic the export
 * dispatch in App.tsx runs to build `automation_by_frame`).
 *
 * Backend contract (backend/src/engine/export.py `modulate_chain_for_frame`):
 *   automation_by_frame = { sourceFrameIndex: { "effectId.paramKey": value } }
 *   frame f's evaluation time = f / sourceFps.
 */
import { describe, it, expect } from 'vitest'
import { evaluateAutomationOverrides } from '../renderer/utils/evaluateAutomationOverrides'
import type { AutomationLane, EffectInfo } from '../shared/types'

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

function makeLane(overrides: Partial<AutomationLane> = {}): AutomationLane {
  return {
    id: 'lane-1',
    paramPath: 'fx-1.amount',
    color: '#4ade80',
    isVisible: true,
    mode: 'smooth',
    points: [
      { time: 0, value: 0, curve: 0 },
      { time: 1, value: 1, curve: 0 },
    ],
    ...overrides,
  }
}

/**
 * The exact pre-resolution the export dispatch performs (mirrors App.tsx P2.3
 * block). Extracted here as the pure testable primitive.
 */
function buildAutomationByFrame(
  lanes: AutomationLane[],
  startFrame: number,
  endFrame: number,
  sourceFps: number,
  reg: EffectInfo[],
): Record<number, Record<string, number>> {
  const out: Record<number, Record<string, number>> = {}
  if (lanes.length === 0) return out
  for (let f = startFrame; f <= endFrame; f++) {
    const overrides = evaluateAutomationOverrides(lanes, f / sourceFps, reg)
    if (Object.keys(overrides).length > 0) {
      out[f] = overrides
    }
  }
  return out
}

describe('P2.3 export automation pre-resolution', () => {
  it('builds a per-source-frame override map keyed by frame index', () => {
    const lane = makeLane() // 0->1 over t in [0,1]s
    const map = buildAutomationByFrame([lane], 0, 30, 30, registry)
    // 31 frames (0..30) at 30fps cover t in [0,1]s — all have overrides.
    expect(Object.keys(map)).toHaveLength(31)
    // frame 0 -> t=0 -> value 0 (denormalized to [0,100] = 0)
    expect(map[0]['fx-1.amount']).toBeCloseTo(0)
    // frame 15 -> t=0.5s -> value 0.5 -> 50
    expect(map[15]['fx-1.amount']).toBeCloseTo(50)
    // frame 30 -> t=1.0s -> value 1.0 -> 100
    expect(map[30]['fx-1.amount']).toBeCloseTo(100)
  })

  it('evaluation time = frame / sourceFps (fps-correct mapping)', () => {
    const lane = makeLane()
    // At 60fps, frame 30 -> t=0.5s -> 50 (same SECOND as frame 15 @ 30fps).
    const map60 = buildAutomationByFrame([lane], 0, 60, 60, registry)
    expect(map60[30]['fx-1.amount']).toBeCloseTo(50)
    const map30 = buildAutomationByFrame([lane], 0, 30, 30, registry)
    // Same timeline second -> same value across frame rates.
    expect(map60[30]['fx-1.amount']).toBeCloseTo(map30[15]['fx-1.amount'])
  })

  it('returns an empty map when there are no lanes (legacy export, no payload)', () => {
    expect(buildAutomationByFrame([], 0, 30, 30, registry)).toEqual({})
  })

  it('omits frames whose lanes are not visible (no override entry)', () => {
    const hidden = makeLane({ isVisible: false })
    const map = buildAutomationByFrame([hidden], 0, 30, 30, registry)
    expect(Object.keys(map)).toHaveLength(0)
  })

  it('respects a sub-range (start/end frame) export region', () => {
    const lane = makeLane()
    const map = buildAutomationByFrame([lane], 10, 20, 30, registry)
    expect(Object.keys(map).map(Number).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 11 }, (_, i) => 10 + i),
    )
    // No frames outside the requested range.
    expect(map[9]).toBeUndefined()
    expect(map[21]).toBeUndefined()
  })

  it('produces finite values only (NaN/Infinity guarded by the evaluator)', () => {
    const lane = makeLane()
    const map = buildAutomationByFrame([lane], 0, 30, 30, registry)
    for (const frame of Object.values(map)) {
      for (const v of Object.values(frame)) {
        expect(Number.isFinite(v)).toBe(true)
      }
    }
  })
})
