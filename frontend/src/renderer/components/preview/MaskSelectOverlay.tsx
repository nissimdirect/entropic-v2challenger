/**
 * MaskSelectOverlay — Preview canvas marquee for MK.4.
 *
 * Renders on top of the preview canvas. Captures pointer events exclusively
 * when previewToolMode is 'marquee-rect' or 'marquee-ellipse'.
 *
 * Interaction model:
 *   pointerdown  → anchor the drag origin; setPointerCapture so mouseup outside still fires
 *   pointermove  → update marqueeInProgress (DOM-space rect); suppress synthetic click flag
 *   pointerup ≥4px → commit → addMatteNode with frame-coord params
 *   pointerup <4px → deselect (click-off), suppress if isDragging was set (drag-end-suppresses-click)
 *   Escape (keydown while dragging) → cancel without committing a node
 *
 * Letterbox coordinate mapping reuses BoundingBoxOverlay.tsx:53–66 pattern via
 * computeCanvasLayout + the domToFrameCoords helper below.
 * // letterbox mapping from BoundingBoxOverlay.tsx:53 (computeCanvasLayout + ResizeObserver)
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { computeCanvasLayout } from '../../utils/transform-coords'
import type { CanvasLayout } from '../../utils/transform-coords'
import { useTimelineStore } from '../../stores/timeline'
import { randomUUID } from '../../utils'
import type { MatteNode, MatteNodeKind, MatteOp } from '../../../shared/types'

const DRAG_THRESHOLD_PX = 4

interface Props {
  containerRef: React.RefObject<HTMLElement | null>
  canvasWidth: number
  canvasHeight: number
  clipId: string | null
}

/**
 * Convert a DOM-space point inside the container into frame-normalized coords.
 * Frame coords: x ∈ [0, 1] from left edge, y ∈ [0, 1] from top edge.
 *
 * Exact-coords test:
 *   1920×1080 frame in 800×450 canvas with 25px letterbox on each side (top + bottom).
 *   displayScale = min(800/1920, 450/1080) = min(0.4167, 0.4167) = 0.4167
 *   canvasDisplayWidth = 1920 * 0.4167 = 800px (fills width)
 *   canvasDisplayHeight = 1080 * 0.4167 = 450px (fills height)
 *   canvasOffsetX = (800 - 800) / 2 = 0
 *   canvasOffsetY = (500 - 450) / 2 = 25px   ← the 25px letterbox
 *   A click at domX=400, domY=250 (container-relative):
 *     relX = 400 - 0 = 400   relY = 250 - 25 = 225
 *     fx = 400 / 800 = 0.5   fy = 225 / 450 = 0.5   → center pixel, correct.
 */
function domToFrameCoords(
  domX: number,
  domY: number,
  layout: CanvasLayout,
  containerRect: DOMRect,
): { fx: number; fy: number } {
  // Position relative to container top-left
  const relX = domX - containerRect.left - layout.canvasOffsetX
  const relY = domY - containerRect.top - layout.canvasOffsetY
  // Normalize to [0,1] over the canvas display area
  const fx = relX / layout.canvasDisplayWidth
  const fy = relY / layout.canvasDisplayHeight
  return { fx, fy }
}

export default function MaskSelectOverlay({
  containerRef,
  canvasWidth,
  canvasHeight,
  clipId,
}: Props) {
  // // letterbox mapping from BoundingBoxOverlay.tsx:53 (computeCanvasLayout + ResizeObserver)
  const [layout, setLayout] = useState<CanvasLayout | null>(null)

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => {
      setLayout(computeCanvasLayout(el, canvasWidth, canvasHeight, canvasWidth, canvasHeight))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [containerRef, canvasWidth, canvasHeight])

  const toolMode = useTimelineStore((s) => s.previewToolMode)
  const marqueeInProgress = useTimelineStore((s) => s.marqueeInProgress)
  const committedMaskSelection = useTimelineStore((s) => s.committedMaskSelection)

  // Track drag state (ref, not state — must not re-render during drag)
  const isDragging = useRef(false)
  const dragOrigin = useRef<{ x: number; y: number } | null>(null)
  // Modifier state captured at pointerdown (PS convention: modifier@down sets boolean op)
  const opAtDown = useRef<MatteOp>('add')

  const svgRef = useRef<SVGSVGElement>(null)

  // Keyboard Escape handler for mid-drag cancel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return
      if (!isDragging.current) return
      e.preventDefault()
      e.stopPropagation()
      isDragging.current = false
      dragOrigin.current = null
      useTimelineStore.getState().setMarqueeInProgress(null)
    }
    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [])

  const handlePointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!layout || !clipId) return
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()

    // Determine boolean op from modifier state AT pointerdown (MASKING-INTERACTIONS.md §2)
    if (e.shiftKey && e.altKey) opAtDown.current = 'intersect'
    else if (e.shiftKey) opAtDown.current = 'add'
    else if (e.altKey) opAtDown.current = 'subtract'
    else opAtDown.current = 'add'

    isDragging.current = false  // not a drag yet — threshold not met
    dragOrigin.current = { x: e.clientX, y: e.clientY }

    // Capture so pointerup fires even if pointer leaves window
    svgRef.current?.setPointerCapture(e.pointerId)

    useTimelineStore.getState().setMarqueeInProgress({
      x1: e.clientX,
      y1: e.clientY,
      x2: e.clientX,
      y2: e.clientY,
    })
  }, [layout, clipId])

  const handlePointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragOrigin.current || !layout) return
    const dx = e.clientX - dragOrigin.current.x
    const dy = e.clientY - dragOrigin.current.y
    if (!isDragging.current && (Math.abs(dx) >= DRAG_THRESHOLD_PX || Math.abs(dy) >= DRAG_THRESHOLD_PX)) {
      isDragging.current = true
    }
    if (!isDragging.current) return

    useTimelineStore.getState().setMarqueeInProgress({
      x1: dragOrigin.current.x,
      y1: dragOrigin.current.y,
      x2: e.clientX,
      y2: e.clientY,
    })
  }, [layout])

  const handlePointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragOrigin.current || !layout || !clipId) {
      dragOrigin.current = null
      return
    }

    const wasDragging = isDragging.current
    isDragging.current = false
    dragOrigin.current = null

    const store = useTimelineStore.getState()

    if (!wasDragging) {
      // Click (not a drag) — deselect active selection (drag-end-suppresses-click:
      // isDragging was false, so this is a genuine click, PS deselect-on-click-empty)
      store.setMarqueeInProgress(null)
      store.clearMaskSelection()
      return
    }

    // Drag ended — commit to MatteNode
    const rect = store.marqueeInProgress
    store.setMarqueeInProgress(null)
    if (!rect || !containerRef.current) return

    const containerRect = containerRef.current.getBoundingClientRect()
    const p1 = domToFrameCoords(rect.x1, rect.y1, layout, containerRect)
    const p2 = domToFrameCoords(rect.x2, rect.y2, layout, containerRect)

    const fx = Math.min(p1.fx, p2.fx)
    const fy = Math.min(p1.fy, p2.fy)
    const fw = Math.abs(p2.fx - p1.fx)
    const fh = Math.abs(p2.fy - p1.fy)

    // Zero-area drag guard: ensure the committed rect covers at least DRAG_THRESHOLD_PX
    // in display pixels on both axes (fw/fh are normalized [0,1] over the canvas display area).
    // Converts back to display pixels: fw * canvasDisplayWidth.
    if (fw * layout.canvasDisplayWidth < DRAG_THRESHOLD_PX || fh * layout.canvasDisplayHeight < DRAG_THRESHOLD_PX) {
      store.clearMaskSelection()
      return
    }

    const kind: MatteNodeKind = store.previewToolMode === 'marquee-ellipse' ? 'ellipse' : 'rect'

    const node: MatteNode = {
      id: randomUUID(),
      kind,
      params: kind === 'rect'
        ? { x: fx, y: fy, w: fw, h: fh }
        : { cx: fx + fw / 2, cy: fy + fh / 2, rx: fw / 2, ry: fh / 2 },
      op: opAtDown.current,
      invert: false,
      feather: 0,
      growShrink: 0,
      enabled: true,
    }

    store.addMatteNode(clipId, node)
    // Record the committed selection for delete/fill ops (ephemeral UI state — not undoable)
    useTimelineStore.setState({ committedMaskSelection: { nodeId: node.id, clipId } })
  }, [layout, clipId, canvasWidth, canvasHeight, containerRef])

  // If no tool mode active, render nothing (pointerEvents:none shortcut — BoundingBox handles)
  if (!toolMode) return null

  // Compute the in-progress visual (DOM-space rect to overlay coords)
  let inProgressRect: { x: number; y: number; w: number; h: number } | null = null
  if (marqueeInProgress && layout && containerRef.current) {
    const containerRect = containerRef.current.getBoundingClientRect()
    const x1 = marqueeInProgress.x1 - containerRect.left
    const y1 = marqueeInProgress.y1 - containerRect.top
    const x2 = marqueeInProgress.x2 - containerRect.left
    const y2 = marqueeInProgress.y2 - containerRect.top
    inProgressRect = {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      w: Math.abs(x2 - x1),
      h: Math.abs(y2 - y1),
    }
  }

  // Committed selection visual — resolve from store
  let committedRect: { x: number; y: number; w: number; h: number; kind: MatteNodeKind } | null = null
  if (committedMaskSelection && layout && containerRef.current) {
    const tracks = useTimelineStore.getState().tracks
    let foundNode: MatteNode | undefined
    for (const track of tracks) {
      const clip = track.clips.find((c) => c.id === committedMaskSelection.clipId)
      if (clip) {
        foundNode = clip.maskStack?.find((n) => n.id === committedMaskSelection.nodeId)
        break
      }
    }
    if (foundNode) {
      const containerRect = containerRef.current.getBoundingClientRect()
      const p = foundNode.params
      let normX: number, normY: number, normW: number, normH: number
      if (foundNode.kind === 'rect') {
        normX = p.x as number; normY = p.y as number
        normW = p.w as number; normH = p.h as number
      } else {
        // ellipse: cx,cy,rx,ry
        normX = (p.cx as number) - (p.rx as number)
        normY = (p.cy as number) - (p.ry as number)
        normW = (p.rx as number) * 2
        normH = (p.ry as number) * 2
      }
      // Convert normalized frame coords back to DOM-space within SVG
      const domX = normX * layout.canvasDisplayWidth + layout.canvasOffsetX
      const domY = normY * layout.canvasDisplayHeight + layout.canvasOffsetY
      const domW = normW * layout.canvasDisplayWidth
      const domH = normH * layout.canvasDisplayHeight
      committedRect = { x: domX, y: domY, w: domW, h: domH, kind: foundNode.kind }
    }
  }

  const isDrawingEllipse = toolMode === 'marquee-ellipse'

  return (
    <svg
      ref={svgRef}
      className="mask-select-overlay"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        cursor: 'crosshair',
        pointerEvents: 'all',
        userSelect: 'none',
        // Outside-dim: 65% opacity overlay when there is a committed selection
        overflow: 'visible',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Committed selection: dashed MOD-violet outline + 65% outside-dim */}
      {committedRect && (
        <>
          {/* Outside dim: full-canvas dark overlay with selection cut out */}
          {committedRect.kind === 'rect' ? (
            <>
              <defs>
                <mask id="mask-select-committed-cutout">
                  <rect x="0" y="0" width="100%" height="100%" fill="white" />
                  <rect
                    x={committedRect.x}
                    y={committedRect.y}
                    width={committedRect.w}
                    height={committedRect.h}
                    fill="black"
                  />
                </mask>
              </defs>
              <rect
                x="0" y="0" width="100%" height="100%"
                fill="rgba(0,0,0,0.65)"
                mask="url(#mask-select-committed-cutout)"
                style={{ pointerEvents: 'none' }}
              />
              <rect
                x={committedRect.x}
                y={committedRect.y}
                width={committedRect.w}
                height={committedRect.h}
                fill="none"
                stroke="#8F7DFF"
                strokeWidth={1}
                strokeDasharray="4 2"
                style={{ pointerEvents: 'none' }}
              />
            </>
          ) : (
            <>
              <defs>
                <mask id="mask-select-committed-cutout-ellipse">
                  <rect x="0" y="0" width="100%" height="100%" fill="white" />
                  <ellipse
                    cx={committedRect.x + committedRect.w / 2}
                    cy={committedRect.y + committedRect.h / 2}
                    rx={committedRect.w / 2}
                    ry={committedRect.h / 2}
                    fill="black"
                  />
                </mask>
              </defs>
              <rect
                x="0" y="0" width="100%" height="100%"
                fill="rgba(0,0,0,0.65)"
                mask="url(#mask-select-committed-cutout-ellipse)"
                style={{ pointerEvents: 'none' }}
              />
              <ellipse
                cx={committedRect.x + committedRect.w / 2}
                cy={committedRect.y + committedRect.h / 2}
                rx={committedRect.w / 2}
                ry={committedRect.h / 2}
                fill="none"
                stroke="#8F7DFF"
                strokeWidth={1}
                strokeDasharray="4 2"
                style={{ pointerEvents: 'none' }}
              />
            </>
          )}
        </>
      )}

      {/* In-progress drag rubber-band */}
      {inProgressRect && (
        <>
          {isDrawingEllipse ? (
            <ellipse
              cx={inProgressRect.x + inProgressRect.w / 2}
              cy={inProgressRect.y + inProgressRect.h / 2}
              rx={inProgressRect.w / 2}
              ry={inProgressRect.h / 2}
              fill="rgba(143,125,255,0.12)"
              stroke="#8F7DFF"
              strokeWidth={1}
              strokeDasharray="4 2"
              style={{ pointerEvents: 'none' }}
            />
          ) : (
            <rect
              x={inProgressRect.x}
              y={inProgressRect.y}
              width={inProgressRect.w}
              height={inProgressRect.h}
              fill="rgba(143,125,255,0.12)"
              stroke="#8F7DFF"
              strokeWidth={1}
              strokeDasharray="4 2"
              style={{ pointerEvents: 'none' }}
            />
          )}
        </>
      )}
    </svg>
  )
}
