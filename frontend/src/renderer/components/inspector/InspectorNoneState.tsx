/**
 * Inspector: none state — nothing selected.
 * P3.3: info-only, zero store writes.
 */
import React from 'react'

export default function InspectorNoneState(): React.ReactElement {
  return (
    <div className="cx-inspector-state cx-inspector-state--none" data-testid="inspector-state-none">
      <span className="cx-inspector-hint">Select a track, clip, or effect</span>
    </div>
  )
}
