import { describe, it, expect, beforeEach } from 'vitest'

// Mock window.entropic before store import (mirrors clip-operations.test.ts)
;(globalThis as any).window = {
  entropic: {
    onEngineStatus: () => {},
    sendCommand: async () => ({ ok: true }),
    selectFile: async () => null,
    selectSavePath: async () => null,
    onExportProgress: () => {},
  },
}

import { useTimelineStore } from '../../../renderer/stores/timeline'
import { useUndoStore } from '../../../renderer/stores/undo'
import type { Clip } from '../../../shared/types'

function makeClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: overrides.id ?? `clip-${Math.random().toString(36).slice(2, 8)}`,
    assetId: overrides.assetId ?? 'asset-1',
    trackId: overrides.trackId ?? '',
    position: overrides.position ?? 0,
    duration: overrides.duration ?? 10,
    inPoint: overrides.inPoint ?? 0,
    outPoint: overrides.outPoint ?? 10,
    speed: overrides.speed ?? 1,
    ...overrides,
  }
}

function clipsOf(trackId: string): Clip[] {
  return useTimelineStore.getState().tracks.find((t) => t.id === trackId)!.clips
}
function byId(trackId: string, id: string): Clip {
  return clipsOf(trackId).find((c) => c.id === id)!
}

describe('T2 — slip + slide edit tools', () => {
  let trackId: string

  beforeEach(() => {
    useTimelineStore.getState().reset()
    useUndoStore.getState().clear()
    useTimelineStore.getState().addTrack('Track 1', '#ff0000')
    trackId = useTimelineStore.getState().tracks[0].id
  })

  // ---------------------------------------------------------------- SLIP ----
  describe('slipClip', () => {
    it('shifts inPoint + outPoint by the delta, leaving position + duration fixed', () => {
      // Clip windows source [2, 7] onto timeline [0, 5]. Room to slip forward.
      const clip = makeClip({ id: 'c1', position: 0, duration: 5, inPoint: 2, outPoint: 7 })
      useTimelineStore.getState().addClip(trackId, clip)

      useTimelineStore.getState().slipClip('c1', 1.5, 20)

      const c = byId(trackId, 'c1')
      expect(c.inPoint).toBeCloseTo(3.5)
      expect(c.outPoint).toBeCloseTo(8.5)
      // Position + timeline duration are byte-identical.
      expect(c.position).toBe(0)
      expect(c.duration).toBe(5)
      // Window width (and therefore duration) preserved.
      expect(c.outPoint - c.inPoint).toBeCloseTo(5)
    })

    it('clamps a backward slip at the source floor (inPoint cannot go below 0)', () => {
      const clip = makeClip({ id: 'c1', position: 0, duration: 5, inPoint: 2, outPoint: 7 })
      useTimelineStore.getState().addClip(trackId, clip)

      // Ask to slip -10 (way past the floor). inPoint can only drop by 2.
      useTimelineStore.getState().slipClip('c1', -10, 20)

      const c = byId(trackId, 'c1')
      expect(c.inPoint).toBeCloseTo(0)
      expect(c.outPoint).toBeCloseTo(5)
      expect(c.duration).toBe(5)
    })

    it('clamps a forward slip at the source ceiling (outPoint cannot exceed sourceLength)', () => {
      const clip = makeClip({ id: 'c1', position: 0, duration: 5, inPoint: 2, outPoint: 7 })
      useTimelineStore.getState().addClip(trackId, clip)

      // sourceLength = 8 → outPoint may only rise by 1.
      useTimelineStore.getState().slipClip('c1', 10, 8)

      const c = byId(trackId, 'c1')
      expect(c.outPoint).toBeCloseTo(8)
      expect(c.inPoint).toBeCloseTo(3)
      expect(c.duration).toBe(5)
    })

    it('is one undo entry and fully reverts on undo', () => {
      const clip = makeClip({ id: 'c1', position: 0, duration: 5, inPoint: 2, outPoint: 7 })
      useTimelineStore.getState().addClip(trackId, clip)
      const before = useUndoStore.getState().past.length

      useTimelineStore.getState().slipClip('c1', 1.5, 20)
      expect(useUndoStore.getState().past.length).toBe(before + 1)

      useUndoStore.getState().undo()
      const c = byId(trackId, 'c1')
      expect(c.inPoint).toBeCloseTo(2)
      expect(c.outPoint).toBeCloseTo(7)
    })

    it('a clamped-to-zero slip is a no-op (no undo entry)', () => {
      // Already at floor AND ceiling: inPoint=0, outPoint=sourceLength.
      const clip = makeClip({ id: 'c1', position: 0, duration: 5, inPoint: 0, outPoint: 5 })
      useTimelineStore.getState().addClip(trackId, clip)
      const before = useUndoStore.getState().past.length

      useTimelineStore.getState().slipClip('c1', -3, 5) // floor blocks it
      expect(useUndoStore.getState().past.length).toBe(before)
    })

    it('ignores a non-finite delta (trust boundary)', () => {
      const clip = makeClip({ id: 'c1', inPoint: 2, outPoint: 7 })
      useTimelineStore.getState().addClip(trackId, clip)

      useTimelineStore.getState().slipClip('c1', Number.NaN, 20)
      const c = byId(trackId, 'c1')
      expect(c.inPoint).toBe(2)
      expect(c.outPoint).toBe(7)
    })
  })

  // --------------------------------------------------------------- SLIDE ----
  describe('slideClip', () => {
    // Three adjacent clips: A[0..4] B[4..9] C[9..14].
    function threeClips() {
      useTimelineStore.getState().addClip(trackId, makeClip({ id: 'A', position: 0, duration: 4, inPoint: 0, outPoint: 4 }))
      useTimelineStore.getState().addClip(trackId, makeClip({ id: 'B', position: 4, duration: 5, inPoint: 0, outPoint: 5 }))
      useTimelineStore.getState().addClip(trackId, makeClip({ id: 'C', position: 9, duration: 5, inPoint: 3, outPoint: 8 }))
    }

    it('moves the clip and adjusts exactly the two neighbors, staying gapless + duration-stable', () => {
      threeClips()
      const durBefore = useTimelineStore.getState().duration

      // Slide B right by 2.
      useTimelineStore.getState().slideClip('B', 2)

      const A = byId(trackId, 'A')
      const B = byId(trackId, 'B')
      const C = byId(trackId, 'C')

      // B moved; its own in/out + duration unchanged.
      expect(B.position).toBeCloseTo(6)
      expect(B.duration).toBe(5)
      expect(B.inPoint).toBe(0)
      expect(B.outPoint).toBe(5)

      // A (prev) extended by 2 to still meet B's new start.
      expect(A.position).toBe(0)
      expect(A.duration).toBeCloseTo(6)
      expect(A.outPoint).toBeCloseTo(6)

      // C (next) shifted right by 2 and shrank by 2, in-point advanced by 2.
      expect(C.position).toBeCloseTo(11)
      expect(C.duration).toBeCloseTo(3)
      expect(C.inPoint).toBeCloseTo(5)
      expect(C.outPoint).toBe(8)

      // Gapless: A end == B start, B end == C start.
      expect(A.position + A.duration).toBeCloseTo(B.position)
      expect(B.position + B.duration).toBeCloseTo(C.position)
      // Total duration stable.
      expect(useTimelineStore.getState().duration).toBeCloseTo(durBefore)
    })

    it('clamps against next-clip inversion (cannot consume more than next.duration)', () => {
      threeClips()
      // Ask to slide B right by 100 — next (C, duration 5) may shrink at most to MIN.
      useTimelineStore.getState().slideClip('B', 100)

      const C = byId(trackId, 'C')
      const B = byId(trackId, 'B')
      expect(C.duration).toBeGreaterThan(0)
      // C shrank to ~MIN (0.01); B advanced by (5 - MIN) = ~4.99.
      expect(B.position).toBeCloseTo(4 + (5 - 0.01), 2)
      // Still gapless + no negative durations.
      expect(byId(trackId, 'A').duration).toBeGreaterThan(0)
    })

    it('clamps against prev-clip inversion (cannot move left past prev shrinking to zero)', () => {
      // C gets deep source headroom (inPoint 10) so the LEFT limit is prev (A)
      // shrinking to MIN, not C's in-point floor.
      useTimelineStore.getState().addClip(trackId, makeClip({ id: 'A', position: 0, duration: 4, inPoint: 0, outPoint: 4 }))
      useTimelineStore.getState().addClip(trackId, makeClip({ id: 'B', position: 4, duration: 5, inPoint: 0, outPoint: 5 }))
      useTimelineStore.getState().addClip(trackId, makeClip({ id: 'C', position: 9, duration: 5, inPoint: 10, outPoint: 15 }))

      // Slide B far left — prev (A, duration 4) may shrink at most to MIN.
      useTimelineStore.getState().slideClip('B', -100)

      const A = byId(trackId, 'A')
      const B = byId(trackId, 'B')
      expect(A.duration).toBeGreaterThan(0)
      expect(A.duration).toBeCloseTo(0.01, 2)
      expect(B.position).toBeCloseTo(0.01, 2)
    })

    it('respects the prev source ceiling when extending right', () => {
      threeClips()
      // prevSourceLength = 5 → A.outPoint (currently 4) may only rise to 5,
      // i.e. delta capped at 1 even though next could absorb more.
      useTimelineStore.getState().slideClip('B', 3, 5)

      const A = byId(trackId, 'A')
      const B = byId(trackId, 'B')
      expect(A.outPoint).toBeCloseTo(5)
      expect(A.duration).toBeCloseTo(5)
      expect(B.position).toBeCloseTo(5)
    })

    it('is a no-op when a neighbor is missing (clip at track edge)', () => {
      // Only A and B, no clip after B.
      useTimelineStore.getState().addClip(trackId, makeClip({ id: 'A', position: 0, duration: 4, inPoint: 0, outPoint: 4 }))
      useTimelineStore.getState().addClip(trackId, makeClip({ id: 'B', position: 4, duration: 5, inPoint: 0, outPoint: 5 }))
      const before = useUndoStore.getState().past.length

      useTimelineStore.getState().slideClip('B', 2)

      expect(useUndoStore.getState().past.length).toBe(before)
      expect(byId(trackId, 'B').position).toBe(4)
    })

    it('is one undo entry and fully reverts on undo', () => {
      threeClips()
      const before = useUndoStore.getState().past.length

      useTimelineStore.getState().slideClip('B', 2)
      expect(useUndoStore.getState().past.length).toBe(before + 1)

      useUndoStore.getState().undo()
      expect(byId(trackId, 'A')).toMatchObject({ position: 0, duration: 4, outPoint: 4 })
      expect(byId(trackId, 'B')).toMatchObject({ position: 4, duration: 5 })
      expect(byId(trackId, 'C')).toMatchObject({ position: 9, duration: 5, inPoint: 3 })
    })

    it('ignores a non-finite delta (trust boundary)', () => {
      threeClips()
      useTimelineStore.getState().slideClip('B', Number.POSITIVE_INFINITY)
      expect(byId(trackId, 'B').position).toBe(4)
    })
  })

  // ------------------------------------------------ select-mode regression --
  describe('select-mode drag is unaffected', () => {
    it('moveClip (the select-tool primitive) still moves position only', () => {
      const clip = makeClip({ id: 'c1', position: 0, duration: 5, inPoint: 2, outPoint: 7 })
      useTimelineStore.getState().addClip(trackId, clip)

      useTimelineStore.getState().moveClip('c1', trackId, 3)

      const c = byId(trackId, 'c1')
      // Position changes; source in/out + duration untouched (no slip/slide side effects).
      expect(c.position).toBe(3)
      expect(c.inPoint).toBe(2)
      expect(c.outPoint).toBe(7)
      expect(c.duration).toBe(5)
    })
  })
})
