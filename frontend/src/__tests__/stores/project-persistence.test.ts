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
  fileExists: vi.fn().mockResolvedValue(true),
  getAppPath: vi.fn().mockResolvedValue('/test/userData'),
}

;(globalThis as any).window = { entropic: mockEntropic }

import { useProjectStore } from '../../renderer/stores/project'
import { useTimelineStore } from '../../renderer/stores/timeline'
import { useUndoStore } from '../../renderer/stores/undo'
import { useOperatorStore } from '../../renderer/stores/operators'
import { useAutomationStore } from '../../renderer/stores/automation'
import { useToastStore } from '../../renderer/stores/toast'
import { getTrackCompositing } from '../../shared/types'
import {
  serializeProject,
  validateProject,
  hydrateStores,
  saveProject,
  loadProject,
  newProject,
  startAutosave,
  stopAutosave,
  restoreAutosave,
} from '../../renderer/project-persistence'

// Helper: build a valid project JSON object
// P2.2a (slice 3c): default to the v3 schema (composite-as-terminal-effect).
function makeValidProject(overrides: Record<string, unknown> = {}) {
  return {
    version: '3.0.0',
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

    expect(data.version).toBe('3.0.0')
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

  it('includes timeline zoom in the payload (F-0512-25)', () => {
    useTimelineStore.getState().setZoom(125)

    const json = serializeProject()
    const data = JSON.parse(json)

    expect(data.timeline.zoom).toBe(125)
  })

  it('serializes per-track effect chains (Epic 05: no global masterEffectChain)', () => {
    // Epic 05 D2: masterEffectChain removed. Per-track chains are serialized
    // inside timeline.tracks[].effectChain.
    const trackId = useTimelineStore.getState().addTrack('V1', '#ff0000')!
    useTimelineStore.getState().updateTrackEffectChain(trackId, () => [{
      id: 'fx-1',
      effectId: 'pixel_sort',
      isEnabled: true,
      isFrozen: false,
      parameters: { threshold: 0.5 },
      modulations: {},
      mix: 1.0,
      mask: null,
    }])

    const json = serializeProject()
    const data = JSON.parse(json)

    // No global masterEffectChain in the output
    expect(data.masterEffectChain).toBeUndefined()
    // Per-track chain is serialized under timeline.tracks
    expect(data.timeline.tracks).toHaveLength(1)
    expect(data.timeline.tracks[0].effectChain).toHaveLength(1)
    expect(data.timeline.tracks[0].effectChain[0].effectId).toBe('pixel_sort')
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

  // --- Deeper validation (Phase 4 hardening) ---

  it('rejects asset with missing meta object', () => {
    const data = makeValidProject({
      assets: { 'a1': { id: 'a1', path: '/test.mp4', type: 'video' } },
    })
    expect(validateProject(data)).toBe(false)
  })

  it('accepts asset with valid meta object', () => {
    const data = makeValidProject({
      assets: {
        'a1': {
          id: 'a1', path: '/test.mp4', type: 'video',
          meta: { width: 1920, height: 1080, duration: 30, fps: 30, codec: 'h264', hasAudio: true },
        },
      },
    })
    expect(validateProject(data)).toBe(true)
  })

  it('rejects track with missing id', () => {
    const data = makeValidProject({
      timeline: {
        duration: 0,
        tracks: [{ name: 'Bad Track', color: '#fff', clips: [], effectChain: [], automationLanes: [] }],
        markers: [],
        loopRegion: null,
      },
    })
    expect(validateProject(data)).toBe(false)
  })

  it('rejects clip with NaN position', () => {
    const data = makeValidProject({
      timeline: {
        duration: 10,
        tracks: [{
          id: 't1', type: 'video', name: 'T1', color: '#fff',
          isMuted: false, isSoloed: false, opacity: 1, blendMode: 'normal',
          clips: [{ id: 'c1', assetId: 'a1', trackId: 't1', position: NaN, duration: 5, inPoint: 0, outPoint: 5, speed: 1 }],
          effectChain: [], automationLanes: [],
        }],
        markers: [],
        loopRegion: null,
      },
    })
    expect(validateProject(data)).toBe(false)
  })

  it('rejects clip with Infinity duration', () => {
    const data = makeValidProject({
      timeline: {
        duration: 10,
        tracks: [{
          id: 't1', type: 'video', name: 'T1', color: '#fff',
          isMuted: false, isSoloed: false, opacity: 1, blendMode: 'normal',
          clips: [{ id: 'c1', assetId: 'a1', trackId: 't1', position: 0, duration: Infinity, inPoint: 0, outPoint: 5, speed: 1 }],
          effectChain: [], automationLanes: [],
        }],
        markers: [],
        loopRegion: null,
      },
    })
    expect(validateProject(data)).toBe(false)
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

    // M.1 (Master-Out Bus PRD): a project with no tracks (makeValidProject's
    // default) hydrates to exactly ONE track — the migration-injected Master
    // (absent -> create). The pre-M.1 "old track gone, nothing new" story is
    // still intact: it's a FRESH master, not the "Old Track" from before, and
    // addMasterTrack is a direct (non-undoable) write, so it does NOT push
    // onto the undo stack or dirty the project (see timeline.ts addMasterTrack).
    const tracks = useTimelineStore.getState().tracks
    expect(tracks).toHaveLength(1)
    expect(tracks[0].type).toBe('master')
    expect(useUndoStore.getState().past).toHaveLength(0)
    expect(useUndoStore.getState().isDirty).toBe(false)
  })

  it('hydrates tracks from project', () => {
    // P2.2a (slice 3c): compositing lives in a terminal CompositeEffect on the
    // chain, not Track.opacity/blendMode. v3 fixtures carry the composite in
    // effectChain; opacity/mode resolve via getTrackCompositing.
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
            clips: [],
            effectChain: [
              {
                id: 'comp1',
                effectId: 'composite',
                isEnabled: true,
                isFrozen: false,
                parameters: { opacity: 0.8, mode: 'add' },
                modulations: {},
                mix: 1,
                mask: null,
              },
            ],
            automationLanes: [],
          },
        ],
        markers: [],
        loopRegion: null,
      },
    })

    hydrateStores(project as any)

    // M.1: the saved project has no Master track, so hydrate injects one
    // (migration) — 1 video track + 1 injected Master = 2.
    const tracks = useTimelineStore.getState().tracks
    expect(tracks).toHaveLength(2)
    expect(tracks[0].name).toBe('Video 1')
    expect(tracks[0].color).toBe('#ef4444')
    const compositing = getTrackCompositing(tracks[0].effectChain)
    expect(compositing.opacity).toBe(0.8)
    expect(compositing.mode).toBe('add')
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

  it('hydrates timeline zoom from project (F-0512-25)', () => {
    const project = makeValidProject({
      timeline: {
        duration: 0,
        tracks: [],
        markers: [],
        loopRegion: null,
        zoom: 125,
      },
    })

    hydrateStores(project as any)

    expect(useTimelineStore.getState().zoom).toBe(125)
  })

  it('leaves zoom at default when project omits the field (legacy compat) (F-0512-25)', () => {
    // Old .glitch files have no timeline.zoom field — must not crash and must
    // fall back to the store default (50).
    useTimelineStore.getState().setZoom(99)  // poison the default to prove reset works
    const project = makeValidProject() // no zoom in timeline

    hydrateStores(project as any)

    // hydrateStores calls timelineStore.reset() first which sets zoom back to 50.
    expect(useTimelineStore.getState().zoom).toBe(50)
  })

  it('hydrates per-track effect chain (Epic 05: no global masterEffectChain)', () => {
    // Epic 05 D1: per-track effectChain restored during track hydration.
    const project = makeValidProject({
      timeline: {
        duration: 0,
        tracks: [
          {
            id: 't1',
            type: 'video',
            name: 'V1',
            color: '#ef4444',
            isMuted: false,
            isSoloed: false,
            opacity: 1,
            blendMode: 'normal',
            clips: [],
            effectChain: [
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
            automationLanes: [],
          },
        ],
        markers: [],
        loopRegion: null,
      },
    })

    hydrateStores(project as any)

    // M.1: no Master track in this fixture → hydrate injects one.
    const tracks = useTimelineStore.getState().tracks
    expect(tracks).toHaveLength(2)
    const chain = tracks[0].effectChain
    expect(chain).toHaveLength(1)
    expect(chain[0].effectId).toBe('datamosh')
    expect(chain[0].mix).toBe(0.75)
    // Global effectChain field no longer exists
    expect((useProjectStore.getState() as any).effectChain).toBeUndefined()
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

// Loop 52 — operators + automation roundtrip
// Synthesis Iter 28/29 named this loop for Playwright; this covers the data
// layer (serialize → hydrate) in vitest. Frame-diff visuals remain Playwright work.
describe('Loop 52: operators + automation roundtrip via serialize → hydrate', () => {
  beforeEach(() => {
    useProjectStore.getState().resetProject()
    useTimelineStore.getState().reset()
    useUndoStore.getState().clear()
    useOperatorStore.getState().resetOperators()
    useAutomationStore.getState().resetAutomation()
    resetMocks()
  })

  it('serializeProject includes operators[] from the operator store', () => {
    useOperatorStore.getState().addOperator('lfo')
    useOperatorStore.getState().addOperator('envelope')

    const json = serializeProject()
    const parsed = JSON.parse(json)

    expect(Array.isArray(parsed.operators)).toBe(true)
    expect(parsed.operators).toHaveLength(2)
    expect(parsed.operators[0].type).toBe('lfo')
    expect(parsed.operators[1].type).toBe('envelope')
  })

  it('hydrateStores restores operators with id + type + parameters preserved', () => {
    const operatorPayload = [
      {
        id: 'lfo-roundtrip',
        type: 'lfo',
        label: 'Test LFO',
        isEnabled: true,
        parameters: { waveform: 'square', rate_hz: 2.5, phase_offset: 0.25 },
        processing: [],
        mappings: [],
      },
    ]
    const project = makeValidProject({ operators: operatorPayload })

    hydrateStores(project as any)

    const restored = useOperatorStore.getState().operators
    expect(restored).toHaveLength(1)
    expect(restored[0].id).toBe('lfo-roundtrip')
    expect(restored[0].type).toBe('lfo')
    expect(restored[0].parameters.waveform).toBe('square')
    expect(restored[0].parameters.rate_hz).toBe(2.5)
  })

  it('serialize → parse → hydrate restores operators round-trip', () => {
    useOperatorStore.getState().addOperator('step_sequencer')
    const before = useOperatorStore.getState().operators
    expect(before).toHaveLength(1)
    const originalId = before[0].id

    const json = serializeProject()

    useOperatorStore.getState().resetOperators()
    expect(useOperatorStore.getState().operators).toHaveLength(0)

    hydrateStores(JSON.parse(json))

    const after = useOperatorStore.getState().operators
    expect(after).toHaveLength(1)
    expect(after[0].id).toBe(originalId)
    expect(after[0].type).toBe('step_sequencer')
  })

  it('hydrateStores filters out malformed operators (missing required fields)', () => {
    const operatorPayload = [
      {
        id: 'good',
        type: 'lfo',
        isEnabled: true,
        parameters: {},
        processing: [],
        mappings: [],
      },
      { type: 'lfo', isEnabled: true, parameters: {}, processing: [], mappings: [] },
      { id: 'bad-proc', type: 'lfo', isEnabled: true, parameters: {}, processing: null, mappings: [] },
    ]
    const project = makeValidProject({ operators: operatorPayload })

    hydrateStores(project as any)

    const restored = useOperatorStore.getState().operators
    expect(restored).toHaveLength(1)
    expect(restored[0].id).toBe('good')
  })

  it('serializeProject includes automationLanes keyed by trackId', () => {
    useAutomationStore.setState({
      lanes: {
        'track-1': [
          {
            id: 'lane-1',
            paramPath: 'effects.0.parameters.amount',
            points: [
              { time: 0, value: 0, curve: 0 },
              { time: 5, value: 1, curve: 0 },
            ],
            isEnabled: true,
            mode: 'smooth',
          },
        ],
      },
    })

    const json = serializeProject()
    const parsed = JSON.parse(json)

    expect(parsed.automationLanes).toBeDefined()
    expect(parsed.automationLanes['track-1']).toHaveLength(1)
    expect(parsed.automationLanes['track-1'][0].paramPath).toBe('effects.0.parameters.amount')
    expect(parsed.automationLanes['track-1'][0].points).toHaveLength(2)
  })

  it('hydrateStores restores automation lanes with points sorted by time', () => {
    const automationPayload = {
      'track-X': [
        {
          id: 'lane-out-of-order',
          paramPath: 'master.volume',
          points: [
            { time: 10, value: 0.5 },
            { time: 0, value: 0.0 },
            { time: 5, value: 1.0 },
          ],
          isEnabled: true,
          mode: 'smooth',
        },
      ],
    }
    const project = makeValidProject({ automationLanes: automationPayload })

    hydrateStores(project as any)

    const lanes = useAutomationStore.getState().lanes['track-X']
    expect(lanes).toBeDefined()
    expect(lanes).toHaveLength(1)
    expect(lanes[0].points.map((p) => p.time)).toEqual([0, 5, 10])
  })

  it('hydrateStores filters out non-finite automation points (trust boundary)', () => {
    const automationPayload = {
      'track-Y': [
        {
          id: 'lane-mixed',
          paramPath: 'master.volume',
          points: [
            { time: 0, value: 0.5 },
            { time: Infinity, value: 0.8 },
            { time: 5, value: NaN },
            { time: 10, value: 1.0 },
          ],
          isEnabled: true,
          mode: 'smooth',
        },
      ],
    }
    const project = makeValidProject({ automationLanes: automationPayload })

    hydrateStores(project as any)

    const points = useAutomationStore.getState().lanes['track-Y'][0].points
    expect(points).toHaveLength(2)
    expect(points.map((p) => p.time)).toEqual([0, 10])
  })

  it('full roundtrip: operators + automation survive serialize → parse → hydrate together', () => {
    useOperatorStore.getState().addOperator('lfo')
    useAutomationStore.setState({
      lanes: {
        'track-A': [
          {
            id: 'auto-1',
            paramPath: 'effects.0.parameters.amount',
            points: [
              { time: 0, value: 0, curve: 0 },
              { time: 2, value: 1, curve: 0 },
            ],
            isEnabled: true,
            mode: 'smooth',
          },
        ],
      },
    })

    const json = serializeProject()
    useOperatorStore.getState().resetOperators()
    useAutomationStore.getState().resetAutomation()
    hydrateStores(JSON.parse(json))

    expect(useOperatorStore.getState().operators).toHaveLength(1)
    expect(useAutomationStore.getState().lanes['track-A']).toBeDefined()
    expect(useAutomationStore.getState().lanes['track-A']).toHaveLength(1)
  })

  it('legacy project without operators/automation fields hydrates without crash', () => {
    const project = makeValidProject() // no operators / automationLanes fields

    expect(() => hydrateStores(project as any)).not.toThrow()
    expect(useOperatorStore.getState().operators).toEqual([])
    expect(useAutomationStore.getState().lanes).toEqual({})
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

    // UE.4: backup rotation may write .bak.N siblings first — select the
    // write that targets the project file itself.
    const projectWrite = mockEntropic.writeFile.mock.calls.find(
      (c: unknown[]) => c[0] === '/test/project.glitch',
    )
    expect(projectWrite).toBeDefined()
    const parsed = JSON.parse(projectWrite![1])
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
    // M.1: no Master track in this fixture → hydrate injects one (index 1;
    // the loaded video track stays index 0 — appended after the track loop).
    expect(useTimelineStore.getState().tracks).toHaveLength(2)
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

  it('invokes onHydrated callback after successful load (PLAY-010)', async () => {
    const validProject = makeValidProject()
    mockEntropic.readFile.mockResolvedValue(JSON.stringify(validProject))
    const onHydrated = vi.fn()

    const result = await loadProject('/test/recent.glitch', onHydrated)

    expect(result).toBe(true)
    expect(onHydrated).toHaveBeenCalledTimes(1)
  })

  it('does NOT invoke onHydrated callback when load fails (PLAY-010)', async () => {
    mockEntropic.readFile.mockRejectedValue(new Error('Access denied'))
    const onHydrated = vi.fn()

    const result = await loadProject('/test/recent.glitch', onHydrated)

    expect(result).toBe(false)
    expect(onHydrated).not.toHaveBeenCalled()
  })
})

describe('restoreAutosave', () => {
  beforeEach(() => {
    useProjectStore.getState().resetProject()
    useTimelineStore.getState().reset()
    useUndoStore.getState().clear()
    resetMocks()
  })

  it('invokes onHydrated callback after successful restore (PLAY-010)', async () => {
    const validProject = makeValidProject()
    mockEntropic.readFile.mockResolvedValue(JSON.stringify(validProject))
    const onHydrated = vi.fn()

    const result = await restoreAutosave('/test/.autosave.glitch', onHydrated)

    expect(result).toBe(true)
    expect(onHydrated).toHaveBeenCalledTimes(1)
  })

  it('does NOT invoke onHydrated callback when restore fails (PLAY-010)', async () => {
    mockEntropic.readFile.mockRejectedValue(new Error('Read failure'))
    const onHydrated = vi.fn()

    const result = await restoreAutosave('/test/.autosave.glitch', onHydrated)

    expect(result).toBe(false)
    expect(onHydrated).not.toHaveBeenCalled()
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
    // M.1 (Master-Out Bus PRD): every new project bootstraps exactly ONE
    // Master track (addMasterTrack is a direct, non-undoable write — see
    // timeline.ts — so it does not resurrect the undo stack or dirty flag
    // newProject just cleared).
    const tracks = useTimelineStore.getState().tracks
    expect(tracks).toHaveLength(1)
    expect(tracks[0].type).toBe('master')
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

// Epic 05 — persistence round-trip gate (D7)
// Two-track project: V1=[effect A], V2=[effect B] → serialize → hydrate → assert chains restored independently.
// This test MUST FAIL before the hydrate fix and PASS after.
describe('Epic 05: per-track effect chain round-trip (persistence spec)', () => {
  const EFFECT_A: import('../../shared/types').EffectInstance = {
    id: 'fx-a', effectId: 'pixel_sort', isEnabled: true, isFrozen: false,
    parameters: { threshold: 0.5 }, modulations: {}, mix: 1.0, mask: null,
  }
  const EFFECT_B: import('../../shared/types').EffectInstance = {
    id: 'fx-b', effectId: 'datamosh', isEnabled: true, isFrozen: false,
    parameters: { entropy: 0.7 }, modulations: {}, mix: 0.8, mask: null,
  }

  beforeEach(() => {
    useProjectStore.getState().resetProject()
    useTimelineStore.getState().reset()
    useUndoStore.getState().clear()
    resetMocks()
  })

  it('Scenario: Two-track chains restored independently (persistence spec)', () => {
    // Build V1 track with effectChain = [EFFECT_A]
    const v1Id = useTimelineStore.getState().addTrack('V1', '#ff0000')!
    useTimelineStore.getState().updateTrackEffectChain(v1Id, () => [{ ...EFFECT_A }])
    // Build V2 track with effectChain = [EFFECT_B]
    const v2Id = useTimelineStore.getState().addTrack('V2', '#0000ff')!
    useTimelineStore.getState().updateTrackEffectChain(v2Id, () => [{ ...EFFECT_B }])

    // Serialize
    const json = serializeProject()
    const serialized = JSON.parse(json)

    // Scenario: saved shape has no global master chain (persistence spec)
    expect(serialized.masterEffectChain).toBeUndefined()

    // Hydrate into fresh stores
    useProjectStore.getState().resetProject()
    useTimelineStore.getState().reset()
    useUndoStore.getState().clear()
    hydrateStores(serialized)

    // M.1: no Master track in this serialized fixture → hydrate injects one
    // (V1 + V2 + injected Master = 3). Lookups below are by name, unaffected.
    const tracks = useTimelineStore.getState().tracks
    expect(tracks).toHaveLength(3)

    const restoredV1 = tracks.find((t) => t.name === 'V1')
    const restoredV2 = tracks.find((t) => t.name === 'V2')
    expect(restoredV1).toBeDefined()
    expect(restoredV2).toBeDefined()

    // V1's chain == [EFFECT_A]
    expect(restoredV1!.effectChain).toHaveLength(1)
    expect(restoredV1!.effectChain[0].effectId).toBe('pixel_sort')
    expect(restoredV1!.effectChain[0].id).toBe('fx-a')

    // V2's chain == [EFFECT_B]
    expect(restoredV2!.effectChain).toHaveLength(1)
    expect(restoredV2!.effectChain[0].effectId).toBe('datamosh')
    expect(restoredV2!.effectChain[0].id).toBe('fx-b')

    // Neither track's chain leaked into the other
    expect(restoredV1!.effectChain.some((e) => e.effectId === 'datamosh')).toBe(false)
    expect(restoredV2!.effectChain.some((e) => e.effectId === 'pixel_sort')).toBe(false)
  })

  it('Scenario: Empty-chain track round-trips as empty (persistence spec)', () => {
    useTimelineStore.getState().addTrack('EmptyTrack', '#00ff00')!

    const json = serializeProject()
    const serialized = JSON.parse(json)

    useProjectStore.getState().resetProject()
    useTimelineStore.getState().reset()
    useUndoStore.getState().clear()
    hydrateStores(serialized)

    // M.1: no Master track in this serialized fixture → hydrate injects one
    // (appended after — EmptyTrack stays index 0).
    const tracks = useTimelineStore.getState().tracks
    expect(tracks).toHaveLength(2)
    expect(tracks[0].effectChain).toHaveLength(0)
  })

  it('Scenario: Malformed saved chain is dropped safely (persistence spec)', () => {
    // Build a project with a malformed effectChain entry (missing effectId)
    const validProject = makeValidProject({
      timeline: {
        duration: 0,
        tracks: [
          {
            id: 't1',
            type: 'video',
            name: 'TrackWithBadChain',
            color: '#fff',
            isMuted: false,
            isSoloed: false,
            opacity: 1,
            blendMode: 'normal',
            clips: [],
            effectChain: [
              // valid entry
              { id: 'fx-good', effectId: 'blur', isEnabled: true, isFrozen: false, parameters: {}, modulations: {}, mix: 1.0, mask: null },
              // malformed: no effectId
              { id: 'fx-bad', isEnabled: true, isFrozen: false, parameters: {}, modulations: {}, mix: 1.0, mask: null },
            ],
            automationLanes: [],
          },
        ],
        markers: [],
        loopRegion: null,
      },
    })

    // Should not throw
    expect(() => hydrateStores(validProject as any)).not.toThrow()

    // M.1: no Master track in this fixture → hydrate injects one (appended
    // after — TrackWithBadChain stays index 0).
    const tracks = useTimelineStore.getState().tracks
    expect(tracks).toHaveLength(2)
    // Malformed entry dropped, only the valid one survives
    expect(tracks[0].effectChain).toHaveLength(1)
    expect(tracks[0].effectChain[0].effectId).toBe('blur')
  })

  it('Scenario: Global effectChain field no longer exists on project store (persistence spec)', () => {
    const state = useProjectStore.getState()
    expect((state as any).effectChain).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// M.1 (Master-Out Bus PRD, docs/plans/2026-07-03-master-out-bus-prd.md) —
// bootstrap + migration for the permanent Master track. Mirrors the
// addInspectorTrack precedent test style (frontend/src/__tests__/inspector/
// inspector-track-type.test.ts) but for the "absent -> create, NEVER reject"
// migration contract that inspector does NOT have (inspector is optional;
// Master is mandatory, exactly one, always).
// ---------------------------------------------------------------------------
describe('Master track — bootstrap + migration (M.1)', () => {
  beforeEach(() => {
    useProjectStore.getState().resetProject()
    useTimelineStore.getState().reset()
    useUndoStore.getState().clear()
    useToastStore.setState({ toasts: [] })
    resetMocks()
  })

  it('newProject() bootstraps exactly ONE Master track at empty state', () => {
    newProject()
    const tracks = useTimelineStore.getState().tracks
    expect(tracks).toHaveLength(1)
    expect(tracks[0].type).toBe('master')
    expect(tracks[0].clips).toEqual([])
    expect(tracks[0].effectChain).toEqual([])
    expect(tracks[0].automationLanes).toEqual([])
  })

  it('validateProject accepts a track with type "master"', () => {
    const project = makeValidProject({
      timeline: {
        duration: 0,
        tracks: [
          { id: 'm1', type: 'master', name: 'Master', color: '#e8b923', isMuted: false, isSoloed: false, clips: [], effectChain: [], automationLanes: [] },
        ],
        markers: [],
        loopRegion: null,
      },
    })
    expect(validateProject(project)).toBe(true)
  })

  it('MIGRATION: a pre-feature project (no Master track) loads and gets one injected, unrejected', () => {
    // A project saved before M.1 shipped — one ordinary video track, no
    // 'master' type anywhere. Must NOT be rejected (validates fine) and must
    // NOT crash on hydrate.
    const preFeatureProject = makeValidProject({
      timeline: {
        duration: 10,
        tracks: [
          { id: 't1', type: 'video', name: 'Video 1', color: '#3b82f6', isMuted: false, isSoloed: false, clips: [], effectChain: [], automationLanes: [] },
        ],
        markers: [],
        loopRegion: null,
      },
    })
    expect(validateProject(preFeatureProject)).toBe(true)
    expect(() => hydrateStores(preFeatureProject as any)).not.toThrow()

    const tracks = useTimelineStore.getState().tracks
    expect(tracks).toHaveLength(2)
    expect(tracks[0].type).toBe('video') // pre-existing track unchanged, still first
    const master = tracks.find((t) => t.type === 'master')
    expect(master).toBeDefined()
    expect(master!.clips).toEqual([])
    expect(master!.effectChain).toEqual([])
  })

  it('a project that ALREADY has a Master track hydrates it as-is (no double-inject)', () => {
    const project = makeValidProject({
      timeline: {
        duration: 0,
        tracks: [
          {
            id: 'm1', type: 'master', name: 'Master', color: '#e8b923', isMuted: false, isSoloed: false,
            clips: [], automationLanes: [],
            effectChain: [
              { id: 'fx-1', effectId: 'fx.invert', isEnabled: true, isFrozen: false, parameters: {}, modulations: {}, mix: 1.0, mask: null },
            ],
          },
        ],
        markers: [],
        loopRegion: null,
      },
    })
    hydrateStores(project as any)

    const tracks = useTimelineStore.getState().tracks
    expect(tracks.filter((t) => t.type === 'master')).toHaveLength(1)
    expect(tracks).toHaveLength(1)
    // The SAVED chain survived — hydrate did not inject a fresh empty one on
    // top of / instead of the real saved Master.
    expect(tracks[0].effectChain).toHaveLength(1)
    expect(tracks[0].effectChain[0].effectId).toBe('fx.invert')
  })

  it('CORRUPTION GUARD: 2+ Master tracks in a saved project keep the first, drop the rest', () => {
    const project = makeValidProject({
      timeline: {
        duration: 0,
        tracks: [
          {
            id: 'm1', type: 'master', name: 'Master A (first)', color: '#e8b923', isMuted: false, isSoloed: false,
            clips: [], automationLanes: [],
            effectChain: [
              { id: 'fx-first', effectId: 'fx.invert', isEnabled: true, isFrozen: false, parameters: {}, modulations: {}, mix: 1.0, mask: null },
            ],
          },
          {
            id: 'm2', type: 'master', name: 'Master B (duplicate)', color: '#ff0000', isMuted: false, isSoloed: false,
            clips: [], automationLanes: [],
            effectChain: [
              { id: 'fx-second', effectId: 'fx.pixel_sort', isEnabled: true, isFrozen: false, parameters: {}, modulations: {}, mix: 1.0, mask: null },
            ],
          },
        ],
        markers: [],
        loopRegion: null,
      },
    })
    expect(() => hydrateStores(project as any)).not.toThrow()

    const tracks = useTimelineStore.getState().tracks
    const masters = tracks.filter((t) => t.type === 'master')
    expect(masters).toHaveLength(1)
    // The FIRST one's data survived — not the second's.
    expect(masters[0].name).toBe('Master A (first)')
    expect(masters[0].effectChain).toHaveLength(1)
    expect(masters[0].effectChain[0].effectId).toBe('fx.invert')
    // A toast warned about the drop.
    const toasts = useToastStore.getState().toasts
    expect(toasts.some((t) => /multiple master/i.test(t.message))).toBe(true)
  })

  it('a legacy project with an EXPLICIT unknown track type still gets a Master injected', () => {
    // Belt-and-suspenders: the unknown-type-drop path and the master-injection
    // path are independent — an unrelated forward-tolerance drop must not
    // suppress the migration.
    const project = makeValidProject({
      timeline: {
        duration: 0,
        tracks: [
          { id: 'x1', type: 'hologram', name: 'FromFuture', color: '#fff', isMuted: false, isSoloed: false, clips: [] },
        ],
        markers: [],
        loopRegion: null,
      },
    })
    expect(() => hydrateStores(project as any)).not.toThrow()
    const tracks = useTimelineStore.getState().tracks
    expect(tracks).toHaveLength(1)
    expect(tracks[0].type).toBe('master')
  })
})
