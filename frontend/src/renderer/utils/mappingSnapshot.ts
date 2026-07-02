/**
 * H2/H4 (2026-07-02 master-tuneup WS5) — shared, store-snapshot-friendly focus
 * resolution used by BOTH the per-frame render overlay (App.tsx modulateChain)
 * AND the H4 CC-records-automation path (utils/cc-record.ts).
 *
 * Extracted from App.tsx so the focus-follows resolution has a SINGLE source of
 * truth: the CC a user turns must record to exactly the same lane the live
 * overlay would have modulated for the current focus. Duplicating this logic
 * would let the two drift (record path and overlay path targeting different
 * lanes for the same knob) — the exact bug the focus-follows-records proof test
 * guards against.
 */
import { deriveMappingContext } from './focusContext'
import type { DefaultAssignmentSources } from './deriveDefaultAssignment'
import { useTimelineStore } from '../stores/timeline'
import { useProjectStore } from '../stores/project'
import { useInstrumentsStore } from '../stores/instruments'
import { useEffectsStore } from '../stores/effects'

/**
 * Pure snapshot of the CURRENT focus MappingContext, for non-component call
 * sites (the render loop is a plain function, not a React component —
 * deriveMappingContext is the store-snapshot-friendly pure sibling of
 * useMappingContext() for this).
 */
export function snapshotMappingContext() {
  const timeline = useTimelineStore.getState()
  const project = useProjectStore.getState()
  return deriveMappingContext(
    { selectedTrackId: timeline.selectedTrackId, selectedClipIds: timeline.selectedClipIds, tracks: timeline.tracks },
    { selectedEffectId: project.selectedEffectId, selectedRackPad: project.selectedRackPad },
  )
}

/**
 * Live-data slices deriveDefaultAssignment needs for the GIVEN context, read
 * fresh from the instruments/effects stores each call (cheap — bounded by
 * MAX_MACROS_PER_RACK=8 / a slice(0,8) of one effect's params).
 */
export function defaultAssignmentSourcesFor(
  context: ReturnType<typeof snapshotMappingContext>,
): DefaultAssignmentSources {
  if (context.kind === 'rack-pad' || context.kind === 'track') {
    const rack = useInstrumentsStore.getState().racks[context.trackId]
    return { rackMacros: rack?.macros }
  }
  if (context.kind === 'effect') {
    const track = useTimelineStore.getState().tracks.find((t) => t.id === context.trackId)
    const effect = track?.effectChain.find((e) => e.id === context.effectId)
    if (!effect) return {}
    const info = useEffectsStore.getState().registry.find((r) => r.id === effect.effectId)
    if (!info) return {}
    return { effectParamEntries: Object.entries(info.params) }
  }
  return {}
}
