/**
 * A/B state persistence round-trip test (Quality Fix 1).
 * Verifies abState survives JSON serialize/deserialize (project save/load).
 */
import { describe, it, expect } from 'vitest'
import type { EffectInstance, ABState } from '../../shared/types'

describe('A/B state persistence round-trip', () => {
  it('abState survives JSON serialize/deserialize', () => {
    const abState: ABState = {
      a: { threshold: 0.3, direction: 45 },
      b: { threshold: 0.8, direction: 180 },
      active: 'b',
    }

    const effect: EffectInstance = {
      id: 'fx-persist-1',
      effectId: 'pixelsort',
      isEnabled: true,
      isFrozen: false,
      parameters: { threshold: 0.8, direction: 180 },
      modulations: {},
      mix: 0.75,
      mask: null,
      abState,
    }

    // Simulate project save (JSON.stringify) and load (JSON.parse)
    const serialized = JSON.stringify(effect)
    const deserialized: EffectInstance = JSON.parse(serialized)

    expect(deserialized.abState).toBeDefined()
    expect(deserialized.abState!.active).toBe('b')
    expect(deserialized.abState!.a.threshold).toBe(0.3)
    expect(deserialized.abState!.b.threshold).toBe(0.8)
    expect(deserialized.abState!.a.direction).toBe(45)
    expect(deserialized.abState!.b.direction).toBe(180)
  })

  it('null abState survives round-trip', () => {
    const effect: EffectInstance = {
      id: 'fx-persist-2',
      effectId: 'datamosh',
      isEnabled: true,
      isFrozen: false,
      parameters: { entropy: 0.5 },
      modulations: {},
      mix: 1,
      mask: null,
      abState: null,
    }

    const deserialized: EffectInstance = JSON.parse(JSON.stringify(effect))
    expect(deserialized.abState).toBeNull()
  })

  it('undefined abState (old project format) loads as undefined', () => {
    // Simulate old project file without abState field
    const oldEffect = {
      id: 'fx-old',
      effectId: 'blur',
      isEnabled: true,
      isFrozen: false,
      parameters: { radius: 5 },
      modulations: {},
      mix: 1,
      mask: null,
      // no abState field
    }

    const deserialized: EffectInstance = JSON.parse(JSON.stringify(oldEffect))
    expect(deserialized.abState).toBeUndefined()
  })

  it('effectChain array with mixed abState effects round-trips', () => {
    const chain: EffectInstance[] = [
      {
        id: 'fx-1',
        effectId: 'pixelsort',
        isEnabled: true,
        isFrozen: false,
        parameters: { threshold: 0.5 },
        modulations: {},
        mix: 1,
        mask: null,
        abState: { a: { threshold: 0.5 }, b: { threshold: 0.9 }, active: 'a' },
      },
      {
        id: 'fx-2',
        effectId: 'datamosh',
        isEnabled: true,
        isFrozen: false,
        parameters: { entropy: 0.7 },
        modulations: {},
        mix: 0.8,
        mask: null,
        // no abState
      },
    ]

    const deserialized: EffectInstance[] = JSON.parse(JSON.stringify(chain))
    expect(deserialized[0].abState?.active).toBe('a')
    expect(deserialized[1].abState).toBeUndefined()
  })
})
