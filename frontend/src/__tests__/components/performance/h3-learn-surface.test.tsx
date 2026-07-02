/**
 * H3 (master plan WS5) — widened MIDI-learn surface.
 *
 * Proves the four new learn surfaces (rack macros, instrument device knobs,
 * transform fields, mask op sliders) each ARM the correct LearnTarget, that the
 * first CC after arming BINDS the right SlotTarget into ccSlotMappings, and that
 * the legacy effect-knob learn regression stays green (still writes ccMappings,
 * never touches ccSlotMappings).
 *
 * Rules inlined (subagent brief): (1) any numeric crossing a trust boundary
 * (the CC number on the learn-consume write, the ccSlotMappings deserialize on
 * project load) must be clamp/finite-guarded — asserted below. (2) reuse H2's
 * SlotTarget types, no parallel target-descriptor type.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, screen, cleanup } from '@testing-library/react'
import { useMIDIStore } from '../../../renderer/stores/midi'
import { useInstrumentsStore } from '../../../renderer/stores/instruments'
import { useProjectStore } from '../../../renderer/stores/project'
import { useTimelineStore } from '../../../renderer/stores/timeline'
import RackDevice from '../../../renderer/components/instruments/RackDevice'
import SamplerDevice from '../../../renderer/components/instruments/SamplerDevice'
import MaskStackPanel from '../../../renderer/components/masking/MaskStackPanel'
import TransformPanel from '../../../renderer/components/timeline/TransformPanel'
import { armInstrumentLearn } from '../../../renderer/components/instruments/instrumentLearn'
import {
  isValidSlotTarget,
  isValidCCSlotMapping,
  MAX_CC_SLOT_MAPPINGS,
} from '../../../shared/bankTypes'
import { IDENTITY_TRANSFORM } from '../../../shared/types'
import type { MIDIPersistData, MatteNode } from '../../../shared/types'
import type { SlotTarget } from '../../../shared/bankTypes'

const T = 'track-1'

// Helper: build a MIDI CC message Uint8Array (status 0xb0).
function ccMsg(cc: number, value: number): Uint8Array {
  return new Uint8Array([0xb0, cc, value])
}
function noteOn(note: number, vel: number): Uint8Array {
  return new Uint8Array([0x90, note, vel])
}

beforeEach(() => {
  useMIDIStore.getState().resetMIDI()
  useInstrumentsStore.setState({ instruments: {}, racks: {}, granulators: {}, frameBanks: {} })
  useProjectStore.setState({ assets: {}, currentFrame: 0 })
})
afterEach(() => cleanup())

// ───────────────────────────────────────────────────────────────────────────
// 1. Learn-consume path — one test per new SlotTarget kind
// ───────────────────────────────────────────────────────────────────────────
describe('H3 learn-consume: first CC after arming binds the right SlotTarget', () => {
  function armAndSendCC(target: SlotTarget, cc: number, value: number) {
    useMIDIStore.getState().setLearnTarget({ type: 'slot', target })
    expect(useMIDIStore.getState().learnTarget).not.toBeNull()
    useMIDIStore.getState().handleMIDIMessage(ccMsg(cc, value), 0)
  }

  it('macro target → CCSlotMapping{cc, kind:macro}', () => {
    armAndSendCC({ kind: 'macro', trackId: T, macroId: 'm1' }, 20, 64)
    const m = useMIDIStore.getState().ccSlotMappings
    expect(m).toHaveLength(1)
    expect(m[0]).toEqual({ cc: 20, target: { kind: 'macro', trackId: T, macroId: 'm1' } })
    expect(useMIDIStore.getState().learnTarget).toBeNull()
  })

  it('instrument target → CCSlotMapping{cc, kind:instrument}', () => {
    armAndSendCC({ kind: 'instrument', trackId: T, paramKey: 'speed' }, 21, 10)
    expect(useMIDIStore.getState().ccSlotMappings[0]).toEqual({
      cc: 21,
      target: { kind: 'instrument', trackId: T, paramKey: 'speed' },
    })
  })

  it('transform target → CCSlotMapping{cc, kind:transform}', () => {
    armAndSendCC({ kind: 'transform', clipId: 'clip-9', field: 'rotation' }, 22, 100)
    expect(useMIDIStore.getState().ccSlotMappings[0]).toEqual({
      cc: 22,
      target: { kind: 'transform', clipId: 'clip-9', field: 'rotation' },
    })
  })

  it('mask target → CCSlotMapping{cc, kind:mask}', () => {
    armAndSendCC({ kind: 'mask', nodeId: 'node-3', param: 'feather' }, 23, 55)
    expect(useMIDIStore.getState().ccSlotMappings[0]).toEqual({
      cc: 23,
      target: { kind: 'mask', nodeId: 'node-3', param: 'feather' },
    })
  })

  it('one CC → one target (re-learning the same CC overwrites)', () => {
    armAndSendCC({ kind: 'macro', trackId: T, macroId: 'm1' }, 30, 1)
    armAndSendCC({ kind: 'mask', nodeId: 'n', param: 'growShrink' }, 30, 1)
    const m = useMIDIStore.getState().ccSlotMappings
    expect(m).toHaveLength(1)
    expect(m[0].target).toEqual({ kind: 'mask', nodeId: 'n', param: 'growShrink' })
  })

  it('a note-on (not CC) does NOT consume a slot learn (wrong message type)', () => {
    useMIDIStore.getState().setLearnTarget({ type: 'slot', target: { kind: 'macro', trackId: T, macroId: 'm1' } })
    useMIDIStore.getState().handleMIDIMessage(noteOn(60, 100), 0)
    expect(useMIDIStore.getState().learnTarget).not.toBeNull() // still armed
    expect(useMIDIStore.getState().ccSlotMappings).toHaveLength(0)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// 2. Effect-knob learn regression — MUST stay unchanged
// ───────────────────────────────────────────────────────────────────────────
describe('H3 regression: legacy effect-knob learn is unchanged', () => {
  it("type:'cc' still writes ccMappings and never touches ccSlotMappings", () => {
    useMIDIStore.getState().setLearnTarget({ type: 'cc', effectId: 'fx-1', paramKey: 'amount' })
    useMIDIStore.getState().handleMIDIMessage(ccMsg(7, 64), 0)
    expect(useMIDIStore.getState().ccMappings).toEqual([{ cc: 7, effectId: 'fx-1', paramKey: 'amount' }])
    expect(useMIDIStore.getState().ccSlotMappings).toHaveLength(0)
    expect(useMIDIStore.getState().learnTarget).toBeNull()
  })
})

// ───────────────────────────────────────────────────────────────────────────
// 3. Each UI surface arms the correct LearnTarget (render + right-click)
// ───────────────────────────────────────────────────────────────────────────
describe('H3 surfaces: right-click arms the correct LearnTarget', () => {
  it('rack macro slider arms a macro SlotTarget', () => {
    useInstrumentsStore.getState().addRack(T)
    const macroId = useInstrumentsStore.getState().addRackMacro(T, 'Chaos')!
    render(<RackDevice trackId={T} />)
    fireEvent.contextMenu(screen.getByTestId('rack-macro-value'))
    expect(useMIDIStore.getState().learnTarget).toEqual({
      type: 'slot',
      target: { kind: 'macro', trackId: T, macroId },
    })
  })

  it('sampler (instrument) knob arms an instrument SlotTarget', () => {
    useInstrumentsStore.getState().addSampler(T)
    render(<SamplerDevice trackId={T} />)
    fireEvent.contextMenu(screen.getByTestId('sampler-speed'))
    expect(useMIDIStore.getState().learnTarget).toEqual({
      type: 'slot',
      target: { kind: 'instrument', trackId: T, paramKey: 'speed' },
    })
  })

  it('mask op slider arms a mask SlotTarget', () => {
    const trackId = useTimelineStore.getState().addTrack('V1', '#ff0000')!
    const node: MatteNode = {
      id: 'mask-node-1',
      kind: 'rect',
      params: { x: 0, y: 0, w: 10, h: 10 },
      op: 'add',
      invert: false,
      feather: 0,
      growShrink: 0,
      enabled: true,
    }
    useTimelineStore.getState().addClip(trackId, {
      id: 'clip-1', assetId: 'a', trackId, position: 0, duration: 120,
      inPoint: 0, outPoint: 120, speed: 1, maskStack: [node],
    } as never)
    render(<MaskStackPanel clipId="clip-1" />)
    fireEvent.contextMenu(screen.getByTestId('mask-node-feather-mask-node-1'))
    expect(useMIDIStore.getState().learnTarget).toEqual({
      type: 'slot',
      target: { kind: 'mask', nodeId: 'mask-node-1', param: 'feather' },
    })
  })

  it('transform field arms a transform SlotTarget (with clipId)', () => {
    render(
      <TransformPanel
        clipId="clip-42"
        transform={IDENTITY_TRANSFORM}
        onChange={() => {}}
        canvasWidth={1920}
        canvasHeight={1080}
        sourceWidth={1920}
        sourceHeight={1080}
      />,
    )
    const rotInput = document.querySelectorAll('.transform-panel__input')
    // The rotation field is the last number input in the panel.
    fireEvent.contextMenu(rotInput[rotInput.length - 1])
    const lt = useMIDIStore.getState().learnTarget
    expect(lt?.type).toBe('slot')
    expect((lt as { target: SlotTarget }).target.kind).toBe('transform')
    expect((lt as { target: { clipId: string } }).target.clipId).toBe('clip-42')
  })

  it('transform field is a no-op when clipId is absent (no crash, no arm)', () => {
    render(
      <TransformPanel
        transform={IDENTITY_TRANSFORM}
        onChange={() => {}}
        canvasWidth={1920}
        canvasHeight={1080}
        sourceWidth={1920}
        sourceHeight={1080}
      />,
    )
    const inputs = document.querySelectorAll('.transform-panel__input')
    fireEvent.contextMenu(inputs[0])
    expect(useMIDIStore.getState().learnTarget).toBeNull()
  })

  it('armInstrumentLearn helper arms the expected target', () => {
    armInstrumentLearn(T, 'axis.t.grain')
    expect(useMIDIStore.getState().learnTarget).toEqual({
      type: 'slot',
      target: { kind: 'instrument', trackId: T, paramKey: 'axis.t.grain' },
    })
  })
})

// ───────────────────────────────────────────────────────────────────────────
// 4. Trust boundary — validators + persistence roundtrip
// ───────────────────────────────────────────────────────────────────────────
describe('H3 trust boundary: validators + persistence', () => {
  it('isValidSlotTarget accepts the new instrument kind, rejects malformed', () => {
    expect(isValidSlotTarget({ kind: 'instrument', trackId: T, paramKey: 'speed' })).toBe(true)
    expect(isValidSlotTarget({ kind: 'instrument', trackId: '', paramKey: 'speed' })).toBe(false)
    expect(isValidSlotTarget({ kind: 'instrument', trackId: T })).toBe(false)
    expect(isValidSlotTarget({ kind: 'bogus', trackId: T, paramKey: 'x' })).toBe(false)
  })

  it('isValidCCSlotMapping enforces cc 0-127 integer + valid target', () => {
    const target: SlotTarget = { kind: 'macro', trackId: T, macroId: 'm' }
    expect(isValidCCSlotMapping({ cc: 0, target })).toBe(true)
    expect(isValidCCSlotMapping({ cc: 127, target })).toBe(true)
    expect(isValidCCSlotMapping({ cc: 128, target })).toBe(false)
    expect(isValidCCSlotMapping({ cc: -1, target })).toBe(false)
    expect(isValidCCSlotMapping({ cc: 3.5, target })).toBe(false)
    expect(isValidCCSlotMapping({ cc: 3, target: { kind: 'macro', trackId: '', macroId: 'm' } })).toBe(false)
  })

  it('addCCSlotMapping drops an out-of-range CC (trust boundary)', () => {
    // cc 200 is a valid TS `number` but out of MIDI range — the runtime guard
    // (isValidCCSlotMapping) must reject it.
    useMIDIStore.getState().addCCSlotMapping({ cc: 200, target: { kind: 'macro', trackId: T, macroId: 'm' } })
    expect(useMIDIStore.getState().ccSlotMappings).toHaveLength(0)
  })

  it('getMIDIPersistData emits ccSlotMappings; loadMIDIMappings restores them', () => {
    useMIDIStore.getState().addCCSlotMapping({ cc: 40, target: { kind: 'transform', clipId: 'c', field: 'x' } })
    const data = useMIDIStore.getState().getMIDIPersistData()
    expect(data.ccSlotMappings).toEqual([{ cc: 40, target: { kind: 'transform', clipId: 'c', field: 'x' } }])

    useMIDIStore.getState().resetMIDI()
    expect(useMIDIStore.getState().ccSlotMappings).toHaveLength(0)

    useMIDIStore.getState().loadMIDIMappings(data)
    expect(useMIDIStore.getState().ccSlotMappings).toEqual([
      { cc: 40, target: { kind: 'transform', clipId: 'c', field: 'x' } },
    ])
  })

  it('loadMIDIMappings drops malformed ccSlotMappings, keeps valid ones', () => {
    const data = {
      padMidiNotes: {},
      ccMappings: [],
      channelFilter: null,
      ccBankBindings: [],
      bankAssignments: {},
      ccSlotMappings: [
        { cc: 5, target: { kind: 'mask', nodeId: 'n', param: 'feather' } }, // valid
        { cc: 999, target: { kind: 'mask', nodeId: 'n', param: 'feather' } }, // bad cc
        { cc: 6, target: { kind: 'bogus' } }, // bad target
        'not-an-object',
      ],
    } as unknown as MIDIPersistData
    useMIDIStore.getState().loadMIDIMappings(data)
    expect(useMIDIStore.getState().ccSlotMappings).toEqual([
      { cc: 5, target: { kind: 'mask', nodeId: 'n', param: 'feather' } },
    ])
  })

  it('old project without ccSlotMappings → defaults to [] (backward compat)', () => {
    const data = {
      padMidiNotes: {},
      ccMappings: [],
      channelFilter: null,
      ccBankBindings: [],
      bankAssignments: {},
      // no ccSlotMappings key (pre-H3 project)
    } as unknown as MIDIPersistData
    useMIDIStore.getState().loadMIDIMappings(data)
    expect(useMIDIStore.getState().ccSlotMappings).toEqual([])
  })

  it('caps ccSlotMappings at MAX_CC_SLOT_MAPPINGS (evict-oldest)', () => {
    for (let cc = 0; cc < MAX_CC_SLOT_MAPPINGS + 5; cc++) {
      useMIDIStore.getState().addCCSlotMapping({ cc, target: { kind: 'macro', trackId: T, macroId: `m${cc}` } })
    }
    expect(useMIDIStore.getState().ccSlotMappings.length).toBeLessThanOrEqual(MAX_CC_SLOT_MAPPINGS)
  })
})
