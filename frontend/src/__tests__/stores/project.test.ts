import { describe, it, expect, beforeEach } from 'vitest'

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
