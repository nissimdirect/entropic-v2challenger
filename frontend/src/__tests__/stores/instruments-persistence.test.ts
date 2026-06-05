/**
 * B1 mount — sampler instrument survives project save/load, with numeric fields
 * clamped at the deserialization trust boundary and graceful back-compat.
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
  useInstrumentsStore.setState({ instrument: null })
})

describe('sampler persistence', () => {
  it('serializeProject omits instrument when none loaded', () => {
    const obj = JSON.parse(serializeProject())
    expect(obj.instrument).toBeUndefined()
  })

  it('serializeProject includes the sampler when one exists', () => {
    useInstrumentsStore.getState().addSampler('clip-7')
    useInstrumentsStore.getState().updateSampler({ speed: -2, startFrame: 12, opacity: 0.4, blendMode: 'screen' })
    const obj = JSON.parse(serializeProject())
    expect(obj.instrument).toMatchObject({
      type: 'sampler', clipId: 'clip-7', speed: -2, startFrame: 12, opacity: 0.4, blendMode: 'screen',
    })
  })

  it('round-trips a sampler through hydrateStores', () => {
    useInstrumentsStore.getState().addSampler('clip-7')
    useInstrumentsStore.getState().updateSampler({ speed: 1.5, startFrame: 30, opacity: 0.8, blendMode: 'add' })
    const obj = JSON.parse(serializeProject())
    useInstrumentsStore.setState({ instrument: null }) // wipe before reload
    hydrateStores(obj)
    const inst = useInstrumentsStore.getState().instrument
    expect(inst).toMatchObject({ type: 'sampler', clipId: 'clip-7', speed: 1.5, startFrame: 30, opacity: 0.8, blendMode: 'add' })
  })

  it('clamps out-of-range numeric fields on load (trust boundary)', () => {
    hydrateStores(makeValidProject({
      instrument: { type: 'sampler', clipId: 'c', speed: 999, startFrame: -5, opacity: 9, blendMode: 'bogus' },
    }))
    const inst = useInstrumentsStore.getState().instrument!
    expect(inst.speed).toBe(8)        // clamped to SAMPLER_SPEED_MAX
    expect(inst.startFrame).toBe(0)   // clamped to >= 0
    expect(inst.opacity).toBe(1)      // clamped to [0,1]
    expect(inst.blendMode).toBe('normal') // invalid blend → default
  })

  it('loads a project with a clipId pointing at a missing asset without throwing', () => {
    expect(() =>
      hydrateStores(makeValidProject({ instrument: { type: 'sampler', clipId: 'gone', speed: 1, startFrame: 0, opacity: 1, blendMode: 'normal' } })),
    ).not.toThrow()
    expect(useInstrumentsStore.getState().instrument?.clipId).toBe('gone')
  })

  it('hydrating a project without an instrument clears a pre-existing sampler', () => {
    useInstrumentsStore.getState().addSampler('stale')
    hydrateStores(makeValidProject())
    expect(useInstrumentsStore.getState().instrument).toBeNull()
  })

  it('validateProject: back-compat (no instrument) passes; valid instrument passes', () => {
    expect(validateProject(makeValidProject())).toBe(true)
    expect(validateProject(makeValidProject({ instrument: { type: 'sampler', clipId: 'c' } }))).toBe(true)
  })

  it('validateProject: malformed instrument is rejected', () => {
    expect(validateProject(makeValidProject({ instrument: { type: 'wrong', clipId: 'c' } }))).toBe(false)
    expect(validateProject(makeValidProject({ instrument: { type: 'sampler', clipId: 42 } }))).toBe(false)
    expect(validateProject(makeValidProject({ instrument: 'nope' }))).toBe(false)
  })
})
