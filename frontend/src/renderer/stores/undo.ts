import { create } from 'zustand'
import type { UndoEntry } from '../../shared/types'

const MAX_UNDO_ENTRIES = 500

interface UndoState {
  past: UndoEntry[]
  future: UndoEntry[]
  isDirty: boolean

  execute: (entry: UndoEntry) => void
  undo: () => void
  redo: () => void
  clear: () => void
  clearDirty: () => void
}

export const useUndoStore = create<UndoState>((set, get) => ({
  past: [],
  future: [],
  isDirty: false,

  execute: (entry) =>
    set((state) => {
      entry.forward()
      let past = [...state.past, entry]
      // Cap at MAX_UNDO_ENTRIES — drop oldest
      if (past.length > MAX_UNDO_ENTRIES) {
        past = past.slice(past.length - MAX_UNDO_ENTRIES)
      }
      return { past, future: [], isDirty: true }
    }),

  undo: () => {
    const { past, future } = get()
    if (past.length === 0) return

    const entry = past[past.length - 1]
    entry.inverse()

    set({
      past: past.slice(0, -1),
      future: [entry, ...future],
      isDirty: true,
    })
  },

  redo: () => {
    const { past, future } = get()
    if (future.length === 0) return

    const entry = future[0]
    entry.forward()

    let newPast = [...past, entry]
    if (newPast.length > MAX_UNDO_ENTRIES) {
      newPast = newPast.slice(newPast.length - MAX_UNDO_ENTRIES)
    }

    set({
      past: newPast,
      future: future.slice(1),
      isDirty: true,
    })
  },

  clear: () => set({ past: [], future: [], isDirty: false }),

  clearDirty: () => set({ isDirty: false }),
}))
