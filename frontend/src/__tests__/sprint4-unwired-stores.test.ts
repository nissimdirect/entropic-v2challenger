/**
 * Sprint 4: Unwired Store Features — gap coverage tests.
 *
 * Tests store actions that ARE implemented but have missing test coverage
 * in the existing test files. Specifically covers:
 *   - setTrackOpacity: undo, valid mid-range, non-existent track guard
 *   - setTrackBlendMode: undo, all 9 valid modes, non-existent track guard
 *   - reorderOperators: out-of-bounds guards, same-index no-op
 *   - copyRegion/pasteAtPlayhead: undo for paste, empty clipboard guard, empty region copy
 *
 * Items already fully covered in existing test files (skipped here):
 *   - setClipTransform (timeline.test.ts — apply + undo)
 *   - addTriggerLane (trigger-lanes.test.ts — 10+ tests)
 *   - groupEffects / ungroupEffects (device-group.test.ts — 8 tests)
 *   - deactivateAB (ab-switch.test.ts — 2 tests)
 */
import { describe, it, expect, beforeEach } from 'vitest'

// Mock window.entropic before store imports
;(globalThis as any).window = {
  entropic: {
    onEngineStatus: () => {},
    sendCommand: async () => ({ ok: true }),
    selectFile: async () => null,
    selectSavePath: async () => null,
    onExportProgress: () => {},
  },
}

import { useTimelineStore } from '../renderer/stores/timeline'
import { useOperatorStore } from '../renderer/stores/operators'
import { useAutomationStore } from '../renderer/stores/automation'
import { useUndoStore } from '../renderer/stores/undo'
import { useProjectStore } from '../renderer/stores/project'
import { getTrackCompositing, type EffectInstance, type BlendMode } from '../shared/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetTimeline() {
  useTimelineStore.getState().reset()
  useUndoStore.getState().clear()
}

/** P2.2a: add a terminal composite to a track, returning its effect id. */
function addComposite(trackId: string, opacity = 1, mode: BlendMode = 'normal'): string {
  const composite: EffectInstance = {
    id: `composite-${trackId}`,
    effectId: 'composite',
    isEnabled: true,
    isFrozen: false,
    parameters: { opacity, mode },
    modulations: {},
    mix: 1,
    mask: null,
  }
  useProjectStore.getState().addEffect(trackId, composite)
  return composite.id
}

function compositingOf(trackId: string): { opacity: number; mode: BlendMode } {
  return getTrackCompositing(useTimelineStore.getState().tracks.find((t) => t.id === trackId)!.effectChain)
}

function resetOperators() {
  useOperatorStore.getState().resetOperators()
  useUndoStore.getState().clear()
}

function resetAutomation() {
  useAutomationStore.getState().resetAutomation()
  useUndoStore.getState().clear()
}

function addTestLane() {
  useAutomationStore.getState().addLane('track-1', 'fx-abc', 'amount', '#4ade80')
  const lanes = useAutomationStore.getState().lanes['track-1']
  return lanes[lanes.length - 1]
}

// ===========================================================================
// 1. Composite opacity — P2.2a: migrated from setTrackOpacity to terminal
//    CompositeEffect params (updateParam) + getTrackCompositing resolution.
// ===========================================================================

describe('composite opacity (gap coverage)', () => {
  beforeEach(resetTimeline)

  it('sets opacity to a valid mid-range value', () => {
    const id = useTimelineStore.getState().addTrack('V1', '#ff0000')!
    const cid = addComposite(id)
    useProjectStore.getState().updateParam(id, cid, 'opacity', 0.42)
    expect(compositingOf(id).opacity).toBe(0.42)
  })

  it('is undoable — restores previous opacity on undo', () => {
    const id = useTimelineStore.getState().addTrack('V1', '#ff0000')!
    const cid = addComposite(id)
    expect(compositingOf(id).opacity).toBe(1)

    useUndoStore.getState().clear()
    useProjectStore.getState().updateParam(id, cid, 'opacity', 0.25)
    expect(compositingOf(id).opacity).toBe(0.25)

    useUndoStore.getState().undo()
    expect(compositingOf(id).opacity).toBe(1)
  })

  it('is redoable — re-applies opacity after undo+redo', () => {
    const id = useTimelineStore.getState().addTrack('V1', '#ff0000')!
    const cid = addComposite(id)

    useUndoStore.getState().clear()
    useProjectStore.getState().updateParam(id, cid, 'opacity', 0.6)
    useUndoStore.getState().undo()
    useUndoStore.getState().redo()
    expect(compositingOf(id).opacity).toBe(0.6)
  })

  it('no-ops for non-existent track ID', () => {
    const id = useTimelineStore.getState().addTrack('V1', '#ff0000')!
    addComposite(id)
    const before = compositingOf(id).opacity
    useProjectStore.getState().updateParam('non-existent', 'whatever', 'opacity', 0.5)
    expect(compositingOf(id).opacity).toBe(before)
  })

  it('getTrackCompositing clamps a non-finite stored opacity to a finite default', () => {
    const id = useTimelineStore.getState().addTrack('V1', '#ff0000')!
    const cid = addComposite(id)
    // updateParam drops NaN at its own boundary; force a non-finite stored value
    // directly to assert the read-side clamp keeps the resolved opacity finite.
    useTimelineStore.getState().updateTrackEffectChain(id, (chain) =>
      chain.map((e) => (e.id === cid ? { ...e, parameters: { ...e.parameters, opacity: NaN } } : e)),
    )
    const opacity = compositingOf(id).opacity
    expect(Number.isFinite(opacity)).toBe(true)
    expect(opacity).toBe(1)
  })
})

// ===========================================================================
// 2. Composite blend mode — P2.2a: migrated from setTrackBlendMode to terminal
//    CompositeEffect params (updateParam) + getTrackCompositing resolution.
// ===========================================================================

describe('composite blend mode (gap coverage)', () => {
  beforeEach(resetTimeline)

  it('is undoable — restores previous blend mode on undo', () => {
    const id = useTimelineStore.getState().addTrack('V1', '#ff0000')!
    const cid = addComposite(id)
    expect(compositingOf(id).mode).toBe('normal')

    useUndoStore.getState().clear()
    useProjectStore.getState().updateParam(id, cid, 'mode', 'screen')
    expect(compositingOf(id).mode).toBe('screen')

    useUndoStore.getState().undo()
    expect(compositingOf(id).mode).toBe('normal')
  })

  it('is redoable', () => {
    const id = useTimelineStore.getState().addTrack('V1', '#ff0000')!
    const cid = addComposite(id)

    useUndoStore.getState().clear()
    useProjectStore.getState().updateParam(id, cid, 'mode', 'overlay')
    useUndoStore.getState().undo()
    useUndoStore.getState().redo()
    expect(compositingOf(id).mode).toBe('overlay')
  })

  it.each([
    'normal', 'add', 'multiply', 'screen', 'overlay',
    'difference', 'exclusion', 'darken', 'lighten',
  ] as const)('accepts blend mode "%s"', (mode) => {
    const id = useTimelineStore.getState().addTrack('V1', '#ff0000')!
    const cid = addComposite(id)
    useProjectStore.getState().updateParam(id, cid, 'mode', mode)
    expect(compositingOf(id).mode).toBe(mode)
  })

  it('no-ops for non-existent track ID', () => {
    const id = useTimelineStore.getState().addTrack('V1', '#ff0000')!
    addComposite(id)
    useProjectStore.getState().updateParam('non-existent', 'whatever', 'mode', 'multiply')
    expect(compositingOf(id).mode).toBe('normal')
  })
})

// ===========================================================================
// 3. reorderOperators — gap: out-of-bounds, same-index no-op
// ===========================================================================

describe('reorderOperators (gap coverage)', () => {
  beforeEach(resetOperators)

  it('no-ops when fromIndex is negative', () => {
    useOperatorStore.getState().addOperator('lfo')
    useOperatorStore.getState().addOperator('envelope')
    const idsBefore = useOperatorStore.getState().operators.map((o) => o.id)

    useUndoStore.getState().clear()
    useOperatorStore.getState().reorderOperators(-1, 1)

    const idsAfter = useOperatorStore.getState().operators.map((o) => o.id)
    expect(idsAfter).toEqual(idsBefore)
    // Should NOT create an undo entry
    expect(useUndoStore.getState().past).toHaveLength(0)
  })

  it('no-ops when toIndex exceeds array length', () => {
    useOperatorStore.getState().addOperator('lfo')
    useOperatorStore.getState().addOperator('envelope')
    const idsBefore = useOperatorStore.getState().operators.map((o) => o.id)

    useUndoStore.getState().clear()
    useOperatorStore.getState().reorderOperators(0, 10)

    const idsAfter = useOperatorStore.getState().operators.map((o) => o.id)
    expect(idsAfter).toEqual(idsBefore)
    expect(useUndoStore.getState().past).toHaveLength(0)
  })

  it('no-ops when fromIndex === toIndex', () => {
    useOperatorStore.getState().addOperator('lfo')
    useOperatorStore.getState().addOperator('envelope')
    const idsBefore = useOperatorStore.getState().operators.map((o) => o.id)

    useUndoStore.getState().clear()
    useOperatorStore.getState().reorderOperators(1, 1)

    const idsAfter = useOperatorStore.getState().operators.map((o) => o.id)
    expect(idsAfter).toEqual(idsBefore)
    expect(useUndoStore.getState().past).toHaveLength(0)
  })

  it('reorder is undoable — restores original order', () => {
    useOperatorStore.getState().addOperator('lfo')
    useOperatorStore.getState().addOperator('envelope')
    useOperatorStore.getState().addOperator('step_sequencer')
    const originalIds = useOperatorStore.getState().operators.map((o) => o.id)

    useUndoStore.getState().clear()
    useOperatorStore.getState().reorderOperators(0, 2) // move first to last
    const reorderedIds = useOperatorStore.getState().operators.map((o) => o.id)
    expect(reorderedIds).not.toEqual(originalIds)

    useUndoStore.getState().undo()
    const restoredIds = useOperatorStore.getState().operators.map((o) => o.id)
    expect(restoredIds).toEqual(originalIds)
  })

  it('no-ops on empty operator list', () => {
    useUndoStore.getState().clear()
    useOperatorStore.getState().reorderOperators(0, 1)
    expect(useOperatorStore.getState().operators).toHaveLength(0)
    expect(useUndoStore.getState().past).toHaveLength(0)
  })
})

// ===========================================================================
// 4. copyRegion / pasteAtPlayhead — gap: undo, empty clipboard, empty region
// ===========================================================================

describe('automation copyRegion / pasteAtPlayhead (gap coverage)', () => {
  beforeEach(resetAutomation)

  it('pasteAtPlayhead is undoable', () => {
    const lane = addTestLane()
    useAutomationStore.getState().addPoint('track-1', lane.id, 1.0, 0.3)
    useAutomationStore.getState().addPoint('track-1', lane.id, 2.0, 0.7)

    // Copy the two points
    useAutomationStore.getState().copyRegion('track-1', lane.id, 1.0, 2.0)
    expect(useAutomationStore.getState().clipboard).not.toBeNull()

    useUndoStore.getState().clear()

    // Paste at time 5.0
    useAutomationStore.getState().pasteAtPlayhead('track-1', lane.id, 5.0)
    const pointsAfterPaste = useAutomationStore.getState().lanes['track-1']
      .find((l) => l.id === lane.id)!.points
    expect(pointsAfterPaste.length).toBeGreaterThan(2)

    // Undo should restore original 2 points
    useUndoStore.getState().undo()
    const pointsAfterUndo = useAutomationStore.getState().lanes['track-1']
      .find((l) => l.id === lane.id)!.points
    expect(pointsAfterUndo).toHaveLength(2)
  })

  it('pasteAtPlayhead no-ops when clipboard is empty', () => {
    const lane = addTestLane()
    useAutomationStore.getState().addPoint('track-1', lane.id, 1.0, 0.5)
    expect(useAutomationStore.getState().clipboard).toBeNull()

    useUndoStore.getState().clear()
    useAutomationStore.getState().pasteAtPlayhead('track-1', lane.id, 5.0)

    // No undo entry created
    expect(useUndoStore.getState().past).toHaveLength(0)
    // Points unchanged
    const points = useAutomationStore.getState().lanes['track-1']
      .find((l) => l.id === lane.id)!.points
    expect(points).toHaveLength(1)
  })

  it('copyRegion with no points in range sets empty clipboard', () => {
    const lane = addTestLane()
    useAutomationStore.getState().addPoint('track-1', lane.id, 1.0, 0.5)

    // Copy a region that has no points
    useAutomationStore.getState().copyRegion('track-1', lane.id, 5.0, 10.0)
    expect(useAutomationStore.getState().clipboard).not.toBeNull()
    expect(useAutomationStore.getState().clipboard!.points).toHaveLength(0)
  })

  it('paste with empty-point clipboard is no-op', () => {
    const lane = addTestLane()
    useAutomationStore.getState().addPoint('track-1', lane.id, 1.0, 0.5)

    // Copy empty region
    useAutomationStore.getState().copyRegion('track-1', lane.id, 5.0, 10.0)

    useUndoStore.getState().clear()
    useAutomationStore.getState().pasteAtPlayhead('track-1', lane.id, 3.0)

    // clipboard.points.length === 0, so pasteAtPlayhead should early-return
    expect(useUndoStore.getState().past).toHaveLength(0)
  })

  it('copyRegion on non-existent lane is no-op', () => {
    useAutomationStore.getState().copyRegion('track-1', 'non-existent', 0, 5)
    expect(useAutomationStore.getState().clipboard).toBeNull()
  })

  it('pasteAtPlayhead on non-existent lane is no-op', () => {
    // Set clipboard manually to test lane guard
    const lane = addTestLane()
    useAutomationStore.getState().addPoint('track-1', lane.id, 1.0, 0.5)
    useAutomationStore.getState().copyRegion('track-1', lane.id, 0, 5)

    useUndoStore.getState().clear()
    useAutomationStore.getState().pasteAtPlayhead('track-1', 'non-existent', 3.0)
    expect(useUndoStore.getState().past).toHaveLength(0)
  })
})
