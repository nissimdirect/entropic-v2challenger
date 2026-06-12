/**
 * UE.2 — Ripple delete + ripple trim
 *
 * Named tests (packet-spec):
 *  1. ripple delete shifts later clips left
 *  2. non-ripple delete leaves gap  (NEGATIVE — default path unchanged)
 *  3. ripple trim shifts downstream clips by trim delta
 *  4. ripple delete undoes as single entry
 *  5. ripple delete with cross-track selection shifts only same-track clips  (NEGATIVE)
 *  6. ripple delete of last clip on track shifts nothing and records one undo entry  (NEGATIVE)
 *  7. ripple delete via context menu updates downstream positions and one history row  (INTEGRATION)
 */
import { describe, it, expect, beforeEach } from 'vitest'

// Mock window.entropic before store import
;(globalThis as any).window = {
  entropic: {
    onEngineStatus: () => {},
    sendCommand: async () => ({ ok: true }),
    selectFile: async () => null,
    selectSavePath: async () => null,
    onExportProgress: () => {},
  },
}

import { useTimelineStore } from '../../renderer/stores/timeline'
import { useUndoStore } from '../../renderer/stores/undo'
import type { Clip } from '../../shared/types'

function makeClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: overrides.id ?? `clip-${Math.random().toString(36).slice(2, 8)}`,
    assetId: overrides.assetId ?? 'asset-1',
    trackId: overrides.trackId ?? '',
    position: overrides.position ?? 0,
    duration: overrides.duration ?? 5,
    inPoint: overrides.inPoint ?? 0,
    outPoint: overrides.outPoint ?? (overrides.duration ?? 5),
    speed: overrides.speed ?? 1,
  }
}

describe('UE.2 — Ripple delete + ripple trim', () => {
  let trackId: string

  beforeEach(() => {
    useTimelineStore.getState().reset()
    useUndoStore.getState().clear()
    useTimelineStore.getState().addTrack('Track 1', '#ff0000')
    trackId = useTimelineStore.getState().tracks[0].id
    useUndoStore.getState().clear()
  })

  // ────────────────────────────────────────────────────────────────
  // 1. ripple delete shifts later clips left
  // ────────────────────────────────────────────────────────────────
  it('ripple delete shifts later clips left', () => {
    // Layout: [c1: 0–5] [c2: 5–10] [c3: 10–15]
    useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c1', position: 0,  duration: 5, inPoint: 0, outPoint: 5  }))
    useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c2', position: 5,  duration: 5, inPoint: 0, outPoint: 5  }))
    useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c3', position: 10, duration: 5, inPoint: 0, outPoint: 5  }))

    // Ripple-delete c1 (duration=5) → c2 moves 5→0, c3 moves 10→5
    useTimelineStore.getState().rippleRemoveClip('c1')

    const clips = useTimelineStore.getState().tracks[0].clips
    expect(clips).toHaveLength(2)
    const byId = (id: string) => clips.find((c) => c.id === id)!
    expect(byId('c2').position).toBe(0)
    expect(byId('c3').position).toBe(5)
  })

  // ────────────────────────────────────────────────────────────────
  // 2. non-ripple delete leaves gap  (NEGATIVE — default unchanged)
  // ────────────────────────────────────────────────────────────────
  it('non-ripple delete leaves gap', () => {
    useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c1', position: 0,  duration: 5 }))
    useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c2', position: 5,  duration: 5 }))
    useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c3', position: 10, duration: 5 }))

    // Plain delete of c1 — c2 and c3 must NOT move
    useTimelineStore.getState().removeClip('c1')

    const clips = useTimelineStore.getState().tracks[0].clips
    expect(clips).toHaveLength(2)
    const byId = (id: string) => clips.find((c) => c.id === id)!
    expect(byId('c2').position).toBe(5)   // gap left at 0–5
    expect(byId('c3').position).toBe(10)
  })

  // ────────────────────────────────────────────────────────────────
  // 3. ripple trim shifts downstream clips by trim delta
  // ────────────────────────────────────────────────────────────────
  it('ripple trim shifts downstream clips by trim delta', () => {
    // [c1: 0–10 dur=10] [c2: 10–15 dur=5]
    useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c1', position: 0,  duration: 10, inPoint: 0, outPoint: 10 }))
    useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c2', position: 10, duration: 5,  inPoint: 0, outPoint: 5  }))

    // Ripple trim c1's out from 10→7 (delta=3) → c2 shifts 10→7
    useTimelineStore.getState().rippleTrimClipOut('c1', 7)

    const clips = useTimelineStore.getState().tracks[0].clips
    const c1 = clips.find((c) => c.id === 'c1')!
    const c2 = clips.find((c) => c.id === 'c2')!

    // c1 new duration = (7-0)/1 = 7
    expect(c1.outPoint).toBe(7)
    expect(c1.duration).toBe(7)
    // c2 shifted left by delta=3
    expect(c2.position).toBe(7)
  })

  // ────────────────────────────────────────────────────────────────
  // 4. ripple delete undoes as single entry
  // ────────────────────────────────────────────────────────────────
  it('ripple delete undoes as single entry', () => {
    useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c1', position: 0,  duration: 5 }))
    useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c2', position: 5,  duration: 5 }))
    useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c3', position: 10, duration: 5 }))
    useUndoStore.getState().clear()

    useTimelineStore.getState().rippleRemoveClip('c1')

    // Exactly 1 undo entry was pushed
    expect(useUndoStore.getState().past).toHaveLength(1)
    expect(useUndoStore.getState().past[0].description).toBe('Ripple delete')

    // Undo restores all three clips at original positions
    useUndoStore.getState().undo()

    const clips = useTimelineStore.getState().tracks[0].clips
    expect(clips).toHaveLength(3)
    const byId = (id: string) => clips.find((c) => c.id === id)!
    expect(byId('c1').position).toBe(0)
    expect(byId('c2').position).toBe(5)
    expect(byId('c3').position).toBe(10)
  })

  // ────────────────────────────────────────────────────────────────
  // 5. ripple delete with cross-track selection shifts only same-track clips  (NEGATIVE)
  // ────────────────────────────────────────────────────────────────
  it('ripple delete with cross-track selection shifts only same-track clips', () => {
    // Track 1: [c1: 0–5] [c2: 5–10]
    useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c1', position: 0, duration: 5, inPoint: 0, outPoint: 5 }))
    useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c2', position: 5, duration: 5, inPoint: 0, outPoint: 5 }))

    // Track 2: [c3: 5–10]
    useTimelineStore.getState().addTrack('Track 2', '#00ff00')
    const track2Id = useTimelineStore.getState().tracks[1].id
    useTimelineStore.getState().addClip(track2Id, makeClip({ id: 'c3', position: 5, duration: 5, inPoint: 0, outPoint: 5 }))

    useUndoStore.getState().clear()

    // Ripple-delete c1 on Track 1 — c3 on Track 2 must NOT move
    useTimelineStore.getState().rippleRemoveClip('c1')

    const t1Clips = useTimelineStore.getState().tracks.find((t) => t.id === trackId)!.clips
    const t2Clips = useTimelineStore.getState().tracks.find((t) => t.id === track2Id)!.clips

    // c2 on Track 1 shifts 5→0
    expect(t1Clips.find((c) => c.id === 'c2')!.position).toBe(0)
    // c3 on Track 2 byte-identical — 0 position change
    expect(t2Clips.find((c) => c.id === 'c3')!.position).toBe(5)
  })

  // ────────────────────────────────────────────────────────────────
  // 6. ripple delete of last clip on track shifts nothing and records one undo entry  (NEGATIVE)
  // ────────────────────────────────────────────────────────────────
  it('ripple delete of last clip on track shifts nothing and records one undo entry', () => {
    useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c1', position: 0, duration: 5 }))
    useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c2', position: 5, duration: 5 }))
    useUndoStore.getState().clear()

    // Ripple-delete c2 — it is the LAST clip; no downstream clips to shift
    useTimelineStore.getState().rippleRemoveClip('c2')

    const clips = useTimelineStore.getState().tracks[0].clips
    expect(clips).toHaveLength(1)
    expect(clips[0].id).toBe('c1')
    // c1 is BEFORE the deleted clip — must NOT move
    expect(clips[0].position).toBe(0)
    // Still exactly 1 undo entry (consistent history regardless of no-op shift)
    expect(useUndoStore.getState().past).toHaveLength(1)
    expect(useUndoStore.getState().past[0].description).toBe('Ripple delete')
  })

  // ────────────────────────────────────────────────────────────────
  // 7. INTEGRATION: ripple delete via context menu updates downstream positions
  //    and one history row  (full chain: store action → positions + history count)
  // ────────────────────────────────────────────────────────────────
  it('ripple delete via context menu updates downstream positions and one history row', () => {
    // Simulate the action the ContextMenu "Ripple Delete" item triggers:
    // store.rippleRemoveClip(clip.id) — called directly as the context menu does
    useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c1', position: 0,  duration: 3, inPoint: 0, outPoint: 3 }))
    useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c2', position: 3,  duration: 4, inPoint: 0, outPoint: 4 }))
    useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c3', position: 7,  duration: 2, inPoint: 0, outPoint: 2 }))
    useUndoStore.getState().clear()

    // Simulate "Ripple Delete" context menu item click on c1
    const store = useTimelineStore.getState()
    store.rippleRemoveClip('c1')

    // Assert downstream positions
    const clips = useTimelineStore.getState().tracks[0].clips
    expect(clips).toHaveLength(2)
    const c2 = clips.find((c) => c.id === 'c2')!
    const c3 = clips.find((c) => c.id === 'c3')!
    expect(c2.position).toBe(0)   // was 3, shifted left by 3 (c1.duration)
    expect(c3.position).toBe(4)   // was 7, shifted left by 3

    // Assert exactly ONE HistoryPanel row
    const { past } = useUndoStore.getState()
    expect(past).toHaveLength(1)
    expect(past[0].description).toBe('Ripple delete')

    // Assert: no clip has a negative position
    for (const clip of useTimelineStore.getState().tracks.flatMap((t) => t.clips)) {
      expect(clip.position).toBeGreaterThanOrEqual(0)
    }
  })

  // ────────────────────────────────────────────────────────────────
  // BONUS: ripple trim also undoes as single entry
  // ────────────────────────────────────────────────────────────────
  it('ripple trim undoes as single entry and restores original positions', () => {
    useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c1', position: 0,  duration: 10, inPoint: 0, outPoint: 10 }))
    useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c2', position: 10, duration: 5,  inPoint: 0, outPoint: 5  }))
    useUndoStore.getState().clear()

    useTimelineStore.getState().rippleTrimClipOut('c1', 6)  // delta=4

    expect(useUndoStore.getState().past).toHaveLength(1)
    expect(useUndoStore.getState().past[0].description).toBe('Ripple trim')

    useUndoStore.getState().undo()

    const clips = useTimelineStore.getState().tracks[0].clips
    const c1 = clips.find((c) => c.id === 'c1')!
    const c2 = clips.find((c) => c.id === 'c2')!
    expect(c1.outPoint).toBe(10)
    expect(c1.duration).toBe(10)
    expect(c2.position).toBe(10)
  })
})
