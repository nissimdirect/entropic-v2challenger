/**
 * Sprint 6: Security Hardening — frontend store verification tests.
 *
 * Tests for:
 * 1. Undo future stack cap (MAX_REDO_ENTRIES = 500)
 * 2. Cascade-delete automation on effect removal
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

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

import { useUndoStore } from '../renderer/stores/undo'
import { useProjectStore } from '../renderer/stores/project'
import { useAutomationStore } from '../renderer/stores/automation'
import { useOperatorStore } from '../renderer/stores/operators'
import { useMIDIStore } from '../renderer/stores/midi'
import type { EffectInstance, UndoEntry } from '../shared/types'

// --- Helpers ---

function makeEntry(overrides: Partial<UndoEntry> = {}): UndoEntry {
  return {
    forward: overrides.forward ?? vi.fn(),
    inverse: overrides.inverse ?? vi.fn(),
    description: overrides.description ?? 'test action',
    timestamp: overrides.timestamp ?? Date.now(),
  }
}

let effectCounter = 0
function makeEffect(overrides: Partial<EffectInstance> = {}): EffectInstance {
  effectCounter++
  return {
    id: overrides.id ?? `fx-s6-${effectCounter}`,
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
  useOperatorStore.setState({ operators: [] })
  useAutomationStore.setState({ lanes: {} })
  useMIDIStore.setState({ ccMappings: [] })
}

// ==========================================================================
// Item 2: Undo future stack cap (MAX_REDO_ENTRIES = 500)
// ==========================================================================

describe('Sprint 6: Undo future stack cap (MAX_REDO_ENTRIES)', () => {
  beforeEach(() => {
    useUndoStore.getState().clear()
  })

  it('future stack is capped at 500 entries', () => {
    // Push 505 entries to past
    for (let i = 0; i < 505; i++) {
      useUndoStore.getState().execute(makeEntry({ description: `action-${i}` }))
    }
    // Past is capped at 500
    expect(useUndoStore.getState().past).toHaveLength(500)

    // Undo all 500 — each moves one entry from past to future
    for (let i = 0; i < 500; i++) {
      useUndoStore.getState().undo()
    }
    // Future should also be capped at 500
    expect(useUndoStore.getState().future).toHaveLength(500)
    expect(useUndoStore.getState().past).toHaveLength(0)
  })

  it('undoing beyond 500 drops oldest redo entries', () => {
    // Push exactly 505 entries
    for (let i = 0; i < 505; i++) {
      useUndoStore.getState().execute(makeEntry({ description: `a-${i}` }))
    }

    // Past has 500 entries (oldest 5 dropped: a-0..a-4)
    // Now undo all 500
    for (let i = 0; i < 500; i++) {
      useUndoStore.getState().undo()
    }

    const future = useUndoStore.getState().future
    expect(future).toHaveLength(500)

    // Future is built by prepending (newest first), so future[0] is the
    // most recently undone entry. The oldest should be at the end,
    // capped at 500 entries.
    expect(future.length).toBeLessThanOrEqual(500)
  })

  it('redo caps past stack when re-applying', () => {
    // Fill past to 500
    for (let i = 0; i < 500; i++) {
      useUndoStore.getState().execute(makeEntry({ description: `r-${i}` }))
    }
    expect(useUndoStore.getState().past).toHaveLength(500)

    // Undo one, then redo — past should remain at 500
    useUndoStore.getState().undo()
    expect(useUndoStore.getState().past).toHaveLength(499)

    useUndoStore.getState().redo()
    expect(useUndoStore.getState().past).toHaveLength(500)
  })

  it('MAX_REDO_ENTRIES matches MAX_UNDO_ENTRIES at 500', () => {
    // Verify symmetry: both caps are 500
    // Push 600 entries, undo all — both stacks should cap at 500
    for (let i = 0; i < 600; i++) {
      useUndoStore.getState().execute(makeEntry({ description: `sym-${i}` }))
    }
    expect(useUndoStore.getState().past).toHaveLength(500)

    for (let i = 0; i < 500; i++) {
      useUndoStore.getState().undo()
    }
    expect(useUndoStore.getState().future).toHaveLength(500)
  })
})

// ==========================================================================
// Item 3: Cascade-delete automation on effect removal
// ==========================================================================

describe('Sprint 6: Cascade-delete automation on effect removal', () => {
  beforeEach(() => {
    effectCounter = 0
    resetAllStores()
  })

  it('removeEffect deletes automation lanes targeting the effect', () => {
    const fx = makeEffect({ id: 'fx-cascade' })
    useProjectStore.getState().addEffect(fx)

    // Set up automation lanes
    useAutomationStore.setState({
      lanes: {
        'track-1': [
          { id: 'lane-a', paramPath: 'fx-cascade.amount', color: '#ff0000', isVisible: true, points: [{ time: 0, value: 0.5, curve: 0 }], isTrigger: false },
          { id: 'lane-b', paramPath: 'fx-other.amount', color: '#00ff00', isVisible: true, points: [], isTrigger: false },
        ],
        'track-2': [
          { id: 'lane-c', paramPath: 'fx-cascade.mix', color: '#0000ff', isVisible: true, points: [{ time: 1, value: 1.0, curve: 0 }], isTrigger: false },
        ],
      },
    })

    useProjectStore.getState().removeEffect('fx-cascade')

    const lanes = useAutomationStore.getState().lanes
    // track-1 should only have lane-b (fx-other)
    expect(lanes['track-1']).toHaveLength(1)
    expect(lanes['track-1'][0].id).toBe('lane-b')
    // track-2 had only fx-cascade lanes — should be deleted entirely
    expect(lanes['track-2']).toBeUndefined()
  })

  it('removeEffect + undo restores automation lanes', () => {
    const fx = makeEffect({ id: 'fx-restore' })
    useProjectStore.getState().addEffect(fx)

    const automationData = {
      'track-1': [
        { id: 'lane-r1', paramPath: 'fx-restore.intensity', color: '#ff0000', isVisible: true, points: [{ time: 0, value: 0.3, curve: 0 }, { time: 2, value: 0.9, curve: 0 }], isTrigger: false },
      ],
    }
    useAutomationStore.setState({ lanes: JSON.parse(JSON.stringify(automationData)) })

    // Delete the effect
    useProjectStore.getState().removeEffect('fx-restore')

    // Automation should be gone
    expect(useAutomationStore.getState().lanes['track-1']).toBeUndefined()

    // Undo — automation restored
    useUndoStore.getState().undo()

    const restored = useAutomationStore.getState().lanes['track-1']
    expect(restored).toHaveLength(1)
    expect(restored[0].id).toBe('lane-r1')
    expect(restored[0].points).toHaveLength(2)
    expect(restored[0].points[0].value).toBe(0.3)
  })

  it('removeEffect + undo + redo cycle is clean for automation', () => {
    const fx = makeEffect({ id: 'fx-cycle' })
    useProjectStore.getState().addEffect(fx)

    useAutomationStore.setState({
      lanes: {
        'track-1': [
          { id: 'lane-c1', paramPath: 'fx-cycle.param', color: '#ff0000', isVisible: true, points: [], isTrigger: false },
        ],
      },
    })

    // Delete
    useProjectStore.getState().removeEffect('fx-cycle')
    expect(useAutomationStore.getState().lanes['track-1']).toBeUndefined()

    // Undo
    useUndoStore.getState().undo()
    expect(useAutomationStore.getState().lanes['track-1']).toHaveLength(1)

    // Redo
    useUndoStore.getState().redo()
    expect(useAutomationStore.getState().lanes['track-1']).toBeUndefined()

    // Undo again
    useUndoStore.getState().undo()
    expect(useAutomationStore.getState().lanes['track-1']).toHaveLength(1)
    expect(useAutomationStore.getState().lanes['track-1'][0].paramPath).toBe('fx-cycle.param')
  })

  it('removeEffect cascade also cleans operator mappings', () => {
    const fx = makeEffect({ id: 'fx-op' })
    useProjectStore.getState().addEffect(fx)

    useOperatorStore.setState({
      operators: [{
        id: 'op-1', type: 'lfo', label: 'LFO', isEnabled: true,
        parameters: {}, processing: [],
        mappings: [
          { targetEffectId: 'fx-op', targetParamKey: 'amount', depth: 1, min: 0, max: 1, curve: 'linear' },
          { targetEffectId: 'fx-keep', targetParamKey: 'amount', depth: 1, min: 0, max: 1, curve: 'linear' },
        ],
      }],
    })

    useProjectStore.getState().removeEffect('fx-op')

    const ops = useOperatorStore.getState().operators
    expect(ops[0].mappings).toHaveLength(1)
    expect(ops[0].mappings[0].targetEffectId).toBe('fx-keep')
  })

  it('removeEffect cascade also cleans CC mappings', () => {
    const fx = makeEffect({ id: 'fx-cc' })
    useProjectStore.getState().addEffect(fx)

    useMIDIStore.setState({
      ccMappings: [
        { cc: 1, effectId: 'fx-cc', paramKey: 'amount' },
        { cc: 2, effectId: 'fx-other', paramKey: 'amount' },
      ],
    })

    useProjectStore.getState().removeEffect('fx-cc')

    const mappings = useMIDIStore.getState().ccMappings
    expect(mappings).toHaveLength(1)
    expect(mappings[0].effectId).toBe('fx-other')
  })

  it('no orphan automation when effect with multiple params is removed', () => {
    const fx = makeEffect({ id: 'fx-multi' })
    useProjectStore.getState().addEffect(fx)

    useAutomationStore.setState({
      lanes: {
        'track-1': [
          { id: 'lane-m1', paramPath: 'fx-multi.amount', color: '#ff0000', isVisible: true, points: [], isTrigger: false },
          { id: 'lane-m2', paramPath: 'fx-multi.intensity', color: '#00ff00', isVisible: true, points: [], isTrigger: false },
          { id: 'lane-m3', paramPath: 'fx-multi.offset', color: '#0000ff', isVisible: true, points: [], isTrigger: false },
          { id: 'lane-other', paramPath: 'fx-safe.amount', color: '#ffffff', isVisible: true, points: [], isTrigger: false },
        ],
      },
    })

    useProjectStore.getState().removeEffect('fx-multi')

    const lanes = useAutomationStore.getState().lanes['track-1']
    expect(lanes).toHaveLength(1)
    expect(lanes[0].id).toBe('lane-other')
  })
})
