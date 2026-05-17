/**
 * useTrackDragReorder — pointer-driven LIVE track reorder.
 *
 * Covers the contract: pointermove/up listen on `document` (so DOM reorders
 * by React don't break the drag), threshold gate distinguishes click from
 * drag, the source track moves in real time as the cursor crosses adjacent
 * track rects, the full drag collapses into one undo transaction, and
 * pointercancel aborts the transaction.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTimelineStore } from '../../renderer/stores/timeline'
import { useTrackDragStore } from '../../renderer/stores/trackDrag'
import { useUndoStore } from '../../renderer/stores/undo'
import { useTrackDragReorder } from '../../renderer/hooks/useTrackDragReorder'

interface FakeHeader {
  el: HTMLDivElement
}

function setupHeaders(
  trackIds: string[],
  rects: Array<{ top: number; bottom: number }>,
): FakeHeader[] {
  document.body.innerHTML = ''
  const headers: FakeHeader[] = []
  trackIds.forEach((id, idx) => {
    const r = rects[idx]
    const el = document.createElement('div')
    el.className = 'track-header'
    el.dataset.trackIdx = String(idx)
    el.dataset.trackId = id
    const rect = { top: r.top, bottom: r.bottom, left: 0, right: 200 }
    el.getBoundingClientRect = () => ({
      ...rect,
      x: rect.left,
      y: rect.top,
      width: rect.right - rect.left,
      height: rect.bottom - rect.top,
      toJSON() { return rect },
    })
    document.body.appendChild(el)
    headers.push({ el })
  })
  return headers
}

function syncFakeHeaders(rects: Array<{ top: number; bottom: number }>) {
  const tracks = useTimelineStore.getState().tracks
  setupHeaders(tracks.map((t) => t.id), rects)
}

function makePointerDown(clientY: number, button = 0): React.PointerEvent<HTMLDivElement> {
  const target = document.createElement('div')
  const currentTarget = document.createElement('div')
  return {
    button,
    clientY,
    clientX: 100,
    pointerId: 1,
    target,
    currentTarget,
  } as unknown as React.PointerEvent<HTMLDivElement>
}

function dispatchDocPointerMove(clientY: number, pointerId = 1) {
  // PointerEvent isn't fully implemented in jsdom; synthesize what the hook needs.
  const ev = new Event('pointermove') as Event & { pointerId: number; clientY: number; clientX: number }
  Object.defineProperty(ev, 'pointerId', { value: pointerId })
  Object.defineProperty(ev, 'clientY', { value: clientY })
  Object.defineProperty(ev, 'clientX', { value: 100 })
  document.dispatchEvent(ev)
}

function dispatchDocPointerUp(pointerId = 1) {
  const ev = new Event('pointerup') as Event & { pointerId: number }
  Object.defineProperty(ev, 'pointerId', { value: pointerId })
  document.dispatchEvent(ev)
}

function dispatchDocPointerCancel(pointerId = 1) {
  const ev = new Event('pointercancel') as Event & { pointerId: number }
  Object.defineProperty(ev, 'pointerId', { value: pointerId })
  document.dispatchEvent(ev)
}

const ROWS = [
  { top: 0, bottom: 30 },
  { top: 30, bottom: 60 },
  { top: 60, bottom: 90 },
]

beforeEach(() => {
  document.body.innerHTML = ''
  useTrackDragStore.getState().clearDrag()
  useUndoStore.getState().clear()
  useTimelineStore.setState({
    tracks: [
      { id: 't1', name: 'A', color: '#fff', clips: [], opacity: 1, blendMode: 'normal', isMuted: false, isSoloed: false, effectChain: [], automationLanes: [], type: 'video' as const },
      { id: 't2', name: 'B', color: '#fff', clips: [], opacity: 1, blendMode: 'normal', isMuted: false, isSoloed: false, effectChain: [], automationLanes: [], type: 'video' as const },
      { id: 't3', name: 'C', color: '#fff', clips: [], opacity: 1, blendMode: 'normal', isMuted: false, isSoloed: false, effectChain: [], automationLanes: [], type: 'video' as const },
    ],
  })
})

describe('useTrackDragReorder', () => {
  it('does not reorder when pointer moves below the drag threshold (click vs drag)', () => {
    setupHeaders(['t1', 't2', 't3'], ROWS)
    const { result } = renderHook(() => useTrackDragReorder({ trackId: 't1' }))

    act(() => result.current.onPointerDown(makePointerDown(10)))
    act(() => dispatchDocPointerMove(12))
    act(() => dispatchDocPointerUp())

    expect(useTimelineStore.getState().tracks.map((t) => t.id)).toEqual(['t1', 't2', 't3'])
  })

  it('reorders live as the cursor crosses each adjacent track', () => {
    setupHeaders(['t1', 't2', 't3'], ROWS)
    const { result } = renderHook(() => useTrackDragReorder({ trackId: 't1' }))

    act(() => result.current.onPointerDown(makePointerDown(10)))
    act(() => dispatchDocPointerMove(45))
    expect(useTimelineStore.getState().tracks.map((t) => t.id)).toEqual(['t2', 't1', 't3'])
    syncFakeHeaders(ROWS)

    act(() => dispatchDocPointerMove(75))
    expect(useTimelineStore.getState().tracks.map((t) => t.id)).toEqual(['t2', 't3', 't1'])

    act(() => dispatchDocPointerUp())
  })

  it('keeps firing reorders after the source has moved (no pointer-capture loss)', () => {
    // Regression: with setPointerCapture + React DOM reordering, subsequent
    // pointermoves routed to siblings, killing the drag after the first swap.
    setupHeaders(['t1', 't2', 't3'], ROWS)
    const { result } = renderHook(() => useTrackDragReorder({ trackId: 't1' }))

    act(() => result.current.onPointerDown(makePointerDown(10)))

    // Three consecutive crossings, each triggered while the source is at a
    // different index than the previous step.
    act(() => dispatchDocPointerMove(45))
    syncFakeHeaders(ROWS)
    act(() => dispatchDocPointerMove(75))
    syncFakeHeaders(ROWS)
    // Drag back up — source at idx 2 should swap with the middle (now t3).
    act(() => dispatchDocPointerMove(45))

    expect(useTimelineStore.getState().tracks.map((t) => t.id)).toEqual(['t2', 't1', 't3'])

    act(() => dispatchDocPointerUp())
  })

  it('collapses the full drag into a single undo entry', () => {
    setupHeaders(['t1', 't2', 't3'], ROWS)
    const { result } = renderHook(() => useTrackDragReorder({ trackId: 't1' }))

    act(() => result.current.onPointerDown(makePointerDown(10)))
    act(() => dispatchDocPointerMove(45))
    syncFakeHeaders(ROWS)
    act(() => dispatchDocPointerMove(75))
    act(() => dispatchDocPointerUp())

    expect(useTimelineStore.getState().tracks.map((t) => t.id)).toEqual(['t2', 't3', 't1'])
    expect(useUndoStore.getState().past).toHaveLength(1)

    act(() => {
      useUndoStore.getState().undo()
    })
    expect(useTimelineStore.getState().tracks.map((t) => t.id)).toEqual(['t1', 't2', 't3'])
  })

  it('pointercancel rewinds every buffered reorder back to the starting order', () => {
    setupHeaders(['t1', 't2', 't3'], ROWS)
    const { result } = renderHook(() => useTrackDragReorder({ trackId: 't1' }))

    act(() => result.current.onPointerDown(makePointerDown(10)))
    act(() => dispatchDocPointerMove(45))
    syncFakeHeaders(ROWS)
    act(() => dispatchDocPointerMove(75))
    act(() => dispatchDocPointerCancel())

    expect(useTimelineStore.getState().tracks.map((t) => t.id)).toEqual(['t1', 't2', 't3'])
    expect(useUndoStore.getState().past).toHaveLength(0)
  })

  it('ignores right-click (button !== 0) so context-menu still fires', () => {
    setupHeaders(['t1', 't2', 't3'], ROWS)
    const { result } = renderHook(() => useTrackDragReorder({ trackId: 't1' }))

    act(() => result.current.onPointerDown(makePointerDown(10, 2)))
    act(() => dispatchDocPointerMove(70))
    act(() => dispatchDocPointerUp())

    expect(useTimelineStore.getState().tracks.map((t) => t.id)).toEqual(['t1', 't2', 't3'])
  })

  it('does not start drag from interactive children (buttons, inputs)', () => {
    setupHeaders(['t1', 't2', 't3'], ROWS)
    const { result } = renderHook(() => useTrackDragReorder({ trackId: 't1' }))

    const ev = makePointerDown(10)
    const button = document.createElement('button')
    ;(ev as unknown as { target: HTMLElement }).target = button

    act(() => result.current.onPointerDown(ev))
    act(() => dispatchDocPointerMove(70))
    act(() => dispatchDocPointerUp())

    expect(useTimelineStore.getState().tracks.map((t) => t.id)).toEqual(['t1', 't2', 't3'])
  })

  it('publishes fromIdx to the shared store so all track headers can highlight the source', () => {
    setupHeaders(['t1', 't2', 't3'], ROWS)
    const { result } = renderHook(() => useTrackDragReorder({ trackId: 't1' }))

    act(() => result.current.onPointerDown(makePointerDown(10)))
    act(() => dispatchDocPointerMove(45))
    expect(useTrackDragStore.getState().fromIdx).toBe(1)
    act(() => dispatchDocPointerUp())
    expect(useTrackDragStore.getState().fromIdx).toBeNull()
  })
})
