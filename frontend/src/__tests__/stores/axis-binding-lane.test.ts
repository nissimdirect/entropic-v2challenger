/**
 * PR-B Commit-2 — AutomationLane.axisBinding: Tier-1 writer validation + persistence.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useAutomationStore } from '../../renderer/stores/automation'
import { useUndoStore } from '../../renderer/stores/undo'
import type { LaneAxisBinding } from '../../shared/axis-binding'

const TRACK = 'track-1'
function bind(domain: LaneAxisBinding['domain'], bindingRule: LaneAxisBinding['bindingRule'] = 'broadcast'): LaneAxisBinding {
  return { domain, bindingRule, interpolationMode: 'linear' }
}
function laneId(): string {
  return useAutomationStore.getState().getLanesForTrack(TRACK)[0].id
}

beforeEach(() => {
  useAutomationStore.getState().resetAutomation()
  useUndoStore.getState().clear()
  useAutomationStore.getState().addLane(TRACK, 'fx-1', 'amount', '#4ade80')
})

describe('setLaneAxisBinding (Tier-1 writer validator)', () => {
  it('accepts broadcast on t/y/x', () => {
    for (const d of ['t', 'y', 'x'] as const) {
      useAutomationStore.getState().setLaneAxisBinding(TRACK, laneId(), bind(d))
      expect(useAutomationStore.getState().getLanesForTrack(TRACK)[0].axisBinding?.domain).toBe(d)
    }
  })

  it('rejects non-broadcast binding rules (Tier 3+)', () => {
    useAutomationStore.getState().setLaneAxisBinding(TRACK, laneId(), bind('y', 'sampleAt'))
    expect(useAutomationStore.getState().getLanesForTrack(TRACK)[0].axisBinding).toBeUndefined()
  })

  it('rejects c/f/l domains (Tier 4+)', () => {
    for (const d of ['c', 'f', 'l'] as const) {
      useAutomationStore.getState().setLaneAxisBinding(TRACK, laneId(), bind(d))
      expect(useAutomationStore.getState().getLanesForTrack(TRACK)[0].axisBinding).toBeUndefined()
    }
  })

  it('clears the binding when passed undefined', () => {
    useAutomationStore.getState().setLaneAxisBinding(TRACK, laneId(), bind('y'))
    useAutomationStore.getState().setLaneAxisBinding(TRACK, laneId(), undefined)
    expect(useAutomationStore.getState().getLanesForTrack(TRACK)[0].axisBinding).toBeUndefined()
  })

  it('is undoable', () => {
    useAutomationStore.getState().setLaneAxisBinding(TRACK, laneId(), bind('y'))
    useUndoStore.getState().undo()
    expect(useAutomationStore.getState().getLanesForTrack(TRACK)[0].axisBinding).toBeUndefined()
    useUndoStore.getState().redo()
    expect(useAutomationStore.getState().getLanesForTrack(TRACK)[0].axisBinding?.domain).toBe('y')
  })
})

describe('loadAutomation axisBinding round-trip', () => {
  it('preserves a valid binding and drops an invalid one', () => {
    useAutomationStore.getState().loadAutomation({
      [TRACK]: [
        { id: 'a', paramPath: 'fx.amt', color: '#fff', isVisible: true, mode: 'smooth', points: [], axisBinding: bind('y') },
        { id: 'b', paramPath: 'fx.mix', color: '#fff', isVisible: true, mode: 'smooth', points: [], axisBinding: bind('y', 'painted') },
        { id: 'c', paramPath: 'fx.gain', color: '#fff', isVisible: true, mode: 'smooth', points: [], axisBinding: bind('l') },
      ],
    })
    const lanes = useAutomationStore.getState().getLanesForTrack(TRACK)
    expect(lanes.find((l) => l.id === 'a')?.axisBinding?.domain).toBe('y') // valid kept
    expect(lanes.find((l) => l.id === 'b')?.axisBinding).toBeUndefined()    // painted dropped
    expect(lanes.find((l) => l.id === 'c')?.axisBinding).toBeUndefined()    // l-domain dropped
  })
})
