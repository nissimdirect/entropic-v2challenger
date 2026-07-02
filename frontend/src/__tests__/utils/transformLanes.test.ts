/**
 * A1+A2 — clip-transform automation lane tests.
 *
 * Covers: paramPath parse/format round-trip; per-frame evaluation (lane point at
 * frame N REPLACES its field, others keep base); the finite-guard (NaN point →
 * field dropped → base kept); zero-transform-lane regression (empty result, so
 * the render payload stays byte-identical); and the store→lane draw path
 * (setPoints on a transform-lane paramPath drives the evaluator).
 */
import { describe, it, expect, vi } from 'vitest'
import type { AutomationLane } from '../../shared/types'
import { IDENTITY_TRANSFORM, normalizeTransform } from '../../shared/types'
import {
  TRANSFORM_FIELDS,
  formatTransformLanePath,
  formatTransformLaneEffectId,
  parseTransformLanePath,
  evaluateTransformOverrides,
  mergeTransformOverride,
} from '../../renderer/utils/transformLanes'

function makeLane(paramPath: string, points: AutomationLane['points'], extra: Partial<AutomationLane> = {}): AutomationLane {
  return {
    id: `lane-${paramPath}`,
    paramPath,
    color: '#4ade80',
    isVisible: true,
    mode: 'smooth',
    points,
    ...extra,
  }
}

describe('transformLanes — addressing (A1)', () => {
  it('format/parse round-trips for every field', () => {
    const clipId = 'clip-1720000000000-3'
    for (const field of TRANSFORM_FIELDS) {
      const path = formatTransformLanePath(clipId, field)
      expect(path).toBe(`clipTransform.${clipId}.${field}`)
      const parsed = parseTransformLanePath(path)
      expect(parsed).toEqual({ clipId, field })
    }
  })

  it('effectId + field concatenation matches the store addLane scheme', () => {
    // The store builds paramPath = `${effectId}.${paramKey}`. The toolbar passes
    // formatTransformLaneEffectId(clipId) as effectId and the field as paramKey.
    const clipId = 'clip-A'
    const effectId = formatTransformLaneEffectId(clipId)
    const paramPath = `${effectId}.rotation`
    expect(paramPath).toBe('clipTransform.clip-A.rotation')
    expect(parseTransformLanePath(paramPath)).toEqual({ clipId: 'clip-A', field: 'rotation' })
  })

  it('parses a clipId that itself contains dots (field read from the end)', () => {
    const parsed = parseTransformLanePath('clipTransform.weird.clip.id.scaleX')
    expect(parsed).toEqual({ clipId: 'weird.clip.id', field: 'scaleX' })
  })

  it('rejects non-transform / malformed paths', () => {
    expect(parseTransformLanePath('fx-1.amount')).toBeNull()
    expect(parseTransformLanePath('projectParam.bpm')).toBeNull()
    expect(parseTransformLanePath('clipTransform.clip-1.notAField')).toBeNull()
    expect(parseTransformLanePath('clipTransform.x')).toBeNull() // no clipId segment
    expect(parseTransformLanePath('clipTransform.')).toBeNull()
  })
})

describe('transformLanes — evaluateTransformOverrides (A2)', () => {
  it('a lane point at the eval frame REPLACES its field; other fields keep the base', () => {
    // x lane: normalized 1.0 at t=10 → display range [-2000,2000] → +2000 px.
    const lane = makeLane('clipTransform.clip-1.x', [
      { time: 0, value: 0.5, curve: 0 }, // 0 px
      { time: 10, value: 1, curve: 0 }, // +2000 px
    ])
    const overrides = evaluateTransformOverrides([lane], 10)
    expect(overrides['clip-1']).toEqual({ x: 2000 })

    // Fold onto a base with a non-identity y — x replaced, y preserved.
    const base = normalizeTransform({ x: 111, y: 42, rotation: 5 })
    const folded = mergeTransformOverride(base, overrides['clip-1'])
    expect(folded.x).toBe(2000) // replaced
    expect(folded.y).toBe(42) // kept
    expect(folded.rotation).toBe(5) // kept
  })

  it('scale lane maps 0..1 onto the scale display range [0.01,10]', () => {
    const lane = makeLane('clipTransform.clip-1.scaleX', [
      { time: 0, value: 0, curve: 0 },
      { time: 10, value: 1, curve: 0 },
    ])
    expect(evaluateTransformOverrides([lane], 0)['clip-1']).toEqual({ scaleX: 0.01 })
    expect(evaluateTransformOverrides([lane], 10)['clip-1']).toEqual({ scaleX: 10 })
  })

  it('interpolates between points using the shared evaluator', () => {
    // x lane at t=5 (midpoint 0→1) → 0.5 normalized → 0 px on [-2000,2000].
    const lane = makeLane('clipTransform.clip-1.x', [
      { time: 0, value: 0, curve: 0 },
      { time: 10, value: 1, curve: 0 },
    ])
    expect(evaluateTransformOverrides([lane], 5)['clip-1'].x).toBeCloseTo(0, 6)
  })

  it('groups multiple fields of the same clip into one override object', () => {
    const lanes = [
      makeLane('clipTransform.clip-1.x', [{ time: 0, value: 1, curve: 0 }]),
      makeLane('clipTransform.clip-1.rotation', [{ time: 0, value: 1, curve: 0 }]),
    ]
    const ov = evaluateTransformOverrides(lanes, 0)['clip-1']
    expect(ov.x).toBe(2000)
    expect(ov.rotation).toBe(360)
  })

  it('skips hidden lanes', () => {
    const lane = makeLane('clipTransform.clip-1.x', [{ time: 0, value: 1, curve: 0 }], { isVisible: false })
    expect(evaluateTransformOverrides([lane], 0)).toEqual({})
  })

  it('clamps beyond the store (backend) range — never exceeds _apply_clip_transform bounds', () => {
    // A hand-authored point value >1 would denormalize past display max; the
    // store clamp still caps at the backend bound (scaleX store max = 100).
    const lane = makeLane('clipTransform.clip-1.scaleX', [{ time: 0, value: 50, curve: 0 }])
    const ov = evaluateTransformOverrides([lane], 0)['clip-1']
    expect(ov.scaleX).toBeLessThanOrEqual(100)
    expect(Number.isFinite(ov.scaleX)).toBe(true)
  })
})

describe('transformLanes — finite guard (trust boundary)', () => {
  it('a NaN-valued point is dropped → base value kept, no NaN in the fold', () => {
    // evaluateAutomation returns the raw point value; a NaN point → normalized
    // NaN → dropped by the finite guard, so the clip gets NO override.
    const lane = makeLane('clipTransform.clip-1.x', [{ time: 0, value: NaN, curve: 0 }])
    const overrides = evaluateTransformOverrides([lane], 0)
    expect(overrides['clip-1']).toBeUndefined()

    // mergeTransformOverride with an empty/NaN override keeps the base intact.
    const base = normalizeTransform({ x: 250 })
    const folded = mergeTransformOverride(base, { x: NaN })
    expect(folded.x).toBe(250) // NaN override ignored → base kept
    expect(Number.isFinite(folded.x)).toBe(true)
  })

  it('Infinity is dropped too', () => {
    const lane = makeLane('clipTransform.clip-1.y', [{ time: 0, value: Infinity, curve: 0 }])
    expect(evaluateTransformOverrides([lane], 0)['clip-1']).toBeUndefined()
  })
})

describe('transformLanes — zero-lane regression', () => {
  it('no transform lanes → empty override map (payload stays byte-identical)', () => {
    const effectLane = makeLane('fx-1.amount', [{ time: 0, value: 0.5, curve: 0 }])
    expect(evaluateTransformOverrides([effectLane], 0)).toEqual({})
    expect(evaluateTransformOverrides([], 0)).toEqual({})
  })

  it('mergeTransformOverride with an empty override returns the identity base unchanged', () => {
    const folded = mergeTransformOverride(undefined, {})
    expect(folded).toEqual(IDENTITY_TRANSFORM)
  })
})

describe('transformLanes — draw path parity', () => {
  it('points written by the draw stroke drive the evaluator like any lane', () => {
    // AutomationDraw commits via store.setPoints(trackId, laneId, points) with
    // normalized 0..1 values — paramPath-agnostic. Simulate that stroke result
    // on a transform-lane paramPath and confirm the evaluator reads it.
    const drawnPoints = [
      { time: 0, value: 0, curve: 0 },
      { time: 4, value: 1, curve: 0 },
    ]
    const lane = makeLane('clipTransform.clip-1.rotation', drawnPoints)
    // Freehand draw doesn't warn or throw for transform lanes.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ov = evaluateTransformOverrides([lane], 4)['clip-1']
    expect(ov.rotation).toBe(360)
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
