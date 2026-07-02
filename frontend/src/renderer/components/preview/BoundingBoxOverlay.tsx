/**
 * BoundingBoxOverlay — SVG overlay for direct manipulation of clip transforms.
 *
 * SVG render order (bottom to top):
 *   1. Rotation zone (outermost, catches rotation drags)
 *   2. Move zone (inside bounding box, catches repositioning)
 *   3. Bounding box outline (visual only)
 *   4. Resize handles (topmost, catch scale drags)
 *   5. Crosshairs (visual only)
 *
 * Later SVG elements render ON TOP and receive mouse events first.
 * Handles must be last interactive element to win over rotation zone.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClipTransform } from '../../../shared/types'
import { IDENTITY_TRANSFORM } from '../../../shared/types'
import type { CanvasLayout } from '../../utils/transform-coords'
import { computeCanvasLayout, transformToDom, mediaToDisplaySize } from '../../utils/transform-coords'
import { useUndoStore } from '../../stores/undo'

const HANDLE_SIZE = 14
const HANDLE_HALF = HANDLE_SIZE / 2
const ROTATION_ZONE = 20

type DragMode = 'move' | 'scale-tl' | 'scale-tr' | 'scale-bl' | 'scale-br' | 'scale-t' | 'scale-b' | 'scale-l' | 'scale-r' | 'rotate' | null

interface Props {
  transform: ClipTransform
  onChange: (t: ClipTransform) => void
  containerRef: React.RefObject<HTMLElement | null>
  sourceWidth: number
  sourceHeight: number
  canvasWidth: number
  canvasHeight: number
  aspectLocked: boolean
}

export default function BoundingBoxOverlay({
  transform,
  onChange,
  containerRef,
  sourceWidth,
  sourceHeight,
  canvasWidth,
  canvasHeight,
  aspectLocked,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [layout, setLayout] = useState<CanvasLayout | null>(null)
  const dragMode = useRef<DragMode>(null)
  const dragStart = useRef<{ mx: number; my: number; t: ClipTransform }>({ mx: 0, my: 0, t: IDENTITY_TRANSFORM })
  const [cursorStyle, setCursorStyle] = useState('default')
  const isDragging = useRef(false)

  // Recompute layout on resize
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => {
      setLayout(computeCanvasLayout(el, sourceWidth, sourceHeight, canvasWidth, canvasHeight))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [containerRef, sourceWidth, sourceHeight, canvasWidth, canvasHeight])

  // Compute transform delta for CSS preview (no backend round-trip)
  const computeTransformDelta = useCallback((dx: number, dy: number, ev: MouseEvent, mode: DragMode, capturedLayout: CanvasLayout): ClipTransform => {
    const t = { ...dragStart.current.t }
    const mediaScaleX = capturedLayout.canvasWidth / capturedLayout.canvasDisplayWidth
    const mediaScaleY = capturedLayout.canvasHeight / capturedLayout.canvasDisplayHeight

    switch (mode) {
      case 'move': {
        if (ev.shiftKey) {
          if (Math.abs(dx) > Math.abs(dy)) { t.x += dx * mediaScaleX } else { t.y += dy * mediaScaleY }
        } else {
          t.x += dx * mediaScaleX
          t.y += dy * mediaScaleY
        }
        break
      }
      case 'scale-br': case 'scale-tl': case 'scale-tr': case 'scale-bl': {
        const signX = (mode === 'scale-br' || mode === 'scale-tr') ? 1 : -1
        const signY = (mode === 'scale-br' || mode === 'scale-bl') ? 1 : -1
        const origDisplayW = (sourceWidth * dragStart.current.t.scaleX) / mediaScaleX
        const origDisplayH = (sourceHeight * dragStart.current.t.scaleY) / mediaScaleY
        const newScaleX = Math.max(0.01, ((origDisplayW + dx * signX) * mediaScaleX) / sourceWidth)
        const newScaleY = Math.max(0.01, ((origDisplayH + dy * signY) * mediaScaleY) / sourceHeight)
        const lock = ev.shiftKey ? !aspectLocked : aspectLocked
        if (lock) {
          const u = Math.max(newScaleX, newScaleY)
          t.scaleX = u; t.scaleY = u
        } else {
          t.scaleX = newScaleX; t.scaleY = newScaleY
        }
        break
      }
      case 'scale-t': case 'scale-b': {
        const sign = mode === 'scale-b' ? 1 : -1
        const origH = (sourceHeight * dragStart.current.t.scaleY) / mediaScaleY
        t.scaleY = Math.max(0.01, ((origH + dy * sign) * mediaScaleY) / sourceHeight)
        break
      }
      case 'scale-l': case 'scale-r': {
        const sign = mode === 'scale-r' ? 1 : -1
        const origW = (sourceWidth * dragStart.current.t.scaleX) / mediaScaleX
        t.scaleX = Math.max(0.01, ((origW + dx * sign) * mediaScaleX) / sourceWidth)
        break
      }
      case 'rotate': {
        const centerScreen = transformToDom(dragStart.current.t.x, dragStart.current.t.y, capturedLayout)
        const startAngle = Math.atan2(
          dragStart.current.my - centerScreen.y - capturedLayout.containerRect.top,
          dragStart.current.mx - centerScreen.x - capturedLayout.containerRect.left,
        )
        const currentAngle = Math.atan2(
          ev.clientY - centerScreen.y - capturedLayout.containerRect.top,
          ev.clientX - centerScreen.x - capturedLayout.containerRect.left,
        )
        let angleDeg = ((currentAngle - startAngle) * 180) / Math.PI
        if (ev.shiftKey) angleDeg = Math.round(angleDeg / 15) * 15
        t.rotation = dragStart.current.t.rotation + angleDeg
        break
      }
    }
    return t
  }, [sourceWidth, sourceHeight, aspectLocked])

  const handleMouseDown = useCallback((e: React.MouseEvent, mode: DragMode) => {
    if (!layout) return
    e.preventDefault()
    e.stopPropagation()
    dragMode.current = mode
    isDragging.current = true
    dragStart.current = { mx: e.clientX, my: e.clientY, t: { ...transform } }
    useUndoStore.getState().beginTransaction(`Transform: ${mode}`)

    const capturedLayout = layout

    // Find the canvas element for CSS transform preview (GPU-accelerated, 60fps)
    const canvasEl = containerRef.current?.querySelector('canvas') as HTMLCanvasElement | null
    const startT = dragStart.current.t

    // Store pending transform for bounding box visual update
    let pendingTransform = { ...transform }

    const handleMouseMove = (ev: MouseEvent) => {
      if (!dragMode.current) return
      const dx = ev.clientX - dragStart.current.mx
      const dy = ev.clientY - dragStart.current.my

      pendingTransform = computeTransformDelta(dx, dy, ev, dragMode.current, capturedLayout)

      // CSS transform on canvas for instant visual feedback (no backend round-trip)
      if (canvasEl) {
        const deltaTx = (pendingTransform.x - startT.x) / (capturedLayout.canvasWidth / capturedLayout.canvasDisplayWidth)
        const deltaTy = (pendingTransform.y - startT.y) / (capturedLayout.canvasHeight / capturedLayout.canvasDisplayHeight)
        const deltaScaleX = pendingTransform.scaleX / startT.scaleX
        const deltaScaleY = pendingTransform.scaleY / startT.scaleY
        const deltaRot = pendingTransform.rotation - startT.rotation

        canvasEl.style.transform = `translate(${deltaTx}px, ${deltaTy}px) scale(${deltaScaleX}, ${deltaScaleY}) rotate(${deltaRot}deg)`
        canvasEl.style.transformOrigin = 'center center'
      }

      // Update bounding box handles visually (cheap — just SVG recalc, no IPC)
      onChange(pendingTransform)
    }

    const handleMouseUp = () => {
      dragMode.current = null

      // Remove CSS transform — the real backend render will replace it
      if (canvasEl) {
        canvasEl.style.transform = ''
        canvasEl.style.transformOrigin = ''
      }

      // Commit final transform to store + trigger backend render
      onChange(pendingTransform)
      useUndoStore.getState().commitTransaction()

      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      requestAnimationFrame(() => { isDragging.current = false })
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }, [transform, onChange, layout, sourceWidth, sourceHeight, aspectLocked])

  // Arrow key nudge
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return
      e.preventDefault()
      const step = e.shiftKey ? 10 : 1
      const t = { ...transform }
      switch (e.key) {
        case 'ArrowLeft': t.x -= step; break
        case 'ArrowRight': t.x += step; break
        case 'ArrowUp': t.y -= step; break
        case 'ArrowDown': t.y += step; break
      }
      onChange(t)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [transform, onChange])

  // ALL hooks above. Safe to early-return now.
  if (!layout) return null

  const clipW = sourceWidth * transform.scaleX
  const clipH = sourceHeight * transform.scaleY
  const center = transformToDom(transform.x, transform.y, layout)
  const size = mediaToDisplaySize(clipW, clipH, layout)
  const boxX = center.x - size.w / 2
  const boxY = center.y - size.h / 2
  const boxW = size.w
  const boxH = size.h

  const handles = [
    { id: 'scale-tl' as const, cx: boxX, cy: boxY, cursor: 'nwse-resize' },
    { id: 'scale-tr' as const, cx: boxX + boxW, cy: boxY, cursor: 'nesw-resize' },
    { id: 'scale-bl' as const, cx: boxX, cy: boxY + boxH, cursor: 'nesw-resize' },
    { id: 'scale-br' as const, cx: boxX + boxW, cy: boxY + boxH, cursor: 'nwse-resize' },
    { id: 'scale-t' as const, cx: boxX + boxW / 2, cy: boxY, cursor: 'ns-resize' },
    { id: 'scale-b' as const, cx: boxX + boxW / 2, cy: boxY + boxH, cursor: 'ns-resize' },
    { id: 'scale-l' as const, cx: boxX, cy: boxY + boxH / 2, cursor: 'ew-resize' },
    { id: 'scale-r' as const, cx: boxX + boxW, cy: boxY + boxH / 2, cursor: 'ew-resize' },
  ]

  return (
    <svg
      ref={svgRef}
      className="bounding-box-overlay"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        cursor: cursorStyle,
      }}
    >
      {/* Layer 1 (bottom): Rotation zone — MUST be before handles in SVG order */}
      <rect
        x={boxX - ROTATION_ZONE} y={boxY - ROTATION_ZONE}
        width={boxW + ROTATION_ZONE * 2} height={boxH + ROTATION_ZONE * 2}
        fill="transparent"
        style={{ pointerEvents: 'all', cursor: 'crosshair' }}
        transform={`rotate(${transform.rotation} ${center.x} ${center.y})`}
        onMouseDown={(e) => {
          // Only trigger rotation if click is OUTSIDE the inner bounding box
          // (clicks inside will be caught by the move zone which renders on top)
          handleMouseDown(e, 'rotate')
        }}
        onMouseEnter={() => setCursorStyle('crosshair')}
      />

      {/* Layer 2: Move zone (inside bounding box) — renders on top of rotation zone */}
      <rect
        x={boxX} y={boxY} width={boxW} height={boxH}
        fill="transparent"
        style={{ pointerEvents: 'all', cursor: 'move' }}
        transform={`rotate(${transform.rotation} ${center.x} ${center.y})`}
        onMouseDown={(e) => handleMouseDown(e, 'move')}
        onMouseEnter={() => setCursorStyle('move')}
      />

      {/* Layer 3: Bounding box outline (visual only) */}
      <rect
        x={boxX} y={boxY} width={boxW} height={boxH}
        fill="none" stroke="#4ade80" strokeWidth={1.5} strokeDasharray="4 2"
        style={{ pointerEvents: 'none' }}
        transform={`rotate(${transform.rotation} ${center.x} ${center.y})`}
      />

      {/* Layer 4: Resize handles */}
      <g transform={`rotate(${transform.rotation} ${center.x} ${center.y})`}>
        {handles.map((h) => (
          <rect
            key={h.id}
            x={h.cx - HANDLE_HALF} y={h.cy - HANDLE_HALF}
            width={HANDLE_SIZE} height={HANDLE_SIZE}
            fill="#4ade80" stroke="#1a1a1a" strokeWidth={1}
            style={{ pointerEvents: 'all', cursor: h.cursor }}
            onMouseDown={(e) => handleMouseDown(e, h.id)}
            onMouseEnter={() => setCursorStyle(h.cursor)}
            onMouseLeave={() => setCursorStyle('default')}
          />
        ))}
      </g>

      {/* Layer 5 (topmost interactive): Rotation handle — visible line + circle above top center */}
      <g transform={`rotate(${transform.rotation} ${center.x} ${center.y})`}>
        <line
          x1={boxX + boxW / 2} y1={boxY}
          x2={boxX + boxW / 2} y2={boxY - 15}
          stroke="#4ade80" strokeWidth={1.5}
          style={{ pointerEvents: 'none' }}
        />
        <circle
          cx={boxX + boxW / 2} cy={boxY - 15} r={6}
          fill="#1a1a1a" stroke="#4ade80" strokeWidth={1.5}
          style={{ pointerEvents: 'all', cursor: 'grab' }}
          onMouseDown={(e) => handleMouseDown(e, 'rotate')}
          onMouseEnter={() => setCursorStyle('grab')}
          onMouseLeave={() => setCursorStyle('default')}
        />
      </g>

      {/* Layer 5: Crosshairs (visual only) */}
      {(transform.anchorX !== 0 || transform.anchorY !== 0) && (() => {
        const anchor = transformToDom(transform.x + transform.anchorX, transform.y + transform.anchorY, layout)
        return (
          <g>
            <line x1={anchor.x - 8} y1={anchor.y} x2={anchor.x + 8} y2={anchor.y} stroke="#ef4444" strokeWidth={1.5} style={{ pointerEvents: 'none' }} />
            <line x1={anchor.x} y1={anchor.y - 8} x2={anchor.x} y2={anchor.y + 8} stroke="#ef4444" strokeWidth={1.5} style={{ pointerEvents: 'none' }} />
          </g>
        )
      })()}

      {transform.anchorX === 0 && transform.anchorY === 0 && (
        <g>
          <line x1={center.x - 6} y1={center.y} x2={center.x + 6} y2={center.y} stroke="#4ade80" strokeWidth={1} strokeOpacity={0.5} style={{ pointerEvents: 'none' }} />
          <line x1={center.x} y1={center.y - 6} x2={center.x} y2={center.y + 6} stroke="#4ade80" strokeWidth={1} strokeOpacity={0.5} style={{ pointerEvents: 'none' }} />
        </g>
      )}
    </svg>
  )
}
