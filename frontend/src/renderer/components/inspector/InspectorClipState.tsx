/**
 * Inspector: clip state — shows clip info.
 * P3.3: info-only, zero store writes.
 * Uses individual primitive selectors to avoid Zustand snapshot-cache issues.
 */
import React from 'react'
import { useTimelineStore } from '../../stores/timeline'

interface Props {
  clipId: string
}

function findClip(s: ReturnType<typeof useTimelineStore.getState>, clipId: string) {
  for (const track of s.tracks) {
    const found = track.clips.find((c) => c.id === clipId)
    if (found) return found
  }
  return null
}

export default function InspectorClipState({ clipId }: Props): React.ReactElement {
  const clipExists = useTimelineStore((s) => findClip(s, clipId) !== null)
  const position = useTimelineStore((s) => findClip(s, clipId)?.position ?? 0)
  const duration = useTimelineStore((s) => findClip(s, clipId)?.duration ?? 0)
  const speed = useTimelineStore((s) => findClip(s, clipId)?.speed ?? 1)

  if (!clipExists) {
    return (
      <div className="cx-inspector-state cx-inspector-state--clip" data-testid="inspector-state-clip">
        <div className="cx-inspector-label">Clip</div>
        <div className="cx-inspector-hint">Clip not found</div>
      </div>
    )
  }

  return (
    <div className="cx-inspector-state cx-inspector-state--clip" data-testid="inspector-state-clip">
      <div className="cx-inspector-label">Clip</div>
      <div className="cx-inspector-row">
        <span className="cx-inspector-key">Position</span>
        <span className="cx-inspector-val" data-testid="inspector-clip-position">{position.toFixed(2)}s</span>
      </div>
      <div className="cx-inspector-row">
        <span className="cx-inspector-key">Duration</span>
        <span className="cx-inspector-val" data-testid="inspector-clip-duration">{duration.toFixed(2)}s</span>
      </div>
      <div className="cx-inspector-row">
        <span className="cx-inspector-key">Speed</span>
        <span className="cx-inspector-val" data-testid="inspector-clip-speed">{speed}x</span>
      </div>
    </div>
  )
}
