import { useCallback, useRef } from 'react'
import { useTimelineStore } from '../../stores/timeline'
import { useLayoutStore } from '../../stores/layout'
import TimeRuler from './TimeRuler'
import Playhead from './Playhead'
import { TrackHeader, TrackLane } from './Track'
import LoopRegion from './LoopRegion'
import MarkerFlag from './MarkerFlag'

interface TimelineProps {
  onSeek: (time: number) => void
  isDragOver?: boolean
  isPlaying?: boolean
  onPlayPause?: () => void
  onStop?: () => void
  loopEnabled?: boolean
  onToggleLoop?: () => void
  bpm?: number
  onBpmChange?: (bpm: number) => void
  quantizeEnabled?: boolean
  quantizeDivision?: number
  onToggleQuantize?: () => void
  onQuantizeDivisionChange?: (div: number) => void
  waveformPeaks?: number[][][] | null
  clipThumbnails?: { time: number; data: string }[]
}

function formatTimecode(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toFixed(1).padStart(4, '0')}`
}

const QUANT_DIVISIONS = [1, 2, 4, 8, 16, 32]
const QUANT_LABELS: Record<number, string> = { 1: '1/1', 2: '1/2', 4: '1/4', 8: '1/8', 16: '1/16', 32: '1/32' }

export default function Timeline({
  onSeek, isDragOver, isPlaying, onPlayPause, onStop, loopEnabled, onToggleLoop,
  bpm, onBpmChange, quantizeEnabled, quantizeDivision = 4, onToggleQuantize, onQuantizeDivisionChange,
  waveformPeaks,
  clipThumbnails,
}: TimelineProps) {
  const tracks = useTimelineStore((s) => s.tracks)
  const playheadTime = useTimelineStore((s) => s.playheadTime)
  const duration = useTimelineStore((s) => s.duration)
  const zoom = useTimelineStore((s) => s.zoom)
  const scrollX = useTimelineStore((s) => s.scrollX)
  const selectedTrackId = useTimelineStore((s) => s.selectedTrackId)
  const selectedClipIds = useTimelineStore((s) => s.selectedClipIds)
  const markers = useTimelineStore((s) => s.markers)
  const loopRegion = useTimelineStore((s) => s.loopRegion)

  const height = useLayoutStore((s) => s.timelineHeight)
  const setHeight = useCallback((h: number) => useLayoutStore.getState().setTimelineHeight(h), [])
  const resizeRef = useRef<{ startY: number; startH: number } | null>(null)

  const handleResizeDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      resizeRef.current = { startY: e.clientY, startH: height }
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    },
    [height],
  )

  const handleResizeMove = useCallback((e: React.PointerEvent) => {
    if (!resizeRef.current) return
    const dy = resizeRef.current.startY - e.clientY // drag up = taller
    const newH = Math.max(120, Math.min(window.innerHeight * 0.5, resizeRef.current.startH + dy))
    setHeight(newH)
  }, [])

  const handleResizeUp = useCallback(() => {
    if (resizeRef.current) {
      useLayoutStore.getState().setTimelineHeight(height)
    }
    resizeRef.current = null
  }, [height])

  const handleAddTrack = useCallback(() => {
    const colors = ['#ef4444', '#f59e0b', '#4ade80', '#3b82f6', '#a855f7', '#ec4899']
    const color = colors[tracks.length % colors.length]
    useTimelineStore.getState().addTrack(`Track ${tracks.length + 1}`, color)
  }, [tracks.length])

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    useTimelineStore.getState().setScrollX(e.currentTarget.scrollLeft)
  }, [])

  const handleDeleteMarker = useCallback((id: string) => {
    useTimelineStore.getState().removeMarker(id)
  }, [])

  // Native wheel listener with { passive: false } so preventDefault() works.
  // React's onWheel uses passive listeners in Chrome/Electron, which makes
  // preventDefault() a no-op and breaks Cmd+scroll zoom and pinch-to-zoom.
  // Uses callback ref — guaranteed to fire when the conditionally-rendered
  // body div mounts (useRef+useEffect missed it on mount with 0 tracks).
  const prevBodyEl = useRef<HTMLDivElement | null>(null)
  const prevWheelHandler = useRef<((e: WheelEvent) => void) | null>(null)
  const bodyRef = useCallback((el: HTMLDivElement | null) => {
    if (prevBodyEl.current && prevWheelHandler.current) {
      prevBodyEl.current.removeEventListener('wheel', prevWheelHandler.current)
    }
    prevBodyEl.current = el
    prevWheelHandler.current = null
    if (!el) return
    const handler = (e: WheelEvent) => {
      const ts = useTimelineStore.getState()
      // Cmd+scroll = zoom. Pinch-to-zoom on macOS trackpad sets ctrlKey in
      // Chrome/Electron (even with setVisualZoomLevelLimits(1,1)).
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault()
        // Scale delta proportionally — faster zoom at higher levels
        const factor = e.deltaY > 0 ? 0.9 : 1.1
        ts.setZoom(Math.max(0.5, Math.min(500, ts.zoom * factor)))
      } else {
        // Plain scroll = horizontal pan — clamp to content bounds
        const maxScroll = Math.max(0, (ts.duration + 1) * ts.zoom - (el?.clientWidth ?? 800))
        ts.setScrollX(Math.max(0, Math.min(maxScroll, ts.scrollX + e.deltaX)))
      }
    }

    // macOS trackpad pinch gesture (fires as 'gesturechange' in Electron/WebKit)
    const gestureHandler = (e: Event) => {
      e.preventDefault()
      const ge = e as unknown as { scale: number }
      if (typeof ge.scale !== 'number') return
      const ts = useTimelineStore.getState()
      ts.setZoom(Math.max(0.5, Math.min(500, ts.zoom * ge.scale)))
    }
    prevWheelHandler.current = handler
    el.addEventListener('wheel', handler, { passive: false })
    el.addEventListener('gesturechange', gestureHandler as EventListener)
    el.addEventListener('gesturestart', (e) => e.preventDefault())  // prevent native zoom
  }, [])

  // Width = exactly clip duration + 1s buffer. No wasted space.
  const contentWidth = (duration + 1) * zoom

  if (tracks.length === 0) {
    return (
      <div className="timeline" style={{ height: `${height}px` }}>
        <div
          className="timeline__resize-handle"
          onPointerDown={handleResizeDown}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeUp}
        />
        <div className={`timeline__drop-highlight ${isDragOver ? 'timeline__drop-highlight--active' : ''}`} />
        <div className="timeline__empty">
          <div className="timeline__empty-hint">
            Drag media here, press <kbd>&#8984;I</kbd>, or use File &rarr; Import
          </div>
          <button className="timeline__add-track-btn" onClick={handleAddTrack}>
            + Add Track
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="timeline" style={{ height: `${height}px` }}>
      <div
        className="timeline__resize-handle"
        onPointerDown={handleResizeDown}
        onPointerMove={handleResizeMove}
        onPointerUp={handleResizeUp}
      />
      <div className={`timeline__drop-highlight ${isDragOver ? 'timeline__drop-highlight--active' : ''}`} />
      {/* Transport bar moved to app__transport-bar at top of screen */}
      <div className="timeline__body" ref={bodyRef}>
        {/* Left: track headers */}
        <div className="timeline__headers">
          <div className="timeline__headers-spacer">
            <button className="timeline__add-track-btn" onClick={handleAddTrack} title="Add video track">
              +
            </button>
          </div>
          <div className="timeline__track-headers">
            {tracks.map((track) => (
              <TrackHeader
                key={track.id}
                track={track}
                isSelected={track.id === selectedTrackId}
              />
            ))}
          </div>
        </div>

        {/* Right: ruler + track lanes */}
        <div className="timeline__lanes">
          <div className="timeline__ruler-scroll">
            <div style={{ width: `${contentWidth}px`, marginLeft: `-${scrollX}px` }}>
              <TimeRuler zoom={zoom} scrollX={0} duration={duration} onSeek={onSeek} />
            </div>
          </div>
          <div className="timeline__tracks-scroll" onScroll={handleScroll}>
            <div style={{
              width: `${contentWidth}px`,
              position: 'relative',
              ...(quantizeEnabled && bpm ? (() => {
                const gridInterval = (60 / bpm) * (4 / quantizeDivision)
                const gridPx = gridInterval * zoom
                // Only show grid when lines are at least 10px apart
                if (gridPx < 10) return {}
                return {
                  backgroundImage: `repeating-linear-gradient(90deg, transparent, transparent ${gridPx - 1}px, #333 ${gridPx - 1}px, #333 ${gridPx}px)`,
                }
              })() : {}),
            }}>
              {loopRegion && (
                <LoopRegion
                  loopIn={loopRegion.in}
                  loopOut={loopRegion.out}
                  zoom={zoom}
                  scrollX={scrollX}
                />
              )}
              {markers.map((m) => (
                <MarkerFlag
                  key={m.id}
                  marker={m}
                  zoom={zoom}
                  scrollX={scrollX}
                  onSeek={onSeek}
                  onDelete={handleDeleteMarker}
                />
              ))}
              {tracks.map((track) => (
                <TrackLane
                  key={track.id}
                  track={track}
                  zoom={zoom}
                  scrollX={scrollX}
                  isSelected={track.id === selectedTrackId}
                  selectedClipIds={selectedClipIds}
                  waveformPeaks={waveformPeaks}
                  clipThumbnails={clipThumbnails}
                  onSeek={onSeek}
                />
              ))}
              <Playhead time={playheadTime} zoom={zoom} scrollX={scrollX} onSeek={onSeek} />
            </div>
          </div>
        </div>
      </div>
      {/* Transport bar moved to timeline__toolbar above the body */}
    </div>
  )
}
