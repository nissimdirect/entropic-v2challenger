/**
 * AA.3-A — automation store: setLaneSource / updateLaneOperator + loadAutomation
 * validation for operator-sourced lanes.
 *
 * Test plan (docs/plans/2026-07-03-aa3-live-generators-spec.md §6):
 *   - setLaneSource/updateLaneOperator undo/redo symmetric.
 *   - non-finite depth rejected at save + dropped at load (mirror operators.ts).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useAutomationStore } from '../../renderer/stores/automation'
import { useUndoStore } from '../../renderer/stores/undo'
import { useToastStore } from '../../renderer/stores/toast'

function resetStores() {
  useAutomationStore.getState().resetAutomation()
  useUndoStore.getState().clear()
  useToastStore.getState().clearAll?.()
}

function addTestLane() {
  useAutomationStore.getState().addLane('track-1', 'fx-abc', 'amount', '#4ade80')
  const lanes = useAutomationStore.getState().lanes['track-1']
  return lanes[lanes.length - 1]
}

function addModLane(paramPath: string) {
  const modId = useAutomationStore.getState().addModulationLane('track-1', paramPath, '#3b82f6', 'add')
  return useAutomationStore.getState().getLanesForTrack('track-1').find((l) => l.id === modId)!
}

describe('Automation Store — AA.3-A setLaneSource', () => {
  beforeEach(resetStores)

  it('switching to "operator" seeds a default LFO config', () => {
    const abs = addTestLane()
    const mod = addModLane(abs.paramPath)
    useAutomationStore.getState().setLaneSource('track-1', mod.id, 'operator')
    const updated = useAutomationStore.getState().getLanesForTrack('track-1').find((l) => l.id === mod.id)!
    expect(updated.source).toBe('operator')
    expect(updated.operator).toEqual({
      type: 'lfo',
      params: { waveform: 'sine', rate_hz: 1.0, phase_offset: 0.0 },
      depth: 1,
      min: 0,
      max: 1,
    })
  })

  it('is a no-op on an absolute (non-modulation) lane', () => {
    const abs = addTestLane()
    useAutomationStore.getState().setLaneSource('track-1', abs.id, 'operator')
    const after = useAutomationStore.getState().getLanesForTrack('track-1').find((l) => l.id === abs.id)!
    expect(after.source).toBeUndefined()
  })

  it('switching back to "drawn" preserves the operator config (harmless, ignored while source !== operator)', () => {
    const abs = addTestLane()
    const mod = addModLane(abs.paramPath)
    useAutomationStore.getState().setLaneSource('track-1', mod.id, 'operator')
    useAutomationStore.getState().setLaneSource('track-1', mod.id, 'drawn')
    const updated = useAutomationStore.getState().getLanesForTrack('track-1').find((l) => l.id === mod.id)!
    expect(updated.source).toBe('drawn')
    expect(updated.operator).toBeDefined() // survives the switch, just inert
  })

  it('is undo/redo symmetric', () => {
    const abs = addTestLane()
    const mod = addModLane(abs.paramPath)
    useAutomationStore.getState().setLaneSource('track-1', mod.id, 'operator')
    expect(useAutomationStore.getState().getLanesForTrack('track-1').find((l) => l.id === mod.id)!.source).toBe('operator')

    useUndoStore.getState().undo()
    // Inverse restores the OLD source value ('drawn' — the resolved fallback
    // for the pre-switch absent field, not the literal `undefined`; both are
    // semantically equivalent everywhere `source` is read).
    expect(useAutomationStore.getState().getLanesForTrack('track-1').find((l) => l.id === mod.id)!.source).toBe('drawn')

    useUndoStore.getState().redo()
    expect(useAutomationStore.getState().getLanesForTrack('track-1').find((l) => l.id === mod.id)!.source).toBe('operator')
  })

  it('re-switching to "operator" a second time does NOT reseed (keeps the user-edited config)', () => {
    const abs = addTestLane()
    const mod = addModLane(abs.paramPath)
    useAutomationStore.getState().setLaneSource('track-1', mod.id, 'operator')
    useAutomationStore.getState().updateLaneOperator('track-1', mod.id, { params: { rate_hz: 5 } })
    useAutomationStore.getState().setLaneSource('track-1', mod.id, 'drawn')
    useAutomationStore.getState().setLaneSource('track-1', mod.id, 'operator')
    const updated = useAutomationStore.getState().getLanesForTrack('track-1').find((l) => l.id === mod.id)!
    expect(updated.operator?.params.rate_hz).toBe(5) // not reset back to the 1.0 default
  })
})

describe('Automation Store — AA.3-A updateLaneOperator', () => {
  beforeEach(resetStores)

  it('merges params without clobbering unrelated param fields', () => {
    const abs = addTestLane()
    const mod = addModLane(abs.paramPath)
    useAutomationStore.getState().setLaneSource('track-1', mod.id, 'operator')
    useAutomationStore.getState().updateLaneOperator('track-1', mod.id, { params: { rate_hz: 3 } })
    const updated = useAutomationStore.getState().getLanesForTrack('track-1').find((l) => l.id === mod.id)!
    expect(updated.operator?.params).toEqual({ waveform: 'sine', rate_hz: 3, phase_offset: 0.0 })
  })

  it('updates depth/min/max', () => {
    const abs = addTestLane()
    const mod = addModLane(abs.paramPath)
    useAutomationStore.getState().setLaneSource('track-1', mod.id, 'operator')
    useAutomationStore.getState().updateLaneOperator('track-1', mod.id, { depth: 0.5, min: 0.1, max: 0.9 })
    const updated = useAutomationStore.getState().getLanesForTrack('track-1').find((l) => l.id === mod.id)!
    expect(updated.operator).toMatchObject({ depth: 0.5, min: 0.1, max: 0.9 })
  })

  it('is undo/redo symmetric', () => {
    const abs = addTestLane()
    const mod = addModLane(abs.paramPath)
    useAutomationStore.getState().setLaneSource('track-1', mod.id, 'operator')
    useAutomationStore.getState().updateLaneOperator('track-1', mod.id, { depth: 0.3 })
    expect(useAutomationStore.getState().getLanesForTrack('track-1').find((l) => l.id === mod.id)!.operator?.depth).toBe(0.3)

    useUndoStore.getState().undo()
    expect(useAutomationStore.getState().getLanesForTrack('track-1').find((l) => l.id === mod.id)!.operator?.depth).toBe(1)

    useUndoStore.getState().redo()
    expect(useAutomationStore.getState().getLanesForTrack('track-1').find((l) => l.id === mod.id)!.operator?.depth).toBe(0.3)
  })

  // --- numeric trust boundary: non-finite depth/min/max rejected at save ---

  it.each([
    ['depth', NaN],
    ['depth', Infinity],
    ['min', -Infinity],
    ['max', NaN],
  ])('rejects a non-finite %s (%s) — store unchanged, no crash', (key, badValue) => {
    const abs = addTestLane()
    const mod = addModLane(abs.paramPath)
    useAutomationStore.getState().setLaneSource('track-1', mod.id, 'operator')
    const before = useAutomationStore.getState().getLanesForTrack('track-1').find((l) => l.id === mod.id)!.operator

    useAutomationStore.getState().updateLaneOperator('track-1', mod.id, { [key]: badValue })

    const after = useAutomationStore.getState().getLanesForTrack('track-1').find((l) => l.id === mod.id)!.operator
    expect(after).toEqual(before) // rejected — no partial apply
  })

  it('is a no-op on an absolute (non-modulation) lane', () => {
    const abs = addTestLane()
    useAutomationStore.getState().updateLaneOperator('track-1', abs.id, { depth: 0.5 })
    const after = useAutomationStore.getState().getLanesForTrack('track-1').find((l) => l.id === abs.id)!
    expect(after.operator).toBeUndefined()
  })
})

describe('Automation Store — AA.3-A loadAutomation validation', () => {
  beforeEach(resetStores)

  it('round-trips a valid operator-sourced lane', () => {
    const data = {
      'track-1': [
        {
          id: 'mod-1',
          paramPath: 'fx-abc.amount',
          color: '#3b82f6',
          isVisible: true,
          mode: 'smooth',
          kind: 'modulation',
          blendOp: 'add',
          source: 'operator',
          operator: { type: 'lfo', params: { waveform: 'sine', rate_hz: 1 }, depth: 1, min: 0, max: 1 },
          points: [],
        },
      ],
    }
    useAutomationStore.getState().loadAutomation(data as never)
    const lane = useAutomationStore.getState().getLanesForTrack('track-1')[0]
    expect(lane.source).toBe('operator')
    expect(lane.operator?.type).toBe('lfo')
  })

  it('a pre-AA.3 lane (no source field) loads as source: undefined (drawn), never crashes', () => {
    const data = {
      'track-1': [
        {
          id: 'abs-1',
          paramPath: 'fx-abc.amount',
          color: '#4ade80',
          isVisible: true,
          mode: 'smooth',
          points: [{ time: 0, value: 0.5, curve: 0 }],
        },
      ],
    }
    useAutomationStore.getState().loadAutomation(data as never)
    const lane = useAutomationStore.getState().getLanesForTrack('track-1')[0]
    expect(lane.source).toBeUndefined()
    expect(lane.operator).toBeUndefined()
  })

  it('an unknown operator.type degrades the lane to drawn (source dropped), never crashes', () => {
    const data = {
      'track-1': [
        {
          id: 'mod-1',
          paramPath: 'fx-abc.amount',
          color: '#3b82f6',
          isVisible: true,
          mode: 'smooth',
          kind: 'modulation',
          source: 'operator',
          operator: { type: 'wormhole', params: {} },
          points: [],
        },
      ],
    }
    expect(() => useAutomationStore.getState().loadAutomation(data as never)).not.toThrow()
    const lane = useAutomationStore.getState().getLanesForTrack('track-1')[0]
    expect(lane.source).toBeUndefined()
    expect(lane.operator).toBeUndefined()
  })

  it('non-finite depth/min/max at load time drops the operator config (source dropped), never crashes', () => {
    const data = {
      'track-1': [
        {
          id: 'mod-1',
          paramPath: 'fx-abc.amount',
          color: '#3b82f6',
          isVisible: true,
          mode: 'smooth',
          kind: 'modulation',
          source: 'operator',
          operator: { type: 'lfo', params: { rate_hz: 1 }, depth: Number.NaN },
          points: [],
        },
      ],
    }
    expect(() => useAutomationStore.getState().loadAutomation(data as never)).not.toThrow()
    const lane = useAutomationStore.getState().getLanesForTrack('track-1')[0]
    expect(lane.source).toBeUndefined()
  })

  it('a source:"operator" lane with a missing/malformed params object degrades to drawn, never crashes', () => {
    const data = {
      'track-1': [
        {
          id: 'mod-1',
          paramPath: 'fx-abc.amount',
          color: '#3b82f6',
          isVisible: true,
          mode: 'smooth',
          kind: 'modulation',
          source: 'operator',
          operator: { type: 'lfo' }, // no params
          points: [],
        },
      ],
    }
    expect(() => useAutomationStore.getState().loadAutomation(data as never)).not.toThrow()
    const lane = useAutomationStore.getState().getLanesForTrack('track-1')[0]
    expect(lane.source).toBeUndefined()
  })
})
