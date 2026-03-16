import { describe, it, expect, beforeEach } from 'vitest'
import { useAutomationStore } from '../../renderer/stores/automation'
import { useUndoStore } from '../../renderer/stores/undo'
import type { AutomationLane } from '../../shared/types'

function resetStores() {
  useAutomationStore.getState().resetAutomation()
  useUndoStore.getState().clear()
}

describe('Automation Persistence', () => {
  beforeEach(resetStores)

  it('round-trip: create lanes, get state, load — data preserved', () => {
    // Create lanes
    useAutomationStore.getState().addLane('track-1', 'fx-abc', 'amount', '#4ade80')
    const lane = useAutomationStore.getState().lanes['track-1'][0]
    useAutomationStore.getState().addPoint('track-1', lane.id, 1.0, 0.5)
    useAutomationStore.getState().addPoint('track-1', lane.id, 2.0, 0.8)

    // Snapshot lanes
    const snapshot = JSON.parse(JSON.stringify(useAutomationStore.getState().lanes))

    // Reset
    useAutomationStore.getState().resetAutomation()
    expect(useAutomationStore.getState().getAllLanes()).toHaveLength(0)

    // Load
    useAutomationStore.getState().loadAutomation(snapshot)
    const restored = useAutomationStore.getState().lanes['track-1']
    expect(restored).toHaveLength(1)
    expect(restored[0].paramPath).toBe('fx-abc.amount')
    expect(restored[0].points).toHaveLength(2)
    expect(restored[0].points[0].value).toBe(0.5)
  })

  it('missing automation data loads as empty (backward compat)', () => {
    useAutomationStore.getState().loadAutomation({})
    expect(useAutomationStore.getState().getAllLanes()).toHaveLength(0)
  })

  it('multiple tracks with lanes round-trip correctly', () => {
    useAutomationStore.getState().addLane('track-1', 'fx-1', 'hue', '#ff0000')
    useAutomationStore.getState().addLane('track-2', 'fx-2', 'blur', '#00ff00')

    const snapshot = JSON.parse(JSON.stringify(useAutomationStore.getState().lanes))
    useAutomationStore.getState().resetAutomation()
    useAutomationStore.getState().loadAutomation(snapshot)

    expect(useAutomationStore.getState().getLanesForTrack('track-1')).toHaveLength(1)
    expect(useAutomationStore.getState().getLanesForTrack('track-2')).toHaveLength(1)
  })

  // --- Deserialization hardening ---

  it('loadAutomation skips lanes with missing id', () => {
    useAutomationStore.getState().loadAutomation({
      'track-1': [
        { id: 'good', paramPath: 'fx.amt', color: '#fff', isVisible: true, points: [] },
        { paramPath: 'fx.bad', color: '#000', isVisible: true, points: [] } as unknown as AutomationLane,
      ],
    })
    expect(useAutomationStore.getState().getLanesForTrack('track-1')).toHaveLength(1)
  })

  it('loadAutomation sorts points by time', () => {
    useAutomationStore.getState().loadAutomation({
      'track-1': [{
        id: 'lane-1',
        paramPath: 'fx.amt',
        color: '#fff',
        isVisible: true,
        points: [
          { time: 3.0, value: 0.5, curve: 0 },
          { time: 1.0, value: 0.2, curve: 0 },
          { time: 2.0, value: 0.8, curve: 0 },
        ],
      }],
    })
    const pts = useAutomationStore.getState().getLanesForTrack('track-1')[0].points
    expect(pts[0].time).toBe(1.0)
    expect(pts[1].time).toBe(2.0)
    expect(pts[2].time).toBe(3.0)
  })

  it('loadAutomation filters out NaN point values', () => {
    useAutomationStore.getState().loadAutomation({
      'track-1': [{
        id: 'lane-1',
        paramPath: 'fx.amt',
        color: '#fff',
        isVisible: true,
        points: [
          { time: 1.0, value: 0.5, curve: 0 },
          { time: NaN, value: 0.5, curve: 0 },
          { time: 2.0, value: NaN, curve: 0 },
        ],
      }],
    })
    const pts = useAutomationStore.getState().getLanesForTrack('track-1')[0].points
    expect(pts).toHaveLength(1)
    expect(pts[0].time).toBe(1.0)
  })

  it('loadAutomation replaces existing state', () => {
    useAutomationStore.getState().addLane('track-1', 'fx-old', 'param', '#000')
    const newData: Record<string, AutomationLane[]> = {
      'track-99': [{
        id: 'new-lane',
        paramPath: 'fx-new.value',
        color: '#fff',
        isVisible: true,
        points: [],
      }],
    }
    useAutomationStore.getState().loadAutomation(newData)
    expect(useAutomationStore.getState().getLanesForTrack('track-1')).toHaveLength(0)
    expect(useAutomationStore.getState().getLanesForTrack('track-99')).toHaveLength(1)
  })
})
