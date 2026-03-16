import { create } from 'zustand'
import type { Preset } from '../../shared/types'

const PRESET_EXT = '.glitchpreset'

interface LibraryState {
  presets: Preset[]
  searchQuery: string
  categoryFilter: string | null
  isLoading: boolean
  /** Generation counter — prevents stale loadPresets from overwriting concurrent saves */
  _generation: number

  loadPresets: () => Promise<void>
  savePreset: (preset: Preset) => Promise<void>
  deletePreset: (id: string) => Promise<void>
  toggleFavorite: (id: string) => void
  setSearch: (query: string) => void
  setCategory: (cat: string | null) => void
  filteredPresets: () => Preset[]
}

async function getPresetDir(): Promise<string> {
  if (typeof window === 'undefined' || !window.entropic) return ''
  const docsPath = await window.entropic.getAppPath('documents')
  return `${docsPath}/Entropic/Presets`
}

function validatePresetFields(parsed: Record<string, unknown>): boolean {
  if (typeof parsed.id !== 'string') return false
  if (typeof parsed.name !== 'string') return false
  if (parsed.type !== 'single_effect' && parsed.type !== 'effect_chain') return false
  if (typeof parsed.created !== 'number') return false
  if (!Array.isArray(parsed.tags)) return false
  // Validate tag elements are strings
  if (!parsed.tags.every((t: unknown) => typeof t === 'string')) return false

  // Validate effectData if present (single_effect)
  if (parsed.type === 'single_effect' && parsed.effectData !== undefined) {
    const ed = parsed.effectData as Record<string, unknown>
    if (typeof ed !== 'object' || ed === null) return false
    if (typeof ed.effectId !== 'string') return false
    if (typeof ed.parameters !== 'object' || ed.parameters === null) return false
  }

  // Validate chainData if present (effect_chain)
  if (parsed.type === 'effect_chain' && parsed.chainData !== undefined) {
    const cd = parsed.chainData as Record<string, unknown>
    if (typeof cd !== 'object' || cd === null) return false
    if (!Array.isArray(cd.effects)) return false
    if (cd.macros !== undefined && !Array.isArray(cd.macros)) return false
  }

  return true
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  presets: [],
  searchQuery: '',
  categoryFilter: null,
  isLoading: false,
  _generation: 0,

  loadPresets: async () => {
    if (typeof window === 'undefined' || !window.entropic) return
    const gen = get()._generation + 1
    set({ isLoading: true, _generation: gen })

    try {
      const dir = await getPresetDir()

      try {
        await window.entropic.mkdirp(dir)
      } catch {
        // May already exist
      }

      let files: string[] = []
      try {
        files = await window.entropic.listFiles(dir, PRESET_EXT)
      } catch {
        // Directory may not exist yet
      }

      const presets: Preset[] = []
      for (const file of files) {
        try {
          const content = await window.entropic.readFile(`${dir}/${file}`)
          const parsed = JSON.parse(content)
          if (validatePresetFields(parsed)) {
            presets.push(parsed)
          }
        } catch {
          // Skip invalid preset files
        }
      }

      presets.sort((a, b) => b.created - a.created)

      // Only apply if no intervening mutation (generation counter guard)
      if (get()._generation === gen) {
        set({ presets, isLoading: false })
      }
    } catch {
      if (get()._generation === gen) {
        set({ isLoading: false })
      }
    }
  },

  savePreset: async (preset) => {
    if (typeof window === 'undefined' || !window.entropic) return

    // Bump generation to invalidate any in-flight loadPresets
    set((state) => ({ _generation: state._generation + 1 }))

    const dir = await getPresetDir()
    try {
      await window.entropic.mkdirp(dir)
      const filename = `${preset.id}${PRESET_EXT}`
      await window.entropic.writeFile(`${dir}/${filename}`, JSON.stringify(preset, null, 2))
    } catch (err) {
      console.error('[Presets] Failed to save preset:', err)
      return
    }

    set((state) => {
      const existing = state.presets.findIndex((p) => p.id === preset.id)
      if (existing >= 0) {
        const updated = [...state.presets]
        updated[existing] = preset
        return { presets: updated }
      }
      return { presets: [preset, ...state.presets] }
    })
  },

  deletePreset: async (id) => {
    if (typeof window === 'undefined' || !window.entropic) return

    const dir = await getPresetDir()
    try {
      await window.entropic.deleteFile(`${dir}/${id}${PRESET_EXT}`)
    } catch {
      // Only proceed if file was already gone — otherwise the preset
      // will reappear on next load (ghost preset bug)
      console.error('[Presets] Failed to delete preset file:', id)
      return
    }

    set((state) => ({
      presets: state.presets.filter((p) => p.id !== id),
    }))
  },

  toggleFavorite: (id) => {
    const preset = get().presets.find((p) => p.id === id)
    if (!preset) return
    const updated = { ...preset, isFavorite: !preset.isFavorite }
    // Update state immediately for responsive UI
    set((state) => ({
      presets: state.presets.map((p) => p.id === id ? updated : p),
    }))
    // Persist to disk in background (fire-and-forget)
    get().savePreset(updated)
  },

  setSearch: (query) => set({ searchQuery: query }),

  setCategory: (cat) => set({ categoryFilter: cat }),

  filteredPresets: () => {
    const { presets, searchQuery, categoryFilter } = get()
    let filtered = presets

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q))
      )
    }

    if (categoryFilter) {
      filtered = filtered.filter((p) =>
        p.tags.includes(categoryFilter)
      )
    }

    return filtered
  },
}))
