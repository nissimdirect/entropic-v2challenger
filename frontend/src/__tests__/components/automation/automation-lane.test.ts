/**
 * Automation lane store-level integration tests.
 * These test the store behavior that drives the UI components.
 * Component rendering tests require jsdom + React testing library (deferred to E2E).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useAutomationStore } from '../../../renderer/stores/automation'
import { useUndoStore } from '../../../renderer/stores/undo'

function resetStores() {
  useAutomationStore.getState().resetAutomation()
  useUndoStore.getState().clear()
}

function setupLaneWithPoints() {
  useAutomationStore.getState().addLane('track-1', 'fx-1', 'amount', '#4ade80')
  const lane = useAutomationStore.getState().lanes['track-1'][0]
  useAutomationStore.getState().addPoint('track-1', lane.id, 0, 0.2)
  useAutomationStore.getState().addPoint('track-1', lane.id, 1, 0.5)
  useAutomationStore.getState().addPoint('track-1', lane.id, 2, 0.8)
  return lane.id
}

describe('Automation Lane', () => {
  beforeEach(resetStores)

  it('renders correct number of nodes (points in store)', () => {
    const laneId = setupLaneWithPoints()
    const lane = useAutomationStore.getState().lanes['track-1'].find((l) => l.id === laneId)!
    expect(lane.points).toHaveLength(3)
  })

  it('addPoint adds node at correct sorted position', () => {
    const laneId = setupLaneWithPoints()
    useAutomationStore.getState().addPoint('track-1', laneId, 0.5, 0.35)
    const lane = useAutomationStore.getState().lanes['track-1'].find((l) => l.id === laneId)!
    expect(lane.points).toHaveLength(4)
    expect(lane.points[1].time).toBe(0.5)
    expect(lane.points[1].value).toBe(0.35)
  })

  it('updatePoint moves node (changes time and value)', () => {
    const laneId = setupLaneWithPoints()
    useAutomationStore.getState().updatePoint('track-1', laneId, 1, { time: 1.5, value: 0.6 })
    const lane = useAutomationStore.getState().lanes['track-1'].find((l) => l.id === laneId)!
    const movedPoint = lane.points.find((p) => p.value === 0.6)
    expect(movedPoint).toBeDefined()
    expect(movedPoint!.time).toBe(1.5)
  })

  it('removePoint removes node by index', () => {
    const laneId = setupLaneWithPoints()
    useAutomationStore.getState().removePoint('track-1', laneId, 1) // Remove middle point
    const lane = useAutomationStore.getState().lanes['track-1'].find((l) => l.id === laneId)!
    expect(lane.points).toHaveLength(2)
    expect(lane.points[0].time).toBe(0)
    expect(lane.points[1].time).toBe(2)
  })

  it('invisible lane tracked in store', () => {
    const laneId = setupLaneWithPoints()
    useAutomationStore.getState().setLaneVisible('track-1', laneId, false)
    const lane = useAutomationStore.getState().lanes['track-1'].find((l) => l.id === laneId)!
    expect(lane.isVisible).toBe(false)
  })

  it('simplifyLane reduces point count', () => {
    useAutomationStore.getState().addLane('track-1', 'fx-1', 'amount', '#4ade80')
    const laneId = useAutomationStore.getState().lanes['track-1'][0].id
    // Add many collinear points (should simplify down)
    for (let i = 0; i <= 20; i++) {
      useAutomationStore.getState().addPoint('track-1', laneId, i * 0.1, i * 0.05)
    }
    const before = useAutomationStore.getState().lanes['track-1'].find((l) => l.id === laneId)!.points.length
    expect(before).toBe(21)
    useAutomationStore.getState().simplifyLane('track-1', laneId, 0.01)
    const after = useAutomationStore.getState().lanes['track-1'].find((l) => l.id === laneId)!.points.length
    expect(after).toBeLessThan(before)
  })

  it('clearLane removes all points but keeps lane', () => {
    const laneId = setupLaneWithPoints()
    useAutomationStore.getState().clearLane('track-1', laneId)
    const lane = useAutomationStore.getState().lanes['track-1'].find((l) => l.id === laneId)!
    expect(lane.points).toHaveLength(0)
    expect(useAutomationStore.getState().lanes['track-1']).toHaveLength(1) // Lane still exists
  })

  it('undo reverts point addition', () => {
    const laneId = setupLaneWithPoints()
    useAutomationStore.getState().addPoint('track-1', laneId, 3, 0.9)
    expect(useAutomationStore.getState().lanes['track-1'].find((l) => l.id === laneId)!.points).toHaveLength(4)
    useUndoStore.getState().undo()
    expect(useAutomationStore.getState().lanes['track-1'].find((l) => l.id === laneId)!.points).toHaveLength(3)
  })
})
