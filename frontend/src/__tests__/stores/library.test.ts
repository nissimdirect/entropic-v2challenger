import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Preset } from '../../shared/types'

// Mock window.entropic
const mockSendCommand = vi.fn()
const mockReadFile = vi.fn()
const mockWriteFile = vi.fn()
const mockDeleteFile = vi.fn()
const mockListFiles = vi.fn()
const mockMkdirp = vi.fn()
const mockGetAppPath = vi.fn()

;(globalThis as any).window = {
  entropic: {
    sendCommand: mockSendCommand,
    onEngineStatus: () => {},
    selectFile: async () => null,
    selectSavePath: async () => null,
    onExportProgress: () => () => {},
    readFile: mockReadFile,
    writeFile: mockWriteFile,
    deleteFile: mockDeleteFile,
    listFiles: mockListFiles,
    mkdirp: mockMkdirp,
    getAppPath: mockGetAppPath,
  },
}

import { useLibraryStore } from '../../renderer/stores/library'

function makePreset(overrides: Partial<Preset> = {}): Preset {
  return {
    id: 'preset-1',
    name: 'Test Preset',
    type: 'single_effect',
    created: Date.now(),
    tags: ['glitch'],
    isFavorite: false,
    effectData: {
      effectId: 'fx.invert',
      parameters: {},
      modulations: {},
    },
    ...overrides,
  }
}

describe('useLibraryStore', () => {
  beforeEach(() => {
    useLibraryStore.setState({
      presets: [],
      searchQuery: '',
      categoryFilter: null,
      isLoading: false,
    })
    vi.clearAllMocks()
    mockGetAppPath.mockResolvedValue('/Users/test/Documents')
  })

  it('starts empty', () => {
    const state = useLibraryStore.getState()
    expect(state.presets).toEqual([])
    expect(state.searchQuery).toBe('')
    expect(state.categoryFilter).toBeNull()
    expect(state.isLoading).toBe(false)
  })

  it('loadPresets reads files from disk', async () => {
    const preset = makePreset({ id: 'p1', name: 'Glitch Burn' })
    mockListFiles.mockResolvedValue(['p1.glitchpreset'])
    mockReadFile.mockResolvedValue(JSON.stringify(preset))

    await useLibraryStore.getState().loadPresets()

    expect(useLibraryStore.getState().presets).toHaveLength(1)
    expect(useLibraryStore.getState().presets[0].name).toBe('Glitch Burn')
    expect(useLibraryStore.getState().isLoading).toBe(false)
  })

  it('loadPresets skips invalid files', async () => {
    mockListFiles.mockResolvedValue(['bad.glitchpreset', 'good.glitchpreset'])
    mockReadFile
      .mockResolvedValueOnce('not json')
      .mockResolvedValueOnce(JSON.stringify(makePreset({ id: 'good' })))

    await useLibraryStore.getState().loadPresets()

    expect(useLibraryStore.getState().presets).toHaveLength(1)
    expect(useLibraryStore.getState().presets[0].id).toBe('good')
  })

  it('savePreset writes to disk and updates state', async () => {
    const preset = makePreset({ id: 'save-1', name: 'My Effect' })

    await useLibraryStore.getState().savePreset(preset)

    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining('save-1.glitchpreset'),
      expect.any(String)
    )
    expect(useLibraryStore.getState().presets).toHaveLength(1)
    expect(useLibraryStore.getState().presets[0].id).toBe('save-1')
  })

  it('savePreset updates existing preset', async () => {
    const preset = makePreset({ id: 'u1', name: 'Original' })
    await useLibraryStore.getState().savePreset(preset)

    const updated = { ...preset, name: 'Updated' }
    await useLibraryStore.getState().savePreset(updated)

    expect(useLibraryStore.getState().presets).toHaveLength(1)
    expect(useLibraryStore.getState().presets[0].name).toBe('Updated')
  })

  it('deletePreset removes from state and disk', async () => {
    const preset = makePreset({ id: 'del-1' })
    await useLibraryStore.getState().savePreset(preset)
    expect(useLibraryStore.getState().presets).toHaveLength(1)

    await useLibraryStore.getState().deletePreset('del-1')

    expect(useLibraryStore.getState().presets).toHaveLength(0)
    expect(mockDeleteFile).toHaveBeenCalledWith(
      expect.stringContaining('del-1.glitchpreset')
    )
  })

  it('toggleFavorite flips isFavorite', async () => {
    const preset = makePreset({ id: 'fav-1', isFavorite: false })
    await useLibraryStore.getState().savePreset(preset)

    useLibraryStore.getState().toggleFavorite('fav-1')
    expect(useLibraryStore.getState().presets[0].isFavorite).toBe(true)

    useLibraryStore.getState().toggleFavorite('fav-1')
    expect(useLibraryStore.getState().presets[0].isFavorite).toBe(false)
  })

  it('setSearch updates searchQuery', () => {
    useLibraryStore.getState().setSearch('glitch')
    expect(useLibraryStore.getState().searchQuery).toBe('glitch')
  })

  it('setCategory updates categoryFilter', () => {
    useLibraryStore.getState().setCategory('temporal')
    expect(useLibraryStore.getState().categoryFilter).toBe('temporal')

    useLibraryStore.getState().setCategory(null)
    expect(useLibraryStore.getState().categoryFilter).toBeNull()
  })

  it('filteredPresets filters by search query', async () => {
    await useLibraryStore.getState().savePreset(makePreset({ id: 'a', name: 'Pixel Burn' }))
    await useLibraryStore.getState().savePreset(makePreset({ id: 'b', name: 'Color Shift' }))

    useLibraryStore.getState().setSearch('pixel')
    const filtered = useLibraryStore.getState().filteredPresets()
    expect(filtered).toHaveLength(1)
    expect(filtered[0].name).toBe('Pixel Burn')
  })

  it('filteredPresets filters by tag', async () => {
    await useLibraryStore.getState().savePreset(makePreset({ id: 'x', tags: ['glitch', 'color'] }))
    await useLibraryStore.getState().savePreset(makePreset({ id: 'y', tags: ['temporal'] }))

    useLibraryStore.getState().setCategory('temporal')
    const filtered = useLibraryStore.getState().filteredPresets()
    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe('y')
  })

  it('filteredPresets combines search + category', async () => {
    await useLibraryStore.getState().savePreset(makePreset({ id: 'a', name: 'Pixel Burn', tags: ['glitch'] }))
    await useLibraryStore.getState().savePreset(makePreset({ id: 'b', name: 'Pixel Shift', tags: ['color'] }))

    useLibraryStore.getState().setSearch('pixel')
    useLibraryStore.getState().setCategory('glitch')
    const filtered = useLibraryStore.getState().filteredPresets()
    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe('a')
  })
})
