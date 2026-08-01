/**
 * PK.C1 curve-visibility contract (RATIFIED-FOUNDATIONS.md D13, W1.5b C2 mock
 * ruling): recording automation must NEVER write to an invisible lane — a
 * lane-level draw pass auto-reveals the lane the moment a stroke starts
 * (AutomationDraw.tsx's handleMouseDown), mirroring ParamPanel.tsx's
 * touch/latch fix (see param-panel-recording-visibility.test.tsx).
 *
 * Companion fix: Track.tsx used to gate the draw overlay's mount on
 * `automationLanes[0].isVisible`, which meant a hidden lane could never be
 * drawn on at all (no overlay to catch the pointer) — that gate is removed
 * so drawing can start on a hidden lane and reveal it.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import AutomationDraw from '../../renderer/components/automation/AutomationDraw'
import { useAutomationStore } from '../../renderer/stores/automation'

beforeEach(() => {
  useAutomationStore.getState().resetAutomation()
})

afterEach(() => {
  cleanup()
})

function setupLane(isVisible: boolean) {
  const trackId = 'track-1'
  useAutomationStore.getState().addLane(trackId, 'fx1', 'amount', '#4ade80')
  const laneId = useAutomationStore.getState().lanes[trackId][0].id
  if (!isVisible) {
    useAutomationStore.getState().setLaneVisible(trackId, laneId, false)
  }
  useAutomationStore.setState({ mode: 'draw' })
  return { trackId, laneId }
}

describe('AutomationDraw — curve-visibility contract (PK.C1 / D13)', () => {
  it('starting a stroke on a collapsed lane reveals it', () => {
    const { trackId, laneId } = setupLane(false)
    expect(useAutomationStore.getState().lanes[trackId][0].isVisible).toBe(false)

    const { container } = render(
      <AutomationDraw trackId={trackId} laneId={laneId} zoom={1} scrollX={0} height={60} />,
    )
    const overlay = container.querySelector('.auto-draw') as HTMLElement
    expect(overlay).toBeTruthy()

    fireEvent.mouseDown(overlay, { clientX: 10, clientY: 10 })

    expect(
      useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!.isVisible,
    ).toBe(true)

    fireEvent.mouseUp(overlay)
  })

  it('starting a stroke on an already-visible lane leaves it unchanged', () => {
    const { trackId, laneId } = setupLane(true)

    const { container } = render(
      <AutomationDraw trackId={trackId} laneId={laneId} zoom={1} scrollX={0} height={60} />,
    )
    const overlay = container.querySelector('.auto-draw') as HTMLElement

    fireEvent.mouseDown(overlay, { clientX: 10, clientY: 10 })

    expect(
      useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!.isVisible,
    ).toBe(true)

    fireEvent.mouseUp(overlay)
  })
})
