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
    trackId: overrides.trackId ?? 'track-1',
    position: overrides.position ?? 0,
    duration: overrides.duration ?? 5,
    inPoint: overrides.inPoint ?? 0,
    outPoint: overrides.outPoint ?? 5,
    speed: overrides.speed ?? 1,
  }
}

describe('TimelineStore', () => {
  beforeEach(() => {
    useTimelineStore.getState().reset()
    useUndoStore.getState().clear()
  })

  // --- Track tests ---

  describe('tracks', () => {
    it('starts with no tracks', () => {
      expect(useTimelineStore.getState().tracks).toHaveLength(0)
    })

    it('addTrack increases track count', () => {
      useTimelineStore.getState().addTrack('Track 1', '#ff0000')
      expect(useTimelineStore.getState().tracks).toHaveLength(1)
      expect(useTimelineStore.getState().tracks[0].name).toBe('Track 1')
      expect(useTimelineStore.getState().tracks[0].color).toBe('#ff0000')
    })

    it('removeTrack removes the track', () => {
      useTimelineStore.getState().addTrack('Track 1', '#ff0000')
      const trackId = useTimelineStore.getState().tracks[0].id
      useTimelineStore.getState().removeTrack(trackId)
      expect(useTimelineStore.getState().tracks).toHaveLength(0)
    })

    it('removeTrack also removes clips on that track from selection', () => {
      useTimelineStore.getState().addTrack('Track 1', '#ff0000')
      const trackId = useTimelineStore.getState().tracks[0].id
      const clip = makeClip({ id: 'c1', trackId })
      useTimelineStore.getState().addClip(trackId, clip)
      useTimelineStore.getState().selectClip('c1')
      expect(useTimelineStore.getState().selectedClipId).toBe('c1')
      useTimelineStore.getState().removeTrack(trackId)
      expect(useTimelineStore.getState().selectedClipId).toBeNull()
    })

    it('reorderTrack changes z-order', () => {
      useTimelineStore.getState().addTrack('Track 1', '#ff0000')
      useTimelineStore.getState().addTrack('Track 2', '#00ff00')
      useTimelineStore.getState().addTrack('Track 3', '#0000ff')

      const names = () => useTimelineStore.getState().tracks.map((t) => t.name)
      expect(names()).toEqual(['Track 1', 'Track 2', 'Track 3'])

      useTimelineStore.getState().reorderTrack(0, 2)
      expect(names()).toEqual(['Track 2', 'Track 3', 'Track 1'])
    })

    it('reorderTrack with invalid indices is no-op', () => {
      useTimelineStore.getState().addTrack('Track 1', '#ff0000')
      useTimelineStore.getState().reorderTrack(-1, 0)
      expect(useTimelineStore.getState().tracks).toHaveLength(1)
    })

    it('toggleMute flips mute state', () => {
      useTimelineStore.getState().addTrack('Track 1', '#ff0000')
      const id = useTimelineStore.getState().tracks[0].id
      expect(useTimelineStore.getState().tracks[0].isMuted).toBe(false)
      useTimelineStore.getState().toggleMute(id)
      expect(useTimelineStore.getState().tracks[0].isMuted).toBe(true)
    })

    it('toggleSolo flips solo state', () => {
      useTimelineStore.getState().addTrack('Track 1', '#ff0000')
      const id = useTimelineStore.getState().tracks[0].id
      expect(useTimelineStore.getState().tracks[0].isSoloed).toBe(false)
      useTimelineStore.getState().toggleSolo(id)
      expect(useTimelineStore.getState().tracks[0].isSoloed).toBe(true)
    })

    it('renameTrack updates name', () => {
      useTimelineStore.getState().addTrack('Track 1', '#ff0000')
      const id = useTimelineStore.getState().tracks[0].id
      useTimelineStore.getState().renameTrack(id, 'Renamed')
      expect(useTimelineStore.getState().tracks[0].name).toBe('Renamed')
    })

    it('setTrackOpacity clamps to 0-1', () => {
      useTimelineStore.getState().addTrack('Track 1', '#ff0000')
      const id = useTimelineStore.getState().tracks[0].id
      useTimelineStore.getState().setTrackOpacity(id, 1.5)
      expect(useTimelineStore.getState().tracks[0].opacity).toBe(1)
      useTimelineStore.getState().setTrackOpacity(id, -0.5)
      expect(useTimelineStore.getState().tracks[0].opacity).toBe(0)
    })

    it('setTrackBlendMode changes mode', () => {
      useTimelineStore.getState().addTrack('Track 1', '#ff0000')
      const id = useTimelineStore.getState().tracks[0].id
      useTimelineStore.getState().setTrackBlendMode(id, 'multiply')
      expect(useTimelineStore.getState().tracks[0].blendMode).toBe('multiply')
    })
  })

  // --- Clip tests ---

  describe('clips', () => {
    let trackId: string

    beforeEach(() => {
      useTimelineStore.getState().addTrack('Track 1', '#ff0000')
      trackId = useTimelineStore.getState().tracks[0].id
    })

    it('addClip places clip in correct track', () => {
      const clip = makeClip({ id: 'c1' })
      useTimelineStore.getState().addClip(trackId, clip)
      expect(useTimelineStore.getState().tracks[0].clips).toHaveLength(1)
      expect(useTimelineStore.getState().tracks[0].clips[0].id).toBe('c1')
    })

    it('addClip sets trackId on clip', () => {
      const clip = makeClip({ id: 'c1', trackId: 'wrong' })
      useTimelineStore.getState().addClip(trackId, clip)
      expect(useTimelineStore.getState().tracks[0].clips[0].trackId).toBe(trackId)
    })

    it('removeClip removes the clip', () => {
      const clip = makeClip({ id: 'c1' })
      useTimelineStore.getState().addClip(trackId, clip)
      useTimelineStore.getState().removeClip('c1')
      expect(useTimelineStore.getState().tracks[0].clips).toHaveLength(0)
    })

    it('moveClip changes track and position', () => {
      useTimelineStore.getState().addTrack('Track 2', '#00ff00')
      const track2Id = useTimelineStore.getState().tracks[1].id

      const clip = makeClip({ id: 'c1', position: 0 })
      useTimelineStore.getState().addClip(trackId, clip)

      useTimelineStore.getState().moveClip('c1', track2Id, 3)

      expect(useTimelineStore.getState().tracks[0].clips).toHaveLength(0)
      expect(useTimelineStore.getState().tracks[1].clips).toHaveLength(1)
      expect(useTimelineStore.getState().tracks[1].clips[0].position).toBe(3)
      expect(useTimelineStore.getState().tracks[1].clips[0].trackId).toBe(track2Id)
    })

    it('splitClip produces two clips with correct in/out points', () => {
      const clip = makeClip({ id: 'c1', position: 2, duration: 10, inPoint: 0, outPoint: 10, speed: 1 })
      useTimelineStore.getState().addClip(trackId, clip)

      useTimelineStore.getState().splitClip('c1', 7) // split at time 7

      const clips = useTimelineStore.getState().tracks[0].clips
      expect(clips).toHaveLength(2)

      // Clip A: position=2, duration=5 (7-2), inPoint=0, outPoint=5
      expect(clips[0].position).toBe(2)
      expect(clips[0].duration).toBe(5)
      expect(clips[0].inPoint).toBe(0)
      expect(clips[0].outPoint).toBe(5)

      // Clip B: position=7, duration=5 (10-5), inPoint=5, outPoint=10
      expect(clips[1].position).toBe(7)
      expect(clips[1].duration).toBe(5)
      expect(clips[1].inPoint).toBe(5)
      expect(clips[1].outPoint).toBe(10)
    })

    it('splitClip at clip edge is no-op', () => {
      const clip = makeClip({ id: 'c1', position: 2, duration: 10 })
      useTimelineStore.getState().addClip(trackId, clip)

      // Split at start
      useTimelineStore.getState().splitClip('c1', 2)
      expect(useTimelineStore.getState().tracks[0].clips).toHaveLength(1)

      // Split at end
      useTimelineStore.getState().splitClip('c1', 12)
      expect(useTimelineStore.getState().tracks[0].clips).toHaveLength(1)
    })

    it('trimClipIn adjusts inPoint and recalculates duration', () => {
      const clip = makeClip({ id: 'c1', position: 0, duration: 10, inPoint: 0, outPoint: 10 })
      useTimelineStore.getState().addClip(trackId, clip)

      useTimelineStore.getState().trimClipIn('c1', 3)

      const c = useTimelineStore.getState().tracks[0].clips[0]
      expect(c.inPoint).toBe(3)
      expect(c.position).toBe(3)
      expect(c.duration).toBe(7)
    })

    it('trimClipOut adjusts outPoint and recalculates duration', () => {
      const clip = makeClip({ id: 'c1', position: 0, duration: 10, inPoint: 0, outPoint: 10 })
      useTimelineStore.getState().addClip(trackId, clip)

      useTimelineStore.getState().trimClipOut('c1', 6)

      const c = useTimelineStore.getState().tracks[0].clips[0]
      expect(c.outPoint).toBe(6)
      expect(c.duration).toBe(6)
    })

    it('trimClipOut with speed=2 produces correct wall-time duration', () => {
      // speed=2 means 10 source frames play in 5 wall-time seconds
      const clip = makeClip({ id: 'c1', position: 0, duration: 5, inPoint: 0, outPoint: 10, speed: 2 })
      useTimelineStore.getState().addClip(trackId, clip)

      // Trim out to source frame 6: wall-time = (6 - 0) / 2 = 3
      useTimelineStore.getState().trimClipOut('c1', 6)

      const c = useTimelineStore.getState().tracks[0].clips[0]
      expect(c.outPoint).toBe(6)
      expect(c.duration).toBe(3)
    })

    it('splitClip recalculates timeline duration', () => {
      const clip = makeClip({ id: 'c1', position: 0, duration: 10, inPoint: 0, outPoint: 10 })
      useTimelineStore.getState().addClip(trackId, clip)
      expect(useTimelineStore.getState().duration).toBe(10)

      // Split at t=5 — total duration should still be 10
      useTimelineStore.getState().splitClip('c1', 5)
      expect(useTimelineStore.getState().duration).toBe(10)
    })
  })

  // --- getActiveClipsAtTime ---

  describe('getActiveClipsAtTime', () => {
    it('returns only overlapping clips', () => {
      useTimelineStore.getState().addTrack('Track 1', '#ff0000')
      const trackId = useTimelineStore.getState().tracks[0].id

      // Clip from t=0 to t=5
      useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c1', position: 0, duration: 5 }))
      // Clip from t=8 to t=13
      useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c2', position: 8, duration: 5 }))

      // At t=3: only c1
      const at3 = useTimelineStore.getState().getActiveClipsAtTime(3)
      expect(at3).toHaveLength(1)
      expect(at3[0].clip.id).toBe('c1')

      // At t=6: nothing
      const at6 = useTimelineStore.getState().getActiveClipsAtTime(6)
      expect(at6).toHaveLength(0)

      // At t=10: only c2
      const at10 = useTimelineStore.getState().getActiveClipsAtTime(10)
      expect(at10).toHaveLength(1)
      expect(at10[0].clip.id).toBe('c2')
    })

    it('returns clips from multiple tracks', () => {
      useTimelineStore.getState().addTrack('Track 1', '#ff0000')
      useTimelineStore.getState().addTrack('Track 2', '#00ff00')
      const t1 = useTimelineStore.getState().tracks[0].id
      const t2 = useTimelineStore.getState().tracks[1].id

      useTimelineStore.getState().addClip(t1, makeClip({ id: 'c1', position: 0, duration: 10 }))
      useTimelineStore.getState().addClip(t2, makeClip({ id: 'c2', position: 3, duration: 4 }))

      const at5 = useTimelineStore.getState().getActiveClipsAtTime(5)
      expect(at5).toHaveLength(2)
    })
  })

  // --- Duration auto-calculation ---

  describe('duration', () => {
    it('auto-calculates from clip positions', () => {
      useTimelineStore.getState().addTrack('Track 1', '#ff0000')
      const trackId = useTimelineStore.getState().tracks[0].id

      useTimelineStore.getState().addClip(trackId, makeClip({ position: 0, duration: 5 }))
      expect(useTimelineStore.getState().duration).toBe(5)

      useTimelineStore.getState().addClip(trackId, makeClip({ position: 10, duration: 3 }))
      expect(useTimelineStore.getState().duration).toBe(13)
    })

    it('updates when clip is removed', () => {
      useTimelineStore.getState().addTrack('Track 1', '#ff0000')
      const trackId = useTimelineStore.getState().tracks[0].id

      useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c1', position: 0, duration: 5 }))
      useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c2', position: 10, duration: 3 }))
      expect(useTimelineStore.getState().duration).toBe(13)

      useTimelineStore.getState().removeClip('c2')
      expect(useTimelineStore.getState().duration).toBe(5)
    })
  })

  // --- View ---

  describe('zoom and scroll', () => {
    it('setZoom clamps to 10-200', () => {
      useTimelineStore.getState().setZoom(5)
      expect(useTimelineStore.getState().zoom).toBe(10)

      useTimelineStore.getState().setZoom(300)
      expect(useTimelineStore.getState().zoom).toBe(200)
    })

    it('setScrollX clamps to >= 0', () => {
      useTimelineStore.getState().setScrollX(-10)
      expect(useTimelineStore.getState().scrollX).toBe(0)
    })
  })

  // --- Undo integration ---

  describe('undo/redo', () => {
    let trackId: string

    beforeEach(() => {
      useTimelineStore.getState().addTrack('Track 1', '#ff0000')
      trackId = useTimelineStore.getState().tracks[0].id
      // Clear the addTrack undo entry so tests start clean
      useUndoStore.getState().clear()
    })

    it('removeTrack → undo restores track with clips', () => {
      useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c1', position: 0, duration: 5 }))
      useUndoStore.getState().clear()

      useTimelineStore.getState().removeTrack(trackId)
      expect(useTimelineStore.getState().tracks).toHaveLength(0)

      useUndoStore.getState().undo()
      expect(useTimelineStore.getState().tracks).toHaveLength(1)
      expect(useTimelineStore.getState().tracks[0].clips).toHaveLength(1)
      expect(useTimelineStore.getState().tracks[0].clips[0].id).toBe('c1')
    })

    it('removeClip → undo restores clip', () => {
      useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c1', position: 3, duration: 7 }))
      useUndoStore.getState().clear()

      useTimelineStore.getState().removeClip('c1')
      expect(useTimelineStore.getState().tracks[0].clips).toHaveLength(0)

      useUndoStore.getState().undo()
      expect(useTimelineStore.getState().tracks[0].clips).toHaveLength(1)
      expect(useTimelineStore.getState().tracks[0].clips[0].position).toBe(3)
    })

    it('splitClip → undo merges back to original', () => {
      useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c1', position: 0, duration: 10, inPoint: 0, outPoint: 10 }))
      useUndoStore.getState().clear()

      useTimelineStore.getState().splitClip('c1', 5)
      expect(useTimelineStore.getState().tracks[0].clips).toHaveLength(2)

      useUndoStore.getState().undo()
      const clips = useTimelineStore.getState().tracks[0].clips
      expect(clips).toHaveLength(1)
      expect(clips[0].id).toBe('c1')
      expect(clips[0].duration).toBe(10)
    })

    it('moveClip → undo restores original position', () => {
      useTimelineStore.getState().addTrack('Track 2', '#00ff00')
      const track2Id = useTimelineStore.getState().tracks[1].id
      useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c1', position: 0, duration: 5 }))
      useUndoStore.getState().clear()

      useTimelineStore.getState().moveClip('c1', track2Id, 10)
      expect(useTimelineStore.getState().tracks[0].clips).toHaveLength(0)
      expect(useTimelineStore.getState().tracks[1].clips).toHaveLength(1)

      useUndoStore.getState().undo()
      expect(useTimelineStore.getState().tracks[0].clips).toHaveLength(1)
      expect(useTimelineStore.getState().tracks[0].clips[0].position).toBe(0)
      expect(useTimelineStore.getState().tracks[1].clips).toHaveLength(0)
    })

    it('trimClipIn → undo restores original in/position/duration', () => {
      useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c1', position: 0, duration: 10, inPoint: 0, outPoint: 10 }))
      useUndoStore.getState().clear()

      useTimelineStore.getState().trimClipIn('c1', 3)
      useUndoStore.getState().undo()

      const c = useTimelineStore.getState().tracks[0].clips[0]
      expect(c.inPoint).toBe(0)
      expect(c.position).toBe(0)
      expect(c.duration).toBe(10)
    })

    it('trimClipOut → undo restores original out/duration', () => {
      useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c1', position: 0, duration: 10, inPoint: 0, outPoint: 10 }))
      useUndoStore.getState().clear()

      useTimelineStore.getState().trimClipOut('c1', 5)
      useUndoStore.getState().undo()

      const c = useTimelineStore.getState().tracks[0].clips[0]
      expect(c.outPoint).toBe(10)
      expect(c.duration).toBe(10)
    })

    // --- Full history buffer tests ---

    it('history buffer: 5-action sequence → undo all → redo all', () => {
      // Action 1: add clip
      useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c1', position: 0, duration: 5 }))
      // Action 2: add another clip
      useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c2', position: 10, duration: 3 }))
      // Action 3: rename track
      useTimelineStore.getState().renameTrack(trackId, 'Renamed')
      // Action 4: move clip
      useTimelineStore.getState().moveClip('c1', trackId, 20)
      // Action 5: add marker
      useTimelineStore.getState().addMarker(5.0, 'Drop', '#f00')

      expect(useUndoStore.getState().past).toHaveLength(5)

      // Undo all 5
      for (let i = 0; i < 5; i++) useUndoStore.getState().undo()

      expect(useTimelineStore.getState().tracks[0].clips).toHaveLength(0)
      expect(useTimelineStore.getState().tracks[0].name).toBe('Track 1')
      expect(useTimelineStore.getState().markers).toHaveLength(0)
      expect(useUndoStore.getState().future).toHaveLength(5)

      // Redo all 5
      for (let i = 0; i < 5; i++) useUndoStore.getState().redo()

      expect(useTimelineStore.getState().tracks[0].clips).toHaveLength(2)
      expect(useTimelineStore.getState().tracks[0].name).toBe('Renamed')
      expect(useTimelineStore.getState().markers).toHaveLength(1)
      // Clip c1 should be at position 20 (moved)
      const c1 = useTimelineStore.getState().tracks[0].clips.find((c) => c.id === 'c1')
      expect(c1?.position).toBe(20)
    })

    it('history buffer: undo mid-stream → new action clears future', () => {
      useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c1', position: 0, duration: 5 }))
      useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c2', position: 10, duration: 3 }))
      useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c3', position: 20, duration: 2 }))

      // Undo 2 actions
      useUndoStore.getState().undo()
      useUndoStore.getState().undo()
      expect(useUndoStore.getState().future).toHaveLength(2)
      expect(useTimelineStore.getState().tracks[0].clips).toHaveLength(1)

      // New action should clear future (linear branching)
      useTimelineStore.getState().renameTrack(trackId, 'Branched')
      expect(useUndoStore.getState().future).toHaveLength(0)
      expect(useUndoStore.getState().past).toHaveLength(2) // 1 add + 1 rename
    })

    it('splitClip → redo uses same clipB ID', () => {
      useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c1', position: 0, duration: 10, inPoint: 0, outPoint: 10 }))
      useUndoStore.getState().clear()

      useTimelineStore.getState().splitClip('c1', 5)
      const clipBId = useTimelineStore.getState().tracks[0].clips[1].id

      useUndoStore.getState().undo()
      useUndoStore.getState().redo()

      // After redo, clipB should have the same pre-generated ID
      expect(useTimelineStore.getState().tracks[0].clips[1].id).toBe(clipBId)
    })
  })
})
