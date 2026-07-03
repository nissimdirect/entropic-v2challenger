/**
 * AA.2 — modulation lane composition, end-to-end through
 * evaluateAutomationOverrides.ts (the SAME choke point preview and export
 * baking both call — see that file's doc comment). Covers the hard oracle:
 *   (a) blend ops (add/multiply/max) denormalized into the param's range
 *   (b) the absolute lane's OWN points are never overwritten/mutated
 *   (c) clamp to the param's range
 *   (d) parity — the baked automation_by_frame value equals the blended
 *       preview value (export == preview)
 *   (e) a project with NO modulation lanes evaluates byte-identical to a
 *       hand-rolled "before AA.2" reference implementation (back-compat)
 */
import { describe, it, expect } from 'vitest'
import { evaluateAutomationOverrides } from '../../renderer/utils/evaluateAutomationOverrides'
import { evaluateAutomation, denormalize } from '../../renderer/utils/automation-evaluate'
import type { AutomationLane, EffectInfo } from '../../shared/types'

const registry: EffectInfo[] = [
  {
    id: 'fx-1',
    name: 'Test Effect',
    category: 'test',
    params: {
      amount: { type: 'float', min: 0, max: 100, default: 50, label: 'Amount' },
      mix: { type: 'float', min: 0, max: 1, default: 0.5, label: 'Mix' },
    },
  },
]

function absoluteLane(overrides: Partial<AutomationLane> = {}): AutomationLane {
  return {
    id: 'abs-1',
    paramPath: 'fx-1.amount',
    color: '#4ade80',
    isVisible: true,
    mode: 'smooth',
    // Constant 0.5 across all time — single point.
    points: [{ time: 0, value: 0.5, curve: 0 }],
    ...overrides,
  }
}

function modLane(overrides: Partial<AutomationLane> = {}): AutomationLane {
  return {
    id: 'mod-1',
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

describe('evaluateAutomationOverrides — AA.2 HARD ORACLE (a) blend ops, denormalized', () => {
  it("'add': absolute 0.5 + mod 0.2 -> normalized 0.7 -> denorm [0,100] = 70", () => {
    const result = evaluateAutomationOverrides([absoluteLane(), modLane()], 0, registry)
    expect(result['fx-1.amount']).toBeCloseTo(70)
  })

  it("'multiply': absolute 0.5 * mod 0.4 -> normalized 0.2 -> denorm [0,100] = 20", () => {
    const lanes = [absoluteLane(), modLane({ blendOp: 'multiply', points: [{ time: 0, value: 0.4, curve: 0 }] })]
    const result = evaluateAutomationOverrides(lanes, 0, registry)
    expect(result['fx-1.amount']).toBeCloseTo(20)
  })

  it("'max': max(absolute 0.5, mod 0.8) -> normalized 0.8 -> denorm [0,100] = 80", () => {
    const lanes = [absoluteLane(), modLane({ blendOp: 'max', points: [{ time: 0, value: 0.8, curve: 0 }] })]
    const result = evaluateAutomationOverrides(lanes, 0, registry)
    expect(result['fx-1.amount']).toBeCloseTo(80)
  })
})

describe('evaluateAutomationOverrides — AA.2 HARD ORACLE (b) absolute lane never overwritten', () => {
  it("the absolute lane's points array is untouched after composition", () => {
    const abs = absoluteLane()
    const originalPoints = JSON.parse(JSON.stringify(abs.points))
    const mod = modLane()
    evaluateAutomationOverrides([abs, mod], 0, registry)
    expect(abs.points).toEqual(originalPoints)
    // Both lanes still coexist in the same array, neither dropped.
    expect(abs.points.length).toBe(1)
  })

  it('the absolute lane still evaluates to its own drawn value in isolation (superimposition, not replacement)', () => {
    const abs = absoluteLane()
    const soloResult = evaluateAutomationOverrides([abs], 0, registry)
    expect(soloResult['fx-1.amount']).toBeCloseTo(50) // 0.5 -> denorm 50, unblended
  })
})

describe('evaluateAutomationOverrides — AA.2 HARD ORACLE (c) clamp to the param range', () => {
  it('an overflowing add clamps to the param max (100), not runs past it', () => {
    const abs = absoluteLane({ points: [{ time: 0, value: 0.9, curve: 0 }] })
    const mod = modLane({ points: [{ time: 0, value: 0.5, curve: 0 }] }) // 0.9+0.5=1.4 -> clamp 1.0
    const result = evaluateAutomationOverrides([abs, mod], 0, registry)
    expect(result['fx-1.amount']).toBe(100)
  })

  it('an underflowing add clamps to the param min (0)', () => {
    const abs = absoluteLane({ points: [{ time: 0, value: 0.1, curve: 0 }] })
    const mod = modLane({ points: [{ time: 0, value: -0.5, curve: 0 }] })
    const result = evaluateAutomationOverrides([abs, mod], 0, registry)
    expect(result['fx-1.amount']).toBe(0)
  })

  it('clamps correctly for a non-[0,1] param range too ([0,1] mix param)', () => {
    const abs = absoluteLane({ paramPath: 'fx-1.mix', points: [{ time: 0, value: 0.95, curve: 0 }] })
    const mod = modLane({ paramPath: 'fx-1.mix', points: [{ time: 0, value: 0.5, curve: 0 }] })
    const result = evaluateAutomationOverrides([abs, mod], 0, registry)
    expect(result['fx-1.mix']).toBeLessThanOrEqual(1)
    expect(result['fx-1.mix']).toBe(1)
  })
})

describe('evaluateAutomationOverrides — AA.2 HARD ORACLE (d) export/preview PARITY', () => {
  /** Mirrors App.tsx's export-dispatch pre-resolution loop (see
   *  export-parity-automation.test.ts) — the exact per-source-frame bake
   *  the real export path runs. */
  function buildAutomationByFrame(
    lanes: AutomationLane[],
    startFrame: number,
    endFrame: number,
    sourceFps: number,
  ): Record<number, Record<string, number>> {
    const out: Record<number, Record<string, number>> = {}
    for (let f = startFrame; f <= endFrame; f++) {
      const overrides = evaluateAutomationOverrides(lanes, f / sourceFps, registry)
      if (Object.keys(overrides).length > 0) out[f] = overrides
    }
    return out
  }

  it('the baked automation_by_frame value equals the live-preview blended value at the same time', () => {
    const abs = absoluteLane()
    const mod = modLane()
    const lanes = [abs, mod]

    // "Preview" path: evaluate directly at a playhead time.
    const previewTime = 10 / 30 // frame 10 @ 30fps
    const previewValue = evaluateAutomationOverrides(lanes, previewTime, registry)['fx-1.amount']

    // "Export" path: pre-resolve the whole frame range, read the same frame back.
    const baked = buildAutomationByFrame(lanes, 0, 30, 30)
    const bakedValue = baked[10]['fx-1.amount']

    expect(bakedValue).toBe(previewValue)
    // And it's the actually-blended value (70), not the unblended absolute (50).
    expect(bakedValue).toBeCloseTo(70)
  })
})

describe('evaluateAutomationOverrides — AA.2 HARD ORACLE (e) back-compat: no modulation lanes -> byte-identical to pre-AA.2', () => {
  /** The EXACT pre-AA.2 loop body (verbatim copy of the old implementation) —
   *  used as the reference oracle a modulation-free evaluation must match. */
  function preAA2Reference(
    lanes: AutomationLane[],
    time: number,
    reg: EffectInfo[],
  ): Record<string, number> {
    const overrides: Record<string, number> = {}
    for (const lane of lanes) {
      if (!lane.isVisible) continue
      const normalized = evaluateAutomation(lane, time)
      if (normalized === null) continue
      if (!Number.isFinite(normalized)) continue
      const dotIdx = lane.paramPath.indexOf('.')
      if (dotIdx === -1) continue
      const effectId = lane.paramPath.slice(0, dotIdx)
      const paramKey = lane.paramPath.slice(dotIdx + 1)
      const effectInfo = reg.find((r) => r.id === effectId)
      const paramDef = effectInfo?.params[paramKey]
      const pMin = paramDef?.min ?? 0
      const pMax = paramDef?.max ?? 1
      const value = denormalize(normalized, pMin, pMax)
      if (!Number.isFinite(value)) continue
      overrides[lane.paramPath] = value
    }
    return overrides
  }

  it('matches the pre-AA.2 reference across multiple lanes/params/times with no modulation lanes present', () => {
    const laneA = absoluteLane({ id: 'a', paramPath: 'fx-1.amount', points: [
      { time: 0, value: 0, curve: 0 },
      { time: 10, value: 1, curve: 0 },
    ] })
    const laneB = absoluteLane({ id: 'b', paramPath: 'fx-1.mix', points: [
      { time: 0, value: 0.2, curve: 0 },
      { time: 10, value: 0.9, curve: -1 },
    ] })
    const lanes = [laneA, laneB]

    for (const t of [0, 1.5, 5, 8.3, 10, 15]) {
      expect(evaluateAutomationOverrides(lanes, t, registry)).toEqual(
        preAA2Reference(lanes, t, registry),
      )
    }
  })

  it('matches even when a lane explicitly carries kind: "absolute" (not just absent)', () => {
    const lanes = [absoluteLane({ kind: 'absolute' })]
    expect(evaluateAutomationOverrides(lanes, 0, registry)).toEqual(
      preAA2Reference(lanes, 0, registry),
    )
  })

  it('multiple absolute lanes on the same param: last-wins, unchanged from pre-AA.2', () => {
    const first = absoluteLane({ id: 'a', points: [{ time: 0, value: 0.1, curve: 0 }] })
    const second = absoluteLane({ id: 'b', points: [{ time: 0, value: 0.9, curve: 0 }] })
    const lanes = [first, second]
    expect(evaluateAutomationOverrides(lanes, 0, registry)).toEqual(
      preAA2Reference(lanes, 0, registry),
    )
    // And specifically: the LAST lane in array order wins (90, not 10).
    expect(evaluateAutomationOverrides(lanes, 0, registry)['fx-1.amount']).toBeCloseTo(90)
  })
})
