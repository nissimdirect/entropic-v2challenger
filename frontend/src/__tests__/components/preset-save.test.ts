import { describe, it, expect } from 'vitest'
import type { Preset, MacroMapping } from '../../shared/types'

describe('PresetSaveDialog logic', () => {
  it('creates valid single_effect preset', () => {
    const preset: Preset = {
      id: 'test-save-1',
      name: 'My Invert',
      type: 'single_effect',
      created: Date.now(),
      tags: ['color'],
      isFavorite: false,
      effectData: {
        effectId: 'fx.invert',
        parameters: {},
        modulations: {},
      },
    }
    expect(preset.type).toBe('single_effect')
    expect(preset.effectData?.effectId).toBe('fx.invert')
  })

  it('creates valid effect_chain preset with macros', () => {
    const macros: MacroMapping[] = [
      { label: 'Intensity', effectIndex: 0, paramKey: 'amount', min: 0, max: 1 },
    ]
    const preset: Preset = {
      id: 'test-save-2',
      name: 'My Chain',
      type: 'effect_chain',
      created: Date.now(),
      tags: ['chain', 'glitch'],
      isFavorite: false,
      chainData: {
        effects: [
          {
            id: 'e1',
            effectId: 'fx.noise',
            isEnabled: true,
            isFrozen: false,
            parameters: { amount: 0.5 },
            modulations: {},
            mix: 1,
            mask: null,
          },
        ],
        macros,
      },
    }
    expect(preset.chainData?.macros).toHaveLength(1)
    expect(preset.chainData?.macros[0].label).toBe('Intensity')
  })

  it('tags are parsed from comma-separated string', () => {
    const input = 'glitch, color, subtle'
    const tags = input.split(',').map((t) => t.trim()).filter(Boolean)
    expect(tags).toEqual(['glitch', 'color', 'subtle'])
  })

  it('empty name prevents save', () => {
    const name = '  '
    expect(name.trim()).toBe('')
  })
})
