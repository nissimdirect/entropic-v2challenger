import { describe, it, expect, beforeEach } from 'vitest'
import { useAutomationStore } from '../../renderer/stores/automation'
import { useUndoStore } from '../../renderer/stores/undo'

function resetStores() {
  useAutomationStore.getState().resetAutomation()
  useUndoStore.getState().clear()
}

function addTestLane() {
  useAutomationStore.getState().addLane('track-1', 'fx-abc', 'amount', '#4ade80')
  const lanes = useAutomationStore.getState().lanes['track-1']
  return lanes[lanes.length - 1]
}

describe('Automation Store', () => {
  beforeEach(resetStores)

  // --- Lane CRUD ---

  it('starts with empty lanes', () => {
    expect(useAutomationStore.getState().getAllLanes()).toHaveLength(0)
  })

  it('addLane creates a lane for a track', () => {
    const lane = addTestLane()
    expect(lane.paramPath).toBe('fx-abc.amount')
    expect(lane.color).toBe('#4ade80')
    expect(lane.isVisible).toBe(true)
    expect(lane.points).toHaveLength(0)
  })

  it('removeLane removes by id', () => {
    const lane = addTestLane()
    useAutomationStore.getState().removeLane('track-1', lane.id)
    expect(useAutomationStore.getState().getLanesForTrack('track-1')).toHaveLength(0)
  })

  it('removeLane with invalid id does nothing', () => {
    addTestLane()
    useAutomationStore.getState().removeLane('track-1', 'nonexistent')
    expect(useAutomationStore.getState().getLanesForTrack('track-1')).toHaveLength(1)
  })

  it('clearLane removes all points', () => {
    const lane = addTestLane()
    useAutomationStore.getState().addPoint('track-1', lane.id, 1.0, 0.5)
    useAutomationStore.getState().addPoint('track-1', lane.id, 2.0, 0.8)
    useAutomationStore.getState().clearLane('track-1', lane.id)
    const updated = useAutomationStore.getState().lanes['track-1'].find((l) => l.id === lane.id)!
    expect(updated.points).toHaveLength(0)
  })

  it('setLaneVisible toggles visibility', () => {
    const lane = addTestLane()
    useAutomationStore.getState().setLaneVisible('track-1', lane.id, false)
    const updated = useAutomationStore.getState().lanes['track-1'].find((l) => l.id === lane.id)!
    expect(updated.isVisible).toBe(false)
  })

  // --- Point CRUD ---

  it('addPoint inserts sorted by time', () => {
    const lane = addTestLane()
    useAutomationStore.getState().addPoint('track-1', lane.id, 2.0, 0.8)
    useAutomationStore.getState().addPoint('track-1', lane.id, 1.0, 0.5)
    useAutomationStore.getState().addPoint('track-1', lane.id, 1.5, 0.6)
    const points = useAutomationStore.getState().lanes['track-1'].find((l) => l.id === lane.id)!.points
    expect(points).toHaveLength(3)
    expect(points[0].time).toBe(1.0)
    expect(points[1].time).toBe(1.5)
    expect(points[2].time).toBe(2.0)
  })

  it('removePoint removes by index', () => {
    const lane = addTestLane()
    useAutomationStore.getState().addPoint('track-1', lane.id, 1.0, 0.5)
    useAutomationStore.getState().addPoint('track-1', lane.id, 2.0, 0.8)
    useAutomationStore.getState().removePoint('track-1', lane.id, 0)
    const points = useAutomationStore.getState().lanes['track-1'].find((l) => l.id === lane.id)!.points
    expect(points).toHaveLength(1)
    expect(points[0].time).toBe(2.0)
  })

  it('updatePoint changes value and re-sorts if time changed', () => {
    const lane = addTestLane()
    useAutomationStore.getState().addPoint('track-1', lane.id, 1.0, 0.5)
    useAutomationStore.getState().addPoint('track-1', lane.id, 2.0, 0.8)
    // Move point 0 (time 1.0) to time 3.0
    useAutomationStore.getState().updatePoint('track-1', lane.id, 0, { time: 3.0 })
    const points = useAutomationStore.getState().lanes['track-1'].find((l) => l.id === lane.id)!.points
    expect(points[0].time).toBe(2.0)
    expect(points[1].time).toBe(3.0)
  })

  it('setPoints replaces all points', () => {
    const lane = addTestLane()
    useAutomationStore.getState().addPoint('track-1', lane.id, 1.0, 0.5)
    useAutomationStore.getState().setPoints('track-1', lane.id, [
      { time: 0, value: 0, curve: 0 },
      { time: 5, value: 1, curve: 0 },
    ])
    const points = useAutomationStore.getState().lanes['track-1'].find((l) => l.id === lane.id)!.points
    expect(points).toHaveLength(2)
    expect(points[1].time).toBe(5)
  })

  // --- Mode / Arm ---

  it('setMode switches mode', () => {
    useAutomationStore.getState().setMode('latch')
    expect(useAutomationStore.getState().mode).toBe('latch')
    useAutomationStore.getState().setMode('read')
    expect(useAutomationStore.getState().mode).toBe('read')
  })

  it('armTrack sets and clears armed track', () => {
    useAutomationStore.getState().armTrack('track-1')
    expect(useAutomationStore.getState().armedTrackId).toBe('track-1')
    useAutomationStore.getState().armTrack(null)
    expect(useAutomationStore.getState().armedTrackId).toBeNull()
  })

  // --- Undo/Redo ---

  it('undo reverts addLane', () => {
    addTestLane()
    expect(useAutomationStore.getState().getAllLanes()).toHaveLength(1)
    useUndoStore.getState().undo()
    expect(useAutomationStore.getState().getAllLanes()).toHaveLength(0)
  })

  it('redo restores addLane', () => {
    addTestLane()
    useUndoStore.getState().undo()
    useUndoStore.getState().redo()
    expect(useAutomationStore.getState().getAllLanes()).toHaveLength(1)
  })

  it('undo reverts addPoint', () => {
    const lane = addTestLane()
    useAutomationStore.getState().addPoint('track-1', lane.id, 1.0, 0.5)
    const points = useAutomationStore.getState().lanes['track-1'].find((l) => l.id === lane.id)!.points
    expect(points).toHaveLength(1)
    useUndoStore.getState().undo()
    const after = useAutomationStore.getState().lanes['track-1'].find((l) => l.id === lane.id)!.points
    expect(after).toHaveLength(0)
  })

  // --- Selectors ---

  it('getLanesForEffect filters by effectId prefix', () => {
    useAutomationStore.getState().addLane('track-1', 'fx-abc', 'amount', '#4ade80')
    useAutomationStore.getState().addLane('track-1', 'fx-def', 'threshold', '#ef4444')
    expect(useAutomationStore.getState().getLanesForEffect('fx-abc')).toHaveLength(1)
    expect(useAutomationStore.getState().getLanesForEffect('fx-def')).toHaveLength(1)
    expect(useAutomationStore.getState().getLanesForEffect('fx-ghi')).toHaveLength(0)
  })

  // --- Reset / Load ---

  it('resetAutomation clears everything', () => {
    addTestLane()
    useAutomationStore.getState().setMode('latch')
    useAutomationStore.getState().armTrack('track-1')
    useAutomationStore.getState().resetAutomation()
    const s = useAutomationStore.getState()
    expect(s.getAllLanes()).toHaveLength(0)
    expect(s.mode).toBe('read')
    expect(s.armedTrackId).toBeNull()
  })

  it('loadAutomation hydrates lanes', () => {
    const data = {
      'track-1': [{
        id: 'loaded-lane',
        paramPath: 'fx-1.hue',
        color: '#ff0000',
        isVisible: true,
        points: [{ time: 0, value: 0.5, curve: 0 }],
      }],
    }
    useAutomationStore.getState().loadAutomation(data)
    const lanes = useAutomationStore.getState().getLanesForTrack('track-1')
    expect(lanes).toHaveLength(1)
    expect(lanes[0].id).toBe('loaded-lane')
    expect(lanes[0].points).toHaveLength(1)
  })

  // --- Copy/Paste ---

  it('copyRegion and pasteAtPlayhead duplicates points', () => {
    const lane = addTestLane()
    useAutomationStore.getState().addPoint('track-1', lane.id, 1.0, 0.3)
    useAutomationStore.getState().addPoint('track-1', lane.id, 2.0, 0.7)
    useAutomationStore.getState().addPoint('track-1', lane.id, 3.0, 0.5)

    // Copy region 1.0 - 2.0
    useAutomationStore.getState().copyRegion('track-1', lane.id, 1.0, 2.0)
    expect(useAutomationStore.getState().clipboard).not.toBeNull()
    expect(useAutomationStore.getState().clipboard!.points).toHaveLength(2)

    // Paste at time 5.0
    useAutomationStore.getState().pasteAtPlayhead('track-1', lane.id, 5.0)
    const points = useAutomationStore.getState().lanes['track-1'].find((l) => l.id === lane.id)!.points
    expect(points).toHaveLength(5) // 3 original + 2 pasted
    expect(points[3].time).toBe(5.0)
    expect(points[4].time).toBe(6.0)
  })
})
