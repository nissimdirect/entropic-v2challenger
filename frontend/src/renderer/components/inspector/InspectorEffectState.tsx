/**
 * Inspector: effect state — shows selected effect info.
 * P3.3: info-only, zero store writes.
 * P3.6: I3 inline-probe action menu on right-click of param rows.
 *
 * Uses individual primitive selectors to avoid Zustand snapshot-cache issues.
 */
import React, { useCallback, useState } from 'react'
import { useTimelineStore } from '../../stores/timeline'
import InlineActionMenu from '../inline-actions/InlineActionMenu'
import { useInlineActions } from '../inline-actions/useInlineActions'
import type { ActionContextKind } from '../inline-actions/useInlineActions'

interface Props {
  effectId: string
}

function findEffect(s: ReturnType<typeof useTimelineStore.getState>, effectId: string) {
  for (const track of s.tracks) {
    const found = track.effectChain.find((e) => e.id === effectId)
    if (found) return { effect: found, trackId: track.id }
  }
  return null
}

interface ParamRowProbeMenuState {
  x: number
  y: number
  paramPath: string
  nodeId: string
  trackId: string | undefined
}

function ParamProbeRow({
  effectId,
  paramPath,
  trackId,
  label,
  value,
  testId,
}: {
  effectId: string
  paramPath: string
  trackId: string | undefined
  label: string
  value: React.ReactNode
  testId: string
}) {
  const [menuState, setMenuState] = useState<{ x: number; y: number } | null>(null)

  const ctx = {
    kind: 'param' as ActionContextKind,
    nodeId: effectId,
    paramPath,
    trackId,
  }

  const { actions } = useInlineActions(ctx)

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setMenuState({ x: e.clientX, y: e.clientY })
    },
    [],
  )

  const handleClose = useCallback(() => setMenuState(null), [])

  return (
    <>
      <div
        className="cx-inspector-row cx-inspector-row--param"
        data-testid={`inspector-param-row-${paramPath}`}
        onContextMenu={handleContextMenu}
      >
        <span className="cx-inspector-key">{label}</span>
        <span className="cx-inspector-val" data-testid={testId}>
          {value}
        </span>
      </div>
      {menuState && (
        <InlineActionMenu
          x={menuState.x}
          y={menuState.y}
          paramId={`${effectId}:${paramPath}`}
          actions={actions}
          onClose={handleClose}
        />
      )}
    </>
  )
}

export default function InspectorEffectState({ effectId }: Props): React.ReactElement {
  const effectExists = useTimelineStore((s) => findEffect(s, effectId) !== null)
  const effectTypeId = useTimelineStore((s) => findEffect(s, effectId)?.effect?.effectId ?? '')
  const isEnabled = useTimelineStore((s) => findEffect(s, effectId)?.effect?.isEnabled ?? true)
  const mix = useTimelineStore((s) => findEffect(s, effectId)?.effect?.mix ?? 1)
  const isFrozen = useTimelineStore((s) => findEffect(s, effectId)?.effect?.isFrozen ?? false)
  const trackId = useTimelineStore((s) => findEffect(s, effectId)?.trackId)
  const paramCount = useTimelineStore((s) => {
    const found = findEffect(s, effectId)
    return found ? Object.keys(found.effect.parameters).length : 0
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
      {/* Non-param rows: no probe menu */}
      <div className="cx-inspector-row" data-testid="inspector-row-id">
        <span className="cx-inspector-key">ID</span>
        <span className="cx-inspector-val" data-testid="inspector-effect-id">{effectTypeId}</span>
      </div>
      <div className="cx-inspector-row" data-testid="inspector-row-enabled">
        <span className="cx-inspector-key">Enabled</span>
        <span className="cx-inspector-val" data-testid="inspector-effect-enabled">{isEnabled ? 'Yes' : 'No'}</span>
      </div>
      {/* Param rows: right-click opens inline probe action menu */}
      <ParamProbeRow
        effectId={effectId}
        paramPath="mix"
        trackId={trackId}
        label="Mix"
        value={`${(mix * 100).toFixed(0)}%`}
        testId="inspector-effect-mix"
      />
      <ParamProbeRow
        effectId={effectId}
        paramPath="params_count"
        trackId={trackId}
        label="Params"
        value={paramCount}
        testId="inspector-effect-params"
      />
      {isFrozen && <div className="cx-inspector-badge">FROZEN</div>}
    </div>
  )
}
