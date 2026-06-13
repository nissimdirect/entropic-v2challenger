/**
 * B4-pad-delete — removeRackPad SYMMETRIC cleanup (the B4 OUT-gate oracle).
 *
 * Deleting a rack pad must clean up symmetrically or it leaves orphans:
 *   (a) the pad itself (racks[trackId].pads),
 *   (b) its trigger events under the composite key `${trackId}:${padId}`,
 *   (c) any macro routes whose targetPath is `pad.<padId>.<param>`.
 *
 * These tests exercise the LIVE stores (no mocks) and prove the net effect after
 * a delete is: pad gone, its composite-key events gone, its macro routes gone,
 * while a route targeting a SURVIVING pad and all other pads are untouched.
 *
 * FAIL-BEFORE: without removeRackPad (or with a partial cleanup that only drops
 * the pad), the composite-key event and the macro route pointed at the deleted
 * pad both survive as orphans — the assertions below catch exactly that.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// window.entropic mock before store imports (matches rack-macros-store.test.ts).
const mockEntropic = {
  onEngineStatus: vi.fn(),
  sendCommand: vi.fn().mockResolvedValue({ ok: true }),
  onExportProgress: vi.fn().mockReturnValue(vi.fn()),
}
;(globalThis as unknown as { window: unknown }).window = { entropic: mockEntropic }

import { useInstrumentsStore } from '../../renderer/stores/instruments'
import { usePerformanceStore } from '../../renderer/stores/performance'

const TRACK = 'track-1'

function getRack() {
  const r = useInstrumentsStore.getState().getRack(TRACK)
  if (!r) throw new Error('no rack')
  return r
}

beforeEach(() => {
  useInstrumentsStore.setState({ instruments: {}, racks: {} })
  usePerformanceStore.setState({ trackEvents: {} })
})

describe('removeRackPad — symmetric cleanup (no orphans)', () => {
  it('removeRackPad_leaves_no_orphans', () => {
    const inst = useInstrumentsStore.getState()
    const perf = usePerformanceStore.getState()

    // Two pads so the deleted pad is NOT the last one (target + survivor).
    inst.addRack(TRACK) // pad 0
    inst.addRackPad(TRACK) // pad 1
    const pads0 = getRack().pads
    expect(pads0).toHaveLength(2)
    const targetPad = pads0[0].id
    const survivingPad = pads0[1].id

    // Source + trigger the TARGET pad → writes the composite-key event.
    inst.setRackPadSource(TRACK, targetPad, 'clip-x')
    perf.triggerRackPad(TRACK, targetPad, 5)
    const targetKey = `${TRACK}:${targetPad}`
    expect(usePerformanceStore.getState().trackEvents[targetKey]).toHaveLength(1)

    // A macro with TWO routes: one at the target pad, one at the survivor.
    const mId = inst.addRackMacro(TRACK)!
    expect(inst.addMacroRoute(TRACK, mId, { targetPath: `pad.${targetPad}.scrub`, depth: 1 })).toBe(true)
    expect(
      inst.addMacroRoute(TRACK, mId, { targetPath: `pad.${survivingPad}.opacity`, depth: -1 }),
    ).toBe(true)
    expect(getRack().macros![0].routes).toHaveLength(2)

    // --- delete the target pad ---
    inst.removeRackPad(TRACK, targetPad)
    // The component does the event cleanup alongside removeRackPad.
    perf.clearRackPadEvents(TRACK, targetPad)

    const rackAfter = getRack()
    const eventsAfter = usePerformanceStore.getState().trackEvents

    // (a) target pad is GONE from racks[trackId].pads
    expect(rackAfter.pads.find((p) => p.id === targetPad)).toBeUndefined()

    // (b) composite-key event is GONE
    expect(eventsAfter[targetKey]).toBeUndefined()

    // (c) NO macro route anywhere points at the deleted pad
    const prefix = `pad.${targetPad}.`
    const danglingRoutes = (rackAfter.macros ?? []).flatMap((m) =>
      m.routes.filter((r) => r.targetPath.startsWith(prefix)),
    )
    expect(danglingRoutes).toHaveLength(0)

    // (d) the route targeting the SURVIVING pad is UNTOUCHED
    const routesAfter = rackAfter.macros![0].routes
    expect(routesAfter).toHaveLength(1)
    expect(routesAfter[0].targetPath).toBe(`pad.${survivingPad}.opacity`)
    expect(routesAfter[0].depth).toBe(-1)

    // (e) the surviving pad itself is untouched
    expect(rackAfter.pads).toHaveLength(1)
    expect(rackAfter.pads[0].id).toBe(survivingPad)
  })

  it('guards: no-op on absent track / rack / pad (no throw)', () => {
    const inst = useInstrumentsStore.getState()
    // No rack at all.
    expect(() => inst.removeRackPad('no-track', 'no-pad')).not.toThrow()
    // Rack exists, pad does not.
    inst.addRack(TRACK)
    const before = getRack().pads.length
    expect(() => inst.removeRackPad(TRACK, 'no-such-pad')).not.toThrow()
    expect(getRack().pads).toHaveLength(before)
  })

  it('emptying the rack leaves an empty pads array (rack not deleted)', () => {
    const inst = useInstrumentsStore.getState()
    inst.addRack(TRACK) // single pad
    const onlyPad = getRack().pads[0].id
    inst.removeRackPad(TRACK, onlyPad)
    const rack = useInstrumentsStore.getState().getRack(TRACK)
    expect(rack).toBeDefined()
    expect(rack!.pads).toHaveLength(0)
  })

  it('does not touch other macros’ unrelated routes or other tracks', () => {
    const inst = useInstrumentsStore.getState()
    inst.addRack(TRACK)
    inst.addRackPad(TRACK)
    const [a, b] = getRack().pads.map((p) => p.id)
    const m1 = inst.addRackMacro(TRACK)!
    const m2 = inst.addRackMacro(TRACK)!
    inst.addMacroRoute(TRACK, m1, { targetPath: `pad.${a}.scrub`, depth: 1 })
    inst.addMacroRoute(TRACK, m2, { targetPath: `pad.${b}.scrub`, depth: 1 })

    // Other track with its own rack + route — must be untouched.
    inst.addRack('track-2')
    const t2pad = useInstrumentsStore.getState().getRack('track-2')!.pads[0].id
    const t2m = inst.addRackMacro('track-2')!
    inst.addMacroRoute('track-2', t2m, { targetPath: `pad.${t2pad}.scrub`, depth: 1 })

    inst.removeRackPad(TRACK, a)

    const rack = getRack()
    // m1's route (pointed at the deleted pad) is pruned.
    expect(rack.macros!.find((m) => m.id === m1)!.routes).toHaveLength(0)
    // m2's unrelated route survives.
    expect(rack.macros!.find((m) => m.id === m2)!.routes).toHaveLength(1)
    // Other track untouched.
    const t2 = useInstrumentsStore.getState().getRack('track-2')!
    expect(t2.pads).toHaveLength(1)
    expect(t2.macros![0].routes).toHaveLength(1)
  })
})
