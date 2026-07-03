import { useCallback, useState } from 'react'
import type { Track as TrackType, TriggerMode } from '../../../shared/types'
import { useTimelineStore } from '../../stores/timeline'
import { useAutomationStore } from '../../stores/automation'
import { useEffectsStore } from '../../stores/effects'
import ContextMenu from './ContextMenu'
import type { MenuItem } from './ContextMenu'
import AutomationLaneComponent from '../automation/AutomationLane'
import AutomationDraw from '../automation/AutomationDraw'

/**
 * M.2 (Master-Out Bus PRD) — Master track row. Renders the permanent Master
 * bus pinned at the BOTTOM of the timeline (Ableton master styling — visually
 * distinct amber/gold strip), always the last row regardless of its position
 * in the store's `tracks` array (Timeline.tsx filters it out of the ordered
 * list and renders it after, in both the headers and lanes columns — array
 * position doesn't matter for render/export, which locate it by
 * `type === 'master'`, not array index; see pipeline.py/compositor.py).
 *
 * Follows the InspectorTrack.tsx precedent (P6.8/I1) for a first-class
 * NO-CLIPS track type: a header (mirrors TrackHeader's structure minus the
 * drag-reorder affordance — the Master is pinned, never reordered) + a lane
 * that renders NO clip content (PRD locked design #2 — "No clips, ever").
 * Selecting the header shows this track's effectChain in the SAME
 * DeviceChain panel any track uses — that wiring is FREE: DeviceChain reads
 * the active track's effectChain generically via useActiveEffectChain, which
 * resolves through selectedTrackId with no type restriction (project.ts).
 *
 * Deliberately minimal: no rename, no mute/solo, no drag, no delete/duplicate/
 * reorder — none of those were asked for and the Master's identity (name
 * "Master", exactly one per project, not deletable/duplicable) is fixed by
 * design; adding those affordances would be unrequested scope.
 *
 * M.3 (this packet) — automation exposure. The automation SYSTEM
 * (evaluateAutomationOverrides, AutomationLaneComponent, the automation
 * store) is entirely param-path generic (`paramPath = "<effectId>.<param>"`,
 * no track-type check anywhere), so a lane targeting a master effect's
 * param already evaluates/renders/exports correctly once one exists. The
 * ONLY gap was UI affordance to CREATE and EDIT that lane on the master
 * row — Track.tsx's arm button + "Add Lane" context-menu-from-effectChain +
 * the AutomationLaneComponent overlay. Mirrored here verbatim (menu items
 * limited to automation only — no track-management items, consistent with
 * the "deliberately minimal" note above).
 */

const EMPTY_LANES: never[] = []

interface MasterTrackHeaderProps {
  track: TrackType
  isSelected: boolean
}

export function MasterTrackHeader({ track, isSelected }: MasterTrackHeaderProps) {
  const armedTrackId = useAutomationStore((s) => s.armedTrackId)
  const isArmed = armedTrackId === track.id
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)

  const handleClick = useCallback(() => {
    useTimelineStore.getState().selectTrack(track.id)
  }, [track.id])

  const handleArmToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      const store = useAutomationStore.getState()
      store.armTrack(store.armedTrackId === track.id ? null : track.id)
    },
    [track.id],
  )

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      useTimelineStore.getState().selectTrack(track.id)
      setCtxMenu({ x: e.clientX, y: e.clientY })
    },
    [track.id],
  )

  // Automation-only menu items, built from the Master's effectChain — same
  // shape as Track.tsx's getTrackMenuItems autoItems block, minus the
  // track-management items (Duplicate/Rename/Move/Delete) the Master
  // deliberately never exposes.
  //
  // Key convention: `${effect.effectId}.${key}` (the effect TYPE), NOT
  // `${effect.id}` (Track.tsx's per-instance uuid convention). The export
  // path resolves automation via the backend's `apply_modulation`, which
  // matches chain entries by the serialized `effect_id` field — always the
  // TYPE, never an instance id (ipc-serialize.ts drops instance ids on the
  // wire). Using the instance uuid here would make a master lane apply in
  // preview but silently no-op in export — see evaluateAutomationOverrides.ts's
  // applyAutomationOverridesToChain docstring for the full rationale. One
  // consequence: two master effects of the SAME type share one param-lane
  // (an existing limitation of the type-keyed override design, not new here).
  const getMasterMenuItems = useCallback((): MenuItem[] => {
    const store = useTimelineStore.getState()
    const currentTrack = store.tracks.find((t) => t.id === track.id)
    if (!currentTrack || currentTrack.effectChain.length === 0) {
      return [{ label: 'No effects on Master to automate', action: () => {}, disabled: true }]
    }
    const registry = useEffectsStore.getState().registry
    const autoState = useAutomationStore.getState()
    const existingLanes = autoState.getLanesForTrack(track.id)
    const existingPaths = new Set(existingLanes.map((l) => l.paramPath))
    const laneColors = ['#4ade80', '#f59e0b', '#ef4444', '#3b82f6', '#a855f7', '#ec4899']
    const items: MenuItem[] = []

    for (const effect of currentTrack.effectChain) {
      const info = registry.find((r) => r.id === effect.effectId)
      if (!info) continue
      for (const [key, def] of Object.entries(info.params)) {
        if (def.type !== 'float' && def.type !== 'int') continue
        const paramPath = `${effect.effectId}.${key}`
        if (existingPaths.has(paramPath)) continue
        const color = laneColors[existingLanes.length % laneColors.length]
        items.push({
          label: `Add Lane: ${info.name} > ${def.label}`,
          action: () => autoState.addLane(track.id, effect.effectId, key, color),
        })
        items.push({
          label: `Add Trigger: ${info.name} > ${def.label}`,
          action: () => {
            const defaultMode: TriggerMode = 'gate'
            autoState.addTriggerLane(track.id, effect.effectId, key, color, defaultMode)
          },
        })
      }
    }
    return items.length > 0
      ? items
      : [{ label: 'All Master params already automated', action: () => {}, disabled: true }]
  }, [track.id])

  const headerClasses = [
    'track-header',
    'master-track-header',
    isSelected ? 'track-header--selected' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <>
      <div
        className={headerClasses}
        data-testid="master-track-header"
        data-track-type="master"
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        <div className="track-header__color master-track-header__color" style={{ background: track.color }} />
        <div className="track-header__info">
          <div className="track-header__name master-track-header__name">
            <span className="master-track-header__badge">MASTER</span>
          </div>
        </div>
        <div className="track-header__controls">
          <button
            className={`track-header__auto-btn${isArmed ? ' track-header__auto-btn--active' : ''}`}
            onClick={handleArmToggle}
            data-testid="master-track-auto-btn"
            title={isArmed ? 'Disarm automation' : 'Arm for automation recording'}
            aria-label={isArmed ? 'Disarm automation recording' : 'Arm for automation recording'}
          >
            R
          </button>
        </div>
      </div>
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={getMasterMenuItems()}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </>
  )
}

interface MasterTrackLaneProps {
  track: TrackType
  isSelected: boolean
  zoom: number
  scrollX: number
}

/**
 * M.2: the Master's lane has NO clip content — PRD locked design #2 ("No
 * clips, ever... No clip lane rendered."). Renders a static informational
 * strip PLUS (M.3) the same AutomationLaneComponent overlay Track.tsx's
 * TrackLane mounts — automation lane editing on the Master now works
 * identically to any other track (the overlay is self-contained/absolute
 * and doesn't depend on clip content).
 */
export function MasterTrackLane({ track, isSelected, zoom, scrollX }: MasterTrackLaneProps) {
  const automationLanes = useAutomationStore((s) => s.lanes[track.id]) ?? EMPTY_LANES
  const automationMode = useAutomationStore((s) => s.mode)
  const TRACK_HEIGHT = 60

  const handleClick = useCallback(() => {
    useTimelineStore.getState().selectTrack(track.id)
  }, [track.id])

  const laneClasses = [
    'master-track-lane',
    isSelected ? 'master-track-lane--selected' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={laneClasses}
      data-testid="master-track-lane"
      data-track-type="master"
      onClick={handleClick}
      style={{ position: 'relative' }}
    >
      <span className="master-track-lane__label">
        Master bus — effects &amp; automation only, no clips
      </span>
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
