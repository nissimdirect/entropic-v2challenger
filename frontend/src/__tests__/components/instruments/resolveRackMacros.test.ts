/**
 * B4.2 — resolveRackMacros tests (THE LIVE render-path resolver).
 *
 * This is the LIVE path: `resolveRackMacros` is called per frame at App.tsx in
 * the rack render path. These tests drive the REAL resolver + REAL playback math
 * (computeLoopFrameIndex) and assert (a) the resolved frame index actually moves
 * (anti-dead-flag, on the LIVE path — not the deleted backend resolver), and
 * (b) the resolver's iteration is HARD-BOUNDED by the fan-out caps so a hostile
 * project file CANNOT flood the render thread (the DoS qa-redteam flagged).
 */
import { describe, it, expect } from 'vitest'
import {
  resolveRackMacros,
  resolveRackMacrosBounded,
} from '../../../renderer/components/instruments/resolveRackMacros'
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
// ANTI-DEAD-FLAG: the LIVE resolver actually MOVES the computed frame index
// ---------------------------------------------------------------------------

describe('resolveRackMacros — anti-dead-flag (LIVE render-path resolver)', () => {
  it('test_live_resolver_drives_target_param_is_not_a_noop', () => {
    const baselineFrame = compute(makeInst(), 0) // scrub absent → frame 0

    const m = macro('m1', 1, [route('pad.a.scrub', 1)])
    // The LIVE entry point used by App.tsx per frame.
    const out = resolveRackMacros(makeRack([makePad('a')], [m]))!
    const driven = padById(out, 'a').instrument

    expect(driven.scrub).toBe(1) // resolver WROTE the param
    const drivenFrame = compute(driven, 0)
    expect(drivenFrame).not.toBe(baselineFrame) // ...and it MOVES the real frame
    expect(drivenFrame).toBe(99) // scrub 1.0 → last frame of [0, 99]
  })

  it('macro at 0 is a no-op (param untouched)', () => {
    const m = macro('m1', 0, [route('pad.a.scrub', 1)])
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
// ONE-TO-MANY: one macro fans out to >=2 target params at once (LIVE path)
// ---------------------------------------------------------------------------

describe('resolveRackMacros — one-to-many fan-out', () => {
  it('test_one_macro_drives_multiple_params', () => {
    const m = macro('m1', 1, [route('pad.a.scrub', 1), route('pad.b.scrub', 1)])
    const out = resolveRackMacros(makeRack([makePad('a'), makePad('b')], [m]))!

    expect(padById(out, 'a').instrument.scrub).toBe(1)
    expect(padById(out, 'b').instrument.scrub).toBe(1)
    expect(compute(padById(out, 'a').instrument, 0)).toBe(99)
    expect(compute(padById(out, 'b').instrument, 0)).toBe(99)
  })

  it('one macro fans to distinct params on the same pad', () => {
    const m = macro('m1', 1, [route('pad.a.scrub', 1), route('pad.a.opacity', -1)])
    const out = resolveRackMacros(makeRack([makePad('a')], [m]))!
    const inst = padById(out, 'a').instrument
    expect(inst.scrub).toBe(1)
    expect(inst.opacity).toBe(0) // 1.0 + (1 * -1) = 0, clamped [0,1]
  })
})

// ---------------------------------------------------------------------------
// BOUNDED ITERATION — the DoS fix: the LIVE resolver CANNOT be flooded
// ---------------------------------------------------------------------------

describe('resolveRackMacros — bounded iteration (render thread cannot be flooded)', () => {
  it('test_live_resolver_bounds_total_routes (the qa-redteam DoS)', () => {
    // The EXACT exploit: a hand-edited file with 8 macros × 50,000 routes.
    // Without the cap this is 400,000 iterations/frame on the render thread.
    const HOSTILE_ROUTES = 50_000
    const macros: RackMacro[] = []
    for (let i = 0; i < MAX_MACROS_PER_RACK; i++) {
      const routes: MacroRoute[] = []
      for (let r = 0; r < HOSTILE_ROUTES; r++) routes.push(route('pad.a.scrub', 1))
      macros.push(macro(`m${i}`, 1, routes))
    }
    const rack = makeRack([makePad('a')], macros)

    const { routesProcessed } = resolveRackMacrosBounded(rack)

    // The resolver iterated AT MOST MAX_TOTAL_EDGES routes — NOT 400,000.
    expect(routesProcessed).toBeLessThanOrEqual(MAX_TOTAL_EDGES)
    // And it hits exactly the global ceiling (proves the cap engaged).
    expect(routesProcessed).toBe(MAX_TOTAL_EDGES)
  })

  it('per-macro cap: a single macro with 1e6 routes is bounded', () => {
    const routes: MacroRoute[] = []
    for (let r = 0; r < 1_000_000; r++) routes.push(route('pad.a.scrub', 1))
    const rack = makeRack([makePad('a')], [macro('m1', 1, routes)])

    const { routesProcessed } = resolveRackMacrosBounded(rack)
    // One macro can contribute at most MAX_MODROUTES_PER_MACRO route-iterations.
    expect(routesProcessed).toBeLessThanOrEqual(MAX_MODROUTES_PER_MACRO)
  })

  it('macro-count cap: 10,000 macros are bounded to MAX_MACROS_PER_RACK', () => {
    const macros: RackMacro[] = []
    for (let i = 0; i < 10_000; i++) {
      macros.push(macro(`m${i}`, 1, [route('pad.a.scrub', 1)]))
    }
    const rack = makeRack([makePad('a')], macros)
    const { routesProcessed } = resolveRackMacrosBounded(rack)
    // At most MAX_MACROS_PER_RACK macros considered → at most that many routes.
    expect(routesProcessed).toBeLessThanOrEqual(MAX_MACROS_PER_RACK)
  })

  it('a normal under-cap rack processes every route (no over-truncation)', () => {
    const macros: RackMacro[] = [
      macro('m1', 1, [route('pad.a.scrub', 1), route('pad.a.opacity', -1)]),
    ]
    const { routesProcessed } = resolveRackMacrosBounded(makeRack([makePad('a')], macros))
    expect(routesProcessed).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// TRUST BOUNDARY — unknown target / malformed route skipped; NaN/Inf clamped
// ---------------------------------------------------------------------------

describe('resolveRackMacros — trust boundary (preserved guards)', () => {
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
    expect(resolveRackMacros(rack)).toBe(rack) // returned UNCHANGED
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
