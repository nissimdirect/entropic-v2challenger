/**
 * useTrackDragReorder — pointer-driven track reorder.
 *
 * Covers the contract: threshold gate distinguishes click from drag, target
 * detection walks .track-header[data-track-idx] rects, pointerup calls
 * reorderTrack(from, to) only when armed and target ≠ source, pointercancel
 * resets without triggering reorder.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTimelineStore } from '../../renderer/stores/timeline'
import { useTrackDragReorder } from '../../renderer/hooks/useTrackDragReorder'

interface FakeHeader {
  el: HTMLDivElement
  rect: { top: number; bottom: number; left: number; right: number }
}

function setupHeaders(rects: Array<{ top: number; bottom: number }>): FakeHeader[] {
  const headers: FakeHeader[] = []
  rects.forEach(({ top, bottom }, idx) => {
    const el = document.createElement('div')
    el.className = 'track-header'
    el.dataset.trackIdx = String(idx)
    const rect = { top, bottom, left: 0, right: 200 }
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

beforeEach(() => {
  document.body.innerHTML = ''
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
    setupHeaders([{ top: 0, bottom: 30 }, { top: 30, bottom: 60 }, { top: 60, bottom: 90 }])
    const { result } = renderHook(() => useTrackDragReorder({ trackId: 't1' }))

    act(() => result.current.onPointerDown(makePointerEvent(10)))
    act(() => result.current.onPointerMove(makePointerEvent(12))) // 2px — below 4px threshold
    act(() => result.current.onPointerUp())

    expect(useTimelineStore.getState().tracks.map((t) => t.id)).toEqual(['t1', 't2', 't3'])
  })

  it('reorders to the target header the pointer was over at release', () => {
    setupHeaders([{ top: 0, bottom: 30 }, { top: 30, bottom: 60 }, { top: 60, bottom: 90 }])
    const { result } = renderHook(() => useTrackDragReorder({ trackId: 't1' }))

    act(() => result.current.onPointerDown(makePointerEvent(10)))
    act(() => result.current.onPointerMove(makePointerEvent(70))) // past threshold, over header idx 2
    act(() => result.current.onPointerUp())

    expect(useTimelineStore.getState().tracks.map((t) => t.id)).toEqual(['t2', 't3', 't1'])
  })

  it('is a no-op when target equals source', () => {
    setupHeaders([{ top: 0, bottom: 30 }, { top: 30, bottom: 60 }])
    const { result } = renderHook(() => useTrackDragReorder({ trackId: 't1' }))

    act(() => result.current.onPointerDown(makePointerEvent(10)))
    act(() => result.current.onPointerMove(makePointerEvent(20))) // still over own header
    act(() => result.current.onPointerUp())

    expect(useTimelineStore.getState().tracks.map((t) => t.id)).toEqual(['t1', 't2', 't3'])
  })

  it('skips reorder when pointercancel fires mid-drag (OS interrupt)', () => {
    setupHeaders([{ top: 0, bottom: 30 }, { top: 30, bottom: 60 }, { top: 60, bottom: 90 }])
    const { result } = renderHook(() => useTrackDragReorder({ trackId: 't1' }))

    act(() => result.current.onPointerDown(makePointerEvent(10)))
    act(() => result.current.onPointerMove(makePointerEvent(70)))
    act(() => result.current.onPointerCancel())
    act(() => result.current.onPointerUp())

    expect(useTimelineStore.getState().tracks.map((t) => t.id)).toEqual(['t1', 't2', 't3'])
  })

  it('ignores right-click (button !== 0) so context-menu still fires', () => {
    setupHeaders([{ top: 0, bottom: 30 }, { top: 30, bottom: 60 }])
    const { result } = renderHook(() => useTrackDragReorder({ trackId: 't1' }))

    act(() => result.current.onPointerDown(makePointerEvent(10, 2))) // right-click
    act(() => result.current.onPointerMove(makePointerEvent(70)))
    act(() => result.current.onPointerUp())

    expect(useTimelineStore.getState().tracks.map((t) => t.id)).toEqual(['t1', 't2', 't3'])
  })

  it('does not start drag from interactive children (buttons, inputs)', () => {
    setupHeaders([{ top: 0, bottom: 30 }, { top: 30, bottom: 60 }, { top: 60, bottom: 90 }])
    const { result } = renderHook(() => useTrackDragReorder({ trackId: 't1' }))

    const ev = makePointerEvent(10)
    const button = document.createElement('button')
    ;(ev as unknown as { target: HTMLElement }).target = button

    act(() => result.current.onPointerDown(ev))
    act(() => result.current.onPointerMove(makePointerEvent(70)))
    act(() => result.current.onPointerUp())

    expect(useTimelineStore.getState().tracks.map((t) => t.id)).toEqual(['t1', 't2', 't3'])
  })
})
