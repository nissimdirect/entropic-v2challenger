/**
 * P6.8 (I1) — inspector track type: store creation, persistence validation,
 * legacy-load tolerance, forward-tolerance for unknown types, and a real
 * save→load round-trip with probe bindings.
 *
 * Named tests (packet TEST PLAN):
 *   - add inspector track
 *   - legacy project without inspector tracks loads          (negative)
 *   - unknown track type in project file dropped with toast  (negative, forward-tolerance)
 *   - save/load round-trip with probes
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

let lastWrittenJson = ''
const mockEntropic = {
  showOpenDialog: vi.fn().mockResolvedValue('/test/project.glitch'),
  showSaveDialog: vi.fn().mockResolvedValue('/test/project.glitch'),
  readFile: vi.fn().mockResolvedValue('{}'),
  writeFile: vi.fn().mockImplementation(async (_p: string, data: string) => {
    lastWrittenJson = data
  }),
  deleteFile: vi.fn().mockResolvedValue(undefined),
  fileExists: vi.fn().mockResolvedValue(false),
  listFiles: vi.fn().mockResolvedValue([]),
  getAppPath: vi.fn().mockResolvedValue('/test/userData'),
  writeRecentProjects: vi.fn().mockResolvedValue(undefined),
  readRecentProjects: vi.fn().mockResolvedValue([]),
  sendCommand: vi.fn().mockResolvedValue({ ok: true }),
}
;(globalThis as any).window = { entropic: mockEntropic }

import { validateProjectStructure, hydrateStores, saveProject } from '../../renderer/project-persistence'
import { useTimelineStore } from '../../renderer/stores/timeline'
import { useProjectStore } from '../../renderer/stores/project'
import { useToastStore } from '../../renderer/stores/toast'

beforeEach(() => {
  useTimelineStore.getState().reset()
  useToastStore.setState({ toasts: [] })
  lastWrittenJson = ''
})

function baseProject(tracks: unknown[]) {
  return {
    version: '3.0.0',
    id: 'p1',
    created: Date.now(),
    modified: Date.now(),
    timeline: { duration: 0, tracks, markers: [], loopRegion: null },
    assets: {},
  }
}

describe('inspector track — store creation', () => {
  it('add inspector track creates exactly one inspector track', () => {
    const id = useTimelineStore.getState().addInspectorTrack()
    expect(id).toBeTruthy()
    const tracks = useTimelineStore.getState().tracks
    expect(tracks.filter((t) => t.type === 'inspector')).toHaveLength(1)
    expect(tracks[0].probeBindings).toEqual([])
  })

  it('a second addInspectorTrack is a no-op returning the existing id (max 1)', () => {
    const id1 = useTimelineStore.getState().addInspectorTrack()
    const id2 = useTimelineStore.getState().addInspectorTrack()
    expect(id2).toBe(id1)
    expect(useTimelineStore.getState().tracks.filter((t) => t.type === 'inspector')).toHaveLength(1)
  })
})

describe('inspector track — persistence validation', () => {
  it('validator accepts an inspector track', () => {
    const data = baseProject([
      { id: 't1', name: 'Inspector', type: 'inspector', clips: [], probeBindings: [] },
    ])
    expect(validateProjectStructure(data).valid).toBe(true)
  })

  // NEGATIVE: legacy project (no inspector tracks, pre-Phase-6 shape) must load.
  it('legacy project without inspector tracks loads without crash', () => {
    const data = baseProject([
      { id: 'v1', name: 'Video', type: 'video', clips: [] },
      { id: 'a1', name: 'Audio', type: 'audio', clips: [], audioClips: [] },
    ])
    expect(validateProjectStructure(data).valid).toBe(true)
    expect(() => hydrateStores(data as any)).not.toThrow()
    const types = useTimelineStore.getState().tracks.map((t) => t.type)
    expect(types).toContain('video')
    expect(types).toContain('audio')
    expect(types).not.toContain('inspector')
  })

  // NEGATIVE: a track from a FUTURE/unknown type must NOT crash the loader —
  // it is dropped and a toast is shown (forward-tolerance for safe rollback).
  it('unknown track type in project file dropped with toast (not rejected)', () => {
    const data = baseProject([
      { id: 'v1', name: 'Video', type: 'video', clips: [] },
      { id: 'x1', name: 'FromFuture', type: 'hologram', clips: [] },
    ])
    // Validator no longer hard-rejects unknown string types.
    expect(validateProjectStructure(data).valid).toBe(true)
    expect(() => hydrateStores(data as any)).not.toThrow()
    const types = useTimelineStore.getState().tracks.map((t) => t.type)
    // M.1 (Master-Out Bus PRD): no Master track in this fixture -> hydrate
    // injects one (appended last). hologram is still dropped.
    expect(types).toEqual(['video', 'master'])
    const toasts = useToastStore.getState().toasts
    expect(toasts.some((t) => /unknown type/i.test(t.message))).toBe(true)
  })
})

describe('inspector track — save/load round-trip with probes', () => {
  it('persists inspector track + probe bindings across save and reload', async () => {
    // Build a project: one inspector track with two probes.
    const trackId = useTimelineStore.getState().addInspectorTrack()!
    useTimelineStore.getState().addProbeBinding(trackId, {
      kind: 'param_postmod',
      effectId: 'fx-instance-1',
      paramPath: 'radius',
      label: 'Blur · radius',
    })
    useTimelineStore.getState().addProbeBinding(trackId, {
      kind: 'param_postmod',
      effectId: 'fx-instance-2',
      paramPath: 'shift',
      label: 'Hue · shift',
    })
    useProjectStore.getState().setProjectPath('/test/project.glitch')

    const ok = await saveProject()
    expect(ok).toBe(true)
    expect(lastWrittenJson).toContain('inspector')
    expect(lastWrittenJson).toContain('probeBindings')

    // Reload from the serialized JSON — a true round-trip.
    const reloaded = JSON.parse(lastWrittenJson)
    hydrateStores(reloaded)

    const inspectorTracks = useTimelineStore.getState().tracks.filter((t) => t.type === 'inspector')
    expect(inspectorTracks).toHaveLength(1)
    const bindings = inspectorTracks[0].probeBindings ?? []
    expect(bindings).toHaveLength(2)
    expect(bindings.map((b) => b.paramPath).sort()).toEqual(['radius', 'shift'])
    expect(bindings.map((b) => b.effectId).sort()).toEqual(['fx-instance-1', 'fx-instance-2'])
  })
})
