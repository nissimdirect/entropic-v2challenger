import { useCallback } from 'react'
import type { Track as TrackType } from '../../../shared/types'
import { useTimelineStore } from '../../stores/timeline'

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
 * Deliberately minimal: no rename, no mute/solo, no context menu, no drag —
 * none of those were asked for in the M.2 packet and the Master's identity
 * (name "Master", exactly one per project, not deletable/duplicable) is
 * fixed by design; adding editable affordances here would be unrequested
 * scope, not a M.2 requirement.
 */

interface MasterTrackHeaderProps {
  track: TrackType
  isSelected: boolean
}

export function MasterTrackHeader({ track, isSelected }: MasterTrackHeaderProps) {
  const handleClick = useCallback(() => {
    useTimelineStore.getState().selectTrack(track.id)
  }, [track.id])

  const headerClasses = [
    'track-header',
    'master-track-header',
    isSelected ? 'track-header--selected' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={headerClasses}
      data-testid="master-track-header"
      data-track-type="master"
      onClick={handleClick}
    >
      <div className="track-header__color master-track-header__color" style={{ background: track.color }} />
      <div className="track-header__info">
        <div className="track-header__name master-track-header__name">
          <span className="master-track-header__badge">MASTER</span>
        </div>
      </div>
    </div>
  )
}

interface MasterTrackLaneProps {
  track: TrackType
  isSelected: boolean
}

/**
 * M.2: the Master's lane has NO clip content — PRD locked design #2 ("No
 * clips, ever... No clip lane rendered."). Renders a static informational
 * strip instead of ClipComponent/MarqueeOverlay (both are clip-drop/
 * clip-select machinery that a no-clips track must never mount). Automation
 * lane rendering on the Master is M.3 scope ("verify... likely free once
 * M.1+M.2 land; add a test") — deferred to that packet, not this one.
 */
export function MasterTrackLane({ track, isSelected }: MasterTrackLaneProps) {
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
    >
      <span className="master-track-lane__label">
        Master bus — effects &amp; automation only, no clips
      </span>
    </div>
  )
}
