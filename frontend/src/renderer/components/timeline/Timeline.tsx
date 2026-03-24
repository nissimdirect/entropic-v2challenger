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

  const handleWheel = useCallback((e: React.WheelEvent) => {
    const ts = useTimelineStore.getState()
    if (e.metaKey || e.ctrlKey) {
      // Cmd+scroll = zoom (pinch-to-zoom on trackpad maps to this)
      e.preventDefault()
      const delta = e.deltaY > 0 ? -5 : 5
      ts.setZoom(Math.max(10, Math.min(200, ts.zoom + delta)))
    } else {
      // Plain scroll = horizontal pan
      ts.setScrollX(Math.max(0, ts.scrollX + e.deltaX + e.deltaY))
    }
  }, [])

  // Width of the scrollable area based on duration
  // Always add 20% runway past the end so user can scroll beyond, never shrink below viewport
  const durationWidth = (duration + Math.max(10, duration * 0.2)) * zoom
  const contentWidth = Math.max(2000, durationWidth)

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
      <div className="timeline__body" onWheel={handleWheel}>
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
                />
              ))}
              <Playhead time={playheadTime} zoom={zoom} scrollX={scrollX} onSeek={onSeek} />
            </div>
          </div>
        </div>
      </div>
      <div className="timeline__footer">
        <div className="timeline__transport">
          {onPlayPause && (
            <button
              className={`timeline__transport-btn ${isPlaying ? 'timeline__transport-btn--active' : ''}`}
              onClick={onPlayPause}
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? '⏸' : '▶'}
            </button>
          )}
          {onStop && (
            <button className="timeline__transport-btn" onClick={onStop} title="Stop">
              ⏹
            </button>
          )}
          {onToggleLoop && (
            <button
              className={`timeline__transport-btn ${loopEnabled ? 'timeline__transport-btn--active' : ''}`}
              onClick={onToggleLoop}
              title={loopEnabled ? 'Disable loop' : 'Enable loop'}
            >
              🔁
            </button>
          )}
        </div>
        <span className="timeline__timecode">
          {formatTimecode(playheadTime)} / {formatTimecode(duration)}
        </span>
        {onBpmChange && (
          <div className="timeline__bpm">
            <label className="timeline__bpm-label">BPM</label>
            <input
              className="timeline__bpm-input"
              type="number"
              min={1}
              max={300}
              value={bpm ?? 120}
              onChange={(e) => onBpmChange(Number(e.target.value))}
            />
          </div>
        )}
        {onToggleQuantize && (
          <div className="timeline__quant">
            <button
              className={`timeline__transport-btn ${quantizeEnabled ? 'timeline__transport-btn--active' : ''}`}
              onClick={onToggleQuantize}
              title="Toggle quantize (Cmd+U)"
            >
              Q
            </button>
            {onQuantizeDivisionChange && (
              <select
                className="timeline__quant-select"
                value={quantizeDivision}
                onChange={(e) => onQuantizeDivisionChange(Number(e.target.value))}
              >
                {QUANT_DIVISIONS.map((d) => (
                  <option key={d} value={d}>{QUANT_LABELS[d]}</option>
                ))}
              </select>
            )}
          </div>
        )}
        <button className="timeline__collapse-btn" onClick={() => useLayoutStore.getState().toggleTimeline()} title="Collapse timeline">
          &#9660;
        </button>
      </div>
    </div>
  )
}
