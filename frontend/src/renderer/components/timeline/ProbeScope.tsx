import { useEffect, useRef } from 'react'
import { subscribeSnapshots } from './probe-ipc'
import type { ProbeSnapshot } from './probe-ipc'

/**
 * P6.8 (I1) — ProbeScope: a canvas sparkline of one probe's recent readings.
 *
 * - Subscribes to the shared 10 Hz snapshot stream while mounted (and NOT muted).
 * - Keeps a ring buffer of the last 32 readings (matches backend
 *   `MAX_HISTORY_PER_PROBE`); ≈ 256 B per scope.
 * - Draws via requestAnimationFrame, and ONLY when new data arrived since the
 *   last draw (draw-on-new-data → at most one repaint per poll, not per frame).
 * - Muted: unsubscribe (pause polling for this probe) and dim; the buffer is
 *   retained so unmuting resumes from the last known shape.
 * - Malformed/empty snapshot → empty scope, never a crash.
 */

const RING = 32

interface ProbeScopeProps {
  probeId: string
  muted?: boolean
  width?: number
  height?: number
}

export default function ProbeScope({ probeId, muted = false, width = 96, height = 22 }: ProbeScopeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bufferRef = useRef<number[]>([])
  const dirtyRef = useRef(false)
  const rafRef = useRef<number | null>(null)
  const lastTsRef = useRef<number | null>(null)

  // Draw loop — runs only while there is fresh data to paint.
  useEffect(() => {
    let stopped = false
    const draw = () => {
      rafRef.current = null
      if (stopped) return
      if (!dirtyRef.current) return
      dirtyRef.current = false
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const w = canvas.width
      const h = canvas.height
      ctx.clearRect(0, 0, w, h)
      const buf = bufferRef.current
      if (buf.length < 2) return
      // Auto-scale to the buffer's min/max so flat-but-nonzero signals show.
      let min = Infinity
      let max = -Infinity
      for (const v of buf) {
        if (!Number.isFinite(v)) continue
        if (v < min) min = v
        if (v > max) max = v
      }
      if (!Number.isFinite(min) || !Number.isFinite(max)) return
      const range = max - min || 1
      ctx.beginPath()
      ctx.strokeStyle = muted ? '#3a5a4d' : '#5fd7a8'
      ctx.lineWidth = 1
      const n = buf.length
      for (let i = 0; i < n; i++) {
        const v = Number.isFinite(buf[i]) ? buf[i] : min
        const x = (i / (n - 1)) * (w - 2) + 1
        const y = h - 1 - ((v - min) / range) * (h - 2)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
    const scheduleDraw = () => {
      if (rafRef.current === null) rafRef.current = requestAnimationFrame(draw)
    }

    const onSnapshot = (snap: ProbeSnapshot) => {
      const entry = snap.probes[probeId]
      if (!entry || !Array.isArray(entry.history)) return
      // Only ingest if the latest timestamp advanced (new data).
      const ts = entry.latestTimestampS
      if (ts !== null && lastTsRef.current !== null && ts === lastTsRef.current) return
      lastTsRef.current = ts
      const values = entry.history
        .map((r) => (r && typeof r.value === 'number' ? r.value : NaN))
        .slice(-RING)
      bufferRef.current = values
      dirtyRef.current = true
      scheduleDraw()
    }

    let unsub: (() => void) | null = null
    if (!muted) {
      unsub = subscribeSnapshots(onSnapshot)
    } else {
      // Repaint once in the dimmed colour to reflect the muted state.
      dirtyRef.current = true
      scheduleDraw()
    }

    return () => {
      stopped = true
      if (unsub) unsub()
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [probeId, muted])

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={`probe-scope${muted ? ' probe-scope--muted' : ''}`}
      data-probe-id={probeId}
      aria-label={`probe scope ${probeId}`}
    />
  )
}
