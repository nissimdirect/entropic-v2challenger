/**
 * A3 — recordTransformField / recordChangedTransformFields tests.
 *
 * Covers: the gate matrix (playing + latch/touch + armed + lane -> records;
 * each missing condition -> no-op, byte-identical to today); gesture diffing
 * (only fields the gesture changed are recorded); the normalize/denormalize
 * round-trip (recorded value evaluates back to the dragged value at that
 * frame); punch semantics (recording over an existing curve replaces within
 * recordPoint's 0.033s threshold); and that every no-record path leaves the
 * automation store untouched.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useAutomationStore } from '../../renderer/stores/automation'
import { useTimelineStore } from '../../renderer/stores/timeline'
import { useUndoStore } from '../../renderer/stores/undo'
import { recordTransformField, recordChangedTransformFields } from '../../renderer/utils/transform-record'
import { formatTransformLaneEffectId, evaluateTransformOverrides } from '../../renderer/utils/transformLanes'
import { IDENTITY_TRANSFORM, type ClipTransform } from '../../shared/types'
import type { Clip } from '../../shared/types'

function resetAll() {
  useUndoStore.getState().clear()
  useTimelineStore.getState().reset()
  useAutomationStore.getState().resetAutomation()
}

/** Create a track + a clip on it, returning both ids. */
function setupClip(): { trackId: string; clipId: string } {
  const trackId = useTimelineStore.getState().addTrack('V1', '#4ade80', 'video')!
  const clip: Clip = {
    id: 'clip-1',
    assetId: 'asset-1',
    trackId,
    position: 0,
    duration: 10,
    inPoint: 0,
    outPoint: 10,
    speed: 1,
    transform: { ...IDENTITY_TRANSFORM },
  }
  useTimelineStore.getState().addClip(trackId, clip)
  return { trackId, clipId: clip.id }
}

/** Add a transform lane for `field` on `clipId`, on `trackId`. */
function addTransformLane(trackId: string, clipId: string, field: string) {
  useAutomationStore.getState().addLane(trackId, formatTransformLaneEffectId(clipId), field, '#4ade80')
  const lanes = useAutomationStore.getState().lanes[trackId]
  return lanes[lanes.length - 1]
}

function getLane(trackId: string, laneId: string) {
  return useAutomationStore.getState().lanes[trackId].find((l) => l.id === laneId)!
}

describe('recordTransformField — gate matrix', () => {
  beforeEach(resetAll)

  it('records when playing + latch + armed + lane exists', () => {
    const { trackId, clipId } = setupClip()
    const lane = addTransformLane(trackId, clipId, 'x')
    useAutomationStore.getState().setMode('latch')
    useAutomationStore.getState().armTrack(trackId)
    useTimelineStore.getState().setPlayheadTime(2)

    recordTransformField(clipId, 'x', 500, true)

    expect(getLane(trackId, lane.id).points).toHaveLength(1)
  })

  it('records in touch mode too', () => {
    const { trackId, clipId } = setupClip()
    const lane = addTransformLane(trackId, clipId, 'rotation')
    useAutomationStore.getState().setMode('touch')
    useAutomationStore.getState().armTrack(trackId)

    recordTransformField(clipId, 'rotation', 45, true)

    expect(getLane(trackId, lane.id).points).toHaveLength(1)
  })

  it('no-op: not playing', () => {
    const { trackId, clipId } = setupClip()
    const lane = addTransformLane(trackId, clipId, 'x')
    useAutomationStore.getState().setMode('latch')
    useAutomationStore.getState().armTrack(trackId)

    recordTransformField(clipId, 'x', 500, false)

    expect(getLane(trackId, lane.id).points).toHaveLength(0)
  })

  it('no-op: mode is read', () => {
    const { trackId, clipId } = setupClip()
    const lane = addTransformLane(trackId, clipId, 'x')
    useAutomationStore.getState().setMode('read')
    useAutomationStore.getState().armTrack(trackId)

    recordTransformField(clipId, 'x', 500, true)

    expect(getLane(trackId, lane.id).points).toHaveLength(0)
  })

  it('no-op: mode is draw', () => {
    const { trackId, clipId } = setupClip()
    const lane = addTransformLane(trackId, clipId, 'x')
    useAutomationStore.getState().setMode('draw')
    useAutomationStore.getState().armTrack(trackId)

    recordTransformField(clipId, 'x', 500, true)

    expect(getLane(trackId, lane.id).points).toHaveLength(0)
  })

  it('no-op: no track armed', () => {
    const { trackId, clipId } = setupClip()
    const lane = addTransformLane(trackId, clipId, 'x')
    useAutomationStore.getState().setMode('latch')
    useAutomationStore.getState().armTrack(null)

    recordTransformField(clipId, 'x', 500, true)

    expect(getLane(trackId, lane.id).points).toHaveLength(0)
  })

  it('no-op: armed track differs from the clip\'s track', () => {
    const { trackId, clipId } = setupClip()
    const otherTrackId = useTimelineStore.getState().addTrack('V2', '#60a5fa', 'video')!
    const lane = addTransformLane(trackId, clipId, 'x')
    useAutomationStore.getState().setMode('latch')
    useAutomationStore.getState().armTrack(otherTrackId)

    recordTransformField(clipId, 'x', 500, true)

    expect(getLane(trackId, lane.id).points).toHaveLength(0)
  })

  it('no-op: no lane exists for the field', () => {
    const { trackId, clipId } = setupClip()
    // Lane exists for 'y', not 'x'.
    addTransformLane(trackId, clipId, 'y')
    useAutomationStore.getState().setMode('latch')
    useAutomationStore.getState().armTrack(trackId)

    recordTransformField(clipId, 'x', 500, true)

    // Automation store untouched beyond the pre-existing 'y' lane.
    expect(useAutomationStore.getState().lanes[trackId]).toHaveLength(1)
    expect(useAutomationStore.getState().lanes[trackId][0].points).toHaveLength(0)
  })

  it('no-op: clip does not exist on any track', () => {
    const { trackId, clipId } = setupClip()
    addTransformLane(trackId, clipId, 'x')
    useAutomationStore.getState().setMode('latch')
    useAutomationStore.getState().armTrack(trackId)

    recordTransformField('nonexistent-clip', 'x', 500, true)

    expect(useAutomationStore.getState().lanes[trackId][0].points).toHaveLength(0)
  })

  it('no-op: non-finite value is dropped (trust boundary)', () => {
    const { trackId, clipId } = setupClip()
    const lane = addTransformLane(trackId, clipId, 'x')
    useAutomationStore.getState().setMode('latch')
    useAutomationStore.getState().armTrack(trackId)

    recordTransformField(clipId, 'x', NaN, true)
    recordTransformField(clipId, 'x', Infinity, true)

    expect(getLane(trackId, lane.id).points).toHaveLength(0)
  })
})

describe('recordTransformField — punch semantics (delegates to recordPoint)', () => {
  beforeEach(resetAll)

  it('recording twice within the 0.033s threshold replaces, not duplicates', () => {
    const { trackId, clipId } = setupClip()
    const lane = addTransformLane(trackId, clipId, 'x')
    useAutomationStore.getState().setMode('latch')
    useAutomationStore.getState().armTrack(trackId)

    useTimelineStore.getState().setPlayheadTime(1.0)
    recordTransformField(clipId, 'x', 0, true) // normalized 0.5 (x range is symmetric)
    useTimelineStore.getState().setPlayheadTime(1.02) // within 0.033 of 1.0
    recordTransformField(clipId, 'x', 1000, true)

    const points = getLane(trackId, lane.id).points
    expect(points).toHaveLength(1)
    expect(points[0].time).toBe(1.02)
  })

  it('recording outside the threshold inserts a second point', () => {
    const { trackId, clipId } = setupClip()
    const lane = addTransformLane(trackId, clipId, 'x')
    useAutomationStore.getState().setMode('latch')
    useAutomationStore.getState().armTrack(trackId)

    useTimelineStore.getState().setPlayheadTime(1.0)
    recordTransformField(clipId, 'x', 0, true)
    useTimelineStore.getState().setPlayheadTime(2.0)
    recordTransformField(clipId, 'x', 1000, true)

    expect(getLane(trackId, lane.id).points).toHaveLength(2)
  })
})

describe('recordTransformField — normalize/denormalize round-trip', () => {
  beforeEach(resetAll)

  it('a recorded x value round-trips through evaluateTransformOverrides to the dragged value', () => {
    const { trackId, clipId } = setupClip()
    const lane = addTransformLane(trackId, clipId, 'x')
    useAutomationStore.getState().setMode('latch')
    useAutomationStore.getState().armTrack(trackId)
    useTimelineStore.getState().setPlayheadTime(3)

    recordTransformField(clipId, 'x', 500, true) // within display range [-2000,2000]

    const updatedLane = getLane(trackId, lane.id)
    const overrides = evaluateTransformOverrides([updatedLane], 3)
    expect(overrides[clipId].x).toBeCloseTo(500, 6)
  })

  it('a recorded rotation value round-trips', () => {
    const { trackId, clipId } = setupClip()
    const lane = addTransformLane(trackId, clipId, 'rotation')
    useAutomationStore.getState().setMode('touch')
    useAutomationStore.getState().armTrack(trackId)
    useTimelineStore.getState().setPlayheadTime(1)

    recordTransformField(clipId, 'rotation', -90, true) // within display range [-360,360]

    const updatedLane = getLane(trackId, lane.id)
    const overrides = evaluateTransformOverrides([updatedLane], 1)
    expect(overrides[clipId].rotation).toBeCloseTo(-90, 6)
  })

  it('a recorded scaleX value round-trips', () => {
    const { trackId, clipId } = setupClip()
    const lane = addTransformLane(trackId, clipId, 'scaleX')
    useAutomationStore.getState().setMode('latch')
    useAutomationStore.getState().armTrack(trackId)
    useTimelineStore.getState().setPlayheadTime(0)

    recordTransformField(clipId, 'scaleX', 2.5, true) // within display range [0.01,10]

    const updatedLane = getLane(trackId, lane.id)
    const overrides = evaluateTransformOverrides([updatedLane], 0)
    expect(overrides[clipId].scaleX).toBeCloseTo(2.5, 6)
  })

  it('a value beyond the display range clamps at the boundary (documented, not a bug)', () => {
    const { trackId, clipId } = setupClip()
    const lane = addTransformLane(trackId, clipId, 'x')
    useAutomationStore.getState().setMode('latch')
    useAutomationStore.getState().armTrack(trackId)
    useTimelineStore.getState().setPlayheadTime(0)

    recordTransformField(clipId, 'x', 9000, true) // beyond displayMax (2000)

    const updatedLane = getLane(trackId, lane.id)
    const overrides = evaluateTransformOverrides([updatedLane], 0)
    expect(overrides[clipId].x).toBe(2000) // clamped to displayMax, not 9000
  })
})

describe('recordChangedTransformFields — gesture diffing', () => {
  beforeEach(resetAll)

  function armAllFieldLanes(trackId: string, clipId: string) {
    const fields = ['x', 'y', 'scaleX', 'scaleY', 'rotation'] as const
    const laneIds: Record<string, string> = {}
    for (const f of fields) {
      laneIds[f] = addTransformLane(trackId, clipId, f).id
    }
    useAutomationStore.getState().setMode('latch')
    useAutomationStore.getState().armTrack(trackId)
    useTimelineStore.getState().setPlayheadTime(1)
    return laneIds
  }

  function pointCounts(trackId: string, laneIds: Record<string, string>) {
    const out: Record<string, number> = {}
    for (const [field, id] of Object.entries(laneIds)) {
      out[field] = getLane(trackId, id).points.length
    }
    return out
  }

  it('move gesture (x/y change) records only x and y lanes', () => {
    const { trackId, clipId } = setupClip()
    const laneIds = armAllFieldLanes(trackId, clipId)
    const prev: ClipTransform = { ...IDENTITY_TRANSFORM }
    const next: ClipTransform = { ...IDENTITY_TRANSFORM, x: 100, y: -50 }

    recordChangedTransformFields(clipId, prev, next, true)

    expect(pointCounts(trackId, laneIds)).toEqual({ x: 1, y: 1, scaleX: 0, scaleY: 0, rotation: 0 })
  })

  it('scale gesture (scaleX/scaleY change) records only scale lanes', () => {
    const { trackId, clipId } = setupClip()
    const laneIds = armAllFieldLanes(trackId, clipId)
    const prev: ClipTransform = { ...IDENTITY_TRANSFORM }
    const next: ClipTransform = { ...IDENTITY_TRANSFORM, scaleX: 1.5, scaleY: 1.5 }

    recordChangedTransformFields(clipId, prev, next, true)

    expect(pointCounts(trackId, laneIds)).toEqual({ x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 })
  })

  it('rotate gesture (rotation changes) records only the rotation lane', () => {
    const { trackId, clipId } = setupClip()
    const laneIds = armAllFieldLanes(trackId, clipId)
    const prev: ClipTransform = { ...IDENTITY_TRANSFORM }
    const next: ClipTransform = { ...IDENTITY_TRANSFORM, rotation: 30 }

    recordChangedTransformFields(clipId, prev, next, true)

    expect(pointCounts(trackId, laneIds)).toEqual({ x: 0, y: 0, scaleX: 0, scaleY: 0, rotation: 1 })
  })

  it('no field changed (identical prev/next) records nothing', () => {
    const { trackId, clipId } = setupClip()
    const laneIds = armAllFieldLanes(trackId, clipId)
    const t: ClipTransform = { ...IDENTITY_TRANSFORM, x: 42 }

    recordChangedTransformFields(clipId, t, { ...t }, true)

    expect(pointCounts(trackId, laneIds)).toEqual({ x: 0, y: 0, scaleX: 0, scaleY: 0, rotation: 0 })
  })

  it('flipH/flipV/anchor changes are never recorded (not automatable fields)', () => {
    const { trackId, clipId } = setupClip()
    const laneIds = armAllFieldLanes(trackId, clipId)
    const prev: ClipTransform = { ...IDENTITY_TRANSFORM }
    const next: ClipTransform = { ...IDENTITY_TRANSFORM, flipH: true, flipV: true, anchorX: 10, anchorY: 10 }

    recordChangedTransformFields(clipId, prev, next, true)

    expect(pointCounts(trackId, laneIds)).toEqual({ x: 0, y: 0, scaleX: 0, scaleY: 0, rotation: 0 })
  })

  it('gesture diffing respects the isPlaying gate too — stopped transport records nothing', () => {
    const { trackId, clipId } = setupClip()
    const laneIds = armAllFieldLanes(trackId, clipId)
    const prev: ClipTransform = { ...IDENTITY_TRANSFORM }
    const next: ClipTransform = { ...IDENTITY_TRANSFORM, x: 100, rotation: 45 }

    recordChangedTransformFields(clipId, prev, next, false)

    expect(pointCounts(trackId, laneIds)).toEqual({ x: 0, y: 0, scaleX: 0, scaleY: 0, rotation: 0 })
  })
})
