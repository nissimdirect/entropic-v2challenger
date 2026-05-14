import { useCallback, useEffect, useRef, useState } from 'react'
import type { AudioClip } from '../../../shared/types'
import { useTimelineStore } from '../../stores/timeline'
import type { WaveformPeaks } from '../transport/useWaveform'
import { downsamplePeaks } from '../transport/useWaveform'

interface AudioClipViewProps {
  clip: AudioClip
  zoom: number
  scrollX: number
  isSelected: boolean
  waveformPeaks?: WaveformPeaks | null
}

/** Fade handle hit-area in px; clicks within this distance from a corner grab the handle. */
const FADE_HANDLE_PX = 14
const TRACK_HEIGHT = 60

export default function AudioClipView({ clip, zoom, isSelected, waveformPeaks }: AudioClipViewProps) {
  const clipDur = Math.max(0, clip.outSec - clip.inSec)
  const left = clip.startSec * zoom
  const width = Math.max(2, clipDur * zoom)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [pixelWidth, setPixelWidth] = useState(0)
  const dragRef = useRef<null | { kind: 'move' | 'fadeIn' | 'fadeOut'; startX: number; startVal: number }>(null)

  // Track pixel width for crisp DPR-aware canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const parent = canvas.parentElement
    if (!parent) return
    const obs = new ResizeObserver((entries) => {
      for (const e of entries) setPixelWidth(Math.floor(e.contentRect.width))
    })
    obs.observe(parent)
    setPixelWidth(Math.floor(parent.clientWidth))
    return () => obs.disconnect()
  }, [])

  // Draw waveform + fade envelope overlay
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || pixelWidth <= 0) return

    const dpr = window.devicePixelRatio || 1
    const logicalH = TRACK_HEIGHT - 18 // leave room for top label strip
    canvas.width = pixelWidth * dpr
    canvas.height = logicalH * dpr
    canvas.style.width = `${pixelWidth}px`
    canvas.style.height = `${logicalH}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, pixelWidth, logicalH)

    // Waveform body
    if (waveformPeaks && waveformPeaks.length > 0) {
      const bins = downsamplePeaks(waveformPeaks, pixelWidth)
      ctx.fillStyle = isSelected ? '#86efac' : '#4ade80'
      const centerY = logicalH / 2
      for (let x = 0; x < bins.length; x++) {
        const b = bins[x]
        if (!b) continue
        const top = centerY + b.min * (logicalH / 2)
        const bot = centerY + b.max * (logicalH / 2)
        ctx.fillRect(x, Math.min(top, bot), 1, Math.max(1, Math.abs(bot - top)))
      }
    } else {
      // Placeholder stripe until peaks arrive
      ctx.fillStyle = '#333'
      ctx.fillRect(0, logicalH / 2 - 1, pixelWidth, 2)
    }

    // Fade-in triangle
    if (clip.fadeInSec > 0 && clipDur > 0) {
      const fadePx = Math.min(pixelWidth, (clip.fadeInSec / clipDur) * pixelWidth)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(fadePx, 0)
      ctx.lineTo(0, logicalH)
      ctx.closePath()
      ctx.fill()
    }
    // Fade-out triangle
    if (clip.fadeOutSec > 0 && clipDur > 0) {
      const fadePx = Math.min(pixelWidth, (clip.fadeOutSec / clipDur) * pixelWidth)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
      ctx.beginPath()
      ctx.moveTo(pixelWidth, 0)
      ctx.lineTo(pixelWidth - fadePx, 0)
      ctx.lineTo(pixelWidth, logicalH)
      ctx.closePath()
      ctx.fill()
    }
  }, [waveformPeaks, pixelWidth, isSelected, clip.fadeInSec, clip.fadeOutSec, clipDur])

  // --- Interaction ---

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.stopPropagation()
      useTimelineStore.getState().selectClip(clip.id)
      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
      const localX = e.clientX - rect.left
      // Fade-in handle near left edge
      if (localX < FADE_HANDLE_PX) {
        dragRef.current = { kind: 'fadeIn', startX: e.clientX, startVal: clip.fadeInSec }
      } else if (localX > rect.width - FADE_HANDLE_PX) {
        dragRef.current = { kind: 'fadeOut', startX: e.clientX, startVal: clip.fadeOutSec }
      } else {
        dragRef.current = { kind: 'move', startX: e.clientX, startVal: clip.startSec }
      }
      ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
    },
    [clip.id, clip.fadeInSec, clip.fadeOutSec, clip.startSec],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current
      if (!drag) return
      const dxPx = e.clientX - drag.startX
      const dxSec = dxPx / zoom
      if (drag.kind === 'move') {
        const newStart = Math.max(0, drag.startVal + dxSec)
        useTimelineStore.getState().moveAudioClip(clip.id, newStart)
      } else if (drag.kind === 'fadeIn') {
        const newFade = Math.max(0, Math.min(clipDur, drag.startVal + dxSec))
        useTimelineStore.getState().setClipFade(clip.id, newFade, clip.fadeOutSec)
      } else if (drag.kind === 'fadeOut') {
        const newFade = Math.max(0, Math.min(clipDur, drag.startVal - dxSec))
        useTimelineStore.getState().setClipFade(clip.id, clip.fadeInSec, newFade)
      }
    },
    [clip.id, clip.fadeInSec, clip.fadeOutSec, clipDur, zoom],
  )

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (dragRef.current) {
        ;(e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId)
        dragRef.current = null
      }
    },
    [],
  )

  const formatGain = (db: number): string => (db === 0 ? '0 dB' : db > 0 ? `+${db.toFixed(1)} dB` : `${db.toFixed(1)} dB`)

  return (
    <div
      className={`audio-clip${isSelected ? ' audio-clip--selected' : ''}${clip.muted ? ' audio-clip--muted' : ''}${clip.missing ? ' audio-clip--missing' : ''}`}
      data-clip-id={clip.id}
      style={{
        position: 'absolute',
        left: `${left}px`,
        width: `${width}px`,
        height: `${TRACK_HEIGHT - 2}px`,
        top: 1,
        background: clip.missing ? '#3f1f1f' : '#1a3320',
        border: `1px solid ${isSelected ? '#86efac' : '#2d5a3a'}`,
        borderRadius: 2,
        overflow: 'hidden',
        cursor: 'grab',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div
        className="audio-clip__label"
        style={{
          fontSize: 10,
          padding: '2px 6px',
          color: clip.missing ? '#fca5a5' : '#bbf7d0',
          fontFamily: 'JetBrains Mono, monospace',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          background: 'rgba(0,0,0,0.25)',
        }}
      >
        {clip.missing && <span style={{ color: '#ef4444', marginRight: 6 }}>MISSING</span>}
        {clip.muted && <span style={{ color: '#f59e0b', marginRight: 6 }}>M</span>}
        {clip.path.split('/').pop() ?? clip.path}
        <span style={{ color: '#4ade80', marginLeft: 8, opacity: 0.8 }}>{formatGain(clip.gainDb)}</span>
      </div>
      <canvas ref={canvasRef} style={{ display: 'block' }} />
    </div>
  )
}
