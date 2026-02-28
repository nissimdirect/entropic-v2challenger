import { useCallback } from 'react'
import type { Track as TrackType } from '../../../shared/types'
import { useTimelineStore } from '../../stores/timeline'
import { useProjectStore } from '../../stores/project'
import ClipComponent from './Clip'

interface TrackHeaderProps {
  track: TrackType
  isSelected: boolean
}

export function TrackHeader({ track, isSelected }: TrackHeaderProps) {
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
      </div>
    </div>
  )
}

interface TrackLaneProps {
  track: TrackType
  zoom: number
  scrollX: number
  isSelected: boolean
  selectedClipId: string | null
}

export function TrackLane({ track, zoom, scrollX, isSelected, selectedClipId }: TrackLaneProps) {
  const assets = useProjectStore((s) => s.assets)

  const handleLaneClick = useCallback(() => {
    useTimelineStore.getState().selectTrack(track.id)
    useTimelineStore.getState().selectClip(null)
  }, [track.id])

  return (
    <div
      className={`track-lane${isSelected ? ' track-lane--selected' : ''}`}
      onClick={handleLaneClick}
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
            isSelected={clip.id === selectedClipId}
            assetName={assetName}
          />
        )
      })}
    </div>
  )
}
