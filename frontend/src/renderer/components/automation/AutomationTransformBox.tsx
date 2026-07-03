/**
 * AA.4b — Transform box overlay for the active breakpoint selection (AA.4).
 * See docs/plans/2026-07-03-automation-editing-gestures.md.
 *
 * Renders a bounding box around the selected breakpoints with 4 edge + 4
 * corner handles:
 * - Edge handles (top/bottom/left/right) scale ONE dimension uniformly
 *   (time on left/right, value on top/bottom), anchored at the opposite edge.
 * - Corner handles disambiguate by the DOMINANT drag axis: a mostly-
 *   horizontal drag scales both dimensions together (the "Corner -> scale
 *   both" gesture); a mostly-vertical drag is the "drag one side down" SKEW
 *   gesture — it shifts only the value column nearest that corner's side,
 *   turning a flat selection into a ramp without touching the opposite side.
 *
 * All handle math ultimately produces a `BoxTransformParams` and feeds the
 * SAME pure `applyBoxTransform` used by the store's `transformSelectedPoints`
 * (stores/automation.ts) — this component never re-implements the transform,
 * it only computes which parameterization a given drag corresponds to.
 *
 * Live-preview during drag: repaints the lane via the non-undoable
 * `setPointsRaw` from an ORIGIN snapshot captured at pointerdown (so repeated
 * mousemove calls never compound). On release, the origin snapshot is
 * restored and then `transformSelectedPoints` is called for real — producing
 * exactly ONE undo entry for the whole gesture, per the plan's "live-preview
 * during drag, commit on release as ONE undo step."
 */
import { useCallback, useRef } from 'react'
import { useAutomationStore, applyBoxTransform, IDENTITY_TRANSFORM, type BoxTransformParams } from '../../stores/automation'
import { useLayoutStore } from '../../stores/layout'
import { useProjectStore } from '../../stores/project'
import type { AutomationPoint } from '../../../shared/types'
import type { QuantizeGridOptions } from '../../stores/automation'

type EdgeHandle = 'edge-left' | 'edge-right' | 'edge-top' | 'edge-bottom'
type CornerHandle = 'corner-tl' | 'corner-tr' | 'corner-bl' | 'corner-br'
type HandleId = EdgeHandle | CornerHandle

interface AutomationTransformBoxProps {
  trackId: string
  laneId: string
  timeToX: (time: number) => number
  valueToY: (value: number) => number
  xToTime: (x: number) => number
  yToValue: (y: number) => number
  height: number
}

/** Minimum gap (seconds) an edge/corner time-scale drag is allowed to squash the box to. */
const MIN_TIME_GAP = 0.01
const HANDLE_SIZE = 8

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

function getQuantizeOptions(): QuantizeGridOptions {
  const { quantizeEnabled, quantizeDivision } = useLayoutStore.getState()
  const { bpm } = useProjectStore.getState()
  return { enabled: quantizeEnabled, bpm, division: quantizeDivision }
}

export default function AutomationTransformBox({
  trackId,
  laneId,
  timeToX,
  valueToY,
  xToTime,
  yToValue,
  height,
}: AutomationTransformBoxProps) {
  const selection = useAutomationStore((s) => s.selectedPoints)

  // Origin snapshot captured at drag-start — every mousemove recomputes the
  // preview FROM this fixed snapshot (never from the already-previewed
  // current points), so repeated calls don't compound.
  const dragRef = useRef<{
    handle: HandleId
    originPoints: AutomationPoint[]
    indices: number[]
    startX: number
    startY: number
    timeMin: number
    timeMax: number
    valueMin: number
    valueMax: number
  } | null>(null)

  const isThisLane = selection?.trackId === trackId && selection?.laneId === laneId
  const indices = isThisLane ? selection!.indices : []

  const computeParams = useCallback(
    (
      handle: HandleId,
      dxPx: number,
      dyPx: number,
      bounds: { timeMin: number; timeMax: number; valueMin: number; valueMax: number },
    ): BoxTransformParams => {
      const deltaTime = xToTime(dxPx) - xToTime(0)
      const deltaValue = yToValue(dyPx) - yToValue(0)
      const timeSpan = bounds.timeMax - bounds.timeMin
      const valueSpan = bounds.valueMax - bounds.valueMin

      switch (handle) {
        case 'edge-left': {
          let newLeft = bounds.timeMin + deltaTime
          newLeft = Math.min(newLeft, bounds.timeMax - MIN_TIME_GAP)
          const timeScale = timeSpan > 0 ? (bounds.timeMax - newLeft) / timeSpan : 1
          return { ...IDENTITY_TRANSFORM, timeScale, anchorTime: bounds.timeMax }
        }
        case 'edge-right': {
          let newRight = bounds.timeMax + deltaTime
          newRight = Math.max(newRight, bounds.timeMin + MIN_TIME_GAP)
          const timeScale = timeSpan > 0 ? (newRight - bounds.timeMin) / timeSpan : 1
          return { ...IDENTITY_TRANSFORM, timeScale, anchorTime: bounds.timeMin }
        }
        case 'edge-top': {
          const newTop = clamp01(bounds.valueMax + deltaValue)
          const valueScale = valueSpan > 0 ? (newTop - bounds.valueMin) / valueSpan : 1
          return {
            ...IDENTITY_TRANSFORM,
            valueScaleLeft: valueScale,
            valueScaleRight: valueScale,
            anchorValue: bounds.valueMin,
          }
        }
        case 'edge-bottom': {
          const newBottom = clamp01(bounds.valueMin + deltaValue)
          const valueScale = valueSpan > 0 ? (bounds.valueMax - newBottom) / valueSpan : 1
          return {
            ...IDENTITY_TRANSFORM,
            valueScaleLeft: valueScale,
            valueScaleRight: valueScale,
            anchorValue: bounds.valueMax,
          }
        }
        case 'corner-tl':
        case 'corner-tr':
        case 'corner-bl':
        case 'corner-br': {
          const side: 'left' | 'right' = handle === 'corner-tl' || handle === 'corner-bl' ? 'left' : 'right'
          const vSide: 'top' | 'bottom' = handle === 'corner-tl' || handle === 'corner-tr' ? 'top' : 'bottom'

          // Dominant-axis disambiguation: mostly-horizontal = uniform corner
          // scale (both dims); mostly-vertical = skew (this side's value only).
          if (Math.abs(dxPx) >= Math.abs(dyPx)) {
            const anchorTime = side === 'right' ? bounds.timeMin : bounds.timeMax
            let newTimeEdge = (side === 'right' ? bounds.timeMax : bounds.timeMin) + deltaTime
            newTimeEdge =
              side === 'right'
                ? Math.max(newTimeEdge, bounds.timeMin + MIN_TIME_GAP)
                : Math.min(newTimeEdge, bounds.timeMax - MIN_TIME_GAP)
            const timeScale = timeSpan > 0 ? (newTimeEdge - anchorTime) / (
              (side === 'right' ? bounds.timeMax : bounds.timeMin) - anchorTime
            ) : 1

            const anchorValue = vSide === 'top' ? bounds.valueMin : bounds.valueMax
            const newValueEdge = clamp01((vSide === 'top' ? bounds.valueMax : bounds.valueMin) + deltaValue)
            const valueScale = valueSpan > 0 ? (newValueEdge - anchorValue) / (
              (vSide === 'top' ? bounds.valueMax : bounds.valueMin) - anchorValue
            ) : 1

            return {
              timeScale,
              anchorTime,
              valueScaleLeft: valueScale,
              valueScaleRight: valueScale,
              valueShiftLeft: 0,
              valueShiftRight: 0,
              anchorValue,
            }
          }

          // Skew: shift only THIS side's value column; the opposite side is untouched.
          return {
            ...IDENTITY_TRANSFORM,
            valueShiftLeft: side === 'left' ? deltaValue : 0,
            valueShiftRight: side === 'right' ? deltaValue : 0,
          }
        }
        default:
          return IDENTITY_TRANSFORM
      }
    },
    [xToTime, yToValue],
  )

  const handlePointerDown = useCallback(
    (handle: HandleId) => (e: React.MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
      const state = useAutomationStore.getState()
      const sel = state.selectedPoints
      if (!sel || sel.trackId !== trackId || sel.laneId !== laneId || sel.indices.length === 0) return
      const lane = state.lanes[trackId]?.find((l) => l.id === laneId)
      if (!lane) return

      const originPoints = lane.points.map((p) => ({ ...p }))
      const selValues = sel.indices.map((i) => originPoints[i]?.value).filter((v): v is number => v !== undefined)
      const selTimes = sel.indices.map((i) => originPoints[i]?.time).filter((t): t is number => t !== undefined)
      if (selValues.length === 0 || selTimes.length === 0) return

      dragRef.current = {
        handle,
        originPoints,
        indices: sel.indices,
        startX: e.clientX,
        startY: e.clientY,
        timeMin: Math.min(...selTimes),
        timeMax: Math.max(...selTimes),
        valueMin: Math.min(...selValues),
        valueMax: Math.max(...selValues),
      }

      const handleMouseMove = (ev: MouseEvent) => {
        const drag = dragRef.current
        if (!drag) return
        const dxPx = ev.clientX - drag.startX
        const dyPx = ev.clientY - drag.startY
        const params = computeParams(drag.handle, dxPx, dyPx, drag)
        const preview = applyBoxTransform(drag.originPoints, drag.indices, params, getQuantizeOptions())
        useAutomationStore.getState().setPointsRaw(trackId, laneId, preview)
      }

      // Restores the pre-drag snapshot (undoing the live-preview) and detaches
      // the window listeners. Called on both Escape-cancel and mouseup — on
      // mouseup, the caller commits the REAL undoable action right after this
      // restores, so the store's "before" state for that undo entry is the
      // true pre-drag snapshot rather than the last preview frame.
      const cleanupDrag = () => {
        const drag = dragRef.current
        dragRef.current = null
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
        window.removeEventListener('keydown', handleEscape)
        if (!drag) return
        useAutomationStore.getState().setPointsRaw(trackId, laneId, drag.originPoints)
      }

      const handleMouseUp = (ev: MouseEvent) => {
        const drag = dragRef.current
        if (!drag) {
          cleanupDrag()
          return
        }
        const dxPx = ev.clientX - drag.startX
        const dyPx = ev.clientY - drag.startY
        const params = computeParams(drag.handle, dxPx, dyPx, drag)
        const movedEnough = Math.abs(dxPx) >= 1 || Math.abs(dyPx) >= 1
        cleanupDrag() // restore to the true pre-drag snapshot
        if (movedEnough) {
          useAutomationStore.getState().transformSelectedPoints(params, getQuantizeOptions(), 'Transform automation selection')
        }
      }

      const handleEscape = (ev: KeyboardEvent) => {
        if (ev.key === 'Escape') cleanupDrag()
      }

      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      window.addEventListener('keydown', handleEscape)
    },
    [trackId, laneId, computeParams],
  )

  // Double-click a top/bottom edge handle = quick flatten (average of selection).
  const handleEdgeDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
      useAutomationStore.getState().flattenSelectedPoints('average')
    },
    [],
  )

  if (!isThisLane || indices.length === 0) return null

  const lane = useAutomationStore.getState().lanes[trackId]?.find((l) => l.id === laneId)
  if (!lane) return null

  const selectedPts = indices.map((i) => lane.points[i]).filter((p): p is AutomationPoint => !!p)
  if (selectedPts.length === 0) return null

  const timeMin = Math.min(...selectedPts.map((p) => p.time))
  const timeMax = Math.max(...selectedPts.map((p) => p.time))
  const valueMin = Math.min(...selectedPts.map((p) => p.value))
  const valueMax = Math.max(...selectedPts.map((p) => p.value))

  const PAD = 6
  const x0 = timeToX(timeMin) - PAD
  const x1 = timeToX(timeMax) + PAD
  const y0 = Math.min(valueToY(valueMin), valueToY(valueMax)) - PAD
  const y1 = Math.max(valueToY(valueMin), valueToY(valueMax)) + PAD
  const boxW = Math.max(1, x1 - x0)
  const boxH = Math.max(1, y1 - y0)
  const midX = (x0 + x1) / 2
  const midY = (y0 + y1) / 2

  const handles: { id: HandleId; x: number; y: number; cursor: string; dblClick?: boolean }[] = [
    { id: 'edge-left', x: x0, y: midY, cursor: 'ew-resize' },
    { id: 'edge-right', x: x1, y: midY, cursor: 'ew-resize' },
    { id: 'edge-top', x: midX, y: y0, cursor: 'ns-resize', dblClick: true },
    { id: 'edge-bottom', x: midX, y: y1, cursor: 'ns-resize', dblClick: true },
    { id: 'corner-tl', x: x0, y: y0, cursor: 'nwse-resize' },
    { id: 'corner-tr', x: x1, y: y0, cursor: 'nesw-resize' },
    { id: 'corner-bl', x: x0, y: y1, cursor: 'nesw-resize' },
    { id: 'corner-br', x: x1, y: y1, cursor: 'nwse-resize' },
  ]

  return (
    <g className="auto-transform-box" data-testid="automation-transform-box">
      <rect
        x={x0}
        y={Math.max(0, y0)}
        width={boxW}
        height={Math.min(height, boxH)}
        fill="none"
        stroke="#facc15"
        strokeWidth={1}
        strokeDasharray="4 3"
        pointerEvents="none"
      />
      {handles.map((h) => (
        <rect
          key={h.id}
          className="auto-transform-box__handle"
          data-testid={`transform-handle-${h.id}`}
          x={h.x - HANDLE_SIZE / 2}
          y={h.y - HANDLE_SIZE / 2}
          width={HANDLE_SIZE}
          height={HANDLE_SIZE}
          fill="#facc15"
          stroke="#1a1a1a"
          strokeWidth={1}
          style={{ cursor: h.cursor }}
          onMouseDown={handlePointerDown(h.id)}
          onDoubleClick={h.dblClick ? handleEdgeDoubleClick : undefined}
          onClick={(e) => e.stopPropagation()}
        />
      ))}
    </g>
  )
}
