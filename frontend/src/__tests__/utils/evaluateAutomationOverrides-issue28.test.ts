/**
 * #28 (HIGH, adjudicated-confirmed) — evaluateAutomationOverrides.ts's param
 * bounds lookup used to split `paramPath` on the FIRST dot and
 * `registry.find(r => r.id === effectId)`. TWO failure modes always missed →
 * silent [0,1] fallback:
 *
 *   1. Track-lane paramPaths are INSTANCE-keyed: `${effect.id}.${key}` where
 *      `effect.id` is the EffectInstance uuid, not a registry key (Track.tsx:111).
 *      First-dot split yields the instance id, which the registry (keyed by
 *      TYPE) never contains → always the [0,1] fallback.
 *   2. Master/type-keyed lanes use dotted TYPE ids directly
 *      (e.g. "fx.hue_shift.amount", shared/axis-lanes.ts:136 convention) —
 *      first-dot split yields just "fx", never a real registry id either.
 *
 * Both cases mean ANY modulation lane on a non-[0,1] param clamped to the
 * WRONG range (AA.2's `if (mods.length > 0) clamp(lo,hi)` clamped to [0,1]
 * instead of the param's real bounds).
 *
 * This file is the failing-first regression oracle for both keying schemes,
 * using a REAL non-[0,1] range ([0,360], e.g. a hue param) end to end through
 * evaluateAutomationOverrides — the exact function both preview
 * (App.tsx requestRenderFrame) and export bake call through.
 */
import { describe, it, expect } from 'vitest'
import { evaluateAutomationOverrides } from '../../renderer/utils/evaluateAutomationOverrides'
import type { AutomationLane, EffectInfo, Track, EffectInstance } from '../../shared/types'

const registry: EffectInfo[] = [
  {
    id: 'fx.hue_shift',
    name: 'Hue Shift',
    category: 'color',
    params: {
      // Non-[0,1] range — the case #28 always mis-clamped.
      amount: { type: 'float', min: 0, max: 360, default: 0, label: 'Amount' },
    },
  },
]

function makeInstance(overrides: Partial<EffectInstance> = {}): EffectInstance {
  return {
    id: 'instance-uuid-1',
    effectId: 'fx.hue_shift',
    isEnabled: true,
    isFrozen: false,
    parameters: {},
    modulations: {},
    mix: 1.0,
    mask: null,
    ...overrides,
  }
}

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    type: 'video',
    name: 'Track 1',
    color: '#fff',
    isMuted: false,
    isSoloed: false,
    clips: [],
    effectChain: [makeInstance()],
    automationLanes: [],
    ...overrides,
  }
}

function absoluteLane(overrides: Partial<AutomationLane> = {}): AutomationLane {
  return {
    id: 'abs-1',
    paramPath: 'instance-uuid-1.amount',
    color: '#4ade80',
    isVisible: true,
    mode: 'smooth',
    // 0.5 normalized -> denorm [0,360] = 180
    points: [{ time: 0, value: 0.5, curve: 0 }],
    ...overrides,
  }
}

function modLane(overrides: Partial<AutomationLane> = {}): AutomationLane {
  return {
    id: 'mod-1',
    paramPath: 'instance-uuid-1.amount',
    color: '#3b82f6',
    isVisible: true,
    mode: 'smooth',
    kind: 'modulation',
    blendOp: 'add',
    // 0.9 normalized add -> composed 1.4 -> would clamp to [0,1]=1 pre-fix,
    // must clamp to [0,360]=360 post-fix.
    points: [{ time: 0, value: 0.9, curve: 0 }],
    ...overrides,
  }
}

describe('#28 — INSTANCE-keyed paramPath resolves real [0,360] bounds via tracks context', () => {
  it('composes+clamps in [0,360], not [0,1], when the caller threads tracks', () => {
    const tracks = [makeTrack()]
    const lanes = [absoluteLane(), modLane()]
    const result = evaluateAutomationOverrides(lanes, 0, registry, tracks)
    // 0.5 + 0.9 = 1.4 -> clamp to [0,360] = 360 (NOT clamped to [0,1]=1)
    expect(result['instance-uuid-1.amount']).toBe(360)
  })

  it('mid-range value denormalizes against the REAL [0,360] range, not [0,1]', () => {
    const tracks = [makeTrack()]
    // No modulation lane — just confirms the base denormalize also uses the
    // resolved instance->type registry bounds correctly.
    const lanes = [absoluteLane()]
    const result = evaluateAutomationOverrides(lanes, 0, registry, tracks)
    expect(result['instance-uuid-1.amount']).toBeCloseTo(180)
  })

  it('WITHOUT tracks context (pre-fix call shape), falls back to [0,1] — proves the bug reproduces when tracks is omitted', () => {
    const lanes = [absoluteLane(), modLane()]
    const result = evaluateAutomationOverrides(lanes, 0, registry) // no tracks arg
    // Falls back to [0,1] clamp since the instance id can't be resolved without
    // track context — documents the exact pre-#28 failure mode.
    expect(result['instance-uuid-1.amount']).toBe(1)
  })
})

describe('#28 — TYPE-keyed (dotted) paramPath resolves via last-dot split, no tracks needed', () => {
  const dottedLane = (overrides: Partial<AutomationLane> = {}) =>
    absoluteLane({ paramPath: 'fx.hue_shift.amount', ...overrides })
  const dottedMod = (overrides: Partial<AutomationLane> = {}) =>
    modLane({ paramPath: 'fx.hue_shift.amount', ...overrides })

  it('composes+clamps in [0,360] for a dotted TYPE id paramPath, even with no tracks', () => {
    const lanes = [dottedLane(), dottedMod()]
    const result = evaluateAutomationOverrides(lanes, 0, registry, [])
    expect(result['fx.hue_shift.amount']).toBe(360)
  })

  it('mid-range value denormalizes against [0,360] for the dotted TYPE id', () => {
    const lanes = [dottedLane()]
    const result = evaluateAutomationOverrides(lanes, 0, registry)
    expect(result['fx.hue_shift.amount']).toBeCloseTo(180)
  })
})

describe('#28 — back-compat: params genuinely absent from the registry still default to [0,1]', () => {
  it('an unresolvable instance id (no matching track/instance) falls back to [0,1]', () => {
    const lanes = [absoluteLane({ paramPath: 'nonexistent-uuid.amount' })]
    const result = evaluateAutomationOverrides(lanes, 0, registry, [makeTrack()])
    expect(result['nonexistent-uuid.amount']).toBeCloseTo(0.5)
  })

  it('projectParam.bpm (no registry entry ever) still defaults to [0,1]', () => {
    const lanes = [absoluteLane({ paramPath: 'projectParam.bpm' })]
    const result = evaluateAutomationOverrides(lanes, 0, registry, [makeTrack()])
    expect(result['projectParam.bpm']).toBeCloseTo(0.5)
  })
})
