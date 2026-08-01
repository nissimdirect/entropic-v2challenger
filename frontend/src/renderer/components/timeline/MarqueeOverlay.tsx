/**
 * MarqueeOverlay — unified lane-bed drag gesture (rubber-band clip select +
 * PK.A4 arrangement time-range selection).
 *
 * UE.3 (original): drag-rectangle on track background selects every clip
 * whose time-range intersects the marquee rect. Shift held at pointer-up
 * adds to the existing selection (union). Escape mid-drag cancels.
 *
 * W1.5b PK.A4 (orchestrator ruling, 2026-07-31 — see PR #488): this was
 * originally going to be a SEPARATE, modifier-gated gesture (proposed
 * Alt+drag) to avoid clobbering the marquee above. The ruling instead
 * UNIFIES them: this component's own header already established that the
 * marquee's vertical span is meaningless ("full lane height is always
 * selected since the overlay covers a single track's lane") — i.e. it was
 * ALREADY a horizontal-only, time-range gesture whose only visible output
 * happened to be clip selection. That is exactly Ableton's arrangement-drag
 * grammar: dragging creates a TIME selection; clips inside it become
 * selected as a byproduct. So one plain drag now produces BOTH outputs:
 *   (a) writes `timeline.selectionRegion` to the dragged range, snapped to
 *       the currently-visible grid level (PK.A2) when quantize is on, free
 *       when off (D12) — LIVE during the drag, so every mounted
 *       MarqueeOverlay (one per lane) renders the same global region as a
 *       full-lane-height band (see the render at the bottom), collectively
 *       reading as one spanning band across the arrangement.
 *   (b) selects clips intersecting the RAW (unsnapped) dragged pixels on
 *       THIS lane — unchanged predicate/inputs from the original marquee,
 *       so every pre-existing clip-selection test stays valid unmodified.
 * Alt held during the drag bypasses snap for that drag (temporary,
 * standard DAW idiom) — distinct from Clip.tsx's meta/ctrl-bypass on clip
 * drag, which is a different gesture on a different element.
 * `Cmd+L` (App.tsx `copy_selection_to_loop`) copies the committed
 * selectionRegion into loopRegion.
 *
 * Design references:
 * - Coordinate idiom from BoundingBoxOverlay.tsx + SnapGuides.tsx (pointer
 *   down → move → up on the document, not on the element itself).
 * - Drag-end click suppression from feedback_drag-end-suppresses-click.md:
 *   pointerup synthesises a click event; an isDragging flag prevents the
 *   parent TrackLane's onClick (clearSelection) from firing immediately.
 * - PD.5 note: PD.5 builds an analogous marquee on the preview canvas.
 *   Same pattern (SVG overlay, pointer events, timeline-coordinate mapping),
 *   different surface. Coordinate with PD.5 at pickup if that packet is
 *   in flight to avoid divergent implementations.
 *
 * Pointer event model:
 *   pointerdown on track background → setPointerCapture → move updates
 *   selectionRegion live (snapped) → pointerup commits clip selection
 *   (raw range) → click is suppressed by isDragging flag.
 *
 * Clip intersection: a clip at [clipStart, clipEnd] intersects
 * [rectLeft, rectRight] when clipStart < rectRight && clipEnd > rectLeft.
 * Coordinate space is timeline-seconds (horizontal) × anything (vertical —
 * the full lane height is always selected since the overlay covers a single
 * track's lane and clips fill the full lane height).
 *
 * NOTE: This component attaches pointer handlers to the track background.
 * The Clip component calls stopPropagation on pointerdown, so clicks/drags
 * that start ON a clip body never reach this overlay — neither clip
 * selection nor selectionRegion are touched.
 *
 * T1 (2026-07-02) investigation — 'range-select' cursor tool (EffectBrowser
 * [tool] tab): this overlay is mounted unconditionally in TrackLane (Track.tsx)
 * and is NOT gated on any cursor-tool state — drag-select on empty track
 * background already works in every tool mode, including the default 'select'
 * tool. Gating it behind cursorTool === 'range-select' would BREAK existing
 * multi-select UX (users currently rubber-band select without switching tools).
 * Per T1 packet decision: left un-gated.
 *
 * T5 (2026-07-02) follow-up: since the above investigation proved the
 * 'range-select' tool/hotkey never changed this overlay's (or anything else's)
 * behavior, it was a pure no-op duplicate of 'select' and was removed
 * entirely from CursorTool/TOOL_ENTRIES (EffectBrowser.tsx) and the
 * 'tool_range_select' shortcut (default-shortcuts.ts). Drag-select keeps
 * working exactly as before via this un-gated overlay. See
 * docs/plans/2026-07-02-master-tuneup-plan.md WS1 (T1) / T5 packet.
 */

import { useCallback, useEffect, useRef } from 'react'
import { useTimelineStore } from '../../stores/timeline'
import { useLayoutStore } from '../../stores/layout'
import { useProjectStore } from '../../stores/project'
import { snapTimeToGridLevel } from '../../utils/quantize-grid'

interface Props {
  /** Zoom level: pixels per second. */
  zoom: number
  /** Horizontal scroll offset (pixels). */
  scrollX: number
  /** Track ID this overlay belongs to. */
  trackId: string
  /**
   * The lane container element. Used to compute the pointer position in
   * lane-relative coordinates.
   */
  containerRef: React.RefObject<HTMLElement | null>
}

export default function MarqueeOverlay({ zoom, scrollX, trackId, containerRef }: Props) {
  const isDragging = useRef(false)
  const startX = useRef(0) // client X at pointer-down
  const startY = useRef(0)
  // Ref mirrors isDragging for click-suppression access in the click handler
  const isDraggingRef = useRef(false)

  // Global selection-region state — every mounted MarqueeOverlay (one per
  // lane) subscribes to the SAME value, so a drag in any one lane renders a
  // full-lane-height band in every lane simultaneously (collectively reads
  // as one spanning arrangement-wide band).
  const selectionRegion = useTimelineStore((s) => s.selectionRegion)

  /**
   * PK.A4: raw pixel positions -> a snapped time range, in/out independently
   * snapped to whatever grid level PK.A2 is currently rendering (matches
   * what the user can see). altKey bypasses snap for this drag.
   */
  const computeSnappedRange = useCallback(
    (currentX: number, altKey: boolean): { in: number; out: number } | null => {
      const container = containerRef.current
      if (!container) return null
      const containerRect = container.getBoundingClientRect()
      const rawLeft = Math.min(startX.current, currentX) - containerRect.left + scrollX
      const rawRight = Math.max(startX.current, currentX) - containerRect.left + scrollX
      let timeLeft = Math.max(0, rawLeft / zoom)
      let timeRight = Math.max(0, rawRight / zoom)

      const layout = useLayoutStore.getState()
      if (layout.quantizeEnabled && !altKey) {
        const bpm = useProjectStore.getState().effectiveBpm
        timeLeft = snapTimeToGridLevel(timeLeft, bpm, layout.quantizeDivision, zoom)
        timeRight = snapTimeToGridLevel(timeRight, bpm, layout.quantizeDivision, zoom)
      }
      // Snapping in/out independently can invert a short drag at a coarse
      // grid level (both edges land on the same line) — normalize rather
      // than emit a negative-width region.
      if (timeLeft > timeRight) { const t = timeLeft; timeLeft = timeRight; timeRight = t }
      return { in: timeLeft, out: timeRight }
    },
    [containerRef, scrollX, zoom],
  )

  /** Unchanged clip-intersection predicate — RAW (unsnapped) pixel range,
   *  same inputs as before the PK.A4 unification, so every pre-existing
   *  test stays valid. */
  const commitSelection = useCallback(
    (currentX: number, shiftKey: boolean) => {
      const container = containerRef.current
      if (!container) return

      const containerRect = container.getBoundingClientRect()

      // Convert client coords to lane-relative pixels, then to seconds
      const rawLeft = Math.min(startX.current, currentX) - containerRect.left + scrollX
      const rawRight = Math.max(startX.current, currentX) - containerRect.left + scrollX

      const timeLeft = rawLeft / zoom
      const timeRight = rawRight / zoom

      // Find clips on this track that intersect the marquee time range
      const store = useTimelineStore.getState()
      const track = store.tracks.find((t) => t.id === trackId)
      if (!track) return

      const intersecting = track.clips
        .filter((c) => c.position < timeRight && c.position + c.duration > timeLeft)
        .map((c) => c.id)

      if (shiftKey) {
        // Union with prior selection
        const prior = store.selectedClipIds
        const merged = [...new Set([...prior, ...intersecting])]
        useTimelineStore.setState({
          selectedClipIds: merged,
          selectedClipId: merged[0] ?? null,
        })
      } else {
        useTimelineStore.setState({
          selectedClipIds: intersecting,
          selectedClipId: intersecting[0] ?? null,
        })
      }
    },
    [zoom, scrollX, trackId, containerRef],
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Only respond to primary button, and only when NOT over a clip.
      // (Clip.tsx calls stopPropagation on pointerdown so this handler
      // should never be reached from a clip body — this guard is belt-and-
      // suspenders to keep the negative test honest.)
      if (e.button !== 0) return
      if ((e.target as HTMLElement).closest('.clip')) return

      e.preventDefault()
      e.stopPropagation()
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)

      isDragging.current = true
      isDraggingRef.current = true
      startX.current = e.clientX
      startY.current = e.clientY
    },
    [],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging.current) return
      // Live preview: update the global selectionRegion on every move so
      // every mounted overlay's band tracks the drag in real time.
      const range = computeSnappedRange(e.clientX, e.altKey)
      if (range) useTimelineStore.getState().setSelectionRegion(range)
    },
    [computeSnappedRange],
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging.current) return

      isDragging.current = false

      const dx = Math.abs(e.clientX - startX.current)

      // Zero-area click (no meaningful drag distance): clear both outputs.
      if (dx < 2) {
        useTimelineStore.getState().clearSelection()
        useTimelineStore.getState().clearSelectionRegion()
      } else {
        commitSelection(e.clientX, e.shiftKey)
        const range = computeSnappedRange(e.clientX, e.altKey)
        // A raw drag can still clear the 2px floor yet snap in/out to the
        // SAME grid line at a coarse LOD (e.g. '4bar' at low zoom) — commit
        // a zero-width region as a clear, not a degenerate range.
        if (range && range.in !== range.out) {
          useTimelineStore.getState().setSelectionRegion(range)
        } else {
          useTimelineStore.getState().clearSelectionRegion()
        }
      }

      // Suppress the synthetic click from pointerup so the TrackLane's
      // onClick (which calls clearSelection) doesn't immediately undo our
      // selection commit. We use a one-shot click capture on the window.
      // Pattern from feedback_drag-end-suppresses-click.md.
      window.addEventListener(
        'click',
        (ev) => ev.stopPropagation(),
        { capture: true, once: true },
      )

      // Reset the ref one animation frame later (after the click fires)
      requestAnimationFrame(() => {
        isDraggingRef.current = false
      })
    },
    [commitSelection, computeSnappedRange],
  )

  const handlePointerCancel = useCallback(() => {
    isDragging.current = false
    isDraggingRef.current = false
    // No proper commit happened — matches the zero-area-click clear.
    useTimelineStore.getState().clearSelectionRegion()
  }, [])

  // Escape: mid-drag cancels WITHOUT changing clip selection (unchanged
  // NEGATIVE behavior) but DOES clear the in-progress selectionRegion.
  // Not-mid-drag: PK.A4 "Esc clears" an already-committed selectionRegion
  // (clip selection has its own, separate clear path — untouched here).
  // Mounted once per lane; redundant across instances but idempotent.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (isDragging.current) {
        isDragging.current = false
        isDraggingRef.current = false
        useTimelineStore.getState().clearSelectionRegion()
        return
      }
      if (useTimelineStore.getState().selectionRegion) {
        useTimelineStore.getState().clearSelectionRegion()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // This lane's pixel projection of the global selectionRegion.
  const band = selectionRegion
    ? { left: selectionRegion.in * zoom - scrollX, width: (selectionRegion.out - selectionRegion.in) * zoom }
    : null

  return (
    <div
      className="marquee-overlay"
      style={{
        position: 'absolute',
        inset: 0,
        // Pointer events enabled so we catch pointerdown on the background.
        // Clip.tsx calls stopPropagation so clip-body gestures never reach here.
        pointerEvents: 'all',
        // z-index: 0 so that clips (rendered AFTER this in DOM order, same
        // stacking context) naturally sit above and receive their own pointer
        // events. The overlay only catches events that fall through the gaps
        // between clips (i.e., empty track background).
        zIndex: 0,
        // The overlay itself is transparent — only the band is visible
        background: 'transparent',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      {band && band.width > 0 && (
        <div
          className="marquee-overlay__band"
          data-testid="selection-region-band"
          style={{ left: `${band.left}px`, width: `${band.width}px` }}
        />
      )}
    </div>
  )
}
