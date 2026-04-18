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
import type { AudioClip } from '../../shared/types'

function baseClip(overrides: Partial<Omit<AudioClip, 'id' | 'trackId'>> = {}): Omit<AudioClip, 'id' | 'trackId'> {
  return {
    path: '/tmp/kick.wav',
    inSec: 0,
    outSec: 4,
    startSec: 0,
    gainDb: 0,
    fadeInSec: 0,
    fadeOutSec: 0,
    muted: false,
    ...overrides,
  }
}

describe('TimelineStore — audio tracks', () => {
  beforeEach(() => {
    useTimelineStore.getState().reset()
    useUndoStore.getState().clear()
  })

  describe('addAudioTrack', () => {
    it('creates a track with type=audio and default gainDb=0', () => {
      const trackId = useTimelineStore.getState().addAudioTrack('Drums', '#4ade80')
      expect(trackId).toBeDefined()
      const track = useTimelineStore.getState().tracks[0]
      expect(track.type).toBe('audio')
      expect(track.gainDb).toBe(0)
      expect(track.audioClips).toEqual([])
      expect(track.name).toBe('Drums')
    })

    it('auto-names when no name supplied', () => {
      useTimelineStore.getState().addAudioTrack()
      useTimelineStore.getState().addAudioTrack()
      const [first, second] = useTimelineStore.getState().tracks
      expect(first.name).toBe('Audio 1')
      expect(second.name).toBe('Audio 2')
    })

    it('creation is undoable', () => {
      useTimelineStore.getState().addAudioTrack('Drums')
      expect(useTimelineStore.getState().tracks).toHaveLength(1)
      useUndoStore.getState().undo()
      expect(useTimelineStore.getState().tracks).toHaveLength(0)
      useUndoStore.getState().redo()
      expect(useTimelineStore.getState().tracks).toHaveLength(1)
    })
  })

  describe('addAudioClip — numeric trust boundaries', () => {
    let trackId: string
    beforeEach(() => {
      trackId = useTimelineStore.getState().addAudioTrack('A')!
    })

    it('stores a valid clip', () => {
      const clipId = useTimelineStore.getState().addAudioClip(trackId, baseClip())
      expect(clipId).toBeDefined()
      const t = useTimelineStore.getState().tracks[0]
      expect(t.audioClips).toHaveLength(1)
      expect(t.audioClips![0].path).toBe('/tmp/kick.wav')
    })

    it('rejects NaN gain → clamps to 0', () => {
      useTimelineStore.getState().addAudioClip(trackId, baseClip({ gainDb: Number.NaN }))
      expect(useTimelineStore.getState().tracks[0].audioClips![0].gainDb).toBe(0)
    })

    it('rejects Infinity gain → safe default 0', () => {
      // Infinity is not a valid number; reject to 0 rather than saturating to max.
      useTimelineStore.getState().addAudioClip(trackId, baseClip({ gainDb: Number.POSITIVE_INFINITY }))
      expect(useTimelineStore.getState().tracks[0].audioClips![0].gainDb).toBe(0)
    })

    it('clamps gain above +6 dB', () => {
      useTimelineStore.getState().addAudioClip(trackId, baseClip({ gainDb: 999 }))
      expect(useTimelineStore.getState().tracks[0].audioClips![0].gainDb).toBe(6)
    })

    it('clamps gain below -60 dB', () => {
      useTimelineStore.getState().addAudioClip(trackId, baseClip({ gainDb: -999 }))
      expect(useTimelineStore.getState().tracks[0].audioClips![0].gainDb).toBe(-60)
    })

    it('rejects negative startSec → clamps to 0', () => {
      useTimelineStore.getState().addAudioClip(trackId, baseClip({ startSec: -50 }))
      expect(useTimelineStore.getState().tracks[0].audioClips![0].startSec).toBe(0)
    })

    it('enforces MIN_CLIP_SEC — outSec auto-raised when equal to inSec', () => {
      useTimelineStore.getState().addAudioClip(trackId, baseClip({ inSec: 1, outSec: 1 }))
      const clip = useTimelineStore.getState().tracks[0].audioClips![0]
      expect(clip.outSec).toBeGreaterThan(clip.inSec)
    })

    it('clamps fadeInSec to clip duration', () => {
      useTimelineStore.getState().addAudioClip(trackId, baseClip({ inSec: 0, outSec: 2, fadeInSec: 999 }))
      const clip = useTimelineStore.getState().tracks[0].audioClips![0]
      expect(clip.fadeInSec).toBeLessThanOrEqual(2)
    })

    it('clamps fadeOutSec to remaining duration after fadeIn', () => {
      useTimelineStore.getState().addAudioClip(trackId, baseClip({ inSec: 0, outSec: 10, fadeInSec: 4, fadeOutSec: 999 }))
      const clip = useTimelineStore.getState().tracks[0].audioClips![0]
      expect(clip.fadeInSec + clip.fadeOutSec).toBeLessThanOrEqual(10)
    })
  })

  describe('removeAudioClip', () => {
    let trackId: string
    let clipId: string
    beforeEach(() => {
      trackId = useTimelineStore.getState().addAudioTrack()!
      clipId = useTimelineStore.getState().addAudioClip(trackId, baseClip())!
    })

    it('removes and undo restores', () => {
      useTimelineStore.getState().removeAudioClip(clipId)
      expect(useTimelineStore.getState().tracks[0].audioClips).toHaveLength(0)
      useUndoStore.getState().undo()
      expect(useTimelineStore.getState().tracks[0].audioClips).toHaveLength(1)
      expect(useTimelineStore.getState().tracks[0].audioClips![0].id).toBe(clipId)
    })

    it('clears selection if the removed clip was selected', () => {
      useTimelineStore.setState({ selectedClipIds: [clipId], selectedClipId: clipId })
      useTimelineStore.getState().removeAudioClip(clipId)
      expect(useTimelineStore.getState().selectedClipIds).toEqual([])
      expect(useTimelineStore.getState().selectedClipId).toBeNull()
    })
  })

  describe('removeAudioClips — bulk', () => {
    it('deletes multiple clips in a single undo entry', () => {
      const trackId = useTimelineStore.getState().addAudioTrack()!
      const ids = [
        useTimelineStore.getState().addAudioClip(trackId, baseClip({ startSec: 0 }))!,
        useTimelineStore.getState().addAudioClip(trackId, baseClip({ startSec: 5 }))!,
        useTimelineStore.getState().addAudioClip(trackId, baseClip({ startSec: 10 }))!,
      ]
      const pastLenBefore = useUndoStore.getState().past.length

      useTimelineStore.getState().removeAudioClips(ids)

      expect(useTimelineStore.getState().tracks[0].audioClips).toHaveLength(0)
      // Exactly one new undo entry from the transaction
      expect(useUndoStore.getState().past.length).toBe(pastLenBefore + 1)

      // Single undo restores all three
      useUndoStore.getState().undo()
      expect(useTimelineStore.getState().tracks[0].audioClips).toHaveLength(3)
    })
  })

  describe('setClipGain / setClipFade / setTrackGain', () => {
    let trackId: string
    let clipId: string
    beforeEach(() => {
      trackId = useTimelineStore.getState().addAudioTrack()!
      clipId = useTimelineStore.getState().addAudioClip(trackId, baseClip())!
    })

    it('setClipGain clamps and is undoable', () => {
      useTimelineStore.getState().setClipGain(clipId, -30)
      expect(useTimelineStore.getState().tracks[0].audioClips![0].gainDb).toBe(-30)
      useTimelineStore.getState().setClipGain(clipId, 999)
      expect(useTimelineStore.getState().tracks[0].audioClips![0].gainDb).toBe(6)
      useUndoStore.getState().undo()
      expect(useTimelineStore.getState().tracks[0].audioClips![0].gainDb).toBe(-30)
    })

    it('setTrackGain rejects non-audio tracks silently', () => {
      useTimelineStore.getState().addTrack('Video', '#fff')
      const videoTrackId = useTimelineStore.getState().tracks[1].id
      useTimelineStore.getState().setTrackGain(videoTrackId, -10)
      expect(useTimelineStore.getState().tracks[1].gainDb).toBeUndefined()
    })

    it('setClipFade respects clip duration invariant', () => {
      // Clip duration 4s; request fadeIn=10, fadeOut=10 → should clamp
      useTimelineStore.getState().setClipFade(clipId, 10, 10)
      const clip = useTimelineStore.getState().tracks[0].audioClips![0]
      expect(clip.fadeInSec + clip.fadeOutSec).toBeLessThanOrEqual(4)
    })
  })

  describe('getActiveAudioClipsAtTime — solo + mute semantics', () => {
    it('returns all active unmuted clips by default', () => {
      const t1 = useTimelineStore.getState().addAudioTrack('A')!
      const t2 = useTimelineStore.getState().addAudioTrack('B')!
      useTimelineStore.getState().addAudioClip(t1, baseClip({ startSec: 0, outSec: 4 }))
      useTimelineStore.getState().addAudioClip(t2, baseClip({ startSec: 0, outSec: 4 }))
      const active = useTimelineStore.getState().getActiveAudioClipsAtTime(2)
      expect(active).toHaveLength(2)
    })

    it('excludes muted tracks', () => {
      const t1 = useTimelineStore.getState().addAudioTrack('A')!
      const t2 = useTimelineStore.getState().addAudioTrack('B')!
      useTimelineStore.getState().addAudioClip(t1, baseClip())
      useTimelineStore.getState().addAudioClip(t2, baseClip())
      useTimelineStore.getState().toggleMute(t1)
      const active = useTimelineStore.getState().getActiveAudioClipsAtTime(1)
      expect(active).toHaveLength(1)
      expect(active[0].track.id).toBe(t2)
    })

    it('solo wins over all non-solo audio tracks', () => {
      const t1 = useTimelineStore.getState().addAudioTrack('A')!
      const t2 = useTimelineStore.getState().addAudioTrack('B')!
      const t3 = useTimelineStore.getState().addAudioTrack('C')!
      useTimelineStore.getState().addAudioClip(t1, baseClip())
      useTimelineStore.getState().addAudioClip(t2, baseClip())
      useTimelineStore.getState().addAudioClip(t3, baseClip())
      useTimelineStore.getState().toggleSolo(t2)
      const active = useTimelineStore.getState().getActiveAudioClipsAtTime(1)
      expect(active).toHaveLength(1)
      expect(active[0].track.id).toBe(t2)
    })

    it('excludes muted or missing clips', () => {
      const t1 = useTimelineStore.getState().addAudioTrack()!
      const goodId = useTimelineStore.getState().addAudioClip(t1, baseClip())!
      useTimelineStore.getState().addAudioClip(t1, { ...baseClip(), muted: true })
      useTimelineStore.getState().addAudioClip(t1, { ...baseClip(), missing: true })
      const active = useTimelineStore.getState().getActiveAudioClipsAtTime(1)
      expect(active).toHaveLength(1)
      expect(active[0].clip.id).toBe(goodId)
    })
  })

  describe('recalcDuration includes audio clips', () => {
    it('timeline duration extends to include audio clip end', () => {
      const trackId = useTimelineStore.getState().addAudioTrack()!
      useTimelineStore.getState().addAudioClip(trackId, baseClip({ startSec: 5, inSec: 0, outSec: 10 }))
      // clip.startSec=5 + (outSec-inSec)=10 → end at 15
      expect(useTimelineStore.getState().duration).toBe(15)
    })
  })
})
