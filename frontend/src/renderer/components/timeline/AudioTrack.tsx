import { useCallback, useEffect, useRef, useState } from 'react'
import type { Track as TrackType } from '../../../shared/types'
import { AUDIO_LIMITS } from '../../../shared/types'
import { useTimelineStore } from '../../stores/timeline'
import { useAudioStore } from '../../stores/audio'
import Knob from '../common/Knob'
import GainMeter from '../audio/GainMeter'
import AudioClipView from './AudioClipView'

interface AudioTrackHeaderProps {
  track: TrackType
  isSelected: boolean
}

/**
 * Convert gainDb ∈ [MIN_GAIN_DB, MAX_GAIN_DB] to a linear knob position.
 * We pass gainDb directly; the Knob's built-in float curve handles it.
 */
export function AudioTrackHeader({ track, isSelected }: AudioTrackHeaderProps) {
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameText, setRenameText] = useState(track.name)
  const renameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isRenaming) renameInputRef.current?.select()
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

  const cancelRename = useCallback(() => setIsRenaming(false), [])

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

  const handleGainChange = useCallback(
    (value: number) => {
      useTimelineStore.getState().setTrackGain(track.id, value)
    },
    [track.id],
  )

  const gainDb = track.gainDb ?? 0

  return (
    <div
      className={`track-header audio-track-header${isSelected ? ' track-header--selected' : ''}`}
      onClick={handleClick}
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
            <span className="timeline-track__icon--audio">A</span>
            {' '}{track.name}
          </div>
        )}
      </div>
      <div className="track-header__controls">
        <button
          className={`track-header__btn${track.isMuted ? ' track-header__btn--active' : ''}`}
          onClick={handleMute}
          title="Mute audio track"
        >
          M
        </button>
        <button
          className={`track-header__btn${track.isSoloed ? ' track-header__btn--active' : ''}`}
          onClick={handleSolo}
          title="Solo audio track"
        >
          S
        </button>
        <div className="audio-track-header__gain" onClick={(e) => e.stopPropagation()}>
          <Knob
            value={gainDb}
            min={AUDIO_LIMITS.MIN_GAIN_DB}
            max={AUDIO_LIMITS.MAX_GAIN_DB}
            default={0}
            label="Gain"
            type="float"
            unit=" dB"
            curve="linear"
            description="Track gain — applied to every clip on this track"
            onChange={handleGainChange}
          />
        </div>
        <AudioTrackMeter />
      </div>
    </div>
  )
}

// F-0516-6 phase 2: live meter strip beside the gain knob.
// Reads from useAudioStore; the meter is driven by useAudioMeterPoll mounted
// at the App level. v1 shows a single master meter on every audio track —
// there's only one audio player in the v1 stack. Per-track metering follows
// the audio-tracks feature flag rollout.
function AudioTrackMeter() {
  const meter = useAudioStore((s) => s.meter)
  return (
    <div className="audio-track-header__meter" onClick={(e) => e.stopPropagation()}>
      <GainMeter
        rmsDb={meter.rmsDb}
        peakDb={meter.peakDb}
        clipped={meter.clipped}
        orientation="horizontal"
      />
    </div>
  )
}

interface AudioTrackLaneProps {
  track: TrackType
  zoom: number
  scrollX: number
  isSelected: boolean
  waveformsByPath?: Record<string, number[][][]>
  onSeek?: (time: number) => void
}

export function AudioTrackLane({ track, zoom, scrollX, isSelected, waveformsByPath, onSeek }: AudioTrackLaneProps) {
  const selectedClipIds = useTimelineStore((s) => s.selectedClipIds)
  const clips = track.audioClips ?? []

  const handleLaneClick = useCallback(
    (e: React.MouseEvent) => {
      // Click on empty lane area = select track + seek
      if (e.target !== e.currentTarget) return
      useTimelineStore.getState().selectTrack(track.id)
      useTimelineStore.getState().clearSelection()
      if (onSeek) {
        const rect = e.currentTarget.getBoundingClientRect()
        const x = e.clientX - rect.left + scrollX
        const time = Math.max(0, x / zoom)
        onSeek(time)
      }
    },
    [track.id, zoom, scrollX, onSeek],
  )

  return (
    <div
      className={`track-lane audio-track-lane${isSelected ? ' track-lane--selected' : ''}`}
      data-track-id={track.id}
      onClick={handleLaneClick}
      style={{ position: 'relative', height: 60 }}
    >
      {clips.map((clip) => (
        <AudioClipView
          key={clip.id}
          clip={clip}
          zoom={zoom}
          scrollX={scrollX}
          isSelected={selectedClipIds.includes(clip.id)}
          waveformPeaks={waveformsByPath?.[clip.path] ?? null}
        />
      ))}
    </div>
  )
}
