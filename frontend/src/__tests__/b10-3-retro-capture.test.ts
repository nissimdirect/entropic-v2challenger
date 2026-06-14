/**
 * B10.3 — Retro-capture: rolling event buffer → dump to Performance Track.
 *
 * Four enforced gates:
 *
 *  Gate REGRESSION: existing trigger path (triggerRackPad / triggerPad) writes
 *    trackEvents UNCHANGED — the retro buffer push is purely additive (no change
 *    to the events written or their order in trackEvents).
 *
 *  Gate DETERMINISTIC_REPLAY (hard oracle): play a known sequence of triggers
 *    → land in buffer → captureRetroBuffer → dumped events equal the original
 *    sequence (same frameIndex/eventIndex/note/velocity, sorted ascending).
 *    FAIL-BEFORE: no buffer → track events untouched pre-capture.
 *    PASS-AFTER: dumped events on the track match the original sequence.
 *
 *  Gate EVENTS_ONLY: the buffered/captured events contain NO performance.now()
 *    / timestamp / wall-clock field — only {frameIndex, eventIndex, note,
 *    velocity, kind, instrumentId} (+ optional routing fields). Any forbidden
 *    key in a captured event fails this gate.
 *
 *  Gate BOUNDED_BUFFER: the ring buffer is hard-capped at RETRO_BUFFER_CAP.
 *    A flood of triggers (RETRO_BUFFER_CAP + 100) does NOT grow the buffer
 *    past the cap. Oldest events are dropped (ring semantics).
 */

import { describe, it, expect, beforeEach } from 'vitest'

// Mock window.entropic before any store imports (mirrors b10-1b test).
;(globalThis as any).window = {
  entropic: {
    sendCommand: () => Promise.resolve({}),
    onEngineStatus: () => {},
    selectFile: async () => null,
    selectSavePath: async () => '/out.mp4',
    onExportProgress: () => () => {},
    getAppPath: async () => '',
    mkdirp: async () => {},
  },
}

import {
  usePerformanceStore,
  getRetroBuffer,
  clearRetroBuffer,
  RETRO_BUFFER_CAP,
} from '../renderer/stores/performance'
import type { TriggerEvent } from '../renderer/components/instruments/voiceFSM'

// Forbidden wall-clock / timestamp keys — none of these must appear in a captured event.
const FORBIDDEN_KEYS = [
  'timestamp',
  'wallClock',
  'wallclock',
  'performanceNow',
  'performance_now',
  'ts',
  'time',
]

const TRACK = 'perf-track-b103'
const PAD = 'pad-0'

function resetAll() {
  usePerformanceStore.getState().panicAll()
  clearRetroBuffer()
}

// ─── Gate REGRESSION ────────────────────────────────────────────────────────

describe('Gate REGRESSION — existing trigger path unchanged', () => {
  beforeEach(resetAll)

  it('triggerRackPad still writes trackEvents under the composite key', () => {
    usePerformanceStore.getState().triggerRackPad(TRACK, PAD, 100)
    const key = `${TRACK}:${PAD}`
    const events = usePerformanceStore.getState().trackEvents[key]
    expect(events).toHaveLength(1)
    expect(events[0].frameIndex).toBe(100)
    expect(events[0].kind).toBe('trigger')
    expect(events[0].instrumentId).toBe(key)
  })

  it('triggerRackPad events are not modified by the retro push', () => {
    usePerformanceStore.getState().triggerRackPad(TRACK, PAD, 42)
    const key = `${TRACK}:${PAD}`
    const trackEv = usePerformanceStore.getState().trackEvents[key][0]
    const bufEv = getRetroBuffer()[0]
    // Both must refer to the same event shape (same fields, same values).
    expect(trackEv.frameIndex).toBe(bufEv.frameIndex)
    expect(trackEv.eventIndex).toBe(bufEv.eventIndex)
    expect(trackEv.note).toBe(bufEv.note)
    expect(trackEv.velocity).toBe(bufEv.velocity)
    expect(trackEv.kind).toBe(bufEv.kind)
    expect(trackEv.instrumentId).toBe(bufEv.instrumentId)
  })

  it('multiple triggerRackPad calls append in order to trackEvents', () => {
    usePerformanceStore.getState().triggerRackPad(TRACK, PAD, 10)
    usePerformanceStore.getState().triggerRackPad(TRACK, PAD, 20)
    usePerformanceStore.getState().triggerRackPad(TRACK, PAD, 30)
    const key = `${TRACK}:${PAD}`
    const events = usePerformanceStore.getState().trackEvents[key]
    expect(events).toHaveLength(3)
    expect(events.map((e: TriggerEvent) => e.frameIndex)).toEqual([10, 20, 30])
  })

  it('triggerPad still writes trackEvents to the track key', () => {
    usePerformanceStore.getState().triggerPad('pad-0', 50, TRACK)
    const events = usePerformanceStore.getState().trackEvents[TRACK]
    expect(events).toHaveLength(1)
    expect(events[0].frameIndex).toBe(50)
  })
})

// ─── Gate DETERMINISTIC_REPLAY ───────────────────────────────────────────────

describe('Gate DETERMINISTIC_REPLAY — capture → events on track == original sequence', () => {
  beforeEach(resetAll)

  it('FAIL-BEFORE: captureRetroBuffer with empty buffer writes nothing', () => {
    // Buffer is empty — capture should be a no-op.
    const count = usePerformanceStore.getState().captureRetroBuffer(TRACK)
    expect(count).toBe(0)
    expect(usePerformanceStore.getState().trackEvents[TRACK]).toBeUndefined()
  })

  it('PASS-AFTER: captured events on the track equal the buffer sequence', () => {
    // Play 3 triggers at known frameIndices.
    usePerformanceStore.getState().triggerRackPad(TRACK, PAD, 10)
    usePerformanceStore.getState().triggerRackPad(TRACK, PAD, 20)
    usePerformanceStore.getState().triggerRackPad(TRACK, PAD, 30)

    const originalBuffer = getRetroBuffer()
    expect(originalBuffer).toHaveLength(3)

    // Clear the track events to simulate a fresh track (not already recorded).
    usePerformanceStore.getState().panicAll()
    clearRetroBuffer()
    // Re-seed buffer without modifying track.
    for (const ev of originalBuffer) {
      // Simulate buffer having these events (use triggerRackPad which also writes track).
      // Instead, we push them directly via a fresh trigger sequence.
    }

    // Cleaner approach: fresh state, trigger into buffer, capture onto a DIFFERENT key.
    resetAll()
    usePerformanceStore.getState().triggerRackPad(TRACK, PAD, 100)
    usePerformanceStore.getState().triggerRackPad(TRACK, PAD, 200)
    usePerformanceStore.getState().triggerRackPad(TRACK, PAD, 300)

    const buf = getRetroBuffer()
    const captureTrack = 'capture-target'
    const count = usePerformanceStore.getState().captureRetroBuffer(captureTrack)
    expect(count).toBe(3)

    const captured = usePerformanceStore.getState().trackEvents[captureTrack]
    expect(captured).toHaveLength(3)
    // Events are sorted by [frameIndex, eventIndex].
    expect(captured[0].frameIndex).toBe(100)
    expect(captured[1].frameIndex).toBe(200)
    expect(captured[2].frameIndex).toBe(300)
    // Each field matches the buffer.
    for (let i = 0; i < buf.length; i++) {
      expect(captured[i].frameIndex).toBe(buf[i].frameIndex)
      expect(captured[i].eventIndex).toBe(buf[i].eventIndex)
      expect(captured[i].note).toBe(buf[i].note)
      expect(captured[i].velocity).toBe(buf[i].velocity)
    }
  })

  it('captured events survive edit-after-capture (plain data, not mutable refs)', () => {
    usePerformanceStore.getState().triggerRackPad(TRACK, PAD, 50)
    const captureTrack = 'capture-target-2'
    usePerformanceStore.getState().captureRetroBuffer(captureTrack)

    // Now trigger MORE events on a different pad — captured events must not change.
    const before = usePerformanceStore.getState().trackEvents[captureTrack].map((e: TriggerEvent) => ({ ...e }))
    usePerformanceStore.getState().triggerRackPad(TRACK, 'pad-1', 99)
    const after = usePerformanceStore.getState().trackEvents[captureTrack]

    // Length and content of the captured track are unchanged.
    expect(after).toHaveLength(before.length)
    for (let i = 0; i < before.length; i++) {
      expect(after[i].frameIndex).toBe(before[i].frameIndex)
      expect(after[i].eventIndex).toBe(before[i].eventIndex)
    }
  })

  it('captureRetroBuffer sorts events ascending by [frameIndex, eventIndex]', () => {
    // Trigger out-of-order (simulate scrubbing backward then forward).
    usePerformanceStore.getState().triggerRackPad(TRACK, PAD, 300)
    usePerformanceStore.getState().triggerRackPad(TRACK, PAD, 100)
    usePerformanceStore.getState().triggerRackPad(TRACK, PAD, 200)

    const captureTrack = 'sorted-target'
    usePerformanceStore.getState().captureRetroBuffer(captureTrack)
    const captured = usePerformanceStore.getState().trackEvents[captureTrack]
    expect(captured[0].frameIndex).toBe(100)
    expect(captured[1].frameIndex).toBe(200)
    expect(captured[2].frameIndex).toBe(300)
  })
})

// ─── Gate EVENTS_ONLY ────────────────────────────────────────────────────────

describe('Gate EVENTS_ONLY — no performance.now() / wall-clock in captured events', () => {
  beforeEach(resetAll)

  it('no forbidden wall-clock keys in retro buffer events', () => {
    usePerformanceStore.getState().triggerRackPad(TRACK, PAD, 42)
    usePerformanceStore.getState().triggerRackPad(TRACK, PAD, 84)
    const buf = getRetroBuffer()
    for (const ev of buf) {
      for (const forbidden of FORBIDDEN_KEYS) {
        expect(Object.keys(ev)).not.toContain(forbidden)
      }
    }
  })

  it('no forbidden wall-clock keys in captured events on the track', () => {
    usePerformanceStore.getState().triggerRackPad(TRACK, PAD, 42)
    const captureTrack = 'events-only-target'
    usePerformanceStore.getState().captureRetroBuffer(captureTrack)
    const captured = usePerformanceStore.getState().trackEvents[captureTrack]
    for (const ev of captured) {
      for (const forbidden of FORBIDDEN_KEYS) {
        expect(Object.keys(ev)).not.toContain(forbidden)
      }
    }
  })

  it('captured events only contain deterministic replay keys', () => {
    usePerformanceStore.getState().triggerRackPad(TRACK, PAD, 10)
    const captureTrack = 'keys-check-target'
    usePerformanceStore.getState().captureRetroBuffer(captureTrack)
    const [ev] = usePerformanceStore.getState().trackEvents[captureTrack]
    // Must have the required deterministic fields.
    expect(ev).toHaveProperty('frameIndex')
    expect(ev).toHaveProperty('eventIndex')
    expect(ev).toHaveProperty('note')
    expect(ev).toHaveProperty('velocity')
    expect(ev).toHaveProperty('kind')
    expect(ev).toHaveProperty('instrumentId')
    // Must NOT have any wall-clock field.
    for (const forbidden of FORBIDDEN_KEYS) {
      expect(ev).not.toHaveProperty(forbidden)
    }
  })
})

// ─── Gate BOUNDED_BUFFER ─────────────────────────────────────────────────────

describe('Gate BOUNDED_BUFFER — flood → buffer ≤ RETRO_BUFFER_CAP', () => {
  beforeEach(resetAll)

  it(`buffer length never exceeds RETRO_BUFFER_CAP (${RETRO_BUFFER_CAP}) after a flood`, () => {
    const FLOOD = RETRO_BUFFER_CAP + 100
    for (let i = 0; i < FLOOD; i++) {
      usePerformanceStore.getState().triggerRackPad(TRACK, PAD, i)
    }
    const buf = getRetroBuffer()
    expect(buf.length).toBeLessThanOrEqual(RETRO_BUFFER_CAP)
    expect(buf.length).toBe(RETRO_BUFFER_CAP) // exactly at cap (ring dropped oldest)
  })

  it('ring semantics: oldest events are dropped when at cap', () => {
    const FLOOD = RETRO_BUFFER_CAP + 50
    for (let i = 0; i < FLOOD; i++) {
      usePerformanceStore.getState().triggerRackPad(TRACK, PAD, i * 10)
    }
    const buf = getRetroBuffer()
    // The OLDEST events (frameIndex 0..490) are gone; newest 512 remain.
    // First event in buffer should be from frame (50 * 10) = 500.
    expect(buf[0].frameIndex).toBe(500)
    expect(buf[buf.length - 1].frameIndex).toBe((FLOOD - 1) * 10)
  })

  it('captureRetroBuffer after flood returns count ≤ RETRO_BUFFER_CAP', () => {
    const FLOOD = RETRO_BUFFER_CAP + 200
    for (let i = 0; i < FLOOD; i++) {
      usePerformanceStore.getState().triggerRackPad(TRACK, PAD, i)
    }
    const captureTrack = 'flood-capture-target'
    const count = usePerformanceStore.getState().captureRetroBuffer(captureTrack)
    expect(count).toBeLessThanOrEqual(RETRO_BUFFER_CAP)
    expect(count).toBe(RETRO_BUFFER_CAP)
  })
})
