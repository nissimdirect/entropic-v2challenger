import { useRef, useEffect, useCallback } from 'react'
import { useWaveform } from './useWaveform'
import type { WaveformPeaks } from './useWaveform'

interface WaveformProps {
  peaks: WaveformPeaks | null
  currentTime: number
  duration: number
  onSeek: (time: number) => void
}

const PEAK_COLOR = '#4a5568'
const PLAYHEAD_COLOR = '#4ade80'

export default function Waveform({ peaks, currentTime, duration, onSeek }: WaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const widthRef = useRef(0)

  // Track container width for downsampling
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        widthRef.current = Math.floor(entry.contentRect.width)
        // Trigger redraw by dispatching a custom event (canvas draw is driven by effect below)
        container.dispatchEvent(new CustomEvent('waveform-resize'))
      }
    })

    observer.observe(container)
    widthRef.current = Math.floor(container.clientWidth)

    return () => observer.disconnect()
  }, [])

  // Downsample peaks to canvas width
  const bins = useWaveform(peaks, widthRef.current)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const dpr = window.devicePixelRatio || 1
    const logicalWidth = canvas.clientWidth || widthRef.current
    const logicalHeight = canvas.clientHeight || 64

    canvas.width = logicalWidth * dpr
    canvas.height = logicalHeight * dpr

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, logicalWidth, logicalHeight)

    const midY = logicalHeight / 2

    // Draw waveform bars
    if (bins.length > 0) {
      ctx.fillStyle = PEAK_COLOR
      const binWidth = logicalWidth / bins.length

      for (let i = 0; i < bins.length; i++) {
        const { min, max } = bins[i]
        // Normalize [-1, 1] → pixels
        const top = midY - max * midY
        const bottom = midY - min * midY
        const barHeight = Math.max(1, bottom - top)
        ctx.fillRect(i * binWidth, top, Math.max(1, binWidth - 0.5), barHeight)
      }
    } else {
      // Empty state: draw center line
      ctx.fillStyle = PEAK_COLOR
      ctx.globalAlpha = 0.3
      ctx.fillRect(0, midY - 0.5, logicalWidth, 1)
      ctx.globalAlpha = 1
    }

    // Draw playhead
    if (duration > 0) {
      const x = (currentTime / duration) * logicalWidth
      ctx.strokeStyle = PLAYHEAD_COLOR
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, logicalHeight)
      ctx.stroke()
    }
  }, [bins, currentTime, duration])

  // Redraw whenever draw function changes (bins, time, duration)
  useEffect(() => {
    draw()
  }, [draw])

  // Also redraw on resize events
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const handler = () => draw()
    container.addEventListener('waveform-resize', handler)
    return () => container.removeEventListener('waveform-resize', handler)
  }, [draw])

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas || duration <= 0) return

      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const ratio = Math.max(0, Math.min(1, x / rect.width))
      onSeek(ratio * duration)
    },
    [duration, onSeek],
  )

  return (
    <div ref={containerRef} className="waveform">
      <canvas
        ref={canvasRef}
        className="waveform__canvas"
        style={{ width: '100%', height: '64px', cursor: duration > 0 ? 'pointer' : 'default' }}
        onClick={handleClick}
      />
    </div>
  )
}
