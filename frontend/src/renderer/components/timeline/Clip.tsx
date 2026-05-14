import { useCallback, useEffect, useRef, useState } from 'react'
import type { Clip as ClipType } from '../../../shared/types'
import { useTimelineStore } from '../../stores/timeline'
import { useLayoutStore } from '../../stores/layout'
import { useProjectStore } from '../../stores/project'
import { useToastStore } from '../../stores/toast'
import { downsamplePeaks } from '../transport/useWaveform'
import type { WaveformPeaks } from '../transport/useWaveform'
import ContextMenu from './ContextMenu'
import type { MenuItem } from './ContextMenu'
import { shortcutRegistry } from '../../utils/shortcuts'
import { prettyShortcut } from '../../utils/pretty-shortcut'

/** Snap a position to the nearest grid line if quantize is enabled. */
function snapToGrid(pos: number, bypassSnap: boolean): number {
  if (bypassSnap) return pos
  const { quantizeEnabled, quantizeDivision } = useLayoutStore.getState()
  const { bpm } = useProjectStore.getState()
  if (!quantizeEnabled || bpm <= 0) return pos
  const interval = (60 / bpm) * (4 / quantizeDivision)
  return Math.round(pos / interval) * interval
}

interface ClipProps {
  clip: ClipType
  zoom: number
  scrollX: number
  isSelected: boolean
  assetName: string
  waveformPeaks?: WaveformPeaks | null
  assetDuration?: number
  thumbnails?: { time: number; data: string }[]
}

export default function ClipComponent({ clip, zoom, scrollX, isSelected, assetName, waveformPeaks, assetDuration, thumbnails }: ClipProps) {
  const isDragging = useRef(false)
  const dragStartX = useRef(0)
  const dragStartPos = useRef(0)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)

  // Mini waveform canvas
  const waveCanvasRef = useRef<HTMLCanvasElement>(null)
  const [waveWidth, setWaveWidth] = useState(0)

  // ResizeObserver to track clip pixel width for the waveform canvas
  useEffect(() => {
    const canvas = waveCanvasRef.current
    if (!canvas) return
    const parent = canvas.parentElement
    if (!parent) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWaveWidth(Math.floor(entry.contentRect.width))
      }
    })
    observer.observe(parent)
    setWaveWidth(Math.floor(parent.clientWidth))

    return () => observer.disconnect()
  }, [])

  // Draw the mini waveform slice corresponding to clip's inPoint/outPoint
  useEffect(() => {
    const canvas = waveCanvasRef.current
    if (!canvas || !waveformPeaks || waveformPeaks.length === 0 || waveWidth <= 0) return

    const totalPeaks = waveformPeaks.length
    const totalDur = assetDuration && assetDuration > 0 ? assetDuration : clip.outPoint

    // Determine which slice of peaks corresponds to clip's in/out range
    const startFrac = Math.max(0, Math.min(1, clip.inPoint / totalDur))
    const endFrac = Math.max(0, Math.min(1, clip.outPoint / totalDur))
    const startIdx = Math.floor(startFrac * totalPeaks)
    const endIdx = Math.min(totalPeaks, Math.ceil(endFrac * totalPeaks))
    const slicedPeaks = waveformPeaks.slice(startIdx, endIdx)

    const dpr = window.devicePixelRatio || 1
    const logicalWidth = waveWidth
    const logicalHeight = canvas.clientHeight || 30  // bottom half of 60px track

    canvas.width = logicalWidth * dpr
    canvas.height = logicalHeight * dpr

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, logicalWidth, logicalHeight)

    const bins = downsamplePeaks(slicedPeaks, logicalWidth)
    if (bins.length === 0) return

    const midY = logicalHeight / 2
    ctx.fillStyle = '#4ade80'  // bright green — visible on dark clip background
    const binWidth = logicalWidth / bins.length

    for (let i = 0; i < bins.length; i++) {
      const { min, max } = bins[i]
      const top = midY - max * midY
      const bottom = midY - min * midY
      const barHeight = Math.max(1, bottom - top)
      ctx.fillRect(i * binWidth, top, Math.max(1, binWidth - 0.5), barHeight)
    }
  }, [waveformPeaks, assetDuration, clip.inPoint, clip.outPoint, waveWidth])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Select the clip if not already selected
    const store = useTimelineStore.getState()
    if (!store.selectedClipIds.includes(clip.id)) {
      store.selectClip(clip.id)
    }
    setCtxMenu({ x: e.clientX, y: e.clientY })
  }, [clip.id])

  const getContextMenuItems = useCallback((): MenuItem[] => {
    const store = useTimelineStore.getState()
    const playheadTime = store.playheadTime
    const withinClip = playheadTime >= clip.position && playheadTime < clip.position + clip.duration

    return [
      {
        label: 'Split at Playhead',
        action: () => store.splitClip(clip.id, playheadTime),
        disabled: !withinClip,
        shortcut: prettyShortcut(shortcutRegistry.getEffectiveKey('split_at_playhead')),
      },
      { label: 'Duplicate', action: () => store.duplicateClip(clip.id) },
      { label: 'Delete', action: () => store.removeClip(clip.id) },
      { label: '', action: () => {}, separator: true },
      {
        label: 'Speed/Duration...',
        action: () => {
          const pos = ctxMenu ?? { x: 200, y: 200 }
          useTimelineStore.getState().openSpeedDialog(clip.id, pos)
        },
      },
      { label: 'Reverse', action: () => store.reverseClip(clip.id) },
      { label: '', action: () => {}, separator: true },
      {
        label: clip.isEnabled === false ? 'Enable' : 'Disable',
        action: () => store.toggleClipEnabled(clip.id),
      },
    ]
  }, [clip.id, clip.position, clip.duration, clip.speed, clip.isEnabled])

  const left = clip.position * zoom - scrollX
  const width = clip.duration * zoom

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Don't start drag from trim handles
      if ((e.target as HTMLElement).classList.contains('clip__trim-handle')) return

      e.preventDefault()
      e.stopPropagation()
      isDragging.current = true
      dragStartX.current = e.clientX
      dragStartPos.current = clip.position
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)

      const store = useTimelineStore.getState()
      if (e.metaKey || e.ctrlKey) {
        store.toggleClipSelection(clip.id)
      } else if (e.shiftKey && store.selectedClipIds.length > 0) {
        const lastSelected = store.selectedClipIds[store.selectedClipIds.length - 1]
        store.rangeSelectClips(lastSelected, clip.id)
      } else {
        store.selectClip(clip.id)
      }
    },
    [clip.id, clip.position],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current) return
      const dx = e.clientX - dragStartX.current
      const dt = dx / zoom
      const newPos = Math.max(0, dragStartPos.current + dt)
      const snapped = snapToGrid(newPos, e.metaKey)

      // Detect target track by Y. Iterate visible track lanes and check bounding rects.
      // Do NOT latch pendingNewTrack from transient move samples — OS interrupts or window
      // exits can leave a false latch. Re-check belowAllTracks at pointerup instead.
      const lanes = document.querySelectorAll<HTMLElement>('.track-lane[data-track-id]')
      let targetTrackId = clip.trackId

      for (const lane of lanes) {
        const rect = lane.getBoundingClientRect()
        if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
          const id = lane.dataset.trackId
          if (id) targetTrackId = id
        }
      }

      useTimelineStore.getState().moveClip(clip.id, targetTrackId, snapped)
    },
    [clip.id, clip.trackId, zoom],
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current) {
        return
      }
      // Compute belowAllTracks from the pointer-UP position, not a latched move sample.
      const lanes = document.querySelectorAll<HTMLElement>('.track-lane[data-track-id]')
      let maxBottom = -Infinity
      for (const lane of lanes) {
        const rect = lane.getBoundingClientRect()
        if (rect.bottom > maxBottom) maxBottom = rect.bottom
      }
      const belowAllTracks = maxBottom !== -Infinity && e.clientY > maxBottom

      if (belowAllTracks) {
        const store = useTimelineStore.getState()
        const current = store.tracks.find((t) => t.clips.some((c) => c.id === clip.id))
        const currentClip = current?.clips.find((c) => c.id === clip.id)
        const newTrackId = store.addTrack(`Track ${store.tracks.length + 1}`, '#4ade80', 'video')
        if (newTrackId && currentClip) {
          store.moveClip(clip.id, newTrackId, currentClip.position)
        } else if (!newTrackId) {
          useToastStore.getState().addToast({
            level: 'warning',
            message: 'Could not create new track — limit reached.',
            source: 'clip-drag-new-track',
          })
        }
      }
      isDragging.current = false
    },
    [clip.id],
  )

  // pointercancel (OS interrupt, context menu, window focus loss) must reset state
  // without creating a track — we can't trust the event's position in that case.
  const handlePointerCancel = useCallback(() => {
    isDragging.current = false
  }, [])

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      // Selection is handled in pointerDown — click is a no-op to prevent double-fire
    },
    [clip.id],
  )

  // Trim left handle
  const handleTrimLeftDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const startX = e.clientX
      const startIn = clip.inPoint
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)

      const onMove = (me: PointerEvent) => {
        const dx = me.clientX - startX
        const dt = dx / zoom
        const rawIn = Math.max(0, startIn + dt)
        const newIn = snapToGrid(rawIn, me.metaKey)
        useTimelineStore.getState().trimClipIn(clip.id, newIn)
      }
      const onUp = () => {
        document.removeEventListener('pointermove', onMove)
        document.removeEventListener('pointerup', onUp)
      }
      document.addEventListener('pointermove', onMove)
      document.addEventListener('pointerup', onUp)
    },
    [clip.id, clip.inPoint, zoom],
  )

  // Trim right handle
  const handleTrimRightDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const startX = e.clientX
      const startOut = clip.outPoint
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)

      const onMove = (me: PointerEvent) => {
        const dx = me.clientX - startX
        const dt = dx / zoom
        const rawOut = startOut + dt
        const newOut = snapToGrid(rawOut, me.metaKey)
        useTimelineStore.getState().trimClipOut(clip.id, newOut)
      }
      const onUp = () => {
        document.removeEventListener('pointermove', onMove)
        document.removeEventListener('pointerup', onUp)
      }
      document.addEventListener('pointermove', onMove)
      document.addEventListener('pointerup', onUp)
    },
    [clip.id, clip.outPoint, zoom],
  )

  // Don't render if off-screen
  if (left + width < 0) return null

  const isTextClip = !!clip.textConfig
  const displayName = isTextClip
    ? (clip.textConfig!.text.slice(0, 30) || 'Text')
    : assetName

  const isDisabled = clip.isEnabled === false

  return (
    <>
      <div
        className={`clip${isSelected ? ' clip--selected' : ''}${isTextClip ? ' clip--text' : ''}${isDisabled ? ' clip--disabled' : ''}`}
        style={{ left: `${left}px`, width: `${Math.max(4, width)}px` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        {thumbnails && thumbnails.length > 0 && (
          <div className="clip__thumbnails">
            {thumbnails.map((thumb, i) => (
              <img
                key={i}
                src={`data:image/jpeg;base64,${thumb.data}`}
                className="clip__thumb"
                draggable={false}
              />
            ))}
          </div>
        )}
        {waveformPeaks && waveformPeaks.length > 0 && (
          <canvas
            ref={waveCanvasRef}
            className="clip__waveform"
            style={{ width: '100%', height: '100%' }}
          />
        )}
        <div
          className="clip__trim-handle clip__trim-handle--left"
          onPointerDown={handleTrimLeftDown}
        />
        <span className={`clip__name${isTextClip ? ' clip__name--text' : ''}`}>{displayName}</span>
        <div
          className="clip__trim-handle clip__trim-handle--right"
          onPointerDown={handleTrimRightDown}
        />
      </div>
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={getContextMenuItems()}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </>
  )
}
