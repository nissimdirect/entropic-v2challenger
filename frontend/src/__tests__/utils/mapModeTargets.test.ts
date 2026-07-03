/**
 * H-UI (2026-07-02 master-tuneup WS5) — pure helpers for the MIDI-Map overlay.
 *
 * Covers the two pure functions the overlay's param-picker and default-vs-
 * overridden badging depend on:
 *   - enumerateCandidateTargets: full assignable-target list per focus kind.
 *   - slotTargetsEqual: structural target comparison (override detection).
 */
import { describe, it, expect } from 'vitest'
import {
  enumerateCandidateTargets,
  slotTargetsEqual,
  slotTargetLabel,
} from '../../renderer/utils/mapModeTargets'
import type { MappingContext } from '../../renderer/utils/focusContext'
import type { DefaultAssignmentSources } from '../../renderer/utils/deriveDefaultAssignment'
import type { SlotTarget } from '../../shared/bankTypes'
import type { ParamDef } from '../../shared/types'

function pd(type: ParamDef['type'], label = ''): ParamDef {
  return { type, default: 0, label }
}

describe('enumerateCandidateTargets', () => {
  it('effect context → only float/int params, as effectParam targets in order', () => {
    const ctx: MappingContext = { kind: 'effect', trackId: 't1', effectId: 'fx-1', contextKey: 'effect:t1:fx-1' }
    const sources: DefaultAssignmentSources = {
      effectParamEntries: [
        ['amount', pd('float', 'Amount')],
        ['mode', pd('choice', 'Mode')], // dropped (not float/int)
        ['steps', pd('int', 'Steps')],
        ['enabled', pd('bool', 'Enabled')], // dropped
      ],
    }
    const out = enumerateCandidateTargets(ctx, sources)
    expect(out.map((c) => c.label)).toEqual(['Amount', 'Steps'])
    expect(out[0].target).toEqual({ kind: 'effectParam', effectId: 'fx-1', paramKey: 'amount' })
    expect(out[1].target).toEqual({ kind: 'effectParam', effectId: 'fx-1', paramKey: 'steps' })
  })

  it('effect context → falls back to paramKey when the ParamDef has no label', () => {
    const ctx: MappingContext = { kind: 'effect', trackId: 't1', effectId: 'fx-1', contextKey: 'effect:t1:fx-1' }
    const out = enumerateCandidateTargets(ctx, { effectParamEntries: [['gain', pd('float', '')]] })
    expect(out[0].label).toBe('gain')
  })

  it('track context → one macro target per rack macro', () => {
    const ctx: MappingContext = { kind: 'track', trackId: 't1', contextKey: 'track:t1' }
    const out = enumerateCandidateTargets(ctx, {
      rackMacros: [
        { id: 'm1', name: 'Chaos', value: 0, routes: [] },
        { id: 'm2', name: '', value: 0, routes: [] },
      ],
    })
    expect(out).toHaveLength(2)
    expect(out[0]).toEqual({ target: { kind: 'macro', trackId: 't1', macroId: 'm1' }, label: 'Chaos' })
    expect(out[1].label).toBe('macro m2') // empty name falls back
  })

  it('clip context → the 5 transform fields', () => {
    const ctx: MappingContext = { kind: 'clip', clipId: 'c1', trackId: 't1', contextKey: 'clip:t1:c1' }
    const out = enumerateCandidateTargets(ctx, {})
    expect(out.map((c) => c.label)).toEqual(['x', 'y', 'scaleX', 'scaleY', 'rotation'])
    expect(out[0].target).toEqual({ kind: 'transform', clipId: 'c1', field: 'x' })
  })

  it('none context → no candidates', () => {
    expect(enumerateCandidateTargets({ kind: 'none', contextKey: 'none' }, {})).toEqual([])
  })

  it('effect context with no sources → empty (never throws)', () => {
    const ctx: MappingContext = { kind: 'effect', trackId: 't1', effectId: 'fx-1', contextKey: 'effect:t1:fx-1' }
    expect(enumerateCandidateTargets(ctx, {})).toEqual([])
  })
})

describe('slotTargetsEqual', () => {
  const a: SlotTarget = { kind: 'macro', trackId: 't1', macroId: 'm1' }
  const b: SlotTarget = { kind: 'macro', trackId: 't1', macroId: 'm2' }

  it('null === null', () => {
    expect(slotTargetsEqual(null, null)).toBe(true)
  })
  it('null vs target → false', () => {
    expect(slotTargetsEqual(null, a)).toBe(false)
    expect(slotTargetsEqual(a, null)).toBe(false)
  })
  it('same shape → true', () => {
    expect(slotTargetsEqual(a, { kind: 'macro', trackId: 't1', macroId: 'm1' })).toBe(true)
  })
  it('same kind, different id → false', () => {
    expect(slotTargetsEqual(a, b)).toBe(false)
  })
  it('different kind → false', () => {
    expect(slotTargetsEqual(a, { kind: 'effectParam', effectId: 't1', paramKey: 'm1' })).toBe(false)
  })
  it('effectParam equality is field-wise', () => {
    const e1: SlotTarget = { kind: 'effectParam', effectId: 'fx', paramKey: 'amount' }
    expect(slotTargetsEqual(e1, { kind: 'effectParam', effectId: 'fx', paramKey: 'amount' })).toBe(true)
    expect(slotTargetsEqual(e1, { kind: 'effectParam', effectId: 'fx', paramKey: 'other' })).toBe(false)
  })
})

describe('slotTargetLabel', () => {
  it('labels each target kind', () => {
    expect(slotTargetLabel({ kind: 'effectParam', effectId: 'fx', paramKey: 'amount' })).toBe('amount')
    expect(slotTargetLabel({ kind: 'macro', trackId: 't', macroId: 'm1' })).toBe('macro m1')
    expect(slotTargetLabel({ kind: 'transform', clipId: 'c', field: 'x' })).toBe('x')
    expect(slotTargetLabel({ kind: 'mask', nodeId: 'n', param: 'feather' })).toBe('feather')
    expect(slotTargetLabel({ kind: 'instrument', trackId: 't', paramKey: 'speed' })).toBe('speed')
  })
})
