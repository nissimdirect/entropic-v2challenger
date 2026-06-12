/**
 * B2 — per-track samplers survive project save/load, with numeric fields
 * clamped at the deserialization trust boundary.
 *
 * G10 seam (B1→B2): #156 shipped a GLOBAL single `instrument`; #167 supersedes
 * it with track-keyed `instruments`. Legacy saves carrying `instrument` load
 * WITHOUT crash — the sampler is dropped with a warning toast (clean-break
 * policy permits drop-with-toast, never a throw).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// window.entropic mock before store imports (matches project-persistence.test.ts).
const mockEntropic = {
  onEngineStatus: vi.fn(),
  sendCommand: vi.fn().mockResolvedValue({ ok: true }),
  onExportProgress: vi.fn().mockReturnValue(vi.fn()),
}
;(globalThis as unknown as { window: unknown }).window = { entropic: mockEntropic }

import { serializeProject, validateProject, hydrateStores } from '../../renderer/project-persistence'
import { useInstrumentsStore } from '../../renderer/stores/instruments'
import { useTimelineStore } from '../../renderer/stores/timeline'
import { useToastStore } from '../../renderer/stores/toast'

function makeValidProject(overrides: Record<string, unknown> = {}): Parameters<typeof hydrateStores>[0] {
  return ({
    version: '3.0.0',
    id: 'p1',
    created: 1700000000000,
    modified: 1700000000000,
    author: '',
    settings: { resolution: [1920, 1080], frameRate: 30, audioSampleRate: 44100, masterVolume: 1.0, seed: 42 },
    assets: {},
    timeline: { duration: 0, tracks: [], markers: [], loopRegion: null },
    ...overrides,
  }) as unknown as Parameters<typeof hydrateStores>[0]
}

function makeSampler(overrides: Record<string, unknown> = {}) {
  return {
    id: 'samp-1',
    type: 'sampler',
    clipId: 'asset-1',
    startFrame: 0,
    speed: 1,
    opacity: 1,
    blendMode: 'normal',
    ...overrides,
  }
}

beforeEach(() => {
  useInstrumentsStore.setState({ instruments: {} })
  useTimelineStore.getState().reset()
  useToastStore.setState({ toasts: [] })
})

describe('per-track sampler persistence (B2 shape)', () => {
  it('serializeProject writes track-keyed instruments and never the legacy instrument field', () => {
    const trackId = useTimelineStore.getState().addTrack('Perf', '#8F7DFF', 'performance')!
    useInstrumentsStore.getState().addSampler(trackId, 'asset-1')

    const obj = JSON.parse(serializeProject())
    expect(obj.instrument).toBeUndefined()
    expect(obj.instruments).toBeDefined()
    expect(obj.instruments[trackId]).toBeDefined()
    expect(obj.instruments[trackId].type).toBe('sampler')
  })

  it('round-trips a per-track sampler through save→load (re-keyed to new trackId)', () => {
    const trackId = useTimelineStore.getState().addTrack('Perf', '#8F7DFF', 'performance')!
    useInstrumentsStore.getState().addSampler(trackId, 'asset-1')
    useInstrumentsStore.getState().updateSampler(trackId, { speed: 2, opacity: 0.5 })

    const json = serializeProject()
    useInstrumentsStore.setState({ instruments: {} })
    useTimelineStore.getState().reset()

    hydrateStores(JSON.parse(json))

    const instruments = useInstrumentsStore.getState().instruments
    const keys = Object.keys(instruments)
    expect(keys).toHaveLength(1)
    // re-keyed to the freshly-created track id
    const newTrackId = keys[0]
    expect(useTimelineStore.getState().tracks.some((t) => t.id === newTrackId)).toBe(true)
    expect(instruments[newTrackId].speed).toBe(2)
    expect(instruments[newTrackId].opacity).toBe(0.5)
  })

  it('clamps out-of-range numeric fields on load (trust boundary)', () => {
    const trackId = useTimelineStore.getState().addTrack('Perf', '#8F7DFF', 'performance')!
    const json = JSON.parse(serializeProject())
    json.instruments = {
      [trackId]: makeSampler({ speed: 9999, opacity: 42, startFrame: -5, blendMode: 'evil-mode' }),
    }
    hydrateStores(json)

    const loaded = Object.values(useInstrumentsStore.getState().instruments)[0]
    expect(loaded).toBeDefined()
    expect(loaded.speed).toBeLessThanOrEqual(16) // SAMPLER_SPEED_MAX bound
    expect(loaded.opacity).toBeLessThanOrEqual(1)
    expect(loaded.startFrame).toBeGreaterThanOrEqual(0)
    expect(loaded.blendMode).toBe('normal') // invalid blend mode dropped to default
  })

  it('sampler whose saved track did not survive is dropped, not crashed', () => {
    const json = JSON.parse(serializeProject())
    json.instruments = { 'track-that-never-existed': makeSampler() }
    expect(() => hydrateStores(json)).not.toThrow()
    expect(Object.keys(useInstrumentsStore.getState().instruments)).toHaveLength(0)
  })
})

describe('G10 legacy single-sampler saves (#156 shape)', () => {
  it('loads a legacy global-instrument project without crash and drops the sampler with a toast', () => {
    const legacy = makeValidProject({ instrument: makeSampler() })

    expect(() => hydrateStores(legacy)).not.toThrow()
    // dropped, not migrated — B2 store stays empty
    expect(Object.keys(useInstrumentsStore.getState().instruments)).toHaveLength(0)
    // user is told
    const warns = useToastStore
      .getState()
      .toasts.filter((t) => t.level === 'warning' && t.source === 'legacy-instrument')
    expect(warns).toHaveLength(1)
  })

  it('validateProject: legacy instrument field still validates (back-compat)', () => {
    expect(validateProject(makeValidProject({ instrument: makeSampler() }))).toBe(true)
    expect(validateProject(makeValidProject())).toBe(true)
  })

  it('validateProject: malformed instrument is rejected', () => {
    expect(validateProject(makeValidProject({ instrument: { type: 'wrong', clipId: 'c' } }))).toBe(false)
    expect(validateProject(makeValidProject({ instrument: { type: 'sampler', clipId: 42 } }))).toBe(false)
    expect(validateProject(makeValidProject({ instrument: 'nope' }))).toBe(false)
  })
})
