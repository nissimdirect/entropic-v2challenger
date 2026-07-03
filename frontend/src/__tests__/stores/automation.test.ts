import { describe, it, expect, beforeEach } from 'vitest'
import { useAutomationStore } from '../../renderer/stores/automation'
import { useUndoStore } from '../../renderer/stores/undo'
import type { AutomationLane } from '../../shared/types'

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

  // A4 — continuous-lane overdub toggle.
  it('recordMode defaults to "replace" (D2 locked default)', () => {
    expect(useAutomationStore.getState().recordMode).toBe('replace')
  })

  it('setRecordMode switches between replace and overdub', () => {
    useAutomationStore.getState().setRecordMode('overdub')
    expect(useAutomationStore.getState().recordMode).toBe('overdub')
    useAutomationStore.getState().setRecordMode('replace')
    expect(useAutomationStore.getState().recordMode).toBe('replace')
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
    useAutomationStore.getState().setRecordMode('overdub')
    useAutomationStore.getState().resetAutomation()
    const s = useAutomationStore.getState()
    expect(s.getAllLanes()).toHaveLength(0)
    expect(s.mode).toBe('read')
    expect(s.armedTrackId).toBeNull()
    expect(s.recordMode).toBe('replace')
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

  // --- AA.2: modulation lanes ---

  it('addModulationLane creates a lane with kind: modulation, empty points, and the given blendOp', () => {
    const abs = addTestLane() // fx-abc.amount, absolute
    const modId = useAutomationStore.getState().addModulationLane('track-1', abs.paramPath, '#3b82f6', 'multiply')
    const lanes = useAutomationStore.getState().getLanesForTrack('track-1')
    expect(lanes).toHaveLength(2) // absolute lane untouched, mod lane added alongside
    const mod = lanes.find((l) => l.id === modId)!
    expect(mod.kind).toBe('modulation')
    expect(mod.blendOp).toBe('multiply')
    expect(mod.paramPath).toBe(abs.paramPath)
    expect(mod.points).toHaveLength(0)
    // The absolute lane itself is untouched (still there, still no kind field).
    const absAfter = lanes.find((l) => l.id === abs.id)!
    expect(absAfter.kind).toBeUndefined()
    expect(absAfter.points).toEqual(abs.points)
  })

  it('addModulationLane defaults blendOp to "add" when omitted', () => {
    const abs = addTestLane()
    const modId = useAutomationStore.getState().addModulationLane('track-1', abs.paramPath, '#3b82f6')
    const mod = useAutomationStore.getState().getLanesForTrack('track-1').find((l) => l.id === modId)!
    expect(mod.blendOp).toBe('add')
  })

  it('addModulationLane is undoable (removes the lane on undo)', () => {
    const abs = addTestLane()
    useAutomationStore.getState().addModulationLane('track-1', abs.paramPath, '#3b82f6')
    expect(useAutomationStore.getState().getLanesForTrack('track-1')).toHaveLength(2)
    useUndoStore.getState().undo()
    expect(useAutomationStore.getState().getLanesForTrack('track-1')).toHaveLength(1)
  })

  it("setLaneBlendOp changes an existing modulation lane's blendOp", () => {
    const abs = addTestLane()
    const modId = useAutomationStore.getState().addModulationLane('track-1', abs.paramPath, '#3b82f6', 'add')
    useAutomationStore.getState().setLaneBlendOp('track-1', modId, 'max')
    const mod = useAutomationStore.getState().getLanesForTrack('track-1').find((l) => l.id === modId)!
    expect(mod.blendOp).toBe('max')
  })

  it('setLaneBlendOp is a no-op on an absolute lane', () => {
    const abs = addTestLane()
    useAutomationStore.getState().setLaneBlendOp('track-1', abs.id, 'max')
    const absAfter = useAutomationStore.getState().getLanesForTrack('track-1').find((l) => l.id === abs.id)!
    expect(absAfter.blendOp).toBeUndefined()
  })

  it('loadAutomation round-trips kind and blendOp, defaults invalid/missing to absolute/undefined', () => {
    // Untyped/`unknown`-cast on purpose: loadAutomation's whole job is to
    // sanitize untrusted persisted JSON, so this test deliberately includes
    // an out-of-union kind/blendOp value (simulating a future-format file or
    // hand-edited project) rather than a well-typed AutomationLane.
    const data = {
      'track-1': [
        { id: 'mod-loaded', paramPath: 'fx-1.hue', color: '#3b82f6', isVisible: true, mode: 'smooth', kind: 'modulation', blendOp: 'multiply', points: [] },
        { id: 'abs-loaded', paramPath: 'fx-1.sat', color: '#4ade80', isVisible: true, mode: 'smooth', points: [] },
        // Forward-compat: unknown kind/blendOp values fall back to safe defaults instead of crashing.
        { id: 'weird-loaded', paramPath: 'fx-1.val', color: '#fff', isVisible: true, mode: 'smooth', kind: 'from-the-future', blendOp: 'xor', points: [] },
      ],
    }
    useAutomationStore.getState().loadAutomation(data as unknown as Record<string, AutomationLane[]>)
    const lanes = useAutomationStore.getState().getLanesForTrack('track-1')
    expect(lanes.find((l) => l.id === 'mod-loaded')!.kind).toBe('modulation')
    expect(lanes.find((l) => l.id === 'mod-loaded')!.blendOp).toBe('multiply')
    expect(lanes.find((l) => l.id === 'abs-loaded')!.kind).toBeUndefined()
    expect(lanes.find((l) => l.id === 'weird-loaded')!.kind).toBeUndefined()
    expect(lanes.find((l) => l.id === 'weird-loaded')!.blendOp).toBeUndefined()
  })
})
