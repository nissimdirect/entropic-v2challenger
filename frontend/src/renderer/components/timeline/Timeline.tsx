import { useCallback, useEffect, useRef, useState } from 'react'
import { useTimelineStore } from '../../stores/timeline'
import { useLayoutStore } from '../../stores/layout'
import TimeRuler from './TimeRuler'
import Playhead from './Playhead'
import { TrackHeader, TrackLane } from './Track'
import { AudioTrackHeader, AudioTrackLane } from './AudioTrack'
import { InspectorTrackHeader, InspectorTrackLane } from './InspectorTrack'
import { MasterTrackHeader, MasterTrackLane } from './MasterTrack'
import GridOverlay from './GridOverlay'
import LoopRegion from './LoopRegion'
import { cancelActiveMarqueeDrag } from './MarqueeOverlay'
import MarkerFlag from './MarkerFlag'
import ContextMenu from './ContextMenu'
import type { MenuItem } from './ContextMenu'
import type { Track as TrackType } from '../../../shared/types'

// W1.5b PK.B1: the render fork over track headers collapses to a single
// capability lookup by track.type — each entry is one of the four thin
// per-type wrapper components (all now delegate their JSX to the shared
// UnifiedTrackHeader; see Track.tsx/AudioTrack.tsx/InspectorTrack.tsx/
// MasterTrack.tsx). Lanes are untouched (out of PK.B1's scope — headers only).
const TRACK_HEADER_BY_TYPE: Record<TrackType['type'], (props: { track: TrackType; isSelected: boolean }) => React.ReactElement> = {
  video: TrackHeader,
  text: TrackHeader,
  performance: TrackHeader,
  audio: AudioTrackHeader,
  inspector: InspectorTrackHeader,
  master: MasterTrackHeader,
}

// P3.12: TrackType['type'] is exhaustive at the TYPE level, but a runtime
// track.type can still miss the map — e.g. a persisted project from a
// future app version with a track type this build doesn't know, or
// corrupted/hand-edited project JSON. TRACK_HEADER_BY_TYPE[track.type]
// returning undefined there would render `<undefined ... />`, which React
// throws on (white screen for the whole timeline, not just one row).
// Fall back to the generic TrackHeader rather than crash.
function getTrackHeaderComponent(type: TrackType['type']): (props: { track: TrackType; isSelected: boolean }) => React.ReactElement {
  return TRACK_HEADER_BY_TYPE[type] ?? TrackHeader
}

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

export default function Timeline({
  onSeek, isDragOver, isPlaying, onPlayPause, onStop, loopEnabled, onToggleLoop,
  bpm, onBpmChange, quantizeEnabled, quantizeDivision = 4, onToggleQuantize, onQuantizeDivisionChange,
  waveformPeaks,
  clipThumbnails,
}: TimelineProps) {
  const tracks = useTimelineStore((s) => s.tracks)
  // M.2 (Master-Out Bus PRD): the Master track is PINNED at the bottom of the
  // timeline regardless of its position in the store's `tracks` array (array
  // position doesn't matter for render/export — pipeline.py/compositor.py
  // locate it by `type === 'master'`, not index). Split it out of the ordered
  // list here so both the headers and lanes columns render every other track
  // in store order, then the Master row last, in both columns.
  const orderedTracks = tracks.filter((t) => t.type !== 'master')
  const masterTrack = tracks.find((t) => t.type === 'master')
  const playheadTime = useTimelineStore((s) => s.playheadTime)
  const duration = useTimelineStore((s) => s.duration)
  const zoom = useTimelineStore((s) => s.zoom)
  const scrollX = useTimelineStore((s) => s.scrollX)
  const selectedTrackId = useTimelineStore((s) => s.selectedTrackId)
  const selectedClipIds = useTimelineStore((s) => s.selectedClipIds)
  const markers = useTimelineStore((s) => s.markers)
  const loopRegion = useTimelineStore((s) => s.loopRegion)

  // P3.13b: ONE Escape listener for the whole timeline, replacing what used
  // to be one window.addEventListener('keydown', ...) registered PER MOUNTED
  // MarqueeOverlay instance (one per lane/track — N identical listeners for
  // N tracks, all doing the same thing redundantly). Text-input guard
  // mirrors shortcutRegistry.handleKeyEvent's isTextInput check (shortcuts.ts)
  // so Escape inside e.g. the BPM input still lets the browser/input handle
  // it normally instead of also clearing the arrangement selection region.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const target = e.target as HTMLElement | null
      const isTextInput =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable
      if (isTextInput) return
      // Mid-drag cancel (unchanged NEGATIVE behavior: does NOT touch clip
      // selection) takes priority over clearing an already-committed region.
      if (cancelActiveMarqueeDrag()) return
      if (useTimelineStore.getState().selectionRegion) {
        useTimelineStore.getState().clearSelectionRegion()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

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

  // B2: create a Performance/MIDI track (electric blue) and select it, so the
  // Instruments browser can drop/double-click a Sampler onto it.
  const handleAddMidiTrack = useCallback(() => {
    const n = tracks.filter((t) => t.type === 'performance').length + 1
    const id = useTimelineStore.getState().addTrack(`MIDI ${n}`, '#3b82f6', 'performance')
    if (id) useTimelineStore.getState().selectTrack(id)
  }, [tracks])

  // QF3 (W1.5a owner walk, second walk 2026-07-31 AMENDED): "I should be
  // able to right-click and then add a track." — AMENDED same day: "It's
  // not just three buttons where you pick one of them... not three separate
  // buttons for three separate types." One unified menu, not per-type
  // buttons. handleAddTextTrack mirrors App.tsx's Cmd+T handler (the same
  // addTextTrack store action) — this menu is the only place in Timeline.tsx
  // a text track can be added (no dedicated + button here; the sidebar's
  // own "+ Add Text Track" in EffectBrowser.tsx is a separate, untouched
  // entry point).
  const handleAddTextTrack = useCallback(() => {
    const textCount = tracks.filter((t) => t.type === 'text').length
    useTimelineStore.getState().addTextTrack(`Text ${textCount + 1}`, '#6366f1')
  }, [tracks])

  // QF3/QF6 (2026-07-31 second owner walk): ONE menu, reached two ways —
  // right-click the empty lane bed (track-list background, below/between
  // tracks — NOT a track header, which already owns its own context menu
  // via TrackHeader.handleContextMenu), or click the single "+ Track"
  // button in the headers-spacer (QF6 — replaces the old three-button row).
  // Deliberately excludes Inspector (QF6: its creation entry point is
  // removed entirely — see handleAddTrackButtonClick's neighboring comment
  // in the JSX below for what stays vs. goes).
  const [addTrackMenu, setAddTrackMenu] = useState<{ x: number; y: number } | null>(null)
  const handleLaneBedContextMenu = useCallback((e: React.MouseEvent) => {
    // P2.7: this handler is bound on .timeline__tracks-scroll, which
    // contains clips, audio clips, and the loop region as descendants — a
    // right-click on any of THOSE should open their OWN context menu (or
    // none), not the lane-bed's add-track menu. Guard against those
    // surfaces explicitly rather than relying on stopPropagation elsewhere.
    if ((e.target as HTMLElement).closest('.clip, [data-testid="audio-clip"], [data-testid="loop-region"]')) return
    e.preventDefault()
    setAddTrackMenu({ x: e.clientX, y: e.clientY })
  }, [])
  // QF6: anchor the dropdown below the button that opened it (standard
  // menu-button pattern), rather than at the click point inside the button.
  const handleAddTrackButtonClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setAddTrackMenu({ x: rect.left, y: rect.bottom + 4 })
  }, [])
  const addTrackMenuItems: MenuItem[] = [
    { label: 'Add Video Track', action: handleAddTrack, testId: 'add-track-menu-item-video' },
    { label: 'Add MIDI Track', action: handleAddMidiTrack, testId: 'add-track-menu-item-midi' },
    { label: 'Add Text Track', action: handleAddTextTrack, testId: 'add-track-menu-item-text' },
  ]

  // Track-headers column needs to follow the lanes' vertical scroll so the
  // left/right halves of each row stay aligned when the user has more tracks
  // than fit in the visible area.
  const headersRef = useRef<HTMLDivElement | null>(null)
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    useTimelineStore.getState().setScrollX(e.currentTarget.scrollLeft)
    const headers = headersRef.current
    if (headers && headers.scrollTop !== e.currentTarget.scrollTop) {
      headers.scrollTop = e.currentTarget.scrollTop
    }
  }, [])

  // W1.5b PK.B2 — scroll the selected track's header row into view within
  // the track-headers column whenever selection changes from ANY surface
  // (LayerPanel, status bar, etc.) — not just clicking the header itself,
  // which is already visible when clicked (the geometry check below is a
  // no-op in that case: delta stays 0). Target semantics are
  // scrollIntoView({block:'nearest'}), but native scrollIntoView is not
  // deterministically testable under happy-dom (no real layout engine), so
  // "nearest" is computed manually here — same getBoundingClientRect-based
  // approach useTrackDragReorder.ts already uses for row geometry — and
  // applied as a direct scrollTop mutation. That mutation is always
  // instant, never smooth-animated, which satisfies "respect
  // prefers-reduced-motion: instant, no smooth scroll" for every user (this
  // container has no CSS smooth-scroll behavior to suppress in the first
  // place).
  useEffect(() => {
    const container = headersRef.current
    if (!container || !selectedTrackId) return
    const row = container.querySelector<HTMLElement>('.track-header--selected')
    if (!row) return
    const containerRect = container.getBoundingClientRect()
    const rowRect = row.getBoundingClientRect()
    let delta = 0
    if (rowRect.top < containerRect.top) {
      delta = rowRect.top - containerRect.top
    } else if (rowRect.bottom > containerRect.bottom) {
      delta = rowRect.bottom - containerRect.bottom
    }
    if (delta === 0) return
    const newScrollTop = container.scrollTop + delta
    container.scrollTop = newScrollTop
    // Keep the lanes column in sync (same manual mirror handleScroll already
    // does for the reverse direction).
    const lanes = document.querySelector<HTMLElement>('.timeline__tracks-scroll')
    if (lanes) lanes.scrollTop = newScrollTop
  }, [selectedTrackId])

  const handleDeleteMarker = useCallback((id: string) => {
    useTimelineStore.getState().removeMarker(id)
  }, [])

  const handleRenameMarker = useCallback((id: string, label: string) => {
    useTimelineStore.getState().renameMarker(id, label)
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

  // W1-8: an empty/near-empty session (duration near 0 — the Master track
  // always exists, so tracks.length===0 below is rare) rendered a near-
  // invisible sliver of a ruler/lane area: (0 + 1) * zoom(50) = 50px. This
  // is a DISPLAY-ONLY floor — `duration` itself (the persisted/derived
  // field) is untouched; only the on-screen content width gets a ~60s
  // minimum span so the ruler and Master lane render at a usable size.
  const EMPTY_SESSION_DISPLAY_SECONDS = 60
  const displayDuration = Math.max(duration, EMPTY_SESSION_DISPLAY_SECONDS)
  // Width = exactly clip duration + 1s buffer (or the empty-session floor above). No wasted space.
  const contentWidth = (displayDuration + 1) * zoom

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
            Drag media here, press <kbd>Cmd</kbd>+<kbd>I</kbd>, or use File &rarr; Import
          </div>
          {/* QF7 (W1.5a owner walk, third pass): this zero-track early-return
              branch had its OWN, older two-button (+ Add Track / + MIDI
              Track) creation surface — a second, unrelated pattern that
              predates QF6 and violated "one way to create tracks" (no Text
              option, no testids, different labels). Real sessions rarely
              hit this branch (persistence always injects the Master track),
              but a master-less state or a hermetic e2e session does. Now
              reuses the literal same button + menu QF6 built, not a second
              implementation — same data-testid, same handler, same
              addTrackMenuItems array. */}
          <button
            className="timeline__add-track-btn"
            onClick={handleAddTrackButtonClick}
            data-testid="add-track-button"
            title="Add a track"
          >
            + Track
          </button>
        </div>
        {addTrackMenu && (
          <ContextMenu
            x={addTrackMenu.x}
            y={addTrackMenu.y}
            items={addTrackMenuItems}
            onClose={() => setAddTrackMenu(null)}
          />
        )}
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
          {/* QF6 (2026-07-31 second owner walk) — SUPERSEDES W1-10's three-
              button row (+ Track / + MIDI / + Inspector). Owner: "not three
              separate buttons for three separate types." One button opens
              the same unified Add Track menu right-click reaches (QF3).
              Inspector's creation entry point is REMOVED entirely (not
              relabeled, not folded into the menu) — feature code
              (addInspectorTrack in stores/timeline.ts) and existing
              inspector tracks in saved projects (project-persistence.ts's
              load path) are untouched; only this button, its only creation
              entry point, goes. W1-12's Import note still applies: Import
              stays reachable via Cmd+I / drag / File > Import Media. */}
          <div className="timeline__headers-spacer">
            <button
              className="timeline__add-track-btn"
              onClick={handleAddTrackButtonClick}
              data-testid="add-track-button"
              title="Add a track"
            >
              + Track
            </button>
          </div>
          <div
            className="timeline__track-headers"
            ref={headersRef}
            onScroll={(e) => {
              // Reverse direction: user wheel-scrolls the headers column →
              // keep the lanes in sync so each row's left + right stay matched.
              const lanes = document.querySelector<HTMLElement>('.timeline__tracks-scroll')
              if (lanes && lanes.scrollTop !== e.currentTarget.scrollTop) {
                lanes.scrollTop = e.currentTarget.scrollTop
              }
            }}
          >
            {orderedTracks.map((track) => {
              const Header = getTrackHeaderComponent(track.type)
              return <Header key={track.id} track={track} isSelected={track.id === selectedTrackId} />
            })}
            {masterTrack && (
              <MasterTrackHeader
                key={masterTrack.id}
                track={masterTrack}
                isSelected={masterTrack.id === selectedTrackId}
              />
            )}
          </div>
        </div>

        {/* Right: ruler + track lanes */}
        <div className="timeline__lanes">
          <div className="timeline__ruler-scroll">
            <div style={{ width: `${contentWidth}px`, marginLeft: `-${scrollX}px` }}>
              <TimeRuler zoom={zoom} scrollX={0} duration={duration} onSeek={onSeek} />
            </div>
          </div>
          <div className="timeline__tracks-scroll" onScroll={handleScroll} onContextMenu={handleLaneBedContextMenu}>
            <div style={{
              width: `${contentWidth}px`,
              position: 'relative',
            }}>
              {/* PK.A1/A2: dedicated grid overlay — see GridOverlay.tsx doc for
                  the stacking rationale (above lane backgrounds, below clips). */}
              <GridOverlay
                quantizeEnabled={quantizeEnabled}
                bpm={bpm}
                quantizeDivision={quantizeDivision}
                zoom={zoom}
                contentWidth={contentWidth}
                rowCount={orderedTracks.length + (masterTrack ? 1 : 0)}
              />
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
                  onRename={handleRenameMarker}
                />
              ))}
              {orderedTracks.map((track) =>
                track.type === 'audio' ? (
                  <AudioTrackLane
                    key={track.id}
                    track={track}
                    zoom={zoom}
                    scrollX={scrollX}
                    isSelected={track.id === selectedTrackId}
                    onSeek={onSeek}
                  />
                ) : track.type === 'inspector' ? (
                  <InspectorTrackLane
                    key={track.id}
                    track={track}
                    isSelected={track.id === selectedTrackId}
                  />
                ) : (
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
                ),
              )}
              {masterTrack && (
                <MasterTrackLane
                  key={masterTrack.id}
                  track={masterTrack}
                  isSelected={masterTrack.id === selectedTrackId}
                  zoom={zoom}
                  scrollX={scrollX}
                />
              )}
              <Playhead time={playheadTime} zoom={zoom} scrollX={scrollX} onSeek={onSeek} />
              {/* New-track drop zone: shown via CSS only while body.clip-dragging.
                  Spans the lane area so users have a forgiving release target
                  for "drop below tracks → create new track". */}
              <div
                className="timeline__new-track-zone"
                data-drop-zone="new-track"
                aria-hidden="true"
              >
                <span className="timeline__new-track-zone-label">Release to add new track</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* QF3/QF6: unified Add Track menu — Add Video Track / Add MIDI Track /
          Add Text Track — reached via right-click on the empty lane bed or
          the single "+ Track" button above. */}
      {addTrackMenu && (
        <ContextMenu
          x={addTrackMenu.x}
          y={addTrackMenu.y}
          items={addTrackMenuItems}
          onClose={() => setAddTrackMenu(null)}
        />
      )}
      {/* Transport bar moved to timeline__toolbar above the body */}
    </div>
  )
}
