/**
 * Loop 47b (Phase G) — AutomationNode.
 *
 * Locks the alt-click curve-cycle behavior and the basic render shape.
 * Full drag flow requires synthetic mousemove sequences that are messy in
 * jsdom — Playwright covers the drag end-to-end. Vitest here covers the
 * pure logic + event wiring.
 *
 * PUX.5 additions: hit-ring presence, 24px effective target radius tests,
 * and the destructive-miss guard (no node creation on existing-node click).
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
    // The component renders two circles: [0] visual glyph, [1] hit ring.
    // All interactive event handlers live on the hit ring (last = topmost in SVG).
    const circles = result.container.querySelectorAll('circle')
    const visualCircle = circles[0] as SVGCircleElement
    const hitRing = circles[1] as SVGCircleElement
    return { ...result, onUpdate, onRemove, visualCircle, hitRing }
  }

  it('positions the circle at (timeToX, valueToY)', () => {
    const { visualCircle } = renderNode({ point: makePoint({ time: 2, value: 0.25 }) })
    expect(visualCircle).toBeTruthy()
    expect(visualCircle.getAttribute('cx')).toBe('200')
    expect(visualCircle.getAttribute('cy')).toBe('25')
  })

  // ── AA.1 — Alt+drag continuous tension, alt-click cycle fallback, alt+dblclick reset ──

  it('alt-click (mousedown+mouseup, no movement) cycles through the 4 CURVE_MODES (0 → -1 → 1 → 0.5 → 0)', () => {
    const { hitRing, onUpdate } = renderNode({ point: makePoint({ curve: 0 }) })
    fireEvent.mouseDown(hitRing, { altKey: true, clientX: 100, clientY: 50 })
    expect(onUpdate).not.toHaveBeenCalled() // cycle fires on mouseup, not mousedown
    fireEvent.mouseUp(window, { clientX: 100, clientY: 50 })
    expect(onUpdate).toHaveBeenCalledWith(3, { curve: -1 })
  })

  it('alt-click wraps from the last curve back to the first', () => {
    const { hitRing, onUpdate } = renderNode({ point: makePoint({ curve: 0.5 }) })
    fireEvent.mouseDown(hitRing, { altKey: true, clientX: 100, clientY: 50 })
    fireEvent.mouseUp(window, { clientX: 100, clientY: 50 })
    expect(onUpdate).toHaveBeenCalledWith(3, { curve: 0 })
  })

  it('alt-drag past the threshold continuously adjusts curve tension instead of cycling', () => {
    const { hitRing, onUpdate } = renderNode({ point: makePoint({ curve: 0 }) })
    fireEvent.mouseDown(hitRing, { altKey: true, clientX: 100, clientY: 50 })
    // Drag up (negative dy) 50px -> tension should increase toward +0.5, clamped to [-1,1].
    fireEvent.mouseMove(window, { clientX: 100, clientY: 0 })
    expect(onUpdate).toHaveBeenCalledTimes(1)
    const [, updatePayload] = onUpdate.mock.calls[0]
    expect(updatePayload.curve).toBeCloseTo(0.5)
    expect(updatePayload.curve).toBeGreaterThanOrEqual(-1)
    expect(updatePayload.curve).toBeLessThanOrEqual(1)
    fireEvent.mouseUp(window, { clientX: 100, clientY: 0 })
  })

  it('alt-drag clamps tension to [-1, 1] on large movement', () => {
    const { hitRing, onUpdate } = renderNode({ point: makePoint({ curve: 0 }) })
    fireEvent.mouseDown(hitRing, { altKey: true, clientX: 100, clientY: 50 })
    fireEvent.mouseMove(window, { clientX: 100, clientY: -500 }) // huge drag up
    const last = onUpdate.mock.calls[onUpdate.mock.calls.length - 1][1]
    expect(last.curve).toBe(1)
    fireEvent.mouseUp(window, { clientX: 100, clientY: -500 })
  })

  it('alt-double-click resets curve to 0', () => {
    const { hitRing, onUpdate } = renderNode({ point: makePoint({ curve: 1 }) })
    fireEvent.doubleClick(hitRing, { altKey: true })
    expect(onUpdate).toHaveBeenCalledWith(3, { curve: 0 })
  })

  it('double-click WITHOUT alt does not reset curve', () => {
    const { hitRing, onUpdate } = renderNode({ point: makePoint({ curve: 1 }) })
    fireEvent.doubleClick(hitRing, { altKey: false })
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('mouseDown (no modifier) does NOT call onUpdate synchronously', () => {
    // Drag only fires onUpdate during the mousemove handler — not at mouseDown.
    const { hitRing, onUpdate } = renderNode()
    fireEvent.mouseDown(hitRing, { clientX: 100, clientY: 50 })
    expect(onUpdate).not.toHaveBeenCalled()
  })

  // ── PUX.5 — Hit-ring presence and 24px effective target ─────────────────────

  it('renders a transparent hit ring with r=12 behind the visual glyph', () => {
    // The hit ring must be the last circle (topmost in SVG z-order) and have r=12.
    // r=12 diameter=24 meets DESIGN-SPEC §4 floor + WCAG 2.5.8 minimum.
    const { hitRing, visualCircle } = renderNode()
    expect(hitRing).toBeTruthy()
    expect(hitRing.getAttribute('r')).toBe('12')
    // Hit ring shares the same cx/cy as the visual glyph.
    expect(hitRing.getAttribute('cx')).toBe(visualCircle.getAttribute('cx'))
    expect(hitRing.getAttribute('cy')).toBe(visualCircle.getAttribute('cy'))
    // Visual glyph has no pointer event handlers (delegated to hit ring).
    expect(visualCircle.getAttribute('style')).toContain('pointer-events: none')
  })

  it('starts a drag from a mouseDown on the hit ring (inside the 24px ring)', () => {
    // mouseDown on the hit ring at the node center starts the drag without
    // immediately calling onUpdate (drag fires on mousemove, not mousedown).
    const { hitRing, onUpdate } = renderNode()
    fireEvent.mouseDown(hitRing, { clientX: 100, clientY: 50 })
    // Not called yet — drag is initiated but move hasn't happened.
    expect(onUpdate).not.toHaveBeenCalled()
    // Now move: onUpdate should fire with the delta.
    fireEvent.mouseMove(window, { clientX: 110, clientY: 55 })
    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate).toHaveBeenCalledWith(3, expect.objectContaining({ time: expect.any(Number), value: expect.any(Number) }))
    fireEvent.mouseUp(window)
  })

  it('does not create a new node when a lane click lands inside an existing node hit ring', () => {
    // Destructive-miss scenario (§2.6): clicking on an existing node must NOT
    // propagate to the lane svg's React onClick handler (which calls addPoint).
    // The hit ring stops propagation via onClick={(e) => e.stopPropagation()}.
    //
    // jsdom note: fireEvent.click dispatches a native DOM event; React's synthetic
    // event system handles propagation independently. We verify the guard by
    // confirming the hit ring's onClick handler calls stopPropagation on the
    // React synthetic event — we do this by wrapping in a React parent with an
    // onClick spy and using @testing-library/react's userEvent or fireEvent on
    // the React tree. Here we verify the structural contract: the hit ring has
    // an onClick handler and the event target's propagationStopped reflects
    // React's intention.
    const svgClickSpy = vi.fn()
    const { container } = render(
      <svg onClick={svgClickSpy}>
        <AutomationNode
          point={makePoint()}
          index={3}
          color="#4ade80"
          timeToX={timeToX}
          valueToY={valueToY}
          xToTime={xToTime}
          yToValue={yToValue}
          onUpdate={vi.fn()}
          onRemove={vi.fn()}
        />
      </svg>,
    )
    const circles = container.querySelectorAll('circle')
    const hitRing = circles[circles.length - 1] as SVGCircleElement
    // React's synthetic event propagation IS stopped (fireEvent triggers React's
    // own event delegation at the root; stopPropagation on the synthetic event
    // prevents the parent's React handler from being called).
    fireEvent.click(hitRing)
    expect(svgClickSpy).not.toHaveBeenCalled()
  })

  // ── PUX.5 — Negative: outside-ring clicks reach the lane svg ────────────────

  it('does not start a drag from a mouseDown 14px from node center (outside the 12px ring)', () => {
    // A mouseDown on the lane background (outside hit ring) should NOT trigger
    // handleMouseDown on the node. We simulate this by firing directly on the
    // parent svg (not the hit ring) — the node's handler is never reached.
    const { container, onUpdate } = renderNode()
    const svg = container.querySelector('svg')!
    // Fire at a point far from center (identity: cx=100, cy=50; fire at 114, 50 = 14px away)
    fireEvent.mouseDown(svg, { clientX: 114, clientY: 50 })
    fireEvent.mouseMove(window, { clientX: 124, clientY: 60 })
    expect(onUpdate).not.toHaveBeenCalled()
    fireEvent.mouseUp(window)
  })
})
