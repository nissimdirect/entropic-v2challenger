/**
 * Draggable circle on the automation line.
 * Drag = move time (X) and value (Y).
 * Shift+drag = 10x precision. Delete = remove.
 *
 * AA.1 — Curve tension gestures:
 * - Alt+drag = continuously adjust curve tension, clamped to [-1, 1].
 *   Vertical movement drives tension (drag up = +tension/ease-out,
 *   drag down = -tension/ease-in); Shift+alt+drag = 4x finer precision.
 * - Alt+click (mouseup with no meaningful movement) = fallback to the old
 *   discrete CURVE_MODES cycle, so a quick alt-click still does something
 *   useful without requiring a drag gesture.
 * - Alt+double-click = reset curve to 0 (straighten the segment).
 *
 * PUX.5 — Hit targets & drag signifiers:
 * - Transparent hit ring r=12 behind the visual glyph gives a 24px effective
 *   target (≥ DESIGN-SPEC §4 floor + WCAG 2.5.8 minimum).
 * - Pattern from react-moveable: enlarge transparent hit area behind the
 *   visual glyph; z-order puts the hit circle last so it is topmost in SVG.
 * - Miss-penalty rationale (§2.6): missing the node triggers lane-click node
 *   CREATION — destructive. The hit ring is also the primary guard against
 *   accidental creation by stopping propagation on the svg click event.
 *
 * AA.4 — Breakpoint selection (all-optional additions, backward compatible):
 * - `onSelect` fires on plain (non-alt) mousedown so a click marks this point
 *   as the active selection (shift = additive union) — mirrors the timeline's
 *   clip marquee shift-union convention (MarqueeOverlay.tsx).
 * - Dragging a node that is ALREADY part of a >1-point selection moves the
 *   WHOLE selection (`onMoveSelection`) instead of just this point. The
 *   per-frame delta is computed directly from `xToTime`/`yToValue` (both are
 *   affine in their pixel argument, so `f(a) - f(b)` cancels the scroll/zoom
 *   offset and yields a pure delta) — no new coordinate plumbing needed.
 * - Omitting the new props reproduces the exact pre-AA.4 single-point drag.
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
  /** AA.4: true when this point is part of the active breakpoint selection. */
  isSelected?: boolean
  /** AA.4: total number of points in the active selection (0/undefined = none). */
  selectionSize?: number
  /** AA.4: click-to-select. `additive` = shift-click (union with prior selection). */
  onSelect?: (index: number, additive: boolean) => void
  /** AA.4: group-drag — called with the INCREMENTAL delta since the previous move event. */
  onMoveSelection?: (deltaTime: number, deltaValue: number) => void
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
  isSelected,
  selectionSize,
  onSelect,
  onMoveSelection,
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

      // Alt+drag = continuous curve tension. Alt+click (no movement) falls
      // back to the discrete CURVE_MODES cycle. Second mousedown of a
      // double-click (detail >= 2) is left for handleDoubleClick to resolve
      // (reset to 0) so we don't also fire a spurious cycle update here.
      if (e.altKey) {
        if (e.detail >= 2) return

        const startX = e.clientX
        const startY = e.clientY
        const startCurve = point.curve
        const DRAG_THRESHOLD = 3 // px — below this, treat as a click (cycle fallback)
        let dragged = false

        const handleAltMouseMove = (ev: MouseEvent) => {
          const dx = ev.clientX - startX
          const dy = ev.clientY - startY
          if (!dragged && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
          dragged = true

          // Drag up = increase tension (ease-out), drag down = decrease
          // (ease-in). 100px covers the full [-1, 1] sweep at normal precision.
          const precision = ev.shiftKey ? 0.25 : 1
          const delta = (-dy / 100) * precision
          const nextCurve = Math.max(-1, Math.min(1, startCurve + delta))
          onUpdate(index, { curve: nextCurve })
        }

        const handleAltMouseUp = () => {
          if (!dragged) {
            const currentIdx = CURVE_MODES.indexOf(point.curve)
            const nextIdx = (currentIdx + 1) % CURVE_MODES.length
            onUpdate(index, { curve: CURVE_MODES[nextIdx] })
          }
          window.removeEventListener('mousemove', handleAltMouseMove)
          window.removeEventListener('mouseup', handleAltMouseUp)
        }

        window.addEventListener('mousemove', handleAltMouseMove)
        window.addEventListener('mouseup', handleAltMouseUp)
        return
      }

      // AA.4 — dragging a node that's ALREADY part of a multi-point selection
      // moves the whole selection; otherwise this click (re)selects just this
      // point and falls through to the original single-point drag below.
      // Decided from the PRE-click props on purpose, so a drag started on an
      // established multi-selection isn't collapsed by the click-to-select.
      const isGroupDrag = !!isSelected && (selectionSize ?? 0) > 1 && !!onMoveSelection
      if (!isGroupDrag) {
        onSelect?.(index, e.shiftKey)
      }

      setIsDragging(true)

      if (isGroupDrag) {
        const lastClient = { x: e.clientX, y: e.clientY }

        const handleGroupMouseMove = (ev: MouseEvent) => {
          const precision = ev.shiftKey ? 0.1 : 1
          const dxClient = (ev.clientX - lastClient.x) * precision
          const dyClient = (ev.clientY - lastClient.y) * precision
          lastClient.x = ev.clientX
          lastClient.y = ev.clientY
          if (dxClient === 0 && dyClient === 0) return

          // xToTime/yToValue are affine in their pixel argument, so
          // f(delta) - f(0) cancels the scroll/zoom offset and yields a
          // pure incremental delta — same trick documented at the top of
          // this file.
          const deltaTime = xToTime(dxClient) - xToTime(0)
          const deltaValue = yToValue(dyClient) - yToValue(0)
          onMoveSelection!(deltaTime, deltaValue)
        }

        const handleGroupMouseUp = () => {
          setIsDragging(false)
          window.removeEventListener('mousemove', handleGroupMouseMove)
          window.removeEventListener('mouseup', handleGroupMouseUp)
        }

        window.addEventListener('mousemove', handleGroupMouseMove)
        window.addEventListener('mouseup', handleGroupMouseUp)
        return
      }

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
    [
      point,
      index,
      onUpdate,
      timeToX,
      valueToY,
      xToTime,
      yToValue,
      isSelected,
      selectionSize,
      onSelect,
      onMoveSelection,
    ],
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

  // Alt+double-click = reset curve to 0 (straighten the segment).
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!e.altKey) return
      e.preventDefault()
      e.stopPropagation()
      onUpdate(index, { curve: 0 })
    },
    [index, onUpdate],
  )

  return (
    <g className="auto-node" tabIndex={0} onKeyDown={handleKeyDown}>
      {/*
       * Visual glyph — r=4 at rest, r=6 while dragging (unchanged from before PUX.5).
       * AA.4: a white stroke also appears (without the size bump) when this
       * point is part of the active breakpoint selection — reuses the same
       * dragging-stroke color so selection reads as "about to move" at a glance.
       */}
      <circle
        cx={cx}
        cy={cy}
        r={isDragging ? 6 : 4}
        fill={color}
        stroke={isDragging || isSelected ? '#fff' : 'transparent'}
        strokeWidth={2}
        className={`auto-node__circle${isDragging ? ' auto-node__circle--active' : ''}${isSelected ? ' auto-node__circle--selected' : ''}`}
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
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onClick={(e) => e.stopPropagation()}
        style={{ cursor: 'grab' }}
      />
    </g>
  )
}
