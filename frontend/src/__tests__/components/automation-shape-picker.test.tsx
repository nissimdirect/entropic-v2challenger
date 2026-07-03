/**
 * AA.3a — Insert Automation Shape UI wiring (AutomationToolbar's "Shape" button).
 *
 * Confirms: disabled with no armed track, opens/closes the picker, lists only
 * non-trigger lanes as insert targets, and clicking a lane target calls
 * insertShapeIntoLane with the configured shape/cycles/amplitude and closes
 * the picker (Gate 14 wiring check: callback -> store mutation -> re-render).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'

const mockEntropic = {
  sendCommand: vi.fn().mockResolvedValue({ ok: true }),
  onEngineStatus: vi.fn(),
}
;(globalThis as unknown as { window: unknown }).window = { entropic: mockEntropic }

import AutomationToolbar from '../../renderer/components/automation/AutomationToolbar'
import { useAutomationStore } from '../../renderer/stores/automation'
import { useTimelineStore } from '../../renderer/stores/timeline'

beforeEach(() => {
  useAutomationStore.getState().resetAutomation()
  useTimelineStore.getState().reset()
})

afterEach(() => {
  cleanup()
})

function armATrack() {
  useTimelineStore.getState().addTrack('Track A', '#ff0000')
  const t = useTimelineStore.getState().tracks[0]
  useAutomationStore.setState({ armedTrackId: t.id })
  return t
}

describe('AutomationToolbar — Insert Automation Shape (AA.3a)', () => {
  it('the Shape button is disabled when no track is armed', () => {
    const { container } = render(<AutomationToolbar />)
    const btn = container.querySelector('[data-testid="insert-shape-btn"]') as HTMLButtonElement
    expect(btn).toBeTruthy()
    expect(btn.disabled).toBe(true)
  })

  it('clicking Shape opens the picker; clicking again closes it', () => {
    armATrack()
    const { container } = render(<AutomationToolbar />)
    const btn = container.querySelector('[data-testid="insert-shape-btn"]') as HTMLElement
    fireEvent.click(btn)
    expect(container.querySelector('[data-testid="shape-picker"]')).toBeTruthy()
    fireEvent.click(btn)
    expect(container.querySelector('[data-testid="shape-picker"]')).toBeNull()
  })

  it('lists only non-trigger lanes on the armed track as insert targets', () => {
    const t = armATrack()
    useAutomationStore.getState().addLane(t.id, 'fx-1', 'amount', '#4ade80')
    useAutomationStore.getState().addTriggerLane(t.id, 'fx-1', 'gate', '#ef4444', 'gate')
    const { container } = render(<AutomationToolbar />)
    fireEvent.click(container.querySelector('[data-testid="insert-shape-btn"]') as HTMLElement)
    const items = container.querySelectorAll('[data-testid="shape-picker"] .auto-toolbar__picker-item')
    expect(items).toHaveLength(1) // only the continuous lane, not the trigger lane
  })

  it('shows the empty hint when the armed track has no lanes', () => {
    armATrack()
    const { container, getByText } = render(<AutomationToolbar />)
    fireEvent.click(container.querySelector('[data-testid="insert-shape-btn"]') as HTMLElement)
    expect(getByText(/No automation lanes/i)).toBeTruthy()
  })

  it('clicking a lane target bakes the configured shape into that lane and closes the picker', () => {
    const t = armATrack()
    useAutomationStore.getState().addLane(t.id, 'fx-1', 'amount', '#4ade80')
    const laneId = useAutomationStore.getState().lanes[t.id][0].id

    const { container } = render(<AutomationToolbar />)
    fireEvent.click(container.querySelector('[data-testid="insert-shape-btn"]') as HTMLElement)

    const select = container.querySelector('[data-testid="shape-kind-select"]') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'square' } })
    const cyclesInput = container.querySelector('[data-testid="shape-cycles-input"]') as HTMLInputElement
    fireEvent.change(cyclesInput, { target: { value: '3' } })

    const target = container.querySelector(`[data-testid="insert-shape-target-${laneId}"]`) as HTMLElement
    expect(target).toBeTruthy()
    fireEvent.click(target)

    const lane = useAutomationStore.getState().lanes[t.id].find((l) => l.id === laneId)!
    expect(lane.points.length).toBeGreaterThan(0)
    // Square wave alternates between exactly two levels.
    const uniq = new Set(lane.points.map((p) => Math.round(p.value * 1000) / 1000))
    expect(uniq.size).toBeLessThanOrEqual(2)

    expect(container.querySelector('[data-testid="shape-picker"]')).toBeNull() // closed after insert
  })

  it('insert is exactly ONE undo step', async () => {
    const { useUndoStore } = await import('../../renderer/stores/undo')
    useUndoStore.getState().clear()
    const t = armATrack()
    useAutomationStore.getState().addLane(t.id, 'fx-1', 'amount', '#4ade80')
    const laneId = useAutomationStore.getState().lanes[t.id][0].id

    const { container } = render(<AutomationToolbar />)
    fireEvent.click(container.querySelector('[data-testid="insert-shape-btn"]') as HTMLElement)
    const before = useUndoStore.getState().past.length
    fireEvent.click(container.querySelector(`[data-testid="insert-shape-target-${laneId}"]`) as HTMLElement)
    expect(useUndoStore.getState().past.length).toBe(before + 1)
  })
})
