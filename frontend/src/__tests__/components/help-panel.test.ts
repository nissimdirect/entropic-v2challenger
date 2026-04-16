/**
 * Tests for HelpPanel logic — effect info display, hover state,
 * param extraction, and empty state handling.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type { EffectInfo } from '../../shared/types'

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

// Provide localStorage stub for browser store persistence
;(globalThis as any).localStorage = {
  _data: {} as Record<string, string>,
  getItem(key: string) { return this._data[key] ?? null },
  setItem(key: string, value: string) { this._data[key] = value },
  removeItem(key: string) { delete this._data[key] },
  clear() { this._data = {} },
}

import { useEffectsStore } from '../../renderer/stores/effects'
import { useBrowserStore } from '../../renderer/stores/browser'

// ---------- Mock registry data ----------

const mockRegistry: EffectInfo[] = [
  {
    id: 'fx.pixelsort',
    name: 'Pixel Sort',
    category: 'distortion',
    params: {
      threshold: { type: 'float', min: 0, max: 1, default: 0.5, label: 'Threshold' },
      direction: { type: 'choice', default: 'horizontal', label: 'Direction' },
    },
  },
  {
    id: 'fx.invert',
    name: 'Invert',
    category: 'color',
    params: {},
  },
  {
    id: 'fx.blur',
    name: 'Gaussian Blur',
    category: 'distortion',
    params: {
      radius: { type: 'float', min: 0, max: 50, default: 5, label: 'Blur Radius' },
      sigma: { type: 'float', min: 0.1, max: 20, default: 1.5, label: 'Sigma' },
      passes: { type: 'int', min: 1, max: 10, default: 1, label: 'Passes' },
    },
  },
]

// ---------- Logic extracted from HelpPanel component ----------

function resolveHelpInfo(
  hoveredEffectId: string | null,
  registry: EffectInfo[],
): EffectInfo | null {
  return hoveredEffectId ? registry.find((r) => r.id === hoveredEffectId) ?? null : null
}

function getParamCount(info: EffectInfo): number {
  return Object.keys(info.params).length
}

function getParamNames(info: EffectInfo): string {
  return Object.values(info.params).map((p) => p.label).join(', ')
}

// ---------- Tests ----------

describe('HelpPanel — info resolution', () => {
  it('returns null when hoveredEffectId is null', () => {
    expect(resolveHelpInfo(null, mockRegistry)).toBeNull()
  })

  it('returns null when hoveredEffectId does not match any registry entry', () => {
    expect(resolveHelpInfo('fx.nonexistent', mockRegistry)).toBeNull()
  })

  it('returns the correct effect info when hoveredEffectId matches', () => {
    const info = resolveHelpInfo('fx.pixelsort', mockRegistry)
    expect(info).not.toBeNull()
    expect(info!.name).toBe('Pixel Sort')
    expect(info!.category).toBe('distortion')
  })

  it('returns exact match, not partial match', () => {
    const info = resolveHelpInfo('fx.pixel', mockRegistry)
    expect(info).toBeNull()
  })
})

describe('HelpPanel — param display', () => {
  it('shows correct param count for effect with params', () => {
    const info = resolveHelpInfo('fx.pixelsort', mockRegistry)!
    expect(getParamCount(info)).toBe(2)
  })

  it('shows zero params for effect with no params', () => {
    const info = resolveHelpInfo('fx.invert', mockRegistry)!
    expect(getParamCount(info)).toBe(0)
  })

  it('joins param labels with comma separator', () => {
    const info = resolveHelpInfo('fx.pixelsort', mockRegistry)!
    const names = getParamNames(info)
    expect(names).toBe('Threshold, Direction')
  })

  it('returns empty string for effect with no params', () => {
    const info = resolveHelpInfo('fx.invert', mockRegistry)!
    expect(getParamNames(info)).toBe('')
  })

  it('handles effect with many params', () => {
    const info = resolveHelpInfo('fx.blur', mockRegistry)!
    expect(getParamCount(info)).toBe(3)
    expect(getParamNames(info)).toBe('Blur Radius, Sigma, Passes')
  })
})

describe('HelpPanel — display fields', () => {
  it('exposes name for display', () => {
    const info = resolveHelpInfo('fx.pixelsort', mockRegistry)!
    expect(info.name).toBe('Pixel Sort')
  })

  it('exposes category for display', () => {
    const info = resolveHelpInfo('fx.pixelsort', mockRegistry)!
    expect(info.category).toBe('distortion')
  })

  it('each registry entry has required fields', () => {
    for (const effect of mockRegistry) {
      expect(typeof effect.id).toBe('string')
      expect(typeof effect.name).toBe('string')
      expect(typeof effect.category).toBe('string')
      expect(typeof effect.params).toBe('object')
    }
  })
})

describe('HelpPanel — empty state', () => {
  it('shows empty state when no effect is hovered', () => {
    const info = resolveHelpInfo(null, mockRegistry)
    // Component shows "Hover an effect for details" when info is null
    expect(info).toBeNull()
  })

  it('shows empty state when registry is empty', () => {
    const info = resolveHelpInfo('fx.pixelsort', [])
    expect(info).toBeNull()
  })
})

describe('HelpPanel — store integration', () => {
  beforeEach(() => {
    useEffectsStore.setState({ registry: mockRegistry, isLoading: false, error: null })
    useBrowserStore.getState().setHoveredEffectId(null)
  })

  it('effects store holds the registry', () => {
    const registry = useEffectsStore.getState().registry
    expect(registry).toHaveLength(3)
    expect(registry[0].id).toBe('fx.pixelsort')
  })

  it('browser store tracks hovered effect id', () => {
    expect(useBrowserStore.getState().hoveredEffectId).toBeNull()
    useBrowserStore.getState().setHoveredEffectId('fx.blur')
    expect(useBrowserStore.getState().hoveredEffectId).toBe('fx.blur')
  })

  it('clearing hover resets to null', () => {
    useBrowserStore.getState().setHoveredEffectId('fx.blur')
    useBrowserStore.getState().setHoveredEffectId(null)
    expect(useBrowserStore.getState().hoveredEffectId).toBeNull()
  })

  it('resolves info from stores like the component does', () => {
    useBrowserStore.getState().setHoveredEffectId('fx.blur')
    const hoveredId = useBrowserStore.getState().hoveredEffectId
    const registry = useEffectsStore.getState().registry
    const info = resolveHelpInfo(hoveredId, registry)
    expect(info).not.toBeNull()
    expect(info!.name).toBe('Gaussian Blur')
    expect(info!.category).toBe('distortion')
    expect(getParamCount(info!)).toBe(3)
  })

  it('returns null from stores when hovered id not in registry', () => {
    useBrowserStore.getState().setHoveredEffectId('fx.doesnotexist')
    const hoveredId = useBrowserStore.getState().hoveredEffectId
    const registry = useEffectsStore.getState().registry
    const info = resolveHelpInfo(hoveredId, registry)
    expect(info).toBeNull()
  })
})
