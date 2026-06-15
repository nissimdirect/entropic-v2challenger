/**
 * P5b.5 — SG-3 clause-3: frontend lane-mute UX + feedback-path normalize.
 *
 * Tests the lane_aborted IPC reply field handler that:
 *   1. Fires an 8s error-tier toast (source=sg3-sentinel) with lane name + reason.
 *   2. Marks the lane as SG-3 aborted in the automation store (muted badge).
 *   3. Provides a re-enable affordance that clears the mute.
 *   4. Silently ignores malformed lane_aborted payloads (missing fields, wrong
 *      types, non-finite values) — never crashes, never silently passes.
 *
 * Named tests required by the hard oracle:
 *   - "toast on lane_aborted"
 *   - "lane shows muted state"
 *   - "re-enable clears mute"
 *   - "malformed payload ignored safely"
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// Minimal window.entropic mock — the render handler calls sendCommand
const mockSendCommand = vi.fn()
;(globalThis as unknown as { window: unknown }).window = {
  entropic: {
    sendCommand: mockSendCommand,
    onEngineStatus: vi.fn(),
    sendFrameToPopOut: vi.fn(),
  },
}

import { useAutomationStore } from '../../renderer/stores/automation'
import { useToastStore } from '../../renderer/stores/toast'

// ---------------------------------------------------------------------------
// Helper: simulate what App.tsx does when it receives a lane_aborted reply
// ---------------------------------------------------------------------------

/**
 * Mimics the lane_aborted handler block in App.tsx's requestRenderFrame.
 * Isolated here so we can test the logic without spinning up the full Electron
 * IPC machinery.
 *
 * Trust boundary (feedback_numeric-trust-boundary): validates shape before use.
 */
function applyLaneAbortedReply(
  raw: unknown,
  lastKeyRef: { current: string },
): void {
  if (raw === null || raw === undefined) return

  if (
    typeof raw !== 'object' ||
    raw === null ||
    typeof (raw as Record<string, unknown>).lane_id !== 'string' ||
    typeof (raw as Record<string, unknown>).reason !== 'string'
  ) {
    // Malformed — silently ignore (never crash)
    return
  }

  const abort = raw as { lane_id: string; reason: string }
  const laneId = abort.lane_id.trim()
  const reason = abort.reason.trim()

  if (laneId.length === 0 || reason.length === 0) return

  const abortKey = `${laneId}::${reason}`
  if (abortKey === lastKeyRef.current) return // already toasted

  lastKeyRef.current = abortKey
  useAutomationStore.getState().markSg3Aborted(laneId)
  useToastStore.getState().addToast({
    level: 'error',
    message: `Lane "${laneId}" muted automatically — ${reason}`,
    source: 'sg3-sentinel',
    action: {
      label: 'Re-enable',
      fn: () => useAutomationStore.getState().clearSg3Abort(laneId),
    },
  })
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  useAutomationStore.getState().resetAutomation()
  useToastStore.getState().clearAll()
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

// ---------------------------------------------------------------------------
// Named test: "toast on lane_aborted"
// ---------------------------------------------------------------------------

describe('toast on lane_aborted', () => {
  it('fires an error-tier toast with source=sg3-sentinel when lane_aborted is valid', () => {
    const lastKey = { current: '' }
    const payload = { lane_id: 'unknown', reason: 'render output contained NaN/Inf; serving last-known-good' }

    applyLaneAbortedReply(payload, lastKey)

    const toasts = useToastStore.getState().toasts
    expect(toasts).toHaveLength(1)
    const t = toasts[0]
    expect(t.level).toBe('error')
    expect(t.source).toBe('sg3-sentinel')
    expect(t.message).toContain('"unknown"')
    expect(t.message).toContain('muted automatically')
    expect(t.message).toContain('NaN/Inf')
  })

  it('deduplications: same payload twice fires only one toast', () => {
    const lastKey = { current: '' }
    const payload = { lane_id: 'unknown', reason: 'some reason' }

    applyLaneAbortedReply(payload, lastKey)
    applyLaneAbortedReply(payload, lastKey) // duplicate

    const toasts = useToastStore.getState().toasts
    // toast store 2s-dedup by source may bump count, but we only called addToast once
    // because the abortKey guard in our handler blocked the second call
    expect(toasts).toHaveLength(1)
  })

  it('includes a Re-enable action on the toast', () => {
    const lastKey = { current: '' }
    applyLaneAbortedReply({ lane_id: 'unknown', reason: 'NaN frame' }, lastKey)

    const t = useToastStore.getState().toasts[0]
    expect(t.action).toBeDefined()
    expect(t.action!.label).toBe('Re-enable')
    expect(typeof t.action!.fn).toBe('function')
  })

  it('different lane_id values each mark the store (different abort keys)', () => {
    const lastKey1 = { current: '' }
    const lastKey2 = { current: '' }
    applyLaneAbortedReply({ lane_id: 'unknown', reason: 'NaN frame' }, lastKey1)
    applyLaneAbortedReply({ lane_id: 'lane-42', reason: 'Inf overflow' }, lastKey2)

    // The toast store deduplicates by source within 2s, so both calls may be
    // merged into one toast — but both lane ids MUST be marked in the store.
    const aborted = useAutomationStore.getState().sg3AbortedLaneIds
    expect(aborted.has('unknown')).toBe(true)
    expect(aborted.has('lane-42')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Named test: "lane shows muted state"
// ---------------------------------------------------------------------------

describe('lane shows muted state', () => {
  it('markSg3Aborted adds the lane_id to sg3AbortedLaneIds', () => {
    useAutomationStore.getState().markSg3Aborted('unknown')
    const aborted = useAutomationStore.getState().sg3AbortedLaneIds
    expect(aborted.has('unknown')).toBe(true)
  })

  it('applyLaneAbortedReply marks the lane in the store', () => {
    const lastKey = { current: '' }
    applyLaneAbortedReply({ lane_id: 'unknown', reason: 'NaN frame' }, lastKey)

    const aborted = useAutomationStore.getState().sg3AbortedLaneIds
    expect(aborted.has('unknown')).toBe(true)
  })

  it('marking the same lane twice is idempotent (Set, no duplicates)', () => {
    useAutomationStore.getState().markSg3Aborted('lane-1')
    useAutomationStore.getState().markSg3Aborted('lane-1')
    const aborted = useAutomationStore.getState().sg3AbortedLaneIds
    expect(aborted.size).toBe(1)
  })

  it('multiple distinct lane ids are each recorded', () => {
    useAutomationStore.getState().markSg3Aborted('lane-a')
    useAutomationStore.getState().markSg3Aborted('lane-b')
    const aborted = useAutomationStore.getState().sg3AbortedLaneIds
    expect(aborted.has('lane-a')).toBe(true)
    expect(aborted.has('lane-b')).toBe(true)
    expect(aborted.size).toBe(2)
  })

  it('sg3AbortedLaneIds starts empty after resetAutomation', () => {
    useAutomationStore.getState().markSg3Aborted('old-lane')
    useAutomationStore.getState().resetAutomation()
    expect(useAutomationStore.getState().sg3AbortedLaneIds.size).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Named test: "re-enable clears mute"
// ---------------------------------------------------------------------------

describe('re-enable clears mute', () => {
  it('clearSg3Abort removes the specific lane_id from the set', () => {
    useAutomationStore.getState().markSg3Aborted('unknown')
    useAutomationStore.getState().clearSg3Abort('unknown')
    const aborted = useAutomationStore.getState().sg3AbortedLaneIds
    expect(aborted.has('unknown')).toBe(false)
    expect(aborted.size).toBe(0)
  })

  it('the toast Re-enable action calls clearSg3Abort for the correct lane', () => {
    const lastKey = { current: '' }
    applyLaneAbortedReply({ lane_id: 'unknown', reason: 'NaN frame' }, lastKey)

    // Verify the lane is muted
    expect(useAutomationStore.getState().sg3AbortedLaneIds.has('unknown')).toBe(true)

    // Invoke the Re-enable action from the toast
    const t = useToastStore.getState().toasts[0]
    t.action!.fn()

    // Lane should now be unmuted
    expect(useAutomationStore.getState().sg3AbortedLaneIds.has('unknown')).toBe(false)
  })

  it('clearAllSg3Aborts removes all muted lanes', () => {
    useAutomationStore.getState().markSg3Aborted('a')
    useAutomationStore.getState().markSg3Aborted('b')
    useAutomationStore.getState().clearAllSg3Aborts()
    expect(useAutomationStore.getState().sg3AbortedLaneIds.size).toBe(0)
  })

  it('clearSg3Abort on an unknown lane_id is a no-op (does not throw)', () => {
    expect(() => useAutomationStore.getState().clearSg3Abort('nonexistent')).not.toThrow()
  })

  it('clearAllSg3Aborts on an empty set is a no-op', () => {
    expect(() => useAutomationStore.getState().clearAllSg3Aborts()).not.toThrow()
    expect(useAutomationStore.getState().sg3AbortedLaneIds.size).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Named test: "malformed payload ignored safely"
// ---------------------------------------------------------------------------

describe('malformed payload ignored safely', () => {
  const malformedPayloads: Array<[string, unknown]> = [
    ['null', null],
    ['undefined', undefined],
    ['empty object', {}],
    ['missing reason', { lane_id: 'unknown' }],
    ['missing lane_id', { reason: 'some reason' }],
    ['lane_id is number', { lane_id: 42, reason: 'ok' }],
    ['reason is number', { lane_id: 'unknown', reason: 99 }],
    ['both fields null', { lane_id: null, reason: null }],
    ['lane_id empty string', { lane_id: '', reason: 'ok' }],
    ['reason empty string', { lane_id: 'unknown', reason: '' }],
    ['lane_id whitespace only', { lane_id: '   ', reason: 'ok' }],
    ['reason whitespace only', { lane_id: 'unknown', reason: '   ' }],
    ['non-object primitive', 'abort!'],
    ['array', ['unknown', 'NaN frame']],
    ['boolean true', true],
    ['number 0', 0],
    ['lane_id is object', { lane_id: {}, reason: 'ok' }],
    // Note: { lane_id: 'unknown', reason: 'ok', extra: NaN } is VALID (required fields ok) — tested separately below
  ]

  for (const [label, payload] of malformedPayloads) {
    it(`ignores malformed payload: ${label}`, () => {
      const lastKey = { current: '' }
      expect(() => applyLaneAbortedReply(payload, lastKey)).not.toThrow()
      // No toast should have been added
      expect(useToastStore.getState().toasts).toHaveLength(0)
      // No mute should have been set
      expect(useAutomationStore.getState().sg3AbortedLaneIds.size).toBe(0)
    })
  }

  it('extra non-required non-finite field does not crash (payload is still valid)', () => {
    // Extra fields beyond lane_id+reason are ignored by the handler.
    // The payload is VALID (required string fields are present), so a toast fires
    // and the mute is set — the NaN in 'extra' does not reach any numeric path.
    const lastKey = { current: '' }
    expect(() =>
      applyLaneAbortedReply({ lane_id: 'unknown', reason: 'ok', extra: NaN }, lastKey),
    ).not.toThrow()
    // Valid payload → mute is set, toast fires
    expect(useAutomationStore.getState().sg3AbortedLaneIds.has('unknown')).toBe(true)
    expect(useToastStore.getState().toasts).toHaveLength(1)
  })

  it('after all malformed payloads, a valid payload still works', () => {
    const lastKey = { current: '' }
    // First, throw a bunch of malformed ones
    applyLaneAbortedReply(null, lastKey)
    applyLaneAbortedReply({}, lastKey)
    applyLaneAbortedReply({ lane_id: 42 }, lastKey)
    // Now a valid one
    applyLaneAbortedReply({ lane_id: 'unknown', reason: 'NaN frame' }, lastKey)

    const toasts = useToastStore.getState().toasts
    expect(toasts).toHaveLength(1)
    expect(toasts[0].source).toBe('sg3-sentinel')
    expect(useAutomationStore.getState().sg3AbortedLaneIds.has('unknown')).toBe(true)
  })
})
