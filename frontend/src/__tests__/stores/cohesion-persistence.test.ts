/**
 * Cohesion persistence tests — Granulators (B8), performance.trackEvents (B10-persist),
 * and FrameBank timeAxis (Fix 3).
 *
 * Gates:
 *   1. Granulator round-trip
 *   2. Granulator trust boundary (clamping / coercion)
 *   3. Granulator newProject clears granulators
 *   4. performance.trackEvents round-trip
 *   5. performance.trackEvents excludes rack-pad composite keys
 *   6. FrameBank timeAxis round-trip
 *   7. FrameBank timeAxis trust boundary (unknown → 't')
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// window.entropic mock before store imports (matches framebank-persistence.test.ts pattern).
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
  newProject,
} from '../../renderer/project-persistence'
import { useInstrumentsStore } from '../../renderer/stores/instruments'
import { usePerformanceStore } from '../../renderer/stores/performance'
import { useTimelineStore } from '../../renderer/stores/timeline'
import { useToastStore } from '../../renderer/stores/toast'
import {
  GRANULATOR_DENSITY_MIN,
  GRANULATOR_DENSITY_MAX,
  FRAMEBANK_BYTE_BUDGET_MIN,
} from '../../renderer/components/instruments/types'

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

beforeEach(() => {
  useInstrumentsStore.setState({ instruments: {}, racks: {}, frameBanks: {}, granulators: {} })
  useTimelineStore.getState().reset()
  usePerformanceStore.getState().resetDrumRack()
  useToastStore.setState({ toasts: [] })
})

// ---------------------------------------------------------------------------
// Fix 1 — Granulator persistence
// ---------------------------------------------------------------------------

describe('Granulator persistence (B8)', () => {
  it('Gate 1 — ROUND-TRIP: granulator survives serialize → validate → hydrate with fields intact', () => {
    // Create a performance track and add a granulator.
    const trackId = useTimelineStore.getState().addTrack('Perf', '#8F7DFF', 'performance')!
    useInstrumentsStore.getState().addGranulator(trackId)

    // Mutate to non-default values so the round-trip is non-trivial.
    useInstrumentsStore.getState().setGranulatorDensity(trackId, 8)
    useInstrumentsStore.getState().setGranulatorWindow(trackId, 'tri')
    useInstrumentsStore.getState().setGranulatorLAxisEnabled(trackId, true)
    useInstrumentsStore.getState().setGranulatorSelection(trackId, 'onset')
    useInstrumentsStore.getState().setGranulatorAxisParam(trackId, 't', 'grain', 0.3)

    // Verify granulator exists before save.
    const before = useInstrumentsStore.getState().granulators[trackId]
    expect(before).toBeDefined()
    expect(before.density).toBe(8)

    // Serialize → top-level `granulators` key present.
    const json = serializeProject()
    const parsed = JSON.parse(json)
    expect(parsed.granulators).toBeDefined()
    expect(parsed.granulators[trackId]).toBeDefined()
    expect(parsed.granulators[trackId].type).toBe('granulator')

    // validateProject passes (field is optional).
    expect(validateProject(parsed)).toBe(true)

    // Hydrate into fresh state.
    hydrateStores(parsed)

    // Exactly one granulator restored, re-keyed to the freshly-created trackId.
    const grans = useInstrumentsStore.getState().granulators
    const keys = Object.keys(grans)
    expect(keys).toHaveLength(1)
    const restored = grans[keys[0]]

    expect(restored.type).toBe('granulator')
    expect(restored.density).toBe(8)
    expect(restored.window).toBe('tri')
    expect(restored.lAxisEnabled).toBe(true)
    expect(restored.selection).toBe('onset')
    expect(restored.axes['t'].grain).toBeCloseTo(0.3, 5)
  })

  it('Gate 2 — TRUST BOUNDARY: density clamped, unknown window → hann, latentSimilarity → random, unknown axis skipped, axis params clamped', () => {
    const trackId = useTimelineStore.getState().addTrack('Perf', '#8F7DFF', 'performance')!
    const project = makeValidProject({
      timeline: {
        duration: 0,
        tracks: [{ id: trackId, name: 'Perf', type: 'performance', clips: [], color: '#8F7DFF' }],
        markers: [],
        loopRegion: null,
      },
      granulators: {
        [trackId]: {
          id: 'gran-1',
          type: 'granulator',
          density: 999,           // over cap → clamp to GRANULATOR_DENSITY_MAX
          window: 'unknown-win',  // unknown → 'hann'
          selection: 'latentSimilarity', // flag-gated → 'random'
          lAxisEnabled: true,
          axes: {
            t: { grain: 5.0, jitter: -1.0, position: 0.5, envelope: 1.0 }, // grain/jitter clamped
            y: { grain: 0.2, jitter: 0.3, position: 0.4, envelope: 0.5 },
            x: { grain: 0.1, jitter: 0.1, position: 0.1, envelope: 0.1 },
            c: { grain: 0.2, jitter: 0.2, position: 0.2, envelope: 0.2 },
            f: { grain: 0.3, jitter: 0.3, position: 0.3, envelope: 0.3 },
            l: { grain: 0.4, jitter: 0.4, position: 0.4, envelope: 0.4 },
          },
        },
      },
    })

    expect(validateProject(project)).toBe(true)
    hydrateStores(project)

    const grans = useInstrumentsStore.getState().granulators
    const restored = grans[Object.keys(grans)[0]]

    expect(restored.density).toBe(GRANULATOR_DENSITY_MAX)  // clamped
    expect(restored.window).toBe('hann')                    // unknown → 'hann'
    expect(restored.selection).toBe('random')               // latentSimilarity → 'random'
    expect(restored.axes['t'].grain).toBeCloseTo(1.0, 5)    // 5.0 clamped to 1.0
    expect(restored.axes['t'].jitter).toBeCloseTo(0.0, 5)   // -1.0 clamped to 0.0
  })

  it('Gate 3 — newProject clears granulators', () => {
    const trackId = useTimelineStore.getState().addTrack('Perf', '#8F7DFF', 'performance')!
    useInstrumentsStore.getState().addGranulator(trackId)
    expect(Object.keys(useInstrumentsStore.getState().granulators)).toHaveLength(1)

    newProject()

    expect(useInstrumentsStore.getState().granulators).toEqual({})
  })

  it('legacy project with no granulators key loads cleanly — granulators = {}', () => {
    const legacy = makeValidProject()
    expect('granulators' in legacy).toBe(false)
    expect(validateProject(legacy)).toBe(true)
    expect(() => hydrateStores(legacy)).not.toThrow()
    expect(useInstrumentsStore.getState().granulators).toEqual({})
  })

  it('validateProject rejects granulators as an array', () => {
    const project = makeValidProject({ granulators: [] })
    expect(validateProject(project)).toBe(false)
  })

  it('granulator whose track did not survive load is dropped', () => {
    const project = makeValidProject({
      granulators: {
        'ghost-track': {
          id: 'gran-ghost',
          type: 'granulator',
          density: 4,
          window: 'hann',
          selection: 'random',
          lAxisEnabled: false,
          axes: {},
        },
      },
    })
    expect(validateProject(project)).toBe(true)
    hydrateStores(project)
    expect(Object.keys(useInstrumentsStore.getState().granulators)).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Fix 2 — performance.trackEvents persistence
// ---------------------------------------------------------------------------

describe('performance.trackEvents persistence (B10-persist)', () => {
  it('Gate 4 — ROUND-TRIP: trackEvents survive serialize → validate → hydrate', () => {
    // Create a performance track and add a sampler so events are linked to a known instrumentId.
    const trackId = useTimelineStore.getState().addTrack('Perf', '#8F7DFF', 'performance')!
    useInstrumentsStore.getState().addSampler(trackId)

    // Inject events directly into the store (avoids needing real pad infrastructure).
    usePerformanceStore.setState({
      trackEvents: {
        [trackId]: [
          { frameIndex: 10, eventIndex: 0, note: 60, velocity: 100, kind: 'trigger', instrumentId: trackId },
          { frameIndex: 20, eventIndex: 1, note: 60, velocity: 0, kind: 'release', instrumentId: trackId },
        ],
      },
    })

    const json = serializeProject()
    const parsed = JSON.parse(json)

    // performance.events must be present with 2 events.
    expect(parsed.performance).toBeDefined()
    expect(Array.isArray(parsed.performance.events)).toBe(true)
    expect(parsed.performance.events).toHaveLength(2)

    // validateProject passes.
    expect(validateProject(parsed)).toBe(true)

    // Hydrate into fresh state.
    hydrateStores(parsed)

    const trackEventsAfter = usePerformanceStore.getState().trackEvents
    const keys = Object.keys(trackEventsAfter)
    expect(keys).toHaveLength(1)
    const evs = trackEventsAfter[keys[0]]
    expect(evs).toHaveLength(2)
    expect(evs[0].frameIndex).toBe(10)
    expect(evs[0].kind).toBe('trigger')
    expect(evs[1].frameIndex).toBe(20)
    expect(evs[1].kind).toBe('release')
  })

  it('Gate 5 — performance.trackEvents excludes rack-pad composite keys from serialized events', () => {
    const trackId = useTimelineStore.getState().addTrack('Perf', '#8F7DFF', 'performance')!
    useInstrumentsStore.getState().addSampler(trackId)

    const compositeKey = `${trackId}:pad-0`

    // Simple key events (should be serialized) and composite key events (should be excluded).
    usePerformanceStore.setState({
      trackEvents: {
        [trackId]: [
          { frameIndex: 5, eventIndex: 0, note: 60, velocity: 127, kind: 'trigger', instrumentId: trackId },
        ],
        [compositeKey]: [
          { frameIndex: 6, eventIndex: 1, note: 64, velocity: 100, kind: 'trigger', instrumentId: compositeKey },
        ],
      },
    })

    const json = serializeProject()
    const parsed = JSON.parse(json)

    // Only the simple-key event should be in performance.events.
    // The composite-key (rack-pad) event is NOT in knownIds (only trackId-level).
    expect(parsed.performance).toBeDefined()
    const events = parsed.performance.events as Array<{ instrumentId: string }>
    const simpleEvents = events.filter((e) => e.instrumentId === trackId)
    const compositeEvents = events.filter((e) => e.instrumentId === compositeKey)
    expect(simpleEvents).toHaveLength(1)
    expect(compositeEvents).toHaveLength(0)
  })

  it('project with no trackEvents omits performance key in serialized JSON', () => {
    useTimelineStore.getState().addTrack('V', '#fff', 'video')
    const json = serializeProject()
    const parsed = JSON.parse(json)
    expect('performance' in parsed).toBe(false)
  })

  it('validateProject rejects performance as an array', () => {
    const project = makeValidProject({ performance: [] })
    expect(validateProject(project)).toBe(false)
  })

  it('validateProject rejects performance.events as a non-array', () => {
    const project = makeValidProject({ performance: { events: 'bad' } })
    expect(validateProject(project)).toBe(false)
  })

  it('legacy project with no performance key loads without error; trackEvents = {}', () => {
    const legacy = makeValidProject()
    expect('performance' in legacy).toBe(false)
    expect(validateProject(legacy)).toBe(true)
    expect(() => hydrateStores(legacy)).not.toThrow()
    expect(usePerformanceStore.getState().trackEvents).toEqual({})
  })

  it('malformed events (non-finite frameIndex, out-of-range note) are dropped on hydration', () => {
    const trackId = useTimelineStore.getState().addTrack('Perf', '#8F7DFF', 'performance')!
    useInstrumentsStore.getState().addSampler(trackId)

    const project = makeValidProject({
      timeline: {
        duration: 0,
        tracks: [{ id: trackId, name: 'Perf', type: 'performance', clips: [], color: '#8F7DFF' }],
        markers: [],
        loopRegion: null,
      },
      instruments: {
        [trackId]: { id: 'inst-1', type: 'sampler', clipId: '', startFrame: 0, speed: 1, opacity: 1, blendMode: 'normal' },
      },
      performance: {
        events: [
          { frameIndex: 10, eventIndex: 0, note: 60, velocity: 100, kind: 'trigger', instrumentId: trackId }, // valid
          { frameIndex: NaN, eventIndex: 1, note: 60, velocity: 100, kind: 'trigger', instrumentId: trackId }, // NaN → dropped
          { frameIndex: 15, eventIndex: 2, note: 200, velocity: 100, kind: 'trigger', instrumentId: trackId }, // note > 127 → dropped
          { frameIndex: 20, eventIndex: 3, note: 60, velocity: 100, kind: 'unknownkind', instrumentId: trackId }, // bad kind → dropped
        ],
      },
    })

    expect(validateProject(project)).toBe(true)
    hydrateStores(project)

    const tevents = usePerformanceStore.getState().trackEvents
    const allEvs = Object.values(tevents).flat()
    expect(allEvs).toHaveLength(1)
    expect(allEvs[0].frameIndex).toBe(10)
  })
})

// ---------------------------------------------------------------------------
// Fix 3 — FrameBank timeAxis persistence
// ---------------------------------------------------------------------------

describe('FrameBank timeAxis persistence (Fix 3)', () => {
  it('Gate 6 — ROUND-TRIP: timeAxis survives serialize → validate → hydrate', () => {
    const trackId = useTimelineStore.getState().addTrack('Perf', '#8F7DFF', 'performance')!
    useInstrumentsStore.getState().addFrameBank(trackId, ['asset-A'])

    // Set timeAxis to 'y' (non-default)
    useInstrumentsStore.getState().setFrameBankTimeAxis(trackId, 'y')

    const json = serializeProject()
    const parsed = JSON.parse(json)
    expect(parsed.frameBanks[trackId].timeAxis).toBe('y')

    expect(validateProject(parsed)).toBe(true)
    hydrateStores(parsed)

    const banks = useInstrumentsStore.getState().frameBanks
    const restored = banks[Object.keys(banks)[0]]
    expect(restored.timeAxis).toBe('y')
  })

  it('Gate 7 — TRUST BOUNDARY: unknown timeAxis → t', () => {
    const trackId = useTimelineStore.getState().addTrack('Perf', '#8F7DFF', 'performance')!
    const project = makeValidProject({
      timeline: {
        duration: 0,
        tracks: [{ id: trackId, name: 'Perf', type: 'performance', clips: [], color: '#8F7DFF' }],
        markers: [],
        loopRegion: null,
      },
      frameBanks: {
        [trackId]: {
          id: 'fb-1',
          type: 'frameBank',
          slots: [{ clipId: 'asset-A', frameIndex: 0 }],
          position: 0,
          interp: 'nearest',
          byteBudget: FRAMEBANK_BYTE_BUDGET_MIN,
          timeAxis: 'invalid-axis', // unknown → 't'
        },
      },
    })

    expect(validateProject(project)).toBe(true)
    hydrateStores(project)

    const banks = useInstrumentsStore.getState().frameBanks
    const restored = banks[Object.keys(banks)[0]]
    expect(restored.timeAxis).toBe('t')
  })

  it('timeAxis x round-trips correctly', () => {
    const trackId = useTimelineStore.getState().addTrack('Perf', '#8F7DFF', 'performance')!
    useInstrumentsStore.getState().addFrameBank(trackId, ['asset-B'])
    useInstrumentsStore.getState().setFrameBankTimeAxis(trackId, 'x')

    const json = serializeProject()
    const parsed = JSON.parse(json)
    hydrateStores(parsed)

    const banks = useInstrumentsStore.getState().frameBanks
    const restored = banks[Object.keys(banks)[0]]
    expect(restored.timeAxis).toBe('x')
  })

  it('absent timeAxis in saved file → t on restore', () => {
    const trackId = useTimelineStore.getState().addTrack('Perf', '#8F7DFF', 'performance')!
    const project = makeValidProject({
      timeline: {
        duration: 0,
        tracks: [{ id: trackId, name: 'Perf', type: 'performance', clips: [], color: '#8F7DFF' }],
        markers: [],
        loopRegion: null,
      },
      frameBanks: {
        [trackId]: {
          id: 'fb-1',
          type: 'frameBank',
          slots: [{ clipId: 'asset-A', frameIndex: 0 }],
          position: 0,
          interp: 'nearest',
          byteBudget: FRAMEBANK_BYTE_BUDGET_MIN,
          // no timeAxis field — legacy save
        },
      },
    })

    expect(validateProject(project)).toBe(true)
    hydrateStores(project)

    const banks = useInstrumentsStore.getState().frameBanks
    const restored = banks[Object.keys(banks)[0]]
    // absent → 't' (because String(undefined) = 'undefined' which is not in VALID_AXIS)
    expect(restored.timeAxis).toBe('t')
  })
})
