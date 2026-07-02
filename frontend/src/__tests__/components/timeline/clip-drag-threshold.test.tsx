/**
 * UAT P6 — stray empty track on clip select.
 *
 * Clip.tsx's upHandler used to run the below-lane/drop-zone new-track check
 * unconditionally, so a pointerdown+pointerup with near-zero pointer travel
 * (a plain click/select) could spawn an empty track if the release point
 * geometrically landed past the last lane's bottom edge. The fix gates that
 * logic on `hasDragged`, which only flips once pointer travel exceeds a
 * 4px threshold (Clip.tsx DRAG_THRESHOLD_PX).
 *
 * These tests render the real <ClipComponent>, attach a fake `.track-lane
 * [data-track-id]` fixture (mirrors the useTrackDragReorder.test.tsx
 * pattern — jsdom's PointerEvent isn't fully implemented, so events are
 * synthesized via `new Event(...)` + Object.defineProperty), and drive a
 * full pointerdown → pointermove → pointerup sequence through the DOM.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'

// Mock window.entropic before any store import (matches sibling timeline tests)
;(globalThis as any).window = {
  entropic: {
    onEngineStatus: () => {},
    sendCommand: async () => ({ ok: true }),
    selectFile: async () => null,
    selectSavePath: async () => null,
    onExportProgress: () => {},
  },
}

import { useTimelineStore } from '../../../renderer/stores/timeline'
import type { Clip } from '../../../shared/types'
import ClipComponent from '../../../renderer/components/timeline/Clip'

function makeClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: overrides.id ?? 'clip-1',
    assetId: overrides.assetId ?? 'asset-1',
    trackId: overrides.trackId ?? '',
    position: overrides.position ?? 0,
    duration: overrides.duration ?? 10,
    inPoint: overrides.inPoint ?? 0,
    outPoint: overrides.outPoint ?? 10,
    speed: overrides.speed ?? 1,
  }
}

/** Fake track-lane fixture matching what TrackLane renders in production:
 *  `.track-lane[data-track-id]` with a getBoundingClientRect the Clip
 *  drag handlers read to compute belowAllTracks / drop targets. */
function setupLane(trackId: string, rect: { top: number; bottom: number }) {
  const el = document.createElement('div')
  el.className = 'track-lane'
  el.dataset.trackId = trackId
  const full = { top: rect.top, bottom: rect.bottom, left: 0, right: 800 }
  el.getBoundingClientRect = () => ({
    ...full,
    x: full.left,
    y: full.top,
    width: full.right - full.left,
    height: full.bottom - full.top,
    toJSON() { return full },
  })
  document.body.appendChild(el)
  return el
}

function dispatchPointerDown(el: Element, opts: { clientX: number; clientY: number; pointerId?: number; button?: number }) {
  const ev = new Event('pointerdown', { bubbles: true, cancelable: true }) as PointerEvent
  Object.defineProperty(ev, 'pointerId', { value: opts.pointerId ?? 1 })
  Object.defineProperty(ev, 'clientX', { value: opts.clientX })
  Object.defineProperty(ev, 'clientY', { value: opts.clientY })
  Object.defineProperty(ev, 'button', { value: opts.button ?? 0 })
  el.dispatchEvent(ev)
}

function dispatchDocPointerMove(clientX: number, clientY: number, pointerId = 1) {
  const ev = new Event('pointermove') as Event & { pointerId: number; clientX: number; clientY: number }
  Object.defineProperty(ev, 'pointerId', { value: pointerId })
  Object.defineProperty(ev, 'clientX', { value: clientX })
  Object.defineProperty(ev, 'clientY', { value: clientY })
  document.dispatchEvent(ev)
}

function dispatchDocPointerUp(clientX: number, clientY: number, pointerId = 1) {
  const ev = new Event('pointerup') as Event & { pointerId: number; clientX: number; clientY: number }
  Object.defineProperty(ev, 'pointerId', { value: pointerId })
  Object.defineProperty(ev, 'clientX', { value: clientX })
  Object.defineProperty(ev, 'clientY', { value: clientY })
  document.dispatchEvent(ev)
}

describe('Clip drag threshold (UAT P6)', () => {
  let trackId: string

  beforeEach(() => {
    document.body.innerHTML = ''
    useTimelineStore.getState().reset()
    useTimelineStore.getState().addTrack('Track 1', '#4ade80', 'video')
    trackId = useTimelineStore.getState().tracks[0].id
    const clip = makeClip({ id: 'clip-1', trackId, position: 0, duration: 10 })
    useTimelineStore.getState().addClip(trackId, clip)
  })

  afterEach(() => {
    cleanup()
    document.body.innerHTML = ''
  })

  it('pointerup with <4px travel does NOT call addTrack (plain click/select)', () => {
    // Lane spans y:[0,60]; clip pointerdown starts inside the lane at y=30.
    setupLane(trackId, { top: 0, bottom: 60 })
    const clip = useTimelineStore.getState().tracks[0].clips[0]

    const { container } = render(
      <ClipComponent clip={clip} zoom={50} scrollX={0} isSelected={false} assetName="test-asset" />,
    )
    const clipEl = container.querySelector('.clip')!
    expect(clipEl).toBeTruthy()

    dispatchPointerDown(clipEl, { clientX: 10, clientY: 30 })
    // Sub-threshold jitter: 2px travel — well under DRAG_THRESHOLD_PX (4).
    dispatchDocPointerMove(11, 31)
    // Release point geometrically lands below the lane's bottom edge (60) —
    // this is exactly the UAT P6 gesture (a click that resolves slightly
    // below the last lane). Pre-fix, this alone triggered addTrack.
    dispatchDocPointerUp(11, 90)

    expect(useTimelineStore.getState().tracks).toHaveLength(1)
    expect(useTimelineStore.getState().tracks[0].clips).toHaveLength(1)
    expect(useTimelineStore.getState().tracks[0].clips[0].id).toBe('clip-1')
  })

  it('pointerup below the last lane after a REAL drag (>4px) DOES call addTrack', () => {
    setupLane(trackId, { top: 0, bottom: 60 })
    const clip = useTimelineStore.getState().tracks[0].clips[0]

    const { container } = render(
      <ClipComponent clip={clip} zoom={50} scrollX={0} isSelected={false} assetName="test-asset" />,
    )
    const clipEl = container.querySelector('.clip')!

    dispatchPointerDown(clipEl, { clientX: 10, clientY: 30 })
    // Real drag: >4px vertical travel arms hasDragged.
    dispatchDocPointerMove(10, 50)
    // Release below all lanes → new-track logic fires.
    dispatchDocPointerUp(10, 90)

    const tracks = useTimelineStore.getState().tracks
    expect(tracks).toHaveLength(2)
    // The clip should have migrated off the original (now-empty) track onto
    // the newly created one.
    expect(tracks[0].clips).toHaveLength(0)
    const newTrack = tracks[1]
    expect(newTrack.clips).toHaveLength(1)
    expect(newTrack.clips[0].id).toBe('clip-1')
  })

  it('a real drag that stays within lanes (no below-lane release) never creates a track', () => {
    setupLane(trackId, { top: 0, bottom: 60 })
    const clip = useTimelineStore.getState().tracks[0].clips[0]

    const { container } = render(
      <ClipComponent clip={clip} zoom={50} scrollX={0} isSelected={false} assetName="test-asset" />,
    )
    const clipEl = container.querySelector('.clip')!

    dispatchPointerDown(clipEl, { clientX: 10, clientY: 30 })
    // Real horizontal drag, travel exceeds threshold, but release stays
    // inside the lane bounds — legitimate reposition, not a new-track drop.
    dispatchDocPointerMove(60, 30)
    dispatchDocPointerUp(60, 30)

    expect(useTimelineStore.getState().tracks).toHaveLength(1)
  })
})
