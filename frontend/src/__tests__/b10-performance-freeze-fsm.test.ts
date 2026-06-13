/**
 * B10.1 — Performance-track Freeze ↔ voice state machine tests.
 *
 * The MOST bug-prone packet of the campaign ("the attack-ramp/isActive bug
 * class"). The FSM has THREE non-negotiable requirements, each with a gate here:
 *
 *  Gate 1 (Regression): the FSM never touches the effect-chain freeze store.
 *  Gate 2 (Mid-freeze trigger → QUEUED, THE spec gate): a trigger arriving during
 *          FREEZING is queued (NOT applied, NOT baked), then applied on drain.
 *  Gate 3 (Drain-by-frameIndex): two triggers queued during FREEZING drain in
 *          frameIndex order regardless of enqueue / promise timing.
 *  Gate 4 (Freeze-FAILURE branch): bake error OR user cancel → IDLE, voices NOT
 *          released, drain vs PRE-freeze state.
 *  Gate 5 (Double-bake guard): the bake snapshot EXCLUDES a queued-but-unapplied
 *          voice — neither baked into the freeze nor lost.
 *
 * The bake is injected via `setBakeFn` so we control success / failure / timing
 * deterministically (a deferred promise we resolve/reject by hand).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock window.entropic before any store imports (mirrors epic03-freeze test).
const mockSendCommand = vi.fn()
;(globalThis as any).window = {
  entropic: {
    sendCommand: mockSendCommand,
    onEngineStatus: () => {},
    selectFile: async () => null,
    selectSavePath: async () => '/out.mp4',
    onExportProgress: () => () => {},
  },
}

import { usePerformanceFreezeStore } from '../renderer/stores/performanceFreeze'
import type { BakeSnapshot } from '../renderer/stores/performanceFreeze'
import { usePerformanceStore } from '../renderer/stores/performance'
import { useFreezeStore } from '../renderer/stores/freeze'
import type { TriggerEvent } from '../renderer/components/instruments/voiceFSM'

// ─── helpers ────────────────────────────────────────────────────────────────

const TRACK = 'perf-track-1'

function mkEvent(frameIndex: number, eventIndex: number, instrumentId = TRACK): TriggerEvent {
  return {
    frameIndex,
    eventIndex,
    note: 60,
    velocity: 127,
    kind: 'trigger',
    instrumentId,
  }
}

/** A deferred promise we resolve / reject by hand to drive bake timing. */
function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function resetAll() {
  usePerformanceFreezeStore.getState().reset()
  usePerformanceStore.getState().panicAll() // clears trackEvents + padStates
  useFreezeStore.getState().reset()
  mockSendCommand.mockReset()
}

// ─── Gate 1: Regression — FSM is decoupled from the effect-chain freeze ───────

describe('Gate 1: regression — effect-chain freeze store untouched', () => {
  beforeEach(resetAll)

  it('[regression] freezePerformanceTrack does not change freeze.ts operationState or frozenPrefixes', async () => {
    usePerformanceFreezeStore.getState().setBakeFn(async () => ({ clipId: 'c1' }))
    expect(useFreezeStore.getState().operationState).toBe('idle')

    await usePerformanceFreezeStore.getState().freezePerformanceTrack(TRACK)

    // The effect-chain freeze store is entirely unaffected.
    expect(useFreezeStore.getState().operationState).toBe('idle')
    expect(useFreezeStore.getState().frozenPrefixes).toEqual({})
    // No IPC was sent (the bake is stubbed/injected, not the flatten cmd here).
    expect(mockSendCommand).not.toHaveBeenCalled()
  })

  it('[regression] effect-chain freezePrefix still works alongside a perf freeze', async () => {
    usePerformanceFreezeStore.getState().setBakeFn(async () => ({ clipId: 'c1' }))
    mockSendCommand.mockResolvedValueOnce({ ok: true, cache_id: 'cache-x' })
    await useFreezeStore.getState().freezePrefix('V1', 0, '/v.mp4', [], 42, 100, [1920, 1080])
    expect(useFreezeStore.getState().isFrozen('V1', 0)).toBe(true)

    await usePerformanceFreezeStore.getState().freezePerformanceTrack(TRACK)
    // Effect-chain freeze still intact after a perf freeze.
    expect(useFreezeStore.getState().isFrozen('V1', 0)).toBe(true)
  })
})

// ─── Gate 2: Mid-freeze trigger → QUEUED (THE spec gate) ──────────────────────

describe('Gate 2: mid-freeze trigger → QUEUED (not orphaned, not baked)', () => {
  beforeEach(resetAll)

  it('[mid-freeze-queued] FAIL-BEFORE — without queueing, a mid-freeze trigger would be applied/lost', () => {
    // Demonstrates the bug class: with no FSM, a trigger during FREEZING either
    // lands in the live store (baked into the freeze) or is dropped. enqueueTrigger
    // returns FALSE when the track is NOT freezing → caller applies immediately.
    const enqueued = usePerformanceFreezeStore.getState().enqueueTrigger(TRACK, mkEvent(10, 1))
    expect(enqueued).toBe(false) // idle → not queued → would be applied live
  })

  it('[mid-freeze-queued] PASS-AFTER — during FREEZING the trigger is queued (NOT in padStates/trackEvents), drained on resolve', async () => {
    const d = deferred<{ clipId: string }>()
    usePerformanceFreezeStore.getState().setBakeFn(() => d.promise)

    // Begin the freeze (do NOT await — it's pending on the deferred bake).
    const freezePromise = usePerformanceFreezeStore.getState().freezePerformanceTrack(TRACK)
    expect(usePerformanceFreezeStore.getState().isFreezing(TRACK)).toBe(true)

    // A trigger arrives mid-freeze → must be QUEUED, not applied.
    const ev = mkEvent(25, 1)
    const enqueued = usePerformanceFreezeStore.getState().enqueueTrigger(TRACK, ev)
    expect(enqueued).toBe(true)

    // DURING FREEZING: the trigger is in the queue, NOT in the live store.
    expect(usePerformanceFreezeStore.getState().queue[TRACK]).toHaveLength(1)
    expect(usePerformanceStore.getState().trackEvents[TRACK]).toBeUndefined()

    // Resolve the bake → FROZEN, queue drains.
    d.resolve({ clipId: 'baked-1' })
    const finalState = await freezePromise
    expect(finalState).toBe('frozen')

    // AFTER drain: the queued trigger is applied at ITS frameIndex.
    const applied = usePerformanceStore.getState().trackEvents[TRACK]
    expect(applied).toHaveLength(1)
    expect(applied![0].frameIndex).toBe(25)
    expect(applied![0].eventIndex).toBe(1)
    // Queue is cleared.
    expect(usePerformanceFreezeStore.getState().queue[TRACK]).toBeUndefined()
  })
})

// ─── Gate 3: Drain-by-frameIndex (determinism) ────────────────────────────────

describe('Gate 3: drain by frameIndex, NOT enqueue / promise time', () => {
  beforeEach(resetAll)

  it('[drain-by-frameindex] two triggers enqueued out of frame order drain in frameIndex order', async () => {
    const d = deferred<{ clipId: string }>()
    usePerformanceFreezeStore.getState().setBakeFn(() => d.promise)

    const freezePromise = usePerformanceFreezeStore.getState().freezePerformanceTrack(TRACK)

    // Enqueue HIGHER frame FIRST, LOWER frame SECOND — enqueue order is the
    // OPPOSITE of frame order. Drain must sort by frameIndex regardless.
    usePerformanceFreezeStore.getState().enqueueTrigger(TRACK, mkEvent(90, 5))
    usePerformanceFreezeStore.getState().enqueueTrigger(TRACK, mkEvent(30, 6))

    d.resolve({ clipId: 'baked' })
    await freezePromise

    const applied = usePerformanceStore.getState().trackEvents[TRACK]!
    // Drained in FRAME order [30, 90] — NOT enqueue order [90, 30].
    expect(applied.map((e) => e.frameIndex)).toEqual([30, 90])
  })

  it('[drain-by-frameindex] equal frames tie-break by eventIndex, not enqueue order', async () => {
    const d = deferred<{ clipId: string }>()
    usePerformanceFreezeStore.getState().setBakeFn(() => d.promise)
    const freezePromise = usePerformanceFreezeStore.getState().freezePerformanceTrack(TRACK)

    // Same frame, eventIndex 8 then 3 — drain must order by eventIndex [3, 8].
    usePerformanceFreezeStore.getState().enqueueTrigger(TRACK, mkEvent(50, 8))
    usePerformanceFreezeStore.getState().enqueueTrigger(TRACK, mkEvent(50, 3))

    d.resolve({ clipId: 'baked' })
    await freezePromise

    const applied = usePerformanceStore.getState().trackEvents[TRACK]!
    expect(applied.map((e) => e.eventIndex)).toEqual([3, 8])
  })

  it('[drain-by-frameindex] byte-identical to applying directly at those frames', async () => {
    // Apply two events DIRECTLY (no freeze) to build the expected stream.
    usePerformanceStore.setState({ trackEvents: {} })
    const e1 = mkEvent(30, 6)
    const e2 = mkEvent(90, 5)
    usePerformanceStore.setState({ trackEvents: { [TRACK]: [e1, e2] } })
    const expected = usePerformanceStore.getState().trackEvents[TRACK]
    resetAll()

    // Now reach the SAME stream via the FREEZING queue/drain path.
    const d = deferred<{ clipId: string }>()
    usePerformanceFreezeStore.getState().setBakeFn(() => d.promise)
    const freezePromise = usePerformanceFreezeStore.getState().freezePerformanceTrack(TRACK)
    usePerformanceFreezeStore.getState().enqueueTrigger(TRACK, mkEvent(90, 5))
    usePerformanceFreezeStore.getState().enqueueTrigger(TRACK, mkEvent(30, 6))
    d.resolve({ clipId: 'baked' })
    await freezePromise

    const drained = usePerformanceStore.getState().trackEvents[TRACK]
    expect(drained).toEqual(expected)
  })
})

// ─── Gate 4: Freeze-FAILURE branch (error + cancel) ───────────────────────────

describe('Gate 4: freeze-FAILURE branch — error/cancel → IDLE, voices NOT released, drain vs PRE-freeze', () => {
  beforeEach(resetAll)

  it('[failure-branch] bake error → IDLE, pre-freeze voices intact, queue drains vs PRE-freeze', async () => {
    // PRE-freeze state: one live voice on the track.
    const live = mkEvent(5, 100)
    usePerformanceStore.setState({ trackEvents: { [TRACK]: [live] } })

    const d = deferred<{ clipId: string }>()
    usePerformanceFreezeStore.getState().setBakeFn(() => d.promise)
    const freezePromise = usePerformanceFreezeStore.getState().freezePerformanceTrack(TRACK)

    // A trigger arrives mid-freeze → queued.
    usePerformanceFreezeStore.getState().enqueueTrigger(TRACK, mkEvent(40, 200))

    // The bake REJECTS (render error).
    d.reject(new Error('bake failed'))
    const finalState = await freezePromise

    // FSM returned to IDLE (failure branch).
    expect(finalState).toBe('idle')
    expect(usePerformanceFreezeStore.getState().getState(TRACK)).toBe('idle')

    const events = usePerformanceStore.getState().trackEvents[TRACK]!
    // Voices NOT released — the PRE-freeze live voice survives...
    expect(events.some((e) => e.eventIndex === 100)).toBe(true)
    // ...AND the queued trigger drained against that PRE-freeze state (appended).
    expect(events.some((e) => e.eventIndex === 200 && e.frameIndex === 40)).toBe(true)
    // No clip recorded on failure.
    expect(usePerformanceFreezeStore.getState().frozenClips[TRACK]).toBeUndefined()
  })

  it('[failure-branch] user cancel → IDLE, voices NOT released, even though bake resolves OK', async () => {
    const live = mkEvent(5, 100)
    usePerformanceStore.setState({ trackEvents: { [TRACK]: [live] } })

    const d = deferred<{ clipId: string }>()
    usePerformanceFreezeStore.getState().setBakeFn(() => d.promise)
    const freezePromise = usePerformanceFreezeStore.getState().freezePerformanceTrack(TRACK)

    usePerformanceFreezeStore.getState().enqueueTrigger(TRACK, mkEvent(40, 200))
    // User cancels mid-freeze.
    usePerformanceFreezeStore.getState().cancelFreeze(TRACK)
    // The bake RESOLVES OK — but cancel forces the failure branch.
    d.resolve({ clipId: 'baked-but-cancelled' })
    const finalState = await freezePromise

    expect(finalState).toBe('idle')
    const events = usePerformanceStore.getState().trackEvents[TRACK]!
    // Voices NOT released (cancel = no slots freed).
    expect(events.some((e) => e.eventIndex === 100)).toBe(true)
    // Queue drained vs PRE-freeze.
    expect(events.some((e) => e.eventIndex === 200)).toBe(true)
    expect(usePerformanceFreezeStore.getState().frozenClips[TRACK]).toBeUndefined()
  })

  it('[failure-branch] SUCCESS contrast — voices ARE released on a clean bake', async () => {
    const live = mkEvent(5, 100)
    usePerformanceStore.setState({ trackEvents: { [TRACK]: [live] } })
    usePerformanceFreezeStore.getState().setBakeFn(async () => ({ clipId: 'ok' }))

    const finalState = await usePerformanceFreezeStore.getState().freezePerformanceTrack(TRACK)
    expect(finalState).toBe('frozen')
    // Voices RELEASED — the pre-freeze live voice is gone (slots freed).
    expect(usePerformanceStore.getState().trackEvents[TRACK]).toBeUndefined()
    expect(usePerformanceFreezeStore.getState().frozenClips[TRACK]).toBe('ok')
  })
})

// ─── Gate 5: Double-bake guard ────────────────────────────────────────────────

describe('Gate 5: double-bake guard — bake snapshot excludes queued voices', () => {
  beforeEach(resetAll)

  it('[double-bake-guard] the bake snapshot excludes a queued-but-unapplied voice', async () => {
    // PRE-freeze: one live voice → this SHOULD be in the bake snapshot.
    const live = mkEvent(5, 100)
    usePerformanceStore.setState({ trackEvents: { [TRACK]: [live] } })

    let capturedSnapshot: BakeSnapshot | null = null
    const d = deferred<{ clipId: string }>()
    usePerformanceFreezeStore.getState().setBakeFn((snap) => {
      capturedSnapshot = snap
      return d.promise
    })

    const freezePromise = usePerformanceFreezeStore.getState().freezePerformanceTrack(TRACK)

    // A trigger arrives mid-freeze → queued (must NOT enter the bake snapshot).
    usePerformanceFreezeStore.getState().enqueueTrigger(TRACK, mkEvent(77, 999))

    d.resolve({ clipId: 'baked' })
    await freezePromise

    // The snapshot captured ONLY the pre-freeze voice (eventIndex 100), NOT the
    // queued one (eventIndex 999) — double-bake guard.
    expect(capturedSnapshot).not.toBeNull()
    expect(capturedSnapshot!.events.map((e) => e.eventIndex)).toEqual([100])
    expect(capturedSnapshot!.events.some((e) => e.eventIndex === 999)).toBe(false)

    // AND the queued voice was NOT lost — it drained after the bake (applied to
    // the live store at its frameIndex). Voices were released on success, so the
    // ONLY event left on the track is the drained queued one.
    const applied = usePerformanceStore.getState().trackEvents[TRACK]!
    expect(applied.map((e) => e.eventIndex)).toEqual([999])
    expect(applied[0].frameIndex).toBe(77)
  })
})
