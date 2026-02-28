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

import { useTimelineStore } from '../../../renderer/stores/timeline'
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
  }
}

describe('Clip Operations', () => {
  let trackId: string

  beforeEach(() => {
    useTimelineStore.getState().reset()
    useTimelineStore.getState().addTrack('Track 1', '#ff0000')
    trackId = useTimelineStore.getState().tracks[0].id
  })

  describe('splitClip', () => {
    it('produces two clips whose durations sum to original', () => {
      const clip = makeClip({ id: 'c1', position: 0, duration: 10, inPoint: 0, outPoint: 10 })
      useTimelineStore.getState().addClip(trackId, clip)

      useTimelineStore.getState().splitClip('c1', 4)

      const clips = useTimelineStore.getState().tracks[0].clips
      expect(clips).toHaveLength(2)
      expect(clips[0].duration + clips[1].duration).toBe(10)
    })

    it('first clip ends at split time, second starts at split time', () => {
      const clip = makeClip({ id: 'c1', position: 2, duration: 8, inPoint: 0, outPoint: 8 })
      useTimelineStore.getState().addClip(trackId, clip)

      useTimelineStore.getState().splitClip('c1', 6)

      const clips = useTimelineStore.getState().tracks[0].clips
      // Clip A: position=2, duration=4
      expect(clips[0].position).toBe(2)
      expect(clips[0].duration).toBe(4)
      // Clip B: position=6, duration=4
      expect(clips[1].position).toBe(6)
      expect(clips[1].duration).toBe(4)
    })

    it('split preserves assetId', () => {
      const clip = makeClip({ id: 'c1', assetId: 'video-42' })
      useTimelineStore.getState().addClip(trackId, clip)

      useTimelineStore.getState().splitClip('c1', 5)

      const clips = useTimelineStore.getState().tracks[0].clips
      expect(clips[0].assetId).toBe('video-42')
      expect(clips[1].assetId).toBe('video-42')
    })

    it('split at clip start is no-op', () => {
      const clip = makeClip({ id: 'c1', position: 3, duration: 5 })
      useTimelineStore.getState().addClip(trackId, clip)

      useTimelineStore.getState().splitClip('c1', 3)
      expect(useTimelineStore.getState().tracks[0].clips).toHaveLength(1)
    })

    it('split at clip end is no-op', () => {
      const clip = makeClip({ id: 'c1', position: 3, duration: 5 })
      useTimelineStore.getState().addClip(trackId, clip)

      useTimelineStore.getState().splitClip('c1', 8)
      expect(useTimelineStore.getState().tracks[0].clips).toHaveLength(1)
    })
  })

  describe('moveClip', () => {
    it('changes position on same track', () => {
      const clip = makeClip({ id: 'c1', position: 0 })
      useTimelineStore.getState().addClip(trackId, clip)

      useTimelineStore.getState().moveClip('c1', trackId, 5)

      expect(useTimelineStore.getState().tracks[0].clips[0].position).toBe(5)
    })

    it('moves clip to different track', () => {
      useTimelineStore.getState().addTrack('Track 2', '#00ff00')
      const track2Id = useTimelineStore.getState().tracks[1].id

      const clip = makeClip({ id: 'c1', position: 0 })
      useTimelineStore.getState().addClip(trackId, clip)

      useTimelineStore.getState().moveClip('c1', track2Id, 3)

      expect(useTimelineStore.getState().tracks[0].clips).toHaveLength(0)
      expect(useTimelineStore.getState().tracks[1].clips).toHaveLength(1)
      expect(useTimelineStore.getState().tracks[1].clips[0].trackId).toBe(track2Id)
    })
  })

  describe('trimClipIn', () => {
    it('adjusts inPoint and position', () => {
      const clip = makeClip({ id: 'c1', position: 2, duration: 8, inPoint: 0, outPoint: 8 })
      useTimelineStore.getState().addClip(trackId, clip)

      useTimelineStore.getState().trimClipIn('c1', 3)

      const c = useTimelineStore.getState().tracks[0].clips[0]
      expect(c.inPoint).toBe(3)
      expect(c.position).toBe(5) // 2 + (3-0)
      expect(c.duration).toBe(5) // 8 - 3
    })

    it('invalid trim (past outPoint) is no-op', () => {
      const clip = makeClip({ id: 'c1', position: 0, duration: 10, inPoint: 0, outPoint: 10 })
      useTimelineStore.getState().addClip(trackId, clip)

      useTimelineStore.getState().trimClipIn('c1', 10)

      expect(useTimelineStore.getState().tracks[0].clips[0].inPoint).toBe(0)
    })
  })

  describe('trimClipOut', () => {
    it('adjusts outPoint and duration', () => {
      const clip = makeClip({ id: 'c1', position: 0, duration: 10, inPoint: 0, outPoint: 10 })
      useTimelineStore.getState().addClip(trackId, clip)

      useTimelineStore.getState().trimClipOut('c1', 7)

      const c = useTimelineStore.getState().tracks[0].clips[0]
      expect(c.outPoint).toBe(7)
      expect(c.duration).toBe(7)
    })

    it('invalid trim (before inPoint) is no-op', () => {
      const clip = makeClip({ id: 'c1', position: 0, duration: 10, inPoint: 2, outPoint: 10 })
      useTimelineStore.getState().addClip(trackId, clip)

      useTimelineStore.getState().trimClipOut('c1', 1)

      expect(useTimelineStore.getState().tracks[0].clips[0].outPoint).toBe(10)
    })
  })

  describe('drag from asset', () => {
    it('new clip created with correct assetId', () => {
      const clip = makeClip({ id: 'new-clip', assetId: 'asset-video-1', position: 5, duration: 8 })
      useTimelineStore.getState().addClip(trackId, clip)

      const c = useTimelineStore.getState().tracks[0].clips[0]
      expect(c.id).toBe('new-clip')
      expect(c.assetId).toBe('asset-video-1')
      expect(c.position).toBe(5)
      expect(c.duration).toBe(8)
    })
  })
})
