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
import { formatTransformLaneEffectId, formatTransformLanePath } from '../../renderer/utils/transformLanes'
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

describe('rippleRemoveClip rebases sibling clip-transform automation keyframes', () => {
  beforeEach(() => {
    useTimelineStore.getState().reset()
    useAutomationStore.getState().resetAutomation()
    useUndoStore.getState().clear()
  })

  it('shifts a later sibling clip-transform lane by -deletedDuration, leaves track-effect lane untouched', () => {
    const trackId = useTimelineStore.getState().addTrack('V1', '#ff0000')!
    const clipA = makeClip({ id: 'clip-a', trackId, position: 0, duration: 5 })
    const clipB = makeClip({ id: 'clip-b', trackId, position: 5, duration: 5 })
    useTimelineStore.getState().addClip(trackId, clipA)
    useTimelineStore.getState().addClip(trackId, clipB)

    // clip-b's clip-transform lane, keyframe inside clip-b's [5,10) span.
    const transformEffectId = formatTransformLaneEffectId('clip-b')
    useAutomationStore.getState().addLane(trackId, transformEffectId, 'x', '#4ade80')
    const transformLane = useAutomationStore.getState().lanes[trackId].find(
      (l) => l.paramPath === `${transformEffectId}.x`,
    )!
    const T = 7
    useAutomationStore.getState().addPoint(trackId, transformLane.id, T, 0.5)

    // Track-level (non-clipTransform) effect lane on the SAME track — must be unaffected.
    useAutomationStore.getState().addLane(trackId, 'fx-abc', 'amount', '#60a5fa')
    const trackLane = useAutomationStore.getState().lanes[trackId].find(
      (l) => l.paramPath === 'fx-abc.amount',
    )!
    const T2 = 8
    useAutomationStore.getState().addPoint(trackId, trackLane.id, T2, 0.8)

    const snapshotBefore = JSON.parse(JSON.stringify(useAutomationStore.getState().lanes))

    // Ripple-delete clip-a (duration 5) — clip-b should shift left by 5.
    useTimelineStore.getState().rippleRemoveClip('clip-a')

    const shiftedClipB = useTimelineStore.getState().tracks.find((t) => t.id === trackId)!.clips
      .find((c) => c.id === 'clip-b')!
    expect(shiftedClipB.position).toBe(0)

    const updatedTransformLane = useAutomationStore.getState().lanes[trackId].find(
      (l) => l.paramPath === `${transformEffectId}.x`,
    )!
    expect(updatedTransformLane.points).toHaveLength(1)
    expect(updatedTransformLane.points[0].time).toBeCloseTo(T - 5)

    const updatedTrackLane = useAutomationStore.getState().lanes[trackId].find(
      (l) => l.paramPath === 'fx-abc.amount',
    )!
    expect(updatedTrackLane.points[0].time).toBeCloseTo(T2)

    // Undo must restore byte-for-byte.
    useUndoStore.getState().undo()
    const restoredClipB = useTimelineStore.getState().tracks.find((t) => t.id === trackId)!.clips
      .find((c) => c.id === 'clip-b')!
    expect(restoredClipB.position).toBe(5)
    expect(useAutomationStore.getState().lanes).toEqual(snapshotBefore)
  })
})

describe('rippleTrimClipOut rebases sibling clip-transform automation keyframes', () => {
  beforeEach(() => {
    useTimelineStore.getState().reset()
    useAutomationStore.getState().resetAutomation()
    useUndoStore.getState().clear()
  })

  it('shifts a later sibling clip-transform lane by -trimDelta, leaves track-effect lane untouched', () => {
    const trackId = useTimelineStore.getState().addTrack('V1', '#ff0000')!
    const clipA = makeClip({ id: 'clip-a', trackId, position: 0, duration: 10, inPoint: 0, outPoint: 10 })
    const clipB = makeClip({ id: 'clip-b', trackId, position: 10, duration: 5 })
    useTimelineStore.getState().addClip(trackId, clipA)
    useTimelineStore.getState().addClip(trackId, clipB)

    const transformEffectId = formatTransformLaneEffectId('clip-b')
    useAutomationStore.getState().addLane(trackId, transformEffectId, 'x', '#4ade80')
    const transformLane = useAutomationStore.getState().lanes[trackId].find(
      (l) => l.paramPath === `${transformEffectId}.x`,
    )!
    const T = 12
    useAutomationStore.getState().addPoint(trackId, transformLane.id, T, 0.5)

    useAutomationStore.getState().addLane(trackId, 'fx-abc', 'amount', '#60a5fa')
    const trackLane = useAutomationStore.getState().lanes[trackId].find(
      (l) => l.paramPath === 'fx-abc.amount',
    )!
    const T2 = 13
    useAutomationStore.getState().addPoint(trackId, trackLane.id, T2, 0.8)

    const snapshotBefore = JSON.parse(JSON.stringify(useAutomationStore.getState().lanes))

    // Trim clip-a's out-point from 10 -> 6 (delta = 4). clip-b should shift left by 4.
    useTimelineStore.getState().rippleTrimClipOut('clip-a', 6)

    const shiftedClipB = useTimelineStore.getState().tracks.find((t) => t.id === trackId)!.clips
      .find((c) => c.id === 'clip-b')!
    expect(shiftedClipB.position).toBe(6)

    const updatedTransformLane = useAutomationStore.getState().lanes[trackId].find(
      (l) => l.paramPath === `${transformEffectId}.x`,
    )!
    expect(updatedTransformLane.points).toHaveLength(1)
    expect(updatedTransformLane.points[0].time).toBeCloseTo(T - 4)

    const updatedTrackLane = useAutomationStore.getState().lanes[trackId].find(
      (l) => l.paramPath === 'fx-abc.amount',
    )!
    expect(updatedTrackLane.points[0].time).toBeCloseTo(T2)

    // Undo must restore byte-for-byte.
    useUndoStore.getState().undo()
    const restoredClipB = useTimelineStore.getState().tracks.find((t) => t.id === trackId)!.clips
      .find((c) => c.id === 'clip-b')!
    expect(restoredClipB.position).toBe(10)
    expect(useAutomationStore.getState().lanes).toEqual(snapshotBefore)
  })
})

describe('splitClip partitions clip-transform automation keyframes across clipA/clipB lanes', () => {
  beforeEach(() => {
    useTimelineStore.getState().reset()
    useAutomationStore.getState().resetAutomation()
    useUndoStore.getState().clear()
  })

  it('keyframes before the cut stay on clipA lane; keyframes at/after the cut move to a new clipB lane', () => {
    const trackId = useTimelineStore.getState().addTrack('V1', '#ff0000')!
    const clip = makeClip({ id: 'clip-1', trackId, position: 0, duration: 10, inPoint: 0, outPoint: 10 })
    useTimelineStore.getState().addClip(trackId, clip)

    const transformEffectId = formatTransformLaneEffectId('clip-1')
    useAutomationStore.getState().addLane(trackId, transformEffectId, 'x', '#4ade80')
    const transformLane = useAutomationStore.getState().lanes[trackId].find(
      (l) => l.paramPath === `${transformEffectId}.x`,
    )!
    useAutomationStore.getState().addPoint(trackId, transformLane.id, 2, 0.2) // before cut
    useAutomationStore.getState().addPoint(trackId, transformLane.id, 7, 0.7) // after cut

    // Track-level (non-clipTransform) effect lane on the SAME track — must be unaffected.
    useAutomationStore.getState().addLane(trackId, 'fx-abc', 'amount', '#60a5fa')
    const trackLane = useAutomationStore.getState().lanes[trackId].find(
      (l) => l.paramPath === 'fx-abc.amount',
    )!
    useAutomationStore.getState().addPoint(trackId, trackLane.id, 3, 0.8)

    const snapshotBefore = JSON.parse(JSON.stringify(useAutomationStore.getState().lanes))

    // Split at time=5.
    useTimelineStore.getState().splitClip('clip-1', 5)

    const clipsAfter = useTimelineStore.getState().tracks.find((t) => t.id === trackId)!.clips
    expect(clipsAfter).toHaveLength(2)
    const clipBId = clipsAfter.find((c) => c.id !== 'clip-1')!.id

    const lanesAfter = useAutomationStore.getState().lanes[trackId]
    const clipALane = lanesAfter.find((l) => l.paramPath === `${transformEffectId}.x`)!
    expect(clipALane.points).toHaveLength(1)
    expect(clipALane.points[0].time).toBeCloseTo(2)

    const clipBLane = lanesAfter.find((l) => l.paramPath === formatTransformLanePath(clipBId, 'x'))!
    expect(clipBLane).toBeDefined()
    expect(clipBLane.points).toHaveLength(1)
    expect(clipBLane.points[0].time).toBeCloseTo(7)

    // Non-clipTransform lane untouched.
    const trackLaneAfter = lanesAfter.find((l) => l.paramPath === 'fx-abc.amount')!
    expect(trackLaneAfter.points).toHaveLength(1)
    expect(trackLaneAfter.points[0].time).toBeCloseTo(3)

    // Undo must restore byte-for-byte: one clip, one lane, both keyframes merged back.
    useUndoStore.getState().undo()
    const clipsRestored = useTimelineStore.getState().tracks.find((t) => t.id === trackId)!.clips
    expect(clipsRestored).toHaveLength(1)
    expect(clipsRestored[0].id).toBe('clip-1')
    expect(useAutomationStore.getState().lanes).toEqual(snapshotBefore)
  })
})
