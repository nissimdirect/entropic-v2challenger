import { describe, it, expect } from 'vitest'
import type { Preset } from '../../shared/types'

function makePreset(overrides: Partial<Preset> = {}): Preset {
  return {
    id: 'p-1',
    name: 'Test Preset',
    type: 'single_effect',
    created: Date.now(),
    tags: ['glitch'],
    isFavorite: false,
    effectData: { effectId: 'fx.invert', parameters: {}, modulations: {} },
    ...overrides,
  }
}

describe('PresetCard data', () => {
  it('preset has required fields', () => {
    const preset = makePreset()
    expect(preset.id).toBeTruthy()
    expect(preset.name).toBeTruthy()
    expect(preset.type).toBe('single_effect')
    expect(preset.tags).toContain('glitch')
  })

  it('single_effect preset has effectData', () => {
    const preset = makePreset({ type: 'single_effect' })
    expect(preset.effectData).toBeDefined()
    expect(preset.effectData?.effectId).toBe('fx.invert')
  })

  it('effect_chain preset has chainData', () => {
    const preset = makePreset({
      type: 'effect_chain',
      chainData: {
        effects: [
          {
            id: 'e1',
            effectId: 'fx.invert',
            isEnabled: true,
            isFrozen: false,
            parameters: {},
            modulations: {},
            mix: 1,
            mask: null,
          },
        ],
        macros: [],
      },
    })
    expect(preset.chainData).toBeDefined()
    expect(preset.chainData?.effects).toHaveLength(1)
  })

  it('favorite flag toggles', () => {
    const preset = makePreset({ isFavorite: false })
    expect(preset.isFavorite).toBe(false)
    const toggled = { ...preset, isFavorite: !preset.isFavorite }
    expect(toggled.isFavorite).toBe(true)
  })
})
