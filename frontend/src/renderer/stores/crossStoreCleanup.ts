/**
 * crossStoreCleanup.ts — Shared cross-store cleanup helpers for track/effect lifecycle.
 *
 * DESIGN D1: This module is deliberately standalone to avoid a `project ↔ timeline`
 * import cycle. All store access is via lazy `getState()` inside function bodies —
 * never at module top level.
 *
 * Used by:
 *   - stores/project.ts  (removeEffect: prune + restore per single effect)
 *   - stores/timeline.ts (removeTrack: prune + restore the track's full chain)
 */

import { useOperatorStore } from './operators'
import { useAutomationStore } from './automation'
import { useMIDIStore } from './midi'
import { useProjectStore } from './project'

// ---------------------------------------------------------------------------
// Snapshot type — records all state mutated by pruneEffectDependents so the
// caller can restore it via restoreEffectDependents on undo.
// ---------------------------------------------------------------------------

export interface PruneSnapshot {
  operators: Array<{ id: string; mappings: Array<{ targetEffectId: string; targetParamKey: string; depth: number; min: number; max: number; curve: string; blendMode?: string }> }>
  lanes: Record<string, Array<{ id: string; paramPath: string; color: string; isVisible: boolean; points: Array<{ time: number; value: number; curve: number }>; isTrigger: boolean; triggerMode?: string; triggerADSR?: object }>>
  ccMappings: Array<{ cc: number; effectId: string; paramKey: string }>
  deviceGroups: Record<string, { name: string; effectIds: string[]; mix: number; isEnabled: boolean }>
}

// ---------------------------------------------------------------------------
// pruneEffectDependents
// ---------------------------------------------------------------------------

/**
 * Remove all cross-store dependents for the given effect ids.
 *
 * Prune rules (mirror removeEffect in project.ts):
 *   1. Operator mappings whose `targetEffectId` is in `effectIds` → removed.
 *   2. Automation lanes whose `paramPath` starts with `${effectId}.` for any id in `effectIds` → removed
 *      (across ALL track buckets). Empty buckets are deleted.
 *   3. CC mappings whose `effectId` is in `effectIds` → removed.
 *   4. Device groups: drop matching ids from `effectIds`; if a group falls below 2 members → delete it.
 *   5. opts.dropTrackLanes: when set, ALSO delete `useAutomationStore.lanes[trackId]` wholesale
 *      (catches mixer/project-targeted lanes not matched by effect-id prefix).
 *
 * Returns a full snapshot of all mutated state for symmetric undo restore.
 */
export function pruneEffectDependents(
  effectIds: string[],
  opts?: { dropTrackLanes?: string },
): PruneSnapshot {
  const effectIdSet = new Set(effectIds)

  // ---- 1. Snapshot pre-mutation state ----

  const opStore = useOperatorStore.getState()
  const savedOperators = opStore.operators.map((op) => ({
    ...op,
    mappings: op.mappings.map((m) => ({ ...m })),
  }))

  const autoStore = useAutomationStore.getState()
  const savedLanes = JSON.parse(JSON.stringify(autoStore.lanes)) as PruneSnapshot['lanes']

  const midiStore = useMIDIStore.getState()
  const savedCCMappings = midiStore.ccMappings.map((m) => ({ ...m }))

  const projectStore = useProjectStore.getState()
  const savedDeviceGroups = JSON.parse(JSON.stringify(projectStore.deviceGroups)) as PruneSnapshot['deviceGroups']

  // ---- 2. Prune operator mappings ----

  const cleanedOps = opStore.operators.map((op) => ({
    ...op,
    mappings: op.mappings.filter((m) => !effectIdSet.has(m.targetEffectId)),
  }))
  useOperatorStore.setState({ operators: cleanedOps })

  // ---- 3. Prune automation lanes (by effectId prefix) ----

  const lanes = { ...autoStore.lanes }

  // If dropTrackLanes is set, delete that bucket wholesale first
  if (opts?.dropTrackLanes !== undefined) {
    delete lanes[opts.dropTrackLanes]
  }

  // Then filter remaining buckets by paramPath prefix
  for (const trkId of Object.keys(lanes)) {
    lanes[trkId] = lanes[trkId].filter(
      (l) => !Array.from(effectIdSet).some((eid) => l.paramPath.startsWith(`${eid}.`)),
    )
    if (lanes[trkId].length === 0) delete lanes[trkId]
  }

  useAutomationStore.setState({ lanes })

  // ---- 4. Prune CC mappings ----

  const ccMappings = midiStore.ccMappings.filter((m) => !effectIdSet.has(m.effectId))
  useMIDIStore.setState({ ccMappings })

  // ---- 5. Prune device groups ----

  const currentGroups = projectStore.deviceGroups
  const nextGroups: PruneSnapshot['deviceGroups'] = {}
  for (const [gid, group] of Object.entries(currentGroups)) {
    const pruned = group.effectIds.filter((eid) => !effectIdSet.has(eid))
    if (pruned.length >= 2) {
      nextGroups[gid] = { ...group, effectIds: pruned }
    }
    // else: group falls below minimum (2) → omit (delete), mirrors project.ts:213
  }
  useProjectStore.setState({ deviceGroups: nextGroups })

  return {
    operators: savedOperators,
    lanes: savedLanes,
    ccMappings: savedCCMappings,
    deviceGroups: savedDeviceGroups,
  }
}

// ---------------------------------------------------------------------------
// restoreEffectDependents
// ---------------------------------------------------------------------------

/**
 * Restore all cross-store dependents from a PruneSnapshot.
 * Called in the inverse (undo) path of removeEffect / removeTrack.
 */
export function restoreEffectDependents(snap: PruneSnapshot): void {
  useOperatorStore.setState({ operators: snap.operators })
  useAutomationStore.setState({ lanes: snap.lanes })
  useMIDIStore.setState({ ccMappings: snap.ccMappings })
  useProjectStore.setState({ deviceGroups: snap.deviceGroups })
}
