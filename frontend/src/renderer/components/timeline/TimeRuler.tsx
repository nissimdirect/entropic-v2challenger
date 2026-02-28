import { useRef, useCallback, useEffect } from 'react'

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

    // Determine tick spacing based on zoom
    let majorInterval = 1 // seconds
    if (zoom < 20) majorInterval = 10
    else if (zoom < 40) majorInterval = 5
    else if (zoom < 80) majorInterval = 2
    else if (zoom >= 80) majorInterval = 1

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

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = e.currentTarget.getBoundingClientRect()
      const x = e.clientX - rect.left
      const time = (x + scrollX) / zoom
      onSeek(Math.max(0, time))
    },
    [scrollX, zoom, onSeek],
  )

  return (
    <div className="time-ruler">
      <canvas ref={canvasRef} className="time-ruler__canvas" onClick={handleClick} />
    </div>
  )
}
