/**
 * Inspector: multi state — multiple clips selected.
 * P3.3: info-only, zero store writes.
 */
import React from 'react'

interface Props {
  clipIds: string[]
}

export default function InspectorMultiState({ clipIds }: Props): React.ReactElement {
  return (
    <div className="cx-inspector-state cx-inspector-state--multi" data-testid="inspector-state-multi">
      <div className="cx-inspector-label">Multi-select</div>
      <div className="cx-inspector-row">
        <span className="cx-inspector-key">Selected</span>
        <span className="cx-inspector-val" data-testid="inspector-multi-count">{clipIds.length} clips</span>
      </div>
    </div>
  )
}
