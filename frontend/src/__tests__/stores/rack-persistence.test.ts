/**
 * B4.1 — Sample Rack persistence round-trips through save/load, and malformed
 * pads are dropped at the deserialization trust boundary (additive-safe).
 *
 *   - test_rack_persists_round_trip: a rack survives serialize → validate →
 *     hydrate, re-keyed to the new trackId, pad controls intact.
 *   - test_malformed_pad_dropped_on_load: a rack with one bad pad loads the good
 *     pads and DROPS the bad one (never a throw).
 *   - test_no_rack_serialization_omits_racks_field: a project with no rack does
 *     NOT write a `racks` field (no-rack regression — byte-identical JSON shape).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// window.entropic mock before store imports (matches instruments-persistence.test.ts).
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
  validateRackNode,
  validateRackPad,
} from '../../renderer/project-persistence'
import { useInstrumentsStore } from '../../renderer/stores/instruments'
import { useTimelineStore } from '../../renderer/stores/timeline'
import { useToastStore } from '../../renderer/stores/toast'
import type { RackNode } from '../../renderer/components/instruments/types'

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

function makePadJson(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    instrument: { id: `s-${id}`, type: 'sampler', clipId: 'asset-1', startFrame: 0, speed: 1, opacity: 1, blendMode: 'normal' },
    opacity: 1,
    blend: 'normal',
    mute: false,
    solo: false,
    ...overrides,
  }
}

beforeEach(() => {
  useInstrumentsStore.setState({ instruments: {}, racks: {} })
  useTimelineStore.getState().reset()
  useToastStore.setState({ toasts: [] })
})

describe('Sample Rack persistence (B4.1)', () => {
  it('test_rack_persists_round_trip', () => {
    const trackId = useTimelineStore.getState().addTrack('Perf', '#8F7DFF', 'performance')!
    // Build a rack with two pads carrying distinct controls.
    useInstrumentsStore.getState().addRack(trackId, 2)
    const rack0 = useInstrumentsStore.getState().racks[trackId]
    const [p1, p2] = rack0.pads
    useInstrumentsStore.getState().updateRackPad(trackId, p1.id, {
      opacity: 0.5, blend: 'add', mute: false, solo: true, instrument: { clipId: 'asset-A' } as any,
    })
    useInstrumentsStore.getState().updateRackPad(trackId, p2.id, {
      opacity: 0.25, blend: 'screen', mute: true, solo: false, instrument: { clipId: 'asset-B', speed: 2 } as any,
    })

    // Serialize → the racks field is present and keyed by the live trackId.
    const json = serializeProject()
    const parsed = JSON.parse(json)
    expect(parsed.racks).toBeDefined()
    expect(parsed.racks[trackId]).toBeDefined()
    expect(parsed.racks[trackId].pads).toHaveLength(2)

    // Validate passes.
    expect(validateProject(parsed)).toBe(true)

    // Hydrate into a fresh app (reset clears the store first).
    hydrateStores(parsed)

    // Exactly one rack restored, re-keyed to the freshly-created trackId.
    const racksAfter = useInstrumentsStore.getState().racks
    const keys = Object.keys(racksAfter)
    expect(keys).toHaveLength(1)
    const newTrackId = keys[0]
    const restored = racksAfter[newTrackId]
    expect(restored.type).toBe('rack')
    expect(restored.pads).toHaveLength(2)

    // Pad controls round-tripped (order preserved).
    expect(restored.pads[0].opacity).toBeCloseTo(0.5, 5)
    expect(restored.pads[0].blend).toBe('add')
    expect(restored.pads[0].solo).toBe(true)
    expect(restored.pads[0].instrument.clipId).toBe('asset-A')

    expect(restored.pads[1].opacity).toBeCloseTo(0.25, 5)
    expect(restored.pads[1].blend).toBe('screen')
    expect(restored.pads[1].mute).toBe(true)
    expect(restored.pads[1].instrument.clipId).toBe('asset-B')
    expect(restored.pads[1].instrument.speed).toBe(2)
  })

  it('test_malformed_pad_dropped_on_load', () => {
    const trackId = useTimelineStore.getState().addTrack('Perf', '#8F7DFF', 'performance')!
    // Hand-craft a rack JSON with one GOOD pad and several malformed ones.
    const rackJson = {
      id: 'rack-bad',
      type: 'rack',
      pads: [
        makePadJson('good-1'),
        { id: 'no-instrument' }, // missing instrument → dropped
        makePadJson('bad-type', { instrument: { type: 'frameBank', clipId: 'x' } }), // wrong instrument type → dropped
        { instrument: { type: 'sampler', clipId: 'x' } }, // missing id → dropped
        makePadJson('good-2', { opacity: NaN, blend: 'not-a-mode' }), // sanitized, kept
        'totally not an object', // dropped
      ],
    }
    const project = makeValidProject({
      timeline: { duration: 0, tracks: [{ id: trackId, name: 'Perf', type: 'performance', clips: [], color: '#8F7DFF' }], markers: [], loopRegion: null },
      racks: { [trackId]: rackJson },
    })

    expect(validateProject(project)).toBe(true)
    hydrateStores(project)

    const racksAfter = useInstrumentsStore.getState().racks
    const keys = Object.keys(racksAfter)
    expect(keys).toHaveLength(1)
    const restored = racksAfter[keys[0]]
    // Only the 2 valid pads survive; the 4 malformed ones are dropped.
    expect(restored.pads).toHaveLength(2)
    expect(restored.pads[0].id).toBe('good-1')
    expect(restored.pads[1].id).toBe('good-2')
    // good-2's pathological values were sanitized, never NaN/invalid.
    expect(Number.isFinite(restored.pads[1].opacity)).toBe(true)
    expect(restored.pads[1].blend).toBe('normal')
    // Warning toasts emitted for the dropped pads (never a throw).
    const toasts = useToastStore.getState().toasts
    expect(toasts.some((t) => t.source === 'rack-load')).toBe(true)
  })

  it('test_no_rack_serialization_omits_racks_field', () => {
    // A project with no rack must NOT carry a `racks` field — the serialized JSON
    // shape is byte-identical to today (no-rack regression-safe).
    useTimelineStore.getState().addTrack('V', '#fff', 'video')
    const json = serializeProject()
    const parsed = JSON.parse(json)
    expect('racks' in parsed).toBe(false)
  })

  it('validateRackPad drops bad pads and sanitizes good ones', () => {
    expect(validateRackPad(null)).toBeNull()
    expect(validateRackPad({ id: 'x' })).toBeNull() // no instrument
    expect(validateRackPad({ id: 'x', instrument: { type: 'sampler' } })).toBeNull() // no clipId
    const good = validateRackPad(makePadJson('ok', { opacity: 9, blend: 'zzz', mute: 1, solo: 0 }))
    expect(good).not.toBeNull()
    expect(good!.opacity).toBe(1) // clamped from 9
    expect(good!.blend).toBe('normal') // unknown → normal
    expect(good!.mute).toBe(true) // coerced
    expect(good!.solo).toBe(false)
  })

  it('validateRackNode drops a rack with no valid pads', () => {
    expect(validateRackNode({ pads: [] }, 't1')).toBeNull()
    expect(validateRackNode({ pads: [{ bad: true }] }, 't1')).toBeNull()
    expect(validateRackNode({ pads: 'not-array' }, 't1')).toBeNull()
    const ok = validateRackNode({ id: 'r', type: 'rack', pads: [makePadJson('p1')] }, 't1') as RackNode
    expect(ok).not.toBeNull()
    expect(ok.pads).toHaveLength(1)
  })

  // B5.1 — branch (composite-tree) persistence recursion.
  it('B5.1: a branch pad round-trips its nested rack (recurse into children)', () => {
    const branchPadJson = {
      id: 'group-pad',
      opacity: 0.8,
      blend: 'screen',
      mute: false,
      solo: false,
      // A pad with a BRANCH (nested rack) instead of a leaf-only render.
      instrument: { id: 'placeholder', type: 'sampler', clipId: '', startFrame: 0, speed: 1, opacity: 1, blendMode: 'normal' },
      branch: {
        id: 'inner-rack',
        type: 'rack',
        composite: { opacity: 0.5, blend: 'add' },
        pads: [
          makePadJson('child-1', { instrument: { id: 'c1', type: 'sampler', clipId: 'asset-A', startFrame: 0, speed: 1, opacity: 1, blendMode: 'normal' } }),
          makePadJson('child-2'),
        ],
      },
    }
    const pad = validateRackPad(branchPadJson)
    expect(pad).not.toBeNull()
    expect(pad!.branch).toBeDefined()
    expect(pad!.branch!.pads).toHaveLength(2)
    expect(pad!.branch!.pads[0].id).toBe('child-1')
    expect(pad!.branch!.pads[0].instrument.clipId).toBe('asset-A')
    expect(pad!.branch!.composite).toEqual({ opacity: 0.5, blend: 'add' })
  })

  it('B5.1: a branch nested past MAX_BRANCH_DEPTH falls back to a leaf (no stack blowup)', () => {
    // Build a pad whose branch nests far deeper than MAX_BRANCH_DEPTH.
    let deepBranch: Record<string, unknown> = {
      id: 'deepest',
      type: 'rack',
      pads: [makePadJson('leaf')],
    }
    for (let i = 0; i < 10; i++) {
      deepBranch = {
        id: `w${i}`,
        type: 'rack',
        pads: [{ id: `pw${i}`, opacity: 1, blend: 'normal', mute: false, solo: false,
          instrument: { id: 's', type: 'sampler', clipId: '', startFrame: 0, speed: 1, opacity: 1, blendMode: 'normal' },
          branch: deepBranch }],
      }
    }
    const padJson = { id: 'top', opacity: 1, blend: 'normal', mute: false, solo: false,
      instrument: { id: 's', type: 'sampler', clipId: 'asset-A', startFrame: 0, speed: 1, opacity: 1, blendMode: 'normal' },
      branch: deepBranch }
    // Must NOT throw / blow the stack — over-cap branches are pruned.
    const pad = validateRackPad(padJson)
    expect(pad).not.toBeNull()
    // The leaf instrument is preserved so the over-cap pad still renders something.
    expect(pad!.instrument.clipId).toBe('asset-A')
  })

  it('a rack whose track did not survive load is dropped', () => {
    const project = makeValidProject({
      // No tracks → trackIdMap is empty → the rack has no track to bind to.
      racks: { 'ghost-track': { id: 'r', type: 'rack', pads: [makePadJson('p1')] } },
    })
    expect(validateProject(project)).toBe(true)
    hydrateStores(project)
    expect(Object.keys(useInstrumentsStore.getState().racks)).toHaveLength(0)
  })
})
