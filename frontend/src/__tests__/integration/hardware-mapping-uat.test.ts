/**
 * Hardware-mapping UAT integration suite (#426).
 *
 * The H1-H7 packets each already have thorough PER-PACKET unit coverage
 * (bank-resolver.test.ts, cc-record.test.ts, renderer/bank-paging.test.ts,
 * h6-velocity-plumbing.test.ts, stores/controller-identity.test.ts,
 * components/performance/h3-learn-surface.test.tsx). What none of them prove
 * is the single continuous SESSION #426 asks for: one physical knob, injected
 * at the exact boundary real hardware feeds (`handleMIDIMessage` -- the same
 * call `useMIDI.ts`'s `onmidimessage` handler makes), carried through
 * focus-select -> bank-resolve -> learn -> record -> persist -> velocity ->
 * page, with the SAME CC number proving focus/page-follows rather than each
 * packet asserting its slice against a hand-built fixture.
 *
 * See docs/uat/UAT-STAGE-HARDWARE-MAPPING.md for the checkpoint-by-checkpoint
 * mapping of these tests to the UAT stage doc.
 *
 * KNOWN GAP (filed as issue #440, NOT fixed here -- this task is tests/docs
 * only): there is no UI path that lets a user LEARN a ccBankBindings entry
 * (physical CC -> bank slot address) for non-MIDImix hardware.
 * `setCCBankBinding` has zero call sites outside this file's fixture setup,
 * the other H2 test files, and the MIDImix factory-profile path
 * (`applyControllerProfile`). Every test below that needs a bank binding
 * calls `setCCBankBinding` directly (matching the pattern every existing H2
 * test already uses) to prove the ENGINE resolves correctly; the
 * corresponding UAT checkpoint for "a user learns a bank slot on generic
 * hardware" is marked BLOCKED-BY-BUG in the stage doc, not AUTOMATED.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useMIDIStore } from '../../renderer/stores/midi'
import { usePerformanceStore } from '../../renderer/stores/performance'
import { useTimelineStore } from '../../renderer/stores/timeline'
import { useProjectStore } from '../../renderer/stores/project'
import { useAutomationStore } from '../../renderer/stores/automation'
import { useUndoStore } from '../../renderer/stores/undo'
import {
  applyBankModulations,
  _resetBankResolverWarnState,
} from '../../renderer/components/performance/applyBankModulations'
import { snapshotMappingContext } from '../../renderer/utils/mappingSnapshot'
import { installCCRecordSubscriber, _resetCCRecordWarnState } from '../../renderer/utils/cc-record'
import {
  deriveControllerFingerprint,
  getBindingsForFingerprint,
} from '../../shared/controllerIdentity'
import { BANK_ROWS, BANK_COLS } from '../../shared/bankTypes'
import type { BankAssignment, SlotTarget } from '../../shared/bankTypes'
import type { EffectInstance } from '../../shared/types'

// happy-dom's localStorage is unreliable in this test env -- mirrors the
// mock already used in stores/controller-identity.test.ts.
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value }),
    removeItem: vi.fn((key: string) => { delete store[key] }),
    clear: vi.fn(() => { store = {} }),
  }
})()
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true })

function resetAll() {
  useUndoStore.getState().clear()
  useTimelineStore.getState().reset()
  useAutomationStore.getState().resetAutomation()
  usePerformanceStore.getState().resetDrumRack()
  useMIDIStore.getState().resetMIDI()
  useMIDIStore.setState({ devices: [], activeDeviceId: null, isSupported: true })
  useProjectStore.setState({ selectedEffectId: null, selectedRackPad: null })
  _resetCCRecordWarnState()
  _resetBankResolverWarnState()
  localStorageMock.clear()
}

/** Build a 3-byte MIDI note-on message -- the exact shape useMIDI.ts's onmidimessage receives. */
function noteOn(note: number, velocity: number): Uint8Array {
  return new Uint8Array([0x90, note, velocity])
}

/** Build a 3-byte MIDI CC message -- the exact shape useMIDI.ts's onmidimessage receives. */
function cc(ccNumber: number, value: number): Uint8Array {
  return new Uint8Array([0xb0, ccNumber, value])
}

/** A full 4x8 bank grid with exactly one slot filled. */
function makeAssignment(contextKey: string, row: number, col: number, target: SlotTarget): BankAssignment {
  const slots: (SlotTarget | null)[][] = Array.from({ length: BANK_ROWS }, () =>
    Array.from({ length: BANK_COLS }, () => null as SlotTarget | null),
  )
  slots[row][col] = target
  return { contextKey, slots }
}

/** One effect instance with two independently-observable numeric params. */
function makeChain(): EffectInstance[] {
  return [
    {
      id: 'fx-1',
      effectId: 'glitch',
      isEnabled: true,
      isFrozen: false,
      parameters: { amount: 0.1, threshold: 0.2 },
      modulations: {},
      mix: 1,
      mask: null,
    },
  ]
}

function setPadDirect(padId: string, updates: Record<string, unknown>) {
  const { drumRack } = usePerformanceStore.getState()
  const idx = drumRack.pads.findIndex((p) => p.id === padId)
  if (idx === -1) throw new Error(`Pad ${padId} not found`)
  const pads = [...drumRack.pads]
  pads[idx] = { ...pads[idx], ...updates }
  usePerformanceStore.setState({ drumRack: { ...drumRack, pads } })
}

describe('Hardware-mapping UAT session — H1: focus select drives H2: bank resolve', () => {
  beforeEach(resetAll)

  it('the SAME physical CC (never re-learned) resolves to a DIFFERENT effect param as focus moves between two tracks, fed via handleMIDIMessage', () => {
    const trackA = useTimelineStore.getState().addTrack('Track A', '#4ade80', 'video')!
    const trackB = useTimelineStore.getState().addTrack('Track B', '#4ade80', 'video')!

    // One physical knob, one bank slot, learned ONCE.
    useMIDIStore.getState().setCCBankBinding(20, { row: 0, col: 0 })
    useMIDIStore.getState().setBankAssignment(
      `track:${trackA}`,
      makeAssignment(`track:${trackA}`, 0, 0, { kind: 'effectParam', effectId: 'fx-1', paramKey: 'amount' }),
    )
    useMIDIStore.getState().setBankAssignment(
      `track:${trackB}`,
      makeAssignment(`track:${trackB}`, 0, 0, { kind: 'effectParam', effectId: 'fx-1', paramKey: 'threshold' }),
    )

    // Focus track A, physically turn the knob -- handleMIDIMessage IS the real Web-MIDI feed point.
    useTimelineStore.setState({ selectedTrackId: trackA, selectedClipIds: [] })
    useMIDIStore.getState().handleMIDIMessage(cc(20, 95), 0)
    let ctx = snapshotMappingContext()
    let out = applyBankModulations(
      makeChain(), [], useMIDIStore.getState().ccBankBindings, useMIDIStore.getState().ccValues,
      useMIDIStore.getState().bankAssignments, ctx, {},
    )
    expect(out[0].parameters.amount).toBeCloseTo(95 / 127, 4)
    expect(out[0].parameters.threshold).toBe(0.2) // untouched

    // Refocus track B WITHOUT re-learning the knob -- same physical CC, same value.
    useTimelineStore.setState({ selectedTrackId: trackB, selectedClipIds: [] })
    ctx = snapshotMappingContext()
    out = applyBankModulations(
      makeChain(), [], useMIDIStore.getState().ccBankBindings, useMIDIStore.getState().ccValues,
      useMIDIStore.getState().bankAssignments, ctx, {},
    )
    expect(out[0].parameters.threshold).toBeCloseTo(95 / 127, 4)
    expect(out[0].parameters.amount).toBe(0.1) // untouched -- proves focus-follows, not a coincidence
  })

  it('a pad selected on the OTHER track does not steal bank focus (Tiger fix) -- the active track keeps resolving its own assignment', () => {
    const trackA = useTimelineStore.getState().addTrack('Track A', '#4ade80', 'video')!
    const trackB = useTimelineStore.getState().addTrack('Track B', '#4ade80', 'video')!

    useMIDIStore.getState().setCCBankBinding(21, { row: 0, col: 1 })
    useMIDIStore.getState().setBankAssignment(
      `track:${trackB}`,
      makeAssignment(`track:${trackB}`, 0, 1, { kind: 'effectParam', effectId: 'fx-1', paramKey: 'amount' }),
    )

    // Track B is active; a rack pad selection belongs to track A (not active) -- must not be adopted.
    useTimelineStore.setState({ selectedTrackId: trackB, selectedClipIds: [] })
    useProjectStore.setState({ selectedRackPad: { trackId: trackA, padId: 'pad-0', branchPath: [] } })

    useMIDIStore.getState().handleMIDIMessage(cc(21, 64), 0)
    const ctx = snapshotMappingContext()
    expect(ctx.kind).toBe('track')
    expect((ctx as { trackId: string }).trackId).toBe(trackB)

    const out = applyBankModulations(
      makeChain(), [], useMIDIStore.getState().ccBankBindings, useMIDIStore.getState().ccValues,
      useMIDIStore.getState().bankAssignments, ctx, {},
    )
    expect(out[0].parameters.amount).toBeCloseTo(64 / 127, 4)
  })
})

describe('Hardware-mapping UAT session — H3: widened learn surface via handleMIDIMessage', () => {
  beforeEach(resetAll)

  it('arming a macro-slot learn and moving a CC binds a direct CCSlotMapping; legacy effect-knob learn is unaffected', () => {
    const trackId = useTimelineStore.getState().addTrack('Track', '#4ade80', 'video')!

    // Arm a macro-slot learn (mirrors right-clicking a rack macro slider, RackDevice.tsx).
    useMIDIStore.getState().setLearnTarget({ type: 'slot', target: { kind: 'macro', trackId, macroId: 'macro-1' } })
    useMIDIStore.getState().handleMIDIMessage(cc(30, 64), 0)

    expect(useMIDIStore.getState().learnTarget).toBeNull()
    expect(useMIDIStore.getState().ccSlotMappings).toEqual([
      { cc: 30, target: { kind: 'macro', trackId, macroId: 'macro-1' } },
    ])

    // Regression: legacy effect-knob learn (ParamPanel.tsx right-click) still
    // writes ccMappings only -- H3 must never repoint this existing path.
    useMIDIStore.getState().setLearnTarget({ type: 'cc', effectId: 'fx-1', paramKey: 'gain' })
    useMIDIStore.getState().handleMIDIMessage(cc(31, 100), 0)
    expect(useMIDIStore.getState().ccMappings).toEqual([{ cc: 31, effectId: 'fx-1', paramKey: 'gain' }])
    expect(useMIDIStore.getState().ccSlotMappings).toHaveLength(1) // unchanged by the cc-learn
  })

  it('note-on (not a CC) does not consume a slot learn -- learn stays armed until an actual CC arrives', () => {
    useMIDIStore.getState().setLearnTarget({ type: 'slot', target: { kind: 'mask', nodeId: 'n1', param: 'feather' } })
    useMIDIStore.getState().handleMIDIMessage(noteOn(60, 100), 0)
    expect(useMIDIStore.getState().learnTarget).not.toBeNull()
    expect(useMIDIStore.getState().ccSlotMappings).toHaveLength(0)
  })
})

describe('Hardware-mapping UAT session — H4: CC-records-automation, focus-follows-records', () => {
  beforeEach(resetAll)
  afterEach(() => vi.useRealTimers())

  it('a bank-bound CC records into the resolved lane, and the SAME CC records into a DIFFERENT lane after refocus -- both moves fed via handleMIDIMessage', () => {
    vi.useFakeTimers()
    const trackId = useTimelineStore.getState().addTrack('Track', '#4ade80', 'video')!
    useAutomationStore.getState().setMode('latch')
    useAutomationStore.getState().armTrack(trackId)
    useTimelineStore.getState().setPlayheadTime(3)

    useAutomationStore.getState().addLane(trackId, 'fxA', 'gain', '#4ade80')
    useAutomationStore.getState().addLane(trackId, 'fxB', 'gain', '#4ade80')
    const [laneA, laneB] = useAutomationStore.getState().lanes[trackId]

    useMIDIStore.getState().setCCBankBinding(40, { row: 1, col: 1 })
    useMIDIStore.getState().setBankAssignment(
      'track:ctx-a',
      makeAssignment('track:ctx-a', 1, 1, { kind: 'effectParam', effectId: 'fxA', paramKey: 'gain' }),
    )
    useMIDIStore.getState().setBankAssignment(
      'track:ctx-b',
      makeAssignment('track:ctx-b', 1, 1, { kind: 'effectParam', effectId: 'fxB', paramKey: 'gain' }),
    )

    const unsub = installCCRecordSubscriber(() => true)
    try {
      useTimelineStore.setState({ selectedTrackId: 'ctx-a', selectedClipIds: [] })
      useMIDIStore.getState().handleMIDIMessage(cc(40, 89), 0)
      expect(useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneA.id)!.points).toHaveLength(1)
      expect(useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneB.id)!.points).toHaveLength(0)

      // Refocus B. The second move may land as an immediate 'write' or a
      // throttled 'defer' depending on wall-clock timing between the two
      // synchronous calls (B10 rate limiter) -- either way the value is NEVER
      // dropped (trailing-edge flush), so draining the timer queue guarantees
      // it has landed before the assertion.
      useTimelineStore.setState({ selectedTrackId: 'ctx-b', selectedClipIds: [] })
      useMIDIStore.getState().handleMIDIMessage(cc(40, 30), 5)
      vi.advanceTimersByTime(50)

      expect(useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneB.id)!.points).toHaveLength(1)
      expect(useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneB.id)!.points[0].value).toBeCloseTo(30 / 127, 4)
      // Lane A untouched by the second move -- proves it recorded to a DIFFERENT lane, not a second point on the same one.
      expect(useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneA.id)!.points).toHaveLength(1)
    } finally {
      unsub()
    }
  })

  it('the same setup with automation in read mode (not armed) records nothing, even as the CC keeps flowing through handleMIDIMessage', () => {
    const trackId = useTimelineStore.getState().addTrack('Track', '#4ade80', 'video')!
    useAutomationStore.getState().addLane(trackId, 'fxA', 'gain', '#4ade80')
    const [lane] = useAutomationStore.getState().lanes[trackId]

    useMIDIStore.getState().setCCBankBinding(41, { row: 0, col: 0 })
    useMIDIStore.getState().setBankAssignment(
      `track:${trackId}`,
      makeAssignment(`track:${trackId}`, 0, 0, { kind: 'effectParam', effectId: 'fxA', paramKey: 'gain' }),
    )
    useTimelineStore.setState({ selectedTrackId: trackId, selectedClipIds: [] })
    useAutomationStore.getState().setMode('read') // NOT armed

    const unsub = installCCRecordSubscriber(() => true)
    try {
      useMIDIStore.getState().handleMIDIMessage(cc(41, 77), 0)
      expect(useAutomationStore.getState().lanes[trackId].find((l) => l.id === lane.id)!.points).toHaveLength(0)
    } finally {
      unsub()
    }
  })
})

describe('Hardware-mapping UAT session — H5: controller-identity survives a simulated project reopen', () => {
  beforeEach(resetAll)

  it('a learned bank binding survives resetMIDI (project close/reopen) once the SAME controller reconnects', () => {
    const midi = useMIDIStore.getState()
    midi.applyControllerIdentity({ name: 'Generic Pad', manufacturer: 'Generic Co' })
    midi.setCCBankBinding(50, { row: 2, col: 2 })

    const fp = deriveControllerFingerprint('Generic Pad', 'Generic Co')
    expect(getBindingsForFingerprint(fp)).toEqual([{ cc: 50, slot: { row: 2, col: 2 } }])

    // Simulate File > Open. project-persistence.ts's hydrateStores() calls
    // useMIDIStore.getState().resetMIDI(); getMIDIPersistData()/loadMIDIMappings()
    // never carry activeControllerFingerprint (confirmed by reading both --
    // it's an APP-level identity, not a per-project field, by design per the
    // H5 module doc in shared/controllerIdentity.ts). So the correct
    // round-trip proof is resetMIDI() followed by the device reconnect
    // handshake useMIDI.ts performs (applyControllerIdentity), not a
    // project-file field lookup.
    useMIDIStore.getState().resetMIDI()
    expect(useMIDIStore.getState().ccBankBindings).toEqual([])
    expect(useMIDIStore.getState().activeControllerFingerprint).toBeNull()

    useMIDIStore.getState().applyControllerIdentity({ name: 'Generic Pad', manufacturer: 'Generic Co' })
    expect(useMIDIStore.getState().ccBankBindings).toEqual([{ cc: 50, slot: { row: 2, col: 2 } }])
  })

  it('a DIFFERENT controller reconnecting after reopen gets its own (empty) bindings, never the previous controller\'s', () => {
    useMIDIStore.getState().applyControllerIdentity({ name: 'Controller A', manufacturer: 'Vendor A' })
    useMIDIStore.getState().setCCBankBinding(1, { row: 0, col: 0 })
    useMIDIStore.getState().resetMIDI()

    useMIDIStore.getState().applyControllerIdentity({ name: 'Controller B', manufacturer: 'Vendor B' })
    expect(useMIDIStore.getState().ccBankBindings).toEqual([])
  })
})

describe('Project save/reopen round-trip for the PROJECT-scoped H2/H3 fields (contrast with H5 above)', () => {
  beforeEach(resetAll)

  it('ccBankBindings, bankAssignments, and ccSlotMappings all round-trip through getMIDIPersistData -> loadMIDIMappings', () => {
    useMIDIStore.getState().setCCBankBinding(11, { row: 0, col: 0 })
    useMIDIStore.getState().setBankAssignment(
      'track:t1',
      makeAssignment('track:t1', 0, 0, { kind: 'effectParam', effectId: 'fx-1', paramKey: 'amount' }),
    )
    useMIDIStore.getState().addCCSlotMapping({ cc: 12, target: { kind: 'macro', trackId: 't1', macroId: 'm1' } })

    const persisted = useMIDIStore.getState().getMIDIPersistData()
    useMIDIStore.getState().resetMIDI()
    expect(useMIDIStore.getState().ccBankBindings).toEqual([])

    useMIDIStore.getState().loadMIDIMappings(persisted)

    expect(useMIDIStore.getState().ccBankBindings).toEqual([{ cc: 11, slot: { row: 0, col: 0 } }])
    expect(useMIDIStore.getState().bankAssignments['track:t1']).toBeDefined()
    expect(useMIDIStore.getState().ccSlotMappings).toEqual([
      { cc: 12, target: { kind: 'macro', trackId: 't1', macroId: 'm1' } },
    ])
  })

  it('getMIDIPersistData does NOT carry activeControllerFingerprint -- confirms H5 identity is app-scoped by design, not a save/load gap', () => {
    useMIDIStore.getState().applyControllerIdentity({ name: 'X', manufacturer: 'Y' })
    const persisted = useMIDIStore.getState().getMIDIPersistData() as unknown as Record<string, unknown>
    expect('activeControllerFingerprint' in persisted).toBe(false)
  })
})

describe('Hardware-mapping UAT session — H6: velocity, fed via handleMIDIMessage', () => {
  beforeEach(resetAll)

  it('a soft hit and a hard hit on the same pad produce different padStates.velocity -- proves it is not hardcoded', () => {
    setPadDirect('pad-0', { midiNote: 61 })
    useMIDIStore.getState().handleMIDIMessage(noteOn(61, 12), 0)
    expect(usePerformanceStore.getState().padStates['pad-0'].velocity).toBe(12)

    usePerformanceStore.getState().resetDrumRack()
    setPadDirect('pad-0', { midiNote: 61 })
    useMIDIStore.getState().handleMIDIMessage(noteOn(61, 127), 0)
    expect(usePerformanceStore.getState().padStates['pad-0'].velocity).toBe(127)
  })
})

describe('Hardware-mapping UAT session — H7: bank paging changes what the SAME bound CC resolves to', () => {
  beforeEach(resetAll)

  it('bankPageRight (the BankPagingHUD action) changes the resolved effect param for an already-bound CC, fed via handleMIDIMessage', () => {
    const trackId = useTimelineStore.getState().addTrack('Track', '#4ade80', 'video')!
    useTimelineStore.setState({ selectedTrackId: trackId, selectedClipIds: [] })

    useMIDIStore.getState().setCCBankBinding(60, { row: 0, col: 0 })
    useMIDIStore.getState().setBankAssignment(
      `track:${trackId}`,
      makeAssignment(`track:${trackId}`, 0, 0, { kind: 'effectParam', effectId: 'fx-1', paramKey: 'amount' }),
    )
    useMIDIStore.getState().setBankAssignment(
      `track:${trackId}::bank1`,
      makeAssignment(`track:${trackId}::bank1`, 0, 0, { kind: 'effectParam', effectId: 'fx-1', paramKey: 'threshold' }),
    )

    useMIDIStore.getState().handleMIDIMessage(cc(60, 100), 0)
    let ctx = snapshotMappingContext()
    let out = applyBankModulations(
      makeChain(), [], useMIDIStore.getState().ccBankBindings, useMIDIStore.getState().ccValues,
      useMIDIStore.getState().bankAssignments, ctx, {}, undefined, useMIDIStore.getState().activeBankIndex,
    )
    expect(out[0].parameters.amount).toBeCloseTo(100 / 127, 4)

    // Page right -- mirrors clicking BankPagingHUD's right arrow.
    useMIDIStore.getState().bankPageRight()
    expect(useMIDIStore.getState().activeBankIndex).toBe(1)

    ctx = snapshotMappingContext()
    out = applyBankModulations(
      makeChain(), [], useMIDIStore.getState().ccBankBindings, useMIDIStore.getState().ccValues,
      useMIDIStore.getState().bankAssignments, ctx, {}, undefined, useMIDIStore.getState().activeBankIndex,
    )
    expect(out[0].parameters.threshold).toBeCloseTo(100 / 127, 4)
    expect(out[0].parameters.amount).toBe(0.1) // untouched on the new page -- proves paging, not a coincidence
  })
})
