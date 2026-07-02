import { useRef, useCallback, useEffect } from 'react'
import { useTimelineStore } from '../../stores/timeline'

interface TimeRulerProps {
  zoom: number
  scrollX: number
  duration: number
  onSeek: (time: number) => void
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (mins > 0) {
    return `${mins}:${secs.toFixed(0).padStart(2, '0')}`
  }
  return `${secs.toFixed(1)}s`
}

export default function TimeRuler({ zoom, scrollX, duration, onSeek }: TimeRulerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    const width = rect.width
    const height = rect.height

    ctx.clearRect(0, 0, width, height)

    // Determine tick spacing based on zoom — target ~80-150px between major ticks
    const targetPx = 100
    const rawInterval = targetPx / zoom // seconds per major tick at ideal spacing
    // Snap to nice intervals: 1, 2, 5, 10, 15, 30, 60, 120, 300, 600...
    const niceIntervals = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800]
    let majorInterval = niceIntervals[niceIntervals.length - 1]
    for (const ni of niceIntervals) {
      if (ni >= rawInterval) { majorInterval = ni; break }
    }

    const minorInterval = majorInterval / 4

    // Calculate visible range
    const startTime = scrollX / zoom
    const endTime = startTime + width / zoom

    // Draw minor ticks
    ctx.strokeStyle = '#444'
    ctx.lineWidth = 1
    const firstMinor = Math.floor(startTime / minorInterval) * minorInterval
    for (let t = firstMinor; t <= endTime; t += minorInterval) {
      const x = (t - startTime) * zoom
      ctx.beginPath()
      ctx.moveTo(x, height - 4)
      ctx.lineTo(x, height)
      ctx.stroke()
    }

    // Draw major ticks + labels
    ctx.strokeStyle = '#666'
    ctx.fillStyle = '#888'
    ctx.font = '10px JetBrains Mono, monospace'
    ctx.textBaseline = 'top'
    const firstMajor = Math.floor(startTime / majorInterval) * majorInterval
    for (let t = firstMajor; t <= endTime; t += majorInterval) {
      const x = (t - startTime) * zoom
      ctx.beginPath()
      ctx.moveTo(x, height - 10)
      ctx.lineTo(x, height)
      ctx.stroke()
      ctx.fillText(formatTime(t), x + 3, 3)
    }
  }, [zoom, scrollX, duration])

  useEffect(() => {
    draw()
    const canvas = canvasRef.current
    if (!canvas) return
    const observer = new ResizeObserver(draw)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [draw])

  // Drag-to-zoom (vertical drag on ruler) + click-to-seek
  const dragRef = useRef<{ startY: number; startZoom: number; moved: boolean } | null>(null)

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const ts = useTimelineStore.getState()
      dragRef.current = { startY: e.clientY, startZoom: ts.zoom, moved: false }
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    },
    [],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!dragRef.current) return
      const dy = dragRef.current.startY - e.clientY // drag up = positive = zoom in
      if (Math.abs(dy) > 3) dragRef.current.moved = true
      if (!dragRef.current.moved) return
      const factor = Math.pow(1.01, dy) // smooth exponential zoom
      const newZoom = Math.max(0.5, Math.min(500, dragRef.current.startZoom * factor))
      useTimelineStore.getState().setZoom(newZoom)
    },
    [],
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const wasDrag = dragRef.current?.moved
      dragRef.current = null
      // If it was a click (no drag), seek to that position
      if (!wasDrag) {
        const rect = e.currentTarget.getBoundingClientRect()
        const x = e.clientX - rect.left
        const time = (x + scrollX) / zoom
        onSeek(Math.max(0, time))
      }
    },
    [scrollX, zoom, onSeek],
  )

  return (
    <div className="time-ruler">
      <canvas
        ref={canvasRef}
        className="time-ruler__canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />
    </div>
  )
}
