/**
 * SnapGuides — renders center and edge snap indicator lines on the preview canvas.
 *
 * Shows green dashed lines when a clip's position is within snap tolerance
 * of the canvas center or edges.
 */
import { useEffect, useState } from 'react'
import type { ClipTransform } from '../../../shared/types'
import type { CanvasLayout } from '../../utils/transform-coords'
import { computeCanvasLayout, transformToDom, mediaToDisplaySize } from '../../utils/transform-coords'

const SNAP_TOLERANCE_PX = 8
const GUIDE_COLOR = '#4ade80'
const GUIDE_OPACITY = 0.6

interface Props {
  transform: ClipTransform
  sourceWidth: number
  sourceHeight: number
  containerRef: React.RefObject<HTMLElement | null>
  canvasWidth: number
  canvasHeight: number
  enabled: boolean
}

export default function SnapGuides({ transform, sourceWidth, sourceHeight, containerRef, canvasWidth, canvasHeight, enabled }: Props) {
  const [layout, setLayout] = useState<CanvasLayout | null>(null)

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

  if (!layout || !enabled) return null

  const center = transformToDom(transform.x, transform.y, layout)
  const clipW = sourceWidth * transform.scaleX
  const clipH = sourceHeight * transform.scaleY
  const size = mediaToDisplaySize(clipW, clipH, layout)

  const canvasCenterX = layout.canvasOffsetX + layout.canvasDisplayWidth / 2
  const canvasCenterY = layout.canvasOffsetY + layout.canvasDisplayHeight / 2

  const clipLeft = center.x - size.w / 2
  const clipRight = center.x + size.w / 2
  const clipTop = center.y - size.h / 2
  const clipBottom = center.y + size.h / 2

  const canvasLeft = layout.canvasOffsetX
  const canvasRight = layout.canvasOffsetX + layout.canvasDisplayWidth
  const canvasTop = layout.canvasOffsetY
  const canvasBottom = layout.canvasOffsetY + layout.canvasDisplayHeight

  const guides: { x1: number; y1: number; x2: number; y2: number }[] = []

  if (Math.abs(center.y - canvasCenterY) < SNAP_TOLERANCE_PX) {
    guides.push({ x1: canvasLeft, y1: canvasCenterY, x2: canvasRight, y2: canvasCenterY })
  }
  if (Math.abs(center.x - canvasCenterX) < SNAP_TOLERANCE_PX) {
    guides.push({ x1: canvasCenterX, y1: canvasTop, x2: canvasCenterX, y2: canvasBottom })
  }
  if (Math.abs(clipLeft - canvasLeft) < SNAP_TOLERANCE_PX) {
    guides.push({ x1: canvasLeft, y1: canvasTop, x2: canvasLeft, y2: canvasBottom })
  }
  if (Math.abs(clipRight - canvasRight) < SNAP_TOLERANCE_PX) {
    guides.push({ x1: canvasRight, y1: canvasTop, x2: canvasRight, y2: canvasBottom })
  }
  if (Math.abs(clipTop - canvasTop) < SNAP_TOLERANCE_PX) {
    guides.push({ x1: canvasLeft, y1: canvasTop, x2: canvasRight, y2: canvasTop })
  }
  if (Math.abs(clipBottom - canvasBottom) < SNAP_TOLERANCE_PX) {
    guides.push({ x1: canvasLeft, y1: canvasBottom, x2: canvasRight, y2: canvasBottom })
  }

  if (guides.length === 0) return null

  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    >
      {guides.map((g, i) => (
        <line
          key={i}
          x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2}
          stroke={GUIDE_COLOR}
          strokeWidth={1}
          strokeDasharray="4 3"
          strokeOpacity={GUIDE_OPACITY}
        />
      ))}
    </svg>
  )
}
