/**
 * Overlay for freehand draw mode.
 * Mouse down = start recording points. Mouse move = add points. Mouse up = commit.
 */
import { useRef } from 'react'
import { useAutomationStore } from '../../stores/automation'
import { recordDrawStroke } from '../../utils/automation-record'
import { simplifyPoints } from '../../utils/automation-simplify'

interface AutomationDrawProps {
  trackId: string
  laneId: string
  zoom: number
  scrollX: number
  height: number
}

const LANE_PADDING = 4

export default function AutomationDraw({ trackId, laneId, zoom, scrollX, height }: AutomationDrawProps) {
  const mode = useAutomationStore((s) => s.mode)
  const strokeRef = useRef<Array<{ time: number; value: number }>>([])
  const isDrawingRef = useRef(false)
  const overlayRef = useRef<HTMLDivElement>(null)

  const usableHeight = height - LANE_PADDING * 2

  if (mode !== 'draw') return null

  const xToTime = (x: number) => (x + scrollX) / zoom
  const yToValue = (y: number) => Math.max(0, Math.min(1, 1 - (y - LANE_PADDING) / usableHeight))

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!overlayRef.current) return
    isDrawingRef.current = true
    strokeRef.current = []
    const rect = overlayRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    strokeRef.current.push({ time: xToTime(x), value: yToValue(y) })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawingRef.current || !overlayRef.current) return
    const rect = overlayRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    strokeRef.current.push({ time: xToTime(x), value: yToValue(y) })
  }

  const handleMouseUp = () => {
    if (!isDrawingRef.current) return
    isDrawingRef.current = false

    const store = useAutomationStore.getState()
    const trackLanes = store.lanes[trackId]
    if (!trackLanes) return
    const lane = trackLanes.find((l) => l.id === laneId)
    if (!lane) return

    // Merge stroke into existing points
    const merged = recordDrawStroke(lane.points, strokeRef.current)
    // Auto-simplify
    const simplified = simplifyPoints(merged, 0.01)
    store.setPoints(trackId, laneId, simplified)
    strokeRef.current = []
  }

  return (
    <div
      ref={overlayRef}
      className="auto-draw"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height,
        cursor: 'crosshair',
        zIndex: 5,
      }}
    />
  )
}
