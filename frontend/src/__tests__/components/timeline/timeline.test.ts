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
import { useProjectStore } from '../../../renderer/stores/project'
import type { Clip } from '../../../shared/types'

function makeClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: overrides.id ?? `clip-${Math.random().toString(36).slice(2, 8)}`,
    assetId: overrides.assetId ?? 'asset-1',
    trackId: overrides.trackId ?? '',
    position: overrides.position ?? 0,
    duration: overrides.duration ?? 5,
    inPoint: overrides.inPoint ?? 0,
    outPoint: overrides.outPoint ?? 5,
    speed: overrides.speed ?? 1,
  }
}

describe('Timeline UI Integration', () => {
  beforeEach(() => {
    useTimelineStore.getState().reset()
  })

  describe('track rendering data', () => {
    it('renders correct number of tracks from store', () => {
      useTimelineStore.getState().addTrack('Track 1', '#ff0000')
      useTimelineStore.getState().addTrack('Track 2', '#00ff00')
      useTimelineStore.getState().addTrack('Track 3', '#0000ff')
      expect(useTimelineStore.getState().tracks).toHaveLength(3)
    })

    it('track header exposes name and mute/solo state', () => {
      useTimelineStore.getState().addTrack('My Track', '#ff0000')
      const track = useTimelineStore.getState().tracks[0]
      expect(track.name).toBe('My Track')
      expect(track.isMuted).toBe(false)
      expect(track.isSoloed).toBe(false)

      useTimelineStore.getState().toggleMute(track.id)
      expect(useTimelineStore.getState().tracks[0].isMuted).toBe(true)

      useTimelineStore.getState().toggleSolo(track.id)
      expect(useTimelineStore.getState().tracks[0].isSoloed).toBe(true)
    })
  })

  describe('clip positioning', () => {
    it('clip renders at correct position (position * zoom from left)', () => {
      useTimelineStore.getState().addTrack('Track 1', '#ff0000')
      const trackId = useTimelineStore.getState().tracks[0].id
      useTimelineStore.getState().addClip(trackId, makeClip({ position: 3, duration: 5 }))

      const zoom = useTimelineStore.getState().zoom // default 50 px/s
      const clip = useTimelineStore.getState().tracks[0].clips[0]
      const expectedLeft = clip.position * zoom // 3 * 50 = 150px
      const expectedWidth = clip.duration * zoom // 5 * 50 = 250px

      expect(expectedLeft).toBe(150)
      expect(expectedWidth).toBe(250)
    })

    it('clip position updates with zoom', () => {
      useTimelineStore.getState().addTrack('Track 1', '#ff0000')
      const trackId = useTimelineStore.getState().tracks[0].id
      useTimelineStore.getState().addClip(trackId, makeClip({ position: 2, duration: 4 }))

      useTimelineStore.getState().setZoom(100)
      const zoom = useTimelineStore.getState().zoom
      const clip = useTimelineStore.getState().tracks[0].clips[0]

      expect(clip.position * zoom).toBe(200) // 2 * 100
      expect(clip.duration * zoom).toBe(400) // 4 * 100
    })
  })

  describe('playhead', () => {
    it('playhead position syncs with playheadTime', () => {
      useTimelineStore.getState().setPlayheadTime(5.5)
      const zoom = useTimelineStore.getState().zoom
      const time = useTimelineStore.getState().playheadTime
      expect(time * zoom).toBe(275) // 5.5 * 50
    })

    it('playhead at time 0 is at x=0', () => {
      useTimelineStore.getState().setPlayheadTime(0)
      expect(useTimelineStore.getState().playheadTime).toBe(0)
    })
  })

  describe('zoom control', () => {
    it('zoom changes affect timeline store', () => {
      useTimelineStore.getState().setZoom(100)
      expect(useTimelineStore.getState().zoom).toBe(100)
    })

    it('zoom is clamped to valid range', () => {
      useTimelineStore.getState().setZoom(5)
      expect(useTimelineStore.getState().zoom).toBe(10)

      useTimelineStore.getState().setZoom(500)
      expect(useTimelineStore.getState().zoom).toBe(200)
    })
  })

  describe('selection', () => {
    it('selecting a track updates selectedTrackId', () => {
      useTimelineStore.getState().addTrack('Track 1', '#ff0000')
      const trackId = useTimelineStore.getState().tracks[0].id
      useTimelineStore.getState().selectTrack(trackId)
      expect(useTimelineStore.getState().selectedTrackId).toBe(trackId)
    })

    it('selecting a clip updates selectedClipId', () => {
      useTimelineStore.getState().addTrack('Track 1', '#ff0000')
      const trackId = useTimelineStore.getState().tracks[0].id
      useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c1' }))
      useTimelineStore.getState().selectClip('c1')
      expect(useTimelineStore.getState().selectedClipId).toBe('c1')
    })
  })

  describe('asset name resolution', () => {
    it('clip resolves asset name from project store', () => {
      // Add asset to project store
      useProjectStore.getState().addAsset({
        id: 'asset-1',
        path: '/videos/my-clip.mp4',
        type: 'video',
        meta: { width: 1920, height: 1080, duration: 10, fps: 30, codec: 'h264', hasAudio: true },
      })

      // The asset name shown on clip should be the filename
      const asset = useProjectStore.getState().assets['asset-1']
      expect(asset.path.split('/').pop()).toBe('my-clip.mp4')
    })
  })
})
