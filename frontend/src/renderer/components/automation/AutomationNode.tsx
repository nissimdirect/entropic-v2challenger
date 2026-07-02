/**
 * Draggable circle on the automation line.
 * Drag = move time (X) and value (Y).
 * Shift+drag = 10x precision. Alt+click = cycle curve mode. Delete = remove.
 *
 * PUX.5 — Hit targets & drag signifiers:
 * - Transparent hit ring r=12 behind the visual glyph gives a 24px effective
 *   target (≥ DESIGN-SPEC §4 floor + WCAG 2.5.8 minimum).
 * - Pattern from react-moveable: enlarge transparent hit area behind the
 *   visual glyph; z-order puts the hit circle last so it is topmost in SVG.
 * - Miss-penalty rationale (§2.6): missing the node triggers lane-click node
 *   CREATION — destructive. The hit ring is also the primary guard against
 *   accidental creation by stopping propagation on the svg click event.
 */
import { useCallback, useRef, useState } from 'react'
import type { AutomationPoint } from '../../../shared/types'

interface AutomationNodeProps {
  point: AutomationPoint
  index: number
  color: string
  timeToX: (time: number) => number
  valueToY: (value: number) => number
  xToTime: (x: number) => number
  yToValue: (y: number) => number
  onUpdate: (index: number, updates: Partial<AutomationPoint>) => void
  onRemove: (index: number) => void
}

const CURVE_MODES = [0, -1, 1, 0.5] // linear, ease-in, ease-out, S-curve-ish

export default function AutomationNode({
  point,
  index,
  color,
  timeToX,
  valueToY,
  xToTime,
  yToValue,
  onUpdate,
  onRemove,
}: AutomationNodeProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [showTooltip, setShowTooltip] = useState(false)
  const dragStartRef = useRef<{ x: number; y: number; time: number; value: number } | null>(null)

  const cx = timeToX(point.time)
  const cy = valueToY(point.value)

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()

      // Alt+click = cycle curve mode
      if (e.altKey) {
        const currentIdx = CURVE_MODES.indexOf(point.curve)
        const nextIdx = (currentIdx + 1) % CURVE_MODES.length
        onUpdate(index, { curve: CURVE_MODES[nextIdx] })
        return
      }

      setIsDragging(true)
      dragStartRef.current = { x: e.clientX, y: e.clientY, time: point.time, value: point.value }

      const handleMouseMove = (ev: MouseEvent) => {
        if (!dragStartRef.current) return
        const precision = ev.shiftKey ? 0.1 : 1
        const dx = (ev.clientX - dragStartRef.current.x) * precision
        const dy = (ev.clientY - dragStartRef.current.y) * precision

        const newTime = Math.max(0, xToTime(timeToX(dragStartRef.current.time) + dx))
        const newValue = Math.max(0, Math.min(1, yToValue(valueToY(dragStartRef.current.value) + dy)))
        onUpdate(index, { time: newTime, value: newValue })
      }

      const handleMouseUp = () => {
        setIsDragging(false)
        dragStartRef.current = null
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }

      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    },
    [point, index, onUpdate, timeToX, valueToY, xToTime, yToValue],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        onRemove(index)
      }
    },
    [index, onRemove],
  )

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      onRemove(index)
    },
    [index, onRemove],
  )

  return (
    <g className="auto-node" tabIndex={0} onKeyDown={handleKeyDown}>
      {/* Visual glyph — r=4 at rest, r=6 while dragging (unchanged from before PUX.5) */}
      <circle
        cx={cx}
        cy={cy}
        r={isDragging ? 6 : 4}
        fill={color}
        stroke={isDragging ? '#fff' : 'transparent'}
        strokeWidth={2}
        className={`auto-node__circle${isDragging ? ' auto-node__circle--active' : ''}`}
        style={{ pointerEvents: 'none' }}
      />
      {showTooltip && (
        <text
          x={cx}
          y={cy - 10}
          fill="#ddd"
          fontSize={10}
          textAnchor="middle"
          fontFamily="JetBrains Mono, monospace"
          className="auto-node__tooltip"
        >
          {point.value.toFixed(2)} @ {point.time.toFixed(2)}s
        </text>
      )}
      {/*
       * PUX.5 — Invisible hit ring (r=12 → 24px effective diameter).
       * SVG z-order: last element = topmost = receives pointer events first.
       * Stops click propagation to the lane svg to prevent accidental node
       * creation when the user clicks an existing node (miss-penalty guard).
       * Pattern from react-moveable: transparent enlarged hit area behind glyph.
       */}
      <circle
        cx={cx}
        cy={cy}
        r={12}
        fill="transparent"
        className="auto-node__hit-ring"
        onMouseDown={handleMouseDown}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onClick={(e) => e.stopPropagation()}
        style={{ cursor: 'grab' }}
      />
    </g>
  )
}
