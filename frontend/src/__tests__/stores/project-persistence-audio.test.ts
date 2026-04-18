/**
 * Persistence round-trip for audio tracks + clips.
 * Covers validator acceptance of type='audio' and hydrator restoration
 * of audioClips + track gainDb after serialize→validate→hydrate.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockEntropic = {
  onEngineStatus: vi.fn(),
  sendCommand: vi.fn().mockResolvedValue({ ok: true }),
  selectFile: vi.fn().mockResolvedValue(null),
  selectSavePath: vi.fn().mockResolvedValue(null),
  onExportProgress: vi.fn().mockReturnValue(vi.fn()),
  getPathForFile: vi.fn().mockReturnValue('/test/video.mp4'),
  showSaveDialog: vi.fn().mockResolvedValue('/test/project.glitch'),
  showOpenDialog: vi.fn().mockResolvedValue('/test/project.glitch'),
  readFile: vi.fn().mockResolvedValue('{}'),
  writeFile: vi.fn().mockResolvedValue(undefined),
  deleteFile: vi.fn().mockResolvedValue(undefined),
  getAppPath: vi.fn().mockResolvedValue('/test/userData'),
}
;(globalThis as any).window = { entropic: mockEntropic }

import { useTimelineStore } from '../../renderer/stores/timeline'
import { useUndoStore } from '../../renderer/stores/undo'
import { serializeProject, validateProject, hydrateStores } from '../../renderer/project-persistence'

describe('Project persistence — audio tracks', () => {
  beforeEach(() => {
    useTimelineStore.getState().reset()
    useUndoStore.getState().clear()
  })

  it('validator accepts type=audio', () => {
    const project = {
      version: '2.0.0',
      id: 'p',
      created: 0,
      modified: 0,
      author: '',
      settings: { resolution: [1920, 1080], frameRate: 30, audioSampleRate: 44100, masterVolume: 1, seed: 42 },
      assets: {},
      timeline: {
        duration: 10,
        tracks: [
          {
            id: 't1',
            type: 'audio',
            name: 'Drums',
            color: '#4ade80',
            isMuted: false,
            isSoloed: false,
            opacity: 1.0,
            blendMode: 'normal',
            clips: [],
            audioClips: [
              {
                id: 'c1',
                trackId: 't1',
                path: '/tmp/kick.wav',
                inSec: 0,
                outSec: 4,
                startSec: 0,
                gainDb: 0,
                fadeInSec: 0,
                fadeOutSec: 0,
                muted: false,
              },
            ],
            effectChain: [],
            automationLanes: [],
            gainDb: 0,
          },
        ],
        markers: [],
        loopRegion: null,
      },
    }
    expect(validateProject(project)).toBe(true)
  })

  it('validator rejects NaN gainDb', () => {
    const project = {
      version: '2.0.0',
      id: 'p',
      created: 0,
      modified: 0,
      settings: { resolution: [1920, 1080], frameRate: 30, audioSampleRate: 44100, masterVolume: 1, seed: 42 },
      assets: {},
      timeline: {
        duration: 0,
        tracks: [
          {
            id: 't1',
            type: 'audio',
            name: 'A',
            color: '#4ade80',
            isMuted: false,
            isSoloed: false,
            clips: [],
            audioClips: [
              {
                id: 'c1',
                trackId: 't1',
                path: '/tmp/a.wav',
                inSec: 0,
                outSec: 1,
                startSec: 0,
                gainDb: Number.NaN,
                fadeInSec: 0,
                fadeOutSec: 0,
                muted: false,
              },
            ],
          },
        ],
        markers: [],
        loopRegion: null,
      },
    }
    expect(validateProject(project)).toBe(false)
  })

  it('validator rejects non-number outSec', () => {
    const project = {
      version: '2.0.0',
      id: 'p',
      created: 0,
      modified: 0,
      settings: { resolution: [1920, 1080], frameRate: 30, audioSampleRate: 44100, masterVolume: 1, seed: 42 },
      assets: {},
      timeline: {
        duration: 0,
        tracks: [
          {
            id: 't1',
            type: 'audio',
            name: 'A',
            color: '#4ade80',
            isMuted: false,
            isSoloed: false,
            clips: [],
            audioClips: [
              {
                id: 'c1',
                trackId: 't1',
                path: '/tmp/a.wav',
                inSec: 0,
                outSec: 'oops' as unknown as number,
                startSec: 0,
                gainDb: 0,
                fadeInSec: 0,
                fadeOutSec: 0,
                muted: false,
              },
            ],
          },
        ],
        markers: [],
        loopRegion: null,
      },
    }
    expect(validateProject(project)).toBe(false)
  })

  it('serialize → hydrate round-trip preserves audio tracks + clips', async () => {
    // Populate store
    const trackId = useTimelineStore.getState().addAudioTrack('Drums', '#4ade80')!
    useTimelineStore.getState().addAudioClip(trackId, {
      path: '/tmp/kick.wav',
      inSec: 0,
      outSec: 4,
      startSec: 2,
      gainDb: -6,
      fadeInSec: 0.5,
      fadeOutSec: 0.25,
      muted: false,
    })
    useTimelineStore.getState().setTrackGain(trackId, 3)

    // Serialize, parse, validate
    const json = serializeProject()
    const parsed = JSON.parse(json)
    expect(validateProject(parsed)).toBe(true)

    // Reset + hydrate
    useTimelineStore.getState().reset()
    expect(useTimelineStore.getState().tracks).toHaveLength(0)

    hydrateStores(parsed)

    // Verify restoration
    const tracks = useTimelineStore.getState().tracks
    expect(tracks).toHaveLength(1)
    expect(tracks[0].type).toBe('audio')
    expect(tracks[0].gainDb).toBe(3)
    expect(tracks[0].audioClips).toHaveLength(1)
    const clip = tracks[0].audioClips![0]
    expect(clip.path).toBe('/tmp/kick.wav')
    expect(clip.startSec).toBe(2)
    expect(clip.gainDb).toBe(-6)
    expect(clip.fadeInSec).toBe(0.5)
    expect(clip.fadeOutSec).toBe(0.25)
  })

  it('hydrate restores missing=true flag for clips saved as missing', () => {
    const project = {
      version: '2.0.0',
      id: 'p',
      created: 0,
      modified: 0,
      author: '',
      settings: { resolution: [1920, 1080], frameRate: 30, audioSampleRate: 44100, masterVolume: 1, seed: 42 },
      assets: {},
      timeline: {
        duration: 0,
        tracks: [
          {
            id: 't1',
            type: 'audio',
            name: 'A',
            color: '#4ade80',
            isMuted: false,
            isSoloed: false,
            opacity: 1.0,
            blendMode: 'normal',
            clips: [],
            audioClips: [
              {
                id: 'c1',
                trackId: 't1',
                path: '/missing/file.wav',
                inSec: 0,
                outSec: 2,
                startSec: 0,
                gainDb: 0,
                fadeInSec: 0,
                fadeOutSec: 0,
                muted: false,
                missing: true,
              },
            ],
            effectChain: [],
            automationLanes: [],
          },
        ],
        markers: [],
        loopRegion: null,
      },
    }
    hydrateStores(project as any)
    const clip = useTimelineStore.getState().tracks[0].audioClips![0]
    expect(clip.missing).toBe(true)
  })
})
