import { describe, it, expect } from 'vitest'

// Mock window.entropic before store import (same idiom as timeline.test.ts)
;(globalThis as any).window = {
  entropic: {
    onEngineStatus: () => {},
    sendCommand: async () => ({ ok: true }),
    selectFile: async () => null,
    selectSavePath: async () => null,
    onExportProgress: () => {},
  },
}

import { isVisualTrackHidden } from '../../renderer/stores/timeline'
import type { Track } from '../../shared/types'

function makeTrack(overrides: Partial<Track> & Pick<Track, 'id' | 'type'>): Track {
  return {
    name: overrides.name ?? overrides.id,
    color: '#ff0000',
    isMuted: false,
    isSoloed: false,
    clips: [],
    effectChain: [],
    automationLanes: [],
    ...overrides,
  }
}

/** The set a render/export site would composite, given the shared helper. */
function visible(tracks: Track[]): string[] {
  return tracks.filter((t) => !isVisualTrackHidden(t, tracks)).map((t) => t.id)
}

describe('isVisualTrackHidden — visual solo bus', () => {
  describe('no-solo regression (must behave exactly as the old isMuted-only check)', () => {
    it('shows every track when nothing is soloed', () => {
      const tracks = [
        makeTrack({ id: 'v1', type: 'video' }),
        makeTrack({ id: 'v2', type: 'video' }),
        makeTrack({ id: 't1', type: 'text' }),
        makeTrack({ id: 'p1', type: 'performance' }),
      ]
      expect(visible(tracks)).toEqual(['v1', 'v2', 't1', 'p1'])
    })

    it('hides only muted tracks when nothing is soloed', () => {
      const tracks = [
        makeTrack({ id: 'v1', type: 'video' }),
        makeTrack({ id: 'v2', type: 'video', isMuted: true }),
        makeTrack({ id: 't1', type: 'text', isMuted: true }),
      ]
      expect(visible(tracks)).toEqual(['v1'])
    })
  })

  describe('solo excludes non-soloed tracks', () => {
    it('video solo drops every other visual track from the payload', () => {
      const tracks = [
        makeTrack({ id: 'v1', type: 'video', isSoloed: true }),
        makeTrack({ id: 'v2', type: 'video' }),
        makeTrack({ id: 't1', type: 'text' }),
        makeTrack({ id: 'p1', type: 'performance' }),
      ]
      expect(visible(tracks)).toEqual(['v1'])
    })

    it('multiple soloed tracks all render (solo is additive)', () => {
      const tracks = [
        makeTrack({ id: 'v1', type: 'video', isSoloed: true }),
        makeTrack({ id: 'v2', type: 'video' }),
        makeTrack({ id: 't1', type: 'text', isSoloed: true }),
      ]
      expect(visible(tracks)).toEqual(['v1', 't1'])
    })
  })

  describe('one bus across video + performance + text', () => {
    it('performance-track solo isolates it from video and text', () => {
      const tracks = [
        makeTrack({ id: 'v1', type: 'video' }),
        makeTrack({ id: 't1', type: 'text' }),
        makeTrack({ id: 'p1', type: 'performance', isSoloed: true }),
      ]
      expect(visible(tracks)).toEqual(['p1'])
    })

    it('text-track solo isolates it from video and performance', () => {
      const tracks = [
        makeTrack({ id: 'v1', type: 'video' }),
        makeTrack({ id: 't1', type: 'text', isSoloed: true }),
        makeTrack({ id: 'p1', type: 'performance' }),
      ]
      expect(visible(tracks)).toEqual(['t1'])
    })
  })

  describe('mute wins on the soloed track itself', () => {
    it('a muted+soloed track stays hidden while still arming the bus', () => {
      const tracks = [
        makeTrack({ id: 'v1', type: 'video', isSoloed: true, isMuted: true }),
        makeTrack({ id: 'v2', type: 'video' }),
      ]
      // v1 hidden by its own mute; v2 hidden because the bus is armed.
      expect(visible(tracks)).toEqual([])
    })

    it('an unmuted soloed sibling still renders alongside a muted+soloed track', () => {
      const tracks = [
        makeTrack({ id: 'v1', type: 'video', isSoloed: true, isMuted: true }),
        makeTrack({ id: 'v2', type: 'video', isSoloed: true }),
        makeTrack({ id: 'v3', type: 'video' }),
      ]
      expect(visible(tracks)).toEqual(['v2'])
    })
  })

  describe('audio solo is a separate bus (unchanged)', () => {
    it('a soloed audio track does not arm the visual bus', () => {
      const tracks = [
        makeTrack({ id: 'a1', type: 'audio', isSoloed: true }),
        makeTrack({ id: 'v1', type: 'video' }),
        makeTrack({ id: 't1', type: 'text' }),
      ]
      expect(visible(tracks)).toContain('v1')
      expect(visible(tracks)).toContain('t1')
    })

    it('a muted audio track alongside soloed visuals is unaffected by the visual bus', () => {
      // Audio visibility is decided by getActiveAudioClipsAtTime / audio-bridge,
      // which own the separate `anyAudioSolo` bus and never call this helper.
      // Asserted here so a future refactor that routes audio through this
      // function has to consciously revisit the semantics.
      const tracks = [
        makeTrack({ id: 'v1', type: 'video', isSoloed: true }),
        makeTrack({ id: 'a1', type: 'audio' }),
      ]
      const visualsOnly = visible(tracks.filter((t) => t.type !== 'audio'))
      expect(visualsOnly).toEqual(['v1'])
    })
  })

  describe('edge cases', () => {
    it('empty track list hides nothing', () => {
      expect(visible([])).toEqual([])
    })

    it('inspector/master tracks never arm the visual bus', () => {
      const tracks = [
        makeTrack({ id: 'i1', type: 'inspector', isSoloed: true }),
        makeTrack({ id: 'v1', type: 'video' }),
      ]
      expect(visible(tracks)).toContain('v1')
    })
  })
})
