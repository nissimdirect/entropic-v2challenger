/**
 * SVG overlay rendered inside TrackLane — draws automation line/curves + nodes.
 * Click on line = add node. Respects zoom/scrollX coordinate system.
 * Trigger lanes render as square-wave colored blocks instead of smooth curves.
 */
import { useCallback, useRef } from 'react'
import type { AutomationLane as LaneType, AutomationPoint } from '../../../shared/types'
import { useAutomationStore } from '../../stores/automation'
import AutomationNode from './AutomationNode'
import CurveSegment from './CurveSegment'

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

  const handleSvgClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!svgRef.current) return
      const rect = svgRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const time = xToTime(x)

      if (lane.isTrigger) {
        // For trigger lanes, click toggles between 0 and 1 at the clicked time
        const value = 1.0
        useAutomationStore.getState().addPoint(trackId, lane.id, time, value)
      } else {
        const value = Math.max(0, Math.min(1, yToValue(y)))
        useAutomationStore.getState().addPoint(trackId, lane.id, time, value)
      }
    },
    [trackId, lane.id, xToTime, yToValue, lane.isTrigger],
  )

  const points = lane.points

  return (
    <svg
      ref={svgRef}
      className={`auto-lane${lane.isTrigger ? ' auto-lane--trigger' : ''}`}
      width="100%"
      height={height}
      onClick={handleSvgClick}
      style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'all' }}
      data-testid={lane.isTrigger ? 'trigger-lane' : 'automation-lane'}
    >
      {lane.isTrigger ? (
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
        />
      ))}
    </svg>
  )
}
