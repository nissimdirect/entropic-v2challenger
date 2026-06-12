/**
 * Inspector: tool state — shows active cursor/tool mode.
 * P3.3: info-only, zero store writes.
 * Tool selection is in the browser store's cursor-mode stack (P3.2 scope).
 * At P3.3, we read toolMode prop from the parent selection object.
 */
import React from 'react'

interface Props {
  toolMode: string
}

export default function InspectorToolState({ toolMode }: Props): React.ReactElement {
  return (
    <div className="cx-inspector-state cx-inspector-state--tool" data-testid="inspector-state-tool">
      <div className="cx-inspector-label">Tool</div>
      <div className="cx-inspector-row">
        <span className="cx-inspector-key">Mode</span>
        <span className="cx-inspector-val" data-testid="inspector-tool-mode">{toolMode}</span>
      </div>
    </div>
  )
}
