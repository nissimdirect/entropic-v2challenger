import { useCallback, useRef, useState } from 'react'
import { useTimelineStore } from '../../stores/timeline'
import TimeRuler from './TimeRuler'
import Playhead from './Playhead'
import { TrackHeader, TrackLane } from './Track'
import ZoomScroll from './ZoomScroll'
import LoopRegion from './LoopRegion'
import MarkerFlag from './MarkerFlag'

interface TimelineProps {
  onSeek: (time: number) => void
}

export default function Timeline({ onSeek }: TimelineProps) {
  const tracks = useTimelineStore((s) => s.tracks)
  const playheadTime = useTimelineStore((s) => s.playheadTime)
  const duration = useTimelineStore((s) => s.duration)
  const zoom = useTimelineStore((s) => s.zoom)
  const scrollX = useTimelineStore((s) => s.scrollX)
  const selectedTrackId = useTimelineStore((s) => s.selectedTrackId)
  const selectedClipId = useTimelineStore((s) => s.selectedClipId)
  const markers = useTimelineStore((s) => s.markers)
  const loopRegion = useTimelineStore((s) => s.loopRegion)

  const [height, setHeight] = useState(200)
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
    resizeRef.current = null
  }, [])

  const handleAddTrack = useCallback(() => {
    const colors = ['#ef4444', '#f59e0b', '#4ade80', '#3b82f6', '#a855f7', '#ec4899']
    const color = colors[tracks.length % colors.length]
    useTimelineStore.getState().addTrack(`Track ${tracks.length + 1}`, color)
  }, [tracks.length])

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    useTimelineStore.getState().setScrollX(e.currentTarget.scrollLeft)
  }, [])

  const handleZoomChange = useCallback((z: number) => {
    useTimelineStore.getState().setZoom(z)
  }, [])

  const handleDeleteMarker = useCallback((id: string) => {
    useTimelineStore.getState().removeMarker(id)
  }, [])

  // Width of the scrollable area based on duration
  const contentWidth = Math.max(800, (duration + 10) * zoom)

  if (tracks.length === 0) {
    return (
      <div className="timeline" style={{ height: `${height}px` }}>
        <div
          className="timeline__resize-handle"
          onPointerDown={handleResizeDown}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeUp}
        />
        <div className="timeline__empty">
          <button className="timeline__add-track-btn" onClick={handleAddTrack}>
            + Add Track
          </button>
        </div>
        <div className="timeline__footer">
          <ZoomScroll zoom={zoom} onZoomChange={handleZoomChange} />
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
      <div className="timeline__body">
        {/* Left: track headers */}
        <div className="timeline__headers">
          <div className="timeline__headers-spacer">
            <button className="timeline__add-track-btn" onClick={handleAddTrack}>
              + Add
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
            <div style={{ width: `${contentWidth}px`, position: 'relative' }}>
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
                  selectedClipId={selectedClipId}
                />
              ))}
              <Playhead time={playheadTime} zoom={zoom} scrollX={scrollX} onSeek={onSeek} />
            </div>
          </div>
        </div>
      </div>
      <div className="timeline__footer">
        <ZoomScroll zoom={zoom} onZoomChange={handleZoomChange} />
      </div>
    </div>
  )
}
