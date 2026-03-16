import { useCallback } from 'react'
import type { Track as TrackType } from '../../../shared/types'
import { useTimelineStore } from '../../stores/timeline'
import { useProjectStore } from '../../stores/project'
import { useAutomationStore } from '../../stores/automation'
import ClipComponent from './Clip'
import AutomationLaneComponent from '../automation/AutomationLane'
import AutomationDraw from '../automation/AutomationDraw'

interface TrackHeaderProps {
  track: TrackType
  isSelected: boolean
}

export function TrackHeader({ track, isSelected }: TrackHeaderProps) {
  const armedTrackId = useAutomationStore((s) => s.armedTrackId)
  const isArmed = armedTrackId === track.id

  const handleClick = useCallback(() => {
    useTimelineStore.getState().selectTrack(track.id)
  }, [track.id])

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

  return (
    <div
      className={`track-header${isSelected ? ' track-header--selected' : ''}`}
      onClick={handleClick}
    >
      <div className="track-header__color" style={{ background: track.color }} />
      <div className="track-header__info">
        <div className="track-header__name">{track.name}</div>
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
        >
          A
        </button>
      </div>
    </div>
  )
}

interface TrackLaneProps {
  track: TrackType
  zoom: number
  scrollX: number
  isSelected: boolean
  selectedClipIds: string[]
}

const EMPTY_LANES: never[] = []

export function TrackLane({ track, zoom, scrollX, isSelected, selectedClipIds }: TrackLaneProps) {
  const assets = useProjectStore((s) => s.assets)
  const automationLanes = useAutomationStore((s) => s.lanes[track.id]) ?? EMPTY_LANES
  const automationMode = useAutomationStore((s) => s.mode)

  const handleLaneClick = useCallback(() => {
    useTimelineStore.getState().selectTrack(track.id)
    useTimelineStore.getState().clearSelection()
  }, [track.id])

  const TRACK_HEIGHT = 60

  return (
    <div
      className={`track-lane${isSelected ? ' track-lane--selected' : ''}`}
      onClick={handleLaneClick}
      style={{ position: 'relative' }}
    >
      {track.clips.map((clip) => {
        const asset = assets[clip.assetId]
        const assetName = asset ? asset.path.split('/').pop() ?? '' : clip.assetId
        return (
          <ClipComponent
            key={clip.id}
            clip={clip}
            zoom={zoom}
            scrollX={scrollX}
            isSelected={selectedClipIds.includes(clip.id)}
            assetName={assetName}
          />
        )
      })}
      {/* Automation lane overlays */}
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
