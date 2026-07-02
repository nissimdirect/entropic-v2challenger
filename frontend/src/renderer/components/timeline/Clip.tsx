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
import { computeSnapPosition, collectClipEdges } from '../../utils/snap-candidates'

/**
 * UE.7: 8-swatch equal-luminance palette (DESIGN-SPEC §8, ≈oklch 0.65 0.09).
 * Defined as TSX constants so they are NOT in CSS and do not trigger the
 * hex-ratchet (PUX.1 PR #179 coordination note: ratchet ceiling = 9 in CSS,
 * these are applied via inline style only).
 */
export const CLIP_COLOR_SWATCHES: ReadonlyArray<{ hex: string; label: string }> = [
  { hex: '#C07A6A', label: 'Terracotta' },
  { hex: '#B99655', label: 'Ochre' },
  { hex: '#97A659', label: 'Olive' },
  { hex: '#6FA98A', label: 'Sage' },
  { hex: '#5FA8A8', label: 'Teal' },
  { hex: '#6E93BE', label: 'Slate' },
  { hex: '#9B86C9', label: 'Lavender' },
  { hex: '#B878A8', label: 'Mauve' },
] as const

/**
 * Resolve a raw drag position to a snapped one.
 *
 * UE.1: single nearest-wins pass over grid lines + clip edges + playhead + markers.
 * metaKey bypasses ALL snapping (generalises the previous grid-bypass behaviour).
 *
 * Chain: drag handler → snapPosition() → moveClip / trimClipIn / trimClipOut (store stays dumb).
 *
 * @param pos       raw position in timeline seconds
 * @param bypass    true when metaKey/ctrlKey is held — returns pos unchanged
 * @param zoom      pixels per second (for threshold conversion)
 * @param excludeId clip ID to exclude from edge candidates (the clip being dragged)
 */
function snapPosition(pos: number, bypass: boolean, zoom: number, excludeId?: string): number {
  if (bypass) return pos

  const layoutState = useLayoutStore.getState()
  const { snapEnabled, quantizeEnabled, quantizeDivision } = layoutState
  const { bpm } = useProjectStore.getState()
  const { playheadTime, markers, tracks } = useTimelineStore.getState()

  // If both snap and quantize are off, return raw position unchanged
  if (!snapEnabled && !quantizeEnabled) return pos

  // Collect clip edges from all tracks (excluding the dragged clip)
  const allClips = tracks.flatMap((t) => t.clips)
  const clipEdges = snapEnabled ? collectClipEdges(allClips, excludeId) : []

  // Grid interval: only include if quantize is on and BPM is valid
  let gridInterval: number | null = null
  if (quantizeEnabled && bpm > 0) {
    gridInterval = (60 / bpm) * (4 / quantizeDivision)
  }

  const result = computeSnapPosition({
    rawPos: pos,
    zoom,
    playheadTime: snapEnabled ? playheadTime : -Infinity,
    markers: snapEnabled ? markers : [],
    clipEdges,
    gridInterval,
  })

  return result.snappedPos
}

interface ClipProps {
  clip: ClipType
  zoom: number
  scrollX: number
  isSelected: boolean
  /** T3: true when the CONTAINING track is locked (cascades lock to this clip). */
  trackLocked?: boolean
  assetName: string
  waveformPeaks?: WaveformPeaks | null
  assetDuration?: number
  thumbnails?: { time: number; data: string }[]
}

export default function ClipComponent({ clip, zoom, scrollX, isSelected, trackLocked, assetName, waveformPeaks, assetDuration, thumbnails }: ClipProps) {
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)
  // UE.7: inline rename
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

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

  // UE.7: focus rename input when renaming state activates
  useEffect(() => {
    if (renaming && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [renaming])

  // UE.7: start inline rename
  const startRename = useCallback(() => {
    // Pre-populate with the current user-set name, or fall back to asset name
    setRenameValue(clip.name ?? assetName)
    setRenaming(true)
  }, [clip.name, assetName])

  // UE.7: commit rename on Enter or blur
  const commitRename = useCallback(() => {
    useTimelineStore.getState().renameClip(clip.id, renameValue)
    setRenaming(false)
  }, [clip.id, renameValue])

  const cancelRename = useCallback(() => {
    setRenaming(false)
  }, [])

  const handleRenameKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitRename()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancelRename()
    }
    // All other keys are naturally suppressed by the INPUT element — shortcutRegistry
    // skips actions when document.activeElement is an INPUT (shortcuts.ts:163).
  }, [commitRename, cancelRename])

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
      {
        label: 'Ripple Delete',
        action: () => store.rippleRemoveClip(clip.id),
        shortcut: '⇧⌦',
      },
      { label: '', action: () => {}, separator: true },
      // UE.7: Rename (context-menu entry — double-click label is the primary path)
      { label: 'Rename', action: startRename },
      // UE.7: Color swatches — 8 DESIGN-SPEC §8 equal-luminance swatches
      {
        label: 'Color',
        action: () => {},   // action not used when swatches are present
        swatches: CLIP_COLOR_SWATCHES.map((sw) => ({
          hex: sw.hex,
          label: sw.label,
          action: () => store.setClipColor(clip.id, sw.hex),
        })),
      },
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
      // T3: per-clip lock toggle. When the track is locked, the clip is
      // effectively locked regardless; toggling here only sets the clip's own
      // flag (the label reflects clip.locked).
      {
        label: clip.locked === true ? 'Unlock Clip' : 'Lock Clip',
        action: () => store.setClipLock(clip.id, !(clip.locked === true)),
      },
    ]
  }, [clip.id, clip.position, clip.duration, clip.speed, clip.isEnabled, clip.locked, startRename])

  const left = clip.position * zoom - scrollX
  const width = clip.duration * zoom

  // Document-level drag: when moveClip transfers the clip to a different
  // track, React unmounts this clip's component from the old track and mounts
  // a NEW one in the new track (because key={clip.id} lives inside each
  // track's clips.map). Pointer capture on this element would be lost, and
  // React handlers on the new instance start fresh with isDragging.current=false
  // → drag dies after one track crossing, leaving the visible "overlap" mess.
  // Attaching pointermove/up to `document` instead survives the re-mount —
  // the closure stays alive (the document listeners hold the reference) and
  // keeps moving the clip via clipId regardless of which component instance
  // is mounted at any moment.
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Don't start drag from trim handles
      if ((e.target as HTMLElement).classList.contains('clip__trim-handle')) return
      if (e.button !== 0) return

      // T1 (2026-07-02): razor/ripple-delete cursor tools short-circuit the
      // normal select+drag flow below. 'select' (and every other tool — marker,
      // loop-in/out, range-select, mask tools, slip/slide) falls through
      // unchanged, so clicking with tool 'select' behaves exactly as today
      // (regression guard).
      const activeTool = useLayoutStore.getState().cursorTool
      if (activeTool === 'razor') {
        e.preventDefault()
        e.stopPropagation()
        // Reuse the same px→time math as the `left`/`width` style below:
        // left = clip.position * zoom - scrollX, so time = position + offsetWithinClip/zoom.
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
        const clickTime = clip.position + (e.clientX - rect.left) / zoom
        useTimelineStore.getState().splitClip(clip.id, clickTime)
        return
      }
      if (activeTool === 'ripple-delete') {
        e.preventDefault()
        e.stopPropagation()
        useTimelineStore.getState().rippleRemoveClip(clip.id)
        return
      }

      e.preventDefault()
      e.stopPropagation()

      const clipId = clip.id
      const startX = e.clientX
      const startY = e.clientY
      const startPos = clip.position
      const pointerId = e.pointerId
      const zoomAtStart = zoom
      let active = true
      let lastClientY = e.clientY
      let autoScrollRaf: number | null = null
      // UAT P6: upHandler used to always run the below-lane/drop-zone new-track
      // check, so a plain click/select (pointerdown+pointerup with near-zero
      // travel) could spawn a stray empty track if the release point happened
      // to land past the last lane's bottom edge. hasDragged only flips once
      // real pointer travel exceeds DRAG_THRESHOLD_PX, gating the new-track
      // logic (:below) to genuine drags — a pure click never reaches it.
      const DRAG_THRESHOLD_PX = 4
      let hasDragged = false
      document.body.classList.add('clip-dragging')

      // Edge-scroll loop: while the cursor sits in the top/bottom 40 px of the
      // lanes scroll container, push scrollTop in that direction so the user
      // can drag onto rows that started off-screen. Speed ramps with how
      // deeply the cursor penetrates the edge zone (sigmoid-ish via linear
      // scaling clamped to ±20 px/frame).
      const tickAutoScroll = () => {
        if (!active) return
        const lanes = document.querySelector<HTMLElement>('.timeline__tracks-scroll')
        if (lanes) {
          const rect = lanes.getBoundingClientRect()
          const EDGE = 40
          let dy = 0
          if (lastClientY < rect.top + EDGE) {
            dy = -Math.min(20, (rect.top + EDGE - lastClientY) * 0.5)
          } else if (lastClientY > rect.bottom - EDGE) {
            dy = Math.min(20, (lastClientY - (rect.bottom - EDGE)) * 0.5)
          }
          if (dy !== 0) {
            lanes.scrollTop = Math.max(
              0,
              Math.min(lanes.scrollHeight - lanes.clientHeight, lanes.scrollTop + dy),
            )
          }
        }
        autoScrollRaf = requestAnimationFrame(tickAutoScroll)
      }
      autoScrollRaf = requestAnimationFrame(tickAutoScroll)

      const store = useTimelineStore.getState()
      if (e.metaKey || e.ctrlKey) {
        store.toggleClipSelection(clipId)
      } else if (e.shiftKey && store.selectedClipIds.length > 0) {
        const lastSelected = store.selectedClipIds[store.selectedClipIds.length - 1]
        store.rangeSelectClips(lastSelected, clipId)
      } else {
        store.selectClip(clipId)
      }

      const moveHandler = (ev: PointerEvent) => {
        if (!active || ev.pointerId !== pointerId) return
        lastClientY = ev.clientY
        if (!hasDragged) {
          const travelX = Math.abs(ev.clientX - startX)
          const travelY = Math.abs(ev.clientY - startY)
          if (travelX > DRAG_THRESHOLD_PX || travelY > DRAG_THRESHOLD_PX) {
            hasDragged = true
          }
        }
        const dx = ev.clientX - startX
        const dt = dx / zoomAtStart
        const newPos = Math.max(0, startPos + dt)
        const snapped = snapPosition(newPos, ev.metaKey || ev.ctrlKey, zoomAtStart, clipId)

        // Look up the clip's CURRENT track in the store (it migrates as we
        // call moveClip below — using the captured clip.trackId would lock
        // the fallback to the starting lane and cause re-targeting glitches).
        const tracks = useTimelineStore.getState().tracks
        let currentTrackId: string | null = null
        for (const t of tracks) {
          if (t.clips.some((c) => c.id === clipId)) {
            currentTrackId = t.id
            break
          }
        }
        if (!currentTrackId) return

        const lanes = document.querySelectorAll<HTMLElement>('.track-lane[data-track-id]')
        let targetTrackId = currentTrackId
        for (const lane of lanes) {
          const rect = lane.getBoundingClientRect()
          if (ev.clientY >= rect.top && ev.clientY <= rect.bottom) {
            const id = lane.dataset.trackId
            if (id) targetTrackId = id
          }
        }

        useTimelineStore.getState().moveClip(clipId, targetTrackId, snapped)
      }

      const teardown = () => {
        active = false
        if (autoScrollRaf !== null) {
          cancelAnimationFrame(autoScrollRaf)
          autoScrollRaf = null
        }
        document.body.classList.remove('clip-dragging')
        document.removeEventListener('pointermove', moveHandler)
        document.removeEventListener('pointerup', upHandler)
        document.removeEventListener('pointercancel', cancelHandler)
      }

      const upHandler = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return

        // UAT P6: a pure click/select (no real drag) must never trigger the
        // new-track logic below, even if the release point geometrically
        // lands past the last lane or over the (CSS-hidden-until-dragging)
        // drop zone.
        if (hasDragged) {
          // Generous "below all tracks" detection: either pointer is past every
          // lane's bottom edge, OR pointer is over the explicit new-track drop
          // zone. The drop zone gives users a reliable, visible hit target —
          // the bare clientY check failed in practice when the timeline scroll
          // container ended flush with the last lane.
          const lanes = document.querySelectorAll<HTMLElement>('.track-lane[data-track-id]')
          let maxBottom = -Infinity
          for (const lane of lanes) {
            const rect = lane.getBoundingClientRect()
            if (rect.bottom > maxBottom) maxBottom = rect.bottom
          }
          const belowAllTracks = maxBottom !== -Infinity && ev.clientY > maxBottom

          // Drop-zone hit: walk up from elementFromPoint to find the new-track zone.
          let overDropZone = false
          const hit = document.elementFromPoint(ev.clientX, ev.clientY)
          if (hit && hit.closest('[data-drop-zone="new-track"]')) {
            overDropZone = true
          }

          if (belowAllTracks || overDropZone) {
            const s = useTimelineStore.getState()
            const current = s.tracks.find((t) => t.clips.some((c) => c.id === clipId))
            const currentClip = current?.clips.find((c) => c.id === clipId)
            const newTrackId = s.addTrack(`Track ${s.tracks.length + 1}`, '#4ade80', 'video')
            if (newTrackId && currentClip) {
              s.moveClip(clipId, newTrackId, currentClip.position)
            } else if (!newTrackId) {
              useToastStore.getState().addToast({
                level: 'warning',
                message: 'Could not create new track — limit reached.',
                source: 'clip-drag-new-track',
              })
            }
          }
        }
        teardown()
      }

      const cancelHandler = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return
        teardown()
      }

      document.addEventListener('pointermove', moveHandler)
      document.addEventListener('pointerup', upHandler)
      document.addEventListener('pointercancel', cancelHandler)
    },
    [clip.id, clip.position, zoom],
  )

  // Stubs kept on the element so React's event delegation doesn't warn —
  // the actual logic now lives in document listeners attached in onPointerDown.
  const handlePointerMove = useCallback(() => undefined, [])
  const handlePointerUp = useCallback(() => undefined, [])
  const handlePointerCancel = useCallback(() => undefined, [])

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
        const newIn = snapPosition(rawIn, me.metaKey || me.ctrlKey, zoom, clip.id)
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
        const newOut = snapPosition(rawOut, me.metaKey || me.ctrlKey, zoom, clip.id)
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
  // UE.7: user-set name takes precedence; empty string falls back to asset name
  const displayName = clip.name
    ? clip.name
    : isTextClip
      ? (clip.textConfig!.text.slice(0, 30) || 'Text')
      : assetName

  const isDisabled = clip.isEnabled === false
  // T3: a clip is effectively locked by its own flag OR by its track's lock.
  // All mutation guards live in the store (trust boundary); this only drives the
  // visible padlock affordance + a modifier class for the not-grabbable cursor.
  const isLocked = clip.locked === true || trackLocked === true

  // UE.7: colour tint — 40% opacity overlay keeps selection/disabled states legible
  const colorStyle: React.CSSProperties = clip.color
    ? { backgroundColor: clip.color + '66' /* 40% hex alpha */, borderColor: clip.color }
    : {}

  return (
    <>
      <div
        className={`clip${isSelected ? ' clip--selected' : ''}${isTextClip ? ' clip--text' : ''}${isDisabled ? ' clip--disabled' : ''}${isLocked ? ' clip--locked' : ''}`}
        style={{ left: `${left}px`, width: `${Math.max(4, width)}px`, ...colorStyle }}
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
        {renaming ? (
          // UE.7: inline rename input — INPUT focus suppresses timeline shortcuts
          // (shortcutRegistry skips actions when activeElement.tagName === 'INPUT')
          <input
            ref={renameInputRef}
            className="clip__rename-input"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={handleRenameKeyDown}
            onBlur={commitRename}
            maxLength={512}  // raw input cap; store clamps to MAX_CLIP_NAME_LENGTH (100)
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            className={`clip__name${isTextClip ? ' clip__name--text' : ''}${clip.name ? ' clip__name--user' : ''}`}
            onDoubleClick={(e) => { e.stopPropagation(); startRename() }}
          >
            {displayName}
          </span>
        )}
        {/* MK.13: mask-stack badge — shows the number of active matte nodes on this clip.
            Renders only when at least one matte node is present (maskStack?.length > 0).
            CSS in masking BEM namespace (no global.css grid edits). */}
        {(clip.maskStack?.length ?? 0) > 0 && (
          <span
            className="masking__clip-badge"
            data-testid="clip-mask-badge"
            title={`${clip.maskStack!.length} matte node${clip.maskStack!.length !== 1 ? 's' : ''}`}
          >
            M{clip.maskStack!.length}
          </span>
        )}
        {/* T3: padlock affordance — shown when the clip is locked (own flag) or its
            track is locked. Aria-hidden decorative glyph; the actionable toggle is
            in the context menu / track header. */}
        {isLocked && (
          <span
            className="clip__lock"
            data-testid="clip-lock-badge"
            aria-hidden="true"
            title={clip.locked === true ? 'Clip locked' : 'Track locked'}
          >
            {'\u{1F512}'}
          </span>
        )}
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
