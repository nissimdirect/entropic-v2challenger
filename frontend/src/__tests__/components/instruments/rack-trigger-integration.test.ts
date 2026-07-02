/**
 * B4-editor — ANTI-DEAD-FLAG ORACLE.
 *
 * Proves the UI trigger drives the RENDER — that triggerRackPad is not a dead
 * button. The integration path under test:
 *
 *   triggerRackPad(trackId, padId, frame)              [performance store]
 *     → trackEvents['${trackId}:${padId}'] gets a TriggerEvent
 *     → buildRackLayers reads eventsByPad[padId] from that composite key
 *     → evaluateVoices → a voice → ≥1 render layer for that pad
 *
 * FAIL-BEFORE: without triggerRackPad (or with the WRONG key — the track key
 * `trackId` instead of the composite `${trackId}:${padId}`), eventsByPad is empty,
 * evaluateVoices returns no voices, and buildRackLayers returns 0 layers.
 * PASS-AFTER: with triggerRackPad writing the composite key, ≥1 layer is produced.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { buildRackLayers } from '../../../renderer/components/instruments/buildRackLayers'
import { useInstrumentsStore } from '../../../renderer/stores/instruments'
import { usePerformanceStore } from '../../../renderer/stores/performance'
import type { Asset, ADSREnvelope } from '../../../shared/types'

const ADSR_INSTANT: ADSREnvelope = { attack: 0, decay: 0, sustain: 1, release: 0 }
const TRACK = 'perf-track-1'
const FRAME = 0

function makeAssets(): Record<string, Asset> {
  return {
    'clip-1': {
      id: 'clip-1',
      path: '/test/a.mp4',
      type: 'video',
      meta: { duration: 10, fps: 30, width: 1920, height: 1080 },
    } as unknown as Asset,
  }
}

beforeEach(() => {
  useInstrumentsStore.setState({ instruments: {}, racks: {} })
  usePerformanceStore.setState({ trackEvents: {} })
})

describe('triggerRackPad_produces_a_render_layer (anti-dead-flag oracle)', () => {
  it('FAIL-BEFORE: no trigger → empty composite-key events → 0 layers', () => {
    useInstrumentsStore.getState().addRack(TRACK)
    const rack = useInstrumentsStore.getState().racks[TRACK]
    const pad = rack.pads[0]
    useInstrumentsStore.getState().setRackPadSource(TRACK, pad.id, 'clip-1')

    // No triggerRackPad called → the composite key has no events.
    const eventsByPad = {
      [pad.id]: usePerformanceStore.getState().trackEvents[`${TRACK}:${pad.id}`] ?? [],
    }
    const layers = buildRackLayers(useInstrumentsStore.getState().racks[TRACK], {
      eventsByPad,
      frame: FRAME,
      assets: makeAssets(),
      defaultFps: 30,
      adsr: ADSR_INSTANT,
    })
    expect(layers.length).toBe(0)
  })

  it('FAIL-BEFORE (wrong key): events under the TRACK key (not composite) → 0 layers', () => {
    useInstrumentsStore.getState().addRack(TRACK)
    const rack = useInstrumentsStore.getState().racks[TRACK]
    const pad = rack.pads[0]
    useInstrumentsStore.getState().setRackPadSource(TRACK, pad.id, 'clip-1')

    // Simulate the OLD bug: an event written under the bare track key, which the
    // rack render path (composite key) never reads.
    usePerformanceStore.setState({
      trackEvents: {
        [TRACK]: [{ frameIndex: FRAME, eventIndex: 0, note: 60, velocity: 127, kind: 'trigger', instrumentId: TRACK }],
      },
    })
    const eventsByPad = {
      [pad.id]: usePerformanceStore.getState().trackEvents[`${TRACK}:${pad.id}`] ?? [],
    }
    const layers = buildRackLayers(useInstrumentsStore.getState().racks[TRACK], {
      eventsByPad,
      frame: FRAME,
      assets: makeAssets(),
      defaultFps: 30,
      adsr: ADSR_INSTANT,
    })
    expect(layers.length).toBe(0)
  })

  it('PASS-AFTER: triggerRackPad → composite-key event → ≥1 render layer', () => {
    useInstrumentsStore.getState().addRack(TRACK)
    const rack = useInstrumentsStore.getState().racks[TRACK]
    const pad = rack.pads[0]
    useInstrumentsStore.getState().setRackPadSource(TRACK, pad.id, 'clip-1')

    // THE UI ACTION under test — what RackDevice's onMouseDown calls.
    usePerformanceStore.getState().triggerRackPad(TRACK, pad.id, FRAME)

    // The event must land under the COMPOSITE key the render path reads.
    const events = usePerformanceStore.getState().trackEvents[`${TRACK}:${pad.id}`]
    expect(events?.length).toBe(1)
    expect(events![0].instrumentId).toBe(`${TRACK}:${pad.id}`)

    const eventsByPad = { [pad.id]: events ?? [] }
    const layers = buildRackLayers(useInstrumentsStore.getState().racks[TRACK], {
      eventsByPad,
      frame: FRAME,
      assets: makeAssets(),
      defaultFps: 30,
      adsr: ADSR_INSTANT,
    })
    expect(layers.length).toBeGreaterThanOrEqual(1)
  })

  it('triggerRackPad drops a non-finite frameIndex (numeric trust boundary)', () => {
    useInstrumentsStore.getState().addRack(TRACK)
    const pad = useInstrumentsStore.getState().racks[TRACK].pads[0]
    usePerformanceStore.getState().triggerRackPad(TRACK, pad.id, Number.NaN)
    expect(usePerformanceStore.getState().trackEvents[`${TRACK}:${pad.id}`]).toBeUndefined()
  })
})
