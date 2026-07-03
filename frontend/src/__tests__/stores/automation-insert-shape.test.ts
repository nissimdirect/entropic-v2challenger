/**
 * AA.3a — insertShapeIntoLane store action.
 *
 * Hard oracle:
 * - bakes the generated shape into the lane's points
 * - is exactly ONE undo step (undo restores byte-for-byte)
 * - honors an explicit startTime/endTime range
 * - falls back to the AA.4 point-selection's own [min,max] time range when
 *   no explicit range is given and a >= 2-point selection targets this lane
 * - falls back to the lane's own existing point span when there's no usable
 *   selection
 * - falls back to a default span when the lane has < 2 points and no selection
 * - grid-snaps generated point times when quantize is enabled (same toggle
 *   as clip editing / moveSelectedPoints); leaves them unsnapped when off
 * - points OUTSIDE the resolved range are left untouched
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useAutomationStore } from '../../renderer/stores/automation'
import { useUndoStore } from '../../renderer/stores/undo'

function resetStores() {
  useAutomationStore.getState().resetAutomation()
  useUndoStore.getState().clear()
}

function setupEmptyLane(trackId = 'track-1') {
  useAutomationStore.getState().addLane(trackId, 'fx-1', 'amount', '#4ade80')
  return useAutomationStore.getState().lanes[trackId][0].id
}

describe('insertShapeIntoLane (AA.3a)', () => {
  beforeEach(resetStores)

  it('no-op for a nonexistent track or lane', () => {
    useAutomationStore.getState().insertShapeIntoLane('nope', 'nope', 'sine', { cycles: 1, amplitude: 1 })
    expect(useUndoStore.getState().past.length).toBe(0)

    const trackId = 'track-1'
    setupEmptyLane(trackId) // addLane itself is undoable — capture the depth AFTER it
    const undoDepthAfterSetup = useUndoStore.getState().past.length
    useAutomationStore.getState().insertShapeIntoLane(trackId, 'nope', 'sine', { cycles: 1, amplitude: 1 })
    expect(useUndoStore.getState().past.length).toBe(undoDepthAfterSetup)
  })

  it('bakes the shape into the lane using an explicit startTime/endTime range', () => {
    const trackId = 'track-1'
    const laneId = setupEmptyLane(trackId)
    useAutomationStore.getState().insertShapeIntoLane(trackId, laneId, 'sine', {
      cycles: 1,
      amplitude: 1,
      startTime: 0,
      endTime: 4,
      count: 5,
    })
    const lane = useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!
    expect(lane.points).toHaveLength(5)
    expect(lane.points[0].time).toBe(0)
    expect(lane.points[4].time).toBe(4)
    // Sine peak at u=0.25 (t=1) should hit max (1.0) at amplitude 1.
    expect(lane.points.find((p) => p.time === 1)!.value).toBeCloseTo(1.0)
  })

  it('is undoable as ONE step — undo restores the original (empty) points exactly', () => {
    const trackId = 'track-1'
    const laneId = setupEmptyLane(trackId)
    const before = useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!.points
    const undoDepthBefore = useUndoStore.getState().past.length

    useAutomationStore.getState().insertShapeIntoLane(trackId, laneId, 'triangle', {
      cycles: 2, amplitude: 1, startTime: 0, endTime: 4, count: 9,
    })
    expect(useUndoStore.getState().past.length).toBe(undoDepthBefore + 1)

    useUndoStore.getState().undo()
    const after = useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!.points
    expect(after).toEqual(before)
  })

  it('falls back to the AA.4 point selection\'s [min,max] time range on THIS lane (>= 2 selected points)', () => {
    const trackId = 'track-1'
    const laneId = setupEmptyLane(trackId)
    // Seed some points, then select a subset spanning [1, 3].
    useAutomationStore.getState().addPoint(trackId, laneId, 0, 0.1)
    useAutomationStore.getState().addPoint(trackId, laneId, 1, 0.2)
    useAutomationStore.getState().addPoint(trackId, laneId, 3, 0.3)
    useAutomationStore.getState().addPoint(trackId, laneId, 5, 0.4)
    useAutomationStore.getState().selectPointsInRect(trackId, laneId, 1, 3, 0, 1) // selects time=1 and time=3

    useAutomationStore.getState().insertShapeIntoLane(trackId, laneId, 'ramp-up', {
      cycles: 1, amplitude: 1, count: 5,
    })

    const lane = useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!
    // Points outside [1,3] (time 0 and time 5) are untouched.
    expect(lane.points.find((p) => p.time === 0)?.value).toBeCloseTo(0.1)
    expect(lane.points.find((p) => p.time === 5)?.value).toBeCloseTo(0.4)
    // Generated points span exactly [1, 3].
    const generatedTimes = lane.points.map((p) => p.time).filter((t) => t >= 1 && t <= 3)
    expect(Math.min(...generatedTimes)).toBeCloseTo(1)
    expect(Math.max(...generatedTimes)).toBeCloseTo(3)
  })

  it('a 1-point (or no) selection is NOT a usable range — falls through to the lane\'s own span', () => {
    const trackId = 'track-1'
    const laneId = setupEmptyLane(trackId)
    useAutomationStore.getState().addPoint(trackId, laneId, 0, 0.1)
    useAutomationStore.getState().addPoint(trackId, laneId, 10, 0.9)
    useAutomationStore.getState().selectPoint(trackId, laneId, 0) // only 1 point selected

    useAutomationStore.getState().insertShapeIntoLane(trackId, laneId, 'ramp-up', {
      cycles: 1, amplitude: 1, count: 5,
    })

    const lane = useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!
    const times = lane.points.map((p) => p.time)
    expect(Math.min(...times)).toBeCloseTo(0)
    expect(Math.max(...times)).toBeCloseTo(10) // lane's own [first,last] span, not a default span
  })

  it('falls back to a default span anchored at t=0 for a lane with < 2 points and no selection', () => {
    const trackId = 'track-1'
    const laneId = setupEmptyLane(trackId)
    useAutomationStore.getState().insertShapeIntoLane(trackId, laneId, 'ramp-up', {
      cycles: 1, amplitude: 1, count: 5,
    })
    const lane = useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!
    expect(lane.points.length).toBeGreaterThan(0)
    expect(Math.min(...lane.points.map((p) => p.time))).toBeCloseTo(0)
    expect(Math.max(...lane.points.map((p) => p.time))).toBeGreaterThan(0)
  })

  it('grid-snaps generated point times when quantize is enabled', () => {
    const trackId = 'track-1'
    const laneId = setupEmptyLane(trackId)
    useAutomationStore.getState().insertShapeIntoLane(trackId, laneId, 'ramp-up', {
      cycles: 1,
      amplitude: 1,
      startTime: 0,
      endTime: 1.37,
      count: 2, // times: 0, 1.37
      quantize: { enabled: true, bpm: 120, division: 4 }, // grid = 0.5s
    })
    const lane = useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!
    const times = lane.points.map((p) => p.time).sort((a, b) => a - b)
    expect(times[0]).toBeCloseTo(0)
    expect(times[1]).toBeCloseTo(1.5) // 1.37 snapped to nearest 0.5s grid line
  })

  it('quantize OFF (or omitted) leaves exact unsnapped times', () => {
    const trackId = 'track-1'
    const laneId = setupEmptyLane(trackId)
    useAutomationStore.getState().insertShapeIntoLane(trackId, laneId, 'ramp-up', {
      cycles: 1, amplitude: 1, startTime: 0, endTime: 1.37, count: 2,
    })
    const lane = useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!
    const times = lane.points.map((p) => p.time).sort((a, b) => a - b)
    expect(times[1]).toBeCloseTo(1.37)
  })

  it('replaces existing points strictly inside the range but leaves points outside it untouched', () => {
    const trackId = 'track-1'
    const laneId = setupEmptyLane(trackId)
    useAutomationStore.getState().addPoint(trackId, laneId, 0, 0.5) // outside [1,3]
    useAutomationStore.getState().addPoint(trackId, laneId, 2, 0.99) // inside [1,3] -> replaced
    useAutomationStore.getState().addPoint(trackId, laneId, 6, 0.5) // outside [1,3]

    useAutomationStore.getState().insertShapeIntoLane(trackId, laneId, 'ramp-up', {
      cycles: 1, amplitude: 1, startTime: 1, endTime: 3, count: 3,
    })

    const lane = useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!
    expect(lane.points.find((p) => p.time === 0)?.value).toBeCloseTo(0.5)
    expect(lane.points.find((p) => p.time === 6)?.value).toBeCloseTo(0.5)
    // The old spike at time=2 is gone (replaced by the ramp's own point at t=2).
    expect(lane.points.find((p) => p.time === 2)?.value).not.toBeCloseTo(0.99)
  })

  it('resulting points are sorted by time', () => {
    const trackId = 'track-1'
    const laneId = setupEmptyLane(trackId)
    useAutomationStore.getState().addPoint(trackId, laneId, 10, 0.5)
    useAutomationStore.getState().insertShapeIntoLane(trackId, laneId, 'sine', {
      cycles: 2, amplitude: 1, startTime: 0, endTime: 4, count: 9,
    })
    const lane = useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!
    const times = lane.points.map((p) => p.time)
    expect(times).toEqual([...times].sort((a, b) => a - b))
  })
})
