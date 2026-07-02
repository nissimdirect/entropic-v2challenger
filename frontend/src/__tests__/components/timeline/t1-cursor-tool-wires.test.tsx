/**
 * T1 — Wire the 5 cheap stub cursor tools to their already-existing store actions
 * (docs/plans/2026-07-02-master-tuneup-plan.md WS1, decision D1).
 *
 * Named tests per packet spec:
 *   1. cursorTool store field defaults to 'select' and setCursorTool updates it
 *   2. razor-click splits at time
 *   3. ripple-click removes+shifts
 *   4. marker-click places at clicked time
 *   5. loop-in/loop-out click sets loop region at clicked time
 *   6. select-mode unchanged (regression guard on Clip AND TimeRuler)
 *
 * Pattern: real component rendering (@testing-library/react) for the actual
 * pointer-event wiring — Clip.tsx's handlePointerDown never calls
 * setPointerCapture (it uses document-level move/up listeners instead, see
 * the comment in Clip.tsx), so RTL's fireEvent.pointerDown exercises the real
 * code path directly. TimeRuler.tsx's handlePointerUp is pointer-capture-free
 * when fired standalone (dragRef.current starts null, so `wasDrag` is falsy
 * without a prior pointerDown) — happy-dom does not implement
 * setPointerCapture (verified), so these tests deliberately fire ONLY
 * pointerUp on TimeRuler, mirroring a real click (no drag).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'

// Mock window.entropic before any store import
;(globalThis as any).window = {
  entropic: {
    onEngineStatus: () => {},
    sendCommand: async () => ({ ok: true }),
    selectFile: async () => null,
    selectSavePath: async () => null,
    onExportProgress: () => {},
  },
}

import ClipComponent from '../../../renderer/components/timeline/Clip'
import TimeRuler from '../../../renderer/components/timeline/TimeRuler'
import { useTimelineStore } from '../../../renderer/stores/timeline'
import { useLayoutStore } from '../../../renderer/stores/layout'
import { useUndoStore } from '../../../renderer/stores/undo'
import type { Clip } from '../../../shared/types'

function makeClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: overrides.id ?? `clip-${Math.random().toString(36).slice(2, 8)}`,
    assetId: overrides.assetId ?? 'asset-1',
    trackId: overrides.trackId ?? '',
    position: overrides.position ?? 0,
    duration: overrides.duration ?? 10,
    inPoint: overrides.inPoint ?? 0,
    outPoint: overrides.outPoint ?? 10,
    speed: overrides.speed ?? 1,
  }
}

/** Stub a fixed getBoundingClientRect on an element (jsdom/happy-dom default is all-zero). */
function stubRect(el: HTMLElement, left: number, width: number): void {
  el.getBoundingClientRect = () =>
    ({
      left, top: 0, right: left + width, bottom: 60,
      width, height: 60, x: left, y: 0, toJSON: () => ({}),
    }) as DOMRect
}

function resetStores() {
  useTimelineStore.getState().reset()
  useUndoStore.getState().clear()
  useLayoutStore.setState({ cursorTool: 'select' })
}

beforeEach(resetStores)
afterEach(() => {
  cleanup()
  resetStores()
})

// ---------------------------------------------------------------------------
// 1. cursorTool store field
// ---------------------------------------------------------------------------

describe('T1 — useLayoutStore.cursorTool', () => {
  it('defaults to select', () => {
    expect(useLayoutStore.getState().cursorTool).toBe('select')
  })

  it('setCursorTool updates the store (shared by click AND keyboard paths)', () => {
    useLayoutStore.getState().setCursorTool('razor')
    expect(useLayoutStore.getState().cursorTool).toBe('razor')
  })
})

// ---------------------------------------------------------------------------
// 2. razor-click splits at time
// ---------------------------------------------------------------------------

describe('T1 — razor tool click splits clip at the clicked time', () => {
  it('splits a 10s clip at the click position (zoom=50px/s, click at 250px → 5s)', () => {
    const tl = useTimelineStore.getState()
    const trackId = tl.addTrack('V1', '#4ade80') as string
    tl.addClip(trackId, makeClip({ id: 'c1', position: 0, duration: 10 }))
    useLayoutStore.getState().setCursorTool('razor')

    const clip = useTimelineStore.getState().tracks[0].clips[0]
    const { container } = render(
      <ClipComponent clip={clip} zoom={50} scrollX={0} isSelected={false} assetName="a" />,
    )
    const clipEl = container.querySelector('.clip') as HTMLElement
    stubRect(clipEl, 0, 500) // clip.duration(10) * zoom(50) = 500px wide, starting at left=0

    fireEvent.pointerDown(clipEl, { clientX: 250, clientY: 10, button: 0 })

    const clips = useTimelineStore.getState().tracks[0].clips
    expect(clips).toHaveLength(2)
    expect(clips[0].position).toBe(0)
    expect(clips[0].duration).toBeCloseTo(5)
    expect(clips[1].position).toBeCloseTo(5)
    expect(clips[1].duration).toBeCloseTo(5)
  })

  it('reuses clip.position offset — a clip NOT starting at 0 splits at the correct absolute time', () => {
    const tl = useTimelineStore.getState()
    const trackId = tl.addTrack('V1', '#4ade80') as string
    tl.addClip(trackId, makeClip({ id: 'c1', position: 3, duration: 8 }))
    useLayoutStore.getState().setCursorTool('razor')

    const clip = useTimelineStore.getState().tracks[0].clips[0]
    const { container } = render(
      <ClipComponent clip={clip} zoom={100} scrollX={0} isSelected={false} assetName="a" />,
    )
    const clipEl = container.querySelector('.clip') as HTMLElement
    // clip left = position*zoom - scrollX = 3*100 = 300 (matches Clip.tsx's `left` calc)
    stubRect(clipEl, 300, 800)

    // Click at clientX=500 → offset within clip = 500-300=200px → 2s into clip → time=5s
    fireEvent.pointerDown(clipEl, { clientX: 500, clientY: 10, button: 0 })

    const clips = useTimelineStore.getState().tracks[0].clips
    expect(clips).toHaveLength(2)
    expect(clips[0].position).toBe(3)
    expect(clips[0].duration).toBeCloseTo(2) // 3..5
    expect(clips[1].position).toBeCloseTo(5)
  })
})

// ---------------------------------------------------------------------------
// 3. ripple-click removes+shifts
// ---------------------------------------------------------------------------

describe('T1 — ripple-delete tool click removes clip and shifts later clips', () => {
  it('removes the clicked clip and shifts later clips left by its duration', () => {
    const tl = useTimelineStore.getState()
    const trackId = tl.addTrack('V1', '#4ade80') as string
    tl.addClip(trackId, makeClip({ id: 'c1', position: 0, duration: 5 }))
    tl.addClip(trackId, makeClip({ id: 'c2', position: 5, duration: 5 }))
    useLayoutStore.getState().setCursorTool('ripple-delete')

    const clipToDelete = useTimelineStore.getState().tracks[0].clips[0]
    const { container } = render(
      <ClipComponent clip={clipToDelete} zoom={50} scrollX={0} isSelected={false} assetName="a" />,
    )
    const clipEl = container.querySelector('.clip') as HTMLElement
    stubRect(clipEl, 0, 250)

    fireEvent.pointerDown(clipEl, { clientX: 50, clientY: 10, button: 0 })

    const clips = useTimelineStore.getState().tracks[0].clips
    expect(clips).toHaveLength(1)
    expect(clips[0].id).toBe('c2')
    expect(clips[0].position).toBe(0) // shifted left by the deleted clip's 5s duration
  })
})

// ---------------------------------------------------------------------------
// 4. marker-click places at clicked time
// ---------------------------------------------------------------------------

describe('T1 — marker tool click on the ruler places a marker at the clicked time', () => {
  it('places a marker at the clicked time, not the playhead', () => {
    const tl = useTimelineStore.getState()
    tl.setPlayheadTime(99) // playhead is far away — proves the marker uses click time
    useLayoutStore.getState().setCursorTool('marker')

    const onSeek = vi.fn()
    const { container } = render(
      <TimeRuler zoom={50} scrollX={0} duration={20} onSeek={onSeek} />,
    )
    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    stubRect(canvas, 0, 1000)

    // Click at clientX=250 → time = (250 + scrollX(0)) / zoom(50) = 5s
    fireEvent.pointerUp(canvas, { clientX: 250, clientY: 5 })

    const markers = useTimelineStore.getState().markers
    expect(markers).toHaveLength(1)
    expect(markers[0].time).toBeCloseTo(5)
    expect(onSeek).not.toHaveBeenCalled() // marker tool does NOT also seek
  })
})

// ---------------------------------------------------------------------------
// 5. loop-in / loop-out click sets loop region at clicked time
// ---------------------------------------------------------------------------

describe('T1 — loop-in/loop-out tool click sets loop region at clicked time', () => {
  it('loop-in click sets loopRegion.in to the clicked time, keeping current out', () => {
    const tl = useTimelineStore.getState()
    tl.setLoopRegion(0, 15)
    useLayoutStore.getState().setCursorTool('loop-in')

    const { container } = render(
      <TimeRuler zoom={50} scrollX={0} duration={20} onSeek={vi.fn()} />,
    )
    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    stubRect(canvas, 0, 1000)

    // clientX=200 → time = 200/50 = 4s
    fireEvent.pointerUp(canvas, { clientX: 200, clientY: 5 })

    expect(useTimelineStore.getState().loopRegion).toEqual({ in: 4, out: 15 })
  })

  it('loop-out click sets loopRegion.out to the clicked time, keeping current in', () => {
    const tl = useTimelineStore.getState()
    tl.setLoopRegion(2, 15)
    useLayoutStore.getState().setCursorTool('loop-out')

    const { container } = render(
      <TimeRuler zoom={50} scrollX={0} duration={20} onSeek={vi.fn()} />,
    )
    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    stubRect(canvas, 0, 1000)

    // clientX=500 → time = 500/50 = 10s
    fireEvent.pointerUp(canvas, { clientX: 500, clientY: 5 })

    expect(useTimelineStore.getState().loopRegion).toEqual({ in: 2, out: 10 })
  })

  it('loop-in click past the current out is a no-op (guard matches the i/o keyboard shortcuts)', () => {
    const tl = useTimelineStore.getState()
    tl.setLoopRegion(0, 5)
    useLayoutStore.getState().setCursorTool('loop-in')

    const { container } = render(
      <TimeRuler zoom={50} scrollX={0} duration={20} onSeek={vi.fn()} />,
    )
    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    stubRect(canvas, 0, 1000)

    // clientX=500 → time = 10s, which is past out=5 → guarded no-op
    fireEvent.pointerUp(canvas, { clientX: 500, clientY: 5 })

    expect(useTimelineStore.getState().loopRegion).toEqual({ in: 0, out: 5 })
  })
})

// ---------------------------------------------------------------------------
// 6. select-mode unchanged (regression guard)
// ---------------------------------------------------------------------------

describe('T1 — select tool (default) behaves exactly as before on Clip and TimeRuler', () => {
  it('Clip: clicking with tool=select selects the clip and does NOT split or delete', () => {
    const tl = useTimelineStore.getState()
    const trackId = tl.addTrack('V1', '#4ade80') as string
    tl.addClip(trackId, makeClip({ id: 'c1', position: 0, duration: 10 }))
    // cursorTool defaults to 'select' via resetStores()

    const clip = useTimelineStore.getState().tracks[0].clips[0]
    const { container } = render(
      <ClipComponent clip={clip} zoom={50} scrollX={0} isSelected={false} assetName="a" />,
    )
    const clipEl = container.querySelector('.clip') as HTMLElement
    stubRect(clipEl, 0, 500)

    fireEvent.pointerDown(clipEl, { clientX: 250, clientY: 10, button: 0 })

    const state = useTimelineStore.getState()
    expect(state.tracks[0].clips).toHaveLength(1) // no split
    expect(state.selectedClipId).toBe('c1') // existing select-on-pointerdown behavior preserved
  })

  it('TimeRuler: clicking with tool=select seeks (onSeek) and does NOT add a marker or move loop region', () => {
    const tl = useTimelineStore.getState()
    tl.setLoopRegion(0, 15)
    // cursorTool defaults to 'select' via resetStores()

    const onSeek = vi.fn()
    const { container } = render(
      <TimeRuler zoom={50} scrollX={0} duration={20} onSeek={onSeek} />,
    )
    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    stubRect(canvas, 0, 1000)

    fireEvent.pointerUp(canvas, { clientX: 250, clientY: 5 })

    expect(onSeek).toHaveBeenCalledWith(5)
    expect(useTimelineStore.getState().markers).toHaveLength(0)
    expect(useTimelineStore.getState().loopRegion).toEqual({ in: 0, out: 15 })
  })
})
