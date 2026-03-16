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

// Import validateProject and hydration
import { validateProject, hydrateStores, serializeProject } from '../../../renderer/project-persistence'
import { useTimelineStore } from '../../../renderer/stores/timeline'

describe('Text Track Persistence', () => {
  function makeValidProject(overrides: Record<string, unknown> = {}) {
    return {
      version: '2.0.0',
      id: 'test-1',
      created: Date.now(),
      modified: Date.now(),
      author: '',
      settings: {
        resolution: [1920, 1080],
        frameRate: 30,
        audioSampleRate: 44100,
        masterVolume: 1.0,
        seed: 42,
      },
      assets: {},
      timeline: {
        duration: 10,
        tracks: [],
        markers: [],
        loopRegion: null,
      },
      ...overrides,
    }
  }

  it('validates project with text track', () => {
    const project = makeValidProject({
      timeline: {
        duration: 10,
        tracks: [
          {
            id: 't1',
            type: 'text',
            name: 'Text 1',
            color: '#6366f1',
            isMuted: false,
            isSoloed: false,
            opacity: 1.0,
            blendMode: 'normal',
            clips: [
              {
                id: 'c1',
                assetId: '',
                trackId: 't1',
                position: 0,
                duration: 5,
                inPoint: 0,
                outPoint: 5,
                speed: 1,
                textConfig: {
                  text: 'Hello World',
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
                },
              },
            ],
            effectChain: [],
            automationLanes: [],
          },
        ],
        markers: [],
        loopRegion: null,
      },
    })
    expect(validateProject(project)).toBe(true)
  })

  it('validates project with mixed video and text tracks', () => {
    const project = makeValidProject({
      timeline: {
        duration: 10,
        tracks: [
          {
            id: 't1', type: 'video', name: 'Video', color: '#ff0000',
            isMuted: false, isSoloed: false, opacity: 1.0, blendMode: 'normal',
            clips: [{ id: 'c1', assetId: 'a1', trackId: 't1', position: 0, duration: 5, inPoint: 0, outPoint: 5, speed: 1 }],
            effectChain: [], automationLanes: [],
          },
          {
            id: 't2', type: 'text', name: 'Text', color: '#6366f1',
            isMuted: false, isSoloed: false, opacity: 1.0, blendMode: 'normal',
            clips: [{ id: 'c2', assetId: '', trackId: 't2', position: 0, duration: 5, inPoint: 0, outPoint: 5, speed: 1, textConfig: { text: 'Hi', fontFamily: 'Arial', fontSize: 36, color: '#fff', position: [0, 0], alignment: 'left', opacity: 1, strokeWidth: 0, strokeColor: '#000', shadowOffset: [0, 0], shadowColor: '#000', animation: 'none', animationDuration: 1 } }],
            effectChain: [], automationLanes: [],
          },
        ],
        markers: [],
        loopRegion: null,
      },
    })
    expect(validateProject(project)).toBe(true)
  })

  it('rejects text clip with invalid textConfig', () => {
    const project = makeValidProject({
      timeline: {
        duration: 10,
        tracks: [
          {
            id: 't1', type: 'text', name: 'Text', color: '#6366f1',
            isMuted: false, isSoloed: false, opacity: 1.0, blendMode: 'normal',
            clips: [{ id: 'c1', assetId: '', trackId: 't1', position: 0, duration: 5, inPoint: 0, outPoint: 5, speed: 1, textConfig: { text: 123 } }],
            effectChain: [], automationLanes: [],
          },
        ],
        markers: [],
        loopRegion: null,
      },
    })
    expect(validateProject(project)).toBe(false)
  })

  it('rejects track with invalid type', () => {
    const project = makeValidProject({
      timeline: {
        duration: 10,
        tracks: [
          {
            id: 't1', type: 'invalid', name: 'Bad', color: '#ff0000',
            clips: [], effectChain: [], automationLanes: [],
          },
        ],
        markers: [],
        loopRegion: null,
      },
    })
    expect(validateProject(project)).toBe(false)
  })

  it('accepts text clip without textConfig (backward compat)', () => {
    const project = makeValidProject({
      timeline: {
        duration: 10,
        tracks: [
          {
            id: 't1', type: 'text', name: 'Text', color: '#6366f1',
            isMuted: false, isSoloed: false, opacity: 1.0, blendMode: 'normal',
            clips: [{ id: 'c1', assetId: '', trackId: 't1', position: 0, duration: 5, inPoint: 0, outPoint: 5, speed: 1 }],
            effectChain: [], automationLanes: [],
          },
        ],
        markers: [],
        loopRegion: null,
      },
    })
    expect(validateProject(project)).toBe(true)
  })
})

describe('Text Track Round-Trip', () => {
  beforeEach(() => {
    useTimelineStore.getState().reset()
  })

  it('text track type preserved through hydrate → serialize cycle', () => {
    const project = {
      version: '2.0.0',
      id: 'roundtrip-1',
      created: Date.now(),
      modified: Date.now(),
      author: '',
      settings: {
        resolution: [1920, 1080] as [number, number],
        frameRate: 30,
        audioSampleRate: 44100,
        masterVolume: 1.0,
        seed: 42,
      },
      assets: {},
      timeline: {
        duration: 5,
        tracks: [
          {
            id: 't1', type: 'text' as const, name: 'My Text', color: '#6366f1',
            isMuted: false, isSoloed: false, opacity: 1.0, blendMode: 'normal' as const,
            clips: [{
              id: 'c1', assetId: '', trackId: 't1', position: 0, duration: 5, inPoint: 0, outPoint: 5, speed: 1,
              textConfig: {
                text: 'Hello', fontFamily: 'Helvetica', fontSize: 48, color: '#ffffff',
                position: [960, 540] as [number, number], alignment: 'center' as const,
                opacity: 1.0, strokeWidth: 0, strokeColor: '#000000',
                shadowOffset: [0, 0] as [number, number], shadowColor: '#00000080',
                animation: 'none' as const, animationDuration: 1.0,
              },
            }],
            effectChain: [], automationLanes: [],
          },
        ],
        markers: [],
        loopRegion: null,
      },
    }

    // Hydrate stores from project data
    hydrateStores(project as any)

    // Check that the text track type was preserved
    const tracks = useTimelineStore.getState().tracks
    expect(tracks).toHaveLength(1)
    expect(tracks[0].type).toBe('text')
    expect(tracks[0].name).toBe('My Text')

    // Check clips have textConfig
    expect(tracks[0].clips).toHaveLength(1)
    expect(tracks[0].clips[0].textConfig).toBeDefined()
    expect(tracks[0].clips[0].textConfig!.text).toBe('Hello')

    // Serialize and verify round-trip
    const serialized = serializeProject()
    const parsed = JSON.parse(serialized)
    expect(parsed.timeline.tracks[0].type).toBe('text')
    expect(parsed.timeline.tracks[0].clips[0].textConfig.text).toBe('Hello')
  })

  it('mixed video + text tracks preserved through round-trip', () => {
    const project = {
      version: '2.0.0',
      id: 'roundtrip-2',
      created: Date.now(),
      modified: Date.now(),
      author: '',
      settings: {
        resolution: [1920, 1080] as [number, number],
        frameRate: 30,
        audioSampleRate: 44100,
        masterVolume: 1.0,
        seed: 42,
      },
      assets: {},
      timeline: {
        duration: 10,
        tracks: [
          {
            id: 'v1', type: 'video' as const, name: 'Video 1', color: '#ff0000',
            isMuted: false, isSoloed: false, opacity: 1.0, blendMode: 'normal' as const,
            clips: [], effectChain: [], automationLanes: [],
          },
          {
            id: 't1', type: 'text' as const, name: 'Text Overlay', color: '#6366f1',
            isMuted: false, isSoloed: false, opacity: 0.8, blendMode: 'normal' as const,
            clips: [], effectChain: [], automationLanes: [],
          },
        ],
        markers: [],
        loopRegion: null,
      },
    }

    hydrateStores(project as any)
    const tracks = useTimelineStore.getState().tracks
    expect(tracks).toHaveLength(2)
    expect(tracks[0].type).toBe('video')
    expect(tracks[1].type).toBe('text')
  })
})
