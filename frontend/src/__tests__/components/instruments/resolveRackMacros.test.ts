/**
 * B4.2 — resolveRackMacros tests (Sample Rack macros: one-to-many fan-out).
 *
 * Drives the REAL resolver (resolveRackMacros) + the REAL playback math
 * (computeLoopFrameIndex) and asserts the COMPUTED FRAME INDEX actually moves
 * when a macro fans a value into a pad's `scrub` — the anti-dead-flag discipline
 * (no tautological "macro object holds a value" tests). Mirrors the backend
 * tests/test_rack_macros.py.
 *
 * The FAN-OUT CAPS (MAX_MODROUTES_PER_MACRO / MAX_TOTAL_EDGES) are the enforcing
 * trust boundary in the BACKEND security.validate_rack_macros; their negative
 * tests live in backend/tests/test_rack_macros.py. The frontend mirrors the cap
 * CONSTANTS (asserted equal to the backend here) for the editor UI.
 */
import { describe, it, expect } from 'vitest'
import { resolveRackMacros } from '../../../renderer/components/instruments/resolveRackMacros'
import { computeLoopFrameIndex } from '../../../renderer/components/instruments/computeSamplerVoice'
import {
  MAX_MACROS_PER_RACK,
  MAX_MODROUTES_PER_MACRO,
  MAX_TOTAL_EDGES,
} from '../../../renderer/components/instruments/types'
import type {
  RackNode,
  RackPad,
  RackMacro,
  MacroRoute,
  SamplerInstrumentV1,
} from '../../../renderer/components/instruments/types'

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

const compute = (inst: SamplerInstrumentV1, playhead: number, fc = 100) =>
  computeLoopFrameIndex(inst, playhead, fc)

// ---------------------------------------------------------------------------
// ANTI-DEAD-FLAG: a macro actually MOVES the computed frame index
// ---------------------------------------------------------------------------

describe('resolveRackMacros — anti-dead-flag (drives the real param)', () => {
  it('test_macro_drives_target_param_is_not_a_noop', () => {
    const baselineFrame = compute(makeInst(), 0) // scrub absent → frame 0

    const m = macro('m1', 1, [route('pad.a.scrub', 1)])
    const out = resolveRackMacros(makeRack([makePad('a')], [m]))!
    const driven = padById(out, 'a').instrument

    // The resolver actually WROTE scrub into the target param...
    expect(driven.scrub).toBe(1)
    // ...and that drives the REAL playback to a DIFFERENT frame than baseline.
    const drivenFrame = compute(driven, 0)
    expect(drivenFrame).not.toBe(baselineFrame)
    expect(drivenFrame).toBe(99) // scrub 1.0 → last frame of [0, 99]
  })

  it('macro at 0 is a no-op (param untouched)', () => {
    const m = macro('m1', 0, [route('pad.a.scrub', 1)])
    const out = resolveRackMacros(makeRack([makePad('a')], [m]))!
    expect(padById(out, 'a').instrument.scrub).toBeUndefined()
  })

  it('macro with no routes is a no-op', () => {
    const m = macro('m1', 1, [])
    const out = resolveRackMacros(makeRack([makePad('a')], [m]))!
    expect(padById(out, 'a').instrument.scrub).toBeUndefined()
  })

  it('depth scales the resolved value (value * depth)', () => {
    const m = macro('m1', 1, [route('pad.a.scrub', 0.5)])
    const out = resolveRackMacros(makeRack([makePad('a')], [m]))!
    expect(padById(out, 'a').instrument.scrub).toBe(0.5)
  })
})

// ---------------------------------------------------------------------------
// ONE-TO-MANY: one macro fans out to >=2 target params at once
// ---------------------------------------------------------------------------

describe('resolveRackMacros — one-to-many fan-out', () => {
  it('test_one_macro_drives_multiple_params', () => {
    const m = macro('m1', 1, [route('pad.a.scrub', 1), route('pad.b.scrub', 1)])
    const out = resolveRackMacros(makeRack([makePad('a'), makePad('b')], [m]))!

    // BOTH pads received the resolved value from the SINGLE macro.
    expect(padById(out, 'a').instrument.scrub).toBe(1)
    expect(padById(out, 'b').instrument.scrub).toBe(1)
    // And BOTH drive real playback to the last frame (was 0 at playhead 0).
    expect(compute(padById(out, 'a').instrument, 0)).toBe(99)
    expect(compute(padById(out, 'b').instrument, 0)).toBe(99)
  })

  it('one macro fans to distinct params on the same pad', () => {
    const m = macro('m1', 1, [
      route('pad.a.scrub', 1),
      route('pad.a.opacity', -1), // 1.0 base + (1 * -1) = 0.0
    ])
    const out = resolveRackMacros(makeRack([makePad('a')], [m]))!
    const inst = padById(out, 'a').instrument
    expect(inst.scrub).toBe(1)
    expect(inst.opacity).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// TRUST BOUNDARY — unknown target / malformed route skipped; NaN/Inf clamped
// ---------------------------------------------------------------------------

describe('resolveRackMacros — trust boundary', () => {
  it('test_unknown_macro_target_skipped', () => {
    const m = macro('m1', 1, [
      route('pad.ghost.scrub', 1), // pad doesn't exist
      route('pad.a.clipId', 1), // not macro-able
      route('operator.x.foo', 1), // wrong prefix
      route('pad.a.scrub', 1), // the ONLY valid route
    ])
    const out = resolveRackMacros(makeRack([makePad('a')], [m]))!
    expect(padById(out, 'a').instrument.scrub).toBe(1)
    expect(padById(out, 'a').instrument.clipId).toBe('clip-1') // not clobbered
  })

  it('malformed route does not throw', () => {
    const m: RackMacro = {
      id: 'm1',
      name: 'm1',
      value: 1,
      routes: [
        null as unknown as MacroRoute,
        42 as unknown as MacroRoute,
        {} as MacroRoute,
        { depth: 1 } as MacroRoute,
        route('pad.a.scrub', 1),
      ],
    }
    const out = resolveRackMacros(makeRack([makePad('a')], [m]))!
    expect(padById(out, 'a').instrument.scrub).toBe(1)
  })

  it('test_macro_depth_nan_clamped (NaN/Inf depth → no-op, param untouched)', () => {
    const m = macro('m1', 1, [
      route('pad.a.scrub', NaN),
      route('pad.b.scrub', Infinity),
    ])
    const out = resolveRackMacros(makeRack([makePad('a'), makePad('b')], [m]))!
    expect(padById(out, 'a').instrument.scrub).toBeUndefined()
    expect(padById(out, 'b').instrument.scrub).toBeUndefined()
  })

  it('macro value out of range is clamped to [0,1]', () => {
    const m = macro('m1', 5, [route('pad.a.scrub', 1)])
    const out = resolveRackMacros(makeRack([makePad('a')], [m]))!
    expect(padById(out, 'a').instrument.scrub).toBe(1) // clamped, not 5
  })

  it('NaN macro value is treated as 0 (no-op)', () => {
    const m = macro('m1', NaN, [route('pad.a.scrub', 1)])
    const out = resolveRackMacros(makeRack([makePad('a')], [m]))!
    expect(padById(out, 'a').instrument.scrub).toBeUndefined()
  })

  it('does not mutate the input rack', () => {
    const input = makeRack([makePad('a')], [macro('m1', 1, [route('pad.a.scrub', 1)])])
    const snapshot = JSON.stringify(input)
    resolveRackMacros(input)
    expect(JSON.stringify(input)).toBe(snapshot)
  })
})

// ---------------------------------------------------------------------------
// REGRESSION — no macros (or all at 0) → rack returned UNCHANGED (=== B4.1)
// ---------------------------------------------------------------------------

describe('resolveRackMacros — regression (matches B4.1)', () => {
  it('test_no_macros_matches_b4_1 (no macros field → same reference)', () => {
    const rack = makeRack([makePad('a'), makePad('b')]) // no macros field
    const out = resolveRackMacros(rack)
    expect(out).toBe(rack) // returned UNCHANGED — no copy, no drive
  })

  it('empty macros list → same reference', () => {
    const rack = makeRack([makePad('a')], [])
    expect(resolveRackMacros(rack)).toBe(rack)
  })

  it('all macros at 0 → param untouched, frame index unchanged', () => {
    const rack = makeRack([makePad('a')], [macro('m1', 0, [route('pad.a.scrub', 1)])])
    const out = resolveRackMacros(rack)!
    expect(padById(out, 'a').instrument.scrub).toBeUndefined()
    expect(compute(padById(out, 'a').instrument, 10)).toBe(compute(makeInst({ id: 's-a' }), 10))
  })

  it('null rack returned unchanged', () => {
    expect(resolveRackMacros(null)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// CAP CONSTANTS mirror the backend (the enforcing boundary is backend security)
// ---------------------------------------------------------------------------

describe('resolveRackMacros — fan-out cap constants mirror backend', () => {
  it('MAX_* constants match the B4.2 spec', () => {
    expect(MAX_MACROS_PER_RACK).toBe(8)
    expect(MAX_MODROUTES_PER_MACRO).toBe(32)
    expect(MAX_TOTAL_EDGES).toBe(256)
  })
})
