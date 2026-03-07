/**
 * SVG overlay rendered inside TrackLane — draws automation line/curves + nodes.
 * Click on line = add node. Respects zoom/scrollX coordinate system.
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
      const value = Math.max(0, Math.min(1, yToValue(y)))
      useAutomationStore.getState().addPoint(trackId, lane.id, time, value)
    },
    [trackId, lane.id, xToTime, yToValue],
  )

  const points = lane.points

  return (
    <svg
      ref={svgRef}
      className="auto-lane"
      width="100%"
      height={height}
      onClick={handleSvgClick}
      style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'all' }}
    >
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
      {/* Nodes */}
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
