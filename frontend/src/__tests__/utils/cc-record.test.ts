/**
 * H4 — cc-record tests: hardware CC moves recorded as automation, bank/context-aware.
 *
 * Anti-dead-flag: every test fails on the pre-H4 tree (where a CC only ever
 * reached ccValues as a transient overlay and NEVER produced a store write).
 *
 * Covers the packet's four required proofs:
 *   1. armed + playing + a bound CC move writes a point to the RESOLVED lane;
 *   2. the SAME CC writes to a DIFFERENT lane after focus changes
 *      (the focus-follows-records proof — only the bank/context path can do this);
 *   3. NOT armed (read mode / no armed track / not playing) → ZERO store writes;
 *   4. rate-limit respected — N raw MIDI messages in one throttle window commit
 *      at most one recorded point (recording rides the B10 limiter via ccValues).
 * Plus the transform + macro dispatch branches.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useAutomationStore } from '../../renderer/stores/automation'
import { useTimelineStore } from '../../renderer/stores/timeline'
import { useMIDIStore } from '../../renderer/stores/midi'
import { useProjectStore } from '../../renderer/stores/project'
import { useUndoStore } from '../../renderer/stores/undo'
import {
  recordCCMove,
  installCCRecordSubscriber,
  _resetCCRecordWarnState,
} from '../../renderer/utils/cc-record'
import { _resetBankResolverWarnState } from '../../renderer/components/performance/applyBankModulations'
import type { SlotTarget, BankAssignment } from '../../shared/bankTypes'
import { BANK_ROWS, BANK_COLS } from '../../shared/bankTypes'
import { formatTransformLaneEffectId } from '../../renderer/utils/transformLanes'
import { IDENTITY_TRANSFORM, type Clip, type AutomationLane } from '../../shared/types'

function resetAll() {
  useUndoStore.getState().clear()
  useTimelineStore.getState().reset()
  useAutomationStore.getState().resetAutomation()
  useMIDIStore.getState().resetMIDI()
  useProjectStore.setState({ selectedEffectId: null, selectedRackPad: null })
  _resetCCRecordWarnState()
  _resetBankResolverWarnState()
}

/** A valid 4x8 bank grid with a single slot filled. */
function makeAssignment(contextKey: string, row: number, col: number, target: SlotTarget): BankAssignment {
  const slots: (SlotTarget | null)[][] = Array.from({ length: BANK_ROWS }, () =>
    Array.from({ length: BANK_COLS }, () => null as SlotTarget | null),
  )
  slots[row][col] = target
  return { contextKey, slots }
}

/** Add an effect-param lane (paramPath = `${effectId}.${paramKey}`); return it. */
function addEffectLane(trackId: string, effectId: string, paramKey: string): AutomationLane {
  useAutomationStore.getState().addLane(trackId, effectId, paramKey, '#4ade80')
  const lanes = useAutomationStore.getState().lanes[trackId]
  return lanes[lanes.length - 1]
}

function getLane(trackId: string, laneId: string): AutomationLane {
  return useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!
}

/** Point a 'track' focus at `id` (context = `track:${id}`). */
function focusTrack(id: string) {
  useTimelineStore.setState({ selectedTrackId: id, selectedClipIds: [] })
  useProjectStore.setState({ selectedEffectId: null, selectedRackPad: null })
}

function setupArmedTrack(): string {
  const trackId = useTimelineStore.getState().addTrack('V1', '#4ade80', 'video')!
  useAutomationStore.getState().setMode('latch')
  useAutomationStore.getState().armTrack(trackId)
  useTimelineStore.getState().setPlayheadTime(2)
  return trackId
}

describe('recordCCMove — bank-bound effectParam', () => {
  beforeEach(resetAll)

  it('armed + playing + bound CC writes a point to the resolved lane', () => {
    const trackId = setupArmedTrack()
    const lane = addEffectLane(trackId, 'fxA', 'gain')
    focusTrack(trackId)

    useMIDIStore.getState().setCCBankBinding(20, { row: 0, col: 0 })
    useMIDIStore
      .getState()
      .setBankAssignment(
        `track:${trackId}`,
        makeAssignment(`track:${trackId}`, 0, 0, { kind: 'effectParam', effectId: 'fxA', paramKey: 'gain' }),
      )

    recordCCMove(20, 0.5, true)

    const points = getLane(trackId, lane.id).points
    expect(points).toHaveLength(1)
    expect(points[0].value).toBeCloseTo(0.5, 5)
    expect(points[0].time).toBeCloseTo(2, 5)
  })

  it('records via a legacy ccMapping when no bank binding exists', () => {
    const trackId = setupArmedTrack()
    const lane = addEffectLane(trackId, 'fxLegacy', 'amount')
    focusTrack(trackId)
    useMIDIStore.getState().addCCMapping({ cc: 42, effectId: 'fxLegacy', paramKey: 'amount' })

    recordCCMove(42, 0.8, true)

    expect(getLane(trackId, lane.id).points).toHaveLength(1)
    expect(getLane(trackId, lane.id).points[0].value).toBeCloseTo(0.8, 5)
  })
})

describe('recordCCMove — focus-follows-records proof', () => {
  beforeEach(resetAll)

  it('the SAME CC writes to a DIFFERENT lane after the focused context changes', () => {
    const trackId = setupArmedTrack()
    const laneA = addEffectLane(trackId, 'fxA', 'gain')
    const laneB = addEffectLane(trackId, 'fxB', 'gain')

    // One physical knob, one bank slot.
    useMIDIStore.getState().setCCBankBinding(20, { row: 1, col: 3 })
    // Two contexts, two assignments — same slot resolves to a different effect.
    useMIDIStore
      .getState()
      .setBankAssignment(
        'track:ctx-a',
        makeAssignment('track:ctx-a', 1, 3, { kind: 'effectParam', effectId: 'fxA', paramKey: 'gain' }),
      )
    useMIDIStore
      .getState()
      .setBankAssignment(
        'track:ctx-b',
        makeAssignment('track:ctx-b', 1, 3, { kind: 'effectParam', effectId: 'fxB', paramKey: 'gain' }),
      )

    // Focus A → same CC records into lane A only.
    focusTrack('ctx-a')
    recordCCMove(20, 0.7, true)
    expect(getLane(trackId, laneA.id).points).toHaveLength(1)
    expect(getLane(trackId, laneB.id).points).toHaveLength(0)

    // Focus B → the SAME CC now records into lane B.
    focusTrack('ctx-b')
    recordCCMove(20, 0.3, true)
    expect(getLane(trackId, laneB.id).points).toHaveLength(1)
    expect(getLane(trackId, laneB.id).points[0].value).toBeCloseTo(0.3, 5)
    // Lane A untouched by the second move.
    expect(getLane(trackId, laneA.id).points).toHaveLength(1)
  })
})

describe('recordCCMove — not-armed regression (byte-identical no-op)', () => {
  beforeEach(resetAll)

  function armedButFor(mutate: () => void, isPlaying = true): AutomationLane {
    const trackId = setupArmedTrack()
    const lane = addEffectLane(trackId, 'fxA', 'gain')
    focusTrack(trackId)
    useMIDIStore.getState().setCCBankBinding(20, { row: 0, col: 0 })
    useMIDIStore
      .getState()
      .setBankAssignment(
        `track:${trackId}`,
        makeAssignment(`track:${trackId}`, 0, 0, { kind: 'effectParam', effectId: 'fxA', paramKey: 'gain' }),
      )
    mutate()
    recordCCMove(20, 0.5, isPlaying)
    return getLane(trackId, lane.id)
  }

  it('read mode → zero store writes', () => {
    expect(armedButFor(() => useAutomationStore.getState().setMode('read')).points).toHaveLength(0)
  })

  it('draw mode → zero store writes', () => {
    expect(armedButFor(() => useAutomationStore.getState().setMode('draw')).points).toHaveLength(0)
  })

  it('no armed track → zero store writes', () => {
    expect(armedButFor(() => useAutomationStore.getState().armTrack(null)).points).toHaveLength(0)
  })

  it('transport not playing → zero store writes', () => {
    expect(armedButFor(() => {}, false).points).toHaveLength(0)
  })

  it('non-finite value → zero store writes', () => {
    const trackId = setupArmedTrack()
    const lane = addEffectLane(trackId, 'fxA', 'gain')
    focusTrack(trackId)
    useMIDIStore.getState().addCCMapping({ cc: 20, effectId: 'fxA', paramKey: 'gain' })
    recordCCMove(20, Number.NaN, true)
    expect(getLane(trackId, lane.id).points).toHaveLength(0)
  })
})

describe('installCCRecordSubscriber — rate-limit respected', () => {
  beforeEach(() => {
    resetAll()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('N raw MIDI messages in one throttle window commit at most one point', () => {
    const trackId = setupArmedTrack()
    const lane = addEffectLane(trackId, 'fxA', 'gain')
    focusTrack(trackId)
    useMIDIStore.getState().addCCMapping({ cc: 20, effectId: 'fxA', paramKey: 'gain' })

    const unsub = installCCRecordSubscriber(() => true)
    try {
      // 5 distinct values, same CC, synchronously (one <33ms window). The B10
      // limiter writes ccValues once (leading edge) and defers the rest; the
      // subscriber therefore fires once → one recorded point. Trailing flushes
      // are scheduled on setTimeout (faked) and do NOT fire here.
      for (const v of [10, 20, 30, 40, 50]) {
        useMIDIStore.getState().handleMIDIMessage(new Uint8Array([0xb0, 20, v]), 0)
      }
      expect(getLane(trackId, lane.id).points).toHaveLength(1)
    } finally {
      unsub()
    }
  })

  it('a not-armed subscriber records nothing even as CC values flow', () => {
    const trackId = setupArmedTrack()
    const lane = addEffectLane(trackId, 'fxA', 'gain')
    focusTrack(trackId)
    useMIDIStore.getState().addCCMapping({ cc: 20, effectId: 'fxA', paramKey: 'gain' })
    useAutomationStore.getState().setMode('read') // disarm

    const unsub = installCCRecordSubscriber(() => true)
    try {
      useMIDIStore.getState().handleMIDIMessage(new Uint8Array([0xb0, 20, 64]), 0)
      expect(getLane(trackId, lane.id).points).toHaveLength(0)
    } finally {
      unsub()
    }
  })
})

describe('recordCCMove — transform + macro dispatch', () => {
  beforeEach(resetAll)

  function setupClipOnTrack(trackId: string): string {
    const clip: Clip = {
      id: 'clip-1',
      assetId: 'asset-1',
      trackId,
      position: 0,
      duration: 10,
      inPoint: 0,
      outPoint: 10,
      speed: 1,
      transform: { ...IDENTITY_TRANSFORM },
    }
    useTimelineStore.getState().addClip(trackId, clip)
    return clip.id
  }

  it('a bank-bound transform CC records into the clip-transform lane', () => {
    const trackId = setupArmedTrack()
    const clipId = setupClipOnTrack(trackId)
    // Transform lane paramPath = clipTransform.<clipId>.rotation
    useAutomationStore.getState().addLane(trackId, formatTransformLaneEffectId(clipId), 'rotation', '#4ade80')
    const lanes = useAutomationStore.getState().lanes[trackId]
    const lane = lanes[lanes.length - 1]

    focusTrack(trackId)
    useMIDIStore.getState().setCCBankBinding(21, { row: 2, col: 5 })
    useMIDIStore
      .getState()
      .setBankAssignment(
        `track:${trackId}`,
        makeAssignment(`track:${trackId}`, 2, 5, { kind: 'transform', clipId, field: 'rotation' }),
      )

    recordCCMove(21, 0.75, true)

    const points = getLane(trackId, lane.id).points
    expect(points).toHaveLength(1)
    // 0-1 CC reading round-trips (denorm to display range → renormalize) back to 0.75.
    expect(points[0].value).toBeCloseTo(0.75, 5)
  })

  it('a bound macro CC with no lane warns once and writes nothing', () => {
    const trackId = setupArmedTrack()
    focusTrack(trackId)
    useMIDIStore.getState().setCCBankBinding(22, { row: 0, col: 0 })
    useMIDIStore
      .getState()
      .setBankAssignment(
        `track:${trackId}`,
        makeAssignment(`track:${trackId}`, 0, 0, { kind: 'macro', trackId, macroId: 'macro-x' }),
      )
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      recordCCMove(22, 0.5, true)
      recordCCMove(22, 0.6, true) // second move must NOT warn again (dedup)
      expect(useAutomationStore.getState().lanes[trackId] ?? []).toHaveLength(0)
      expect(warn).toHaveBeenCalledTimes(1)
    } finally {
      warn.mockRestore()
    }
  })

  it('a bound macro CC records when a macro value lane exists (paramPath === macroId)', () => {
    const trackId = setupArmedTrack()
    focusTrack(trackId)
    // Inject a macro value lane addressed by bare macroId (the chosen convention).
    const macroLane: AutomationLane = {
      id: 'lane-macro-1',
      paramPath: 'macro-x',
      color: '#4ade80',
      isVisible: true,
      points: [],
      mode: 'smooth',
    }
    useAutomationStore.setState((s) => ({ lanes: { ...s.lanes, [trackId]: [macroLane] } }))

    useMIDIStore.getState().setCCBankBinding(22, { row: 0, col: 0 })
    useMIDIStore
      .getState()
      .setBankAssignment(
        `track:${trackId}`,
        makeAssignment(`track:${trackId}`, 0, 0, { kind: 'macro', trackId, macroId: 'macro-x' }),
      )

    recordCCMove(22, 0.42, true)

    const lane = getLane(trackId, 'lane-macro-1')
    expect(lane.points).toHaveLength(1)
    expect(lane.points[0].value).toBeCloseTo(0.42, 5)
  })
})
