/**
 * MarqueeOverlay — rubber-band clip selection for the timeline track lane.
 *
 * UE.3: Drag-rectangle on track background area selects every clip whose
 * time-range intersects the marquee rect. Shift held at pointer-up adds
 * to the existing selection (union). Escape mid-drag cancels.
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
 *   pointerdown on track background → setPointerCapture → move draws rect →
 *   pointerup commits selection → click is suppressed by isDragging flag.
 *
 * Clip intersection: a clip at [clipStart, clipEnd] intersects
 * [rectLeft, rectRight] when clipStart < rectRight && clipEnd > rectLeft.
 * Coordinate space is timeline-seconds (horizontal) × anything (vertical —
 * the full lane height is always selected since the overlay covers a single
 * track's lane and clips fill the full lane height).
 *
 * NOTE: This component attaches pointer handlers to the track background.
 * The Clip component calls stopPropagation on pointerdown, so clicks/drags
 * that start ON a clip body never reach this overlay.
 *
 * T1 (2026-07-02) investigation — 'range-select' cursor tool (EffectBrowser
 * [tool] tab): this overlay is mounted unconditionally in TrackLane (Track.tsx)
 * and is NOT gated on any cursor-tool state — drag-select on empty track
 * background already works in every tool mode, including the default 'select'
 * tool. Gating it behind cursorTool === 'range-select' would BREAK existing
 * multi-select UX (users currently rubber-band select without switching tools).
 * Per T1 packet decision: left un-gated. The 'range-select' tool button/hotkey
 * is wired to set cursorTool (useLayoutStore) for statusbar/chip display and
 * shortcut-parity, but does not change this overlay's behavior — it was
 * already-live. See docs/plans/2026-07-02-master-tuneup-plan.md WS1.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTimelineStore } from '../../stores/timeline'

interface MarqueeRect {
  /** Left edge in pixels (CSS left relative to the lane container). */
  left: number
  /** Width in pixels (always ≥0). */
  width: number
  top: number
  height: number
}

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
  const [rect, setRect] = useState<MarqueeRect | null>(null)
  // Ref mirrors isDragging for click-suppression access in the click handler
  const isDraggingRef = useRef(false)

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

      const container = containerRef.current
      if (!container) return
      const containerRect = container.getBoundingClientRect()
      const laneLeft = e.clientX - containerRect.left
      const laneTop = e.clientY - containerRect.top

      setRect({ left: laneLeft, width: 0, top: laneTop, height: 0 })
    },
    [containerRef],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging.current) return

      const container = containerRef.current
      if (!container) return
      const containerRect = container.getBoundingClientRect()

      const x0 = startX.current - containerRect.left
      const y0 = startY.current - containerRect.top
      const x1 = e.clientX - containerRect.left
      const y1 = e.clientY - containerRect.top

      setRect({
        left: Math.min(x0, x1),
        width: Math.abs(x1 - x0),
        top: Math.min(y0, y1),
        height: Math.abs(y1 - y0),
      })
    },
    [containerRef],
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging.current) return

      isDragging.current = false
      setRect(null)

      const container = containerRef.current
      if (!container) return
      const containerRect = container.getBoundingClientRect()
      const dx = Math.abs(e.clientX - startX.current)

      // Zero-area click (no meaningful drag distance): clear selection
      if (dx < 2) {
        useTimelineStore.getState().clearSelection()
      } else {
        commitSelection(e.clientX, e.shiftKey)
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
    [commitSelection, containerRef],
  )

  const handlePointerCancel = useCallback(() => {
    isDragging.current = false
    isDraggingRef.current = false
    setRect(null)
  }, [])

  // Escape mid-drag cancels without changing selection
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isDragging.current) {
        isDragging.current = false
        isDraggingRef.current = false
        setRect(null)
        // Do NOT change selection
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

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
        // The overlay itself is transparent — only the rect is visible
        background: 'transparent',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      {rect && rect.width > 1 && (
        <div
          className="marquee-overlay__rect"
          style={{
            position: 'absolute',
            left: `${rect.left}px`,
            top: `${rect.top}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
            border: '1px solid #4ade80',
            background: 'rgba(74, 222, 128, 0.08)',
            pointerEvents: 'none',
            boxSizing: 'border-box',
          }}
        />
      )}
    </div>
  )
}
