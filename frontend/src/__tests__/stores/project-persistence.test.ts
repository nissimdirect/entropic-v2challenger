/**
 * Project persistence tests — save, load, new, autosave, validation.
 * Item 4.10 of Phase 4 plan.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Set up window.entropic mock before store imports (matches undo.test.ts pattern)
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

import { useProjectStore } from '../../renderer/stores/project'
import { useTimelineStore } from '../../renderer/stores/timeline'
import { useUndoStore } from '../../renderer/stores/undo'
import {
  serializeProject,
  validateProject,
  hydrateStores,
  saveProject,
  loadProject,
  newProject,
  startAutosave,
  stopAutosave,
} from '../../renderer/project-persistence'

// Helper: build a valid project JSON object
function makeValidProject(overrides: Record<string, unknown> = {}) {
  return {
    version: '2.0.0',
    id: 'test-id-123',
    created: 1700000000000,
    modified: 1700000000000,
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
      duration: 0,
      tracks: [],
      markers: [],
      loopRegion: null,
    },
    ...overrides,
  }
}

function resetMocks() {
  mockEntropic.showSaveDialog.mockReset().mockResolvedValue('/test/project.glitch')
  mockEntropic.showOpenDialog.mockReset().mockResolvedValue('/test/project.glitch')
  mockEntropic.readFile.mockReset().mockResolvedValue('{}')
  mockEntropic.writeFile.mockReset().mockResolvedValue(undefined)
  mockEntropic.deleteFile.mockReset().mockResolvedValue(undefined)
  mockEntropic.getAppPath.mockReset().mockResolvedValue('/test/userData')
}

describe('serializeProject', () => {
  beforeEach(() => {
    useProjectStore.getState().resetProject()
    useTimelineStore.getState().reset()
    useUndoStore.getState().clear()
    resetMocks()
  })

  it('produces valid JSON with required fields', () => {
    const json = serializeProject()
    const data = JSON.parse(json)

    expect(data.version).toBe('2.0.0')
    expect(data.id).toBeDefined()
    expect(typeof data.created).toBe('number')
    expect(typeof data.modified).toBe('number')
    expect(data.settings).toBeDefined()
    expect(data.settings.resolution).toEqual([1920, 1080])
    expect(data.settings.frameRate).toBe(30)
    expect(data.assets).toBeDefined()
    expect(data.timeline).toBeDefined()
    expect(Array.isArray(data.timeline.tracks)).toBe(true)
    expect(Array.isArray(data.timeline.markers)).toBe(true)
  })

  it('includes timeline tracks and markers', () => {
    useTimelineStore.getState().addTrack('Track 1', '#ff0000')
    useTimelineStore.getState().addMarker(5.0, 'Beat Drop', '#f59e0b')

    const json = serializeProject()
    const data = JSON.parse(json)

    expect(data.timeline.tracks).toHaveLength(1)
    expect(data.timeline.tracks[0].name).toBe('Track 1')
    expect(data.timeline.tracks[0].color).toBe('#ff0000')
    expect(data.timeline.markers).toHaveLength(1)
    expect(data.timeline.markers[0].label).toBe('Beat Drop')
  })

  it('includes loop region when set', () => {
    useTimelineStore.getState().setLoopRegion(2.0, 8.0)

    const json = serializeProject()
    const data = JSON.parse(json)

    expect(data.timeline.loopRegion).toEqual({ in: 2.0, out: 8.0 })
  })

  it('includes master effect chain', () => {
    useProjectStore.getState().addEffect({
      id: 'fx-1',
      effectId: 'pixel_sort',
      isEnabled: true,
      isFrozen: false,
      parameters: { threshold: 0.5 },
      modulations: {},
      mix: 1.0,
      mask: null,
    })

    const json = serializeProject()
    const data = JSON.parse(json)

    expect(data.masterEffectChain).toHaveLength(1)
    expect(data.masterEffectChain[0].effectId).toBe('pixel_sort')
  })
})

describe('validateProject', () => {
  it('accepts valid project data', () => {
    expect(validateProject(makeValidProject())).toBe(true)
  })

  it('rejects null', () => {
    expect(validateProject(null)).toBe(false)
  })

  it('rejects non-object', () => {
    expect(validateProject('not an object')).toBe(false)
    expect(validateProject(42)).toBe(false)
    expect(validateProject([])).toBe(false)
  })

  it('rejects missing required field: version', () => {
    const data = makeValidProject()
    delete (data as Record<string, unknown>).version
    expect(validateProject(data)).toBe(false)
  })

  it('rejects missing required field: id', () => {
    const data = makeValidProject()
    delete (data as Record<string, unknown>).id
    expect(validateProject(data)).toBe(false)
  })

  it('rejects missing required field: settings', () => {
    const data = makeValidProject()
    delete (data as Record<string, unknown>).settings
    expect(validateProject(data)).toBe(false)
  })

  it('rejects missing required field: timeline', () => {
    const data = makeValidProject()
    delete (data as Record<string, unknown>).timeline
    expect(validateProject(data)).toBe(false)
  })

  it('rejects missing required field: assets', () => {
    const data = makeValidProject()
    delete (data as Record<string, unknown>).assets
    expect(validateProject(data)).toBe(false)
  })

  it('rejects wrong type for version', () => {
    expect(validateProject(makeValidProject({ version: 123 }))).toBe(false)
  })

  it('rejects wrong type for created', () => {
    expect(validateProject(makeValidProject({ created: 'not-a-number' }))).toBe(false)
  })

  it('rejects settings without resolution', () => {
    const data = makeValidProject({
      settings: { frameRate: 30, audioSampleRate: 44100, masterVolume: 1, seed: 42 },
    })
    expect(validateProject(data)).toBe(false)
  })

  it('rejects settings with wrong resolution shape', () => {
    const data = makeValidProject({
      settings: { resolution: [1920], frameRate: 30, audioSampleRate: 44100, masterVolume: 1, seed: 42 },
    })
    expect(validateProject(data)).toBe(false)
  })

  it('rejects timeline without tracks array', () => {
    const data = makeValidProject({
      timeline: { duration: 0, markers: [], loopRegion: null },
    })
    expect(validateProject(data)).toBe(false)
  })

  it('rejects timeline without markers array', () => {
    const data = makeValidProject({
      timeline: { duration: 0, tracks: [], loopRegion: null },
    })
    expect(validateProject(data)).toBe(false)
  })

  it('rejects null settings', () => {
    expect(validateProject(makeValidProject({ settings: null }))).toBe(false)
  })
})

describe('hydrateStores', () => {
  beforeEach(() => {
    useProjectStore.getState().resetProject()
    useTimelineStore.getState().reset()
    useUndoStore.getState().clear()
    resetMocks()
  })

  it('resets stores before hydrating', () => {
    useTimelineStore.getState().addTrack('Old Track', '#000')
    useUndoStore.getState().execute({
      forward: () => {},
      inverse: () => {},
      description: 'old action',
      timestamp: Date.now(),
    })

    hydrateStores(makeValidProject() as any)

    expect(useTimelineStore.getState().tracks).toHaveLength(0)
    expect(useUndoStore.getState().past).toHaveLength(0)
    expect(useUndoStore.getState().isDirty).toBe(false)
  })

  it('hydrates tracks from project', () => {
    const project = makeValidProject({
      timeline: {
        duration: 30,
        tracks: [
          {
            id: 't1',
            type: 'video',
            name: 'Video 1',
            color: '#ef4444',
            isMuted: false,
            isSoloed: false,
            opacity: 0.8,
            blendMode: 'add',
            clips: [],
            effectChain: [],
            automationLanes: [],
          },
        ],
        markers: [],
        loopRegion: null,
      },
    })

    hydrateStores(project as any)

    const tracks = useTimelineStore.getState().tracks
    expect(tracks).toHaveLength(1)
    expect(tracks[0].name).toBe('Video 1')
    expect(tracks[0].color).toBe('#ef4444')
    expect(tracks[0].opacity).toBe(0.8)
    expect(tracks[0].blendMode).toBe('add')
  })

  it('hydrates markers from project', () => {
    const project = makeValidProject({
      timeline: {
        duration: 0,
        tracks: [],
        markers: [
          { id: 'm1', time: 3.5, label: 'Verse', color: '#f59e0b' },
        ],
        loopRegion: null,
      },
    })

    hydrateStores(project as any)

    const markers = useTimelineStore.getState().markers
    expect(markers).toHaveLength(1)
    expect(markers[0].label).toBe('Verse')
    expect(markers[0].time).toBe(3.5)
  })

  it('hydrates loop region', () => {
    const project = makeValidProject({
      timeline: {
        duration: 0,
        tracks: [],
        markers: [],
        loopRegion: { in: 4.0, out: 12.0 },
      },
    })

    hydrateStores(project as any)

    expect(useTimelineStore.getState().loopRegion).toEqual({ in: 4.0, out: 12.0 })
  })

  it('hydrates master effect chain', () => {
    const project = {
      ...makeValidProject(),
      masterEffectChain: [
        {
          id: 'fx-1',
          effectId: 'datamosh',
          isEnabled: true,
          isFrozen: false,
          parameters: {},
          modulations: {},
          mix: 0.75,
          mask: null,
        },
      ],
    }

    hydrateStores(project as any)

    const chain = useProjectStore.getState().effectChain
    expect(chain).toHaveLength(1)
    expect(chain[0].effectId).toBe('datamosh')
    expect(chain[0].mix).toBe(0.75)
  })

  it('hydrates duration', () => {
    const project = makeValidProject({
      timeline: {
        duration: 120.5,
        tracks: [],
        markers: [],
        loopRegion: null,
      },
    })

    hydrateStores(project as any)

    expect(useTimelineStore.getState().duration).toBe(120.5)
  })
})

describe('saveProject', () => {
  beforeEach(() => {
    useProjectStore.getState().resetProject()
    useTimelineStore.getState().reset()
    useUndoStore.getState().clear()
    resetMocks()
  })

  it('shows save dialog on first save', async () => {
    mockEntropic.showSaveDialog.mockResolvedValue('/test/my-project.glitch')

    const result = await saveProject()

    expect(result).toBe(true)
    expect(mockEntropic.showSaveDialog).toHaveBeenCalled()
    expect(mockEntropic.writeFile).toHaveBeenCalledWith(
      '/test/my-project.glitch',
      expect.any(String),
    )
  })

  it('skips dialog when projectPath is set', async () => {
    useProjectStore.getState().setProjectPath('/existing/project.glitch')

    const result = await saveProject()

    expect(result).toBe(true)
    expect(mockEntropic.showSaveDialog).not.toHaveBeenCalled()
    expect(mockEntropic.writeFile).toHaveBeenCalledWith(
      '/existing/project.glitch',
      expect.any(String),
    )
  })

  it('returns false when user cancels dialog', async () => {
    mockEntropic.showSaveDialog.mockResolvedValue(null)

    const result = await saveProject()

    expect(result).toBe(false)
    expect(mockEntropic.writeFile).not.toHaveBeenCalled()
  })

  it('clears isDirty after successful save', async () => {
    useUndoStore.getState().execute({
      forward: () => {},
      inverse: () => {},
      description: 'test',
      timestamp: Date.now(),
    })
    expect(useUndoStore.getState().isDirty).toBe(true)

    mockEntropic.showSaveDialog.mockResolvedValue('/test/project.glitch')
    await saveProject()

    expect(useUndoStore.getState().isDirty).toBe(false)
  })

  it('sets projectPath and projectName after save', async () => {
    mockEntropic.showSaveDialog.mockResolvedValue('/home/user/MyProject.glitch')
    await saveProject()

    expect(useProjectStore.getState().projectPath).toBe('/home/user/MyProject.glitch')
    expect(useProjectStore.getState().projectName).toBe('MyProject')
  })

  it('writes valid JSON that passes validation', async () => {
    mockEntropic.showSaveDialog.mockResolvedValue('/test/project.glitch')
    await saveProject()

    const writtenJson = mockEntropic.writeFile.mock.calls[0][1]
    const parsed = JSON.parse(writtenJson)
    expect(validateProject(parsed)).toBe(true)
  })
})

describe('loadProject', () => {
  beforeEach(() => {
    useProjectStore.getState().resetProject()
    useTimelineStore.getState().reset()
    useUndoStore.getState().clear()
    resetMocks()
  })

  it('loads valid project file and hydrates stores', async () => {
    const validProject = makeValidProject({
      timeline: {
        duration: 60,
        tracks: [
          {
            id: 't1',
            type: 'video',
            name: 'Loaded Track',
            color: '#3b82f6',
            isMuted: false,
            isSoloed: false,
            opacity: 1.0,
            blendMode: 'normal',
            clips: [],
            effectChain: [],
            automationLanes: [],
          },
        ],
        markers: [],
        loopRegion: null,
      },
    })

    mockEntropic.showOpenDialog.mockResolvedValue('/test/loaded.glitch')
    mockEntropic.readFile.mockResolvedValue(JSON.stringify(validProject))

    const result = await loadProject()

    expect(result).toBe(true)
    expect(useTimelineStore.getState().tracks).toHaveLength(1)
    expect(useTimelineStore.getState().tracks[0].name).toBe('Loaded Track')
    expect(useProjectStore.getState().projectPath).toBe('/test/loaded.glitch')
    expect(useProjectStore.getState().projectName).toBe('loaded')
  })

  it('returns false when user cancels dialog', async () => {
    mockEntropic.showOpenDialog.mockResolvedValue(null)

    const result = await loadProject()

    expect(result).toBe(false)
  })

  it('rejects malformed JSON (SEC-12)', async () => {
    mockEntropic.showOpenDialog.mockResolvedValue('/test/bad.glitch')
    mockEntropic.readFile.mockResolvedValue('{not valid json!!!}')

    const result = await loadProject()

    expect(result).toBe(false)
  })

  it('rejects valid JSON that fails validation (SEC-12)', async () => {
    const invalidProject = { version: 123, id: 'bad' }

    mockEntropic.showOpenDialog.mockResolvedValue('/test/invalid.glitch')
    mockEntropic.readFile.mockResolvedValue(JSON.stringify(invalidProject))

    const result = await loadProject()

    expect(result).toBe(false)
  })

  it('stores remain unchanged after failed load', async () => {
    useTimelineStore.getState().addTrack('Existing', '#fff')
    const trackCountBefore = useTimelineStore.getState().tracks.length

    mockEntropic.showOpenDialog.mockResolvedValue('/test/bad.glitch')
    mockEntropic.readFile.mockResolvedValue('not json')

    await loadProject()

    expect(useTimelineStore.getState().tracks).toHaveLength(trackCountBefore)
  })
})

describe('newProject', () => {
  beforeEach(() => {
    resetMocks()
  })

  it('resets all stores', () => {
    useProjectStore.getState().setProjectPath('/test/project.glitch')
    useProjectStore.getState().setProjectName('TestProject')
    useTimelineStore.getState().addTrack('Track 1', '#ff0000')
    useUndoStore.getState().execute({
      forward: () => {},
      inverse: () => {},
      description: 'test',
      timestamp: Date.now(),
    })

    newProject()

    expect(useProjectStore.getState().projectPath).toBeNull()
    expect(useProjectStore.getState().projectName).toBe('Untitled')
    expect(useTimelineStore.getState().tracks).toHaveLength(0)
    expect(useUndoStore.getState().past).toHaveLength(0)
    expect(useUndoStore.getState().isDirty).toBe(false)
  })
})

describe('autosave', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useProjectStore.getState().resetProject()
    useTimelineStore.getState().reset()
    useUndoStore.getState().clear()
    resetMocks()
    stopAutosave()
  })

  afterEach(() => {
    stopAutosave()
    vi.useRealTimers()
  })

  it('writes autosave alongside project when path is set', async () => {
    useProjectStore.getState().setProjectPath('/home/user/project.glitch')
    useUndoStore.getState().execute({
      forward: () => {},
      inverse: () => {},
      description: 'change',
      timestamp: Date.now(),
    })

    startAutosave()
    await vi.advanceTimersByTimeAsync(60_000)

    expect(mockEntropic.writeFile).toHaveBeenCalledWith(
      '/home/user/.autosave.glitch',
      expect.any(String),
    )
  })

  it('writes autosave to userData when no project path', async () => {
    useUndoStore.getState().execute({
      forward: () => {},
      inverse: () => {},
      description: 'change',
      timestamp: Date.now(),
    })

    startAutosave()
    await vi.advanceTimersByTimeAsync(60_000)

    expect(mockEntropic.getAppPath).toHaveBeenCalledWith('userData')
    expect(mockEntropic.writeFile).toHaveBeenCalledWith(
      '/test/userData/.autosave.glitch',
      expect.any(String),
    )
  })

  it('does not autosave when not dirty', async () => {
    startAutosave()
    await vi.advanceTimersByTimeAsync(60_000)

    expect(mockEntropic.writeFile).not.toHaveBeenCalled()
  })

  it('stopAutosave prevents further writes', async () => {
    useUndoStore.getState().execute({
      forward: () => {},
      inverse: () => {},
      description: 'change',
      timestamp: Date.now(),
    })

    startAutosave()
    stopAutosave()
    await vi.advanceTimersByTimeAsync(120_000)

    expect(mockEntropic.writeFile).not.toHaveBeenCalled()
  })
})
