/**
 * Inspector: marker state — shows timeline marker info.
 * P3.3: info-only, zero store writes.
 * Uses individual primitive selectors to avoid Zustand snapshot-cache issues.
 */
import React from 'react'
import { useTimelineStore } from '../../stores/timeline'

interface Props {
  markerId: string
}

export default function InspectorMarkerState({ markerId }: Props): React.ReactElement {
  const exists = useTimelineStore((s) => s.markers.some((m) => m.id === markerId))
  const label = useTimelineStore((s) => s.markers.find((m) => m.id === markerId)?.label ?? '')
  const time = useTimelineStore((s) => s.markers.find((m) => m.id === markerId)?.time ?? 0)
  const color = useTimelineStore((s) => s.markers.find((m) => m.id === markerId)?.color ?? '#ffffff')

  if (!exists) {
    return (
      <div className="cx-inspector-state cx-inspector-state--marker" data-testid="inspector-state-marker">
        <div className="cx-inspector-label">Marker</div>
        <div className="cx-inspector-hint">Marker not found</div>
      </div>
    )
  }

  return (
    <div className="cx-inspector-state cx-inspector-state--marker" data-testid="inspector-state-marker">
      <div className="cx-inspector-label">Marker</div>
      <div className="cx-inspector-row">
        <span className="cx-inspector-key">Label</span>
        <span className="cx-inspector-val" data-testid="inspector-marker-label">{label || '—'}</span>
      </div>
      <div className="cx-inspector-row">
        <span className="cx-inspector-key">Time</span>
        <span className="cx-inspector-val" data-testid="inspector-marker-time">{time.toFixed(2)}s</span>
      </div>
      <div
        className="cx-inspector-color-swatch"
        data-testid="inspector-marker-color"
        style={{ background: color }}
        aria-label={`Marker color: ${color}`}
      />
    </div>
  )
}
