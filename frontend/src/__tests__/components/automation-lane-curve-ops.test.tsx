/**
 * D8/PK.C — lane right-click CURVE context menu (Option A, user verdict
 * 2026-07-30).
 *
 * Flatten/Ramp/Shape/Simplify/Clear moved off the automation strip
 * (AutomationToolbar.tsx — see automation-toolbar.test.tsx's "strip
 * membership" block for the absence assertion) onto the lane itself, so a
 * right-click always targets an explicit lane instead of guessing "which
 * lane?" from a global armed-track button.
 *
 * STOP (reported to the packet owner, unresolved as of this PR): Simplify
 * and Clear cleanly relocate because their store actions already take an
 * explicit laneId (`simplifyLane(trackId, laneId, tolerance)` /
 * `clearLane(trackId, laneId)`). Shape relocates too
 * (`insertShapeIntoLane(trackId, laneId, ...)`) via a small config popover
 * anchored at the click point instead of the old toolbar's "pick a target
 * lane" list. Flatten/Ramp do NOT relocate: `flattenSelectedPoints`/
 * `rampSelectedPoints` have no laneId parameter at all — they only read the
 * global `selectedPoints` selection. Wiring them to "fire with this lane's
 * id" would mean inventing a new "select all points in this lane" behavior,
 * which is a new curve-op algorithm the packet's non-scope line forbids.
 * They are intentionally ABSENT from this menu pending that decision — see
 * the negative assertion below.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'

const mockEntropic = {
  sendCommand: vi.fn().mockResolvedValue({ ok: true }),
  onEngineStatus: vi.fn(),
}
// NOTE: unlike automation-toolbar.test.tsx's full `window = {...}` replacement
// (safe there — AutomationToolbar never touches real window APIs), this file
// renders AutomationLane, which registers a real `window.addEventListener`
// (Escape-cancels-marquee, AA.4). Stomping the whole window object breaks
// that effect, so only the `entropic` property is added onto jsdom's real
// window here.
;(window as unknown as { entropic: unknown }).entropic = mockEntropic

import AutomationLane from '../../renderer/components/automation/AutomationLane'
import { useAutomationStore } from '../../renderer/stores/automation'
import { useTimelineStore } from '../../renderer/stores/timeline'

const TRACK_ID = 'track-1'
const LANE_A = 'lane-a'
const LANE_B = 'lane-b'

function seedTwoLanes() {
  useAutomationStore.setState({
    lanes: {
      [TRACK_ID]: [
        {
          id: LANE_A,
          paramPath: 'fx1.amount',
          points: [
            { time: 0, value: 0, curve: 0 },
            { time: 1, value: 0.25, curve: 0 },
            { time: 2, value: 0.5, curve: 0 },
            { time: 3, value: 0.75, curve: 0 },
            { time: 4, value: 1, curve: 0 },
          ],
          color: '#4ade80',
          isVisible: true,
          mode: 'smooth',
        },
        {
          id: LANE_B,
          paramPath: 'fx1.other',
          points: [
            { time: 0, value: 0, curve: 0 },
            { time: 1, value: 0.25, curve: 0 },
            { time: 2, value: 0.5, curve: 0 },
            { time: 3, value: 0.75, curve: 0 },
            { time: 4, value: 1, curve: 0 },
          ],
          color: '#f59e0b',
          isVisible: true,
          mode: 'smooth',
        },
      ],
    } as never,
  })
}

beforeEach(() => {
  useAutomationStore.getState().resetAutomation()
  useTimelineStore.getState().reset()
  seedTwoLanes()
})

afterEach(() => {
  cleanup()
})

function renderLaneB() {
  const laneB = useAutomationStore.getState().lanes[TRACK_ID][1]
  return render(
    <AutomationLane lane={laneB} trackId={TRACK_ID} zoom={100} scrollX={0} height={80} />,
  )
}

describe('AutomationLane — CURVE context menu (D8 Option A)', () => {
  it('right-click opens a menu with lane-context-curve-* test-ids for shape/simplify/clear', () => {
    const { container } = renderLaneB()
    fireEvent.contextMenu(container.querySelector('[data-testid="automation-lane"]')!)
    expect(container.querySelector('[data-testid="lane-context-curve-shape"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="lane-context-curve-simplify"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="lane-context-curve-clear"]')).toBeTruthy()
  })

  it('does NOT offer Flatten or Ramp (STOP — no laneId param on their store actions)', () => {
    const { container, queryByText } = renderLaneB()
    fireEvent.contextMenu(container.querySelector('[data-testid="automation-lane"]')!)
    expect(queryByText('Flatten')).toBeNull()
    expect(queryByText('Ramp')).toBeNull()
  })

  it('Simplify parity — fires simplifyLane with THIS lane\'s id, leaves the other lane untouched', () => {
    const { container } = renderLaneB()
    fireEvent.contextMenu(container.querySelector('[data-testid="automation-lane"]')!)
    fireEvent.click(container.querySelector('[data-testid="lane-context-curve-simplify"]')!)

    const lanes = useAutomationStore.getState().lanes[TRACK_ID]
    const laneA = lanes.find((l) => l.id === LANE_A)!
    const laneB = lanes.find((l) => l.id === LANE_B)!
    // 5 collinear points on lane B → RDP reduces it; lane A is untouched.
    expect(laneB.points.length).toBeLessThan(5)
    expect(laneA.points).toHaveLength(5)
  })

  it('Clear parity — fires clearLane with THIS lane\'s id, leaves the other lane untouched', () => {
    const { container } = renderLaneB()
    fireEvent.contextMenu(container.querySelector('[data-testid="automation-lane"]')!)
    fireEvent.click(container.querySelector('[data-testid="lane-context-curve-clear"]')!)

    const lanes = useAutomationStore.getState().lanes[TRACK_ID]
    const laneA = lanes.find((l) => l.id === LANE_A)!
    const laneB = lanes.find((l) => l.id === LANE_B)!
    expect(laneB.points).toHaveLength(0)
    expect(laneA.points).toHaveLength(5)
  })

  it('Shape… parity — opens a popover; Insert fires insertShapeIntoLane targeting THIS lane only (AA.3a coverage relocated from the old toolbar picker)', async () => {
    const { useUndoStore } = await import('../../renderer/stores/undo')
    useUndoStore.getState().clear()

    const { container } = renderLaneB()
    fireEvent.contextMenu(container.querySelector('[data-testid="automation-lane"]')!)
    fireEvent.click(container.querySelector('[data-testid="lane-context-curve-shape"]')!)
    expect(container.querySelector('[data-testid="lane-shape-popover"]')).toBeTruthy()

    // Configure square wave — same functional-correctness check the old
    // toolbar picker test used (square alternates between exactly 2 levels).
    const select = container.querySelector('[data-testid="lane-shape-kind-select"]') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'square' } })

    const before = useUndoStore.getState().past.length
    fireEvent.click(container.querySelector('[data-testid="lane-shape-insert-btn"]')!)

    const lanes = useAutomationStore.getState().lanes[TRACK_ID]
    const laneA = lanes.find((l) => l.id === LANE_A)!
    const laneB = lanes.find((l) => l.id === LANE_B)!
    // Lane A (not right-clicked) is completely untouched.
    expect(laneA.points).toHaveLength(5)
    // Lane B got the square shape: alternates between exactly 2 levels.
    const uniq = new Set(laneB.points.map((p) => Math.round(p.value * 1000) / 1000))
    expect(uniq.size).toBeLessThanOrEqual(2)
    expect(container.querySelector('[data-testid="lane-shape-popover"]')).toBeNull()
    // Same undo-step discipline as the relocated toolbar picker: ONE step.
    expect(useUndoStore.getState().past.length).toBe(before + 1)
  })

  it('Shape… Cancel closes the popover without mutating the lane', () => {
    const { container } = renderLaneB()
    fireEvent.contextMenu(container.querySelector('[data-testid="automation-lane"]')!)
    fireEvent.click(container.querySelector('[data-testid="lane-context-curve-shape"]')!)
    fireEvent.click(container.querySelector('[data-testid="lane-shape-cancel-btn"]')!)

    expect(container.querySelector('[data-testid="lane-shape-popover"]')).toBeNull()
    const laneB = useAutomationStore.getState().lanes[TRACK_ID].find((l) => l.id === LANE_B)!
    expect(laneB.points).toHaveLength(5)
  })

  it('Shape… is absent for trigger lanes (mirrors the old toolbar\'s shapeTargetLanes filter)', () => {
    useAutomationStore.setState({
      lanes: {
        [TRACK_ID]: [
          {
            id: LANE_B,
            paramPath: 'fx1.trig',
            points: [{ time: 0, value: 1, curve: 0 }],
            color: '#ef4444',
            isVisible: true,
            mode: 'gate',
          },
        ],
      } as never,
    })
    const laneB = useAutomationStore.getState().lanes[TRACK_ID][0]
    const { container } = render(
      <AutomationLane lane={laneB} trackId={TRACK_ID} zoom={100} scrollX={0} height={80} />,
    )
    fireEvent.contextMenu(container.querySelector('[data-testid="trigger-lane"]')!)
    expect(container.querySelector('[data-testid="lane-context-curve-shape"]')).toBeNull()
    // Simplify/Clear still apply to trigger lanes (unchanged from the old
    // toolbar's armed-track-wide loop, which didn't special-case trigger lanes).
    expect(container.querySelector('[data-testid="lane-context-curve-simplify"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="lane-context-curve-clear"]')).toBeTruthy()
  })

  it('right-click does not bubble into handleSvgClick and add a spurious point', () => {
    const { container } = renderLaneB()
    const before = useAutomationStore.getState().lanes[TRACK_ID][1].points.length
    fireEvent.contextMenu(container.querySelector('[data-testid="automation-lane"]')!)
    const after = useAutomationStore.getState().lanes[TRACK_ID][1].points.length
    expect(after).toBe(before)
  })
})
