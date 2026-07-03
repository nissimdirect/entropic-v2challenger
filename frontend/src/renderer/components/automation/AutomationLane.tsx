/**
 * SVG overlay rendered inside TrackLane — draws automation line/curves + nodes.
 * Click on line = add node. Respects zoom/scrollX coordinate system.
 * Trigger lanes render as square-wave colored blocks instead of smooth curves.
 *
 * AA.4 — Breakpoint marquee-select + group-move:
 * - Pointerdown/move/up on the SVG background draws a rubber-band rect and,
 *   on release, calls `selectPointsInRect` — same pointer-capture + zero-area-
 *   is-a-click + Escape-cancels idiom as the timeline's clip marquee
 *   (MarqueeOverlay.tsx), adapted to a 2D (time × value) box instead of a
 *   1D time range. A `.auto-node` target guard skips starting a marquee when
 *   the pointerdown lands on an existing node (its own drag handler owns
 *   that gesture — see AutomationNode.tsx's group-drag addition).
 * - Selected nodes read the active selection from the store and get
 *   `isSelected`/`onSelect`/`onMoveSelection` wired in; dragging a node that's
 *   part of a >1-point selection moves the whole selection, quantized to the
 *   SAME grid toggle (Cmd+U / useLayoutStore.quantizeEnabled) as clip editing.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AutomationLane as LaneType, AutomationPoint } from '../../../shared/types'
import { useAutomationStore } from '../../stores/automation'
import { useLayoutStore } from '../../stores/layout'
import { useProjectStore } from '../../stores/project'
import { isTriggerLane } from '../../utils/automation-evaluate'
import AutomationNode from './AutomationNode'
import CurveSegment from './CurveSegment'

interface MarqueeRect {
  left: number
  top: number
  width: number
  height: number
}

/** Shared empty-selection sentinel — avoids allocating a new Set every render. */
const EMPTY_SELECTION: ReadonlySet<number> = new Set()

interface AutomationLaneProps {
  lane: LaneType
  trackId: string
  zoom: number
  scrollX: number
  height: number
}

const LANE_PADDING = 4

/**
 * Renders trigger lane points as rectangular colored blocks.
 * Value 1 = colored block, value 0 = gap.
 */
function TriggerBlocks({
  points,
  color,
  timeToX,
  height,
}: {
  points: AutomationPoint[]
  color: string
  timeToX: (t: number) => number
  height: number
}) {
  const blocks: React.ReactElement[] = []
  const blockY = LANE_PADDING
  const blockHeight = height - LANE_PADDING * 2

  for (let i = 0; i < points.length; i++) {
    const pt = points[i]
    if (pt.value < 0.5) continue // gap, not a block

    // Find the end of this block (next point with value < 0.5, or end of points)
    const startX = timeToX(pt.time)
    let endX: number
    if (i + 1 < points.length) {
      endX = timeToX(points[i + 1].time)
    } else {
      // Last point is active — extend a small default width
      endX = startX + 20
    }

    const width = Math.max(2, endX - startX)
    blocks.push(
      <rect
        key={`trig-${i}`}
        x={startX}
        y={blockY}
        width={width}
        height={blockHeight}
        fill={color}
        opacity={0.5}
        rx={2}
        className="auto-trigger-block"
      />,
    )
  }

  return <>{blocks}</>
}

export default function AutomationLane({ lane, trackId, zoom, scrollX, height }: AutomationLaneProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const trigger = isTriggerLane(lane)

  // AA.4 — marquee-select drag state (kept even when the lane is hidden below
  // to preserve this component's existing hook-call order across renders).
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null)
  const marqueeDraggingRef = useRef(false)
  const marqueeStartRef = useRef({ x: 0, y: 0 })
  const selection = useAutomationStore((s) => s.selectedPoints)

  if (!lane.isVisible) return null

  const usableHeight = height - LANE_PADDING * 2

  const timeToX = useCallback(
    (time: number) => time * zoom - scrollX,
    [zoom, scrollX],
  )

  const valueToY = useCallback(
    (value: number) => LANE_PADDING + usableHeight * (1 - value),
    [usableHeight],
  )

  const xToTime = useCallback(
    (x: number) => (x + scrollX) / zoom,
    [zoom, scrollX],
  )

  const yToValue = useCallback(
    (y: number) => 1 - (y - LANE_PADDING) / usableHeight,
    [usableHeight],
  )

  const handleUpdate = useCallback(
    (pointIndex: number, updates: Partial<AutomationPoint>) => {
      useAutomationStore.getState().updatePoint(trackId, lane.id, pointIndex, updates)
    },
    [trackId, lane.id],
  )

  const handleRemove = useCallback(
    (pointIndex: number) => {
      useAutomationStore.getState().removePoint(trackId, lane.id, pointIndex)
    },
    [trackId, lane.id],
  )

  // AA.4 — click-to-select (shift = additive union).
  const handleSelectNode = useCallback(
    (index: number, additive: boolean) => {
      useAutomationStore.getState().selectPoint(trackId, lane.id, index, additive)
    },
    [trackId, lane.id],
  )

  // AA.4 — group-drag: apply the SAME quantize grid toggle as clip editing
  // (Cmd+U — useLayoutStore.quantizeEnabled/quantizeDivision, gridInterval
  // math shared with Clip.tsx's snapPosition()).
  const handleMoveSelection = useCallback(
    (deltaTime: number, deltaValue: number) => {
      const { quantizeEnabled, quantizeDivision } = useLayoutStore.getState()
      const { bpm } = useProjectStore.getState()
      useAutomationStore.getState().moveSelectedPoints(deltaTime, deltaValue, {
        enabled: quantizeEnabled,
        bpm,
        division: quantizeDivision,
      })
    },
    [],
  )

  // AA.4 — marquee-select: pointerdown/move/up rubber-bands a 2D (time ×
  // value) box over the lane background. Mirrors MarqueeOverlay.tsx's
  // pointer-capture + zero-area-is-a-click + Escape-cancels idiom.
  const handleLanePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (e.button !== 0) return
      // Let an existing node own its own drag gesture (AutomationNode.tsx) —
      // don't also start a marquee underneath it.
      if ((e.target as Element).closest?.('.auto-node')) return
      if (!svgRef.current) return

      marqueeDraggingRef.current = true
      marqueeStartRef.current = { x: e.clientX, y: e.clientY }
      ;(e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId)

      const rect = svgRef.current.getBoundingClientRect()
      setMarqueeRect({ left: e.clientX - rect.left, top: e.clientY - rect.top, width: 0, height: 0 })
    },
    [],
  )

  const handleLanePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!marqueeDraggingRef.current || !svgRef.current) return
      const rect = svgRef.current.getBoundingClientRect()
      const x0 = marqueeStartRef.current.x - rect.left
      const y0 = marqueeStartRef.current.y - rect.top
      const x1 = e.clientX - rect.left
      const y1 = e.clientY - rect.top

      setMarqueeRect({
        left: Math.min(x0, x1),
        top: Math.min(y0, y1),
        width: Math.abs(x1 - x0),
        height: Math.abs(y1 - y0),
      })
    },
    [],
  )

  const handleLanePointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!marqueeDraggingRef.current || !svgRef.current) return
      marqueeDraggingRef.current = false
      setMarqueeRect(null)

      // Recompute the final rect directly from the pointerup event (not the
      // `marqueeRect` state, which would be stale inside this memoized
      // callback) — same pattern as MarqueeOverlay.tsx's commitSelection().
      const rect = svgRef.current.getBoundingClientRect()
      const x0 = marqueeStartRef.current.x - rect.left
      const y0 = marqueeStartRef.current.y - rect.top
      const x1 = e.clientX - rect.left
      const y1 = e.clientY - rect.top
      const width = Math.abs(x1 - x0)
      const height = Math.abs(y1 - y0)

      // Zero-area release (a plain click, not a drag): don't touch selection
      // and let the natural click event fall through to handleSvgClick
      // (add-point-on-click), unchanged from before AA.4.
      if (width < 2 && height < 2) return

      const t0 = xToTime(Math.min(x0, x1))
      const t1 = xToTime(Math.max(x0, x1))
      const v0 = yToValue(Math.min(y0, y1))
      const v1 = yToValue(Math.max(y0, y1))
      useAutomationStore.getState().selectPointsInRect(trackId, lane.id, t0, t1, v0, v1, e.shiftKey)

      // Suppress the synthetic click that follows this pointerup so it
      // doesn't also fire handleSvgClick and add a spurious point — pattern
      // from feedback_drag-end-suppresses-click.md (used by MarqueeOverlay.tsx).
      window.addEventListener('click', (ev) => ev.stopPropagation(), { capture: true, once: true })
    },
    [trackId, lane.id, xToTime, yToValue],
  )

  const handleLanePointerCancel = useCallback(() => {
    marqueeDraggingRef.current = false
    setMarqueeRect(null)
  }, [])

  // Escape mid-drag cancels the marquee without changing selection.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && marqueeDraggingRef.current) {
        marqueeDraggingRef.current = false
        setMarqueeRect(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const handleSvgClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!svgRef.current) return
      const rect = svgRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const time = xToTime(x)

      if (trigger) {
        // For trigger lanes, click toggles between 0 and 1 at the clicked time
        const value = 1.0
        useAutomationStore.getState().addPoint(trackId, lane.id, time, value)
      } else {
        const value = Math.max(0, Math.min(1, yToValue(y)))
        useAutomationStore.getState().addPoint(trackId, lane.id, time, value)
      }
    },
    [trackId, lane.id, xToTime, yToValue, trigger],
  )

  const points = lane.points

  const isThisLaneSelected = selection?.trackId === trackId && selection?.laneId === lane.id
  const selectedIndexSet = isThisLaneSelected ? new Set(selection!.indices) : EMPTY_SELECTION
  const selectionSize = isThisLaneSelected ? selection!.indices.length : 0

  return (
    <svg
      ref={svgRef}
      className={`auto-lane${trigger ? ' auto-lane--trigger' : ''}`}
      width="100%"
      height={height}
      onClick={handleSvgClick}
      onPointerDown={handleLanePointerDown}
      onPointerMove={handleLanePointerMove}
      onPointerUp={handleLanePointerUp}
      onPointerCancel={handleLanePointerCancel}
      style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'all' }}
      data-testid={trigger ? 'trigger-lane' : 'automation-lane'}
    >
      {trigger ? (
        /* Trigger lanes: colored rectangular blocks */
        <TriggerBlocks
          points={points}
          color={lane.color}
          timeToX={timeToX}
          height={height}
        />
      ) : (
        <>
          {/* Curve segments */}
          {points.map((pt, i) => {
            if (i >= points.length - 1) return null
            return (
              <CurveSegment
                key={`seg-${i}`}
                from={pt}
                to={points[i + 1]}
                color={lane.color}
                opacity={1}
                timeToX={timeToX}
                valueToY={valueToY}
              />
            )
          })}
        </>
      )}
      {/* Nodes (shown for both types) */}
      {points.map((pt, i) => (
        <AutomationNode
          key={`node-${i}`}
          point={pt}
          index={i}
          color={lane.color}
          timeToX={timeToX}
          valueToY={valueToY}
          xToTime={xToTime}
          yToValue={yToValue}
          onUpdate={handleUpdate}
          onRemove={handleRemove}
          isSelected={selectedIndexSet.has(i)}
          selectionSize={selectionSize}
          onSelect={handleSelectNode}
          onMoveSelection={handleMoveSelection}
        />
      ))}
      {/* AA.4 — marquee-select rubber-band rect (visual only; pointerEvents
          none so it never intercepts the pointer handlers above). */}
      {marqueeRect && (marqueeRect.width > 1 || marqueeRect.height > 1) && (
        <rect
          className="auto-lane__marquee-rect"
          x={marqueeRect.left}
          y={marqueeRect.top}
          width={marqueeRect.width}
          height={marqueeRect.height}
          fill="rgba(74, 222, 128, 0.08)"
          stroke="#4ade80"
          strokeWidth={1}
          pointerEvents="none"
        />
      )}
    </svg>
  )
}
