/**
 * A/B Switch store tests (Phase 14A).
 * Mechanically migrated to per-track chain API (Epic 01).
 * TODO(Epic02): use active track.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useProjectStore } from '../../renderer/stores/project'
import { useTimelineStore } from '../../renderer/stores/timeline'
import { useUndoStore } from '../../renderer/stores/undo'
import type { EffectInstance } from '../../shared/types'

const MOCK: EffectInstance = {
  id: 'fx-1',
  effectId: 'pixelsort',
  isEnabled: true,
  isFrozen: false,
  parameters: { threshold: 0.5, direction: 90 },
  modulations: {},
  mix: 1,
  mask: null,
}

// TODO(Epic02): use active track — mechanical migration for Epic 01 compatibility.
let V1_TRACK_ID: string

function getV1Chain(): EffectInstance[] {
  return useTimelineStore.getState().tracks.find((t) => t.id === V1_TRACK_ID)?.effectChain ?? []
}

function reset() {
  useTimelineStore.getState().reset()
  useProjectStore.setState({
    effectChain: [],
    selectedEffectId: null,
    assets: {},
    currentFrame: 0,
    totalFrames: 0,
    isIngesting: false,
    ingestError: null,
    projectPath: null,
    projectName: 'Test',
  })
  useUndoStore.getState().clear()
  // Create V1 track and seed its effectChain with MOCK
  V1_TRACK_ID = useTimelineStore.getState().addTrack('V1', '#ff0000')!
  useTimelineStore.getState().updateTrackEffectChain(V1_TRACK_ID, () => [{ ...MOCK, parameters: { ...MOCK.parameters } }])
  useUndoStore.getState().clear()
}

describe('A/B Switch', () => {
  beforeEach(reset)

  it('activateAB creates abState with current params as A and B', () => {
    useProjectStore.getState().activateAB(V1_TRACK_ID, 'fx-1')
    const fx = getV1Chain()[0]
    expect(fx.abState).toBeDefined()
    expect(fx.abState!.active).toBe('a')
    expect(fx.abState!.a).toEqual({ threshold: 0.5, direction: 90 })
    expect(fx.abState!.b).toEqual({ threshold: 0.5, direction: 90 })
  })

  it('toggleAB swaps between A and B params', () => {
    useProjectStore.getState().activateAB(V1_TRACK_ID, 'fx-1')
    // Modify params (now editing A)
    useProjectStore.getState().updateParam(V1_TRACK_ID, 'fx-1', 'threshold', 0.8)

    // Toggle to B — should load B's original values
    useProjectStore.getState().toggleAB(V1_TRACK_ID, 'fx-1')
    const fxB = getV1Chain()[0]
    expect(fxB.abState!.active).toBe('b')
    expect(fxB.parameters.threshold).toBe(0.5) // B has original

    // Toggle back to A — should restore modified A
    useProjectStore.getState().toggleAB(V1_TRACK_ID, 'fx-1')
    const fxA = getV1Chain()[0]
    expect(fxA.abState!.active).toBe('a')
    expect(fxA.parameters.threshold).toBe(0.8) // A was modified
  })

  it('copyToInactiveAB copies current to inactive slot', () => {
    useProjectStore.getState().activateAB(V1_TRACK_ID, 'fx-1')
    useProjectStore.getState().updateParam(V1_TRACK_ID, 'fx-1', 'threshold', 0.9)
    // Currently on A with threshold=0.9, B still has 0.5
    useProjectStore.getState().copyToInactiveAB(V1_TRACK_ID, 'fx-1')
    const fx = getV1Chain()[0]
    // B should now have A's current values
    expect(fx.abState!.b.threshold).toBe(0.9)
  })

  it('deactivateAB removes abState', () => {
    useProjectStore.getState().activateAB(V1_TRACK_ID, 'fx-1')
    expect(getV1Chain()[0].abState).toBeDefined()
    useProjectStore.getState().deactivateAB(V1_TRACK_ID, 'fx-1')
    expect(getV1Chain()[0].abState).toBeNull()
  })

  it('A/B operations do not create undo entries', () => {
    const undoBefore = useUndoStore.getState().past.length
    useProjectStore.getState().activateAB(V1_TRACK_ID, 'fx-1')
    useProjectStore.getState().toggleAB(V1_TRACK_ID, 'fx-1')
    useProjectStore.getState().copyToInactiveAB(V1_TRACK_ID, 'fx-1')
    useProjectStore.getState().deactivateAB(V1_TRACK_ID, 'fx-1')
    expect(useUndoStore.getState().past.length).toBe(undoBefore)
  })

  it('activateAB is idempotent', () => {
    useProjectStore.getState().activateAB(V1_TRACK_ID, 'fx-1')
    useProjectStore.getState().updateParam(V1_TRACK_ID, 'fx-1', 'threshold', 0.7)
    useProjectStore.getState().activateAB(V1_TRACK_ID, 'fx-1')
    // Should NOT reset — A should still have modified value
    const fx = getV1Chain()[0]
    expect(fx.parameters.threshold).toBe(0.7)
  })

  it('toggleAB on non-existent effect is no-op', () => {
    useProjectStore.getState().toggleAB(V1_TRACK_ID, 'fx-999')
    // Should not throw
    expect(getV1Chain()[0].abState).toBeUndefined()
  })
})
