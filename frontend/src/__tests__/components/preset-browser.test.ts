import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Preset } from '../../shared/types'

// Mock window.entropic
;(globalThis as any).window = {
  entropic: {
    sendCommand: vi.fn().mockResolvedValue({ ok: true }),
    onEngineStatus: () => {},
    selectFile: async () => null,
    selectSavePath: async () => null,
    onExportProgress: () => () => {},
    readFile: vi.fn(),
    writeFile: vi.fn(),
    deleteFile: vi.fn(),
    listFiles: vi.fn().mockResolvedValue([]),
    mkdirp: vi.fn(),
    getAppPath: vi.fn().mockResolvedValue('/Users/test/Documents'),
  },
}

import { useLibraryStore } from '../../renderer/stores/library'

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

describe('PresetBrowser logic', () => {
  beforeEach(() => {
    useLibraryStore.setState({
      presets: [],
      searchQuery: '',
      categoryFilter: null,
      isLoading: false,
    })
  })

  it('filteredPresets returns all when no filters', async () => {
    await useLibraryStore.getState().savePreset(makePreset({ id: 'a' }))
    await useLibraryStore.getState().savePreset(makePreset({ id: 'b' }))
    expect(useLibraryStore.getState().filteredPresets()).toHaveLength(2)
  })

  it('filteredPresets filters by search', async () => {
    await useLibraryStore.getState().savePreset(makePreset({ id: 'a', name: 'Neon Pop' }))
    await useLibraryStore.getState().savePreset(makePreset({ id: 'b', name: 'Warm Shift' }))

    useLibraryStore.getState().setSearch('neon')
    expect(useLibraryStore.getState().filteredPresets()).toHaveLength(1)
    expect(useLibraryStore.getState().filteredPresets()[0].name).toBe('Neon Pop')
  })

  it('filteredPresets filters by category', async () => {
    await useLibraryStore.getState().savePreset(makePreset({ id: 'a', tags: ['glitch'] }))
    await useLibraryStore.getState().savePreset(makePreset({ id: 'b', tags: ['color'] }))

    useLibraryStore.getState().setCategory('color')
    expect(useLibraryStore.getState().filteredPresets()).toHaveLength(1)
  })

  it('toggleFavorite works correctly', async () => {
    await useLibraryStore.getState().savePreset(makePreset({ id: 'fav', isFavorite: false }))
    useLibraryStore.getState().toggleFavorite('fav')
    expect(useLibraryStore.getState().presets[0].isFavorite).toBe(true)
  })
})
