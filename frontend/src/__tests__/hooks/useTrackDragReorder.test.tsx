/**
 * useTrackDragReorder — pointer-driven LIVE track reorder.
 *
 * Covers the contract: threshold gate distinguishes click from drag, the
 * source track moves in real time as the cursor crosses adjacent track
 * rects, the full drag collapses into one undo transaction, and
 * pointercancel aborts the transaction (restoring the original order).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTimelineStore } from '../../renderer/stores/timeline'
import { useTrackDragStore } from '../../renderer/stores/trackDrag'
import { useUndoStore } from '../../renderer/stores/undo'
import { useTrackDragReorder } from '../../renderer/hooks/useTrackDragReorder'

interface FakeHeader {
  el: HTMLDivElement
  rect: { top: number; bottom: number; left: number; right: number }
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
    headers.push({ el, rect })
  })
  return headers
}

/**
 * Mirror the timeline-store tracks into the fake DOM so target detection
 * walks the current order whenever a live reorder fires.
 */
function syncFakeHeaders(rects: Array<{ top: number; bottom: number }>) {
  const tracks = useTimelineStore.getState().tracks
  setupHeaders(tracks.map((t) => t.id), rects)
}

function makePointerEvent(clientY: number, button = 0): React.PointerEvent<HTMLDivElement> {
  const target = document.createElement('div')
  const currentTarget = document.createElement('div')
  currentTarget.setPointerCapture = vi.fn()
  return {
    button,
    clientY,
    clientX: 100,
    pointerId: 1,
    target,
    currentTarget,
  } as unknown as React.PointerEvent<HTMLDivElement>
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

    act(() => result.current.onPointerDown(makePointerEvent(10)))
    act(() => result.current.onPointerMove(makePointerEvent(12)))
    act(() => result.current.onPointerUp())

    expect(useTimelineStore.getState().tracks.map((t) => t.id)).toEqual(['t1', 't2', 't3'])
  })

  it('reorders live as the cursor crosses each adjacent track', () => {
    setupHeaders(['t1', 't2', 't3'], ROWS)
    const { result } = renderHook(() => useTrackDragReorder({ trackId: 't1' }))

    act(() => result.current.onPointerDown(makePointerEvent(10)))

    // Cross into middle track → t1 swaps with t2.
    act(() => result.current.onPointerMove(makePointerEvent(45)))
    expect(useTimelineStore.getState().tracks.map((t) => t.id)).toEqual(['t2', 't1', 't3'])
    // Refresh the DOM mirror so the next move targets the new order.
    syncFakeHeaders(ROWS)

    // Cross into bottom track → t1 reaches the end.
    act(() => result.current.onPointerMove(makePointerEvent(75)))
    expect(useTimelineStore.getState().tracks.map((t) => t.id)).toEqual(['t2', 't3', 't1'])

    act(() => result.current.onPointerUp())
  })

  it('collapses the full drag into a single undo entry', () => {
    setupHeaders(['t1', 't2', 't3'], ROWS)
    const { result } = renderHook(() => useTrackDragReorder({ trackId: 't1' }))

    act(() => result.current.onPointerDown(makePointerEvent(10)))
    act(() => result.current.onPointerMove(makePointerEvent(45)))
    syncFakeHeaders(ROWS)
    act(() => result.current.onPointerMove(makePointerEvent(75)))
    act(() => result.current.onPointerUp())

    expect(useTimelineStore.getState().tracks.map((t) => t.id)).toEqual(['t2', 't3', 't1'])
    // One undo entry covers the whole drag.
    expect(useUndoStore.getState().past).toHaveLength(1)

    // Single Cmd+Z restores the original order.
    act(() => {
      useUndoStore.getState().undo()
    })
    expect(useTimelineStore.getState().tracks.map((t) => t.id)).toEqual(['t1', 't2', 't3'])
  })

  it('pointercancel rewinds every buffered reorder back to the starting order', () => {
    setupHeaders(['t1', 't2', 't3'], ROWS)
    const { result } = renderHook(() => useTrackDragReorder({ trackId: 't1' }))

    act(() => result.current.onPointerDown(makePointerEvent(10)))
    act(() => result.current.onPointerMove(makePointerEvent(45)))
    syncFakeHeaders(ROWS)
    act(() => result.current.onPointerMove(makePointerEvent(75)))
    act(() => result.current.onPointerCancel())

    expect(useTimelineStore.getState().tracks.map((t) => t.id)).toEqual(['t1', 't2', 't3'])
    expect(useUndoStore.getState().past).toHaveLength(0)
  })

  it('ignores right-click (button !== 0) so context-menu still fires', () => {
    setupHeaders(['t1', 't2', 't3'], ROWS)
    const { result } = renderHook(() => useTrackDragReorder({ trackId: 't1' }))

    act(() => result.current.onPointerDown(makePointerEvent(10, 2)))
    act(() => result.current.onPointerMove(makePointerEvent(70)))
    act(() => result.current.onPointerUp())

    expect(useTimelineStore.getState().tracks.map((t) => t.id)).toEqual(['t1', 't2', 't3'])
  })

  it('does not start drag from interactive children (buttons, inputs)', () => {
    setupHeaders(['t1', 't2', 't3'], ROWS)
    const { result } = renderHook(() => useTrackDragReorder({ trackId: 't1' }))

    const ev = makePointerEvent(10)
    const button = document.createElement('button')
    ;(ev as unknown as { target: HTMLElement }).target = button

    act(() => result.current.onPointerDown(ev))
    act(() => result.current.onPointerMove(makePointerEvent(70)))
    act(() => result.current.onPointerUp())

    expect(useTimelineStore.getState().tracks.map((t) => t.id)).toEqual(['t1', 't2', 't3'])
  })

  it('publishes fromIdx to the shared store so all track headers can highlight the source', () => {
    setupHeaders(['t1', 't2', 't3'], ROWS)
    const { result } = renderHook(() => useTrackDragReorder({ trackId: 't1' }))

    act(() => result.current.onPointerDown(makePointerEvent(10)))
    act(() => result.current.onPointerMove(makePointerEvent(45)))
    expect(useTrackDragStore.getState().fromIdx).toBe(1) // t1 moved to idx 1
    act(() => result.current.onPointerUp())
    expect(useTrackDragStore.getState().fromIdx).toBeNull()
  })
})
