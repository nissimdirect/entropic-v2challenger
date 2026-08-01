/**
 * P1.3 (W15b gate-fix packet, item 3) — REAL COMPONENT test for the marquee
 * drag gesture.
 *
 * marquee-overlay.test.ts's PK.A4 section re-implements MarqueeOverlay's
 * math inline and never mounts the component — a broken MarqueeOverlay
 * (wrong prop wiring, a handler that never fires, a missing testid) would
 * still pass every one of those tests. This file mounts the REAL
 * MarqueeOverlay and drives it with fireEvent.pointerDown/Move/Up so a
 * regression in the actual component fails a test.
 *
 * DOM structure mirrors Track.tsx's TrackLane exactly: a single ref'd
 * container div holds MarqueeOverlay and the track's clips as SIBLINGS
 * (not MarqueeOverlay wrapping the clips) — see Track.tsx:685-712. That
 * sibling relationship is why MarqueeOverlay.handlePointerDown's own
 * `closest('.clip')` guard is "belt-and-suspenders" per its comment: a
 * pointerdown that lands on a clip (topmost via z-index) never bubbles
 * into the overlay's own handler in the first place, since the overlay is
 * not an ancestor of the clip. Case 2 below exercises exactly that real
 * structure rather than re-testing the guard predicate in isolation.
 */
import { useRef } from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { setupMockEntropic, teardownMockEntropic } from '../../helpers/mock-entropic'

// happy-dom does not implement the PointerEvent capture methods (verified —
// see t1-cursor-tool-wires.test.tsx's header comment). MarqueeOverlay's
// handlePointerDown calls `(e.currentTarget as HTMLElement).setPointerCapture(...)`
// unconditionally (unlike e.g. MaskSelectOverlay's optional-chained call), so
// firing a real pointerdown throws without this polyfill.
if (typeof (HTMLElement.prototype as any).setPointerCapture !== 'function') {
  ;(HTMLElement.prototype as any).setPointerCapture = () => {}
  ;(HTMLElement.prototype as any).releasePointerCapture = () => {}
  ;(HTMLElement.prototype as any).hasPointerCapture = () => false
}

import MarqueeOverlay from '../../../renderer/components/timeline/MarqueeOverlay'
import { useTimelineStore } from '../../../renderer/stores/timeline'
import { useLayoutStore } from '../../../renderer/stores/layout'
import { useProjectStore } from '../../../renderer/stores/project'

/** Stub a fixed getBoundingClientRect (happy-dom default is all-zero). */
function stubRect(el: HTMLElement, left: number, width: number): void {
  el.getBoundingClientRect = () =>
    ({
      left, top: 0, right: left + width, bottom: 60,
      width, height: 60, x: left, y: 0, toJSON: () => ({}),
    }) as DOMRect
}

/** Mirrors Track.tsx's TrackLane: containerRef div holds MarqueeOverlay and
 *  (optionally) a mock clip as SIBLINGS, matching the real DOM shape. */
function Harness({ trackId, zoom, scrollX, withClip }: { trackId: string; zoom: number; scrollX: number; withClip?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null)
  return (
    <div ref={containerRef} data-testid="lane-container" style={{ position: 'relative' }}>
      <MarqueeOverlay zoom={zoom} scrollX={scrollX} trackId={trackId} containerRef={containerRef} />
      {withClip && (
        <div className="clip" data-testid="mock-clip" style={{ position: 'absolute', left: 0, width: 100, height: 60 }} />
      )}
    </div>
  )
}

function resetStores() {
  useTimelineStore.getState().reset()
  useLayoutStore.setState({ quantizeEnabled: false, quantizeDivision: 4 })
  useProjectStore.setState({ bpm: 120, effectiveBpm: 120 })
}

beforeEach(() => {
  setupMockEntropic()
  resetStores()
})
afterEach(() => {
  cleanup()
  resetStores()
  teardownMockEntropic()
})

describe('MarqueeOverlay — real component drag gesture (DOM-level oracle)', () => {
  it('pointerdown -> move -> up over the lane background renders the selection-region-band with correct left/width and commits selectionRegion to the store', () => {
    const trackId = useTimelineStore.getState().addTrack('T', '#4ade80') as string
    const zoom = 50

    const { container, getByTestId } = render(<Harness trackId={trackId} zoom={zoom} scrollX={0} />)
    const laneEl = getByTestId('lane-container')
    stubRect(laneEl, 0, 1000)
    const overlayEl = container.querySelector('.marquee-overlay') as HTMLElement
    expect(overlayEl).toBeTruthy()

    fireEvent.pointerDown(overlayEl, { clientX: 100, clientY: 10, button: 0, pointerId: 1 })
    fireEvent.pointerMove(overlayEl, { clientX: 400, clientY: 10, pointerId: 1 })
    fireEvent.pointerUp(overlayEl, { clientX: 400, clientY: 10, pointerId: 1 })

    // 100px..400px at zoom 50 -> 2s..8s (quantize off, no snap)
    const region = useTimelineStore.getState().selectionRegion
    expect(region).not.toBeNull()
    expect(region!.in).toBeCloseTo(2, 5)
    expect(region!.out).toBeCloseTo(8, 5)

    const band = getByTestId('selection-region-band') as HTMLElement
    expect(band).toBeTruthy()
    expect(band.style.left).toBe('100px') // region.in(2) * zoom(50) - scrollX(0)
    expect(band.style.width).toBe('300px') // (region.out(8) - region.in(2)) * zoom(50)
  })

  it('pointer sequence starting over a mocked clip does NOT create a selectionRegion', () => {
    const trackId = useTimelineStore.getState().addTrack('T', '#4ade80') as string
    const zoom = 50

    const { container, getByTestId, queryByTestId } = render(
      <Harness trackId={trackId} zoom={zoom} scrollX={0} withClip />,
    )
    const laneEl = getByTestId('lane-container')
    stubRect(laneEl, 0, 1000)
    const overlayEl = container.querySelector('.marquee-overlay') as HTMLElement
    const clipEl = getByTestId('mock-clip') as HTMLElement

    // Real hit-testing: the clip sits on top (z-index) at this pixel, so the
    // browser dispatches pointerdown to the clip, not the overlay — and
    // since the overlay is a SIBLING (not an ancestor) of the clip, that
    // event never bubbles into MarqueeOverlay.handlePointerDown at all.
    fireEvent.pointerDown(clipEl, { clientX: 50, clientY: 10, button: 0, pointerId: 1 })
    fireEvent.pointerMove(overlayEl, { clientX: 400, clientY: 10, pointerId: 1 })
    fireEvent.pointerUp(overlayEl, { clientX: 400, clientY: 10, pointerId: 1 })

    expect(useTimelineStore.getState().selectionRegion).toBeNull()
    expect(queryByTestId('selection-region-band')).toBeNull()
  })

  it('P2.4: a drag that clears the 2px floor but snaps in/out to the SAME grid line commits no region (not a zero-width one)', () => {
    const trackId = useTimelineStore.getState().addTrack('T', '#4ade80') as string
    // zoom=1, bpm=120: even the coarsest '4bar' candidate (8s interval) is
    // under the 10px floor at this zoom, so selectQuantizeGridLevel falls
    // back to it anyway (grid must never vanish) — interval = 8s = 8px here.
    // 100px and 103px (dx=3, clears the floor) both round to the 104s line.
    const zoom = 1
    useLayoutStore.setState({ quantizeEnabled: true, quantizeDivision: 4 })

    const { container, getByTestId, queryByTestId } = render(<Harness trackId={trackId} zoom={zoom} scrollX={0} />)
    const laneEl = getByTestId('lane-container')
    stubRect(laneEl, 0, 1000)
    const overlayEl = container.querySelector('.marquee-overlay') as HTMLElement

    fireEvent.pointerDown(overlayEl, { clientX: 100, clientY: 10, button: 0, pointerId: 1 })
    fireEvent.pointerMove(overlayEl, { clientX: 103, clientY: 10, pointerId: 1 })
    fireEvent.pointerUp(overlayEl, { clientX: 103, clientY: 10, pointerId: 1 })

    // Not a {in:104, out:104} phantom region — a real clear.
    expect(useTimelineStore.getState().selectionRegion).toBeNull()
    expect(queryByTestId('selection-region-band')).toBeNull()
  })

  it('P3.13a: a pointermove that snaps to the SAME range as the current selectionRegion does not write a new object to the store', () => {
    const trackId = useTimelineStore.getState().addTrack('T', '#4ade80') as string
    const zoom = 50
    const { container, getByTestId } = render(<Harness trackId={trackId} zoom={zoom} scrollX={0} />)
    const laneEl = getByTestId('lane-container')
    stubRect(laneEl, 0, 1000)
    const overlayEl = container.querySelector('.marquee-overlay') as HTMLElement

    fireEvent.pointerDown(overlayEl, { clientX: 100, clientY: 10, button: 0, pointerId: 1 })
    fireEvent.pointerMove(overlayEl, { clientX: 400, clientY: 10, pointerId: 1 })
    const regionAfterFirstMove = useTimelineStore.getState().selectionRegion
    expect(regionAfterFirstMove).not.toBeNull()

    // Same clientX (quantize off -> identical snapped range) — a second,
    // redundant pointermove (e.g. sub-pixel mouse jitter with the same
    // rounded position) must NOT call setSelectionRegion again. If it did,
    // the store would hold a NEW (deep-equal but not reference-equal)
    // object, since setSelectionRegion always does `set({selectionRegion:
    // region})` with a freshly-built object.
    fireEvent.pointerMove(overlayEl, { clientX: 400, clientY: 11, pointerId: 1 })
    const regionAfterSecondMove = useTimelineStore.getState().selectionRegion
    expect(regionAfterSecondMove).toBe(regionAfterFirstMove)
  })

  it('P3.13d: unmounting mid-drag before the click-suppressor fires removes the window click listener (no leak)', () => {
    const trackId = useTimelineStore.getState().addTrack('T', '#4ade80') as string
    const zoom = 50
    const { container, getByTestId, unmount } = render(<Harness trackId={trackId} zoom={zoom} scrollX={0} />)
    const laneEl = getByTestId('lane-container')
    stubRect(laneEl, 0, 1000)
    const overlayEl = container.querySelector('.marquee-overlay') as HTMLElement

    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')

    fireEvent.pointerDown(overlayEl, { clientX: 100, clientY: 10, button: 0, pointerId: 1 })
    // dx >= 2 -> handlePointerUp registers the {capture,once} click-suppressor.
    fireEvent.pointerUp(overlayEl, { clientX: 400, clientY: 10, pointerId: 1 })

    const clickAddCall = addSpy.mock.calls.find(([type]) => type === 'click')
    expect(clickAddCall, 'expected a window click listener to be registered').toBeTruthy()
    const suppressorFn = clickAddCall![1]

    // Unmount BEFORE the suppressor's one-shot click ever fires.
    unmount()

    expect(removeSpy).toHaveBeenCalledWith('click', suppressorFn, { capture: true })

    addSpy.mockRestore()
    removeSpy.mockRestore()
  })
})
