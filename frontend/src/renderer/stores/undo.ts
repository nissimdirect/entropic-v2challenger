/**
 * UNDO CONVENTIONS:
 * - Use undoable(description, forward, inverse) for all undoable actions
 * - Capture entity ID, never array index: const id = entity.id; ... find(e => e.id === id)
 * - Pre-generate UUIDs BEFORE the undoable() call: const newId = randomUUID()
 * - Cross-store cleanup goes INSIDE forward(); inverse must RESTORE cleaned data
 */
import { create } from 'zustand'
import type { UndoEntry } from '../../shared/types'
import { useToastStore } from './toast'

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

  execute: (entry) => {
    try {
      entry.forward()
    } catch (err) {
      // forward() threw — still push so user can undo partial damage
      pushToStack(entry)
      useToastStore.getState().addToast({
        level: 'error',
        message: `Action "${entry.description}" failed: ${err instanceof Error ? err.message : 'unknown error'}`,
        source: 'undo',
      })
      return
    }
    set((state) => {
      let past = [...state.past, entry]
      if (past.length > MAX_UNDO_ENTRIES) {
        past = past.slice(past.length - MAX_UNDO_ENTRIES)
      }
      return { past, future: [], isDirty: true }
    })
  },

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

/**
 * Wrap a destructive action in undo/redo. Enforces:
 * - forward() runs OUTSIDE set() (crash safety — if it throws, stack stays clean)
 * - Pre-generated IDs passed in (deterministic redo)
 * - Structured description for history panel
 * - Error surfaced via toast if forward() throws
 */
export function undoable(
  description: string,
  forward: () => void,
  inverse: () => void,
): void {
  const entry: UndoEntry = {
    forward,
    inverse,
    description,
    timestamp: Date.now(),
  }
  try {
    entry.forward()
  } catch (err) {
    // forward() threw after partial side effects.
    // Still push to stack so user can undo the partial damage.
    pushToStack(entry)
    useToastStore.getState().addToast({
      level: 'error',
      message: `Action "${description}" failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      source: 'undo',
    })
    return
  }
  pushToStack(entry)
}

function pushToStack(entry: UndoEntry): void {
  useUndoStore.setState((state) => {
    let past = [...state.past, entry]
    if (past.length > MAX_UNDO_ENTRIES) {
      past = past.slice(past.length - MAX_UNDO_ENTRIES)
    }
    return { past, future: [], isDirty: true }
  })
}
