/**
 * #423 — un-triggered Sampler must render NOTHING (transparent), not composite
 * its bound clip's clean source over the track below.
 *
 * ANTI-DEAD-FLAG: these tests reproduce the exact discriminator from the bug
 * report — a sampler with a bound source but zero active voices for the
 * current frame. Before the fix, App.tsx's inline fallback called the legacy
 * `buildSamplerLayer` unconditionally whenever `evaluateVoices` returned []
 * (see git history: `const legacy = buildSamplerLayer(...); return legacy ? [legacy] : []`),
 * which returns a non-null layer purely from asset resolution — with no
 * note-active check at all. That is proven not just by inspection but by the
 * "legacy still composites when silent" test below, which calls the
 * unconditional legacy path exactly the way the old fallback did.
 */
import { describe, it, expect } from 'vitest'
import { buildSamplerLayer } from '../../../renderer/components/instruments/buildSamplerLayer'
import { resolveTrackSamplerLayers } from '../../../renderer/components/instruments/buildSamplerLayer'
import type { SamplerInstrumentV1 } from '../../../renderer/components/instruments/types'
import type { TriggerEvent } from '../../../renderer/components/instruments/voiceFSM'
import type { Asset, ADSREnvelope } from '../../../shared/types'

function inst(overrides: Partial<SamplerInstrumentV1> = {}): SamplerInstrumentV1 {
  return {
    id: 's1',
    type: 'sampler',
    clipId: 'clip-1',
    startFrame: 0,
    speed: 1,
    opacity: 1,
    blendMode: 'normal',
    ...overrides,
  }
}

function asset(): Asset {
  return {
    id: 'clip-1',
    path: '/a.mp4',
    type: 'video',
    meta: { width: 1920, height: 1080, duration: 10, fps: 30, codec: 'h264', hasAudio: false },
  }
}

const adsr: ADSREnvelope = { attack: 0, decay: 0, sustain: 1, release: 0 }

describe('resolveTrackSamplerLayers (#423)', () => {
  it('DISCRIMINATOR: the legacy unconditional path DOES still composite when silent (proves the bug mechanism)', () => {
    // This is exactly what the old App.tsx fallback called when evaluateVoices
    // returned zero voices — a bound-but-silent instrument still yields a layer.
    const legacyLayer = buildSamplerLayer(inst(), { 'clip-1': asset() }, 5, 30)
    expect(legacyLayer).not.toBeNull()
  })

  it('bound source + NO active note (empty events) → zero voice layers', () => {
    const layers = resolveTrackSamplerLayers(
      inst(),
      [], // no trigger events at all → evaluateVoices returns []
      5,
      { 'clip-1': asset() },
      30,
      adsr,
    )
    expect(layers).toEqual([])
  })

  it('bound source + a note that has already fully released by this frame → zero voice layers', () => {
    const events: TriggerEvent[] = [
      { frameIndex: 0, eventIndex: 0, note: 60, velocity: 100, kind: 'trigger', instrumentId: 's1' },
      { frameIndex: 1, eventIndex: 1, note: 60, velocity: 100, kind: 'release', instrumentId: 's1' },
    ]
    // adsr.release = 0 → release completes instantly; frame 50 is long past it.
    const layers = resolveTrackSamplerLayers(inst(), events, 50, { 'clip-1': asset() }, 30, adsr)
    expect(layers).toEqual([])
  })

  it('REGRESSION GUARD: an active note still emits exactly one layer, unchanged from buildVoiceLayers', () => {
    const events: TriggerEvent[] = [
      { frameIndex: 0, eventIndex: 0, note: 60, velocity: 100, kind: 'trigger', instrumentId: 's1' },
    ]
    const layers = resolveTrackSamplerLayers(inst(), events, 5, { 'clip-1': asset() }, 30, adsr)
    expect(layers.length).toBe(1)
    expect(layers[0].asset_path).toBe('/a.mp4')
    expect(layers[0].voice_id).toBe('voice_s1_0_0')
  })

  it('null instrument → zero layers', () => {
    expect(resolveTrackSamplerLayers(null, [], 5, { 'clip-1': asset() }, 30, adsr)).toEqual([])
  })
})
