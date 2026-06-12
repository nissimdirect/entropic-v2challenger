/**
 * Inspector: track state — shows track info.
 * P3.3: info-only, zero store writes.
 * Uses individual primitive selectors to avoid Zustand snapshot-cache issues.
 */
import React from 'react'
import { useTimelineStore } from '../../stores/timeline'

interface Props {
  trackId: string
}

export default function InspectorTrackState({ trackId }: Props): React.ReactElement {
  // Individual primitive selectors — each is stable and cacheable by Zustand
  const trackName = useTimelineStore((s) => s.tracks.find((t) => t.id === trackId)?.name ?? '')
  const trackType = useTimelineStore((s) => s.tracks.find((t) => t.id === trackId)?.type ?? '')
  const effectCount = useTimelineStore((s) => s.tracks.find((t) => t.id === trackId)?.effectChain.length ?? 0)
  const clipCount = useTimelineStore((s) => s.tracks.find((t) => t.id === trackId)?.clips.length ?? 0)
  const isMuted = useTimelineStore((s) => s.tracks.find((t) => t.id === trackId)?.isMuted ?? false)
  const isSoloed = useTimelineStore((s) => s.tracks.find((t) => t.id === trackId)?.isSoloed ?? false)
  const exists = useTimelineStore((s) => s.tracks.some((t) => t.id === trackId))

  if (!exists) {
    return (
      <div className="cx-inspector-state cx-inspector-state--track" data-testid="inspector-state-track">
        <div className="cx-inspector-label">Track</div>
        <div className="cx-inspector-hint">Track not found</div>
      </div>
    )
  }

  return (
    <div className="cx-inspector-state cx-inspector-state--track" data-testid="inspector-state-track">
      <div className="cx-inspector-label">Track</div>
      <div className="cx-inspector-row">
        <span className="cx-inspector-key">Name</span>
        <span className="cx-inspector-val" data-testid="inspector-track-name">{trackName || '—'}</span>
      </div>
      <div className="cx-inspector-row">
        <span className="cx-inspector-key">Type</span>
        <span className="cx-inspector-val" data-testid="inspector-track-type">{trackType || '—'}</span>
      </div>
      <div className="cx-inspector-row">
        <span className="cx-inspector-key">Effects</span>
        <span className="cx-inspector-val" data-testid="inspector-track-effects">{effectCount}</span>
      </div>
      <div className="cx-inspector-row">
        <span className="cx-inspector-key">Clips</span>
        <span className="cx-inspector-val" data-testid="inspector-track-clips">{clipCount}</span>
      </div>
      {isMuted && <div className="cx-inspector-badge">MUTED</div>}
      {isSoloed && <div className="cx-inspector-badge cx-inspector-badge--solo">SOLO</div>}
    </div>
  )
}
