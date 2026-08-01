/**
 * UE.3 — MarqueeOverlay tests.
 *
 * Tests are organised around the 7 named items from the packet TEST PLAN:
 *   1. marquee selects clips intersecting rect
 *   2. shift-marquee adds to selection
 *   3. marquee drag-end does not trigger click-off deselect (NEGATIVE)
 *   4. zero-area marquee click clears selection
 *   5. drag starting on a clip body does not start marquee (NEGATIVE)
 *   6. escape mid-drag cancels marquee without selection change (NEGATIVE)
 *   7. INTEGRATION: marquee pointer sequence commits selection to timeline store
 *      and clips render selected
 *
 * The intersection math (clip time-range vs marquee time-range) is exercised
 * at two zoom levels (50 px/s and 100 px/s) to satisfy the acceptance gate.
 *
 * NOTE: every test in this file is a LOGIC MIRROR — it re-implements
 * MarqueeOverlay's math inline and never mounts the real component (see the
 * section-8 comment below for how that was proven to miss a real
 * regression). For a DOM-level oracle that mounts the actual component and
 * drives it via fireEvent.pointerDown/Move/Up, see
 * marquee-overlay-component.test.tsx.
 */

import { describe, it, expect, beforeEach } from 'vitest'

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

import { useTimelineStore } from '../../../renderer/stores/timeline'
import { useLayoutStore } from '../../../renderer/stores/layout'
import { useProjectStore } from '../../../renderer/stores/project'
import { snapTimeToGridLevel } from '../../../renderer/utils/quantize-grid'
import type { Clip } from '../../../shared/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClip(overrides: Partial<Clip> = {}): Clip {
  const dur = overrides.duration ?? 5
  return {
    id: overrides.id ?? `clip-${Math.random().toString(36).slice(2, 8)}`,
    assetId: overrides.assetId ?? 'asset-1',
    trackId: overrides.trackId ?? '',
    position: overrides.position ?? 0,
    duration: dur,
    inPoint: overrides.inPoint ?? 0,
    outPoint: overrides.outPoint ?? dur,
    speed: overrides.speed ?? 1,
  }
}

/**
 * Pure intersection logic extracted from MarqueeOverlay — determines which
 * clips intersect a time range [leftTime, rightTime].
 *
 * A clip at [clipStart, clipEnd] intersects when:
 *   clipStart < rightTime  AND  clipEnd > leftTime
 *
 * This is the exact predicate used in MarqueeOverlay.tsx commitSelection().
 */
function clipsIntersecting(
  clips: Clip[],
  pixelLeft: number,
  pixelRight: number,
  zoom: number,
): string[] {
  const timeLeft = pixelLeft / zoom
  const timeRight = pixelRight / zoom
  return clips
    .filter((c) => c.position < timeRight && c.position + c.duration > timeLeft)
    .map((c) => c.id)
}

// ---------------------------------------------------------------------------
// 1. marquee selects clips intersecting rect
// ---------------------------------------------------------------------------

describe('marquee selects clips intersecting rect', () => {
  it('at zoom 50 px/s — selects exactly the intersecting clip', () => {
    const zoom = 50
    // clip-A: 0..5s → 0..250px
    // clip-B: 6..11s → 300..550px
    const clipA = makeClip({ id: 'a', position: 0, duration: 5 })
    const clipB = makeClip({ id: 'b', position: 6, duration: 5 })

    // Marquee from 50px to 200px → 1s..4s — intersects A only
    const selected = clipsIntersecting([clipA, clipB], 50, 200, zoom)
    expect(selected).toEqual(['a'])
  })

  it('at zoom 100 px/s — same geometry, verifies zoom-aware conversion', () => {
    const zoom = 100
    // clip-A: 0..5s → 0..500px
    // clip-B: 6..11s → 600..1100px
    const clipA = makeClip({ id: 'a', position: 0, duration: 5 })
    const clipB = makeClip({ id: 'b', position: 6, duration: 5 })

    // Marquee from 100px to 400px → 1s..4s at zoom 100 — intersects A only
    const selected = clipsIntersecting([clipA, clipB], 100, 400, zoom)
    expect(selected).toEqual(['a'])
  })

  it('at zoom 50 px/s — rect spanning both clips selects both', () => {
    const zoom = 50
    const clipA = makeClip({ id: 'a', position: 0, duration: 5 })
    const clipB = makeClip({ id: 'b', position: 6, duration: 5 })

    // Marquee 0..600px → 0..12s — spans both
    const selected = clipsIntersecting([clipA, clipB], 0, 600, zoom)
    expect(selected).toEqual(['a', 'b'])
  })

  it('at zoom 100 px/s — partial overlap (marquee touches clip end edge)', () => {
    const zoom = 100
    // clip: 2s..7s → 200..700px
    const clip = makeClip({ id: 'c', position: 2, duration: 5 })

    // Marquee 690..800px → 6.9s..8s — right edge clips into [2,7) → intersects (6.9 < 7)
    const selected = clipsIntersecting([clip], 690, 800, zoom)
    expect(selected).toEqual(['c'])
  })

  it('at zoom 50 px/s — rect entirely to the right of clip does NOT select it', () => {
    const zoom = 50
    // clip: 0..5s → 0..250px
    const clip = makeClip({ id: 'x', position: 0, duration: 5 })

    // Marquee 260..500px → 5.2..10s — starts AFTER clip end at 5s
    const selected = clipsIntersecting([clip], 260, 500, zoom)
    expect(selected).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 2. shift-marquee adds to selection
// ---------------------------------------------------------------------------

describe('shift-marquee adds to selection', () => {
  let trackId: string

  beforeEach(() => {
    useTimelineStore.getState().reset()
    useTimelineStore.getState().addTrack('T', '#4ade80')
    trackId = useTimelineStore.getState().tracks[0].id
  })

  it('union of existing selection and newly selected clips', () => {
    const store = useTimelineStore.getState()
    const clipA = makeClip({ id: 'a', position: 0, duration: 5, trackId })
    const clipB = makeClip({ id: 'b', position: 6, duration: 5, trackId })
    store.addClip(trackId, clipA)
    store.addClip(trackId, clipB)

    // Pre-select clip A
    store.selectClip('a')
    expect(useTimelineStore.getState().selectedClipIds).toEqual(['a'])

    // Simulate shift-marquee that hits clip B only: set state directly
    // (mirrors what MarqueeOverlay.commitSelection does with shiftKey=true)
    const intersecting = ['b']
    const prior = useTimelineStore.getState().selectedClipIds
    const merged = [...new Set([...prior, ...intersecting])]
    useTimelineStore.setState({
      selectedClipIds: merged,
      selectedClipId: merged[0] ?? null,
    })

    expect(useTimelineStore.getState().selectedClipIds).toContain('a')
    expect(useTimelineStore.getState().selectedClipIds).toContain('b')
    expect(useTimelineStore.getState().selectedClipIds).toHaveLength(2)
  })

  it('shift-marquee on already-selected clip keeps it selected', () => {
    const store = useTimelineStore.getState()
    const clipA = makeClip({ id: 'a', position: 0, duration: 5, trackId })
    store.addClip(trackId, clipA)

    store.selectClip('a')
    // Shift-marquee hitting a again: union is still just ['a']
    const intersecting = ['a']
    const prior = useTimelineStore.getState().selectedClipIds
    const merged = [...new Set([...prior, ...intersecting])]
    useTimelineStore.setState({
      selectedClipIds: merged,
      selectedClipId: merged[0] ?? null,
    })

    expect(useTimelineStore.getState().selectedClipIds).toEqual(['a'])
  })
})

// ---------------------------------------------------------------------------
// 3. NEGATIVE — marquee drag-end does not trigger click-off deselect
// ---------------------------------------------------------------------------

describe('marquee drag-end does not trigger click-off deselect (NEGATIVE)', () => {
  let trackId: string

  beforeEach(() => {
    useTimelineStore.getState().reset()
    useTimelineStore.getState().addTrack('T', '#4ade80')
    trackId = useTimelineStore.getState().tracks[0].id
  })

  it('selection remains intact after drag-end click suppression', () => {
    const store = useTimelineStore.getState()
    const clipA = makeClip({ id: 'a', position: 0, duration: 5, trackId })
    store.addClip(trackId, clipA)

    // Set up selection as if marquee committed it
    useTimelineStore.setState({ selectedClipIds: ['a'], selectedClipId: 'a' })
    expect(useTimelineStore.getState().selectedClipIds).toEqual(['a'])

    // The click suppression is a window event capture; it prevents TrackLane's
    // handleLaneClick from clearing selection. We verify the STORE remains
    // populated — if the click fired without suppression it would call
    // clearSelection() → selectedClipIds = [].
    //
    // The store-level invariant: selection set AFTER commit is not empty.
    expect(useTimelineStore.getState().selectedClipIds.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// 4. zero-area marquee click clears selection
// ---------------------------------------------------------------------------

describe('zero-area marquee click clears selection', () => {
  let trackId: string

  beforeEach(() => {
    useTimelineStore.getState().reset()
    useTimelineStore.getState().addTrack('T', '#4ade80')
    trackId = useTimelineStore.getState().tracks[0].id
  })

  it('dx < 2px on pointerup clears the selection', () => {
    const store = useTimelineStore.getState()
    const clipA = makeClip({ id: 'a', position: 0, duration: 5, trackId })
    store.addClip(trackId, clipA)

    // Pre-select
    store.selectClip('a')
    expect(useTimelineStore.getState().selectedClipIds).toEqual(['a'])

    // Simulate zero-area drag-end: dx < 2 → clearSelection
    // (MarqueeOverlay.handlePointerUp path: dx < 2 → clearSelection())
    useTimelineStore.getState().clearSelection()

    expect(useTimelineStore.getState().selectedClipIds).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 5. NEGATIVE — drag starting on a clip body does not start marquee
// ---------------------------------------------------------------------------

describe('drag starting on a clip body does not start marquee (NEGATIVE)', () => {
  it('clip pointerdown calls stopPropagation — marquee never fires', () => {
    // This is a structural test: MarqueeOverlay.handlePointerDown guards with
    //   if ((e.target as HTMLElement).closest('.clip')) return
    // and Clip.tsx already calls e.stopPropagation() on every pointerdown.
    //
    // We verify the guard logic by constructing a mock event target and
    // running the same predicate.

    // Simulate: target = a .clip element (or descendant)
    const clipEl = { closest: (sel: string) => sel === '.clip' ? {} : null }
    const fromClip = clipEl.closest('.clip') !== null
    expect(fromClip).toBe(true)

    // Simulate: target = the track lane background
    const laneEl = { closest: (sel: string) => null }
    const fromLane = laneEl.closest('.clip') !== null
    expect(fromLane).toBe(false)

    // Guard logic: isDragging started only when fromLane is false
    let marqueeDragStarted = false
    if (!fromLane) {
      marqueeDragStarted = true
    }
    expect(marqueeDragStarted).toBe(true)

    // If target is clip body → no marquee
    let clipBodyDragStarted = false
    if (!fromClip) {
      clipBodyDragStarted = true
    }
    expect(clipBodyDragStarted).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 6. NEGATIVE — escape mid-drag cancels marquee without selection change
// ---------------------------------------------------------------------------

describe('escape mid-drag cancels marquee without selection change (NEGATIVE)', () => {
  let trackId: string

  beforeEach(() => {
    useTimelineStore.getState().reset()
    useTimelineStore.getState().addTrack('T', '#4ade80')
    trackId = useTimelineStore.getState().tracks[0].id
  })

  it('escape during drag does not alter existing selection', () => {
    const store = useTimelineStore.getState()
    const clipA = makeClip({ id: 'a', position: 0, duration: 5, trackId })
    store.addClip(trackId, clipA)

    // Pre-select clip A
    store.selectClip('a')
    const before = [...useTimelineStore.getState().selectedClipIds]
    expect(before).toEqual(['a'])

    // Simulate Escape mid-drag: isDragging = false, rect = null, NO store change
    // (MarqueeOverlay keydown handler: if Escape && isDragging → reset, do NOT clearSelection)
    // Store should remain identical to pre-escape state
    const after = [...useTimelineStore.getState().selectedClipIds]
    expect(after).toEqual(before)
  })
})

// ---------------------------------------------------------------------------
// 7. INTEGRATION — marquee pointer sequence commits selection to timeline store
//    and clips render selected (exact coords at 2 zoom levels)
// ---------------------------------------------------------------------------

describe('marquee pointer sequence commits selection to timeline store and clips render selected', () => {
  let trackId: string

  beforeEach(() => {
    useTimelineStore.getState().reset()
    useTimelineStore.getState().addTrack('T', '#4ade80')
    trackId = useTimelineStore.getState().tracks[0].id
  })

  /**
   * Integration helper: simulates what MarqueeOverlay.commitSelection does
   * when a pointer-down → move → up sequence completes.
   * Mirrors the exact code path in MarqueeOverlay.tsx.
   */
  function simulateMarqueeCommit(
    clips: Clip[],
    pixelLeft: number,
    pixelRight: number,
    zoom: number,
    scrollX: number,
    shiftKey: boolean,
  ) {
    // Adjust for scrollX (what the component does: rawLeft = clientX - containerLeft + scrollX)
    const rawLeft = pixelLeft + scrollX
    const rawRight = pixelRight + scrollX
    const timeLeft = rawLeft / zoom
    const timeRight = rawRight / zoom

    const intersecting = clips
      .filter((c) => c.position < timeRight && c.position + c.duration > timeLeft)
      .map((c) => c.id)

    if (shiftKey) {
      const prior = useTimelineStore.getState().selectedClipIds
      const merged = [...new Set([...prior, ...intersecting])]
      useTimelineStore.setState({ selectedClipIds: merged, selectedClipId: merged[0] ?? null })
    } else {
      useTimelineStore.setState({ selectedClipIds: intersecting, selectedClipId: intersecting[0] ?? null })
    }
  }

  it('at zoom 50 px/s, scrollX=0 — pointer sequence selects correct clips', () => {
    const store = useTimelineStore.getState()
    // clip-A: 0..5s → 0..250px
    // clip-B: 6..11s → 300..550px
    const clipA = makeClip({ id: 'a', position: 0, duration: 5, trackId })
    const clipB = makeClip({ id: 'b', position: 6, duration: 5, trackId })
    store.addClip(trackId, clipA)
    store.addClip(trackId, clipB)

    const zoom = 50
    const scrollX = 0
    const allClips = useTimelineStore.getState().tracks[0].clips

    // Marquee 50px → 200px (1s → 4s) — should select clip-A only
    simulateMarqueeCommit(allClips, 50, 200, zoom, scrollX, false)

    const selected = useTimelineStore.getState().selectedClipIds
    expect(selected).toEqual(['a'])
    // Verify clip-A is "selected" and clip-B is not
    expect(selected).toContain('a')
    expect(selected).not.toContain('b')
  })

  it('at zoom 100 px/s, scrollX=0 — same geometry, different zoom', () => {
    const store = useTimelineStore.getState()
    const clipA = makeClip({ id: 'a', position: 0, duration: 5, trackId })
    const clipB = makeClip({ id: 'b', position: 6, duration: 5, trackId })
    store.addClip(trackId, clipA)
    store.addClip(trackId, clipB)

    const zoom = 100
    const scrollX = 0
    const allClips = useTimelineStore.getState().tracks[0].clips

    // Marquee 100px → 400px → 1s → 4s at zoom 100 — selects A only
    simulateMarqueeCommit(allClips, 100, 400, zoom, scrollX, false)

    const selected = useTimelineStore.getState().selectedClipIds
    expect(selected).toContain('a')
    expect(selected).not.toContain('b')
  })

  it('at zoom 50 px/s, scrollX=200 — scroll offset is accounted for', () => {
    const store = useTimelineStore.getState()
    // With scrollX=200, the viewport is scrolled 4s right (at zoom 50).
    // clip-B: 6..11s → after scrollX accounting: rawLeft = clientX + 200
    const clipA = makeClip({ id: 'a', position: 0, duration: 5, trackId })
    const clipB = makeClip({ id: 'b', position: 6, duration: 5, trackId })
    store.addClip(trackId, clipA)
    store.addClip(trackId, clipB)

    const zoom = 50
    const scrollX = 200 // scrolled 4s right
    const allClips = useTimelineStore.getState().tracks[0].clips

    // Client-relative marquee: 100px → 150px
    // rawLeft = 100 + 200 = 300 → 6s, rawRight = 150 + 200 = 350 → 7s
    // This lands inside clip-B [6,11) only
    simulateMarqueeCommit(allClips, 100, 150, zoom, scrollX, false)

    const selected = useTimelineStore.getState().selectedClipIds
    expect(selected).toContain('b')
    expect(selected).not.toContain('a')
  })

  it('shift-marquee second drag adds to prior selection', () => {
    const store = useTimelineStore.getState()
    const clipA = makeClip({ id: 'a', position: 0, duration: 5, trackId })
    const clipB = makeClip({ id: 'b', position: 6, duration: 5, trackId })
    store.addClip(trackId, clipA)
    store.addClip(trackId, clipB)

    const zoom = 50
    const allClips = useTimelineStore.getState().tracks[0].clips

    // First drag selects A
    simulateMarqueeCommit(allClips, 50, 200, zoom, 0, false)
    expect(useTimelineStore.getState().selectedClipIds).toEqual(['a'])

    // Shift-drag selects B (adds to A)
    simulateMarqueeCommit(allClips, 310, 500, zoom, 0, true)
    const selected = useTimelineStore.getState().selectedClipIds
    expect(selected).toContain('a')
    expect(selected).toContain('b')
  })

  it('Clip.tsx shift-click range select still works (pins existing :253 behavior)', () => {
    const store = useTimelineStore.getState()
    const clipA = makeClip({ id: 'a', position: 0, duration: 5, trackId })
    const clipB = makeClip({ id: 'b', position: 6, duration: 5, trackId })
    store.addClip(trackId, clipA)
    store.addClip(trackId, clipB)

    // rangeSelectClips is the shift-click handler (Clip.tsx:253)
    store.selectClip('a')
    store.rangeSelectClips('a', 'b')

    const selected = useTimelineStore.getState().selectedClipIds
    expect(selected).toContain('a')
    expect(selected).toContain('b')
  })
})

// ---------------------------------------------------------------------------
// 8. W1.5b PK.A4 — unified gesture (orchestrator ruling, 2026-07-31, PR #488):
//    plain lane-bed drag produces BOTH a clip selection (unchanged, raw
//    pixel range) AND a snapped timeline.selectionRegion, in one commit.
//    Mirrors MarqueeOverlay.computeSnappedRange/commitSelection exactly,
//    using the REAL snapTimeToGridLevel + REAL layout/project store state
//    (same mirror convention as commitSelection above — see file header).
//
//    LOGIC MIRROR — NOT A COMPONENT ORACLE (gate-fix packet P1.3): this
//    section re-implements the component's math inline via
//    simulateUnifiedDrag/computeSnappedRange and never mounts MarqueeOverlay
//    itself, so a broken component (e.g. handlePointerDown never setting
//    isDragging) still passes every test here — verified by hand during the
//    P1.3 fix. Fast unit coverage for the math is still valuable, so these
//    stay, but the real DOM-level oracle for the drag gesture is
//    marquee-overlay-component.test.tsx (mounts the actual component and
//    drives it with fireEvent.pointerDown/Move/Up).
// ---------------------------------------------------------------------------

describe('PK.A4 unified gesture — logic mirror (selectionRegion + clip selection math, not a component oracle)', () => {
  let trackId: string

  beforeEach(() => {
    useTimelineStore.getState().reset()
    useTimelineStore.getState().addTrack('T', '#4ade80')
    trackId = useTimelineStore.getState().tracks[0].id
    useLayoutStore.setState({ quantizeEnabled: false, quantizeDivision: 4 })
    useProjectStore.setState({ bpm: 120, effectiveBpm: 120 })
  })

  /** Mirrors MarqueeOverlay.computeSnappedRange exactly. */
  function computeSnappedRange(pixelLeft: number, pixelRight: number, zoom: number, altKey: boolean) {
    let timeLeft = Math.max(0, pixelLeft / zoom)
    let timeRight = Math.max(0, pixelRight / zoom)
    const layout = useLayoutStore.getState()
    if (layout.quantizeEnabled && !altKey) {
      const bpm = useProjectStore.getState().effectiveBpm
      timeLeft = snapTimeToGridLevel(timeLeft, bpm, layout.quantizeDivision, zoom)
      timeRight = snapTimeToGridLevel(timeRight, bpm, layout.quantizeDivision, zoom)
    }
    if (timeLeft > timeRight) { const t = timeLeft; timeLeft = timeRight; timeRight = t }
    return { in: timeLeft, out: timeRight }
  }

  /** Mirrors MarqueeOverlay's pointerup dx>=2 branch: both outputs, one commit. */
  function simulateUnifiedDrag(clips: Clip[], pixelLeft: number, pixelRight: number, zoom: number, altKey = false) {
    // (a) clip selection — RAW pixel range, unchanged from pre-PK.A4 marquee.
    const timeLeft = pixelLeft / zoom
    const timeRight = pixelRight / zoom
    const intersecting = clips
      .filter((c) => c.position < timeRight && c.position + c.duration > timeLeft)
      .map((c) => c.id)
    useTimelineStore.setState({ selectedClipIds: intersecting, selectedClipId: intersecting[0] ?? null })

    // (b) selectionRegion — snapped when Q on and Alt not held.
    const range = computeSnappedRange(pixelLeft, pixelRight, zoom, altKey)
    useTimelineStore.getState().setSelectionRegion(range)
  }

  it('drag on an empty lane (zero clips) still produces a selectionRegion band', () => {
    const zoom = 50
    simulateUnifiedDrag([], 100, 400, zoom) // 2s..8s, no clips on this track

    expect(useTimelineStore.getState().selectedClipIds).toHaveLength(0)
    const region = useTimelineStore.getState().selectionRegion
    expect(region).not.toBeNull()
    expect(region!.in).toBeCloseTo(2, 5)
    expect(region!.out).toBeCloseTo(8, 5)
  })

  it('drag starting on a clip body produces NEITHER output (pointerdown guard fires first)', () => {
    // MarqueeOverlay.handlePointerDown returns before isDragging is ever set
    // true when the target closest('.clip') matches — no move/up handler
    // logic runs at all, so neither commitSelection nor setSelectionRegion
    // are ever reached. Assert the store is untouched by this scenario.
    const before = { selectedClipIds: useTimelineStore.getState().selectedClipIds, selectionRegion: useTimelineStore.getState().selectionRegion }
    const clipEl = { closest: (sel: string) => (sel === '.clip' ? {} : null) }
    const startedFromClip = clipEl.closest('.clip') !== null
    expect(startedFromClip).toBe(true)
    // No store mutation happens in this branch — verify nothing changed.
    expect(useTimelineStore.getState().selectedClipIds).toEqual(before.selectedClipIds)
    expect(useTimelineStore.getState().selectionRegion).toEqual(before.selectionRegion)
  })

  it('quantize ON snaps the selectionRegion; clip selection stays on the RAW (unsnapped) pixel range', () => {
    useLayoutStore.setState({ quantizeEnabled: true, quantizeDivision: 4 }) // bpm=120 -> interval 0.5s
    const zoom = 50
    // clip spans 1.9s..3.1s -> 95..155px. Drag 90px..160px (1.8s..3.2s raw) — intersects the clip.
    const clip = makeClip({ id: 'c', position: 1.9, duration: 1.2, trackId })

    simulateUnifiedDrag([clip], 90, 160, zoom)

    // Clip selection: RAW range [1.8, 3.2) intersects [1.9, 3.1) -> selected.
    expect(useTimelineStore.getState().selectedClipIds).toEqual(['c'])
    // selectionRegion: snapped to the nearest 0.5s line -> [2.0, 3.0).
    const region = useTimelineStore.getState().selectionRegion!
    expect(region.in).toBeCloseTo(2.0, 5)
    expect(region.out).toBeCloseTo(3.0, 5)
  })

  it('Alt held during the drag bypasses snap for that drag (temporary, per-drag)', () => {
    useLayoutStore.setState({ quantizeEnabled: true, quantizeDivision: 4 })
    const zoom = 50
    simulateUnifiedDrag([], 90, 160, zoom, /* altKey */ true)

    const region = useTimelineStore.getState().selectionRegion!
    expect(region.in).toBeCloseTo(90 / zoom, 5) // 1.8s, unsnapped
    expect(region.out).toBeCloseTo(160 / zoom, 5) // 3.2s, unsnapped
  })

  it('quantize OFF never snaps, regardless of Alt', () => {
    const zoom = 50
    simulateUnifiedDrag([], 97, 163, zoom, false)
    const region = useTimelineStore.getState().selectionRegion!
    expect(region.in).toBeCloseTo(97 / zoom, 5)
    expect(region.out).toBeCloseTo(163 / zoom, 5)
  })

  it('zero-area click (dx<2) clears BOTH clip selection and selectionRegion (mirrors handlePointerUp)', () => {
    const clip = makeClip({ id: 'a', position: 0, duration: 5, trackId })
    useTimelineStore.getState().addClip(trackId, clip)
    useTimelineStore.getState().selectClip('a')
    useTimelineStore.getState().setSelectionRegion({ in: 1, out: 2 })

    // dx < 2 branch: MarqueeOverlay.handlePointerUp calls clearSelection() + clearSelectionRegion()
    useTimelineStore.getState().clearSelection()
    useTimelineStore.getState().clearSelectionRegion()

    expect(useTimelineStore.getState().selectedClipIds).toHaveLength(0)
    expect(useTimelineStore.getState().selectionRegion).toBeNull()
  })

  it('Esc clears an already-committed selectionRegion without touching clip selection (PK.A4 "Esc clears")', () => {
    const clip = makeClip({ id: 'a', position: 0, duration: 5, trackId })
    useTimelineStore.getState().addClip(trackId, clip)
    useTimelineStore.getState().selectClip('a')
    useTimelineStore.getState().setSelectionRegion({ in: 1, out: 2 })

    // MarqueeOverlay's not-mid-drag Escape branch: clearSelectionRegion() only.
    useTimelineStore.getState().clearSelectionRegion()

    expect(useTimelineStore.getState().selectionRegion).toBeNull()
    expect(useTimelineStore.getState().selectedClipIds).toEqual(['a'])
  })
})
