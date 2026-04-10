/**
 * BoundingBoxOverlay — SVG overlay for direct manipulation of clip transforms.
 *
 * Renders 8 resize handles (4 corners + 4 midpoints), rotation zone,
 * and anchor point crosshair on top of the PreviewCanvas.
 *
 * Integration rules:
 * - During drag, applies CSS transform on a cached frame for 60fps feedback
 * - Sends final values to backend on mouseup (or debounced)
 * - Wraps each drag in an undo transaction (mousedown→commitTransaction on mouseup)
 * - Coordinates converted via transform-coords utilities
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClipTransform } from '../../../shared/types'
import { IDENTITY_TRANSFORM } from '../../../shared/types'
import type { CanvasLayout } from '../../utils/transform-coords'
import { computeCanvasLayout, transformToDom, mediaToDisplaySize, domToTransform } from '../../utils/transform-coords'
import { useUndoStore } from '../../stores/undo'

const HANDLE_SIZE = 10
const HANDLE_HALF = HANDLE_SIZE / 2
const ROTATION_ZONE = 20 // px outside corners for rotation cursor

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

  if (!layout) return null

  // Compute bounding box in display coords
  const clipW = sourceWidth * transform.scaleX
  const clipH = sourceHeight * transform.scaleY
  const center = transformToDom(transform.x, transform.y, layout)
  const size = mediaToDisplaySize(clipW, clipH, layout)
  const boxX = center.x - size.w / 2
  const boxY = center.y - size.h / 2
  const boxW = size.w
  const boxH = size.h

  // Handle positions (corners + midpoints)
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

  const handleMouseDown = useCallback((e: React.MouseEvent, mode: DragMode) => {
    e.preventDefault()
    e.stopPropagation()
    dragMode.current = mode
    dragStart.current = { mx: e.clientX, my: e.clientY, t: { ...transform } }
    useUndoStore.getState().beginTransaction(`Transform: ${mode}`)

    const handleMouseMove = (ev: MouseEvent) => {
      if (!dragMode.current || !layout) return
      const dx = ev.clientX - dragStart.current.mx
      const dy = ev.clientY - dragStart.current.my
      const t = { ...dragStart.current.t }
      const mediaScaleX = layout.canvasWidth / layout.canvasDisplayWidth
      const mediaScaleY = layout.canvasHeight / layout.canvasDisplayHeight

      switch (dragMode.current) {
        case 'move': {
          // Shift constrains to axis
          if (ev.shiftKey) {
            if (Math.abs(dx) > Math.abs(dy)) {
              t.x += dx * mediaScaleX
            } else {
              t.y += dy * mediaScaleY
            }
          } else {
            t.x += dx * mediaScaleX
            t.y += dy * mediaScaleY
          }
          break
        }
        case 'scale-br': {
          const origW = sourceWidth * dragStart.current.t.scaleX
          const origDisplayW = origW / mediaScaleX
          const origDisplayH = (sourceHeight * dragStart.current.t.scaleY) / mediaScaleY
          const newDisplayW = origDisplayW + dx
          const newDisplayH = origDisplayH + dy
          const newScaleX = Math.max(0.01, (newDisplayW * mediaScaleX) / sourceWidth)
          const newScaleY = Math.max(0.01, (newDisplayH * mediaScaleY) / sourceHeight)
          const lock = ev.shiftKey ? !aspectLocked : aspectLocked
          if (lock) {
            const uniformScale = Math.max(newScaleX, newScaleY)
            t.scaleX = uniformScale
            t.scaleY = uniformScale
          } else {
            t.scaleX = newScaleX
            t.scaleY = newScaleY
          }
          break
        }
        case 'scale-tl': {
          const origDisplayW = (sourceWidth * dragStart.current.t.scaleX) / mediaScaleX
          const origDisplayH = (sourceHeight * dragStart.current.t.scaleY) / mediaScaleY
          const newDisplayW = origDisplayW - dx
          const newDisplayH = origDisplayH - dy
          const newScaleX = Math.max(0.01, (newDisplayW * mediaScaleX) / sourceWidth)
          const newScaleY = Math.max(0.01, (newDisplayH * mediaScaleY) / sourceHeight)
          const lock = ev.shiftKey ? !aspectLocked : aspectLocked
          if (lock) {
            const uniformScale = Math.max(newScaleX, newScaleY)
            t.scaleX = uniformScale
            t.scaleY = uniformScale
          } else {
            t.scaleX = newScaleX
            t.scaleY = newScaleY
          }
          break
        }
        case 'scale-tr':
        case 'scale-bl': {
          const signX = dragMode.current === 'scale-tr' ? 1 : -1
          const signY = dragMode.current === 'scale-tr' ? -1 : 1
          const origDisplayW = (sourceWidth * dragStart.current.t.scaleX) / mediaScaleX
          const origDisplayH = (sourceHeight * dragStart.current.t.scaleY) / mediaScaleY
          const newDisplayW = origDisplayW + dx * signX
          const newDisplayH = origDisplayH + dy * signY
          const newScaleX = Math.max(0.01, (newDisplayW * mediaScaleX) / sourceWidth)
          const newScaleY = Math.max(0.01, (newDisplayH * mediaScaleY) / sourceHeight)
          const lock = ev.shiftKey ? !aspectLocked : aspectLocked
          if (lock) {
            const uniformScale = Math.max(newScaleX, newScaleY)
            t.scaleX = uniformScale
            t.scaleY = uniformScale
          } else {
            t.scaleX = newScaleX
            t.scaleY = newScaleY
          }
          break
        }
        case 'scale-t':
        case 'scale-b': {
          const sign = dragMode.current === 'scale-b' ? 1 : -1
          const origDisplayH = (sourceHeight * dragStart.current.t.scaleY) / mediaScaleY
          const newDisplayH = origDisplayH + dy * sign
          t.scaleY = Math.max(0.01, (newDisplayH * mediaScaleY) / sourceHeight)
          break
        }
        case 'scale-l':
        case 'scale-r': {
          const sign = dragMode.current === 'scale-r' ? 1 : -1
          const origDisplayW = (sourceWidth * dragStart.current.t.scaleX) / mediaScaleX
          const newDisplayW = origDisplayW + dx * sign
          t.scaleX = Math.max(0.01, (newDisplayW * mediaScaleX) / sourceWidth)
          break
        }
        case 'rotate': {
          const centerScreen = transformToDom(dragStart.current.t.x, dragStart.current.t.y, layout)
          const startAngle = Math.atan2(
            dragStart.current.my - centerScreen.y - layout.containerRect.top,
            dragStart.current.mx - centerScreen.x - layout.containerRect.left,
          )
          const currentAngle = Math.atan2(
            ev.clientY - centerScreen.y - layout.containerRect.top,
            ev.clientX - centerScreen.x - layout.containerRect.left,
          )
          let angleDeg = ((currentAngle - startAngle) * 180) / Math.PI
          // Shift snaps to 15-degree increments
          if (ev.shiftKey) {
            angleDeg = Math.round(angleDeg / 15) * 15
          }
          t.rotation = dragStart.current.t.rotation + angleDeg
          break
        }
      }

      onChange(t)
    }

    const handleMouseUp = () => {
      dragMode.current = null
      useUndoStore.getState().commitTransaction()
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
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
      {/* Bounding box outline */}
      <rect
        x={boxX}
        y={boxY}
        width={boxW}
        height={boxH}
        fill="none"
        stroke="#4ade80"
        strokeWidth={1.5}
        strokeDasharray="4 2"
        style={{ pointerEvents: 'none' }}
        transform={`rotate(${transform.rotation} ${center.x} ${center.y})`}
      />

      {/* Move zone (inside bounding box) */}
      <rect
        x={boxX}
        y={boxY}
        width={boxW}
        height={boxH}
        fill="transparent"
        style={{ pointerEvents: 'all', cursor: 'move' }}
        transform={`rotate(${transform.rotation} ${center.x} ${center.y})`}
        onMouseDown={(e) => handleMouseDown(e, 'move')}
        onMouseEnter={() => setCursorStyle('move')}
      />

      {/* Resize handles */}
      <g transform={`rotate(${transform.rotation} ${center.x} ${center.y})`}>
        {handles.map((h) => (
          <rect
            key={h.id}
            x={h.cx - HANDLE_HALF}
            y={h.cy - HANDLE_HALF}
            width={HANDLE_SIZE}
            height={HANDLE_SIZE}
            fill="#4ade80"
            stroke="#1a1a1a"
            strokeWidth={1}
            style={{ pointerEvents: 'all', cursor: h.cursor }}
            onMouseDown={(e) => handleMouseDown(e, h.id)}
            onMouseEnter={() => setCursorStyle(h.cursor)}
            onMouseLeave={() => setCursorStyle('default')}
          />
        ))}
      </g>

      {/* Rotation zone (invisible rect outside corners) */}
      <rect
        x={boxX - ROTATION_ZONE}
        y={boxY - ROTATION_ZONE}
        width={boxW + ROTATION_ZONE * 2}
        height={boxH + ROTATION_ZONE * 2}
        fill="transparent"
        style={{ pointerEvents: 'all', cursor: 'crosshair' }}
        transform={`rotate(${transform.rotation} ${center.x} ${center.y})`}
        onMouseDown={(e) => {
          // Only trigger rotation if click is OUTSIDE the bounding box
          const rect = svgRef.current?.getBoundingClientRect()
          if (!rect) return
          const relX = e.clientX - rect.left
          const relY = e.clientY - rect.top
          if (relX >= boxX && relX <= boxX + boxW && relY >= boxY && relY <= boxY + boxH) return
          handleMouseDown(e, 'rotate')
        }}
        onMouseEnter={() => setCursorStyle('crosshair')}
      />

      {/* Anchor point crosshair */}
      {(transform.anchorX !== 0 || transform.anchorY !== 0) && (() => {
        const anchor = transformToDom(
          transform.x + transform.anchorX,
          transform.y + transform.anchorY,
          layout,
        )
        return (
          <g>
            <line x1={anchor.x - 8} y1={anchor.y} x2={anchor.x + 8} y2={anchor.y} stroke="#ef4444" strokeWidth={1.5} style={{ pointerEvents: 'none' }} />
            <line x1={anchor.x} y1={anchor.y - 8} x2={anchor.x} y2={anchor.y + 8} stroke="#ef4444" strokeWidth={1.5} style={{ pointerEvents: 'none' }} />
          </g>
        )
      })()}

      {/* Center crosshair (when anchor is at default) */}
      {transform.anchorX === 0 && transform.anchorY === 0 && (
        <g>
          <line x1={center.x - 6} y1={center.y} x2={center.x + 6} y2={center.y} stroke="#4ade80" strokeWidth={1} strokeOpacity={0.5} style={{ pointerEvents: 'none' }} />
          <line x1={center.x} y1={center.y - 6} x2={center.x} y2={center.y + 6} stroke="#4ade80" strokeWidth={1} strokeOpacity={0.5} style={{ pointerEvents: 'none' }} />
        </g>
      )}
    </svg>
  )
}
