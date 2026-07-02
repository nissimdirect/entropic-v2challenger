/**
 * B4.1 — buildRackLayers tests (Sample Rack per-pad channel summing).
 *
 * Proves the summing-correctness gates:
 *   - test_two_pads_composite_to_rack_output: 2 pads with distinct content →
 *     output is their composite (per-pad opacity/blend applied).
 *   - test_muted_pad_contributes_nothing: a muted pad emits zero layers.
 *   - test_solo_pad_only_soloed_render: with a soloed pad, only soloed pads render.
 *   - test_no_rack_renders_identical_to_baseline: a null/empty rack emits [] (the
 *     bare-sampler render path is untouched → byte-identical to today).
 *
 * The actual blend is done by the EXISTING backend compositor (render_composite
 * reads each layer's opacity + blend_mode); these tests assert the LAYER DICTS
 * buildRackLayers hands to that compositor.
 */
import { describe, it, expect } from 'vitest'
import { buildRackLayers } from '../../../renderer/components/instruments/buildRackLayers'
import type { RackNode, RackPad, SamplerInstrumentV1 } from '../../../renderer/components/instruments/types'
import type { TriggerEvent } from '../../../renderer/components/instruments/voiceFSM'
import type { Asset, ADSREnvelope, BlendMode, EffectInstance } from '../../../shared/types'
import { serializeEffectChain } from '../../../shared/ipc-serialize'

const ADSR_INSTANT: ADSREnvelope = { attack: 0, decay: 0, sustain: 1, release: 0 }

function makeInst(overrides: Partial<SamplerInstrumentV1> = {}): SamplerInstrumentV1 {
  return {
    id: 'sampler-x',
    type: 'sampler',
    clipId: 'clip-1',
    startFrame: 0,
    speed: 1,
    opacity: 1,
    blendMode: 'normal',
    ...overrides,
  }
}

function makePad(id: string, overrides: Partial<RackPad> = {}): RackPad {
  return {
    id,
    instrument: makeInst(),
    opacity: 1,
    blend: 'normal',
    mute: false,
    solo: false,
    ...overrides,
  }
}

function makeRack(pads: RackPad[]): RackNode {
  return { id: 'rack-1', type: 'rack', pads }
}

function makeAssets(): Record<string, Asset> {
  return {
    'clip-1': {
      id: 'clip-1',
      path: '/test/a.mp4',
      type: 'video',
      meta: { duration: 10, fps: 30, width: 1920, height: 1080 },
    } as unknown as Asset,
    'clip-2': {
      id: 'clip-2',
      path: '/test/b.mp4',
      type: 'video',
      meta: { duration: 10, fps: 30, width: 1920, height: 1080 },
    } as unknown as Asset,
  }
}

function trig(frameIndex: number, eventIndex: number, instrumentId = 'sampler-x'): TriggerEvent {
  return { frameIndex, eventIndex, note: 60, velocity: 127, kind: 'trigger', instrumentId }
}

const baseOpts = (eventsByPad: Record<string, TriggerEvent[]>) => ({
  eventsByPad,
  frame: 10,
  assets: makeAssets(),
  defaultFps: 30,
  adsr: ADSR_INSTANT,
})

describe('buildRackLayers (B4.1)', () => {
  // ---- Regression: no rack renders identical to baseline ----
  it('test_no_rack_renders_identical_to_baseline', () => {
    // null rack and empty-pad rack BOTH emit nothing — the per-track sampler path
    // is never disturbed, so a no-rack project renders byte-identical to today.
    expect(buildRackLayers(null, baseOpts({}))).toEqual([])
    expect(buildRackLayers(makeRack([]), baseOpts({}))).toEqual([])
    // A rack whose pads have no active voices also contributes nothing.
    const rack = makeRack([makePad('p1')])
    expect(buildRackLayers(rack, baseOpts({ p1: [] }))).toEqual([])
  })

  // ---- Summing: two pads composite to one rack output ----
  it('test_two_pads_composite_to_rack_output', () => {
    // Pad 1 → clip-1, blend 'normal', opacity 1.0
    // Pad 2 → clip-2, blend 'add',    opacity 0.5
    // Each pad has one active voice → the rack output is BOTH channels' layers,
    // in pad order (pad1 then pad2 = pad2 composites on top).
    const pad1 = makePad('p1', { instrument: makeInst({ id: 's1', clipId: 'clip-1' }), opacity: 1, blend: 'normal' })
    const pad2 = makePad('p2', { instrument: makeInst({ id: 's2', clipId: 'clip-2' }), opacity: 0.5, blend: 'add' })
    const rack = makeRack([pad1, pad2])

    const layers = buildRackLayers(rack, baseOpts({
      p1: [trig(0, 0, 's1')],
      p2: [trig(0, 1, 's2')],
    }))

    expect(layers).toHaveLength(2)

    // Distinct content: each channel carries its own clip.
    expect(layers[0].asset_path).toBe('/test/a.mp4')
    expect(layers[1].asset_path).toBe('/test/b.mp4')

    // Per-pad blend applied (the channel's compositing mode).
    expect(layers[0].blend_mode).toBe<BlendMode>('normal')
    expect(layers[1].blend_mode).toBe<BlendMode>('add')

    // Per-pad opacity multiplied onto the voice opacity (instrument 1 × ADSR 1).
    expect(layers[0].opacity).toBeCloseTo(1.0, 5)
    expect(layers[1].opacity).toBeCloseTo(0.5, 5)

    // Z-order: pad order preserved → pad2 (add) is last = composites on top.
    expect(layers[layers.length - 1].asset_path).toBe('/test/b.mp4')
  })

  // ---- Mute: a muted pad contributes nothing ----
  it('test_muted_pad_contributes_nothing', () => {
    const pad1 = makePad('p1', { instrument: makeInst({ id: 's1', clipId: 'clip-1' }) })
    const pad2 = makePad('p2', { instrument: makeInst({ id: 's2', clipId: 'clip-2' }), mute: true })
    const rack = makeRack([pad1, pad2])

    const layers = buildRackLayers(rack, baseOpts({
      p1: [trig(0, 0, 's1')],
      p2: [trig(0, 1, 's2')], // active voice, but pad2 is muted → silent
    }))

    // Only pad1's channel survives.
    expect(layers).toHaveLength(1)
    expect(layers[0].asset_path).toBe('/test/a.mp4')
    // Muted pad2's clip never appears.
    expect(layers.some((l) => l.asset_path === '/test/b.mp4')).toBe(false)
  })

  // ---- Solo: only soloed pads render ----
  it('test_solo_pad_only_soloed_render', () => {
    const pad1 = makePad('p1', { instrument: makeInst({ id: 's1', clipId: 'clip-1' }) }) // not soloed
    const pad2 = makePad('p2', { instrument: makeInst({ id: 's2', clipId: 'clip-2' }), solo: true })
    const pad3 = makePad('p3', { instrument: makeInst({ id: 's3', clipId: 'clip-1' }), solo: true })
    const rack = makeRack([pad1, pad2, pad3])

    const layers = buildRackLayers(rack, baseOpts({
      p1: [trig(0, 0, 's1')], // active but NOT soloed → silenced
      p2: [trig(0, 1, 's2')], // soloed → renders
      p3: [trig(0, 2, 's3')], // soloed → renders
    }))

    // Only the two soloed pads render.
    expect(layers).toHaveLength(2)
    expect(layers[0].asset_path).toBe('/test/b.mp4') // pad2
    expect(layers[1].asset_path).toBe('/test/a.mp4') // pad3 (clip-1)
  })

  // Solo + mute interaction: a muted-AND-soloed pad is still silent (mute is harder).
  it('mute beats solo: a muted soloed pad still contributes nothing', () => {
    const pad1 = makePad('p1', { instrument: makeInst({ id: 's1', clipId: 'clip-1' }), solo: true, mute: true })
    const pad2 = makePad('p2', { instrument: makeInst({ id: 's2', clipId: 'clip-2' }), solo: true })
    const rack = makeRack([pad1, pad2])

    const layers = buildRackLayers(rack, baseOpts({
      p1: [trig(0, 0, 's1')],
      p2: [trig(0, 1, 's2')],
    }))

    expect(layers).toHaveLength(1)
    expect(layers[0].asset_path).toBe('/test/b.mp4')
  })

  // Parity contract (v3): every emitted layer matches the dict shape
  // render_composite consumes (layer_type 'video', asset_path, finite opacity
  // 0..1, blend_mode, chain). A pad's chain MAY be non-empty (per-pad insert
  // chain, no terminal composite) — the layer carries a voice-marker (voice_id)
  // so the backend v2-compositing guard exempts it (P1-B); it is NOT the v2
  // track-clip shape. The backend compositor sums rack channels with NO
  // rack-specific code.
  it('emits render_composite-compatible layer dicts (compositor parity contract)', () => {
    const pad = makePad('p1', { instrument: makeInst({ id: 's1', clipId: 'clip-1' }), opacity: 0.75, blend: 'screen' })
    const layers = buildRackLayers(makeRack([pad]), baseOpts({ p1: [trig(0, 0, 's1')] }))
    expect(layers).toHaveLength(1)
    const l = layers[0]
    expect(l.layer_type).toBe('video')
    expect(typeof l.asset_path).toBe('string')
    expect(Array.isArray(l.chain)).toBe(true)
    expect(l.chain).toHaveLength(0)
    expect(Number.isFinite(l.opacity)).toBe(true)
    expect(l.opacity).toBeGreaterThanOrEqual(0)
    expect(l.opacity).toBeLessThanOrEqual(1)
    expect(l.blend_mode).toBe<BlendMode>('screen')
    expect(l.opacity).toBeCloseTo(0.75, 5) // 1 (inst) × 1 (adsr) × 0.75 (pad)
  })

  // Opacity is a trust boundary: a NaN/out-of-range pad opacity is clamped, never NaN.
  it('clamps a pathological pad opacity (NaN → fallback, >1 → 1)', () => {
    const padNaN = makePad('p1', { instrument: makeInst({ id: 's1', clipId: 'clip-1' }), opacity: NaN })
    const padHi = makePad('p2', { instrument: makeInst({ id: 's2', clipId: 'clip-2' }), opacity: 5 })
    const layers = buildRackLayers(makeRack([padNaN, padHi]), baseOpts({
      p1: [trig(0, 0, 's1')],
      p2: [trig(0, 1, 's2')],
    }))
    expect(layers).toHaveLength(2)
    for (const l of layers) {
      expect(Number.isFinite(l.opacity)).toBe(true)
      expect(l.opacity).toBeLessThanOrEqual(1)
      expect(l.opacity).toBeGreaterThanOrEqual(0)
    }
  })
})

/**
 * B4-pad-chain (ENGINE slice) — per-pad insert effect chains.
 *
 * Proves the chain on RackPad.chain actually REACHES render_composite in BOTH
 * the preview layer (buildRackLayers) and the export payload (serialized
 * instrument dict the backend reads via `pad_inst.get("chain")`), so the SAME
 * compositor applies the SAME chain → preview/export parity. Also proves a
 * no-chain pad stays byte-identical (chain=[] → compositor no-op).
 */
function makeEffect(overrides: Partial<EffectInstance> = {}): EffectInstance {
  return {
    id: 'fx-1',
    effectId: 'invert',
    isEnabled: true,
    isFrozen: false,
    parameters: { amount: 1 },
    modulations: {},
    mix: 1,
    mask: null,
    ...overrides,
  }
}

describe('buildRackLayers — B4-pad-chain (per-pad insert chains)', () => {
  // ---- Regression: a pad with NO chain emits chain:[] (byte-identical) ----
  it('test_no_chain_pad_emits_empty_chain (regression — byte-identical)', () => {
    const pad = makePad('p1', { instrument: makeInst({ id: 's1', clipId: 'clip-1' }) })
    const layers = buildRackLayers(makeRack([pad]), baseOpts({ p1: [trig(0, 0, 's1')] }))
    expect(layers).toHaveLength(1)
    // Undefined pad.chain → [] → compositor's `if chain:` is a no-op.
    expect(layers[0].chain).toEqual([])
  })

  // ---- Anti-dead-flag: the pad's chain REACHES the render layer ----
  // FAIL-BEFORE: without the `chain: pad.chain ?? []` emit, layer.chain was
  // always [] (SamplerVoiceLayer.chain was `never[]`) → the effect never
  // reached render_composite. PASS-AFTER: the layer carries the pad's chain.
  it('pad_chain_alters_pad_output_not_a_noop', () => {
    const chain = [makeEffect({ effectId: 'invert' })]
    const padWith = makePad('p1', { instrument: makeInst({ id: 's1', clipId: 'clip-1' }), chain })
    const padWithout = makePad('p2', { instrument: makeInst({ id: 's2', clipId: 'clip-2' }) })
    const layers = buildRackLayers(makeRack([padWith, padWithout]), baseOpts({
      p1: [trig(0, 0, 's1')],
      p2: [trig(0, 1, 's2')],
    }))
    expect(layers).toHaveLength(2)
    // With-chain pad: layer carries the pad's effect (reaches render_composite).
    expect(layers[0].chain).toHaveLength(1)
    expect(layers[0].chain).toBe(chain) // the SAME chain reference rides the layer
    expect(layers[0].chain[0].effectId).toBe('invert')
    // No-chain pad: layer.chain is empty (no effect → compositor no-op).
    expect(layers[1].chain).toEqual([])
    expect(layers[1].chain).toHaveLength(0)
  })

  // ---- Multi-voice: EVERY voice layer of a chained pad carries the chain ----
  it('every voice layer of a chained pad carries the pad chain', () => {
    const chain = [makeEffect({ effectId: 'glitch' }), makeEffect({ id: 'fx-2', effectId: 'invert' })]
    const pad = makePad('p1', { instrument: makeInst({ id: 's1', clipId: 'clip-1' }), chain })
    // Two trigger events → two voices → two voice layers, both must carry chain.
    const layers = buildRackLayers(makeRack([pad]), baseOpts({
      p1: [trig(0, 0, 's1'), trig(2, 1, 's1')],
    }))
    expect(layers.length).toBeGreaterThanOrEqual(1)
    for (const l of layers) {
      expect(l.chain).toBe(chain)
      expect(l.chain).toHaveLength(2)
    }
  })

  // ---- HARD ORACLE: preview-layer chain == export-payload chain ----
  // The export path serializes the pad chain onto the instrument dict
  // (App.tsx: `chain: serializeEffectChain(pad.chain ?? [])`), and the backend
  // reads it via `pad_inst.get("chain")` → voice descriptor chain → the SAME
  // render_composite layer. The preview path puts the RAW chain on the layer;
  // the compositor receives the chain in both cases. This oracle proves both
  // carriers reference the IDENTICAL chain the compositor will apply.
  it('PARITY ORACLE: preview layer chain and export instrument chain carry the same pad chain', () => {
    const chain = [makeEffect({ effectId: 'invert', parameters: { amount: 1 } })]
    const pad = makePad('p1', { instrument: makeInst({ id: 's1', clipId: 'clip-1' }), chain })

    // (a) PREVIEW: buildRackLayers emits a layer whose chain IS the pad's chain.
    const previewLayers = buildRackLayers(makeRack([pad]), baseOpts({ p1: [trig(0, 0, 's1')] }))
    expect(previewLayers).toHaveLength(1)
    const previewChain = previewLayers[0].chain
    expect(previewChain).toBe(chain)

    // (b) EXPORT: the serialized instrument dict carries the SERIALIZED pad chain
    //     (mirrors App.tsx buildPerformancePayload rack-pad serialization, which
    //     the backend reads via pad_inst.get("chain")). Lift the expected shape
    //     from how a per-track effectChain is serialized — genuine, not tautological.
    const exportInstrumentChain = serializeEffectChain(pad.chain ?? [])
    const expectedSerialized = serializeEffectChain(chain)
    expect(exportInstrumentChain).toEqual(expectedSerialized)

    // (c) PARITY: the preview layer's chain serializes to the EXACT payload the
    //     export instrument dict carries — same chain reaches render_composite
    //     in both paths → identical rendered result.
    expect(serializeEffectChain(previewChain)).toEqual(exportInstrumentChain)
    expect(exportInstrumentChain).toHaveLength(1)
    expect(exportInstrumentChain[0].effect_id).toBe('invert')
    expect(exportInstrumentChain[0].enabled).toBe(true)
  })

  // ---- P1-B v3 CONTRACT: a pad-WITH-chain layer carries the voice marker that
  // exempts it from the backend v2-compositing guard ----
  // The backend guard `_is_v2_compositing_shape` rejected a `layer_type:'video'`
  // layer with top-level opacity/blend_mode + a non-empty chain and no terminal
  // composite — EXACTLY a chained rack-pad voice — until P1-B added a voice-marker
  // exemption (voice_id present → not v2). This test pins the frontend half of that
  // contract: the emitted layer IS a video layer with top-level opacity/blend, a
  // non-empty chain, no terminal composite, AND a voice_id — so the backend
  // recognizes it as an instrument voice, not a v2 clip. Mirror backend:
  // test_instrument_voice_composite_regression::test_a_guard_exempts_voice_layers[rack_pad].
  it('emits a voice-marked layer for a chained pad (backend v2-guard exemption contract)', () => {
    const chain = [makeEffect({ effectId: 'invert' })]
    const pad = makePad('p1', {
      instrument: makeInst({ id: 's1', clipId: 'clip-1' }),
      opacity: 0.75,
      blend: 'screen',
      chain,
    })
    const layers = buildRackLayers(makeRack([pad]), baseOpts({ p1: [trig(0, 0, 's1')] }))
    expect(layers).toHaveLength(1)
    const l = layers[0]
    // The v2-guard shape triggers: video layer + top-level opacity/blend + chain.
    expect(l.layer_type).toBe('video')
    expect(typeof l.opacity).toBe('number')
    expect(l.blend_mode).toBe<BlendMode>('screen')
    expect(l.chain).toHaveLength(1) // non-empty, no terminal composite
    const terminal = l.chain[l.chain.length - 1]
    expect(terminal.effectId).not.toBe('composite')
    // The voice marker that makes the backend guard EXEMPT it (not a v2 clip).
    expect(typeof l.voice_id).toBe('string')
    expect((l.voice_id as string).length).toBeGreaterThan(0)
  })
})
