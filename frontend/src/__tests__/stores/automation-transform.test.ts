/**
 * AA.4b — Automation transform box: scale / skew / flatten / ramp.
 *
 * Hard oracle (docs/plans/2026-07-03-automation-editing-gestures.md):
 * - select 4 points, drag-right-edge-down -> expected skewed coords
 * - drag-top-edge-down -> values scale toward flat
 * - flatten -> all selected share one value
 * - ramp -> interior points land on the first->last straight line
 * - each gesture is ONE undo step (undo restores byte-for-byte)
 * - grid-snap when quantize is on
 *
 * All four gestures are parameterizations of the SAME pure affine mapping
 * (`applyBoxTransform`) — see its doc comment in stores/automation.ts.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  useAutomationStore,
  applyBoxTransform,
  flattenParams,
  rampParams,
  IDENTITY_TRANSFORM,
  type BoxTransformParams,
} from '../../renderer/stores/automation'
import { useUndoStore } from '../../renderer/stores/undo'
import type { AutomationPoint } from '../../../src/shared/types'

function resetStores() {
  useAutomationStore.getState().resetAutomation()
  useUndoStore.getState().clear()
}

function setupLaneWithPoints(trackId = 'track-1') {
  useAutomationStore.getState().addLane(trackId, 'fx-1', 'amount', '#4ade80')
  const laneId = useAutomationStore.getState().lanes[trackId][0].id
  // times: 0, 1, 2, 3, 4 — values: 0.1, 0.3, 0.5, 0.7, 0.9 (a straight rising line)
  useAutomationStore.getState().addPoint(trackId, laneId, 0, 0.1)
  useAutomationStore.getState().addPoint(trackId, laneId, 1, 0.3)
  useAutomationStore.getState().addPoint(trackId, laneId, 2, 0.5)
  useAutomationStore.getState().addPoint(trackId, laneId, 3, 0.7)
  useAutomationStore.getState().addPoint(trackId, laneId, 4, 0.9)
  return laneId
}

describe('automation transform box — pure applyBoxTransform (AA.4b)', () => {
  it('is a no-op passthrough for untouched indices, and does not mutate the input array', () => {
    const points: AutomationPoint[] = [
      { time: 0, value: 0.1, curve: 0 },
      { time: 1, value: 0.5, curve: 0 },
    ]
    const before = JSON.stringify(points)
    const result = applyBoxTransform(points, [1], IDENTITY_TRANSFORM)
    expect(JSON.stringify(points)).toBe(before) // input untouched
    expect(result[0]).toBe(points[0]) // untouched index — same reference
    expect(result[1]).toEqual({ time: 1, value: 0.5, curve: 0 }) // identity transform is a no-op value-wise
  })

  it('empty indices returns the original array', () => {
    const points: AutomationPoint[] = [{ time: 0, value: 0.1, curve: 0 }]
    expect(applyBoxTransform(points, [], IDENTITY_TRANSFORM)).toBe(points)
  })

  it('skew: dragging the right side down tilts a FLAT selection into a downward ramp', () => {
    // Plan doc's defining example: "drag the right edge down and a flat
    // selection becomes a downward ramp." Flat selection: all value 0.5.
    const points: AutomationPoint[] = [
      { time: 0, value: 0.5, curve: 0 },
      { time: 1, value: 0.5, curve: 0 },
      { time: 2, value: 0.5, curve: 0 },
      { time: 3, value: 0.5, curve: 0 },
    ]
    const skewRightDown: BoxTransformParams = {
      timeScale: 1,
      anchorTime: 0,
      valueScaleLeft: 1,
      valueScaleRight: 1,
      valueShiftLeft: 0,
      valueShiftRight: -0.2, // right side drops by 0.2, left side untouched
      anchorValue: 0,
    }
    const result = applyBoxTransform(points, [0, 1, 2, 3], skewRightDown)
    // u = time / 3 (selection span is 0..3) -> shift = -0.2 * u
    expect(result[0].value).toBeCloseTo(0.5) // u=0 -> unchanged (left anchored)
    expect(result[1].value).toBeCloseTo(0.5 - 0.2 * (1 / 3))
    expect(result[2].value).toBeCloseTo(0.5 - 0.2 * (2 / 3))
    expect(result[3].value).toBeCloseTo(0.3) // u=1 -> full -0.2 shift
    // Now strictly descending -> it's a ramp, not flat anymore.
    const values = result.map((p) => p.value)
    expect(values[0]).toBeGreaterThan(values[1])
    expect(values[1]).toBeGreaterThan(values[2])
    expect(values[2]).toBeGreaterThan(values[3])
  })

  it('scale: dragging the top edge down scales values toward the flat anchor (no skew)', () => {
    const points: AutomationPoint[] = [
      { time: 0, value: 0.1, curve: 0 },
      { time: 1, value: 0.3, curve: 0 },
      { time: 2, value: 0.5, curve: 0 },
      { time: 3, value: 0.7, curve: 0 },
    ]
    // Top edge drag: uniform value scale anchored at the bottom (0.1), no time
    // change, no skew (scaleLeft === scaleRight).
    const scaleTowardBottom: BoxTransformParams = {
      timeScale: 1,
      anchorTime: 0,
      valueScaleLeft: 0.5,
      valueScaleRight: 0.5,
      valueShiftLeft: 0,
      valueShiftRight: 0,
      anchorValue: 0.1,
    }
    const result = applyBoxTransform(points, [0, 1, 2, 3], scaleTowardBottom)
    expect(result[0].value).toBeCloseTo(0.1) // at the anchor already -> unchanged
    expect(result[1].value).toBeCloseTo(0.2)
    expect(result[2].value).toBeCloseTo(0.3)
    expect(result[3].value).toBeCloseTo(0.4)
    // scale -> 0 fully flattens toward the anchor (proves flatten is the s=0 case)
    const flat = applyBoxTransform(points, [0, 1, 2, 3], { ...scaleTowardBottom, valueScaleLeft: 0, valueScaleRight: 0 })
    expect(flat.every((p) => Math.abs(p.value - 0.1) < 1e-9)).toBe(true)
  })

  it('clamps value to [0, 1] and time to >= 0', () => {
    const points: AutomationPoint[] = [{ time: 0.2, value: 0.9, curve: 0 }]
    const blowUp: BoxTransformParams = {
      timeScale: -5,
      anchorTime: 1,
      valueScaleLeft: 5,
      valueScaleRight: 5,
      valueShiftLeft: 0,
      valueShiftRight: 0,
      anchorValue: 0,
    }
    const result = applyBoxTransform(points, [0], blowUp)
    expect(result[0].value).toBe(1)
    expect(result[0].time).toBeGreaterThanOrEqual(0)
  })

  it('grid-snaps time when quantize is enabled', () => {
    const points: AutomationPoint[] = [{ time: 1, value: 0.3, curve: 0 }]
    const shiftTime: BoxTransformParams = { ...IDENTITY_TRANSFORM, anchorTime: 0.63, timeScale: 1 }
    // anchorTime + (1 - anchorTime)*1 = 1 unchanged when scale=1; use a real
    // scale so time actually moves off-grid.
    const scaleTime: BoxTransformParams = { ...IDENTITY_TRANSFORM, anchorTime: 0, timeScale: 1.37 }
    const result = applyBoxTransform(points, [0], scaleTime, { enabled: true, bpm: 120, division: 4 })
    // 1 * 1.37 = 1.37 -> nearest 0.5s grid line (bpm120, 1/4) is 1.5
    expect(result[0].time).toBeCloseTo(1.5)
    void shiftTime
  })
})

describe('automation transform box — store actions (AA.4b)', () => {
  beforeEach(resetStores)

  describe('transformSelectedPoints', () => {
    it('skew: drag-right-edge-down produces the expected skewed coords on the CURRENT selection', () => {
      const trackId = 'track-1'
      const laneId = setupLaneWithPoints(trackId)
      // Select the first 4 points (times 0..3, values 0.1..0.7)
      useAutomationStore.getState().selectPointsInRect(trackId, laneId, 0, 3, 0, 1)
      expect(useAutomationStore.getState().selectedPoints!.indices).toEqual([0, 1, 2, 3])

      const skewRightDown: BoxTransformParams = {
        timeScale: 1,
        anchorTime: 0,
        valueScaleLeft: 1,
        valueScaleRight: 1,
        valueShiftLeft: 0,
        valueShiftRight: -0.2,
        anchorValue: 0,
      }
      useAutomationStore.getState().transformSelectedPoints(skewRightDown)

      const lane = useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!
      const byTime = (t: number) => lane.points.find((p) => Math.abs(p.time - t) < 1e-9)!
      expect(byTime(0).value).toBeCloseTo(0.1)
      expect(byTime(1).value).toBeCloseTo(0.3 - 0.2 * (1 / 3))
      expect(byTime(2).value).toBeCloseTo(0.5 - 0.2 * (2 / 3))
      expect(byTime(3).value).toBeCloseTo(0.5)
      // Untouched point (time=4, outside selection) unchanged
      expect(byTime(4).value).toBeCloseTo(0.9)
    })

    it('scale: drag-top-edge-down scales the selection toward the anchor (values scale toward flat)', () => {
      const trackId = 'track-1'
      const laneId = setupLaneWithPoints(trackId)
      useAutomationStore.getState().selectPointsInRect(trackId, laneId, 0, 3, 0, 1)

      const scaleTowardBottom: BoxTransformParams = {
        timeScale: 1,
        anchorTime: 0,
        valueScaleLeft: 0.5,
        valueScaleRight: 0.5,
        valueShiftLeft: 0,
        valueShiftRight: 0,
        anchorValue: 0.1,
      }
      useAutomationStore.getState().transformSelectedPoints(scaleTowardBottom)

      const lane = useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!
      const byTime = (t: number) => lane.points.find((p) => Math.abs(p.time - t) < 1e-9)!
      expect(byTime(0).value).toBeCloseTo(0.1)
      expect(byTime(1).value).toBeCloseTo(0.2)
      expect(byTime(2).value).toBeCloseTo(0.3)
      expect(byTime(3).value).toBeCloseTo(0.4)
      // The value SPREAD shrank (0.6 -> 0.3) -- "scale toward flat"
      const before = [0.1, 0.3, 0.5, 0.7]
      const after = [byTime(0).value, byTime(1).value, byTime(2).value, byTime(3).value]
      const spread = (arr: number[]) => Math.max(...arr) - Math.min(...arr)
      expect(spread(after)).toBeLessThan(spread(before))
    })

    it('corner: scales both time and value at once', () => {
      const trackId = 'track-1'
      const laneId = setupLaneWithPoints(trackId)
      useAutomationStore.getState().selectPointsInRect(trackId, laneId, 0, 4, 0, 1)

      const cornerScale: BoxTransformParams = {
        timeScale: 2, // double the time span, anchored at time 0
        anchorTime: 0,
        valueScaleLeft: 0.5,
        valueScaleRight: 0.5,
        valueShiftLeft: 0,
        valueShiftRight: 0,
        anchorValue: 0.1, // anchored at the bottom value
      }
      useAutomationStore.getState().transformSelectedPoints(cornerScale)

      const lane = useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!
      const times = lane.points.map((p) => p.time).sort((a, b) => a - b)
      expect(times).toEqual([0, 2, 4, 6, 8]) // time doubled
      const last = lane.points.find((p) => Math.abs(p.time - 8) < 1e-9)!
      expect(last.value).toBeCloseTo(0.1 + (0.9 - 0.1) * 0.5) // value scaled toward 0.1
    })

    it('grid-snaps the resulting time when quantize is enabled (same toggle as clip editing)', () => {
      const trackId = 'track-1'
      const laneId = setupLaneWithPoints(trackId)
      useAutomationStore.getState().selectPointsInRect(trackId, laneId, 1, 1, 0.3, 0.3) // just point (1, 0.3)

      const timeScale: BoxTransformParams = { ...IDENTITY_TRANSFORM, anchorTime: 0, timeScale: 1.37 }
      useAutomationStore.getState().transformSelectedPoints(timeScale, { enabled: true, bpm: 120, division: 4 })

      const lane = useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!
      const moved = lane.points.find((p) => p.value === 0.3)!
      // 1 * 1.37 = 1.37 -> nearest 0.5s grid line is 1.5
      expect(moved.time).toBeCloseTo(1.5)
    })

    it('quantize OFF leaves the exact (unsnapped) time', () => {
      const trackId = 'track-1'
      const laneId = setupLaneWithPoints(trackId)
      useAutomationStore.getState().selectPointsInRect(trackId, laneId, 1, 1, 0.3, 0.3)

      const timeScale: BoxTransformParams = { ...IDENTITY_TRANSFORM, anchorTime: 0, timeScale: 1.37 }
      useAutomationStore.getState().transformSelectedPoints(timeScale)

      const lane = useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!
      const moved = lane.points.find((p) => p.value === 0.3)!
      expect(moved.time).toBeCloseTo(1.37)
    })

    it('never collapses coincident points or loses sort order after a time-scale', () => {
      const trackId = 'track-1'
      const laneId = setupLaneWithPoints(trackId)
      useAutomationStore.getState().selectPointsInRect(trackId, laneId, 0, 4, 0, 1)

      // Squash the whole time range down toward 0 -- all 5 points would land
      // very close together but must remain 5 distinct, sorted points.
      const squash: BoxTransformParams = { ...IDENTITY_TRANSFORM, anchorTime: 0, timeScale: 0.001 }
      useAutomationStore.getState().transformSelectedPoints(squash)

      const lane = useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!
      expect(lane.points).toHaveLength(5)
      const times = lane.points.map((p) => p.time)
      expect(times).toEqual([...times].sort((a, b) => a - b))
    })

    it('is undoable — ONE step, restores original points AND selection byte-for-byte', () => {
      const trackId = 'track-1'
      const laneId = setupLaneWithPoints(trackId)
      useAutomationStore.getState().selectPointsInRect(trackId, laneId, 0, 3, 0, 1)
      const beforePoints = useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!.points
      const beforeSelection = useAutomationStore.getState().selectedPoints
      const undoDepthBefore = useUndoStore.getState().past.length

      useAutomationStore.getState().transformSelectedPoints({
        timeScale: 1,
        anchorTime: 0,
        valueScaleLeft: 1,
        valueScaleRight: 1,
        valueShiftLeft: 0,
        valueShiftRight: -0.2,
        anchorValue: 0,
      })

      expect(useUndoStore.getState().past.length).toBe(undoDepthBefore + 1) // exactly ONE new entry

      useUndoStore.getState().undo()

      const afterPoints = useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!.points
      expect(afterPoints).toEqual(beforePoints)
      expect(useAutomationStore.getState().selectedPoints).toEqual(beforeSelection)
    })

    it('no-op when there is no active selection', () => {
      const trackId = 'track-1'
      const laneId = setupLaneWithPoints(trackId)
      const before = useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!.points
      useAutomationStore.getState().transformSelectedPoints(IDENTITY_TRANSFORM)
      const after = useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!.points
      expect(after).toBe(before)
    })
  })

  describe('flattenSelectedPoints', () => {
    it('mode "average": collapses the selection to the mean of the selected values (a horizontal line)', () => {
      const trackId = 'track-1'
      const laneId = setupLaneWithPoints(trackId)
      useAutomationStore.getState().selectPointsInRect(trackId, laneId, 0, 4, 0, 1) // all 5 points
      useAutomationStore.getState().flattenSelectedPoints('average')

      const lane = useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!
      const mean = (0.1 + 0.3 + 0.5 + 0.7 + 0.9) / 5
      expect(lane.points.every((p) => Math.abs(p.value - mean) < 1e-9)).toBe(true)
      // Still 5 distinct points (same times), just flat
      expect(lane.points.map((p) => p.time)).toEqual([0, 1, 2, 3, 4])
    })

    it('mode "release": collapses to the given release value, clamped to [0,1]', () => {
      const trackId = 'track-1'
      const laneId = setupLaneWithPoints(trackId)
      useAutomationStore.getState().selectPointsInRect(trackId, laneId, 0, 4, 0, 1)
      useAutomationStore.getState().flattenSelectedPoints('release', 1.5) // out of range -> clamp to 1

      const lane = useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!
      expect(lane.points.every((p) => p.value === 1)).toBe(true)
    })

    it('only flattens the SELECTED points, leaving others untouched', () => {
      const trackId = 'track-1'
      const laneId = setupLaneWithPoints(trackId)
      useAutomationStore.getState().selectPointsInRect(trackId, laneId, 0, 2, 0, 1) // points at 0,1,2
      useAutomationStore.getState().flattenSelectedPoints('release', 0.6)

      const lane = useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!
      const byTime = (t: number) => lane.points.find((p) => Math.abs(p.time - t) < 1e-9)!
      expect(byTime(0).value).toBe(0.6)
      expect(byTime(1).value).toBe(0.6)
      expect(byTime(2).value).toBe(0.6)
      expect(byTime(3).value).toBeCloseTo(0.7) // untouched
      expect(byTime(4).value).toBeCloseTo(0.9) // untouched
    })

    it('is undoable as ONE step', () => {
      const trackId = 'track-1'
      const laneId = setupLaneWithPoints(trackId)
      useAutomationStore.getState().selectPointsInRect(trackId, laneId, 0, 4, 0, 1)
      const before = useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!.points
      const undoDepthBefore = useUndoStore.getState().past.length

      useAutomationStore.getState().flattenSelectedPoints('average')
      expect(useUndoStore.getState().past.length).toBe(undoDepthBefore + 1)

      useUndoStore.getState().undo()
      const after = useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!.points
      expect(after).toEqual(before)
    })

    it('no-op when there is no active selection', () => {
      const trackId = 'track-1'
      const laneId = setupLaneWithPoints(trackId)
      const before = useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!.points
      useAutomationStore.getState().flattenSelectedPoints('average')
      const after = useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!.points
      expect(after).toBe(before)
    })
  })

  describe('rampSelectedPoints', () => {
    it('replaces interior selected points with the straight first->last line; endpoints keep their own value', () => {
      const trackId = 'track-1'
      const laneId = setupLaneWithPoints(trackId)
      // Knock point at time=2 off the line (spike to 0.95) before ramping
      const laneBefore = useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!
      const spikeIdx = laneBefore.points.findIndex((p) => p.time === 2)
      useAutomationStore.getState().updatePoint(trackId, laneId, spikeIdx, { value: 0.95 })

      useAutomationStore.getState().selectPointsInRect(trackId, laneId, 0, 4, 0, 1) // all 5
      useAutomationStore.getState().rampSelectedPoints()

      const lane = useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!
      const byTime = (t: number) => lane.points.find((p) => Math.abs(p.time - t) < 1e-9)!
      // Line from (0, 0.1) to (4, 0.9): slope 0.2/unit
      expect(byTime(0).value).toBeCloseTo(0.1) // endpoint unchanged
      expect(byTime(1).value).toBeCloseTo(0.3)
      expect(byTime(2).value).toBeCloseTo(0.5) // de-spiked back onto the line
      expect(byTime(3).value).toBeCloseTo(0.7)
      expect(byTime(4).value).toBeCloseTo(0.9) // endpoint unchanged
    })

    it('no-op with fewer than 2 selected points', () => {
      const trackId = 'track-1'
      const laneId = setupLaneWithPoints(trackId)
      useAutomationStore.getState().selectPoint(trackId, laneId, 2)
      const before = useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!.points
      useAutomationStore.getState().rampSelectedPoints()
      const after = useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!.points
      expect(after).toBe(before)
    })

    it('is undoable as ONE step', () => {
      const trackId = 'track-1'
      const laneId = setupLaneWithPoints(trackId)
      useAutomationStore.getState().selectPointsInRect(trackId, laneId, 0, 4, 0, 1)
      const before = useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!.points
      const undoDepthBefore = useUndoStore.getState().past.length

      useAutomationStore.getState().rampSelectedPoints()
      expect(useUndoStore.getState().past.length).toBe(undoDepthBefore + 1)

      useUndoStore.getState().undo()
      const after = useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!.points
      expect(after).toEqual(before)
    })

    it('no-op when there is no active selection', () => {
      const trackId = 'track-1'
      const laneId = setupLaneWithPoints(trackId)
      const before = useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!.points
      useAutomationStore.getState().rampSelectedPoints()
      const after = useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!.points
      expect(after).toBe(before)
    })
  })

  describe('setPointsRaw (transform-box live-preview helper)', () => {
    it('replaces a lane\'s points directly WITHOUT creating an undo entry', () => {
      const trackId = 'track-1'
      const laneId = setupLaneWithPoints(trackId)
      const undoDepthBefore = useUndoStore.getState().past.length
      const newPoints: AutomationPoint[] = [{ time: 0, value: 0.42, curve: 0 }]

      useAutomationStore.getState().setPointsRaw(trackId, laneId, newPoints)

      const lane = useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!
      expect(lane.points).toEqual(newPoints)
      expect(useUndoStore.getState().past.length).toBe(undoDepthBefore) // no new undo entry
    })

    it('no-op for a nonexistent lane', () => {
      const trackId = 'track-1'
      setupLaneWithPoints(trackId)
      const before = useAutomationStore.getState().lanes[trackId]
      useAutomationStore.getState().setPointsRaw(trackId, 'nope', [])
      expect(useAutomationStore.getState().lanes[trackId]).toBe(before)
    })
  })

  describe('flattenParams / rampParams builders', () => {
    it('flattenParams collapses any value to the target regardless of u', () => {
      const points: AutomationPoint[] = [
        { time: 0, value: 0.1, curve: 0 },
        { time: 10, value: 0.9, curve: 0 },
      ]
      const result = applyBoxTransform(points, [0, 1], flattenParams(0.42))
      expect(result[0].value).toBeCloseTo(0.42)
      expect(result[1].value).toBeCloseTo(0.42)
    })

    it('rampParams reconstructs the exact endpoints at u=0 and u=1', () => {
      const points: AutomationPoint[] = [
        { time: 0, value: 0.2, curve: 0 },
        { time: 5, value: 0.2, curve: 0 }, // interior, off the eventual line
        { time: 10, value: 0.8, curve: 0 },
      ]
      const result = applyBoxTransform(points, [0, 1, 2], rampParams(0.2, 0.8))
      expect(result[0].value).toBeCloseTo(0.2)
      expect(result[1].value).toBeCloseTo(0.5) // midpoint of 0.2 -> 0.8
      expect(result[2].value).toBeCloseTo(0.8)
    })
  })
})
