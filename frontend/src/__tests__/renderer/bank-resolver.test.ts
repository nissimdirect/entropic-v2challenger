/**
 * H2 (2026-07-02 master-tuneup WS5) — bank-relative hardware mapping tests.
 *
 * ANTI-DEAD-FLAG (packet-required hard oracle): proves a bank-bound CC value
 * VISIBLY CHANGES (a) a cloned-chain effect param via context resolution and
 * (b) a macro-driven pad param via the macro overlay through the REAL
 * resolveRackMacros — not a mock. Also proves: legacy direct mapping keeps
 * working; a context switch moves the SAME cc to a DIFFERENT target
 * (focus-follows); persistence round-trips including malformed-data
 * dropping; and defaults derive correctly per context kind.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  applyBankModulations,
  resolveBankMacroOverrides,
  _resetBankResolverWarnState,
} from '../../renderer/components/performance/applyBankModulations'
import { deriveDefaultAssignment } from '../../renderer/utils/deriveDefaultAssignment'
import {
  resolveRackMacros,
} from '../../renderer/components/instruments/resolveRackMacros'
import {
  isValidBankSlotAddress,
  isValidCCBankBinding,
  isValidSlotTarget,
  isValidBankAssignment,
  MAX_CC_BANK_BINDINGS,
  MAX_BANK_ASSIGNMENT_CONTEXTS,
} from '../../shared/bankTypes'
import type { BankAssignment, CCBankBinding } from '../../shared/bankTypes'
import type { MappingContext } from '../../renderer/utils/focusContext'
import { MIDIMIX_FACTORY_PROFILE } from '../../renderer/utils/controllerProfiles'
import { useMIDIStore } from '../../renderer/stores/midi'
import type { EffectInstance, ParamDef, MIDIPersistData } from '../../shared/types'
import type { RackNode, RackPad, RackMacro, MacroRoute, SamplerInstrumentV1 } from '../../renderer/components/instruments/types'
import { computeLoopFrameIndex } from '../../renderer/components/instruments/computeSamplerVoice'

// ── Fixtures ─────────────────────────────────────────────────────────────

function makeEffect(over: Partial<EffectInstance> = {}): EffectInstance {
  return {
    id: 'fx-1',
    effectId: 'glitch',
    isEnabled: true,
    isFrozen: false,
    parameters: { amount: 0.2 },
    modulations: {},
    mix: 1,
    mask: null,
    ...over,
  }
}

function makeInst(over: Partial<SamplerInstrumentV1> = {}): SamplerInstrumentV1 {
  return {
    id: 'sampler-x',
    type: 'sampler',
    clipId: 'clip-1',
    startFrame: 0,
    speed: 1,
    opacity: 1,
    blendMode: 'normal',
    ...over,
  }
}

function makePad(id: string, over: Partial<RackPad> = {}): RackPad {
  return {
    id,
    instrument: makeInst({ id: `s-${id}` }),
    opacity: 1,
    blend: 'normal',
    mute: false,
    solo: false,
    ...over,
  }
}

function route(targetPath: string, depth = 1): MacroRoute {
  return { targetPath, depth }
}

function macro(id: string, value: number, routes: MacroRoute[]): RackMacro {
  return { id, name: id, value, routes }
}

function makeRack(pads: RackPad[], macros?: RackMacro[]): RackNode {
  const r: RackNode = { id: 'rack-1', type: 'rack', pads }
  if (macros !== undefined) r.macros = macros
  return r
}

function padById(rack: RackNode, id: string): RackPad {
  const p = rack.pads.find((x) => x.id === id)
  if (!p) throw new Error(`no pad ${id}`)
  return p
}

const effectContext = (effectId: string, trackId = 'track-1'): MappingContext => ({
  kind: 'effect',
  trackId,
  effectId,
  contextKey: `effect:${trackId}:${effectId}`,
})

const trackContext = (trackId: string): MappingContext => ({
  kind: 'track',
  trackId,
  contextKey: `track:${trackId}`,
})

const emptyAssignments: Record<string, BankAssignment> = {}

beforeEach(() => {
  _resetBankResolverWarnState()
})

// ── bankTypes validators ────────────────────────────────────────────────

describe('bankTypes validators', () => {
  it('isValidBankSlotAddress accepts in-range integers, rejects everything else', () => {
    expect(isValidBankSlotAddress({ row: 0, col: 0 })).toBe(true)
    expect(isValidBankSlotAddress({ row: 3, col: 7 })).toBe(true)
    expect(isValidBankSlotAddress({ row: 4, col: 0 })).toBe(false) // row out of range
    expect(isValidBankSlotAddress({ row: 0, col: 8 })).toBe(false) // col out of range
    expect(isValidBankSlotAddress({ row: -1, col: 0 })).toBe(false)
    expect(isValidBankSlotAddress({ row: 1.5, col: 0 })).toBe(false) // non-integer
    expect(isValidBankSlotAddress(null)).toBe(false)
    expect(isValidBankSlotAddress('nope')).toBe(false)
  })

  it('isValidCCBankBinding validates cc range + nested slot', () => {
    expect(isValidCCBankBinding({ cc: 16, slot: { row: 0, col: 0 } })).toBe(true)
    expect(isValidCCBankBinding({ cc: 128, slot: { row: 0, col: 0 } })).toBe(false)
    expect(isValidCCBankBinding({ cc: -1, slot: { row: 0, col: 0 } })).toBe(false)
    expect(isValidCCBankBinding({ cc: 16, slot: { row: 9, col: 0 } })).toBe(false)
    expect(isValidCCBankBinding({ cc: 16 })).toBe(false) // missing slot
  })

  it('isValidSlotTarget allowlists kind and required fields per kind', () => {
    expect(isValidSlotTarget({ kind: 'effectParam', effectId: 'fx-1', paramKey: 'amount' })).toBe(true)
    expect(isValidSlotTarget({ kind: 'macro', trackId: 't1', macroId: 'm1' })).toBe(true)
    expect(isValidSlotTarget({ kind: 'transform', clipId: 'c1', field: 'x' })).toBe(true)
    expect(isValidSlotTarget({ kind: 'mask', nodeId: 'n1', param: 'feather' })).toBe(true)
    expect(isValidSlotTarget({ kind: 'effectParam', effectId: 'fx-1' })).toBe(false) // missing paramKey
    expect(isValidSlotTarget({ kind: 'hostile-kind', effectId: 'fx-1', paramKey: 'x' })).toBe(false)
    expect(isValidSlotTarget({ kind: 'effectParam', effectId: '', paramKey: 'x' })).toBe(false) // empty string
  })

  it('isValidBankAssignment requires exact 4x8 grid of null-or-valid entries', () => {
    const good: BankAssignment = {
      contextKey: 'track:t1',
      slots: [
        Array(8).fill(null),
        Array(8).fill(null),
        Array(8).fill(null),
        [{ kind: 'macro', trackId: 't1', macroId: 'm1' }, ...Array(7).fill(null)],
      ],
    }
    expect(isValidBankAssignment(good)).toBe(true)

    const wrongRowCount = { ...good, slots: good.slots.slice(0, 3) }
    expect(isValidBankAssignment(wrongRowCount)).toBe(false)

    const wrongColCount = { ...good, slots: [Array(7).fill(null), ...good.slots.slice(1)] }
    expect(isValidBankAssignment(wrongColCount)).toBe(false)

    const malformedEntry = {
      contextKey: 'track:t1',
      slots: [
        [{ kind: 'macro' }, ...Array(7).fill(null)], // missing trackId/macroId
        Array(8).fill(null),
        Array(8).fill(null),
        Array(8).fill(null),
      ],
    }
    expect(isValidBankAssignment(malformedEntry)).toBe(false)
  })
})

// ── deriveDefaultAssignment ─────────────────────────────────────────────

describe('deriveDefaultAssignment — per context kind', () => {
  it('rack-pad / track context -> row 3 = the rack macros, in array order', () => {
    const macros: RackMacro[] = [macro('m1', 0, []), macro('m2', 0, [])]
    const ctx: MappingContext = { kind: 'rack-pad', trackId: 't1', padId: 'p1', branchPath: [], contextKey: 'rack-pad:t1:p1:' }
    const a = deriveDefaultAssignment(ctx, { rackMacros: macros })
    expect(a.slots[3][0]).toEqual({ kind: 'macro', trackId: 't1', macroId: 'm1' })
    expect(a.slots[3][1]).toEqual({ kind: 'macro', trackId: 't1', macroId: 'm2' })
    expect(a.slots[3][2]).toBeNull()
    // rows 0-2 untouched
    expect(a.slots[0].every((s) => s === null)).toBe(true)

    const trackCtx = trackContext('t1')
    const a2 = deriveDefaultAssignment(trackCtx, { rackMacros: macros })
    expect(a2.slots[3][0]).toEqual({ kind: 'macro', trackId: 't1', macroId: 'm1' })
  })

  it('rack macros beyond 8 are truncated (bank has only 8 columns)', () => {
    const macros: RackMacro[] = Array.from({ length: 10 }, (_, i) => macro(`m${i}`, 0, []))
    const a = deriveDefaultAssignment(trackContext('t1'), { rackMacros: macros })
    expect(a.slots[3].filter((s) => s !== null)).toHaveLength(8)
  })

  it('effect context -> row 0 = first 8 float/int params in registry order, bool/choice excluded', () => {
    const entries: Array<[string, ParamDef]> = [
      ['amount', { type: 'float', default: 0, label: 'Amount' }],
      ['enabled', { type: 'bool', default: true, label: 'Enabled' }],
      ['mode', { type: 'choice', default: 'a', label: 'Mode' }],
      ['intensity', { type: 'int', default: 1, label: 'Intensity' }],
    ]
    const ctx = effectContext('fx-1', 't1')
    const a = deriveDefaultAssignment(ctx, { effectParamEntries: entries })
    expect(a.slots[0][0]).toEqual({ kind: 'effectParam', effectId: 'fx-1', paramKey: 'amount' })
    expect(a.slots[0][1]).toEqual({ kind: 'effectParam', effectId: 'fx-1', paramKey: 'intensity' }) // bool/choice skipped
    expect(a.slots[0][2]).toBeNull()
  })

  it('clip context -> row 0 = transform fields (storable, no-op until H4)', () => {
    const ctx: MappingContext = { kind: 'clip', clipId: 'clip-9', trackId: 't1', contextKey: 'clip:t1:clip-9' }
    const a = deriveDefaultAssignment(ctx, {})
    expect(a.slots[0].slice(0, 5)).toEqual([
      { kind: 'transform', clipId: 'clip-9', field: 'x' },
      { kind: 'transform', clipId: 'clip-9', field: 'y' },
      { kind: 'transform', clipId: 'clip-9', field: 'scaleX' },
      { kind: 'transform', clipId: 'clip-9', field: 'scaleY' },
      { kind: 'transform', clipId: 'clip-9', field: 'rotation' },
    ])
    expect(a.slots[0][5]).toBeNull()
  })

  it('none context -> fully empty grid', () => {
    const ctx: MappingContext = { kind: 'none', contextKey: 'none' }
    const a = deriveDefaultAssignment(ctx, {})
    expect(a.slots.every((row) => row.every((s) => s === null))).toBe(true)
  })
})

// ── ANTI-DEAD-FLAG: applyBankModulations actually drives an effect param ──

describe('applyBankModulations — anti-dead-flag (effectParam via context resolution)', () => {
  it('a bank-bound CC visibly changes the cloned-chain effect param', () => {
    const chain = [makeEffect({ id: 'fx-1', parameters: { amount: 0.2 } })]
    const binding: CCBankBinding = { cc: 16, slot: { row: 0, col: 0 } }
    const ctx = effectContext('fx-1', 't1')
    const entries: Array<[string, ParamDef]> = [['amount', { type: 'float', min: 0, max: 1, default: 0, label: 'Amount' }]]

    const out = applyBankModulations(
      chain,
      [], // no legacy ccMappings
      [binding],
      { 16: 0.75 },
      emptyAssignments,
      ctx,
      { effectParamEntries: entries },
    )

    expect(out).not.toBe(chain) // new chain, cloned
    expect(out[0].parameters.amount).toBeCloseTo(0.75, 5)
    expect(chain[0].parameters.amount).toBe(0.2) // input chain untouched (pure fn)
  })

  it('no ccValue for the bound cc -> chain unchanged (byte-identical, same reference when nothing else applies)', () => {
    const chain = [makeEffect({ id: 'fx-1', parameters: { amount: 0.2 } })]
    const binding: CCBankBinding = { cc: 16, slot: { row: 0, col: 0 } }
    const ctx = effectContext('fx-1', 't1')
    const out = applyBankModulations(chain, [], [binding], {}, emptyAssignments, ctx, {
      effectParamEntries: [['amount', { type: 'float', default: 0, label: 'Amount' }]],
    })
    expect(out).toBe(chain)
  })
})

// ── ANTI-DEAD-FLAG: macro overlay actually drives a pad param via the REAL resolver ──

describe('resolveBankMacroOverrides + resolveRackMacros — anti-dead-flag (macro overlay)', () => {
  it('a bank-bound CC targeting a macro slot visibly moves a pad param through the LIVE resolver', () => {
    const baselineFrame = computeLoopFrameIndex(makeInst(), 0, 100) // scrub absent -> frame 0

    const m = macro('m1', 0, [route('pad.a.scrub', 1)]) // persisted value 0 = no contribution on its own
    const rack = makeRack([makePad('a')], [m])

    const binding: CCBankBinding = { cc: 19, slot: { row: 3, col: 0 } } // fader row
    const assignment: BankAssignment = {
      contextKey: 'track:t1',
      slots: [Array(8).fill(null), Array(8).fill(null), Array(8).fill(null), [
        { kind: 'macro', trackId: 't1', macroId: 'm1' }, ...Array(7).fill(null),
      ]],
    }

    const overrides = resolveBankMacroOverrides(
      [binding],
      { 19: 1 }, // hardware fader pushed to max
      { 'track:t1': assignment },
      trackContext('t1'),
      { rackMacros: rack.macros },
    )
    expect(overrides.get('m1')).toBeCloseTo(1, 5)

    const resolved = resolveRackMacros(rack, overrides)!
    const drivenFrame = computeLoopFrameIndex(padById(resolved, 'a').instrument, 0, 100)

    expect(drivenFrame).not.toBe(baselineFrame) // the CC value ACTUALLY moved the param
    // Persisted macro.value (0) is untouched — transient overlay only, never a store write.
    expect(rack.macros![0].value).toBe(0)
  })

  it('a non-focused rack (macro id absent from overrides) is unaffected — safe to pass the same overrides map to every track', () => {
    const m = macro('other-macro', 0, [route('pad.a.scrub', 1)])
    const rack = makeRack([makePad('a')], [m])
    const overrides = new Map([['m1', 1]]) // targets a DIFFERENT macro id
    const resolved = resolveRackMacros(rack, overrides)
    expect(resolved).toBe(rack) // unchanged reference — regression-safe
  })
})

// ── Legacy interop + focus-follows + no-op targets ─────────────────────

describe('applyBankModulations — legacy interop, focus-follows, no-op targets', () => {
  it('legacy direct ccMapping keeps working when no bank binding exists for that cc', () => {
    const chain = [makeEffect({ id: 'fx-1', parameters: { amount: 0.2 } })]
    const out = applyBankModulations(
      chain,
      [{ cc: 5, effectId: 'fx-1', paramKey: 'amount' }],
      [], // no bank bindings at all
      { 5: 0.9 },
      emptyAssignments,
      { kind: 'none', contextKey: 'none' },
      {},
    )
    expect(out[0].parameters.amount).toBeCloseTo(0.9, 5)
  })

  it('a cc with BOTH a direct mapping and a bank binding: bank binding wins, warns once', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const chain = [
      makeEffect({ id: 'fx-legacy', parameters: { amount: 0.1 } }),
      makeEffect({ id: 'fx-bank', parameters: { amount: 0.1 } }),
    ]
    const binding: CCBankBinding = { cc: 7, slot: { row: 0, col: 0 } }
    const ctx = effectContext('fx-bank', 't1')

    const run = () => applyBankModulations(
      chain,
      [{ cc: 7, effectId: 'fx-legacy', paramKey: 'amount' }], // legacy target
      [binding],
      { 7: 0.6 },
      emptyAssignments,
      ctx,
      { effectParamEntries: [['amount', { type: 'float', default: 0, label: 'Amount' }]] },
    )

    const out1 = run()
    expect(out1.find((e) => e.id === 'fx-bank')!.parameters.amount).toBeCloseTo(0.6, 5)
    expect(out1.find((e) => e.id === 'fx-legacy')!.parameters.amount).toBe(0.1) // legacy suppressed for this cc
    expect(warnSpy).toHaveBeenCalledTimes(1)

    run() // second call, same collision
    expect(warnSpy).toHaveBeenCalledTimes(1) // deduped — not spammed per frame
    warnSpy.mockRestore()
  })

  it('focus-follows proof: the SAME physical cc/slot resolves to a DIFFERENT target as context changes', () => {
    const chain = [
      makeEffect({ id: 'fx-A', parameters: { amount: 0.1 } }),
      makeEffect({ id: 'fx-B', parameters: { amount: 0.1 } }),
    ]
    const binding: CCBankBinding = { cc: 16, slot: { row: 0, col: 0 } }

    const outA = applyBankModulations(chain, [], [binding], { 16: 0.5 }, emptyAssignments, effectContext('fx-A'), {
      effectParamEntries: [['amount', { type: 'float', default: 0, label: 'Amount' }]],
    })
    expect(outA.find((e) => e.id === 'fx-A')!.parameters.amount).toBeCloseTo(0.5, 5)
    expect(outA.find((e) => e.id === 'fx-B')!.parameters.amount).toBe(0.1)

    const outB = applyBankModulations(chain, [], [binding], { 16: 0.5 }, emptyAssignments, effectContext('fx-B'), {
      effectParamEntries: [['amount', { type: 'float', default: 0, label: 'Amount' }]],
    })
    expect(outB.find((e) => e.id === 'fx-B')!.parameters.amount).toBeCloseTo(0.5, 5)
    expect(outB.find((e) => e.id === 'fx-A')!.parameters.amount).toBe(0.1) // unaffected this time
  })

  it('transform/mask slot targets resolve to a no-op and warn once (not per frame)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const chain = [makeEffect({ id: 'fx-1', parameters: { amount: 0.2 } })]
    const binding: CCBankBinding = { cc: 3, slot: { row: 0, col: 0 } }
    const assignment: BankAssignment = {
      contextKey: 'clip:t1:c1',
      slots: [[{ kind: 'transform', clipId: 'c1', field: 'x' }, ...Array(7).fill(null)], Array(8).fill(null), Array(8).fill(null), Array(8).fill(null)],
    }
    const ctx: MappingContext = { kind: 'clip', clipId: 'c1', trackId: 't1', contextKey: 'clip:t1:c1' }

    const out = applyBankModulations(chain, [], [binding], { 3: 0.4 }, { 'clip:t1:c1': assignment }, ctx, {})
    expect(out).toBe(chain) // no-op — chain unchanged
    expect(warnSpy).toHaveBeenCalledTimes(1)
    applyBankModulations(chain, [], [binding], { 3: 0.4 }, { 'clip:t1:c1': assignment }, ctx, {})
    expect(warnSpy).toHaveBeenCalledTimes(1) // deduped
    warnSpy.mockRestore()
  })
})

// ── Store: persistence round-trip + trust-boundary validation ──────────

describe('useMIDIStore — H2 bank persistence + validation', () => {
  beforeEach(() => {
    useMIDIStore.getState().resetMIDI()
  })
  afterEach(() => {
    useMIDIStore.getState().resetMIDI()
  })

  it('getMIDIPersistData / loadMIDIMappings round-trip ccBankBindings + bankAssignments', () => {
    useMIDIStore.getState().setCCBankBinding(16, { row: 0, col: 0 })
    const assignment: BankAssignment = {
      contextKey: 'track:t1',
      slots: [Array(8).fill(null), Array(8).fill(null), Array(8).fill(null), Array(8).fill(null)],
    }
    useMIDIStore.getState().setBankAssignment('track:t1', assignment)

    const data = useMIDIStore.getState().getMIDIPersistData()
    expect(data.ccBankBindings).toEqual([{ cc: 16, slot: { row: 0, col: 0 } }])
    expect(data.bankAssignments['track:t1']).toEqual(assignment)

    useMIDIStore.getState().resetMIDI()
    expect(useMIDIStore.getState().ccBankBindings).toHaveLength(0)

    useMIDIStore.getState().loadMIDIMappings(data)
    const reloaded = useMIDIStore.getState()
    expect(reloaded.ccBankBindings).toEqual([{ cc: 16, slot: { row: 0, col: 0 } }])
    expect(reloaded.bankAssignments['track:t1']).toEqual(assignment)
  })

  it('loadMIDIMappings drops malformed ccBankBindings/bankAssignments entries without crashing', () => {
    const hostile = {
      padMidiNotes: {},
      ccMappings: [],
      channelFilter: null,
      ccBankBindings: [
        { cc: 16, slot: { row: 0, col: 0 } }, // valid
        { cc: 999, slot: { row: 0, col: 0 } }, // cc out of range
        { cc: 5, slot: { row: 9, col: 0 } }, // row out of range
        'not-an-object',
      ],
      bankAssignments: {
        'track:t1': {
          contextKey: 'track:t1',
          slots: [Array(8).fill(null), Array(8).fill(null), Array(8).fill(null), Array(8).fill(null)],
        },
        'track:hostile': { contextKey: 'track:hostile', slots: [] }, // malformed shape
      },
    } as unknown as MIDIPersistData

    useMIDIStore.getState().loadMIDIMappings(hostile)
    const state = useMIDIStore.getState()
    expect(state.ccBankBindings).toEqual([{ cc: 16, slot: { row: 0, col: 0 } }])
    expect(Object.keys(state.bankAssignments)).toEqual(['track:t1'])
  })

  it('loadMIDIMappings with missing ccBankBindings/bankAssignments (legacy project) -> empty defaults, no crash', () => {
    const legacy = {
      padMidiNotes: {},
      ccMappings: [{ cc: 1, effectId: 'fx', paramKey: 'p' }],
      channelFilter: null,
    } as unknown as MIDIPersistData

    useMIDIStore.getState().loadMIDIMappings(legacy)
    const state = useMIDIStore.getState()
    expect(state.ccBankBindings).toEqual([])
    expect(state.bankAssignments).toEqual({})
    expect(state.ccMappings).toHaveLength(1) // legacy field still hydrates fine
  })

  it('setCCBankBinding enforces one-CC-one-slot (overwrite) and MAX_CC_BANK_BINDINGS evict-oldest', () => {
    useMIDIStore.getState().setCCBankBinding(1, { row: 0, col: 0 })
    useMIDIStore.getState().setCCBankBinding(1, { row: 1, col: 1 }) // overwrite, not append
    expect(useMIDIStore.getState().ccBankBindings).toHaveLength(1)
    expect(useMIDIStore.getState().ccBankBindings[0].slot).toEqual({ row: 1, col: 1 })

    useMIDIStore.getState().clearCCBankBindings()
    for (let cc = 0; cc < MAX_CC_BANK_BINDINGS + 5; cc++) {
      useMIDIStore.getState().setCCBankBinding(cc, { row: 0, col: 0 })
    }
    const bindings = useMIDIStore.getState().ccBankBindings
    expect(bindings).toHaveLength(MAX_CC_BANK_BINDINGS)
    // oldest 5 (cc 0-4) evicted; newest (cc MAX_CC_BANK_BINDINGS+4) survives
    expect(bindings.some((b) => b.cc === 0)).toBe(false)
    expect(bindings.some((b) => b.cc === MAX_CC_BANK_BINDINGS + 4)).toBe(true)
  })

  it('setCCBankBinding rejects out-of-range cc/row/col (trust boundary)', () => {
    useMIDIStore.getState().clearCCBankBindings()
    useMIDIStore.getState().setCCBankBinding(200, { row: 0, col: 0 }) // cc out of range
    useMIDIStore.getState().setCCBankBinding(10, { row: 9 as 0 | 1 | 2 | 3, col: 0 }) // row out of range
    expect(useMIDIStore.getState().ccBankBindings).toHaveLength(0)
  })

  it('setBankAssignment enforces MAX_BANK_ASSIGNMENT_CONTEXTS evict-oldest', () => {
    useMIDIStore.getState().clearBankAssignment('track:t1') // no-op, just exercising the API
    const grid = () => [Array(8).fill(null), Array(8).fill(null), Array(8).fill(null), Array(8).fill(null)]
    for (let i = 0; i < MAX_BANK_ASSIGNMENT_CONTEXTS + 5; i++) {
      useMIDIStore.getState().setBankAssignment(`track:t${i}`, { contextKey: `track:t${i}`, slots: grid() })
    }
    const keys = Object.keys(useMIDIStore.getState().bankAssignments)
    expect(keys).toHaveLength(MAX_BANK_ASSIGNMENT_CONTEXTS)
    expect(keys.includes('track:t0')).toBe(false) // oldest evicted
    expect(keys.includes(`track:t${MAX_BANK_ASSIGNMENT_CONTEXTS + 4}`)).toBe(true)
  })

  it('resetMIDI clears ccBankBindings and bankAssignments', () => {
    useMIDIStore.getState().setCCBankBinding(1, { row: 0, col: 0 })
    useMIDIStore.getState().setBankAssignment('track:t1', {
      contextKey: 'track:t1',
      slots: [Array(8).fill(null), Array(8).fill(null), Array(8).fill(null), Array(8).fill(null)],
    })
    useMIDIStore.getState().resetMIDI()
    expect(useMIDIStore.getState().ccBankBindings).toEqual([])
    expect(useMIDIStore.getState().bankAssignments).toEqual({})
  })
})

// ── Controller profile: Akai MIDImix factory map ────────────────────────

describe('controllerProfiles — MIDImix factory profile', () => {
  it('MIDIMIX_FACTORY_PROFILE is a valid, fully-populated 3-knob-row + fader-row bank (32 bindings, unique ccs)', () => {
    expect(MIDIMIX_FACTORY_PROFILE).toHaveLength(32) // 24 knobs + 8 faders
    for (const b of MIDIMIX_FACTORY_PROFILE) {
      expect(isValidCCBankBinding(b)).toBe(true)
    }
    const ccs = MIDIMIX_FACTORY_PROFILE.map((b) => b.cc)
    expect(new Set(ccs).size).toBe(ccs.length) // no duplicate cc bindings
    // 8 columns x 4 rows fully covered
    for (let row = 0 as 0 | 1 | 2 | 3; row <= 3; row++) {
      const cols = MIDIMIX_FACTORY_PROFILE.filter((b) => b.slot.row === row).map((b) => b.slot.col).sort((a, c) => a - c)
      expect(cols).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    }
  })

  it('applyControllerProfile bulk-sets ccBankBindings and is immediately usable', () => {
    useMIDIStore.getState().resetMIDI()
    useMIDIStore.getState().applyControllerProfile(MIDIMIX_FACTORY_PROFILE)
    expect(useMIDIStore.getState().ccBankBindings).toHaveLength(32)

    // Round-trips through persistence like any other bank binding set.
    const data = useMIDIStore.getState().getMIDIPersistData()
    useMIDIStore.getState().resetMIDI()
    useMIDIStore.getState().loadMIDIMappings(data)
    expect(useMIDIStore.getState().ccBankBindings).toHaveLength(32)
    useMIDIStore.getState().resetMIDI()
  })
})
