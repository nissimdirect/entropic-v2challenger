import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * Tests for the project Zustand store.
 * Imports the store once it exists (builder-frontend is creating it).
 * Tests are written against the interface from PHASE-1-IMPL-PLAN.md.
 */

// Mock window.entropic before store import
;(globalThis as any).window = {
  entropic: {
    onEngineStatus: () => {},
    sendCommand: async () => ({ ok: true }),
    selectFile: async () => null,
    selectSavePath: async () => null,
    onExportProgress: () => {},
  },
}

import type { EffectInstance } from '../../shared/types'

// Create a minimal in-memory store that matches the expected interface
// This allows tests to run even before the real store is built
interface ProjectState {
  assets: Record<string, { id: string; path: string }>
  effectChain: EffectInstance[]
  selectedEffectId: string | null
  currentFrame: number
  addAsset: (id: string, path: string) => void
  addEffect: (effect: EffectInstance) => void
  removeEffect: (id: string) => void
  reorderEffect: (fromIndex: number, toIndex: number) => void
  updateParam: (effectId: string, param: string, value: number | string | boolean) => void
  setMix: (effectId: string, mix: number) => void
  toggleEffect: (effectId: string) => void
}

function createTestStore(): ProjectState {
  const state: ProjectState = {
    assets: {},
    effectChain: [],
    selectedEffectId: null,
    currentFrame: 0,
    addAsset(id, path) {
      state.assets[id] = { id, path }
    },
    addEffect(effect) {
      state.effectChain.push(effect)
    },
    removeEffect(id) {
      state.effectChain = state.effectChain.filter((e) => e.id !== id)
    },
    reorderEffect(fromIndex, toIndex) {
      const chain = [...state.effectChain]
      const [removed] = chain.splice(fromIndex, 1)
      chain.splice(toIndex, 0, removed)
      state.effectChain = chain
    },
    updateParam(effectId, param, value) {
      const effect = state.effectChain.find((e) => e.id === effectId)
      if (effect) effect.parameters[param] = value
    },
    setMix(effectId, mix) {
      const effect = state.effectChain.find((e) => e.id === effectId)
      if (effect) effect.mix = Math.max(0, Math.min(1, mix))
    },
    toggleEffect(effectId) {
      const effect = state.effectChain.find((e) => e.id === effectId)
      if (effect) effect.isEnabled = !effect.isEnabled
    },
  }
  return state
}

function makeEffect(id: string, effectId: string = 'fx.invert'): EffectInstance {
  return {
    id,
    effectId,
    isEnabled: true,
    isFrozen: false,
    parameters: {},
    modulations: {},
    mix: 1.0,
    mask: null,
  }
}

describe('ProjectStore', () => {
  let store: ProjectState

  beforeEach(() => {
    store = createTestStore()
  })

  it('starts with empty effect chain', () => {
    expect(store.effectChain).toHaveLength(0)
  })

  it('adds effect to chain', () => {
    store.addEffect(makeEffect('e1'))
    expect(store.effectChain).toHaveLength(1)
    expect(store.effectChain[0].id).toBe('e1')
  })

  it('removes effect from chain', () => {
    store.addEffect(makeEffect('e1'))
    store.addEffect(makeEffect('e2'))
    store.removeEffect('e1')
    expect(store.effectChain).toHaveLength(1)
    expect(store.effectChain[0].id).toBe('e2')
  })

  it('reorders effects in chain', () => {
    store.addEffect(makeEffect('e1'))
    store.addEffect(makeEffect('e2'))
    store.addEffect(makeEffect('e3'))
    store.reorderEffect(0, 2)
    expect(store.effectChain.map((e) => e.id)).toEqual(['e2', 'e3', 'e1'])
  })

  it('updates effect parameter', () => {
    store.addEffect(makeEffect('e1'))
    store.updateParam('e1', 'amount', 0.75)
    expect(store.effectChain[0].parameters.amount).toBe(0.75)
  })

  it('sets mix value', () => {
    store.addEffect(makeEffect('e1'))
    store.setMix('e1', 0.5)
    expect(store.effectChain[0].mix).toBe(0.5)
  })

  it('clamps mix to 0-1 range', () => {
    store.addEffect(makeEffect('e1'))
    store.setMix('e1', 1.5)
    expect(store.effectChain[0].mix).toBeLessThanOrEqual(1.0)
    store.setMix('e1', -0.5)
    expect(store.effectChain[0].mix).toBeGreaterThanOrEqual(0.0)
  })

  it('toggles effect enabled state', () => {
    store.addEffect(makeEffect('e1'))
    expect(store.effectChain[0].isEnabled).toBe(true)
    store.toggleEffect('e1')
    expect(store.effectChain[0].isEnabled).toBe(false)
    store.toggleEffect('e1')
    expect(store.effectChain[0].isEnabled).toBe(true)
  })

  it('handles removing non-existent effect gracefully', () => {
    store.addEffect(makeEffect('e1'))
    store.removeEffect('nonexistent')
    expect(store.effectChain).toHaveLength(1)
  })

  it('adds asset to store', () => {
    store.addAsset('a1', '/path/to/video.mp4')
    expect(store.assets['a1']).toBeDefined()
    expect(store.assets['a1'].path).toBe('/path/to/video.mp4')
  })
})

// --- Real store tests ---
import { useProjectStore, getActiveEffectChain, useActiveEffectChain } from '../../renderer/stores/project'
import { useTimelineStore } from '../../renderer/stores/timeline'
import { useUndoStore } from '../../renderer/stores/undo'
import { useOperatorStore } from '../../renderer/stores/operators'
import { useAutomationStore } from '../../renderer/stores/automation'
import { useMIDIStore } from '../../renderer/stores/midi'
import { LIMITS } from '../../shared/limits'

describe('useProjectStore — BPM', () => {
  beforeEach(() => {
    useProjectStore.setState({ bpm: 120 })
  })

  it('defaults to 120 BPM', () => {
    expect(useProjectStore.getState().bpm).toBe(120)
  })

  it('setBpm clamps to minimum 1', () => {
    useProjectStore.getState().setBpm(0)
    expect(useProjectStore.getState().bpm).toBe(1)

    useProjectStore.getState().setBpm(-5)
    expect(useProjectStore.getState().bpm).toBe(1)
  })

  it('setBpm clamps to maximum 300', () => {
    useProjectStore.getState().setBpm(999)
    expect(useProjectStore.getState().bpm).toBe(300)
  })

  it('setBpm rounds to integer', () => {
    useProjectStore.getState().setBpm(95.7)
    expect(useProjectStore.getState().bpm).toBe(96)
  })

  it('setBpm rejects NaN', () => {
    useProjectStore.getState().setBpm(NaN)
    expect(useProjectStore.getState().bpm).toBe(120) // unchanged
  })

  it('setBpm rejects Infinity', () => {
    useProjectStore.getState().setBpm(Infinity)
    expect(useProjectStore.getState().bpm).toBe(120) // unchanged
  })
})

// HT-4 (2026-05-16): project-level seed for deterministic renders + freeze caches.
describe('useProjectStore — seed (HT-4)', () => {
  beforeEach(() => {
    useProjectStore.setState({ seed: 0 })
  })

  it('defaults to 0', () => {
    expect(useProjectStore.getState().seed).toBe(0)
  })

  it('setSeed accepts valid integers in [0, 2^31-1]', () => {
    useProjectStore.getState().setSeed(42)
    expect(useProjectStore.getState().seed).toBe(42)
    useProjectStore.getState().setSeed(2147483647)
    expect(useProjectStore.getState().seed).toBe(2147483647)
    useProjectStore.getState().setSeed(0)
    expect(useProjectStore.getState().seed).toBe(0)
  })

  it('setSeed rejects out-of-range values', () => {
    useProjectStore.setState({ seed: 100 })
    useProjectStore.getState().setSeed(-1)
    expect(useProjectStore.getState().seed).toBe(100) // unchanged
    useProjectStore.getState().setSeed(2147483648)
    expect(useProjectStore.getState().seed).toBe(100) // unchanged
  })

  it('setSeed rejects non-integers', () => {
    useProjectStore.setState({ seed: 100 })
    useProjectStore.getState().setSeed(3.14)
    expect(useProjectStore.getState().seed).toBe(100)
    useProjectStore.getState().setSeed(NaN)
    expect(useProjectStore.getState().seed).toBe(100)
    useProjectStore.getState().setSeed(Infinity)
    expect(useProjectStore.getState().seed).toBe(100)
  })

  it('resetProject restores seed to default 0', () => {
    useProjectStore.getState().setSeed(999)
    useProjectStore.getState().resetProject()
    expect(useProjectStore.getState().seed).toBe(0)
  })
})

// ─── Epic 01: per-track chain store tests ────────────────────────────────────
// Each test name maps to a spec scenario from specs/effect-chain/spec.md.

function makeRealEffect(id: string, effectId = 'fx.invert'): EffectInstance {
  return {
    id,
    effectId,
    isEnabled: true,
    isFrozen: false,
    parameters: { amount: 0.5 },
    modulations: {},
    mix: 1.0,
    mask: null,
  }
}

function resetAll() {
  useTimelineStore.getState().reset()
  useProjectStore.getState().resetProject()
  useUndoStore.getState().clear()
  useOperatorStore.setState({ operators: [] })
  useAutomationStore.setState({ lanes: {} })
  useMIDIStore.setState({ ccMappings: [] })
}

function getChain(trackId: string): EffectInstance[] {
  return useTimelineStore.getState().tracks.find((t) => t.id === trackId)?.effectChain ?? []
}

describe('useProjectStore — per-track effect chain (Epic 01)', () => {
  let V1: string
  let V2: string

  beforeEach(() => {
    resetAll()
    V1 = useTimelineStore.getState().addTrack('V1', '#ff0000')!
    V2 = useTimelineStore.getState().addTrack('V2', '#00ff00')!
    useUndoStore.getState().clear()
  })

  // ── Scenario: Adding an effect targets one track ──────────────────────────
  it('[effect-chain/Adding an effect targets one track] V1 gets effect, V2 stays empty', () => {
    const effect = makeRealEffect('e1')
    useProjectStore.getState().addEffect(V1, effect)

    expect(getChain(V1)).toHaveLength(1)
    expect(getChain(V1)[0].id).toBe('e1')
    expect(getChain(V2)).toHaveLength(0)
  })

  // ── Scenario: Mutations on one track do not affect another ────────────────
  it('[effect-chain/Mutations on one track do not affect another] removeEffect on V1 leaves V2 intact', () => {
    useProjectStore.getState().addEffect(V1, makeRealEffect('ps', 'pixelsort'))
    useProjectStore.getState().addEffect(V2, makeRealEffect('dm', 'datamosh'))
    useUndoStore.getState().clear()

    useProjectStore.getState().removeEffect(V1, 'ps')

    expect(getChain(V1)).toHaveLength(0)
    expect(getChain(V2)).toHaveLength(1)
    expect(getChain(V2)[0].id).toBe('dm')
  })

  it('[effect-chain/Mutations on one track do not affect another] reorderEffect on V1 leaves V2 intact', () => {
    useProjectStore.getState().addEffect(V1, makeRealEffect('e1'))
    useProjectStore.getState().addEffect(V1, makeRealEffect('e2'))
    useProjectStore.getState().addEffect(V2, makeRealEffect('dm', 'datamosh'))
    useUndoStore.getState().clear()

    useProjectStore.getState().reorderEffect(V1, 0, 1)

    expect(getChain(V1).map((e) => e.id)).toEqual(['e2', 'e1'])
    expect(getChain(V2)[0].id).toBe('dm')
  })

  it('[effect-chain/Mutations on one track do not affect another] updateParam on V1 leaves V2 intact', () => {
    useProjectStore.getState().addEffect(V1, makeRealEffect('e1'))
    useProjectStore.getState().addEffect(V2, makeRealEffect('dm'))
    useUndoStore.getState().clear()

    useProjectStore.getState().updateParam(V1, 'e1', 'amount', 0.99)

    expect(getChain(V1)[0].parameters.amount).toBe(0.99)
    expect(getChain(V2)[0].parameters.amount).toBe(0.5) // unchanged
  })

  it('[effect-chain/Mutations on one track do not affect another] setMix on V1 leaves V2 intact', () => {
    useProjectStore.getState().addEffect(V1, makeRealEffect('e1'))
    useProjectStore.getState().addEffect(V2, makeRealEffect('dm'))
    useUndoStore.getState().clear()

    useProjectStore.getState().setMix(V1, 'e1', 0.3)

    expect(getChain(V1)[0].mix).toBe(0.3)
    expect(getChain(V2)[0].mix).toBe(1.0) // unchanged
  })

  it('[effect-chain/Mutations on one track do not affect another] toggleEffect on V1 leaves V2 intact', () => {
    useProjectStore.getState().addEffect(V1, makeRealEffect('e1'))
    useProjectStore.getState().addEffect(V2, makeRealEffect('dm'))
    useUndoStore.getState().clear()

    useProjectStore.getState().toggleEffect(V1, 'e1')

    expect(getChain(V1)[0].isEnabled).toBe(false)
    expect(getChain(V2)[0].isEnabled).toBe(true) // unchanged
  })

  // ── Scenario: Per-track chain length limit ────────────────────────────────
  it('[effect-chain/Per-track chain length limit] V1 at max rejects extra, V2 still accepts', () => {
    for (let i = 0; i < LIMITS.MAX_EFFECTS_PER_CHAIN; i++) {
      useProjectStore.getState().addEffect(V1, makeRealEffect(`v1-fx-${i}`))
    }
    // V1 is full
    expect(getChain(V1)).toHaveLength(LIMITS.MAX_EFFECTS_PER_CHAIN)
    // Extra to V1 is rejected
    useProjectStore.getState().addEffect(V1, makeRealEffect('overflow'))
    expect(getChain(V1)).toHaveLength(LIMITS.MAX_EFFECTS_PER_CHAIN)
    // V2 can still accept
    useProjectStore.getState().addEffect(V2, makeRealEffect('v2-fx'))
    expect(getChain(V2)).toHaveLength(1)
  })

  // ── Scenario: Unknown track id is a no-op ─────────────────────────────────
  it('[effect-chain/Unknown track id is a no-op] addEffect to ghost track does not throw', () => {
    expect(() => useProjectStore.getState().addEffect('ghost', makeRealEffect('e'))).not.toThrow()
    expect(getChain(V1)).toHaveLength(0)
    expect(getChain(V2)).toHaveLength(0)
  })

  it('[effect-chain/Unknown track id is a no-op] removeEffect on ghost track is no-op', () => {
    useProjectStore.getState().addEffect(V1, makeRealEffect('e1'))
    expect(() => useProjectStore.getState().removeEffect('ghost', 'e1')).not.toThrow()
    expect(getChain(V1)).toHaveLength(1) // V1 untouched
  })

  // ── Scenario: Migrated actions do not write the global field ──────────────
  it('[effect-chain/Migrated actions do not write the global field] addEffect writes track chain only (Epic 05: global field deleted)', () => {
    // Epic 05 D3: global effectChain field deleted. Only the per-track chain exists.
    expect((useProjectStore.getState() as any).effectChain).toBeUndefined()
    useProjectStore.getState().addEffect(V1, makeRealEffect('e1'))
    // Global field still absent
    expect((useProjectStore.getState() as any).effectChain).toBeUndefined()
    // Track chain has the effect
    expect(getChain(V1)).toHaveLength(1)
  })

  // ── Scenario: Undo of remove restores chain and dependents ────────────────
  it('[effect-chain/Undo of remove restores chain and dependents] removeEffect + undo restores V1 chain', () => {
    useProjectStore.getState().addEffect(V1, makeRealEffect('e1'))
    useProjectStore.getState().addEffect(V1, makeRealEffect('e2'))
    // Add cross-store state
    useOperatorStore.setState({
      operators: [{
        id: 'op-1', type: 'lfo', label: 'LFO', isEnabled: true,
        parameters: {}, processing: [],
        mappings: [{ targetEffectId: 'e1', targetParamKey: 'amount', depth: 1, min: 0, max: 1, curve: 'linear' }],
      }],
    })
    useAutomationStore.setState({
      lanes: { 'trk': [{ id: 'ln', paramPath: 'e1.amount', color: '#f00', isVisible: true, points: [], mode: 'smooth' }] },
    })
    useMIDIStore.setState({ ccMappings: [{ cc: 1, effectId: 'e1', paramKey: 'amount' }] })
    useUndoStore.getState().clear()

    useProjectStore.getState().removeEffect(V1, 'e1')

    expect(getChain(V1).map((e) => e.id)).toEqual(['e2'])
    expect(useOperatorStore.getState().operators[0].mappings).toHaveLength(0)
    expect(useAutomationStore.getState().lanes['trk']).toBeUndefined()
    expect(useMIDIStore.getState().ccMappings).toHaveLength(0)

    // Undo restores everything
    useUndoStore.getState().undo()

    const restored = getChain(V1)
    expect(restored.map((e) => e.id)).toEqual(['e1', 'e2'])
    expect(useOperatorStore.getState().operators[0].mappings).toHaveLength(1)
    expect(useOperatorStore.getState().operators[0].mappings[0].targetEffectId).toBe('e1')
    expect(useAutomationStore.getState().lanes['trk']).toHaveLength(1)
    expect(useMIDIStore.getState().ccMappings).toHaveLength(1)
  })

  // ── Scenario: Active chain follows selection ──────────────────────────────
  it('[effect-chain/Active chain follows selection] getActiveEffectChain returns chain of selected track', () => {
    useProjectStore.getState().addEffect(V1, makeRealEffect('ps', 'pixelsort'))
    useProjectStore.getState().addEffect(V2, makeRealEffect('dm', 'datamosh'))

    useTimelineStore.getState().selectTrack(V1)
    expect(getActiveEffectChain().map((e) => e.id)).toEqual(['ps'])

    useTimelineStore.getState().selectTrack(V2)
    expect(getActiveEffectChain().map((e) => e.id)).toEqual(['dm'])
  })

  it('[effect-chain/Active chain follows selection] getActiveEffectChain returns EMPTY when no selection', () => {
    useTimelineStore.getState().selectTrack(null)
    const chain = getActiveEffectChain()
    expect(chain).toHaveLength(0)
    // Returns stable reference (same object on repeated calls)
    expect(getActiveEffectChain()).toBe(chain)
  })

  // ── Undo of addEffect targets V1 only ────────────────────────────────────
  it('[effect-chain/Undo of addEffect restores V1 only] undo addEffect on V1 does not touch V2', () => {
    useProjectStore.getState().addEffect(V1, makeRealEffect('e1'))
    useProjectStore.getState().addEffect(V2, makeRealEffect('dm'))
    useUndoStore.getState().clear()

    useProjectStore.getState().addEffect(V1, makeRealEffect('e2'))
    expect(getChain(V1)).toHaveLength(2)
    expect(getChain(V2)).toHaveLength(1)

    useUndoStore.getState().undo()
    expect(getChain(V1)).toHaveLength(1)
    expect(getChain(V2)).toHaveLength(1) // V2 untouched
  })

  // ── 3-track mixed ─────────────────────────────────────────────────────────
  it('[effect-chain/3-track mixed] different effect ids per track survive cross-track operations', () => {
    const V3 = useTimelineStore.getState().addTrack('V3', '#0000ff')!
    useUndoStore.getState().clear()

    useProjectStore.getState().addEffect(V1, makeRealEffect('v1-fx'))
    useProjectStore.getState().addEffect(V2, makeRealEffect('v2-fx'))
    useProjectStore.getState().addEffect(V3, makeRealEffect('v3-fx'))

    // Operate on V2 only
    useProjectStore.getState().updateParam(V2, 'v2-fx', 'amount', 0.9)
    useProjectStore.getState().toggleEffect(V2, 'v2-fx')

    // V1 and V3 unaffected
    expect(getChain(V1)[0].parameters.amount).toBe(0.5)
    expect(getChain(V1)[0].isEnabled).toBe(true)
    expect(getChain(V3)[0].parameters.amount).toBe(0.5)
    expect(getChain(V3)[0].isEnabled).toBe(true)

    // V2 changed
    expect(getChain(V2)[0].parameters.amount).toBe(0.9)
    expect(getChain(V2)[0].isEnabled).toBe(false)
  })
})

// ── Task 10b: PC-B guard — resetProject leaves per-track chains consistent ───
describe('useProjectStore — resetProject PC-B guard', () => {
  beforeEach(() => {
    useTimelineStore.getState().reset()
    useProjectStore.getState().resetProject()
    useUndoStore.getState().clear()
  })

  it('[effect-chain/resetProject PC-B] resetProject keeps timeline separate and does not reset tracks (Epic 05: global field deleted)', () => {
    // Epic 05 D3: global effectChain field deleted. resetProject resets the project
    // store only; the timeline store is separate.
    const V1 = useTimelineStore.getState().addTrack('V1', '#ff0000')!
    useProjectStore.getState().addEffect(V1, makeRealEffect('e1'))
    useUndoStore.getState().clear()

    useProjectStore.getState().resetProject()

    // Global effectChain field does not exist (Epic 05 D3)
    expect((useProjectStore.getState() as any).effectChain).toBeUndefined()
    // Timeline is separate store — not reset by resetProject
    expect(useTimelineStore.getState().tracks).toHaveLength(1)
    expect(getChain(V1)).toHaveLength(1) // track chain still intact

    // After timeline reset as well, everything is clean
    useTimelineStore.getState().reset()
    expect(useTimelineStore.getState().tracks).toHaveLength(0)
  })

  it('[effect-chain/resetProject PC-B] resetProject seed resets to 0 across consecutive resets (Epic 05: global field deleted)', () => {
    useProjectStore.getState().setSeed(12345)
    expect(useProjectStore.getState().seed).toBe(12345)

    useProjectStore.getState().resetProject()
    expect(useProjectStore.getState().seed).toBe(0)
    // Epic 05 D3: global effectChain field deleted — no longer present on project store
    expect((useProjectStore.getState() as any).effectChain).toBeUndefined()
    expect(useProjectStore.getState().deviceGroups).toEqual({})
  })

  function getChain(trackId: string): EffectInstance[] {
    return useTimelineStore.getState().tracks.find((t) => t.id === trackId)?.effectChain ?? []
  }
})
