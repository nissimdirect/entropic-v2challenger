/**
 * Cross-store integration tests — verifies multi-store operations
 * don't leave orphan state, and undo/redo restores everything.
 *
 * These test the 7 bug patterns from the ship gate audit:
 * 1. Trust boundary blindness
 * 2. Derived state drift
 * 3. Closures over mutable indices
 * 4. Asymmetric cleanup (orphan problem)
 * 5. Zero/Empty/NaN trinity
 * 6. React lifecycle leaks (n/a — component level)
 * 7. Non-atomic file operations (n/a — file level)
 *
 * WHY THESE ARE NOT E2E: All store logic, no Electron needed.
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

import { useProjectStore } from '../../renderer/stores/project'
import { useUndoStore } from '../../renderer/stores/undo'
import { useOperatorStore } from '../../renderer/stores/operators'
import { useAutomationStore } from '../../renderer/stores/automation'
import { useMIDIStore } from '../../renderer/stores/midi'
import { useTimelineStore } from '../../renderer/stores/timeline'
import { useToastStore } from '../../renderer/stores/toast'
import type { EffectInstance } from '../../shared/types'

// --- Helpers ---

let effectCounter = 0
function makeEffect(overrides: Partial<EffectInstance> = {}): EffectInstance {
  effectCounter++
  return {
    id: overrides.id ?? `fx-${effectCounter}`,
    effectId: overrides.effectId ?? 'fx.invert',
    isEnabled: overrides.isEnabled ?? true,
    isFrozen: overrides.isFrozen ?? false,
    parameters: overrides.parameters ?? {},
    modulations: overrides.modulations ?? {},
    mix: overrides.mix ?? 1.0,
    mask: overrides.mask ?? null,
  }
}

function resetAllStores() {
  useUndoStore.getState().clear()
  useProjectStore.getState().resetProject()
  useTimelineStore.getState().reset()
  // Reset operator store
  useOperatorStore.setState({ operators: [] })
  // Reset automation lanes
  useAutomationStore.setState({ lanes: {} })
  // Reset MIDI mappings
  useMIDIStore.setState({ ccMappings: [] })
  // Reset toast
  useToastStore.getState().clearAll?.() ?? useToastStore.setState({ toasts: [] })
}

// --- Tests ---

describe('Cross-Store Integration: Effect Deletion Cleanup', () => {
  beforeEach(() => {
    effectCounter = 0
    resetAllStores()
  })

  it('removeEffect cleans up operator mappings targeting deleted effect', () => {
    const fx = makeEffect({ id: 'fx-target' })
    useProjectStore.getState().addEffect(fx)

    // Add operator with mapping to this effect
    useOperatorStore.setState({
      operators: [
        {
          id: 'op-1',
          type: 'lfo',
          label: 'LFO',
          isEnabled: true,
          parameters: { waveform: 'sine', rate_hz: 1.0, phase_offset: 0.0 },
          processing: [],
          mappings: [
            { targetEffectId: 'fx-target', targetParamKey: 'amount', depth: 1, min: 0, max: 1, curve: 'linear' },
            { targetEffectId: 'fx-other', targetParamKey: 'amount', depth: 1, min: 0, max: 1, curve: 'linear' },
          ],
        },
      ],
    })

    // Delete the effect
    useProjectStore.getState().removeEffect('fx-target')

    // Operator should still exist but mapping to deleted effect should be gone
    const ops = useOperatorStore.getState().operators
    expect(ops).toHaveLength(1)
    expect(ops[0].mappings).toHaveLength(1)
    expect(ops[0].mappings[0].targetEffectId).toBe('fx-other')
  })

  it('removeEffect cleans up automation lanes targeting deleted effect', () => {
    const fx = makeEffect({ id: 'fx-auto' })
    useProjectStore.getState().addEffect(fx)

    // Add automation lanes for this effect
    useAutomationStore.setState({
      lanes: {
        'track-1': [
          { id: 'lane-1', paramPath: 'fx-auto.amount', color: '#ff0000', isVisible: true, points: [], isTrigger: false },
          { id: 'lane-2', paramPath: 'fx-other.amount', color: '#00ff00', isVisible: true, points: [], isTrigger: false },
        ],
      },
    })

    useProjectStore.getState().removeEffect('fx-auto')

    const lanes = useAutomationStore.getState().lanes
    expect(lanes['track-1']).toHaveLength(1)
    expect(lanes['track-1'][0].paramPath).toBe('fx-other.amount')
  })

  it('removeEffect cleans up CC mappings targeting deleted effect', () => {
    const fx = makeEffect({ id: 'fx-midi' })
    useProjectStore.getState().addEffect(fx)

    // Add CC mappings
    useMIDIStore.setState({
      ccMappings: [
        { cc: 1, effectId: 'fx-midi', paramKey: 'amount' },
        { cc: 2, effectId: 'fx-keep', paramKey: 'amount' },
      ],
    })

    useProjectStore.getState().removeEffect('fx-midi')

    const mappings = useMIDIStore.getState().ccMappings
    expect(mappings).toHaveLength(1)
    expect(mappings[0].effectId).toBe('fx-keep')
  })

  it('removeEffect + undo restores ALL cross-store state', () => {
    const fx = makeEffect({ id: 'fx-undo' })
    useProjectStore.getState().addEffect(fx)

    // Set up cross-store state
    useOperatorStore.setState({
      operators: [{
        id: 'op-1',
        type: 'lfo',
        label: 'LFO',
        isEnabled: true,
        parameters: {},
        processing: [],
        mappings: [{ targetEffectId: 'fx-undo', targetParamKey: 'amount', depth: 1, min: 0, max: 1, curve: 'linear' }],
      }],
    })
    useAutomationStore.setState({
      lanes: {
        'track-1': [
          { id: 'lane-1', paramPath: 'fx-undo.amount', color: '#ff0000', isVisible: true, points: [], isTrigger: false },
        ],
      },
    })
    useMIDIStore.setState({
      ccMappings: [{ cc: 1, effectId: 'fx-undo', paramKey: 'amount' }],
    })

    // Delete
    useProjectStore.getState().removeEffect('fx-undo')

    // Verify cleanup happened
    expect(useProjectStore.getState().effectChain).toHaveLength(0)
    expect(useOperatorStore.getState().operators[0].mappings).toHaveLength(0)
    expect(useAutomationStore.getState().lanes['track-1']).toBeUndefined()
    expect(useMIDIStore.getState().ccMappings).toHaveLength(0)

    // Undo
    useUndoStore.getState().undo()

    // Everything should be restored
    expect(useProjectStore.getState().effectChain).toHaveLength(1)
    expect(useProjectStore.getState().effectChain[0].id).toBe('fx-undo')
    expect(useOperatorStore.getState().operators[0].mappings).toHaveLength(1)
    expect(useOperatorStore.getState().operators[0].mappings[0].targetEffectId).toBe('fx-undo')
    expect(useAutomationStore.getState().lanes['track-1']).toHaveLength(1)
    expect(useMIDIStore.getState().ccMappings).toHaveLength(1)
  })

  it('removeEffect + undo + redo cycle is clean', () => {
    const fx = makeEffect({ id: 'fx-cycle' })
    useProjectStore.getState().addEffect(fx)

    useOperatorStore.setState({
      operators: [{
        id: 'op-1', type: 'lfo', label: 'LFO', isEnabled: true,
        parameters: {}, processing: [],
        mappings: [{ targetEffectId: 'fx-cycle', targetParamKey: 'amount', depth: 1, min: 0, max: 1, curve: 'linear' }],
      }],
    })

    // Delete → undo → redo → undo (full cycle)
    useProjectStore.getState().removeEffect('fx-cycle')
    expect(useProjectStore.getState().effectChain).toHaveLength(0)

    useUndoStore.getState().undo()
    expect(useProjectStore.getState().effectChain).toHaveLength(1)
    expect(useOperatorStore.getState().operators[0].mappings).toHaveLength(1)

    useUndoStore.getState().redo()
    expect(useProjectStore.getState().effectChain).toHaveLength(0)
    expect(useOperatorStore.getState().operators[0].mappings).toHaveLength(0)

    useUndoStore.getState().undo()
    expect(useProjectStore.getState().effectChain).toHaveLength(1)
    expect(useOperatorStore.getState().operators[0].mappings).toHaveLength(1)
  })
})

describe('Cross-Store Integration: Undo Uses IDs Not Indices', () => {
  beforeEach(() => {
    effectCounter = 0
    resetAllStores()
  })

  it('reorderEffect undo restores correct order by ID', () => {
    const fx1 = makeEffect({ id: 'fx-a' })
    const fx2 = makeEffect({ id: 'fx-b' })
    const fx3 = makeEffect({ id: 'fx-c' })
    useProjectStore.getState().addEffect(fx1)
    useProjectStore.getState().addEffect(fx2)
    useProjectStore.getState().addEffect(fx3)

    // Clear undo stack from addEffect calls
    useUndoStore.getState().clear()

    // Reorder: move fx-a (index 0) to index 2
    useProjectStore.getState().reorderEffect(0, 2)
    expect(useProjectStore.getState().effectChain.map((e) => e.id)).toEqual(['fx-b', 'fx-c', 'fx-a'])

    // Undo should restore original order
    useUndoStore.getState().undo()
    expect(useProjectStore.getState().effectChain.map((e) => e.id)).toEqual(['fx-a', 'fx-b', 'fx-c'])
  })

  it('removeEffect preserves insertion position on undo', () => {
    const fx1 = makeEffect({ id: 'fx-first' })
    const fx2 = makeEffect({ id: 'fx-middle' })
    const fx3 = makeEffect({ id: 'fx-last' })
    useProjectStore.getState().addEffect(fx1)
    useProjectStore.getState().addEffect(fx2)
    useProjectStore.getState().addEffect(fx3)
    useUndoStore.getState().clear()

    // Remove middle effect
    useProjectStore.getState().removeEffect('fx-middle')
    expect(useProjectStore.getState().effectChain.map((e) => e.id)).toEqual(['fx-first', 'fx-last'])

    // Undo — should restore to correct position (after fx-first)
    useUndoStore.getState().undo()
    expect(useProjectStore.getState().effectChain.map((e) => e.id)).toEqual(['fx-first', 'fx-middle', 'fx-last'])
  })
})

describe('Cross-Store Integration: Derived State Recalculation', () => {
  beforeEach(() => {
    effectCounter = 0
    resetAllStores()
  })

  it('splitClip recalculates timeline duration', () => {
    useTimelineStore.getState().addTrack('Track 1', '#ff0000')
    const trackId = useTimelineStore.getState().tracks[0].id
    useUndoStore.getState().clear()

    const clip = {
      id: 'clip-1',
      assetId: 'asset-1',
      trackId,
      position: 0,
      duration: 10,
      inPoint: 0,
      outPoint: 10,
      speed: 1.0,
    }
    useTimelineStore.getState().addClip(trackId, clip)
    expect(useTimelineStore.getState().duration).toBe(10)

    // Split at t=5
    useTimelineStore.getState().splitClip('clip-1', 5)

    // Duration should still be 10 (two clips: 0-5 and 5-10)
    expect(useTimelineStore.getState().duration).toBe(10)

    // Should have 2 clips now
    const clips = useTimelineStore.getState().tracks[0].clips
    expect(clips).toHaveLength(2)
  })

  it('removeTrack recalculates duration', () => {
    useTimelineStore.getState().addTrack('Track 1', '#ff0000')
    useTimelineStore.getState().addTrack('Track 2', '#00ff00')
    const tracks = useTimelineStore.getState().tracks
    useUndoStore.getState().clear()

    // Add clip to track 2
    const clip = {
      id: 'clip-1', assetId: 'asset-1', trackId: tracks[1].id,
      position: 0, duration: 20, inPoint: 0, outPoint: 20, speed: 1.0,
    }
    useTimelineStore.getState().addClip(tracks[1].id, clip)
    expect(useTimelineStore.getState().duration).toBe(20)

    // Remove track 2 — duration should drop to 0
    useTimelineStore.getState().removeTrack(tracks[1].id)
    expect(useTimelineStore.getState().duration).toBe(0)
  })

  it('deleteSelectedClips recalculates duration', () => {
    useTimelineStore.getState().addTrack('Track 1', '#ff0000')
    const trackId = useTimelineStore.getState().tracks[0].id
    useUndoStore.getState().clear()

    const clip1 = {
      id: 'clip-a', assetId: 'a', trackId, position: 0, duration: 5,
      inPoint: 0, outPoint: 5, speed: 1.0,
    }
    const clip2 = {
      id: 'clip-b', assetId: 'b', trackId, position: 5, duration: 15,
      inPoint: 0, outPoint: 15, speed: 1.0,
    }
    useTimelineStore.getState().addClip(trackId, clip1)
    useTimelineStore.getState().addClip(trackId, clip2)
    expect(useTimelineStore.getState().duration).toBe(20)

    // Select and delete clip-b
    useTimelineStore.getState().selectClip('clip-b')
    useTimelineStore.getState().deleteSelectedClips()
    expect(useTimelineStore.getState().duration).toBe(5)
  })
})

describe('Cross-Store Integration: Rapid Operations', () => {
  beforeEach(() => {
    effectCounter = 0
    resetAllStores()
  })

  it('rapid add/remove/undo does not corrupt state', () => {
    // Add 5 effects rapidly
    for (let i = 0; i < 5; i++) {
      useProjectStore.getState().addEffect(makeEffect({ id: `fx-rapid-${i}` }))
    }
    expect(useProjectStore.getState().effectChain).toHaveLength(5)

    // Remove effects 2 and 4
    useProjectStore.getState().removeEffect('fx-rapid-2')
    useProjectStore.getState().removeEffect('fx-rapid-4')
    expect(useProjectStore.getState().effectChain).toHaveLength(3)

    // Undo twice — should restore both
    useUndoStore.getState().undo()
    useUndoStore.getState().undo()
    expect(useProjectStore.getState().effectChain).toHaveLength(5)

    // Verify all IDs are correct and in order
    const ids = useProjectStore.getState().effectChain.map((e) => e.id)
    expect(ids).toEqual(['fx-rapid-0', 'fx-rapid-1', 'fx-rapid-2', 'fx-rapid-3', 'fx-rapid-4'])
  })

  it('selectedEffectId cleared when selected effect is removed', () => {
    const fx = makeEffect({ id: 'fx-select' })
    useProjectStore.getState().addEffect(fx)
    useProjectStore.getState().selectEffect('fx-select')
    expect(useProjectStore.getState().selectedEffectId).toBe('fx-select')

    useProjectStore.getState().removeEffect('fx-select')
    expect(useProjectStore.getState().selectedEffectId).toBeNull()
  })

  it('effect chain limit prevents overflow', () => {
    // Get the limit from the store behavior
    const LIMIT = 10 // LIMITS.MAX_EFFECTS_PER_CHAIN

    for (let i = 0; i < LIMIT + 2; i++) {
      useProjectStore.getState().addEffect(makeEffect({ id: `fx-limit-${i}` }))
    }

    // Should be capped at limit
    expect(useProjectStore.getState().effectChain.length).toBeLessThanOrEqual(LIMIT)
  })
})

describe('Cross-Store Integration: Timeline Track + Clip Undo', () => {
  beforeEach(() => {
    effectCounter = 0
    resetAllStores()
  })

  it('removeTrack + undo restores track with all clips', () => {
    useTimelineStore.getState().addTrack('Track 1', '#ff0000')
    const trackId = useTimelineStore.getState().tracks[0].id

    const clip = {
      id: 'clip-restore', assetId: 'a', trackId, position: 0, duration: 10,
      inPoint: 0, outPoint: 10, speed: 1.0,
    }
    useTimelineStore.getState().addClip(trackId, clip)
    useUndoStore.getState().clear()

    // Remove track
    useTimelineStore.getState().removeTrack(trackId)
    expect(useTimelineStore.getState().tracks).toHaveLength(0)

    // Undo
    useUndoStore.getState().undo()
    expect(useTimelineStore.getState().tracks).toHaveLength(1)
    expect(useTimelineStore.getState().tracks[0].clips).toHaveLength(1)
    expect(useTimelineStore.getState().tracks[0].clips[0].id).toBe('clip-restore')
  })

  it('deleteSelectedClips + undo restores all clips to correct tracks', () => {
    useTimelineStore.getState().addTrack('Track 1', '#ff0000')
    useTimelineStore.getState().addTrack('Track 2', '#00ff00')
    const tracks = useTimelineStore.getState().tracks

    const clip1 = {
      id: 'c1', assetId: 'a', trackId: tracks[0].id, position: 0, duration: 5,
      inPoint: 0, outPoint: 5, speed: 1.0,
    }
    const clip2 = {
      id: 'c2', assetId: 'b', trackId: tracks[1].id, position: 0, duration: 5,
      inPoint: 0, outPoint: 5, speed: 1.0,
    }
    useTimelineStore.getState().addClip(tracks[0].id, clip1)
    useTimelineStore.getState().addClip(tracks[1].id, clip2)
    useUndoStore.getState().clear()

    // Select both clips
    useTimelineStore.setState({ selectedClipIds: ['c1', 'c2'], selectedClipId: 'c1' })

    // Delete
    useTimelineStore.getState().deleteSelectedClips()
    expect(useTimelineStore.getState().tracks[0].clips).toHaveLength(0)
    expect(useTimelineStore.getState().tracks[1].clips).toHaveLength(0)

    // Undo
    useUndoStore.getState().undo()
    expect(useTimelineStore.getState().tracks[0].clips).toHaveLength(1)
    expect(useTimelineStore.getState().tracks[1].clips).toHaveLength(1)
    expect(useTimelineStore.getState().tracks[0].clips[0].id).toBe('c1')
    expect(useTimelineStore.getState().tracks[1].clips[0].id).toBe('c2')
  })
})
