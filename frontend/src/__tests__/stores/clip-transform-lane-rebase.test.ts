/**
 * Bug repro: moveClip does NOT rebase clip-transform automation keyframes.
 *
 * Clip-transform lanes (frontend/src/renderer/utils/transformLanes.ts) key
 * paramPath to a clipId (`clipTransform.<clipId>.<field>`) but store RAW
 * timeline-time AutomationPoints. When a clip moves on the timeline, its
 * bound clip-transform lane keyframes must shift by the same delta so they
 * stay aligned with the footage. Track-level effect lanes (non-clipTransform)
 * must NOT be touched.
 */
import { describe, it, expect, beforeEach } from 'vitest'

// Mock window.entropic before store import (matches timeline.test.ts convention)
;(globalThis as any).window = {
  entropic: {
    onEngineStatus: () => {},
    sendCommand: async () => ({ ok: true }),
    selectFile: async () => null,
    selectSavePath: async () => null,
    onExportProgress: () => {},
  },
}

import { useTimelineStore } from '../../renderer/stores/timeline'
import { useAutomationStore } from '../../renderer/stores/automation'
import { useUndoStore } from '../../renderer/stores/undo'
import { formatTransformLaneEffectId } from '../../renderer/utils/transformLanes'
import type { Clip } from '../../shared/types'

function makeClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: overrides.id ?? 'clip-1',
    assetId: overrides.assetId ?? 'asset-1',
    trackId: overrides.trackId ?? 'track-1',
    position: overrides.position ?? 0,
    duration: overrides.duration ?? 5,
    inPoint: overrides.inPoint ?? 0,
    outPoint: overrides.outPoint ?? 5,
    speed: overrides.speed ?? 1,
  }
}

describe('moveClip rebases clip-transform automation keyframes', () => {
  beforeEach(() => {
    useTimelineStore.getState().reset()
    useAutomationStore.getState().resetAutomation()
    useUndoStore.getState().clear()
  })

  it('shifts clipTransform lane keyframe time by the move delta, leaves track-effect lane untouched', () => {
    const trackId = useTimelineStore.getState().addTrack('V1', '#ff0000')!
    const clip = makeClip({ id: 'clip-1', trackId, position: 10, duration: 5 })
    useTimelineStore.getState().addClip(trackId, clip)

    // Clip-transform lane bound to clip-1's 'x' field.
    const transformEffectId = formatTransformLaneEffectId('clip-1')
    useAutomationStore.getState().addLane(trackId, transformEffectId, 'x', '#4ade80')
    const transformLane = useAutomationStore.getState().lanes[trackId].find(
      (l) => l.paramPath === `${transformEffectId}.x`,
    )!
    const T = 12 // absolute timeline time, inside the clip's [10, 15) span
    useAutomationStore.getState().addPoint(trackId, transformLane.id, T, 0.5)

    // Track-level (non-clipTransform) effect lane on the SAME track — must be unaffected.
    useAutomationStore.getState().addLane(trackId, 'fx-abc', 'amount', '#60a5fa')
    const trackLane = useAutomationStore.getState().lanes[trackId].find(
      (l) => l.paramPath === 'fx-abc.amount',
    )!
    const T2 = 3
    useAutomationStore.getState().addPoint(trackId, trackLane.id, T2, 0.8)

    // Move the clip by delta = +7 (position 10 -> 17), same track.
    const D = 7
    useTimelineStore.getState().moveClip('clip-1', trackId, 10 + D)

    const movedClip = useTimelineStore.getState().tracks.find((t) => t.id === trackId)!.clips[0]
    expect(movedClip.position).toBe(10 + D)

    const updatedTransformLane = useAutomationStore.getState().lanes[trackId].find(
      (l) => l.paramPath === `${transformEffectId}.x`,
    )!
    expect(updatedTransformLane.points).toHaveLength(1)
    expect(updatedTransformLane.points[0].time).toBeCloseTo(T + D)

    const updatedTrackLane = useAutomationStore.getState().lanes[trackId].find(
      (l) => l.paramPath === 'fx-abc.amount',
    )!
    expect(updatedTrackLane.points).toHaveLength(1)
    expect(updatedTrackLane.points[0].time).toBeCloseTo(T2)
  })
})
