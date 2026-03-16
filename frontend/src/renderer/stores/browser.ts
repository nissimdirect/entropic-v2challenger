/**
 * Effect browser store — favorites, user folders, collapsed categories.
 * Persisted to localStorage. Introduced in Phase 13B.
 */
import { create } from 'zustand'

interface UserFolder {
  name: string
  effectIds: string[] // effect type IDs (e.g., 'pixelsort'), not instance IDs
}

interface BrowserState {
  favorites: Set<string>        // effect type IDs
  userFolders: UserFolder[]
  collapsedCategories: Set<string>
  hoveredEffectId: string | null

  toggleFavorite: (effectId: string) => void
  isFavorite: (effectId: string) => boolean
  addFolder: (name: string) => void
  removeFolder: (index: number) => void
  renameFolder: (index: number, name: string) => void
  addToFolder: (folderIndex: number, effectId: string) => void
  removeFromFolder: (folderIndex: number, effectId: string) => void
  toggleCategory: (category: string) => void
  isCategoryCollapsed: (category: string) => boolean
  setHoveredEffectId: (id: string | null) => void
}

const STORAGE_KEY = 'entropic-browser'

interface PersistedBrowser {
  favorites: string[]
  userFolders: UserFolder[]
  collapsedCategories: string[]
}

function loadPersisted(): Partial<PersistedBrowser> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return {}
    return {
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
      userFolders: Array.isArray(parsed.userFolders) ? parsed.userFolders : [],
      collapsedCategories: Array.isArray(parsed.collapsedCategories) ? parsed.collapsedCategories : [],
    }
  } catch {
    return {}
  }
}

function persist(state: { favorites: Set<string>; userFolders: UserFolder[]; collapsedCategories: Set<string> }): void {
  try {
    const data: PersistedBrowser = {
      favorites: [...state.favorites],
      userFolders: state.userFolders,
      collapsedCategories: [...state.collapsedCategories],
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // Best-effort
  }
}

const saved = loadPersisted()

export const useBrowserStore = create<BrowserState>((set, get) => ({
  favorites: new Set(saved.favorites ?? []),
  userFolders: saved.userFolders ?? [],
  collapsedCategories: new Set(saved.collapsedCategories ?? []),
  hoveredEffectId: null,

  toggleFavorite: (effectId) => {
    const next = new Set(get().favorites)
    if (next.has(effectId)) {
      next.delete(effectId)
    } else {
      next.add(effectId)
    }
    set({ favorites: next })
    persist(get())
  },

  isFavorite: (effectId) => get().favorites.has(effectId),

  addFolder: (name) => {
    set({ userFolders: [...get().userFolders, { name, effectIds: [] }] })
    persist(get())
  },

  removeFolder: (index) => {
    const folders = [...get().userFolders]
    folders.splice(index, 1)
    set({ userFolders: folders })
    persist(get())
  },

  renameFolder: (index, name) => {
    const folders = [...get().userFolders]
    if (folders[index]) {
      folders[index] = { ...folders[index], name }
      set({ userFolders: folders })
      persist(get())
    }
  },

  addToFolder: (folderIndex, effectId) => {
    const folders = [...get().userFolders]
    const folder = folders[folderIndex]
    if (folder && !folder.effectIds.includes(effectId)) {
      folders[folderIndex] = { ...folder, effectIds: [...folder.effectIds, effectId] }
      set({ userFolders: folders })
      persist(get())
    }
  },

  removeFromFolder: (folderIndex, effectId) => {
    const folders = [...get().userFolders]
    const folder = folders[folderIndex]
    if (folder) {
      folders[folderIndex] = { ...folder, effectIds: folder.effectIds.filter((id) => id !== effectId) }
      set({ userFolders: folders })
      persist(get())
    }
  },

  toggleCategory: (category) => {
    const next = new Set(get().collapsedCategories)
    if (next.has(category)) {
      next.delete(category)
    } else {
      next.add(category)
    }
    set({ collapsedCategories: next })
    persist(get())
  },

  isCategoryCollapsed: (category) => get().collapsedCategories.has(category),

  setHoveredEffectId: (id) => set({ hoveredEffectId: id }),
}))
