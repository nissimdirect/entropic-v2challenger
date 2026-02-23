import { describe, it, expect } from 'vitest'
import type { EffectInstance } from '../shared/types'
import {
  serializeEffectInstance,
  serializeEffectChain,
  type SerializedEffectInstance,
} from '../shared/ipc-serialize'

/**
 * IPC contract tests — validates that frontend EffectInstance fields
 * are correctly mapped to the snake_case names the Python backend expects.
 *
 * Backend contract (pipeline.py apply_chain):
 *   effect_instance.get("effect_id")
 *   effect_instance.get("enabled", True)
 *   effect_instance.get("params", {})
 */

const makeEffect = (overrides: Partial<EffectInstance> = {}): EffectInstance => ({
  id: 'inst-1',
  effectId: 'fx.invert',
  isEnabled: true,
  isFrozen: false,
  parameters: { amount: 0.5, mode: 'hard' },
  modulations: {},
  mix: 1.0,
  mask: null,
  ...overrides,
})

describe('serializeEffectInstance', () => {
  it('maps effectId to effect_id', () => {
    const effect = makeEffect({ effectId: 'fx.hue_shift' })
    const serialized = serializeEffectInstance(effect)
    expect(serialized).toHaveProperty('effect_id', 'fx.hue_shift')
    expect(serialized).not.toHaveProperty('effectId')
  })

  it('maps isEnabled to enabled', () => {
    const effect = makeEffect({ isEnabled: false })
    const serialized = serializeEffectInstance(effect)
    expect(serialized).toHaveProperty('enabled', false)
    expect(serialized).not.toHaveProperty('isEnabled')
  })

  it('maps parameters to params', () => {
    const effect = makeEffect({ parameters: { intensity: 0.8, color: 'red' } })
    const serialized = serializeEffectInstance(effect)
    expect(serialized).toHaveProperty('params')
    expect(serialized.params).toEqual({ intensity: 0.8, color: 'red' })
    expect(serialized).not.toHaveProperty('parameters')
  })

  it('preserves mix value', () => {
    const effect = makeEffect({ mix: 0.75 })
    const serialized = serializeEffectInstance(effect)
    expect(serialized.mix).toBe(0.75)
  })

  it('does not include frontend-only fields (id, isFrozen, modulations, mask)', () => {
    const serialized = serializeEffectInstance(makeEffect())
    expect(serialized).not.toHaveProperty('id')
    expect(serialized).not.toHaveProperty('isFrozen')
    expect(serialized).not.toHaveProperty('modulations')
    expect(serialized).not.toHaveProperty('mask')
  })

  it('outputs exactly the keys the backend expects', () => {
    const serialized = serializeEffectInstance(makeEffect())
    const keys = Object.keys(serialized).sort()
    expect(keys).toEqual(['effect_id', 'enabled', 'mix', 'params'])
  })
})

describe('serializeEffectChain', () => {
  it('serializes an empty chain', () => {
    expect(serializeEffectChain([])).toEqual([])
  })

  it('serializes a chain with one effect', () => {
    const chain = [makeEffect()]
    const serialized = serializeEffectChain(chain)
    expect(serialized).toHaveLength(1)
    expect(serialized[0].effect_id).toBe('fx.invert')
  })

  it('serializes a chain with multiple effects in order', () => {
    const chain = [
      makeEffect({ effectId: 'fx.invert', isEnabled: true }),
      makeEffect({ effectId: 'fx.blur', isEnabled: false, parameters: { radius: 5 } }),
      makeEffect({ effectId: 'fx.noise', isEnabled: true, parameters: { intensity: 0.3 }, mix: 0.5 }),
    ]
    const serialized = serializeEffectChain(chain)
    expect(serialized).toHaveLength(3)
    expect(serialized[0]).toEqual({ effect_id: 'fx.invert', enabled: true, params: { amount: 0.5, mode: 'hard' }, mix: 1.0 })
    expect(serialized[1]).toEqual({ effect_id: 'fx.blur', enabled: false, params: { radius: 5 }, mix: 1.0 })
    expect(serialized[2]).toEqual({ effect_id: 'fx.noise', enabled: true, params: { intensity: 0.3 }, mix: 0.5 })
  })

  it('preserves chain order (pipeline processes in order)', () => {
    const chain = [
      makeEffect({ effectId: 'fx.first' }),
      makeEffect({ effectId: 'fx.second' }),
      makeEffect({ effectId: 'fx.third' }),
    ]
    const serialized = serializeEffectChain(chain)
    expect(serialized.map((e) => e.effect_id)).toEqual(['fx.first', 'fx.second', 'fx.third'])
  })
})

describe('IPC contract: field names match backend expectations', () => {
  // These tests codify the exact field names that pipeline.py reads.
  // If the backend changes, these tests should break and alert us.

  const BACKEND_REQUIRED_FIELDS = ['effect_id', 'enabled', 'params'] as const

  it('serialized output contains all fields backend reads', () => {
    const serialized = serializeEffectInstance(makeEffect())
    for (const field of BACKEND_REQUIRED_FIELDS) {
      expect(serialized).toHaveProperty(field)
    }
  })

  it('effect_id is a string (registry.get expects string key)', () => {
    const serialized = serializeEffectInstance(makeEffect())
    expect(typeof serialized.effect_id).toBe('string')
  })

  it('enabled is a boolean (pipeline uses it for skip logic)', () => {
    const serialized = serializeEffectInstance(makeEffect())
    expect(typeof serialized.enabled).toBe('boolean')
  })

  it('params is an object (pipeline passes it to container.process)', () => {
    const serialized = serializeEffectInstance(makeEffect())
    expect(typeof serialized.params).toBe('object')
    expect(serialized.params).not.toBeNull()
    expect(!Array.isArray(serialized.params)).toBe(true)
  })

  it('does NOT send camelCase field names that would be silently ignored', () => {
    const serialized = serializeEffectInstance(makeEffect()) as Record<string, unknown>
    // These are the exact camelCase names that caused BUG-1
    expect(serialized).not.toHaveProperty('effectId')
    expect(serialized).not.toHaveProperty('isEnabled')
    expect(serialized).not.toHaveProperty('parameters')
  })
})
