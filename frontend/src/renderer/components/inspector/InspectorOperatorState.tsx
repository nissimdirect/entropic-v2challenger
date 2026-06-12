/**
 * Inspector: operator state — shows operator info.
 * P3.3: info-only, zero store writes.
 * Uses individual primitive selectors to avoid Zustand snapshot-cache issues.
 * Operator selection state is aspirational in PLAN.md §3.8 — no store field yet.
 */
import React from 'react'
import { useOperatorStore } from '../../stores/operators'

interface Props {
  operatorId: string
}

export default function InspectorOperatorState({ operatorId }: Props): React.ReactElement {
  const exists = useOperatorStore((s) => s.operators.some((o) => o.id === operatorId))
  const label = useOperatorStore((s) => s.operators.find((o) => o.id === operatorId)?.label ?? '')
  const type = useOperatorStore((s) => s.operators.find((o) => o.id === operatorId)?.type ?? '')
  const isEnabled = useOperatorStore((s) => s.operators.find((o) => o.id === operatorId)?.isEnabled ?? true)
  const mappingCount = useOperatorStore((s) => s.operators.find((o) => o.id === operatorId)?.mappings.length ?? 0)

  if (!exists) {
    return (
      <div className="cx-inspector-state cx-inspector-state--operator" data-testid="inspector-state-operator">
        <div className="cx-inspector-label">Operator</div>
        <div className="cx-inspector-hint">Operator not found</div>
      </div>
    )
  }

  return (
    <div className="cx-inspector-state cx-inspector-state--operator" data-testid="inspector-state-operator">
      <div className="cx-inspector-label">Operator</div>
      <div className="cx-inspector-row">
        <span className="cx-inspector-key">Label</span>
        <span className="cx-inspector-val" data-testid="inspector-operator-label">{label}</span>
      </div>
      <div className="cx-inspector-row">
        <span className="cx-inspector-key">Type</span>
        <span className="cx-inspector-val" data-testid="inspector-operator-type">{type}</span>
      </div>
      <div className="cx-inspector-row">
        <span className="cx-inspector-key">Enabled</span>
        <span className="cx-inspector-val" data-testid="inspector-operator-enabled">{isEnabled ? 'Yes' : 'No'}</span>
      </div>
      <div className="cx-inspector-row">
        <span className="cx-inspector-key">Mappings</span>
        <span className="cx-inspector-val" data-testid="inspector-operator-mappings">{mappingCount}</span>
      </div>
    </div>
  )
}
