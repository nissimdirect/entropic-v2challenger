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
import type { TextClipConfig } from '../../../shared/types'

function defaultTextConfig(): TextClipConfig {
  return {
    text: 'Hello',
    fontFamily: 'Helvetica',
    fontSize: 48,
    color: '#ffffff',
    position: [960, 540],
    alignment: 'center',
    opacity: 1.0,
    strokeWidth: 0,
    strokeColor: '#000000',
    shadowOffset: [0, 0],
    shadowColor: '#00000080',
    animation: 'none',
    animationDuration: 1.0,
  }
}

describe('Text Tracks', () => {
  beforeEach(() => {
    useTimelineStore.getState().reset()
  })

  describe('addTextTrack', () => {
    it('creates a track with type "text"', () => {
      useTimelineStore.getState().addTextTrack('Text 1', '#6366f1')
      const tracks = useTimelineStore.getState().tracks
      expect(tracks).toHaveLength(1)
      expect(tracks[0].type).toBe('text')
      expect(tracks[0].name).toBe('Text 1')
      expect(tracks[0].color).toBe('#6366f1')
    })

    it('can coexist with video tracks', () => {
      useTimelineStore.getState().addTrack('Video 1', '#ff0000')
      useTimelineStore.getState().addTextTrack('Text 1', '#6366f1')
      const tracks = useTimelineStore.getState().tracks
      expect(tracks).toHaveLength(2)
      expect(tracks[0].type).toBe('video')
      expect(tracks[1].type).toBe('text')
    })

    it('respects max track limit', () => {
      for (let i = 0; i < 64; i++) {
        useTimelineStore.getState().addTextTrack(`T${i}`, '#6366f1')
      }
      // 65th should be blocked
      useTimelineStore.getState().addTextTrack('Overflow', '#6366f1')
      expect(useTimelineStore.getState().tracks).toHaveLength(64)
    })
  })

  describe('addTextClip', () => {
    it('adds a clip with textConfig to a text track', () => {
      useTimelineStore.getState().addTextTrack('Text 1', '#6366f1')
      const trackId = useTimelineStore.getState().tracks[0].id
      useTimelineStore.getState().addTextClip(trackId, defaultTextConfig(), 0, 5)
      const clips = useTimelineStore.getState().tracks[0].clips
      expect(clips).toHaveLength(1)
      expect(clips[0].textConfig).toBeDefined()
      expect(clips[0].textConfig!.text).toBe('Hello')
      expect(clips[0].position).toBe(0)
      expect(clips[0].duration).toBe(5)
    })

    it('rejects adding text clip to video track', () => {
      useTimelineStore.getState().addTrack('Video 1', '#ff0000')
      const trackId = useTimelineStore.getState().tracks[0].id
      useTimelineStore.getState().addTextClip(trackId, defaultTextConfig(), 0, 5)
      // Should not add (track type is video, not text)
      expect(useTimelineStore.getState().tracks[0].clips).toHaveLength(0)
    })

    it('sets assetId to empty string for text clips', () => {
      useTimelineStore.getState().addTextTrack('Text 1', '#6366f1')
      const trackId = useTimelineStore.getState().tracks[0].id
      useTimelineStore.getState().addTextClip(trackId, defaultTextConfig(), 0, 3)
      expect(useTimelineStore.getState().tracks[0].clips[0].assetId).toBe('')
    })

    it('updates timeline duration', () => {
      useTimelineStore.getState().addTextTrack('Text 1', '#6366f1')
      const trackId = useTimelineStore.getState().tracks[0].id
      useTimelineStore.getState().addTextClip(trackId, defaultTextConfig(), 2, 8)
      expect(useTimelineStore.getState().duration).toBe(10) // 2 + 8
    })
  })

  describe('updateTextConfig', () => {
    it('updates text content', () => {
      useTimelineStore.getState().addTextTrack('Text 1', '#6366f1')
      const trackId = useTimelineStore.getState().tracks[0].id
      useTimelineStore.getState().addTextClip(trackId, defaultTextConfig(), 0, 5)
      const clipId = useTimelineStore.getState().tracks[0].clips[0].id

      useTimelineStore.getState().updateTextConfig(clipId, { text: 'World' })
      expect(useTimelineStore.getState().tracks[0].clips[0].textConfig!.text).toBe('World')
    })

    it('updates font size', () => {
      useTimelineStore.getState().addTextTrack('Text 1', '#6366f1')
      const trackId = useTimelineStore.getState().tracks[0].id
      useTimelineStore.getState().addTextClip(trackId, defaultTextConfig(), 0, 5)
      const clipId = useTimelineStore.getState().tracks[0].clips[0].id

      useTimelineStore.getState().updateTextConfig(clipId, { fontSize: 72 })
      expect(useTimelineStore.getState().tracks[0].clips[0].textConfig!.fontSize).toBe(72)
    })

    it('updates animation preset', () => {
      useTimelineStore.getState().addTextTrack('Text 1', '#6366f1')
      const trackId = useTimelineStore.getState().tracks[0].id
      useTimelineStore.getState().addTextClip(trackId, defaultTextConfig(), 0, 5)
      const clipId = useTimelineStore.getState().tracks[0].clips[0].id

      useTimelineStore.getState().updateTextConfig(clipId, { animation: 'fade_in', animationDuration: 2.0 })
      const config = useTimelineStore.getState().tracks[0].clips[0].textConfig!
      expect(config.animation).toBe('fade_in')
      expect(config.animationDuration).toBe(2.0)
    })

    it('preserves other config fields on partial update', () => {
      useTimelineStore.getState().addTextTrack('Text 1', '#6366f1')
      const trackId = useTimelineStore.getState().tracks[0].id
      useTimelineStore.getState().addTextClip(trackId, defaultTextConfig(), 0, 5)
      const clipId = useTimelineStore.getState().tracks[0].clips[0].id

      useTimelineStore.getState().updateTextConfig(clipId, { color: '#ff0000' })
      const config = useTimelineStore.getState().tracks[0].clips[0].textConfig!
      expect(config.color).toBe('#ff0000')
      expect(config.text).toBe('Hello') // unchanged
      expect(config.fontSize).toBe(48) // unchanged
    })

    it('no-ops for non-existent clip', () => {
      useTimelineStore.getState().updateTextConfig('nonexistent', { text: 'X' })
      // Should not throw
    })

    it('no-ops for clip without textConfig', () => {
      useTimelineStore.getState().addTrack('Video 1', '#ff0000')
      const trackId = useTimelineStore.getState().tracks[0].id
      const clip = {
        id: 'clip-1', assetId: 'a1', trackId, position: 0, duration: 5, inPoint: 0, outPoint: 5, speed: 1,
      }
      useTimelineStore.getState().addClip(trackId, clip)
      useTimelineStore.getState().updateTextConfig('clip-1', { text: 'X' })
      // Should not throw or add textConfig
    })

    it('updates position via updateTextConfig', () => {
      useTimelineStore.getState().addTextTrack('Text 1', '#6366f1')
      const trackId = useTimelineStore.getState().tracks[0].id
      useTimelineStore.getState().addTextClip(trackId, defaultTextConfig(), 0, 5)
      const clipId = useTimelineStore.getState().tracks[0].clips[0].id

      useTimelineStore.getState().updateTextConfig(clipId, { position: [100, 200] })
      expect(useTimelineStore.getState().tracks[0].clips[0].textConfig!.position).toEqual([100, 200])
    })
  })

  describe('text track with addTrack type param', () => {
    it('addTrack with type "text" creates text track', () => {
      useTimelineStore.getState().addTrack('My Text', '#6366f1', 'text')
      const tracks = useTimelineStore.getState().tracks
      expect(tracks).toHaveLength(1)
      expect(tracks[0].type).toBe('text')
    })
  })
})
