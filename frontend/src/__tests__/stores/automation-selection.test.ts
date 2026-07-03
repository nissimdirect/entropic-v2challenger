/**
 * AA.4 — Automation breakpoint selection: marquee-select, move (time+value,
 * clamped, quantize-aware), and selection-based copy/paste.
 *
 * Store-level tests (hard oracle). UI wiring (MarqueeOverlay-style drag on
 * AutomationLane, group-drag on AutomationNode) is exercised manually /
 * deferred to E2E per this codebase's convention for automation components
 * (see automation-lane.test.ts header comment).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useAutomationStore } from '../../renderer/stores/automation'
import { useUndoStore } from '../../renderer/stores/undo'

function resetStores() {
  useAutomationStore.getState().resetAutomation()
  useUndoStore.getState().clear()
}

function setupLaneWithPoints(trackId = 'track-1') {
  useAutomationStore.getState().addLane(trackId, 'fx-1', 'amount', '#4ade80')
  const laneId = useAutomationStore.getState().lanes[trackId][0].id
  // times: 0, 1, 2, 3, 4 — values: 0.1, 0.3, 0.5, 0.7, 0.9
  useAutomationStore.getState().addPoint(trackId, laneId, 0, 0.1)
  useAutomationStore.getState().addPoint(trackId, laneId, 1, 0.3)
  useAutomationStore.getState().addPoint(trackId, laneId, 2, 0.5)
  useAutomationStore.getState().addPoint(trackId, laneId, 3, 0.7)
  useAutomationStore.getState().addPoint(trackId, laneId, 4, 0.9)
  return laneId
}

describe('Automation breakpoint selection (AA.4)', () => {
  beforeEach(resetStores)

  // ---------------------------------------------------------------
  // Marquee select
  // ---------------------------------------------------------------

  describe('selectPointsInRect', () => {
    it('selects only the points inside the box (time AND value bounds)', () => {
      const trackId = 'track-1'
      const laneId = setupLaneWithPoints(trackId)
      // Box covers time [0.5, 2.5], value [0.2, 0.6] -> points at (1,0.3) and (2,0.5)
      useAutomationStore.getState().selectPointsInRect(trackId, laneId, 0.5, 2.5, 0.2, 0.6)

      const sel = useAutomationStore.getState().selectedPoints
      expect(sel).not.toBeNull()
      expect(sel!.trackId).toBe(trackId)
      expect(sel!.laneId).toBe(laneId)
      expect(sel!.indices).toEqual([1, 2])
    })

    it('is inclusive of exact boundary values', () => {
      const trackId = 'track-1'
      const laneId = setupLaneWithPoints(trackId)
      // Exactly matches point (1, 0.3) at both edges
      useAutomationStore.getState().selectPointsInRect(trackId, laneId, 1, 1, 0.3, 0.3)
      expect(useAutomationStore.getState().selectedPoints!.indices).toEqual([1])
    })

    it('handles min/max passed in reversed order', () => {
      const trackId = 'track-1'
      const laneId = setupLaneWithPoints(trackId)
      useAutomationStore.getState().selectPointsInRect(trackId, laneId, 2.5, 0.5, 0.6, 0.2)
      expect(useAutomationStore.getState().selectedPoints!.indices).toEqual([1, 2])
    })

    it('empty box selection clears/replaces with an empty selection (non-additive)', () => {
      const trackId = 'track-1'
      const laneId = setupLaneWithPoints(trackId)
      useAutomationStore.getState().selectPointsInRect(trackId, laneId, 0.5, 2.5, 0.2, 0.6)
      expect(useAutomationStore.getState().selectedPoints!.indices).toHaveLength(2)

      // A box that hits nothing replaces the selection with an empty one
      useAutomationStore.getState().selectPointsInRect(trackId, laneId, 100, 200, 0.2, 0.6)
      expect(useAutomationStore.getState().selectedPoints!.indices).toEqual([])
    })

    it('additive (shift-drag) unions with the prior selection on the SAME lane', () => {
      const trackId = 'track-1'
      const laneId = setupLaneWithPoints(trackId)
      useAutomationStore.getState().selectPointsInRect(trackId, laneId, 0, 0, 0.05, 0.15) // point 0
      useAutomationStore.getState().selectPointsInRect(trackId, laneId, 4, 4, 0.85, 0.95, true) // point 4, additive
      expect(useAutomationStore.getState().selectedPoints!.indices).toEqual([0, 4])
    })

    it('non-additive replaces the selection even across different lanes', () => {
      const trackId = 'track-1'
      const laneId = setupLaneWithPoints(trackId)
      useAutomationStore.getState().addLane(trackId, 'fx-2', 'other', '#ff0000')
      const laneId2 = useAutomationStore.getState().lanes[trackId][1].id
      useAutomationStore.getState().addPoint(trackId, laneId2, 0, 0.5)

      useAutomationStore.getState().selectPointsInRect(trackId, laneId, 0, 0, 0.05, 0.15)
      expect(useAutomationStore.getState().selectedPoints!.laneId).toBe(laneId)

      useAutomationStore.getState().selectPointsInRect(trackId, laneId2, 0, 0, 0.4, 0.6)
      const sel = useAutomationStore.getState().selectedPoints!
      expect(sel.laneId).toBe(laneId2)
      expect(sel.indices).toEqual([0])
    })

    it('no-op for a nonexistent lane', () => {
      const trackId = 'track-1'
      setupLaneWithPoints(trackId)
      useAutomationStore.getState().selectPointsInRect(trackId, 'nope', 0, 10, 0, 1)
      expect(useAutomationStore.getState().selectedPoints).toBeNull()
    })
  })

  describe('selectPoint', () => {
    it('selects a single point by index', () => {
      const trackId = 'track-1'
      const laneId = setupLaneWithPoints(trackId)
      useAutomationStore.getState().selectPoint(trackId, laneId, 2)
      expect(useAutomationStore.getState().selectedPoints!.indices).toEqual([2])
    })

    it('additive (shift-click) unions with an existing same-lane selection', () => {
      const trackId = 'track-1'
      const laneId = setupLaneWithPoints(trackId)
      useAutomationStore.getState().selectPoint(trackId, laneId, 0)
      useAutomationStore.getState().selectPoint(trackId, laneId, 3, true)
      expect(useAutomationStore.getState().selectedPoints!.indices).toEqual([0, 3])
    })

    it('non-additive click replaces the selection', () => {
      const trackId = 'track-1'
      const laneId = setupLaneWithPoints(trackId)
      useAutomationStore.getState().selectPoint(trackId, laneId, 0)
      useAutomationStore.getState().selectPoint(trackId, laneId, 3)
      expect(useAutomationStore.getState().selectedPoints!.indices).toEqual([3])
    })

    it('ignores an out-of-range index', () => {
      const trackId = 'track-1'
      const laneId = setupLaneWithPoints(trackId)
      useAutomationStore.getState().selectPoint(trackId, laneId, 99)
      expect(useAutomationStore.getState().selectedPoints).toBeNull()
    })
  })

  describe('clearPointSelection', () => {
    it('clears an active selection', () => {
      const trackId = 'track-1'
      const laneId = setupLaneWithPoints(trackId)
      useAutomationStore.getState().selectPoint(trackId, laneId, 0)
      expect(useAutomationStore.getState().selectedPoints).not.toBeNull()
      useAutomationStore.getState().clearPointSelection()
      expect(useAutomationStore.getState().selectedPoints).toBeNull()
    })
  })

  // ---------------------------------------------------------------
  // Move
  // ---------------------------------------------------------------

  describe('moveSelectedPoints', () => {
    it('applies delta to time AND value for selected points only', () => {
      const trackId = 'track-1'
      const laneId = setupLaneWithPoints(trackId)
      useAutomationStore.getState().selectPointsInRect(trackId, laneId, 1, 1, 0.3, 0.3) // point (1, 0.3)
      useAutomationStore.getState().moveSelectedPoints(0.5, 0.1)

      const lane = useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!
      const moved = lane.points.find((p) => Math.abs(p.value - 0.4) < 1e-9)
      expect(moved).toBeDefined()
      expect(moved!.time).toBeCloseTo(1.5)

      // Untouched points still present unchanged
      expect(lane.points.some((p) => p.time === 0 && p.value === 0.1)).toBe(true)
      expect(lane.points.some((p) => p.time === 2 && p.value === 0.5)).toBe(true)
    })

    it('clamps time to >= 0', () => {
      const trackId = 'track-1'
      const laneId = setupLaneWithPoints(trackId)
      useAutomationStore.getState().selectPointsInRect(trackId, laneId, 0, 0, 0.05, 0.15) // point (0, 0.1)
      useAutomationStore.getState().moveSelectedPoints(-5, 0)

      const lane = useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!
      const moved = lane.points.find((p) => Math.abs(p.value - 0.1) < 1e-9)
      expect(moved!.time).toBe(0)
    })

    it('clamps value to [0, 1]', () => {
      const trackId = 'track-1'
      const laneId = setupLaneWithPoints(trackId)
      useAutomationStore.getState().selectPointsInRect(trackId, laneId, 4, 4, 0.85, 0.95) // point (4, 0.9)
      useAutomationStore.getState().moveSelectedPoints(0, 5)

      const lane = useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!
      const moved = lane.points.find((p) => p.time === 4)
      expect(moved!.value).toBe(1)

      useAutomationStore.getState().selectPointsInRect(trackId, laneId, 0, 0, 0.05, 0.15) // point (0, 0.1)
      useAutomationStore.getState().moveSelectedPoints(0, -5)
      const lane2 = useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!
      const movedLow = lane2.points.find((p) => p.time === 0)
      expect(movedLow!.value).toBe(0)
    })

    it('quantize OFF leaves the exact (unsnapped) time', () => {
      const trackId = 'track-1'
      const laneId = setupLaneWithPoints(trackId)
      useAutomationStore.getState().selectPointsInRect(trackId, laneId, 1, 1, 0.3, 0.3)
      useAutomationStore.getState().moveSelectedPoints(0.37, 0, { enabled: false, bpm: 120, division: 4 })

      const lane = useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!
      const moved = lane.points.find((p) => p.value === 0.3)!
      expect(moved.time).toBeCloseTo(1.37)
    })

    it('quantize ON snaps the resulting time to the grid (bpm=120, 1/4 division = 0.5s grid)', () => {
      const trackId = 'track-1'
      const laneId = setupLaneWithPoints(trackId)
      useAutomationStore.getState().selectPointsInRect(trackId, laneId, 1, 1, 0.3, 0.3)
      // 1 + 0.37 = 1.37 -> nearest 0.5s grid line is 1.5
      useAutomationStore.getState().moveSelectedPoints(0.37, 0, { enabled: true, bpm: 120, division: 4 })

      const lane = useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!
      const moved = lane.points.find((p) => p.value === 0.3)!
      expect(moved.time).toBeCloseTo(1.5)
    })

    it('re-sorts points and keeps the SAME (moved) points selected after reorder', () => {
      const trackId = 'track-1'
      const laneId = setupLaneWithPoints(trackId)
      // Select point at time=1 (value 0.3) and move it past time=3 -> should re-sort
      useAutomationStore.getState().selectPointsInRect(trackId, laneId, 1, 1, 0.3, 0.3)
      useAutomationStore.getState().moveSelectedPoints(2.6, 0) // 1 -> 3.6, now the last point

      const lane = useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!
      // Points should be sorted by time
      const times = lane.points.map((p) => p.time)
      expect(times).toEqual([...times].sort((a, b) => a - b))

      const sel = useAutomationStore.getState().selectedPoints!
      expect(sel.indices).toHaveLength(1)
      const selectedPoint = lane.points[sel.indices[0]]
      expect(selectedPoint.value).toBe(0.3)
      expect(selectedPoint.time).toBeCloseTo(3.6)
    })

    it('moves MULTIPLE selected points together, preserving their relative spacing', () => {
      const trackId = 'track-1'
      const laneId = setupLaneWithPoints(trackId)
      useAutomationStore.getState().selectPointsInRect(trackId, laneId, 1, 2, 0.2, 0.6) // points at 1 and 2
      useAutomationStore.getState().moveSelectedPoints(0.25, 0)

      const lane = useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!
      expect(lane.points.some((p) => Math.abs(p.time - 1.25) < 1e-9 && p.value === 0.3)).toBe(true)
      expect(lane.points.some((p) => Math.abs(p.time - 2.25) < 1e-9 && p.value === 0.5)).toBe(true)
    })

    it('is undoable — restores original points AND original selection', () => {
      const trackId = 'track-1'
      const laneId = setupLaneWithPoints(trackId)
      useAutomationStore.getState().selectPointsInRect(trackId, laneId, 1, 1, 0.3, 0.3)
      const before = useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!.points
      useAutomationStore.getState().moveSelectedPoints(0.5, 0.1)

      useUndoStore.getState().undo()

      const after = useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!.points
      expect(after).toEqual(before)
      expect(useAutomationStore.getState().selectedPoints!.indices).toEqual([1])
    })

    it('no-op when there is no active selection', () => {
      const trackId = 'track-1'
      const laneId = setupLaneWithPoints(trackId)
      const before = useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!.points
      useAutomationStore.getState().moveSelectedPoints(1, 1)
      const after = useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!.points
      expect(after).toEqual(before)
    })
  })

  // ---------------------------------------------------------------
  // Copy / paste
  // ---------------------------------------------------------------

  describe('copySelectedPoints + pasteAtPlayhead round-trip', () => {
    it('copies selected points relative to the earliest selected time, pastes at playhead', () => {
      const trackId = 'track-1'
      const laneId = setupLaneWithPoints(trackId)
      // Select points at time 1 and 2 (values 0.3, 0.5)
      useAutomationStore.getState().selectPointsInRect(trackId, laneId, 1, 2, 0.2, 0.6)
      useAutomationStore.getState().copySelectedPoints()

      const clipboard = useAutomationStore.getState().clipboard
      expect(clipboard).not.toBeNull()
      expect(clipboard!.points).toHaveLength(2)
      expect(clipboard!.duration).toBeCloseTo(1)
      expect(clipboard!.points.map((p) => p.time).sort()).toEqual([0, 1])

      useAutomationStore.getState().pasteAtPlayhead(trackId, laneId, 10)

      const lane = useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!
      expect(lane.points).toHaveLength(7) // 5 original + 2 pasted
      expect(lane.points.some((p) => Math.abs(p.time - 10) < 1e-9 && p.value === 0.3)).toBe(true)
      expect(lane.points.some((p) => Math.abs(p.time - 11) < 1e-9 && p.value === 0.5)).toBe(true)
    })

    it('is a no-op when nothing is selected', () => {
      const trackId = 'track-1'
      setupLaneWithPoints(trackId)
      useAutomationStore.getState().copySelectedPoints()
      expect(useAutomationStore.getState().clipboard).toBeNull()
    })

    it('is a no-op when the selected lane no longer exists', () => {
      const trackId = 'track-1'
      const laneId = setupLaneWithPoints(trackId)
      useAutomationStore.getState().selectPointsInRect(trackId, laneId, 1, 1, 0.3, 0.3)
      useAutomationStore.getState().removeLane(trackId, laneId)
      useAutomationStore.getState().copySelectedPoints()
      expect(useAutomationStore.getState().clipboard).toBeNull()
    })
  })

  describe('resetAutomation clears selection', () => {
    it('resets selectedPoints to null', () => {
      const trackId = 'track-1'
      const laneId = setupLaneWithPoints(trackId)
      useAutomationStore.getState().selectPoint(trackId, laneId, 0)
      expect(useAutomationStore.getState().selectedPoints).not.toBeNull()
      useAutomationStore.getState().resetAutomation()
      expect(useAutomationStore.getState().selectedPoints).toBeNull()
    })
  })
})
