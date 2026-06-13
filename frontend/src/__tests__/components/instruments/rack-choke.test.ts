/**
 * B4-choke — CHOKE-CUTOFF HARD ORACLE.
 *
 * A choke group makes pads cut each other off (closed hat silences open hat).
 * Rack pads are HARD to choke because each pad has its OWN composite-key stream
 * (`trackEvents['${trackId}:${padId}']`) and buildRackLayers evaluates each pad's
 * stream INDEPENDENTLY (evaluateVoices per pad). So a choke must be written INTO
 * the sibling pad's own stream, where its independent evaluateVoices will see it.
 *
 * This oracle uses REAL stores + REAL buildRackLayers + REAL evaluateVoices (no
 * mocks). It proves the choke removes the sibling's RENDER layer, not just a flag:
 *
 *   padA + padB both in chokeGroup=1, both sourced, sustaining ADSR.
 *   triggerRackPad(padA, frame=0)            → padA voice active, sustains.
 *   triggerRackPad(padB, frame=10, [padA])   → silencing event into padA's stream.
 *   At frame ≥10: buildRackLayers(padA's stream) yields 0 layers (choked),
 *                 buildRackLayers(padB's stream) yields ≥1 layer (sounding).
 *
 * FAIL-BEFORE: without the sibling silencing event (chokeSiblingPadIds omitted),
 * padA's sustaining voice is STILL active at frame 10 → padA layer count ≥1.
 * PASS-AFTER: with the sibling event, padA's layer count at frame 10 is 0.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { buildRackLayers } from '../../../renderer/components/instruments/buildRackLayers'
import { useInstrumentsStore } from '../../../renderer/stores/instruments'
import { usePerformanceStore } from '../../../renderer/stores/performance'
import type { Asset, ADSREnvelope } from '../../../shared/types'

const TRACK = 'perf-track-1'
// Sustaining envelope: instant attack, no decay, full sustain, LONG release so a
// voice that ISN'T choked is unambiguously still active at frame 10.
const ADSR_SUSTAIN: ADSREnvelope = { attack: 0, decay: 0, sustain: 1, release: 300 }

function makeAssets(): Record<string, Asset> {
  return {
    'clip-1': {
      id: 'clip-1',
      path: '/test/a.mp4',
      type: 'video',
      meta: { duration: 100, fps: 30, width: 1920, height: 1080 },
    } as unknown as Asset,
  }
}

/** Layers a single pad's stream contributes at `frame` (per-pad isolated eval). */
function padLayerCount(padId: string, frame: number): number {
  const rack = useInstrumentsStore.getState().racks[TRACK]
  const eventsByPad = {
    [padId]: usePerformanceStore.getState().trackEvents[`${TRACK}:${padId}`] ?? [],
  }
  // Build a single-pad view of the rack so buildRackLayers evaluates only padId.
  const onePadRack = { ...rack, pads: rack.pads.filter((p) => p.id === padId) }
  return buildRackLayers(onePadRack, {
    eventsByPad,
    frame,
    assets: makeAssets(),
    defaultFps: 30,
    adsr: ADSR_SUSTAIN,
  }).length
}

beforeEach(() => {
  useInstrumentsStore.setState({ instruments: {}, racks: {} })
  usePerformanceStore.setState({ trackEvents: {} })
})

describe('rack_choke_silences_group_sibling (HARD ORACLE)', () => {
  it('FAIL-BEFORE: no sibling event → padA still sounding at frame 10', () => {
    const inst = useInstrumentsStore.getState()
    inst.addRack(TRACK) // pad 0
    inst.addRackPad(TRACK) // pad 1
    const [padA, padB] = inst.getRack(TRACK)!.pads.map((p) => p.id)
    inst.setRackPadSource(TRACK, padA, 'clip-1')
    inst.setRackPadSource(TRACK, padB, 'clip-1')
    inst.setRackPadChokeGroup(TRACK, padA, 1)
    inst.setRackPadChokeGroup(TRACK, padB, 1)

    const perf = usePerformanceStore.getState()
    perf.triggerRackPad(TRACK, padA, 0)
    // padB triggered WITHOUT chokeSiblingPadIds → no silencing event for padA.
    perf.triggerRackPad(TRACK, padB, 10)

    // padA's sustaining voice survives to frame 10 (the bug this slice removes).
    expect(padLayerCount(padA, 10)).toBeGreaterThanOrEqual(1)
  })

  it('PASS-AFTER: sibling event choke → padA silent at frame 10, padB sounding', () => {
    const inst = useInstrumentsStore.getState()
    inst.addRack(TRACK)
    inst.addRackPad(TRACK)
    const [padA, padB] = inst.getRack(TRACK)!.pads.map((p) => p.id)
    inst.setRackPadSource(TRACK, padA, 'clip-1')
    inst.setRackPadSource(TRACK, padB, 'clip-1')
    inst.setRackPadChokeGroup(TRACK, padA, 1)
    inst.setRackPadChokeGroup(TRACK, padB, 1)

    const perf = usePerformanceStore.getState()
    perf.triggerRackPad(TRACK, padA, 0)
    // Sanity: before padB triggers, padA is active at frame 5.
    expect(padLayerCount(padA, 5)).toBeGreaterThanOrEqual(1)

    // padB triggers in the same group → silences padA at frame 10.
    perf.triggerRackPad(TRACK, padB, 10, [padA])

    // THE ORACLE: padA's render layer is gone at frame 10 (choked); padB sounds.
    expect(padLayerCount(padA, 10)).toBe(0)
    expect(padLayerCount(padB, 10)).toBeGreaterThanOrEqual(1)
  })

  it('DECOUPLE-REGRESSION: a pad in a DIFFERENT group is NOT choked', () => {
    const inst = useInstrumentsStore.getState()
    inst.addRack(TRACK)
    inst.addRackPad(TRACK)
    const [padA, padB] = inst.getRack(TRACK)!.pads.map((p) => p.id)
    inst.setRackPadSource(TRACK, padA, 'clip-1')
    inst.setRackPadSource(TRACK, padB, 'clip-1')
    inst.setRackPadChokeGroup(TRACK, padA, 2) // group 2
    inst.setRackPadChokeGroup(TRACK, padB, 1) // group 1

    const perf = usePerformanceStore.getState()
    perf.triggerRackPad(TRACK, padA, 0)
    // padB triggers in group 1; padA is in group 2 → NOT a sibling, no silencing.
    perf.triggerRackPad(TRACK, padB, 10, [] /* no group-1 siblings present */)

    // padA (group 2) is untouched by a group-1 trigger.
    expect(padLayerCount(padA, 10)).toBeGreaterThanOrEqual(1)
  })

  it('REGRESSION: triggerRackPad with no siblings behaves exactly as today', () => {
    const inst = useInstrumentsStore.getState()
    inst.addRack(TRACK)
    const padA = inst.getRack(TRACK)!.pads[0].id
    inst.setRackPadSource(TRACK, padA, 'clip-1')

    const perf = usePerformanceStore.getState()
    perf.triggerRackPad(TRACK, padA, 0)
    // Exactly one trigger event, no extra silencing events anywhere.
    const events = usePerformanceStore.getState().trackEvents
    expect(events[`${TRACK}:${padA}`]).toHaveLength(1)
    expect(events[`${TRACK}:${padA}`][0].kind).toBe('trigger')
    expect(Object.keys(events)).toHaveLength(1)
    expect(padLayerCount(padA, 5)).toBeGreaterThanOrEqual(1)
  })
})

describe('setRackPadChokeGroup — trust boundary', () => {
  it('accepts null and 1..8; rejects out-of-range / non-finite (no-op)', () => {
    const inst = useInstrumentsStore.getState()
    inst.addRack(TRACK)
    const padA = inst.getRack(TRACK)!.pads[0].id

    inst.setRackPadChokeGroup(TRACK, padA, 1)
    expect(inst.getRack(TRACK)!.pads[0].chokeGroup).toBe(1)

    inst.setRackPadChokeGroup(TRACK, padA, 8)
    expect(inst.getRack(TRACK)!.pads[0].chokeGroup).toBe(8)

    // Out of range → no-op (membership unchanged, still 8).
    inst.setRackPadChokeGroup(TRACK, padA, 9)
    expect(inst.getRack(TRACK)!.pads[0].chokeGroup).toBe(8)
    inst.setRackPadChokeGroup(TRACK, padA, 0)
    expect(inst.getRack(TRACK)!.pads[0].chokeGroup).toBe(8)
    // Non-finite / fractional → no-op.
    inst.setRackPadChokeGroup(TRACK, padA, Number.NaN)
    expect(inst.getRack(TRACK)!.pads[0].chokeGroup).toBe(8)
    inst.setRackPadChokeGroup(TRACK, padA, 1.5)
    expect(inst.getRack(TRACK)!.pads[0].chokeGroup).toBe(8)

    // null clears membership.
    inst.setRackPadChokeGroup(TRACK, padA, null)
    expect(inst.getRack(TRACK)!.pads[0].chokeGroup).toBeNull()
  })

  it('no-op on absent track / rack / pad (no throw)', () => {
    const inst = useInstrumentsStore.getState()
    expect(() => inst.setRackPadChokeGroup('no-track', 'no-pad', 1)).not.toThrow()
    inst.addRack(TRACK)
    expect(() => inst.setRackPadChokeGroup(TRACK, 'no-such-pad', 1)).not.toThrow()
  })
})
