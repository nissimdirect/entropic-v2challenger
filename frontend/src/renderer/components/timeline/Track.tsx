import { useCallback, useState, useRef, useEffect } from 'react'
import type { Track as TrackType, BlendMode, TriggerMode } from '../../../shared/types'
import { useTimelineStore } from '../../stores/timeline'
import ContextMenu from './ContextMenu'
import type { MenuItem } from './ContextMenu'
import { useProjectStore } from '../../stores/project'
import { useAutomationStore } from '../../stores/automation'
import { useEffectsStore } from '../../stores/effects'
import { shortcutRegistry } from '../../utils/shortcuts'
import { prettyShortcut } from '../../utils/pretty-shortcut'
import ClipComponent from './Clip'
import AutomationLaneComponent from '../automation/AutomationLane'
import AutomationDraw from '../automation/AutomationDraw'
import { FF } from '../../../shared/feature-flags'
import { useTrackDragReorder } from '../../hooks/useTrackDragReorder'
import { useTrackDragStore } from '../../stores/trackDrag'

interface TrackHeaderProps {
  track: TrackType
  isSelected: boolean
}

export function TrackHeader({ track, isSelected }: TrackHeaderProps) {
  const armedTrackId = useAutomationStore((s) => s.armedTrackId)
  const isArmed = armedTrackId === track.id
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameText, setRenameText] = useState(track.name)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const [showExtras, setShowExtras] = useState(false)
  const drag = useTrackDragReorder({ trackId: track.id, isRenaming })

  // Auto-focus and select text when rename input appears.
  useEffect(() => {
    if (!isRenaming) return
    if (FF.F_0512_32_RENAME_FOCUS) {
      // F-0512-32: defer to the next frame + explicit focus so the input
      // captures focus after the ContextMenu's same-batch unmount has settled.
      // Without this the input rendered but didn't gain focus on some
      // Electron/React combos, and onBlur dismissed it before the user typed.
      const id = requestAnimationFrame(() => {
        const el = renameInputRef.current
        if (!el) return
        el.focus()
        el.select()
      })
      return () => cancelAnimationFrame(id)
    }
    // Legacy: bare .select() — works in most environments, unreliable when
    // the priorly-focused element is being detached in the same commit.
    renameInputRef.current?.select()
  }, [isRenaming])

  const startRename = useCallback(() => {
    setRenameText(track.name)
    setIsRenaming(true)
  }, [track.name])

  const confirmRename = useCallback(() => {
    setIsRenaming(false)
    const trimmed = renameText.trim()
    if (trimmed && trimmed !== track.name) {
      useTimelineStore.getState().renameTrack(track.id, trimmed)
    }
  }, [track.id, track.name, renameText])

  const cancelRename = useCallback(() => {
    setIsRenaming(false)
  }, [])

  const handleClick = useCallback(() => {
    useTimelineStore.getState().selectTrack(track.id)
  }, [track.id])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    useTimelineStore.getState().selectTrack(track.id)
    setCtxMenu({ x: e.clientX, y: e.clientY })
  }, [track.id])

  const getTrackMenuItems = useCallback((): MenuItem[] => {
    const store = useTimelineStore.getState()
    const idx = store.tracks.findIndex((t) => t.id === track.id)
    const currentTrack = store.tracks[idx]

    // Build automation lane menu items from track's effect chain
    const autoItems: MenuItem[] = []
    if (currentTrack && currentTrack.effectChain.length > 0) {
      const registry = useEffectsStore.getState().registry
      const autoState = useAutomationStore.getState()
      const existingLanes = autoState.getLanesForTrack(track.id)
      const existingPaths = new Set(existingLanes.map((l) => l.paramPath))
      const laneColors = ['#4ade80', '#f59e0b', '#ef4444', '#3b82f6', '#a855f7', '#ec4899']

      for (const effect of currentTrack.effectChain) {
        const info = registry.find((r) => r.id === effect.effectId)
        if (!info) continue
        for (const [key, def] of Object.entries(info.params)) {
          if (def.type !== 'float' && def.type !== 'int') continue
          const paramPath = `${effect.id}.${key}`
          if (existingPaths.has(paramPath)) continue
          const color = laneColors[existingLanes.length % laneColors.length]
          autoItems.push({
            label: `Add Lane: ${info.name} > ${def.label}`,
            action: () => autoState.addLane(track.id, effect.id, key, color),
          })
          autoItems.push({
            label: `Add Trigger: ${info.name} > ${def.label}`,
            action: () => {
              const defaultMode: TriggerMode = 'gate'
              autoState.addTriggerLane(track.id, effect.id, key, color, defaultMode)
            },
          })
        }
      }
    }

    return [
      {
        label: 'Duplicate Track',
        action: () => store.duplicateTrack(track.id),
        shortcut: prettyShortcut(shortcutRegistry.getEffectiveKey('duplicate_track')),
      },
      {
        label: 'Rename Track',
        action: startRename,
        shortcut: prettyShortcut(shortcutRegistry.getEffectiveKey('rename_track')),
      },
      { label: '', action: () => {}, separator: true },
      {
        label: 'Move Up',
        action: () => store.reorderTrack(idx, idx - 1),
        disabled: idx <= 0,
        shortcut: prettyShortcut(shortcutRegistry.getEffectiveKey('move_track_up')),
      },
      {
        label: 'Move Down',
        action: () => store.reorderTrack(idx, idx + 1),
        disabled: idx >= store.tracks.length - 1,
        shortcut: prettyShortcut(shortcutRegistry.getEffectiveKey('move_track_down')),
      },
      ...(autoItems.length > 0 ? [
        { label: '', action: () => {}, separator: true },
        ...autoItems,
      ] : []),
      { label: '', action: () => {}, separator: true },
      {
        label: 'Delete Track',
        action: () => store.removeTrack(track.id),
        shortcut: prettyShortcut(shortcutRegistry.getEffectiveKey('delete_track')),
      },
    ]
  }, [track.id, track.name, startRename])

  const handleMute = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      useTimelineStore.getState().toggleMute(track.id)
    },
    [track.id],
  )

  const handleSolo = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      useTimelineStore.getState().toggleSolo(track.id)
    },
    [track.id],
  )

  const handleArmToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      const store = useAutomationStore.getState()
      store.armTrack(store.armedTrackId === track.id ? null : track.id)
    },
    [track.id],
  )

  const handleOpacityChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      e.stopPropagation()
      useTimelineStore.getState().setTrackOpacity(track.id, parseFloat(e.target.value))
    },
    [track.id],
  )

  const handleBlendModeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      e.stopPropagation()
      useTimelineStore.getState().setTrackBlendMode(track.id, e.target.value as BlendMode)
    },
    [track.id],
  )

  const BLEND_MODES: { value: BlendMode; label: string }[] = [
    { value: 'normal', label: 'Nor' },
    { value: 'add', label: 'Add' },
    { value: 'multiply', label: 'Mul' },
    { value: 'screen', label: 'Scr' },
    { value: 'overlay', label: 'Ovr' },
    { value: 'difference', label: 'Dif' },
    { value: 'exclusion', label: 'Exc' },
    { value: 'darken', label: 'Drk' },
    { value: 'lighten', label: 'Ltn' },
  ]

  const isNonDefault = track.opacity !== 1 || track.blendMode !== 'normal'

  const dragFromIdx = useTrackDragStore((s) => s.fromIdx)
  const headerClasses = [
    'track-header',
    isSelected ? 'track-header--selected' : '',
    dragFromIdx !== null && dragFromIdx === drag.ownIdx ? 'track-header--dragging' : '',
  ].filter(Boolean).join(' ')

  return (
    <>
      <div
        className={headerClasses}
        data-track-idx={drag.ownIdx}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onPointerDown={drag.onPointerDown}
        onPointerMove={drag.onPointerMove}
        onPointerUp={drag.onPointerUp}
        onPointerCancel={drag.onPointerCancel}
        onMouseEnter={() => setShowExtras(true)}
        onMouseLeave={() => setShowExtras(false)}
      >
        <div className="track-header__color" style={{ background: track.color }} />
        <div className="track-header__info" onDoubleClick={isRenaming ? undefined : startRename}>
          {isRenaming ? (
            <input
              ref={renameInputRef}
              className="track-header__rename-input"
              type="text"
              value={renameText}
              onChange={(e) => setRenameText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmRename()
                else if (e.key === 'Escape') cancelRename()
                e.stopPropagation()
              }}
              onBlur={confirmRename}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <div className="track-header__name">
              {track.type === 'text' && <span className="timeline-track__icon--text">T</span>}
              {' '}{track.name}
            </div>
          )}
          <LaneBadges trackId={track.id} />
        </div>
        <div className="track-header__controls">
          <button
            className={`track-header__btn${track.isMuted ? ' track-header__btn--active' : ''}`}
            onClick={handleMute}
            title="Mute"
          >
            M
          </button>
          <button
            className={`track-header__btn${track.isSoloed ? ' track-header__btn--active' : ''}`}
            onClick={handleSolo}
            title="Solo"
          >
            S
          </button>
          <button
            className={`track-header__auto-btn${isArmed ? ' track-header__auto-btn--active' : ''}`}
            onClick={handleArmToggle}
            title={isArmed ? 'Disarm automation' : 'Arm for automation recording'}
            aria-label={isArmed ? 'Disarm automation recording' : 'Arm for automation recording'}
          >
            R
          </button>
          {(showExtras || isNonDefault) && (
            <>
              <div className="track-header__opacity" onClick={(e) => e.stopPropagation()}>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={track.opacity}
                  onChange={handleOpacityChange}
                  title={FF.F_0512_21_OPACITY_LABELS
                    ? `Track opacity: ${Math.round(track.opacity * 100)}% (multiplies with clip opacity)`
                    : `Opacity: ${Math.round(track.opacity * 100)}%`}
                />
                <span className="track-header__opacity-label">
                  {Math.round(track.opacity * 100)}%
                </span>
              </div>
              <select
                className="track-header__blend"
                value={track.blendMode}
                onChange={handleBlendModeChange}
                onClick={(e) => e.stopPropagation()}
                title="Blend mode"
              >
                {BLEND_MODES.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </>
          )}
        </div>
      </div>
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={getTrackMenuItems()}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </>
  )
}

interface TrackLaneProps {
  track: TrackType
  zoom: number
  scrollX: number
  isSelected: boolean
  selectedClipIds: string[]
  waveformPeaks?: number[][][] | null
  clipThumbnails?: { time: number; data: string }[]
  onSeek?: (time: number) => void
}

const EMPTY_LANES: never[] = []

function LaneBadges({ trackId }: { trackId: string }) {
  const lanes = useAutomationStore((s) => s.lanes[trackId]) ?? EMPTY_LANES
  const hasTrigger = lanes.some((l) => l.isTrigger)
  const hasAuto = lanes.some((l) => !l.isTrigger)
  if (!hasTrigger && !hasAuto) return null
  return (
    <div className="track-header__badges">
      {hasTrigger && <span className="track-header__badge track-header__badge--trig">TRIG</span>}
      {hasAuto && <span className="track-header__badge track-header__badge--auto">AUTO</span>}
    </div>
  )
}

export function TrackLane({ track, zoom, scrollX, isSelected, selectedClipIds, waveformPeaks, clipThumbnails, onSeek }: TrackLaneProps) {
  const assets = useProjectStore((s) => s.assets)
  const automationLanes = useAutomationStore((s) => s.lanes[track.id]) ?? EMPTY_LANES
  const automationMode = useAutomationStore((s) => s.mode)

  const handleLaneClick = useCallback((e: React.MouseEvent) => {
    useTimelineStore.getState().selectTrack(track.id)
    useTimelineStore.getState().clearSelection()
    // Click-to-seek: use the full onSeek callback (sets frame + playhead + audio)
    if (onSeek) {
      const rect = e.currentTarget.getBoundingClientRect()
      const x = e.clientX - rect.left + scrollX
      const time = Math.max(0, x / zoom)
      onSeek(time)
    }
  }, [track.id, zoom, scrollX, onSeek])

  const TRACK_HEIGHT = 60

  return (
    <div
      className={`track-lane${isSelected ? ' track-lane--selected' : ''}`}
      data-track-id={track.id}
      onClick={handleLaneClick}
      style={{ position: 'relative' }}
    >
      {track.clips.map((clip) => {
        const asset = assets[clip.assetId]
        const assetName = asset ? asset.path.split('/').pop() ?? '' : clip.assetId
        const clipHasAudio = asset?.meta?.hasAudio === true
        return (
          <ClipComponent
            key={clip.id}
            clip={clip}
            zoom={zoom}
            scrollX={scrollX}
            isSelected={selectedClipIds.includes(clip.id)}
            assetName={assetName}
            waveformPeaks={clipHasAudio ? waveformPeaks : undefined}
            assetDuration={clipHasAudio ? asset?.meta?.duration : undefined}
            thumbnails={clipThumbnails}
          />
        )
      })}
      {/* Automation + trigger lane overlays */}
      {automationLanes.map((lane) => (
        <AutomationLaneComponent
          key={lane.id}
          lane={lane}
          trackId={track.id}
          zoom={zoom}
          scrollX={scrollX}
          height={TRACK_HEIGHT}
        />
      ))}
      {/* Draw mode overlay for first visible lane */}
      {automationMode === 'draw' && automationLanes.length > 0 && automationLanes[0].isVisible && (
        <AutomationDraw
          trackId={track.id}
          laneId={automationLanes[0].id}
          zoom={zoom}
          scrollX={scrollX}
          height={TRACK_HEIGHT}
        />
      )}
    </div>
  )
}
