/**
 * UH.2 / UH.3 — undo coverage for the instruments store (B1 sampler, B4 rack/
 * pad/macro, B6 frame-bank, B8 granulator). These tests FAIL on origin/main
 * (where instruments.ts has ZERO undoable() sites) and PASS on this branch.
 *
 * Conventions exercised (undo.ts header):
 *   - undo restores SAME ids (inverse captures ids, never array indices)
 *   - removeX → undo restores the entity WITH its dependent data (routes/slots)
 *   - macro fan-out (remove macro + its routes) reverts as ONE history entry
 *   - the two standard negative tests (empty-stack no-op · divergent-edit clears redo)
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useInstrumentsStore } from '../../renderer/stores/instruments'
import { useUndoStore } from '../../renderer/stores/undo'
import type { MacroRoute } from '../../renderer/components/instruments/types'

const T1 = 'track-1'

function reset() {
  useInstrumentsStore.setState({ instruments: {}, racks: {}, frameBanks: {}, granulators: {} })
  useUndoStore.getState().clear()
}

const undo = () => useUndoStore.getState().undo()
const redo = () => useUndoStore.getState().redo()
const I = () => useInstrumentsStore.getState()

describe('instruments store undo — B1 sampler', () => {
  beforeEach(reset)

  it('addSampler → undo removes it; redo restores the SAME id', () => {
    I().addSampler(T1, 'clip-a')
    const id = I().instruments[T1].id
    expect(useUndoStore.getState().past).toHaveLength(1)

    undo()
    expect(I().instruments[T1]).toBeUndefined()

    redo()
    expect(I().instruments[T1]).toBeTruthy()
    expect(I().instruments[T1].id).toBe(id) // same id (deterministic redo)
    expect(I().instruments[T1].clipId).toBe('clip-a')
  })

  it('updateSampler → undo restores the prior value (only patched keys reverted)', () => {
    I().addSampler(T1)
    I().updateSampler(T1, { speed: 4, opacity: 0.3 })
    expect(I().instruments[T1].speed).toBe(4)

    undo()
    expect(I().instruments[T1].speed).toBe(1) // default restored
    expect(I().instruments[T1].opacity).toBe(1)
  })

  it('removeSampler → undo restores the SAME sampler (same id)', () => {
    I().addSampler(T1, 'clip-z')
    const id = I().instruments[T1].id
    useUndoStore.getState().clear() // isolate the remove entry

    I().removeSampler(T1)
    expect(I().instruments[T1]).toBeUndefined()

    undo()
    expect(I().instruments[T1]).toBeTruthy()
    expect(I().instruments[T1].id).toBe(id)
    expect(I().instruments[T1].clipId).toBe('clip-z')
  })
})

describe('instruments store undo — B4 rack', () => {
  beforeEach(reset)

  it('addRack → undo restores no-rack; redo restores SAME rack id', () => {
    I().addRack(T1)
    const rackId = I().racks[T1].id
    expect(I().racks[T1].pads).toHaveLength(1)

    undo()
    expect(I().racks[T1]).toBeUndefined() // no-rack restored

    redo()
    expect(I().racks[T1]).toBeTruthy()
    expect(I().racks[T1].id).toBe(rackId)
  })

  it('removeRack → undo restores the full rack subtree (pads + macros + routes)', () => {
    I().addRack(T1)
    const padId = I().racks[T1].pads[0].id
    const macroId = I().addRackMacro(T1)!
    const route: MacroRoute = { targetPath: `pad.${padId}.opacity`, depth: 0.5 }
    I().addMacroRoute(T1, macroId, route)
    const snapshotPads = I().racks[T1].pads.length
    useUndoStore.getState().clear()

    I().removeRack(T1)
    expect(I().racks[T1]).toBeUndefined()

    undo()
    expect(I().racks[T1]).toBeTruthy()
    expect(I().racks[T1].pads).toHaveLength(snapshotPads)
    expect(I().racks[T1].macros![0].id).toBe(macroId)
    expect(I().racks[T1].macros![0].routes).toHaveLength(1)
    expect(I().racks[T1].macros![0].routes[0].targetPath).toBe(`pad.${padId}.opacity`)
  })

  it('addRackPad → undo removes exactly the added pad (others intact)', () => {
    I().addRack(T1)
    const firstPad = I().racks[T1].pads[0].id
    I().addRackPad(T1)
    expect(I().racks[T1].pads).toHaveLength(2)
    const addedPad = I().racks[T1].pads[1].id

    undo()
    expect(I().racks[T1].pads).toHaveLength(1)
    expect(I().racks[T1].pads[0].id).toBe(firstPad)
    expect(I().racks[T1].pads.find((p) => p.id === addedPad)).toBeUndefined()
  })

  it('removeRackPad → undo restores the pad WITH its macro routes', () => {
    I().addRack(T1)
    I().addRackPad(T1) // now 2 pads
    const padId = I().racks[T1].pads[1].id
    const macroId = I().addRackMacro(T1)!
    // a route pointed at the pad we will delete + a route at a surviving pad
    const survivorPad = I().racks[T1].pads[0].id
    I().addMacroRoute(T1, macroId, { targetPath: `pad.${padId}.opacity`, depth: 0.5 })
    I().addMacroRoute(T1, macroId, { targetPath: `pad.${survivorPad}.opacity`, depth: 0.7 })
    useUndoStore.getState().clear()

    I().removeRackPad(T1, padId)
    // pad gone + the route pointed at it pruned; survivor route remains
    expect(I().racks[T1].pads.find((p) => p.id === padId)).toBeUndefined()
    expect(I().racks[T1].macros![0].routes).toHaveLength(1)

    undo()
    // pad restored AND its pruned route restored (un-prune)
    expect(I().racks[T1].pads.find((p) => p.id === padId)).toBeTruthy()
    expect(I().racks[T1].macros![0].routes).toHaveLength(2)
    const paths = I().racks[T1].macros![0].routes.map((r) => r.targetPath)
    expect(paths).toContain(`pad.${padId}.opacity`)
    expect(paths).toContain(`pad.${survivorPad}.opacity`)
  })

  it('updateRackPad → undo restores the prior pad channel state (same id)', () => {
    I().addRack(T1)
    const padId = I().racks[T1].pads[0].id
    I().updateRackPad(T1, padId, { opacity: 0.25, mute: true })
    expect(I().racks[T1].pads[0].opacity).toBeCloseTo(0.25)
    expect(I().racks[T1].pads[0].mute).toBe(true)

    undo()
    expect(I().racks[T1].pads[0].id).toBe(padId)
    expect(I().racks[T1].pads[0].opacity).toBe(1)
    expect(I().racks[T1].pads[0].mute).toBe(false)
  })

  it('convertPadToBranch → undo restores the leaf pad (no branch)', () => {
    I().addRack(T1)
    const padId = I().racks[T1].pads[0].id
    const ok = I().convertPadToBranch(T1, [], padId)
    expect(ok).toBe(true)
    expect(I().racks[T1].pads[0].branch).toBeTruthy()

    undo()
    expect(I().racks[T1].pads[0].branch).toBeUndefined()
  })
})

describe('instruments store undo — B4 macros (fan-out = ONE entry)', () => {
  beforeEach(reset)

  it('removeRackMacro (macro + its routes) → undo reverts as ONE history entry', () => {
    I().addRack(T1)
    const padId = I().racks[T1].pads[0].id
    const macroId = I().addRackMacro(T1)!
    I().addMacroRoute(T1, macroId, { targetPath: `pad.${padId}.opacity`, depth: 0.5 })
    I().addMacroRoute(T1, macroId, { targetPath: `pad.${padId}.speed`, depth: 0.3 })
    expect(I().racks[T1].macros![0].routes).toHaveLength(2)
    useUndoStore.getState().clear()

    I().removeRackMacro(T1, macroId)
    expect(I().racks[T1].macros).toHaveLength(0)
    // The multi-route fan-out removal is exactly ONE undo entry (transaction).
    expect(useUndoStore.getState().past).toHaveLength(1)

    undo()
    // one undo reverts the WHOLE fan-out: macro + both routes restored together.
    expect(useUndoStore.getState().past).toHaveLength(0)
    expect(I().racks[T1].macros).toHaveLength(1)
    expect(I().racks[T1].macros![0].id).toBe(macroId)
    expect(I().racks[T1].macros![0].routes).toHaveLength(2)
  })

  it('addMacroRoute → undo removes only that route', () => {
    I().addRack(T1)
    const padId = I().racks[T1].pads[0].id
    const macroId = I().addRackMacro(T1)!
    useUndoStore.getState().clear()
    I().addMacroRoute(T1, macroId, { targetPath: `pad.${padId}.opacity`, depth: 0.5 })
    expect(I().racks[T1].macros![0].routes).toHaveLength(1)

    undo()
    expect(I().racks[T1].macros![0].routes).toHaveLength(0)
  })

  it('updateRackMacro → undo restores the prior name/value', () => {
    I().addRack(T1)
    const macroId = I().addRackMacro(T1, 'Original')!
    I().updateRackMacro(T1, macroId, { name: 'Renamed', value: 0.8 })
    expect(I().racks[T1].macros![0].name).toBe('Renamed')

    undo()
    expect(I().racks[T1].macros![0].name).toBe('Original')
    expect(I().racks[T1].macros![0].value).toBe(0)
  })
})

describe('instruments store undo — B6 frame-bank', () => {
  beforeEach(reset)

  it('addFrameBank → undo removes it; redo restores SAME id', () => {
    I().addFrameBank(T1, ['clip-a'])
    const id = I().frameBanks[T1].id

    undo()
    expect(I().frameBanks[T1]).toBeUndefined()

    redo()
    expect(I().frameBanks[T1].id).toBe(id)
  })

  it('addFrameBankSlot → undo restores the prior slots', () => {
    I().addFrameBank(T1)
    const before = I().frameBanks[T1].slots.length
    I().addFrameBankSlot(T1, { clipId: 'clip-x', frameIndex: 3 })
    expect(I().frameBanks[T1].slots).toHaveLength(before + 1)

    undo()
    expect(I().frameBanks[T1].slots).toHaveLength(before)
  })

  it('setFrameBankPosition → undo restores the prior position', () => {
    I().addFrameBank(T1)
    const prev = I().frameBanks[T1].position
    I().setFrameBankPosition(T1, 0.9)
    expect(I().frameBanks[T1].position).toBeCloseTo(0.9)

    undo()
    expect(I().frameBanks[T1].position).toBe(prev)
  })
})

describe('instruments store undo — B8 granulator', () => {
  beforeEach(reset)

  it('addGranulator → undo removes it; redo restores SAME id', () => {
    I().addGranulator(T1)
    const id = I().granulators[T1].id
    expect(useUndoStore.getState().past).toHaveLength(1)

    undo()
    expect(I().granulators[T1]).toBeUndefined()

    redo()
    expect(I().granulators[T1].id).toBe(id)
  })

  it('setGranulatorDensity → undo restores the prior density', () => {
    I().addGranulator(T1)
    const prev = I().granulators[T1].density
    I().setGranulatorDensity(T1, prev + 5)
    expect(I().granulators[T1].density).toBe(prev + 5)

    undo()
    expect(I().granulators[T1].density).toBe(prev)
  })

  it('setGranulatorAxisParam → undo restores the prior axis value', () => {
    I().addGranulator(T1)
    const prev = I().granulators[T1].axes.t.grain
    I().setGranulatorAxisParam(T1, 't', 'grain', 0.9)
    expect(I().granulators[T1].axes.t.grain).toBeCloseTo(0.9)

    undo()
    expect(I().granulators[T1].axes.t.grain).toBe(prev)
  })
})

describe('instruments store undo — standard negative tests', () => {
  beforeEach(reset)

  it('undo on empty stack is a no-op (no crash, state unchanged)', () => {
    expect(useUndoStore.getState().past).toHaveLength(0)
    expect(() => undo()).not.toThrow()
    expect(I().racks[T1]).toBeUndefined()
  })

  it('a divergent edit clears the redo (future) stack', () => {
    // do A (addRack) → undo → do B (addGranulator) → redo is a no-op
    I().addRack(T1)
    undo()
    expect(useUndoStore.getState().future).toHaveLength(1)

    I().addGranulator(T1) // divergent edit clears future
    expect(useUndoStore.getState().future).toHaveLength(0)

    redo() // no-op
    expect(I().racks[T1]).toBeUndefined() // A was NOT re-applied
    expect(I().granulators[T1]).toBeTruthy() // B stands
  })
})
