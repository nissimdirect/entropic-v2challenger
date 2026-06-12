/**
 * Inspector: effect state — shows selected effect info.
 * P3.3: info-only, zero store writes.
 * Uses individual primitive selectors to avoid Zustand snapshot-cache issues.
 */
import React from 'react'
import { useTimelineStore } from '../../stores/timeline'

interface Props {
  effectId: string
}

function findEffect(s: ReturnType<typeof useTimelineStore.getState>, effectId: string) {
  for (const track of s.tracks) {
    const found = track.effectChain.find((e) => e.id === effectId)
    if (found) return found
  }
  return null
}

export default function InspectorEffectState({ effectId }: Props): React.ReactElement {
  const effectExists = useTimelineStore((s) => findEffect(s, effectId) !== null)
  const effectTypeId = useTimelineStore((s) => findEffect(s, effectId)?.effectId ?? '')
  const isEnabled = useTimelineStore((s) => findEffect(s, effectId)?.isEnabled ?? true)
  const mix = useTimelineStore((s) => findEffect(s, effectId)?.mix ?? 1)
  const isFrozen = useTimelineStore((s) => findEffect(s, effectId)?.isFrozen ?? false)
  const paramCount = useTimelineStore((s) => {
    const fx = findEffect(s, effectId)
    return fx ? Object.keys(fx.parameters).length : 0
  })

  if (!effectExists) {
    return (
      <div className="cx-inspector-state cx-inspector-state--effect" data-testid="inspector-state-effect">
        <div className="cx-inspector-label">Effect</div>
        <div className="cx-inspector-hint">Effect not found</div>
      </div>
    )
  }

  return (
    <div className="cx-inspector-state cx-inspector-state--effect" data-testid="inspector-state-effect">
      <div className="cx-inspector-label">Effect</div>
      <div className="cx-inspector-row">
        <span className="cx-inspector-key">ID</span>
        <span className="cx-inspector-val" data-testid="inspector-effect-id">{effectTypeId}</span>
      </div>
      <div className="cx-inspector-row">
        <span className="cx-inspector-key">Enabled</span>
        <span className="cx-inspector-val" data-testid="inspector-effect-enabled">{isEnabled ? 'Yes' : 'No'}</span>
      </div>
      <div className="cx-inspector-row">
        <span className="cx-inspector-key">Mix</span>
        <span className="cx-inspector-val" data-testid="inspector-effect-mix">{(mix * 100).toFixed(0)}%</span>
      </div>
      <div className="cx-inspector-row">
        <span className="cx-inspector-key">Params</span>
        <span className="cx-inspector-val" data-testid="inspector-effect-params">{paramCount}</span>
      </div>
      {isFrozen && <div className="cx-inspector-badge">FROZEN</div>}
    </div>
  )
}
