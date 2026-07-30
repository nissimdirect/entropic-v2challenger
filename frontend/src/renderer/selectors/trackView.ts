/**
 * trackView selectors — F4b proof-of-pattern (grows the trackStats.ts convention).
 *
 * Composes the reactive cross-store reads that Track.tsx's three exported
 * components (TrackHeader, LaneBadges, TrackLane) previously called inline.
 * Each hook below wraps the SAME individual store-hook calls, in the SAME
 * order, with the SAME selector functions — only where the call sites live
 * has moved. Subscriptions, re-render triggers, and returned values are
 * unchanged (pure refactor).
 *
 * Non-reactive `.getState()` calls (used inside event handlers, not render)
 * are NOT moved here — they stay inline in Track.tsx, matching the
 * getTrackStats() precedent in trackStats.ts (reactive reads vs imperative
 * getState() reads are kept separate).
 */
import { useAutomationStore } from '../stores/automation'
import { useTrackDragStore } from '../stores/trackDrag'
import { useLayoutStore } from '../stores/layout'
import { useEffectsStore } from '../stores/effects'
import { useProjectStore } from '../stores/project'

const EMPTY_LANES: never[] = []

/** TrackHeader's composed view: arm state, drag state, expand state, registry, nested lanes. */
export function useTrackHeaderView(trackId: string) {
  const armedTrackId = useAutomationStore((s) => s.armedTrackId)
  const dragFromIdx = useTrackDragStore((s) => s.fromIdx)
  const expandedTrackIds = useLayoutStore((s) => s.expandedTrackIds)
  const registry = useEffectsStore((s) => s.registry)
  const leanAutoLanes = useAutomationStore((s) => s.lanes[trackId]) ?? EMPTY_LANES
  return { armedTrackId, dragFromIdx, expandedTrackIds, registry, leanAutoLanes }
}

/** LaneBadges' composed view: this track's automation lanes + the SG-3 abort set. */
export function useLaneBadgesView(trackId: string) {
  const lanes = useAutomationStore((s) => s.lanes[trackId]) ?? EMPTY_LANES
  const sg3Aborted = useAutomationStore((s) => s.sg3AbortedLaneIds)
  return { lanes, sg3Aborted }
}

/** TrackLane's composed view: project assets + this track's automation lanes/mode. */
export function useTrackLaneView(trackId: string) {
  const assets = useProjectStore((s) => s.assets)
  const automationLanes = useAutomationStore((s) => s.lanes[trackId]) ?? EMPTY_LANES
  const automationMode = useAutomationStore((s) => s.mode)
  return { assets, automationLanes, automationMode }
}
