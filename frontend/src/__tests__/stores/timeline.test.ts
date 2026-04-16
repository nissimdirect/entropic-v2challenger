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
    it('setZoom clamps to 0.5-500', () => {
      useTimelineStore.getState().setZoom(0.1)
      expect(useTimelineStore.getState().zoom).toBe(0.5)

      useTimelineStore.getState().setZoom(600)
      expect(useTimelineStore.getState().zoom).toBe(500)
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

  // --- Multi-clip selection ---

  describe('multi-clip selection', () => {
    let trackId: string

    beforeEach(() => {
      useTimelineStore.getState().addTrack('Track 1', '#ff0000')
      trackId = useTimelineStore.getState().tracks[0].id
      useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c1', position: 0, duration: 5 }))
      useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c2', position: 5, duration: 5 }))
      useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c3', position: 10, duration: 5 }))
      useUndoStore.getState().clear()
    })

    it('selectClip sets single selection and syncs selectedClipId', () => {
      useTimelineStore.getState().selectClip('c2')
      const state = useTimelineStore.getState()
      expect(state.selectedClipIds).toEqual(['c2'])
      expect(state.selectedClipId).toBe('c2')
    })

    it('selectClip(null) clears all selections', () => {
      useTimelineStore.getState().selectClip('c1')
      useTimelineStore.getState().selectClip(null)
      const state = useTimelineStore.getState()
      expect(state.selectedClipIds).toEqual([])
      expect(state.selectedClipId).toBeNull()
    })

    it('toggleClipSelection adds clip to selection', () => {
      useTimelineStore.getState().selectClip('c1')
      useTimelineStore.getState().toggleClipSelection('c2')
      const state = useTimelineStore.getState()
      expect(state.selectedClipIds).toEqual(['c1', 'c2'])
      expect(state.selectedClipId).toBe('c1') // first in array
    })

    it('toggleClipSelection removes clip from selection', () => {
      useTimelineStore.getState().selectClip('c1')
      useTimelineStore.getState().toggleClipSelection('c2')
      useTimelineStore.getState().toggleClipSelection('c1')
      const state = useTimelineStore.getState()
      expect(state.selectedClipIds).toEqual(['c2'])
      expect(state.selectedClipId).toBe('c2')
    })

    it('toggleClipSelection on last selected leaves empty selection', () => {
      useTimelineStore.getState().selectClip('c1')
      useTimelineStore.getState().toggleClipSelection('c1')
      const state = useTimelineStore.getState()
      expect(state.selectedClipIds).toEqual([])
      expect(state.selectedClipId).toBeNull()
    })

    it('rangeSelectClips selects all clips between from and to (inclusive)', () => {
      useTimelineStore.getState().rangeSelectClips('c1', 'c3')
      const state = useTimelineStore.getState()
      expect(state.selectedClipIds).toEqual(['c1', 'c2', 'c3'])
    })

    it('rangeSelectClips works in reverse order', () => {
      useTimelineStore.getState().rangeSelectClips('c3', 'c1')
      const state = useTimelineStore.getState()
      expect(state.selectedClipIds).toEqual(['c1', 'c2', 'c3'])
    })

    it('rangeSelectClips with same from/to selects just that clip', () => {
      useTimelineStore.getState().rangeSelectClips('c2', 'c2')
      expect(useTimelineStore.getState().selectedClipIds).toEqual(['c2'])
    })

    it('rangeSelectClips with invalid ID is no-op', () => {
      useTimelineStore.getState().selectClip('c1')
      useTimelineStore.getState().rangeSelectClips('c1', 'nonexistent')
      // Should not change selection
      expect(useTimelineStore.getState().selectedClipIds).toEqual(['c1'])
    })

    it('rangeSelectClips spans across multiple tracks', () => {
      useTimelineStore.getState().addTrack('Track 2', '#00ff00')
      const track2Id = useTimelineStore.getState().tracks[1].id
      useTimelineStore.getState().addClip(track2Id, makeClip({ id: 'c4', position: 0, duration: 5 }))

      useTimelineStore.getState().rangeSelectClips('c1', 'c4')
      const ids = useTimelineStore.getState().selectedClipIds
      expect(ids).toContain('c1')
      expect(ids).toContain('c2')
      expect(ids).toContain('c3')
      expect(ids).toContain('c4')
    })

    it('clearSelection empties selection', () => {
      useTimelineStore.getState().selectClip('c1')
      useTimelineStore.getState().toggleClipSelection('c2')
      useTimelineStore.getState().clearSelection()
      const state = useTimelineStore.getState()
      expect(state.selectedClipIds).toEqual([])
      expect(state.selectedClipId).toBeNull()
    })

    it('deleteSelectedClips removes all selected clips', () => {
      useTimelineStore.getState().selectClip('c1')
      useTimelineStore.getState().toggleClipSelection('c3')
      useTimelineStore.getState().deleteSelectedClips()
      const clips = useTimelineStore.getState().tracks[0].clips
      expect(clips).toHaveLength(1)
      expect(clips[0].id).toBe('c2')
      expect(useTimelineStore.getState().selectedClipIds).toEqual([])
    })

    it('deleteSelectedClips is undoable', () => {
      useTimelineStore.getState().selectClip('c1')
      useTimelineStore.getState().toggleClipSelection('c2')
      useTimelineStore.getState().deleteSelectedClips()
      expect(useTimelineStore.getState().tracks[0].clips).toHaveLength(1)

      useUndoStore.getState().undo()
      expect(useTimelineStore.getState().tracks[0].clips).toHaveLength(3)
    })

    it('deleteSelectedClips with empty selection is no-op', () => {
      useTimelineStore.getState().clearSelection()
      useTimelineStore.getState().deleteSelectedClips()
      expect(useTimelineStore.getState().tracks[0].clips).toHaveLength(3)
    })

    it('removeTrack cleans up selectedClipIds for clips on that track', () => {
      useTimelineStore.getState().selectClip('c1')
      useTimelineStore.getState().toggleClipSelection('c2')
      useTimelineStore.getState().removeTrack(trackId)
      expect(useTimelineStore.getState().selectedClipIds).toEqual([])
      expect(useTimelineStore.getState().selectedClipId).toBeNull()
    })

    it('removeClip cleans up selectedClipIds', () => {
      useTimelineStore.getState().selectClip('c1')
      useTimelineStore.getState().toggleClipSelection('c2')
      useTimelineStore.getState().removeClip('c1')
      expect(useTimelineStore.getState().selectedClipIds).toEqual(['c2'])
      expect(useTimelineStore.getState().selectedClipId).toBe('c2')
    })
  })

  describe('clip transform', () => {
    it('setClipTransform applies transform to clip', () => {
      const ts = useTimelineStore.getState()
      const trackId = ts.addTrack('T1', '#f00')!
      const clip = makeClip({ id: 'ct1', trackId })
      ts.addClip(trackId, clip)

      ts.setClipTransform('ct1', { x: 10, y: 20, scaleX: 0.5, scaleY: 0.5, rotation: 45, anchorX: 0, anchorY: 0, flipH: false, flipV: false })

      const updated = useTimelineStore.getState().tracks[0].clips[0]
      expect(updated.transform).toEqual({ x: 10, y: 20, scaleX: 0.5, scaleY: 0.5, rotation: 45, anchorX: 0, anchorY: 0, flipH: false, flipV: false })
    })

    it('setClipTransform is undoable', () => {
      const ts = useTimelineStore.getState()
      const trackId = ts.addTrack('T1', '#f00')!
      const clip = makeClip({ id: 'ct2', trackId })
      ts.addClip(trackId, clip)

      ts.setClipTransform('ct2', { x: 100, y: 0, scaleX: 2, scaleY: 2, rotation: 0, anchorX: 0, anchorY: 0, flipH: false, flipV: false })
      expect(useTimelineStore.getState().tracks[0].clips[0].transform?.x).toBe(100)

      useUndoStore.getState().undo()
      expect(useTimelineStore.getState().tracks[0].clips[0].transform).toBeUndefined()
    })

    it('clip defaults have no transform', () => {
      const ts = useTimelineStore.getState()
      const trackId = ts.addTrack('T1', '#f00')!
      const clip = makeClip({ id: 'ct3', trackId })
      ts.addClip(trackId, clip)

      expect(useTimelineStore.getState().tracks[0].clips[0].transform).toBeUndefined()
    })
  })

  describe('duplicateClip', () => {
    it('creates a copy with new ID at offset position', () => {
      const ts = useTimelineStore.getState()
      const trackId = ts.addTrack('T1', '#f00')!
      ts.addClip(trackId, makeClip({ id: 'dc1', trackId, position: 1, duration: 2 }))

      ts.duplicateClip('dc1')

      const clips = useTimelineStore.getState().tracks[0].clips
      expect(clips).toHaveLength(2)
      expect(clips[1].id).not.toBe('dc1')
      expect(clips[1].position).toBe(1.5)
      expect(clips[1].duration).toBe(2)
    })

    it('is undoable', () => {
      const ts = useTimelineStore.getState()
      const trackId = ts.addTrack('T1', '#f00')!
      ts.addClip(trackId, makeClip({ id: 'dc2', trackId }))

      ts.duplicateClip('dc2')
      expect(useTimelineStore.getState().tracks[0].clips).toHaveLength(2)

      useUndoStore.getState().undo()
      expect(useTimelineStore.getState().tracks[0].clips).toHaveLength(1)
    })

    it('no-ops for nonexistent clip', () => {
      const ts = useTimelineStore.getState()
      ts.addTrack('T1', '#f00')
      ts.duplicateClip('nonexistent')
      expect(useTimelineStore.getState().tracks[0].clips).toHaveLength(0)
    })
  })

  describe('toggleClipEnabled', () => {
    it('disables an enabled clip', () => {
      const ts = useTimelineStore.getState()
      const trackId = ts.addTrack('T1', '#f00')!
      ts.addClip(trackId, makeClip({ id: 'te1', trackId }))

      ts.toggleClipEnabled('te1')
      expect(useTimelineStore.getState().tracks[0].clips[0].isEnabled).toBe(false)
    })

    it('re-enables a disabled clip', () => {
      const ts = useTimelineStore.getState()
      const trackId = ts.addTrack('T1', '#f00')!
      ts.addClip(trackId, makeClip({ id: 'te2', trackId }))

      ts.toggleClipEnabled('te2')
      ts.toggleClipEnabled('te2')
      expect(useTimelineStore.getState().tracks[0].clips[0].isEnabled).toBeUndefined()
    })

    it('is undoable', () => {
      const ts = useTimelineStore.getState()
      const trackId = ts.addTrack('T1', '#f00')!
      ts.addClip(trackId, makeClip({ id: 'te3', trackId }))

      ts.toggleClipEnabled('te3')
      useUndoStore.getState().undo()
      expect(useTimelineStore.getState().tracks[0].clips[0].isEnabled).toBeUndefined()
    })
  })

  describe('reverseClip', () => {
    it('toggles reversed flag', () => {
      const ts = useTimelineStore.getState()
      const trackId = ts.addTrack('T1', '#f00')!
      ts.addClip(trackId, makeClip({ id: 'rv1', trackId }))

      ts.reverseClip('rv1')
      expect(useTimelineStore.getState().tracks[0].clips[0].reversed).toBe(true)

      ts.reverseClip('rv1')
      expect(useTimelineStore.getState().tracks[0].clips[0].reversed).toBeUndefined()
    })

    it('is undoable', () => {
      const ts = useTimelineStore.getState()
      const trackId = ts.addTrack('T1', '#f00')!
      ts.addClip(trackId, makeClip({ id: 'rv2', trackId }))

      ts.reverseClip('rv2')
      useUndoStore.getState().undo()
      expect(useTimelineStore.getState().tracks[0].clips[0].reversed).toBeUndefined()
    })
  })

  describe('duplicateTrack', () => {
    it('creates copy with new IDs after source', () => {
      const ts = useTimelineStore.getState()
      const trackId = ts.addTrack('T1', '#f00')!
      ts.addClip(trackId, makeClip({ id: 'dt1', trackId }))

      ts.duplicateTrack(trackId)

      const tracks = useTimelineStore.getState().tracks
      expect(tracks).toHaveLength(2)
      expect(tracks[1].name).toBe('T1 (Copy)')
      expect(tracks[1].id).not.toBe(trackId)
      expect(tracks[1].clips).toHaveLength(1)
      expect(tracks[1].clips[0].id).not.toBe('dt1')
      expect(tracks[1].clips[0].trackId).toBe(tracks[1].id)
    })

    it('is undoable', () => {
      const ts = useTimelineStore.getState()
      const trackId = ts.addTrack('T1', '#f00')!

      ts.duplicateTrack(trackId)
      expect(useTimelineStore.getState().tracks).toHaveLength(2)

      useUndoStore.getState().undo()
      expect(useTimelineStore.getState().tracks).toHaveLength(1)
    })
  })

  describe('selection actions', () => {
    it('selectAllClips selects all clips across tracks', () => {
      const ts = useTimelineStore.getState()
      const t1 = ts.addTrack('T1', '#f00')!
      const t2 = ts.addTrack('T2', '#0f0')!
      ts.addClip(t1, makeClip({ id: 'sa1', trackId: t1 }))
      ts.addClip(t2, makeClip({ id: 'sa2', trackId: t2 }))

      ts.selectAllClips()
      expect(useTimelineStore.getState().selectedClipIds).toEqual(['sa1', 'sa2'])
    })

    it('invertSelection flips selection', () => {
      const ts = useTimelineStore.getState()
      const trackId = ts.addTrack('T1', '#f00')!
      ts.addClip(trackId, makeClip({ id: 'is1', trackId }))
      ts.addClip(trackId, makeClip({ id: 'is2', trackId }))

      ts.selectClip('is1')
      ts.invertSelection()
      expect(useTimelineStore.getState().selectedClipIds).toEqual(['is2'])
    })

    it('selectClipsByTrack selects only clips in specified track', () => {
      const ts = useTimelineStore.getState()
      const t1 = ts.addTrack('T1', '#f00')!
      const t2 = ts.addTrack('T2', '#0f0')!
      ts.addClip(t1, makeClip({ id: 'st1', trackId: t1 }))
      ts.addClip(t2, makeClip({ id: 'st2', trackId: t2 }))

      ts.selectClipsByTrack(t1)
      expect(useTimelineStore.getState().selectedClipIds).toEqual(['st1'])
    })

    it('selectAllClips with no clips produces empty array', () => {
      const ts = useTimelineStore.getState()
      ts.addTrack('T1', '#f00')

      ts.selectAllClips()
      expect(useTimelineStore.getState().selectedClipIds).toEqual([])
    })
  })

  describe('speedDialog (BUG-13)', () => {
    it('starts null', () => {
      expect(useTimelineStore.getState().speedDialog).toBeNull()
    })

    it('openSpeedDialog sets clipId and anchor', () => {
      useTimelineStore.getState().openSpeedDialog('clip-abc', { x: 100, y: 200 })
      const state = useTimelineStore.getState().speedDialog
      expect(state).toEqual({ clipId: 'clip-abc', anchor: { x: 100, y: 200 } })
    })

    it('closeSpeedDialog clears state', () => {
      const ts = useTimelineStore.getState()
      ts.openSpeedDialog('clip-xyz', { x: 50, y: 60 })
      ts.closeSpeedDialog()
      expect(useTimelineStore.getState().speedDialog).toBeNull()
    })

    it('reset clears speedDialog', () => {
      const ts = useTimelineStore.getState()
      ts.openSpeedDialog('clip-1', { x: 10, y: 20 })
      ts.reset()
      expect(useTimelineStore.getState().speedDialog).toBeNull()
    })

    it('removeClip clears speedDialog when its target is removed', () => {
      const ts = useTimelineStore.getState()
      ts.addTrack('Track 1', '#ff0000')
      const trackId = useTimelineStore.getState().tracks[0].id
      ts.addClip(trackId, makeClip({ id: 'speed-target', trackId }))
      ts.openSpeedDialog('speed-target', { x: 1, y: 2 })
      expect(useTimelineStore.getState().speedDialog).not.toBeNull()
      ts.removeClip('speed-target')
      expect(useTimelineStore.getState().speedDialog).toBeNull()
    })

    it('removeClip preserves speedDialog pointing at a different clip', () => {
      const ts = useTimelineStore.getState()
      ts.addTrack('Track 1', '#ff0000')
      const trackId = useTimelineStore.getState().tracks[0].id
      ts.addClip(trackId, makeClip({ id: 'keep', trackId }))
      ts.addClip(trackId, makeClip({ id: 'remove', trackId, position: 10 }))
      ts.openSpeedDialog('keep', { x: 1, y: 2 })
      ts.removeClip('remove')
      expect(useTimelineStore.getState().speedDialog?.clipId).toBe('keep')
    })

    it('deleteSelectedClips clears speedDialog if target is in selection', () => {
      const ts = useTimelineStore.getState()
      ts.addTrack('Track 1', '#ff0000')
      const trackId = useTimelineStore.getState().tracks[0].id
      ts.addClip(trackId, makeClip({ id: 'a', trackId }))
      ts.addClip(trackId, makeClip({ id: 'b', trackId, position: 10 }))
      ts.openSpeedDialog('a', { x: 1, y: 2 })
      ts.selectClip('a')
      ts.deleteSelectedClips()
      expect(useTimelineStore.getState().speedDialog).toBeNull()
    })
  })

  describe('setClipSpeed (P1-B trust boundary)', () => {
    it('clamps speed to upper bound [0.1, 10]', () => {
      const ts = useTimelineStore.getState()
      ts.addTrack('Track 1', '#ff0000')
      const trackId = useTimelineStore.getState().tracks[0].id
      ts.addClip(trackId, makeClip({ id: 'c1', trackId, duration: 10, speed: 1 }))
      // Caller passes 1000 (e.g. automation, scripting) — store must clamp to 10.
      ts.setClipSpeed('c1', 1000)
      const clip = useTimelineStore
        .getState()
        .tracks[0].clips.find((c) => c.id === 'c1')!
      expect(clip.speed).toBe(10)
      // Duration scales inversely: 10 / 10 = 1.
      expect(clip.duration).toBeCloseTo(1, 5)
    })

    it('clamps speed to lower bound [0.1, 10]', () => {
      const ts = useTimelineStore.getState()
      ts.addTrack('Track 1', '#ff0000')
      const trackId = useTimelineStore.getState().tracks[0].id
      ts.addClip(trackId, makeClip({ id: 'c1', trackId, duration: 10, speed: 1 }))
      // Negative input is silently clamped to 0.1.
      ts.setClipSpeed('c1', -5)
      const clip = useTimelineStore
        .getState()
        .tracks[0].clips.find((c) => c.id === 'c1')!
      expect(clip.speed).toBe(0.1)
    })

    it('ignores non-finite speed', () => {
      const ts = useTimelineStore.getState()
      ts.addTrack('Track 1', '#ff0000')
      const trackId = useTimelineStore.getState().tracks[0].id
      ts.addClip(trackId, makeClip({ id: 'c1', trackId, speed: 1 }))
      ts.setClipSpeed('c1', NaN)
      ts.setClipSpeed('c1', Infinity)
      const clip = useTimelineStore
        .getState()
        .tracks[0].clips.find((c) => c.id === 'c1')!
      expect(clip.speed).toBe(1)
    })

    it('early-returns when target clip does not exist (no phantom undo)', () => {
      const ts = useTimelineStore.getState()
      ts.addTrack('Track 1', '#ff0000')
      const undoLengthBefore = useUndoStore.getState().past.length
      ts.setClipSpeed('nonexistent-clip', 2)
      const undoLengthAfter = useUndoStore.getState().past.length
      expect(undoLengthAfter).toBe(undoLengthBefore)
    })

    it('scales duration inversely with speed and clamps playhead', () => {
      const ts = useTimelineStore.getState()
      ts.addTrack('Track 1', '#ff0000')
      const trackId = useTimelineStore.getState().tracks[0].id
      ts.addClip(trackId, makeClip({ id: 'c1', trackId, duration: 10, speed: 1 }))
      ts.setPlayheadTime(8)
      ts.setClipSpeed('c1', 2)
      const state = useTimelineStore.getState()
      const clip = state.tracks[0].clips.find((c) => c.id === 'c1')!
      expect(clip.duration).toBe(5)
      expect(state.playheadTime).toBeLessThanOrEqual(5)
    })
  })
})
