/**
 * B5.3 — NESTED PREVIEW TRIGGERING anti-dead-flag oracle.
 *
 * Proves the missing UI→render link for NESTED branch pads: triggering a pad
 * while inside a branch (a `rackEditPath`) writes the PATH-PREFIXED composite key
 * that the preview render path reads, so the branch child FIRES IN LIVE PREVIEW.
 *
 * The integration path under test (mirrors App.tsx ~1130 gatherPadEvents):
 *
 *   triggerRackPad(trackId, padId, frame, siblings, group, branchPath)   [perf store]
 *     → trackEvents['${trackId}:${branchPath}_${padId}'] gets a TriggerEvent
 *     → gatherPadEvents (recursive, path-from-root keys) reads that composite key
 *     → buildRackLayers / flattenRackTree → expand the branch → child voice layer
 *
 * FAIL-BEFORE: trigger with NO branchPath (the bare `${trackId}:${padId}` key —
 * the pre-B5.3 behavior). The render gathers nested events under the PREFIXED key
 * `${trackId}:b0_${padId}`, finds nothing → the branch composites no children →
 * emits NO group layer (the branch renders nothing in preview).
 * PASS-AFTER: trigger WITH the branchPath → the prefixed key matches → the branch
 * emits ONE group layer carrying the child's footage.
 *
 * Uses the REAL stores + the REAL gather/buildRackLayers (no mocks) and the
 * REAL `rackEditPathToBranchPath` (the pad-id→`bN` index path converter).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  buildRackLayers,
  rackEditPathToBranchPath,
} from '../../../renderer/components/instruments/buildRackLayers'
import type {
  RackNode,
  RackGroupLayer,
  SamplerVoiceLayer,
} from '../../../renderer/components/instruments/types'
import { useInstrumentsStore } from '../../../renderer/stores/instruments'
import { usePerformanceStore } from '../../../renderer/stores/performance'
import type { TriggerEvent } from '../../../renderer/components/instruments/voiceFSM'
import type { Asset, ADSREnvelope } from '../../../shared/types'

const ADSR_INSTANT: ADSREnvelope = { attack: 0, decay: 0, sustain: 1, release: 0 }
const TRACK = 'perf-track-1'
const FRAME = 0

function makeAssets(): Record<string, Asset> {
  return {
    'clip-1': {
      id: 'clip-1',
      path: '/test/a.mp4',
      type: 'video',
      meta: { duration: 10, fps: 30, width: 1920, height: 1080 },
    } as unknown as Asset,
  }
}

/**
 * The EXACT recursive gather from App.tsx (~1130). Path-from-root event keys; a
 * flat pad's store key is `${trackId}:${pad.id}`, a nested pad's is
 * `${trackId}:${branchPath}_${pad.id}` (the prefix is the `bN_`-joined index
 * path). This is the consumer the trigger must feed.
 */
function gatherFromStore(rack: RackNode, trackId: string): Record<string, TriggerEvent[]> {
  const perfState = usePerformanceStore.getState()
  const eventsByPad: Record<string, TriggerEvent[]> = {}
  const walk = (pads: RackNode['pads'], branchPath: string) => {
    pads.forEach((pad, padIndex) => {
      if (pad.branch) {
        const seg = `b${padIndex}`
        const childPath = branchPath === '' ? seg : `${branchPath}_${seg}`
        walk(pad.branch.pads, childPath)
        return
      }
      const key = branchPath === '' ? pad.id : `${branchPath}_${pad.id}`
      const storeKey =
        branchPath === ''
          ? `${trackId}:${pad.id}`
          : `${trackId}:${branchPath}_${pad.id}`
      eventsByPad[key] = perfState.trackEvents[storeKey] ?? []
    })
  }
  walk(rack.pads, '')
  return eventsByPad
}

function renderRack(): (SamplerVoiceLayer | RackGroupLayer)[] {
  const rack = useInstrumentsStore.getState().racks[TRACK]
  const eventsByPad = gatherFromStore(rack, TRACK)
  return buildRackLayers(rack, {
    eventsByPad,
    frame: FRAME,
    assets: makeAssets(),
    defaultFps: 30,
    adsr: ADSR_INSTANT,
  })
}

/** Build a rack whose pad 0 is a branch with one SOURCED child pad. Returns the
 * branch-pad id, the branch's child-pad id, and the child's `bN` branch path. */
function makeNestedRack(): { branchPadId: string; childPadId: string; branchPath: string } {
  useInstrumentsStore.getState().addRack(TRACK)
  const top = useInstrumentsStore.getState().racks[TRACK]
  const branchPadId = top.pads[0].id
  // Convert pad 0 → a branch (seeds ONE default leaf child).
  const ok = useInstrumentsStore.getState().convertPadToBranch(TRACK, [], branchPadId)
  expect(ok).toBe(true)
  const branch = useInstrumentsStore.getState().racks[TRACK].pads[0].branch!
  const childPadId = branch.pads[0].id
  // Source the child so it has footage to render.
  useInstrumentsStore.getState().setRackPadSourceAt(TRACK, [branchPadId], childPadId, 'clip-1')
  // The `bN` branch path for editPath [branchPadId]: pad 0 of the top rack → 'b0'.
  const branchPath = rackEditPathToBranchPath(
    useInstrumentsStore.getState().racks[TRACK],
    [branchPadId],
  )!
  return { branchPadId, childPadId, branchPath }
}

beforeEach(() => {
  useInstrumentsStore.setState({ instruments: {}, racks: {} })
  usePerformanceStore.setState({ trackEvents: {} })
})

describe('B5.3 — rackEditPathToBranchPath (pad-id path → bN index path)', () => {
  it('empty path → "" (flat, byte-identical to B4)', () => {
    const { } = makeNestedRack()
    expect(rackEditPathToBranchPath(useInstrumentsStore.getState().racks[TRACK], [])).toBe('')
  })

  it('one-level branch path → "b0" (pad 0 of the top rack)', () => {
    const { branchPadId, branchPath } = makeNestedRack()
    expect(branchPath).toBe('b0')
    expect(
      rackEditPathToBranchPath(useInstrumentsStore.getState().racks[TRACK], [branchPadId]),
    ).toBe('b0')
  })

  it('stale path (unknown pad id) → null (defensive, no throw)', () => {
    makeNestedRack()
    expect(
      rackEditPathToBranchPath(useInstrumentsStore.getState().racks[TRACK], ['no-such-pad']),
    ).toBeNull()
  })
})

describe('B5.3 — NESTED FIRES IN PREVIEW (anti-dead-flag)', () => {
  it('FAIL-BEFORE: trigger WITHOUT branchPath (flat key) → branch renders nothing', () => {
    const { branchPadId, childPadId } = makeNestedRack()

    // Pre-B5.3 behavior: trigger with NO branch path → bare `${trackId}:${padId}`.
    usePerformanceStore.getState().triggerRackPad(TRACK, childPadId, FRAME)

    // The event landed under the FLAT key, NOT the prefixed key the render reads.
    expect(usePerformanceStore.getState().trackEvents[`${TRACK}:${childPadId}`]?.length).toBe(1)
    expect(usePerformanceStore.getState().trackEvents[`${TRACK}:b0_${childPadId}`]).toBeUndefined()

    // The branch composites no children → emits NO group layer.
    const layers = renderRack()
    expect(layers).toHaveLength(0)
    void branchPadId
  })

  it('PASS-AFTER: trigger WITH branchPath → prefixed key → branch emits the child layer', () => {
    const { childPadId, branchPath } = makeNestedRack()

    // THE B5.3 UI ACTION — RackDevice.onPadTrigger passes the branch path.
    usePerformanceStore.getState().triggerRackPad(TRACK, childPadId, FRAME, undefined, null, branchPath)

    // The event must land under the PATH-PREFIXED composite key.
    const key = `${TRACK}:${branchPath}_${childPadId}`
    const events = usePerformanceStore.getState().trackEvents[key]
    expect(events?.length).toBe(1)
    expect(events![0].instrumentId).toBe(key)
    // The bare flat key is NOT written (nested ≠ flat).
    expect(usePerformanceStore.getState().trackEvents[`${TRACK}:${childPadId}`]).toBeUndefined()

    // The branch now composites its child → ONE group layer carrying the footage.
    const layers = renderRack()
    expect(layers).toHaveLength(1)
    const g = layers[0] as RackGroupLayer
    expect(g.layer_type).toBe('group')
    expect(g.group_id).toBe('b0')
    expect(g.children).toHaveLength(1)
    const child = g.children[0] as SamplerVoiceLayer
    expect(child.layer_type).toBe('video')
    expect(child.asset_path).toBe('/test/a.mp4')
  })
})

describe('B5.3 — FLAT TRIGGER UNCHANGED (byte-identical key)', () => {
  it('a flat trigger (empty branchPath) writes the bare key, identical to B4', () => {
    useInstrumentsStore.getState().addRack(TRACK)
    const pad = useInstrumentsStore.getState().racks[TRACK].pads[0]

    // Trigger with an EMPTY branch path — must be byte-identical to the no-arg call.
    usePerformanceStore.getState().triggerRackPad(TRACK, pad.id, FRAME, undefined, null, '')
    const flatKeyEvents = usePerformanceStore.getState().trackEvents[`${TRACK}:${pad.id}`]
    expect(flatKeyEvents?.length).toBe(1)
    expect(flatKeyEvents![0].instrumentId).toBe(`${TRACK}:${pad.id}`)
    // No prefixed key polluted the store.
    expect(
      Object.keys(usePerformanceStore.getState().trackEvents).every((k) => !k.includes('_b')),
    ).toBe(true)
  })

  it('omitting branchPath entirely is identical to passing "" (the B4 call site)', () => {
    useInstrumentsStore.getState().addRack(TRACK)
    const pad = useInstrumentsStore.getState().racks[TRACK].pads[0]
    usePerformanceStore.getState().triggerRackPad(TRACK, pad.id, FRAME)
    const a = usePerformanceStore.getState().trackEvents[`${TRACK}:${pad.id}`]

    usePerformanceStore.setState({ trackEvents: {} })
    usePerformanceStore.getState().triggerRackPad(TRACK, pad.id, FRAME, undefined, null, '')
    const b = usePerformanceStore.getState().trackEvents[`${TRACK}:${pad.id}`]

    // Same key, same instrumentId — the only field that differs is the monotonic
    // eventIndex (a session counter), so compare the load-bearing fields.
    expect(a?.length).toBe(1)
    expect(b?.length).toBe(1)
    expect(a![0].instrumentId).toBe(b![0].instrumentId)
    expect(a![0].kind).toBe(b![0].kind)
    expect(a![0].frameIndex).toBe(b![0].frameIndex)
  })

  it('nested choke siblings share the branch prefix (choke key path-prefixed)', () => {
    const { branchPadId, branchPath } = makeNestedRack()
    // Add a 2nd child at the nested level and put both children in choke group 1.
    useInstrumentsStore.getState().addRackPadAt(TRACK, [branchPadId])
    const branch = useInstrumentsStore.getState().racks[TRACK].pads[0].branch!
    const c0 = branch.pads[0].id
    const c1 = branch.pads[1].id
    useInstrumentsStore.getState().setRackPadChokeGroupAt(TRACK, [branchPadId], c0, 1)
    useInstrumentsStore.getState().setRackPadChokeGroupAt(TRACK, [branchPadId], c1, 1)

    // Trigger c0 with sibling c1 in the same group, at the nested branch path.
    usePerformanceStore.getState().triggerRackPad(TRACK, c0, FRAME, [c1], 1, branchPath)

    // The triggered pad's event AND the sibling's choke event are PATH-PREFIXED.
    const trigKey = `${TRACK}:${branchPath}_${c0}`
    const chokeKey = `${TRACK}:${branchPath}_${c1}`
    expect(usePerformanceStore.getState().trackEvents[trigKey]?.length).toBe(1)
    const choke = usePerformanceStore.getState().trackEvents[chokeKey]
    expect(choke?.length).toBe(1)
    expect(choke![0].kind).toBe('choke')
    expect(choke![0].instrumentId).toBe(chokeKey)
    // The unprefixed (flat) sibling key is NOT written.
    expect(usePerformanceStore.getState().trackEvents[`${TRACK}:${c1}`]).toBeUndefined()
  })
})
