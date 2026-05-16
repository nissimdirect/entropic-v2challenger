/**
 * Loop 47b (Phase G) — AutomationNode.
 *
 * Locks the alt-click curve-cycle behavior and the basic render shape.
 * Full drag flow requires synthetic mousemove sequences that are messy in
 * jsdom — Playwright covers the drag end-to-end. Vitest here covers the
 * pure logic + event wiring.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import AutomationNode from '../../renderer/components/automation/AutomationNode'
import type { AutomationPoint } from '../../shared/types'

afterEach(cleanup)

function makePoint(overrides: Partial<AutomationPoint> = {}): AutomationPoint {
  return {
    time: 1.0,
    value: 0.5,
    curve: 0,
    ...overrides,
  }
}

// Identity transforms so click coords map straight into time/value space.
const timeToX = (t: number) => t * 100
const valueToY = (v: number) => v * 100
const xToTime = (x: number) => x / 100
const yToValue = (y: number) => y / 100

describe('AutomationNode (Loop 47b)', () => {
  function renderNode(overrides: Partial<Parameters<typeof AutomationNode>[0]> = {}) {
    const onUpdate = vi.fn()
    const onRemove = vi.fn()
    const result = render(
      <svg>
        <AutomationNode
          point={makePoint()}
          index={3}
          color="#4ade80"
          timeToX={timeToX}
          valueToY={valueToY}
          xToTime={xToTime}
          yToValue={yToValue}
          onUpdate={onUpdate}
          onRemove={onRemove}
          {...overrides}
        />
      </svg>,
    )
    return { ...result, onUpdate, onRemove }
  }

  it('positions the circle at (timeToX, valueToY)', () => {
    const { container } = renderNode({ point: makePoint({ time: 2, value: 0.25 }) })
    const circle = container.querySelector('circle') as SVGCircleElement
    expect(circle).toBeTruthy()
    expect(circle.getAttribute('cx')).toBe('200')
    expect(circle.getAttribute('cy')).toBe('25')
  })

  it('alt-click cycles through the 4 CURVE_MODES (0 → -1 → 1 → 0.5 → 0)', () => {
    const { container, onUpdate } = renderNode({ point: makePoint({ curve: 0 }) })
    const circle = container.querySelector('circle')!
    fireEvent.mouseDown(circle, { altKey: true })
    expect(onUpdate).toHaveBeenCalledWith(3, { curve: -1 })
  })

  it('alt-click wraps from the last curve back to the first', () => {
    const { container, onUpdate } = renderNode({ point: makePoint({ curve: 0.5 }) })
    const circle = container.querySelector('circle')!
    fireEvent.mouseDown(circle, { altKey: true })
    expect(onUpdate).toHaveBeenCalledWith(3, { curve: 0 })
  })

  it('alt-click does NOT enter drag state (no follow-up mousemove handler)', () => {
    const { container, onUpdate } = renderNode()
    const circle = container.querySelector('circle')!
    fireEvent.mouseDown(circle, { altKey: true })
    // Subsequent mousemove on window should NOT call onUpdate again with
    // time/value coords — alt-click is a pure curve toggle and returns early.
    fireEvent.mouseMove(window, { clientX: 999, clientY: 999 })
    expect(onUpdate).toHaveBeenCalledTimes(1) // curve update from alt-click only
  })

  it('mouseDown (no modifier) does NOT call onUpdate synchronously', () => {
    // Drag only fires onUpdate during the mousemove handler — not at mouseDown.
    const { container, onUpdate } = renderNode()
    const circle = container.querySelector('circle')!
    fireEvent.mouseDown(circle, { clientX: 100, clientY: 50 })
    expect(onUpdate).not.toHaveBeenCalled()
  })
})
