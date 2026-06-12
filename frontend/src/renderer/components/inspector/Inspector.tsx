/**
 * Inspector — P3.3 polymorphic inspector (8 states, info-only).
 *
 * Architecture:
 *   - Shell mounts per-state child using `key={selection.type + stateKey}` to
 *     force a clean remount when the selection type changes.
 *   - InspectorHoverHelp is mounted OUTSIDE the state subtree so it survives
 *     the key= remounts. P3.4 fills the real hover delegation logic.
 *   - Zero store writes. Inspector is read-only through selectors.
 *
 * Selection derivation: reads useTimelineStore.selectedTrackId,
 * selectedClipIds, and useProjectStore.selectedEffectId.
 * No useSelectionStore exists (PLAN.md §3.8 is aspirational — see
 * EXECUTION-PLAN §4 doc-discrepancy note; verified 0 hits on main).
 *
 * P3.3 governs states: none/clip/multi/track/effect/operator/marker/tool.
 * operator/marker/tool states receive their id as a prop (no store field yet).
 */
import React, { useMemo } from 'react'
import { useTimelineStore } from '../../stores/timeline'
import { useProjectStore } from '../../stores/project'
import type { SelectionState } from './selectionState'
import InspectorNoneState from './InspectorNoneState'
import InspectorClipState from './InspectorClipState'
import InspectorMultiState from './InspectorMultiState'
import InspectorTrackState from './InspectorTrackState'
import InspectorEffectState from './InspectorEffectState'
import InspectorOperatorState from './InspectorOperatorState'
import InspectorMarkerState from './InspectorMarkerState'
import InspectorToolState from './InspectorToolState'
import InspectorHoverHelp from './InspectorHoverHelp'

interface Props {
  /**
   * External selection override for operator/marker/tool states that have
   * no store field yet. When provided, takes precedence over store-derived
   * selection. Pass null to rely entirely on store derivation.
   */
  selectionOverride?: SelectionState | null
}

function deriveSelection(
  selectedTrackId: string | null,
  selectedClipIds: string[],
  selectedEffectId: string | null,
): SelectionState {
  if (selectedEffectId) return { type: 'effect', effectId: selectedEffectId }
  if (selectedClipIds.length > 1) return { type: 'multi', clipIds: selectedClipIds }
  if (selectedClipIds.length === 1) return { type: 'clip', clipId: selectedClipIds[0] }
  if (selectedTrackId) return { type: 'track', trackId: selectedTrackId }
  return { type: 'none' }
}

function selectionKey(s: SelectionState): string {
  switch (s.type) {
    case 'none': return 'none'
    case 'clip': return `clip-${s.clipId}`
    case 'multi': return `multi-${s.clipIds.join(',')}`
    case 'track': return `track-${s.trackId}`
    case 'effect': return `effect-${s.effectId}`
    case 'operator': return `operator-${s.operatorId}`
    case 'marker': return `marker-${s.markerId}`
    case 'tool': return `tool-${s.toolMode}`
  }
}

function InspectorBody({ selection }: { selection: SelectionState }): React.ReactElement {
  switch (selection.type) {
    case 'none':
      return <InspectorNoneState />
    case 'clip':
      return <InspectorClipState clipId={selection.clipId} />
    case 'multi':
      return <InspectorMultiState clipIds={selection.clipIds} />
    case 'track':
      return <InspectorTrackState trackId={selection.trackId} />
    case 'effect':
      return <InspectorEffectState effectId={selection.effectId} />
    case 'operator':
      return <InspectorOperatorState operatorId={selection.operatorId} />
    case 'marker':
      return <InspectorMarkerState markerId={selection.markerId} />
    case 'tool':
      return <InspectorToolState toolMode={selection.toolMode} />
    default:
      // Defensive: unknown/unmapped type → render none state, no crash
      return <InspectorNoneState />
  }
}

export default function Inspector({ selectionOverride = null }: Props): React.ReactElement {
  const selectedTrackId = useTimelineStore((s) => s.selectedTrackId)
  const selectedClipIds = useTimelineStore((s) => s.selectedClipIds)
  const selectedEffectId = useProjectStore((s) => s.selectedEffectId)

  const storeSelection = useMemo(
    () => deriveSelection(selectedTrackId, selectedClipIds, selectedEffectId),
    [selectedTrackId, selectedClipIds, selectedEffectId],
  )

  const selection = selectionOverride ?? storeSelection
  const key = selectionKey(selection)

  return (
    <div className="cx-inspector" data-testid="inspector-root">
      {/* InspectorHoverHelp is OUTSIDE the keyed subtree — survives selection changes.
          P3.4 fills the real hover delegation (300ms settle, 200ms fade, WCAG 1.4.13). */}
      <InspectorHoverHelp />
      {/* key= forces clean remount on selection type change */}
      <InspectorBody key={key} selection={selection} />
    </div>
  )
}
