/**
 * B6.4 — Frame-Bank persistence round-trips through save/load (additive-safe).
 *
 * Gates tested:
 *   1. ROUND-TRIP: a FrameBankInstrument survives serializeProject → validateProject
 *      → hydrateStores, re-keyed to the new trackId, with fields (slots, position,
 *      interp, byteBudget) restored identical.
 *      FAIL-BEFORE (B6.4 not shipped): frameBanks is absent after load (empty object).
 *      PASS-AFTER: frameBanks[newTrackId] exists and fields match.
 *
 *   2. LEGACY-LOAD-SAFE: a project saved BEFORE B6.4 (no `frameBanks` key) loads
 *      without error and leaves frameBanks = {} in the store.
 *
 *   3. EMPTY-BYTE-IDENTICAL: a project with NO frameBanks omits the `frameBanks`
 *      key entirely in the serialized JSON (regression-safe).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// window.entropic mock before store imports (matches rack-persistence.test.ts pattern).
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
} from '../../renderer/project-persistence'
import { useInstrumentsStore } from '../../renderer/stores/instruments'
import { useTimelineStore } from '../../renderer/stores/timeline'
import { useToastStore } from '../../renderer/stores/toast'
import { FRAMEBANK_BYTE_BUDGET_MIN, FRAMEBANK_BYTE_BUDGET_MAX } from '../../renderer/components/instruments/types'

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
  useInstrumentsStore.setState({ instruments: {}, racks: {}, frameBanks: {} })
  useTimelineStore.getState().reset()
  useToastStore.setState({ toasts: [] })
})

describe('Frame-Bank persistence (B6.4)', () => {
  it('Gate 1 — ROUND-TRIP: frameBank survives serialize → validate → hydrate with fields intact', () => {
    // Create a performance track and add a frameBank with 2 slots.
    const trackId = useTimelineStore.getState().addTrack('Perf', '#8F7DFF', 'performance')!
    useInstrumentsStore.getState().addFrameBank(trackId, ['asset-A', 'asset-B'])

    // Verify the bank exists before save.
    const bankBefore = useInstrumentsStore.getState().frameBanks[trackId]
    expect(bankBefore).toBeDefined()
    expect(bankBefore.slots).toHaveLength(2)

    // Mutate position + interp to non-default values so round-trip is non-trivial.
    useInstrumentsStore.getState().setFrameBankPosition(trackId, 0.75)
    useInstrumentsStore.getState().setFrameBankInterp(trackId, 'blend')
    useInstrumentsStore.getState().setFrameBankByteBudget(trackId, FRAMEBANK_BYTE_BUDGET_MIN * 2)

    // Serialize → the frameBanks field is present and keyed by the live trackId.
    const json = serializeProject()
    const parsed = JSON.parse(json)
    expect(parsed.frameBanks).toBeDefined()
    expect(parsed.frameBanks[trackId]).toBeDefined()
    expect(parsed.frameBanks[trackId].type).toBe('frameBank')
    expect(parsed.frameBanks[trackId].slots).toHaveLength(2)

    // Validate passes (legacy-safe — optional field).
    expect(validateProject(parsed)).toBe(true)

    // Hydrate into a fresh app state.
    hydrateStores(parsed)

    // Exactly one frameBank restored, re-keyed to the freshly-created trackId.
    const banksAfter = useInstrumentsStore.getState().frameBanks
    const keys = Object.keys(banksAfter)
    expect(keys).toHaveLength(1)
    const newTrackId = keys[0]
    const restored = banksAfter[newTrackId]

    expect(restored.type).toBe('frameBank')
    expect(restored.slots).toHaveLength(2)
    expect(restored.slots[0].clipId).toBe('asset-A')
    expect(restored.slots[1].clipId).toBe('asset-B')
    expect(restored.position).toBeCloseTo(0.75, 5)
    expect(restored.interp).toBe('blend')
    expect(restored.byteBudget).toBe(FRAMEBANK_BYTE_BUDGET_MIN * 2)
  })

  it('Gate 2 — LEGACY-LOAD-SAFE: project with no frameBanks key loads without error; frameBanks = {}', () => {
    // A project saved BEFORE B6.4 — no `frameBanks` key at all.
    const legacyProject = makeValidProject({
      // Explicitly no frameBanks key (mirrors a real pre-B6.4 save file).
    })

    expect('frameBanks' in legacyProject).toBe(false)

    // Must not throw; validateProject must pass (field is optional).
    expect(validateProject(legacyProject)).toBe(true)

    // Must not crash; frameBanks must be empty after load.
    expect(() => hydrateStores(legacyProject)).not.toThrow()
    expect(useInstrumentsStore.getState().frameBanks).toEqual({})
  })

  it('Gate 3 — EMPTY-BYTE-IDENTICAL: project with no frameBanks omits the key in serialized JSON', () => {
    // A project with no frameBanks must NOT carry a `frameBanks` field —
    // the serialized JSON shape is byte-identical to pre-B6.4 (no-frameBank regression-safe).
    useTimelineStore.getState().addTrack('V', '#fff', 'video')
    const json = serializeProject()
    const parsed = JSON.parse(json)
    expect('frameBanks' in parsed).toBe(false)
  })

  it('trust boundary: invalid slot clipIds and non-finite frameIndex are dropped on load', () => {
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
          slots: [
            { clipId: 'good-asset', frameIndex: 5 },          // valid
            { clipId: '', frameIndex: 0 },                     // empty clipId → dropped
            { clipId: 'bad-frame', frameIndex: NaN },          // NaN frameIndex → dropped
            { clipId: 'neg-frame', frameIndex: -1 },           // negative → dropped
            { clipId: 'another-good', frameIndex: 10 },        // valid
          ],
          position: 0.5,
          interp: 'nearest',
          byteBudget: FRAMEBANK_BYTE_BUDGET_MIN,
        },
      },
    })

    expect(validateProject(project)).toBe(true)
    hydrateStores(project)

    const banksAfter = useInstrumentsStore.getState().frameBanks
    const keys = Object.keys(banksAfter)
    expect(keys).toHaveLength(1)
    const restored = banksAfter[keys[0]]
    // Only the 2 valid slots survive.
    expect(restored.slots).toHaveLength(2)
    expect(restored.slots[0].clipId).toBe('good-asset')
    expect(restored.slots[0].frameIndex).toBe(5)
    expect(restored.slots[1].clipId).toBe('another-good')
    expect(restored.slots[1].frameIndex).toBe(10)
  })

  it('trust boundary: position clamped to [0,1], byteBudget clamped to [MIN,MAX], unknown interp → nearest', () => {
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
          id: 'fb-2',
          type: 'frameBank',
          slots: [{ clipId: 'asset-X', frameIndex: 0 }],
          position: 99,                          // over cap → clamp to 1
          interp: 'turbo',                       // unknown → nearest
          byteBudget: FRAMEBANK_BYTE_BUDGET_MAX * 10, // over cap → clamp to MAX
        },
      },
    })

    expect(validateProject(project)).toBe(true)
    hydrateStores(project)

    const banksAfter = useInstrumentsStore.getState().frameBanks
    const restored = banksAfter[Object.keys(banksAfter)[0]]
    expect(restored.position).toBeCloseTo(1, 5)
    expect(restored.interp).toBe('nearest')
    expect(restored.byteBudget).toBe(FRAMEBANK_BYTE_BUDGET_MAX)
  })

  it('a frameBank whose track did not survive load is dropped', () => {
    // frameBanks keyed to a ghost trackId that does not appear in the timeline.
    const project = makeValidProject({
      frameBanks: {
        'ghost-track': {
          id: 'fb-ghost',
          type: 'frameBank',
          slots: [{ clipId: 'asset-X', frameIndex: 0 }],
          position: 0,
          interp: 'nearest',
          byteBudget: FRAMEBANK_BYTE_BUDGET_MIN,
        },
      },
    })

    expect(validateProject(project)).toBe(true)
    hydrateStores(project)
    expect(Object.keys(useInstrumentsStore.getState().frameBanks)).toHaveLength(0)
  })

  it('validateProject rejects frameBanks as an array (not an object)', () => {
    const project = makeValidProject({ frameBanks: [] })
    // An array is not a valid shape for frameBanks — validate must return false.
    expect(validateProject(project)).toBe(false)
  })
})
