/**
 * fix/nested-pad-event-cleanup — HARD ORACLE for clearRackPadEvents path-awareness.
 *
 * Bug: `clearRackPadEvents(trackId, padId)` was building the key as the BARE
 * `${trackId}:${padId}`, but a NESTED branch pad's events are stored under the
 * PATH-PREFIXED key `${trackId}:${branchPath}_${padId}` (written by triggerRackPad,
 * keyed via padEventKey). So deleting a nested pad cleared the wrong key → the
 * path-prefixed events were ORPHANED (left in trackEvents forever).
 *
 * Three gates proven here:
 *
 * GATE 1 — FLAT BYTE-IDENTICAL (regression): clearRackPadEvents(trackId, padId)
 *   with no branchPath (or '') clears ${trackId}:${padId} exactly as before.
 *
 * GATE 2 — NESTED CLEANUP (HARD ORACLE):
 *   FAIL-BEFORE: bare key cleared, nested key ORPHANED (bug).
 *   PASS-AFTER:  nested key removed from trackEvents; bare key (if any) untouched.
 *
 * GATE 3 — CALLER WIRING: onPadDelete while rackEditPath non-empty → clearRackPadEvents
 *   is called with the correct branchPath (mirrors RackDevice.onPadDelete).
 *
 * Uses the REAL stores + the REAL padEventKey / rackEditPathToBranchPath.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  rackEditPathToBranchPath,
} from '../../../renderer/components/instruments/buildRackLayers'
import { useInstrumentsStore } from '../../../renderer/stores/instruments'
import { usePerformanceStore } from '../../../renderer/stores/performance'

const TRACK = 'del-test-track'
const FRAME = 0

beforeEach(() => {
  useInstrumentsStore.setState({ instruments: {}, racks: {} })
  usePerformanceStore.setState({ trackEvents: {} })
})

/** Build a rack with pad 0 converted to a branch (one sourced child). */
function makeNestedRack(): {
  branchPadId: string
  childPadId: string
  branchPath: string
} {
  useInstrumentsStore.getState().addRack(TRACK)
  const top = useInstrumentsStore.getState().racks[TRACK]
  const branchPadId = top.pads[0].id
  const ok = useInstrumentsStore.getState().convertPadToBranch(TRACK, [], branchPadId)
  expect(ok).toBe(true)
  const branch = useInstrumentsStore.getState().racks[TRACK].pads[0].branch!
  const childPadId = branch.pads[0].id
  const rack = useInstrumentsStore.getState().racks[TRACK]
  const branchPath = rackEditPathToBranchPath(rack, [branchPadId])!
  expect(branchPath).toBe('b0')
  return { branchPadId, childPadId, branchPath }
}

// ---------------------------------------------------------------------------
// GATE 1 — FLAT BYTE-IDENTICAL (regression, no branchPath / empty branchPath)
// ---------------------------------------------------------------------------
describe('clearRackPadEvents — GATE 1: flat pad delete (byte-identical to B4)', () => {
  it('no branchPath arg: clears the bare ${trackId}:${padId} key', () => {
    useInstrumentsStore.getState().addRack(TRACK)
    const pad = useInstrumentsStore.getState().racks[TRACK].pads[0]
    // Write an event under the flat key (as triggerRackPad does with no branchPath).
    usePerformanceStore.getState().triggerRackPad(TRACK, pad.id, FRAME, undefined, null, '')
    const flatKey = `${TRACK}:${pad.id}`
    expect(usePerformanceStore.getState().trackEvents[flatKey]?.length).toBe(1)

    // clearRackPadEvents with no branchPath arg → should clear the bare key.
    usePerformanceStore.getState().clearRackPadEvents(TRACK, pad.id)
    expect(usePerformanceStore.getState().trackEvents[flatKey]).toBeUndefined()
  })

  it('empty string branchPath: clears the bare ${trackId}:${padId} key', () => {
    useInstrumentsStore.getState().addRack(TRACK)
    const pad = useInstrumentsStore.getState().racks[TRACK].pads[0]
    usePerformanceStore.getState().triggerRackPad(TRACK, pad.id, FRAME, undefined, null, '')
    const flatKey = `${TRACK}:${pad.id}`
    expect(usePerformanceStore.getState().trackEvents[flatKey]?.length).toBe(1)

    usePerformanceStore.getState().clearRackPadEvents(TRACK, pad.id, '')
    expect(usePerformanceStore.getState().trackEvents[flatKey]).toBeUndefined()
  })

  it('no-op when flat key is absent (no throw, no re-render)', () => {
    useInstrumentsStore.getState().addRack(TRACK)
    const pad = useInstrumentsStore.getState().racks[TRACK].pads[0]
    // Never triggered — key absent; must not throw.
    expect(() =>
      usePerformanceStore.getState().clearRackPadEvents(TRACK, pad.id),
    ).not.toThrow()
    expect(usePerformanceStore.getState().trackEvents).toEqual({})
  })
})

// ---------------------------------------------------------------------------
// GATE 2 — NESTED CLEANUP HARD ORACLE
// FAIL-BEFORE: bare key cleared, NESTED key ORPHANED (the bug)
// PASS-AFTER:  nested key removed; bare key untouched
// ---------------------------------------------------------------------------
describe('clearRackPadEvents — GATE 2: nested pad delete (path-prefixed key)', () => {
  it('FAIL-BEFORE (demonstrates the old bug): bare-key clear leaves nested key orphaned', () => {
    const { childPadId, branchPath } = makeNestedRack()

    // Trigger the NESTED pad — event lands under path-prefixed key.
    usePerformanceStore.getState().triggerRackPad(TRACK, childPadId, FRAME, undefined, null, branchPath)
    const nestedKey = `${TRACK}:${branchPath}_${childPadId}`
    const bareKey = `${TRACK}:${childPadId}`
    expect(usePerformanceStore.getState().trackEvents[nestedKey]?.length).toBe(1)
    expect(usePerformanceStore.getState().trackEvents[bareKey]).toBeUndefined()

    // OLD (buggy) behavior: clearRackPadEvents with NO branchPath tries to delete
    // the BARE key — which never existed. Nested key is ORPHANED.
    usePerformanceStore.getState().clearRackPadEvents(TRACK, childPadId /* no branchPath */)
    // The nested key is STILL THERE — the bug.
    expect(usePerformanceStore.getState().trackEvents[nestedKey]?.length).toBe(1)
    // The bare key was never there — delete was a no-op.
    expect(usePerformanceStore.getState().trackEvents[bareKey]).toBeUndefined()
  })

  it('PASS-AFTER: clearRackPadEvents WITH branchPath removes the path-prefixed key', () => {
    const { childPadId, branchPath } = makeNestedRack()

    // Trigger the NESTED pad.
    usePerformanceStore.getState().triggerRackPad(TRACK, childPadId, FRAME, undefined, null, branchPath)
    const nestedKey = `${TRACK}:${branchPath}_${childPadId}`
    expect(usePerformanceStore.getState().trackEvents[nestedKey]?.length).toBe(1)

    // FIXED behavior: pass the branchPath → correct prefixed key is cleared.
    usePerformanceStore.getState().clearRackPadEvents(TRACK, childPadId, branchPath)
    expect(usePerformanceStore.getState().trackEvents[nestedKey]).toBeUndefined()
  })

  it('PASS-AFTER: clearing nested key does NOT disturb the bare key (if it existed)', () => {
    const { childPadId, branchPath } = makeNestedRack()

    // Seed BOTH the bare key AND the nested key (simulates two different trigger paths).
    usePerformanceStore.getState().triggerRackPad(TRACK, childPadId, FRAME, undefined, null, '')
    usePerformanceStore.getState().triggerRackPad(TRACK, childPadId, FRAME, undefined, null, branchPath)
    const bareKey = `${TRACK}:${childPadId}`
    const nestedKey = `${TRACK}:${branchPath}_${childPadId}`
    expect(usePerformanceStore.getState().trackEvents[bareKey]?.length).toBe(1)
    expect(usePerformanceStore.getState().trackEvents[nestedKey]?.length).toBe(1)

    // Clear only the nested path — bare key must survive.
    usePerformanceStore.getState().clearRackPadEvents(TRACK, childPadId, branchPath)
    expect(usePerformanceStore.getState().trackEvents[nestedKey]).toBeUndefined()
    expect(usePerformanceStore.getState().trackEvents[bareKey]?.length).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// GATE 3 — CALLER WIRING: mirrors RackDevice.onPadDelete computing branchPath
// ---------------------------------------------------------------------------
describe('clearRackPadEvents — GATE 3: caller wiring (editPath → branchPath → clear)', () => {
  it('rackEditPath non-empty: branchPath derived from editPath clears the nested key', () => {
    const { branchPadId, childPadId, branchPath } = makeNestedRack()

    // Trigger the nested child pad (as if user clicked it inside the branch).
    usePerformanceStore.getState().triggerRackPad(TRACK, childPadId, FRAME, undefined, null, branchPath)
    const nestedKey = `${TRACK}:${branchPath}_${childPadId}`
    expect(usePerformanceStore.getState().trackEvents[nestedKey]?.length).toBe(1)

    // Simulate RackDevice.onPadDelete while editPath = [branchPadId]:
    //   const branchPath = rackEditPathToBranchPath(rack, editPath) ?? ''
    //   clearRackPadEvents(trackId, padId, branchPath)
    const editPath = [branchPadId]
    const rack = useInstrumentsStore.getState().racks[TRACK]
    const callerBranchPath = rackEditPathToBranchPath(rack, editPath) ?? ''
    expect(callerBranchPath).toBe('b0')
    usePerformanceStore.getState().clearRackPadEvents(TRACK, childPadId, callerBranchPath)

    // The nested key must be GONE.
    expect(usePerformanceStore.getState().trackEvents[nestedKey]).toBeUndefined()
  })

  it('rackEditPath empty: branchPath is "" → clears flat key (flat pad regression)', () => {
    useInstrumentsStore.getState().addRack(TRACK)
    const rack = useInstrumentsStore.getState().racks[TRACK]
    const pad = rack.pads[0]
    // Trigger as flat pad.
    usePerformanceStore.getState().triggerRackPad(TRACK, pad.id, FRAME, undefined, null, '')
    const flatKey = `${TRACK}:${pad.id}`
    expect(usePerformanceStore.getState().trackEvents[flatKey]?.length).toBe(1)

    // Caller with empty editPath → branchPath = '' → flat key cleared.
    const editPath: string[] = []
    const callerBranchPath = rackEditPathToBranchPath(rack, editPath) ?? ''
    expect(callerBranchPath).toBe('')
    usePerformanceStore.getState().clearRackPadEvents(TRACK, pad.id, callerBranchPath)
    expect(usePerformanceStore.getState().trackEvents[flatKey]).toBeUndefined()
  })

  it('stale editPath (rackEditPathToBranchPath returns null): falls back to "" → no orphan', () => {
    useInstrumentsStore.getState().addRack(TRACK)
    const rack = useInstrumentsStore.getState().racks[TRACK]
    const pad = rack.pads[0]
    // Trigger flat.
    usePerformanceStore.getState().triggerRackPad(TRACK, pad.id, FRAME, undefined, null, '')
    const flatKey = `${TRACK}:${pad.id}`
    expect(usePerformanceStore.getState().trackEvents[flatKey]?.length).toBe(1)

    // Stale editPath → rackEditPathToBranchPath returns null → caller uses '' fallback.
    const staleEditPath = ['no-such-pad']
    const callerBranchPath = rackEditPathToBranchPath(rack, staleEditPath) ?? ''
    expect(callerBranchPath).toBe('')
    usePerformanceStore.getState().clearRackPadEvents(TRACK, pad.id, callerBranchPath)
    expect(usePerformanceStore.getState().trackEvents[flatKey]).toBeUndefined()
  })
})
