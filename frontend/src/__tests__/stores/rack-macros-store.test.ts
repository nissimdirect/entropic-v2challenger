/**
 * B4.2 — Sample Rack macro store-write fan-out caps (LIVE enforcement, layer 1).
 *
 * The in-app editor mutates rack macros through these store actions. They are
 * the FIRST enforcement layer of the fan-out caps (the resolver is the second,
 * defense-in-depth layer for hostile files that bypass the store). These tests
 * exercise the LIVE store actions and prove an over-cap rack CANNOT be built via
 * the editor:
 *   - addRackMacro rejects a 9th macro (MAX_MACROS_PER_RACK).
 *   - addMacroRoute rejects past MAX_MODROUTES_PER_MACRO (per-macro cap).
 *   - addMacroRoute rejects past MAX_TOTAL_EDGES (rack-total cap).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// window.entropic mock before store imports (matches rack-persistence.test.ts).
const mockEntropic = {
  onEngineStatus: vi.fn(),
  sendCommand: vi.fn().mockResolvedValue({ ok: true }),
  onExportProgress: vi.fn().mockReturnValue(vi.fn()),
}
;(globalThis as unknown as { window: unknown }).window = { entropic: mockEntropic }

import { useInstrumentsStore } from '../../renderer/stores/instruments'
import {
  MAX_MACROS_PER_RACK,
  MAX_MODROUTES_PER_MACRO,
  MAX_TOTAL_EDGES,
} from '../../renderer/components/instruments/types'

const TRACK = 'track-1'

function freshStore() {
  useInstrumentsStore.setState({ instruments: {}, racks: {} })
  useInstrumentsStore.getState().addRack(TRACK, 1)
}

function getRack() {
  const r = useInstrumentsStore.getState().getRack(TRACK)
  if (!r) throw new Error('no rack')
  return r
}

describe('rack-macros store — MAX_MACROS_PER_RACK (layer 1)', () => {
  beforeEach(freshStore)

  it('adds macros up to the cap, then rejects', () => {
    const store = useInstrumentsStore.getState()
    for (let i = 0; i < MAX_MACROS_PER_RACK; i++) {
      const id = store.addRackMacro(TRACK)
      expect(id).not.toBeNull()
    }
    expect(getRack().macros).toHaveLength(MAX_MACROS_PER_RACK)

    // The 9th macro is REJECTED (no-op, returns null).
    const rejected = store.addRackMacro(TRACK)
    expect(rejected).toBeNull()
    expect(getRack().macros).toHaveLength(MAX_MACROS_PER_RACK) // unchanged
  })
})

describe('rack-macros store — MAX_MODROUTES_PER_MACRO (per-macro cap, layer 1)', () => {
  beforeEach(freshStore)

  it('adds routes up to the per-macro cap, then rejects', () => {
    const store = useInstrumentsStore.getState()
    const mId = store.addRackMacro(TRACK)!
    for (let i = 0; i < MAX_MODROUTES_PER_MACRO; i++) {
      const ok = store.addMacroRoute(TRACK, mId, { targetPath: 'pad.x.scrub', depth: 1 })
      expect(ok).toBe(true)
    }
    const macro = getRack().macros!.find((m) => m.id === mId)!
    expect(macro.routes).toHaveLength(MAX_MODROUTES_PER_MACRO)

    // One more route on this macro is REJECTED.
    const rejected = store.addMacroRoute(TRACK, mId, { targetPath: 'pad.x.scrub', depth: 1 })
    expect(rejected).toBe(false)
    expect(getRack().macros!.find((m) => m.id === mId)!.routes).toHaveLength(
      MAX_MODROUTES_PER_MACRO,
    )
  })
})

describe('rack-macros store — MAX_TOTAL_EDGES (rack-total cap, layer 1)', () => {
  beforeEach(freshStore)

  it('rejects a route once the rack total hits MAX_TOTAL_EDGES', () => {
    const store = useInstrumentsStore.getState()
    // MAX_TOTAL_EDGES / MAX_MODROUTES_PER_MACRO macros, each filled to the
    // per-macro cap, exactly reaches the rack total.
    const macrosNeeded = Math.ceil(MAX_TOTAL_EDGES / MAX_MODROUTES_PER_MACRO)
    expect(macrosNeeded).toBeLessThanOrEqual(MAX_MACROS_PER_RACK) // fits the macro cap

    let added = 0
    for (let i = 0; i < macrosNeeded && added < MAX_TOTAL_EDGES; i++) {
      const mId = store.addRackMacro(TRACK)!
      for (
        let r = 0;
        r < MAX_MODROUTES_PER_MACRO && added < MAX_TOTAL_EDGES;
        r++
      ) {
        const ok = store.addMacroRoute(TRACK, mId, { targetPath: 'pad.x.scrub', depth: 1 })
        if (ok) added++
      }
    }

    // We reached exactly the rack total.
    const total = getRack().macros!.reduce((n, m) => n + m.routes.length, 0)
    expect(total).toBe(MAX_TOTAL_EDGES)

    // Any further route — on a macro that still has per-macro headroom — is
    // REJECTED by the rack-total cap. Add a fresh macro with room and try.
    const spare = store.addRackMacro(TRACK)
    if (spare) {
      const rejected = store.addMacroRoute(TRACK, spare, {
        targetPath: 'pad.x.scrub',
        depth: 1,
      })
      expect(rejected).toBe(false)
    }
    expect(getRack().macros!.reduce((n, m) => n + m.routes.length, 0)).toBe(
      MAX_TOTAL_EDGES,
    )
  })
})

describe('rack-macros store — basic CRUD (no-cap paths)', () => {
  beforeEach(freshStore)

  it('updateRackMacro patches name/value', () => {
    const store = useInstrumentsStore.getState()
    const mId = store.addRackMacro(TRACK, 'Chaos')!
    store.updateRackMacro(TRACK, mId, { value: 0.7, name: 'Decay' })
    const macro = getRack().macros!.find((m) => m.id === mId)!
    expect(macro.value).toBe(0.7)
    expect(macro.name).toBe('Decay')
  })

  it('removeRackMacro drops the macro and its routes', () => {
    const store = useInstrumentsStore.getState()
    const mId = store.addRackMacro(TRACK)!
    store.addMacroRoute(TRACK, mId, { targetPath: 'pad.x.scrub', depth: 1 })
    store.removeRackMacro(TRACK, mId)
    expect(getRack().macros).toHaveLength(0)
  })

  it('removeMacroRoute drops a single route by index', () => {
    const store = useInstrumentsStore.getState()
    const mId = store.addRackMacro(TRACK)!
    store.addMacroRoute(TRACK, mId, { targetPath: 'pad.x.scrub', depth: 1 })
    store.addMacroRoute(TRACK, mId, { targetPath: 'pad.x.opacity', depth: -1 })
    store.removeMacroRoute(TRACK, mId, 0)
    const routes = getRack().macros!.find((m) => m.id === mId)!.routes
    expect(routes).toHaveLength(1)
    expect(routes[0].targetPath).toBe('pad.x.opacity')
  })

  it('addRackMacro on a track with no rack returns null', () => {
    expect(useInstrumentsStore.getState().addRackMacro('no-such-track')).toBeNull()
  })
})
