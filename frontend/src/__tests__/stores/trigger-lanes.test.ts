import { describe, it, expect, beforeEach } from 'vitest'
import { useAutomationStore } from '../../renderer/stores/automation'
import { useUndoStore } from '../../renderer/stores/undo'

function resetStores() {
  useAutomationStore.getState().resetAutomation()
  useUndoStore.getState().clear()
}

describe('Trigger Lanes', () => {
  beforeEach(resetStores)

  // --- 15A: Trigger Lane Type ---

  it('addTriggerLane creates a trigger lane with correct properties', () => {
    const laneId = useAutomationStore.getState().addTriggerLane(
      'track-1', 'fx-1', 'intensity', '#ef4444', 'gate',
    )
    expect(laneId).toBeTruthy()
    const lanes = useAutomationStore.getState().getLanesForTrack('track-1')
    expect(lanes).toHaveLength(1)
    expect(lanes[0].isTrigger).toBe(true)
    expect(lanes[0].triggerMode).toBe('gate')
    expect(lanes[0].triggerADSR).toEqual({ attack: 0, decay: 0, sustain: 1, release: 0 })
    expect(lanes[0].paramPath).toBe('fx-1.intensity')
  })

  it('addTriggerLane with custom ADSR', () => {
    const adsr = { attack: 5, decay: 3, sustain: 0.8, release: 10 }
    useAutomationStore.getState().addTriggerLane(
      'track-1', 'fx-1', 'amount', '#ef4444', 'toggle', adsr,
    )
    const lane = useAutomationStore.getState().getLanesForTrack('track-1')[0]
    expect(lane.triggerADSR).toEqual(adsr)
    expect(lane.triggerMode).toBe('toggle')
  })

  it('addTriggerLane blocks duplicate param mapping (exclusive ownership)', () => {
    useAutomationStore.getState().addTriggerLane(
      'track-1', 'fx-1', 'intensity', '#ef4444', 'gate',
    )
    const second = useAutomationStore.getState().addTriggerLane(
      'track-2', 'fx-1', 'intensity', '#ff0000', 'toggle',
    )
    expect(second).toBeNull()
    // Only the first lane exists
    expect(useAutomationStore.getState().getAllLanes()).toHaveLength(1)
  })

  it('regular addLane creates non-trigger lane', () => {
    useAutomationStore.getState().addLane('track-1', 'fx-1', 'amount', '#4ade80')
    const lane = useAutomationStore.getState().getLanesForTrack('track-1')[0]
    expect(lane.isTrigger).toBe(false)
    expect(lane.triggerMode).toBeUndefined()
  })

  it('addTriggerLane is undoable', () => {
    useAutomationStore.getState().addTriggerLane(
      'track-1', 'fx-1', 'amount', '#ef4444', 'gate',
    )
    expect(useAutomationStore.getState().getAllLanes()).toHaveLength(1)
    useUndoStore.getState().undo()
    expect(useAutomationStore.getState().getAllLanes()).toHaveLength(0)
    useUndoStore.getState().redo()
    expect(useAutomationStore.getState().getAllLanes()).toHaveLength(1)
  })

  it('loadAutomation defaults isTrigger to false for old data', () => {
    // Simulate loading old project data without isTrigger field
    useAutomationStore.getState().loadAutomation({
      'track-1': [
        {
          id: 'old-lane',
          paramPath: 'fx-1.amount',
          color: '#4ade80',
          isVisible: true,
          points: [{ time: 0, value: 0.5, curve: 0 }],
        } as any, // missing isTrigger
      ],
    })
    const lane = useAutomationStore.getState().getLanesForTrack('track-1')[0]
    expect(lane.isTrigger).toBe(false)
  })

  // --- 15B: Trigger Recording ---

  it('recordTriggerEvent writes 1.0 on trigger and 0.0 on release', () => {
    const laneId = useAutomationStore.getState().addTriggerLane(
      'track-1', 'fx-1', 'intensity', '#ef4444', 'gate',
    )!
    useAutomationStore.getState().recordTriggerEvent('track-1', laneId, 1.0, 'trigger')
    useAutomationStore.getState().recordTriggerEvent('track-1', laneId, 2.0, 'release')

    const lane = useAutomationStore.getState().getLanesForTrack('track-1')[0]
    expect(lane.points).toHaveLength(2)
    expect(lane.points[0]).toEqual({ time: 1.0, value: 1.0, curve: 0 })
    expect(lane.points[1]).toEqual({ time: 2.0, value: 0.0, curve: 0 })
  })

  it('recordTriggerEvent ignores non-trigger lanes', () => {
    useAutomationStore.getState().addLane('track-1', 'fx-1', 'amount', '#4ade80')
    const lane = useAutomationStore.getState().getLanesForTrack('track-1')[0]
    useAutomationStore.getState().recordTriggerEvent('track-1', lane.id, 1.0, 'trigger')
    // Should have no points — recordTriggerEvent only works on trigger lanes
    expect(useAutomationStore.getState().getLanesForTrack('track-1')[0].points).toHaveLength(0)
  })

  it('mergeCapturedTriggers merges overdub points without replacing', () => {
    const laneId = useAutomationStore.getState().addTriggerLane(
      'track-1', 'fx-1', 'amount', '#ef4444', 'gate',
    )!
    // First pass
    useAutomationStore.getState().recordTriggerEvent('track-1', laneId, 1.0, 'trigger')
    useAutomationStore.getState().recordTriggerEvent('track-1', laneId, 2.0, 'release')

    // Second pass via capture merge
    useAutomationStore.getState().mergeCapturedTriggers('track-1', laneId, [
      { time: 3.0, value: 1.0, curve: 0 },
      { time: 4.0, value: 0.0, curve: 0 },
    ])

    const lane = useAutomationStore.getState().getLanesForTrack('track-1')[0]
    expect(lane.points).toHaveLength(4)
    expect(lane.points.map((p) => p.time)).toEqual([1.0, 2.0, 3.0, 4.0])
  })

  // --- Undo Transaction ---

  it('undo transaction coalesces multiple operations into one undo entry', () => {
    const laneId = useAutomationStore.getState().addTriggerLane(
      'track-1', 'fx-1', 'amount', '#ef4444', 'gate',
    )!
    const undoBefore = useUndoStore.getState().past.length

    // Begin transaction (overdub recording pass)
    useUndoStore.getState().beginTransaction('Overdub recording')
    useAutomationStore.getState().recordTriggerEvent('track-1', laneId, 1.0, 'trigger')
    useAutomationStore.getState().recordTriggerEvent('track-1', laneId, 2.0, 'release')
    useAutomationStore.getState().recordTriggerEvent('track-1', laneId, 3.0, 'trigger')
    useAutomationStore.getState().recordTriggerEvent('track-1', laneId, 4.0, 'release')
    useUndoStore.getState().commitTransaction()

    // Should have added exactly 1 undo entry (the transaction)
    expect(useUndoStore.getState().past.length).toBe(undoBefore + 1)

    // 4 points recorded
    expect(useAutomationStore.getState().getLanesForTrack('track-1')[0].points).toHaveLength(4)

    // Undo reverts entire pass
    useUndoStore.getState().undo()
    expect(useAutomationStore.getState().getLanesForTrack('track-1')[0].points).toHaveLength(0)
  })

  it('abortTransaction undoes all buffered mutations', () => {
    const laneId = useAutomationStore.getState().addTriggerLane(
      'track-1', 'fx-1', 'amount', '#ef4444', 'gate',
    )!

    useUndoStore.getState().beginTransaction('Aborted recording')
    useAutomationStore.getState().recordTriggerEvent('track-1', laneId, 1.0, 'trigger')
    useAutomationStore.getState().recordTriggerEvent('track-1', laneId, 2.0, 'release')
    useUndoStore.getState().abortTransaction()

    // Points should be rolled back
    expect(useAutomationStore.getState().getLanesForTrack('track-1')[0].points).toHaveLength(0)
  })

  it('commitTransaction with 0 entries is a no-op', () => {
    const undoBefore = useUndoStore.getState().past.length
    useUndoStore.getState().beginTransaction('Empty pass')
    useUndoStore.getState().commitTransaction()
    expect(useUndoStore.getState().past.length).toBe(undoBefore)
    expect(useUndoStore.getState()._transaction).toBeNull()
  })

  it('abortTransaction with 0 entries is a no-op', () => {
    useUndoStore.getState().beginTransaction('Nothing')
    useUndoStore.getState().abortTransaction()
    expect(useUndoStore.getState()._transaction).toBeNull()
  })

  it('abortTransaction when no transaction is active is a no-op', () => {
    useUndoStore.getState().abortTransaction()
    // Should not throw
    expect(useUndoStore.getState()._transaction).toBeNull()
  })
})
