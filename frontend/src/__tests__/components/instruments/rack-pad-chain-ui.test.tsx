/**
 * B4-pad-chain UI — DeviceChain edits the SELECTED RACK PAD's insert chain.
 *
 * Four ENFORCED gates (RISK:HIGH packet — core effect-chain editor targeting):
 *
 *  1. REGRESSION (no pad selected): DeviceChain shows + mutates the active
 *     TRACK's chain exactly as today (add/remove/toggle/param hit track.effectChain).
 *  2. RENDER-NOT-CORRUPTED INVARIANT: after setSelectedRackPad, the track-scoped
 *     getActiveEffectChain() STILL returns the track's chain unchanged — the
 *     editor target and the render/compositing source stay DECOUPLED.
 *  3. ANTI-DEAD-FLAG (devicechain_pad_target_writes_pad_chain): with a pad
 *     selected, an add-effect lands in racks[trackId].pads[i].chain (NOT the
 *     track chain), AND buildRackLayers then emits that pad's layer with the
 *     effect in its `chain`. FAIL-BEFORE: the add hit the track chain → pad.chain
 *     stayed empty → the effect never renders on the pad.
 *  4. GUARD: with a pad selected, the freeze/export chain source
 *     (getActiveEffectChain) STILL returns the track chain (freeze/export stay
 *     track-scoped); deleting the selected pad clears selectedRackPad.
 *
 * Real stores + real buildRackLayers (no mocks of the units under test).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, screen, cleanup } from '@testing-library/react'
import DeviceChain from '../../../renderer/components/device-chain/DeviceChain'
import RackDevice from '../../../renderer/components/instruments/RackDevice'
import { useProjectStore, getActiveEffectChain, getActivePadChain } from '../../../renderer/stores/project'
import { useInstrumentsStore } from '../../../renderer/stores/instruments'
import { useTimelineStore } from '../../../renderer/stores/timeline'
import { useEffectsStore } from '../../../renderer/stores/effects'
import { useEngineStore } from '../../../renderer/stores/engine'
import { usePerformanceStore } from '../../../renderer/stores/performance'
import { buildRackLayers } from '../../../renderer/components/instruments/buildRackLayers'
import { EFFECT_DRAG_TYPE } from '../../../renderer/components/effects/EffectBrowser'
import type { TriggerEvent } from '../../../renderer/components/instruments/voiceFSM'
import type { EffectInstance, EffectInfo, ADSREnvelope, Asset } from '../../../shared/types'

const ADSR_INSTANT: ADSREnvelope = { attack: 0, decay: 0, sustain: 1, release: 0 }

const MOCK_INFO: EffectInfo = {
  id: 'pixelsort',
  name: 'Pixel Sort',
  category: 'glitch',
  params: {
    threshold: { type: 'float', min: 0, max: 1, default: 0.5, label: 'Threshold' },
  },
}

function makeEffect(id: string): EffectInstance {
  return {
    id,
    effectId: 'pixelsort',
    isEnabled: true,
    isFrozen: false,
    parameters: { threshold: 0.5 },
    modulations: {},
    mix: 1.0,
    mask: null,
  }
}

function asset(id: string): Asset {
  return {
    id,
    path: `/clip-${id}.mp4`,
    type: 'video',
    meta: { duration: 10, fps: 30, width: 1920, height: 1080 },
  } as unknown as Asset
}

function trig(frameIndex: number, eventIndex: number, instrumentId: string): TriggerEvent {
  return { frameIndex, eventIndex, note: 60, velocity: 127, kind: 'trigger', instrumentId }
}

/** Legacy plain-string fx drag payload (no nonce) the drop handler accepts. */
function fxDataTransfer(effectId: string) {
  return {
    types: [EFFECT_DRAG_TYPE],
    getData: (t: string) => (t === EFFECT_DRAG_TYPE ? effectId : ''),
    dropEffect: '',
  }
}

let TRACK_ID: string

beforeEach(() => {
  useTimelineStore.getState().reset()
  useInstrumentsStore.setState({ instruments: {}, racks: {} })
  usePerformanceStore.setState({ trackEvents: {} })
  useProjectStore.setState({
    assets: {},
    selectedEffectId: null,
    selectedRackPad: null,
    currentFrame: 0,
  })
  useEffectsStore.setState({ registry: [MOCK_INFO], isLoading: false })
  useEngineStore.setState({ status: 'connected', lastFrameMs: 12 })
  // A video track is auto-selected by addTrack's D1 logic → active track.
  TRACK_ID = useTimelineStore.getState().addTrack('V1', '#ff0000')!
})

afterEach(cleanup)

// ─── GATE 1: Regression — no pad selected → track-scoped, exactly as today ────

describe('GATE 1 — DeviceChain with NO pad selected (track-scoped, unchanged)', () => {
  it('add-effect via drop hits the TRACK chain, not any pad chain', () => {
    expect(useProjectStore.getState().selectedRackPad).toBeNull()
    render(<DeviceChain />)
    fireEvent.drop(screen.getByTestId('device-chain'), { dataTransfer: fxDataTransfer('pixelsort') })

    const trackChain = useTimelineStore.getState().tracks.find((t) => t.id === TRACK_ID)!.effectChain
    expect(trackChain).toHaveLength(1)
    expect(trackChain[0].effectId).toBe('pixelsort')
  })

  it('remove + toggle + updateParam route to the TRACK chain', () => {
    useTimelineStore.getState().updateTrackEffectChain(TRACK_ID, () => [makeEffect('fx-1')])
    render(<DeviceChain />)

    useProjectStore.getState().updateParam(TRACK_ID, 'fx-1', 'threshold', 0.9)
    let chain = useTimelineStore.getState().tracks.find((t) => t.id === TRACK_ID)!.effectChain
    expect(chain[0].parameters.threshold).toBe(0.9)

    useProjectStore.getState().toggleEffect(TRACK_ID, 'fx-1')
    chain = useTimelineStore.getState().tracks.find((t) => t.id === TRACK_ID)!.effectChain
    expect(chain[0].isEnabled).toBe(false)

    useProjectStore.getState().removeEffect(TRACK_ID, 'fx-1')
    chain = useTimelineStore.getState().tracks.find((t) => t.id === TRACK_ID)!.effectChain
    expect(chain).toHaveLength(0)
  })

  it('renders the track chain depth, no pad context label', () => {
    useTimelineStore.getState().updateTrackEffectChain(TRACK_ID, () => [makeEffect('fx-1')])
    render(<DeviceChain />)
    expect(screen.getByTestId('device-chain').textContent).toContain('1 / 10')
    expect(screen.queryByTestId('device-chain-context')).toBeNull()
  })
})

// ─── GATE 2: Render-not-corrupted invariant (editor target ⊥ render source) ───

describe('GATE 2 — selecting/editing a pad does NOT change the track render source', () => {
  it('getActiveEffectChain stays track-scoped + unchanged after setSelectedRackPad', () => {
    useTimelineStore.getState().updateTrackEffectChain(TRACK_ID, () => [makeEffect('track-fx')])
    useInstrumentsStore.getState().addRack(TRACK_ID)
    const padId = useInstrumentsStore.getState().racks[TRACK_ID].pads[0].id

    // BEFORE selection: render source = the track chain.
    expect(getActiveEffectChain().map((e) => e.id)).toEqual(['track-fx'])

    // Select the pad (retarget the EDITOR) and add an effect to the pad chain.
    useProjectStore.getState().setSelectedRackPad(TRACK_ID, padId)
    useInstrumentsStore.getState().addEffectToPad(TRACK_ID, padId, makeEffect('pad-fx'))

    // AFTER: the render/compositing source is the TRACK chain, untouched.
    expect(getActiveEffectChain().map((e) => e.id)).toEqual(['track-fx'])
    // The pad chain is a SEPARATE source.
    expect(getActivePadChain().map((e) => e.id)).toEqual(['pad-fx'])
  })
})

// ─── GATE 3: Anti-dead-flag — pad target writes pad.chain AND it renders ──────

describe('GATE 3 — devicechain_pad_target_writes_pad_chain', () => {
  it('add lands in pad.chain (not track chain) AND buildRackLayers emits it', () => {
    useTimelineStore.getState().updateTrackEffectChain(TRACK_ID, () => [makeEffect('track-marker')])
    useProjectStore.setState({ assets: { 'clip-a': asset('clip-a') } })
    useInstrumentsStore.getState().addRack(TRACK_ID)
    const padId = useInstrumentsStore.getState().racks[TRACK_ID].pads[0].id
    useInstrumentsStore.getState().setRackPadSource(TRACK_ID, padId, 'clip-a')

    useProjectStore.getState().setSelectedRackPad(TRACK_ID, padId)
    render(<DeviceChain />)
    fireEvent.drop(screen.getByTestId('device-chain'), { dataTransfer: fxDataTransfer('pixelsort') })

    // PASS-AFTER: effect landed in the PAD chain.
    const rack = useInstrumentsStore.getState().racks[TRACK_ID]
    const padChain = rack.pads[0].chain ?? []
    expect(padChain).toHaveLength(1)
    expect(padChain[0].effectId).toBe('pixelsort')

    // FAIL-BEFORE oracle: pre-fix the add hit the TRACK chain (pad.chain stayed
    // empty). Here the track chain is UNCHANGED, proving the mutation redirected.
    const trackChain = useTimelineStore.getState().tracks.find((t) => t.id === TRACK_ID)!.effectChain
    expect(trackChain.map((e) => e.id)).toEqual(['track-marker'])

    // AND it actually RENDERS on the pad: buildRackLayers carries the pad's chain
    // onto the voice layer it emits (the chain is not a write-only field).
    const layers = buildRackLayers(rack, {
      eventsByPad: { [padId]: [trig(0, 0, rack.pads[0].instrument.id)] },
      frame: 10,
      assets: { 'clip-a': asset('clip-a') },
      defaultFps: 30,
      adsr: ADSR_INSTANT,
    })
    expect(layers.length).toBeGreaterThan(0)
    expect(layers[0].chain.map((e) => e.effectId)).toEqual(['pixelsort'])
  })
})

// ─── GATE 4: Guard — freeze/export track-scoped; delete clears selection ──────

describe('GATE 4 — freeze/export stay track-scoped; pad-delete clears selection', () => {
  it('getActiveEffectChain (freeze/export source) returns the TRACK chain even with a pad selected', () => {
    useTimelineStore.getState().updateTrackEffectChain(TRACK_ID, () => [makeEffect('track-fx')])
    useInstrumentsStore.getState().addRack(TRACK_ID)
    const padId = useInstrumentsStore.getState().racks[TRACK_ID].pads[0].id
    useInstrumentsStore.getState().addEffectToPad(TRACK_ID, padId, makeEffect('pad-fx'))
    useProjectStore.getState().setSelectedRackPad(TRACK_ID, padId)

    const freezeExportSource = getActiveEffectChain()
    expect(freezeExportSource.map((e) => e.id)).toEqual(['track-fx'])
    expect(freezeExportSource.map((e) => e.id)).not.toContain('pad-fx')
  })

  it('deleting the selected pad clears selectedRackPad (no dangling target)', () => {
    useInstrumentsStore.getState().addRack(TRACK_ID)
    const padId = useInstrumentsStore.getState().racks[TRACK_ID].pads[0].id
    render(<RackDevice trackId={TRACK_ID} />)
    fireEvent.click(screen.getByTestId(`rack-pad-${padId}`))
    expect(useProjectStore.getState().selectedRackPad).toEqual({ trackId: TRACK_ID, padId })
    fireEvent.click(screen.getByTestId(`rack-pad-delete-${padId}`))
    expect(useProjectStore.getState().selectedRackPad).toBeNull()
  })

  it('resolver returns [] gracefully when the selected pad is gone (no crash)', () => {
    useInstrumentsStore.getState().addRack(TRACK_ID)
    const padId = useInstrumentsStore.getState().racks[TRACK_ID].pads[0].id
    useProjectStore.getState().setSelectedRackPad(TRACK_ID, padId)
    useInstrumentsStore.getState().removeRackPad(TRACK_ID, padId)
    expect(getActivePadChain()).toEqual([])
    render(<DeviceChain />)
    expect(screen.getByTestId('device-chain')).toBeTruthy()
  })
})
