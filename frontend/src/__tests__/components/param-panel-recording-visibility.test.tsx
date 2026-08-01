/**
 * PK.C1 curve-visibility contract (RATIFIED-FOUNDATIONS.md D13, W1.5b C2 mock
 * ruling): recording automation must NEVER write to an invisible lane —
 * a Touch/Latch pass auto-reveals the armed track's lane the moment it
 * starts writing (ParamPanel.tsx's handleKnobChange).
 *
 * Oracle: recording onto a collapsed (isVisible: false) lane reveals it;
 * an already-visible lane is left unchanged (no redundant store write).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import type { EffectInfo, EffectInstance } from '../../shared/types'

const mockEntropic = {
  sendCommand: vi.fn().mockResolvedValue({ ok: true }),
  onEngineStatus: vi.fn(),
}
;(globalThis as unknown as { window: unknown }).window = { entropic: mockEntropic }

import ParamPanel from '../../renderer/components/effects/ParamPanel'
import { useAutomationStore } from '../../renderer/stores/automation'
import { useTimelineStore } from '../../renderer/stores/timeline'

// happy-dom does not implement the PointerEvent capture methods (see
// marquee-overlay-component.test.tsx's header comment for the prior art).
// Knob.tsx's handlePointerDown calls `(e.target as HTMLElement).setPointerCapture(...)`
// unconditionally on its `<svg>` root — an SVGElement, NOT an HTMLElement —
// so firing a real pointerdown (this file's Add-mode pass-boundary tests)
// throws without patching SVGElement.prototype too.
for (const proto of [HTMLElement.prototype, SVGElement.prototype] as const) {
  if (typeof (proto as any).setPointerCapture !== 'function') {
    ;(proto as any).setPointerCapture = () => {}
    ;(proto as any).releasePointerCapture = () => {}
    ;(proto as any).hasPointerCapture = () => false
  }
}

const mockEffectInfo: EffectInfo = {
  id: 'fx.vhs',
  name: 'VHS',
  category: 'fx',
  params: {
    tracking: {
      type: 'float', min: 0, max: 1, default: 0.5,
      label: 'Tracking', curve: 'linear', unit: '%',
    },
  },
}

const mockEffect: EffectInstance = {
  id: 'inst-1',
  effectId: 'fx.vhs',
  isEnabled: true,
  isFrozen: false,
  parameters: { tracking: 0.5 },
  modulations: {},
  mix: 1.0,
  mask: null,
}

function armTrackWithLane(isVisible: boolean) {
  useTimelineStore.getState().addTrack('Track A', '#ff0000')
  const trackId = useTimelineStore.getState().tracks[0].id
  useAutomationStore.setState({ armedTrackId: trackId, mode: 'touch' })
  useAutomationStore.getState().addLane(trackId, 'inst-1', 'tracking', '#4ade80')
  const laneId = useAutomationStore.getState().lanes[trackId][0].id
  if (!isVisible) {
    useAutomationStore.getState().setLaneVisible(trackId, laneId, false)
  }
  return { trackId, laneId }
}

function renderKnob() {
  const { container } = render(
    <ParamPanel
      effect={mockEffect}
      effectInfo={mockEffectInfo}
      onUpdateParam={vi.fn()}
      onSetMix={vi.fn()}
    />,
  )
  const slider = container.querySelector('[role="slider"][aria-label="Tracking"]') as HTMLElement
  expect(slider).toBeTruthy()
  return slider
}

beforeEach(() => {
  useAutomationStore.getState().resetAutomation()
  useTimelineStore.getState().reset()
})

afterEach(() => {
  cleanup()
})

describe('ParamPanel — curve-visibility contract (PK.C1 / D13)', () => {
  it('Touch-mode recording onto a collapsed lane reveals it', () => {
    const { trackId, laneId } = armTrackWithLane(false)
    expect(useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!.isVisible).toBe(false)

    const slider = renderKnob()
    fireEvent.keyDown(slider, { key: 'ArrowUp' })

    const lane = useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!
    expect(lane.isVisible).toBe(true)
    // The write itself still happened — this isn't just a visibility no-op.
    expect(lane.points.length).toBeGreaterThan(0)
  })

  it('Latch-mode recording onto a collapsed lane reveals it', () => {
    const { trackId, laneId } = armTrackWithLane(false)
    useAutomationStore.setState({ mode: 'latch' })

    const slider = renderKnob()
    fireEvent.keyDown(slider, { key: 'ArrowUp' })

    expect(useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!.isVisible).toBe(true)
  })

  it('an already-visible lane is left unchanged by recording', () => {
    const { trackId, laneId } = armTrackWithLane(true)
    const before = useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!
    expect(before.isVisible).toBe(true)

    const slider = renderKnob()
    fireEvent.keyDown(slider, { key: 'ArrowUp' })

    const after = useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!
    expect(after.isVisible).toBe(true)
    expect(after.points.length).toBeGreaterThan(0)
  })

  it('Read mode does not write and does not reveal a collapsed lane', () => {
    const { trackId, laneId } = armTrackWithLane(false)
    useAutomationStore.setState({ mode: 'read' })

    const slider = renderKnob()
    fireEvent.keyDown(slider, { key: 'ArrowUp' })

    const lane = useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!
    expect(lane.isVisible).toBe(false)
    expect(lane.points.length).toBe(0)
  })
})

// D13.1 (PK.C2) — Add mode via a real ParamPanel knob: a Touch-mode pass
// writes into a fresh add-mode lane (not the pre-existing lane), and a
// pointer release ends the pass so the NEXT drag starts a second take.
describe('ParamPanel — Add mode (D13.1)', () => {
  it('Touch-mode recording under recordMode "add_lane" creates a new lane, leaving the existing one untouched', () => {
    const { trackId, laneId: existingLaneId } = armTrackWithLane(true)
    useAutomationStore.setState({ recordMode: 'add_lane' })

    const slider = renderKnob()
    fireEvent.keyDown(slider, { key: 'ArrowUp' })

    const lanes = useAutomationStore.getState().lanes[trackId]
    expect(lanes).toHaveLength(2)
    const existing = lanes.find((l) => l.id === existingLaneId)!
    expect(existing.points).toHaveLength(0) // untouched
    const addLane = lanes.find((l) => l.id !== existingLaneId)!
    expect(addLane.blendOp).toBe('add')
    expect(addLane.points.length).toBeGreaterThan(0)
  })

  it('a pointer drag release ends the pass — a second drag starts a second lane', () => {
    const { trackId } = armTrackWithLane(true)
    useAutomationStore.setState({ recordMode: 'add_lane' })
    const slider = renderKnob()

    fireEvent.pointerDown(slider, { clientY: 100 })
    fireEvent.pointerMove(slider, { clientY: 90 })
    fireEvent.pointerUp(slider)
    const afterFirstPass = useAutomationStore.getState().lanes[trackId].length

    fireEvent.pointerDown(slider, { clientY: 100 })
    fireEvent.pointerMove(slider, { clientY: 80 })
    fireEvent.pointerUp(slider)
    const afterSecondPass = useAutomationStore.getState().lanes[trackId].length

    expect(afterSecondPass).toBe(afterFirstPass + 1)
  })
})
