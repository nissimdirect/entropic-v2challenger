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

import {
  serializeProject,
  validateProject,
  hydrateStores,
  PERSISTED_SAMPLER_FIELDS,
  UNPERSISTED_SAMPLER_FIELDS,
} from '../../renderer/project-persistence'
import { useInstrumentsStore } from '../../renderer/stores/instruments'
import { useTimelineStore } from '../../renderer/stores/timeline'
import { useToastStore } from '../../renderer/stores/toast'
import type { SamplerInstrumentV1 } from '../../renderer/components/instruments/types'

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

/**
 * F2 — Month-Audit fix plan: the load whitelist (project-persistence.ts,
 * hydrateStores B2 section) dropped endFrame, loop (B3.1), rgbOffset (B3.3),
 * glide (B3.3), melodic (B3.4), and timeAxis (B9) on every reload, even though
 * serializeProject writes the FULL sampler object (spread). `scrub` (B3.2) is
 * the one field intentionally excluded — it's a modulation destination, never
 * a saved value.
 */
describe('F2 — sampler B3/B9 field persistence (endFrame/loop/rgbOffset/glide/melodic/timeAxis)', () => {
  it('exhaustiveness guard: scrub is the ONLY unpersisted field', () => {
    // If this fails, either a new field was added to SamplerInstrumentV1 and
    // classified 'unpersisted' without updating this expectation, or the
    // classification map itself was edited incorrectly — both are worth a
    // second look, not just widening the assertion.
    expect(UNPERSISTED_SAMPLER_FIELDS).toEqual(['scrub'])
    expect(PERSISTED_SAMPLER_FIELDS).toEqual(
      expect.arrayContaining(['endFrame', 'loop', 'rgbOffset', 'glide', 'melodic', 'timeAxis']),
    )
    expect(PERSISTED_SAMPLER_FIELDS).not.toContain('scrub')
  })

  it('maximal fixture: every optional B3/B9 field populated survives serialize -> validate -> hydrate (deep-equal)', () => {
    const trackId = useTimelineStore.getState().addTrack('Perf', '#8F7DFF', 'performance')!
    useInstrumentsStore.getState().addSampler(trackId, 'asset-1')
    const maximal: Partial<Omit<SamplerInstrumentV1, 'id' | 'type'>> = {
      startFrame: 12,
      speed: -2.5,
      opacity: 0.75,
      blendMode: 'screen',
      endFrame: 480,
      loop: { enabled: true, in: 30, out: 450, dir: 'pingpong', crossfade: 16 },
      rgbOffset: { r: -3, g: 0, b: 5 },
      glide: 45,
      melodic: { enabled: true, mode: 'speed', rootNote: 64 },
      timeAxis: 'y',
    }
    useInstrumentsStore.getState().updateSampler(trackId, maximal)

    const json = serializeProject()
    const parsed = JSON.parse(json)
    expect(validateProject(parsed)).toBe(true)

    useInstrumentsStore.setState({ instruments: {} })
    useTimelineStore.getState().reset()
    hydrateStores(parsed)

    const restored = Object.values(useInstrumentsStore.getState().instruments)[0]
    expect(restored).toBeDefined()
    // scrub must NEVER round-trip (modulation destination).
    expect((restored as unknown as Record<string, unknown>).scrub).toBeUndefined()
    // Every other field deep-equals the maximal fixture.
    expect(restored.startFrame).toBe(12)
    expect(restored.speed).toBe(-2.5)
    expect(restored.opacity).toBe(0.75)
    expect(restored.blendMode).toBe('screen')
    expect(restored.endFrame).toBe(480)
    expect(restored.loop).toEqual({ enabled: true, in: 30, out: 450, dir: 'pingpong', crossfade: 16 })
    expect(restored.rgbOffset).toEqual({ r: -3, g: 0, b: 5 })
    expect(restored.glide).toBe(45)
    expect(restored.melodic).toEqual({ enabled: true, mode: 'speed', rootNote: 64 })
    expect(restored.timeAxis).toBe('y')
  })

  it('fuzz: malformed B3/B9 values are clamped or dropped, never crash, never poison the store', () => {
    const trackId = useTimelineStore.getState().addTrack('Perf', '#8F7DFF', 'performance')!
    const json = JSON.parse(serializeProject())
    json.instruments = {
      [trackId]: makeSampler({
        endFrame: 'not-a-number',
        loop: { enabled: 'yes', in: NaN, out: -999999, dir: 'sideways', crossfade: 9999 },
        rgbOffset: { r: 'x', g: Infinity, b: -Infinity },
        glide: -50,
        melodic: { enabled: 1, mode: 'chromatic-nonsense', rootNote: 9999 },
        timeAxis: 'Z',
        scrub: 0.5, // must never be restored even if present in a hand-edited file
      }),
    }
    expect(() => hydrateStores(json)).not.toThrow()

    const loaded = Object.values(useInstrumentsStore.getState().instruments)[0] as unknown as Record<string, unknown>
    expect(loaded).toBeDefined()
    expect(loaded.scrub).toBeUndefined()
    expect(Number.isFinite(loaded.endFrame)).toBe(true)
    const loop = loaded.loop as Record<string, unknown>
    expect(typeof loop.enabled).toBe('boolean')
    expect(Number.isFinite(loop.in)).toBe(true)
    expect(loop.out).toBeGreaterThanOrEqual(0)
    expect(loop.dir).toBeUndefined() // unknown dir dropped, not defaulted to a fake value
    expect(loop.crossfade).toBeLessThanOrEqual(32)
    const rgb = loaded.rgbOffset as Record<string, unknown>
    expect(Number.isFinite(rgb.r)).toBe(true)
    expect(Number.isFinite(rgb.g)).toBe(true)
    expect(Number.isFinite(rgb.b)).toBe(true)
    expect(loaded.glide).toBe(0) // clamped to [0, 300]
    const melodic = loaded.melodic as Record<string, unknown>
    expect(melodic.mode).toBe('startFrame') // unknown mode -> engine default
    expect(melodic.rootNote).toBeLessThanOrEqual(127)
    expect(melodic.rootNote).toBeGreaterThanOrEqual(0)
    expect(loaded.timeAxis).toBeUndefined() // unknown axis dropped, not defaulted to a fake value
  })

  it('absent B3/B9 fields (legacy pre-F2 save) load clean with no crash', () => {
    const trackId = useTimelineStore.getState().addTrack('Perf', '#8F7DFF', 'performance')!
    const json = JSON.parse(serializeProject())
    json.instruments = { [trackId]: makeSampler() } // bare B1/B2 shape, no B3/B9 keys at all
    expect(() => hydrateStores(json)).not.toThrow()
    const loaded = Object.values(useInstrumentsStore.getState().instruments)[0] as unknown as Record<string, unknown>
    expect(loaded.endFrame).toBeUndefined()
    expect(loaded.loop).toBeUndefined()
    expect(loaded.rgbOffset).toBeUndefined()
    expect(loaded.glide).toBeUndefined()
    expect(loaded.melodic).toBeUndefined()
    expect(loaded.timeAxis).toBeUndefined()
  })
})
