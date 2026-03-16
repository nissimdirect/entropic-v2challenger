import { describe, it, expect } from 'vitest'
import type { EffectInstance, TextClipConfig } from '../shared/types'
import {
  serializeEffectInstance,
  serializeEffectChain,
  serializeTextConfig,
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

describe('serializeTextConfig', () => {
  const makeTextConfig = (): TextClipConfig => ({
    text: 'Hello World',
    fontFamily: 'Helvetica',
    fontSize: 48,
    color: '#ffffff',
    position: [960, 540],
    alignment: 'center',
    opacity: 1.0,
    strokeWidth: 2,
    strokeColor: '#000000',
    shadowOffset: [4, 4],
    shadowColor: '#00000080',
    animation: 'fade_in',
    animationDuration: 1.5,
  })

  it('maps camelCase to snake_case', () => {
    const config = makeTextConfig()
    const serialized = serializeTextConfig(config)
    expect(serialized.font_family).toBe('Helvetica')
    expect(serialized.font_size).toBe(48)
    expect(serialized.stroke_width).toBe(2)
    expect(serialized.stroke_color).toBe('#000000')
    expect(serialized.shadow_offset).toEqual([4, 4])
    expect(serialized.shadow_color).toBe('#00000080')
    expect(serialized.animation_duration).toBe(1.5)
  })

  it('preserves already-lowercase fields', () => {
    const config = makeTextConfig()
    const serialized = serializeTextConfig(config)
    expect(serialized.text).toBe('Hello World')
    expect(serialized.color).toBe('#ffffff')
    expect(serialized.position).toEqual([960, 540])
    expect(serialized.alignment).toBe('center')
    expect(serialized.opacity).toBe(1.0)
    expect(serialized.animation).toBe('fade_in')
  })

  it('does NOT include camelCase keys', () => {
    const serialized = serializeTextConfig(makeTextConfig()) as Record<string, unknown>
    expect(serialized).not.toHaveProperty('fontFamily')
    expect(serialized).not.toHaveProperty('fontSize')
    expect(serialized).not.toHaveProperty('strokeWidth')
    expect(serialized).not.toHaveProperty('strokeColor')
    expect(serialized).not.toHaveProperty('shadowOffset')
    expect(serialized).not.toHaveProperty('shadowColor')
    expect(serialized).not.toHaveProperty('animationDuration')
  })

  it('outputs exactly the keys the backend text_renderer expects', () => {
    const serialized = serializeTextConfig(makeTextConfig())
    const keys = Object.keys(serialized).sort()
    expect(keys).toEqual([
      'alignment', 'animation', 'animation_duration', 'color',
      'font_family', 'font_size', 'opacity', 'position',
      'shadow_color', 'shadow_offset', 'stroke_color', 'stroke_width', 'text',
    ])
  })
})
