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
const MAX_REDO_ENTRIES = 500

interface UndoState {
  past: UndoEntry[]
  future: UndoEntry[]
  isDirty: boolean
  /** Active transaction — mutations buffered until commitTransaction() */
  _transaction: { description: string; entries: UndoEntry[] } | null

  execute: (entry: UndoEntry) => void
  undo: () => void
  redo: () => void
  clear: () => void
  clearDirty: () => void
  /** Begin a transaction — all undoable() calls between begin/commit are coalesced into one undo entry */
  beginTransaction: (description: string) => void
  /** Commit the current transaction as a single undo entry */
  commitTransaction: () => void
  /** Abort the current transaction and undo all buffered mutations */
  abortTransaction: () => void
}

/**
 * P2.2a (slice 3c) — transaction-commit validator hook.
 *
 * A validator registered here runs at commitTransaction() AFTER the buffered
 * mutations have already been applied to the stores (so it sees the final,
 * post-transaction state) but BEFORE the entry is pushed to the undo stack.
 * If it returns a non-null error string, the transaction is ABORTED (its
 * buffered inverses are replayed in reverse, rolling the stores back) and the
 * error is returned to the caller — never pushed to the stack.
 *
 * This is how the terminal-Composite chain rules are enforced "at transaction
 * commit, not per mutation": intermediate states inside an open transaction are
 * never validated, only the committed result. Registered by project.ts.
 */
type CommitValidator = () => string | null
let commitValidator: CommitValidator | null = null

/** Register the transaction-commit validator. Pass null to clear (tests). */
export function setCommitValidator(fn: CommitValidator | null): void {
  commitValidator = fn
}

export const useUndoStore = create<UndoState>((set, get) => ({
  past: [],
  future: [],
  isDirty: false,
  _transaction: null,

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

    let newFuture = [entry, ...future]
    if (newFuture.length > MAX_REDO_ENTRIES) {
      newFuture = newFuture.slice(0, MAX_REDO_ENTRIES)
    }

    set({
      past: past.slice(0, -1),
      future: newFuture,
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

  beginTransaction: (description) => {
    if (get()._transaction) {
      // Already in a transaction — commit the previous one first
      get().commitTransaction()
    }
    set({ _transaction: { description, entries: [] } })
  },

  commitTransaction: () => {
    const tx = get()._transaction
    if (!tx || tx.entries.length === 0) {
      set({ _transaction: null })
      return
    }

    // P2.2a: validate the committed (already-applied) state before pushing.
    // The mutations are live in the stores at this point, so the validator sees
    // the final transaction result. A violation rolls the whole transaction back
    // (replay buffered inverses in reverse) and surfaces a toast — nothing reaches
    // the undo stack. This is the "validate at commit, not per mutation" contract.
    if (commitValidator) {
      const error = commitValidator()
      if (error) {
        for (let i = tx.entries.length - 1; i >= 0; i--) {
          tx.entries[i].inverse()
        }
        set({ _transaction: null })
        useToastStore.getState().addToast({
          level: 'warning',
          message: error,
          source: 'composite-validator',
        })
        return
      }
    }

    // Coalesce all buffered entries into a single undo entry
    const entries = [...tx.entries]
    const compositeEntry: UndoEntry = {
      description: tx.description,
      timestamp: Date.now(),
      forward: () => {
        for (const e of entries) e.forward()
      },
      inverse: () => {
        // Replay inverses in reverse order
        for (let i = entries.length - 1; i >= 0; i--) {
          entries[i].inverse()
        }
      },
    }

    set((state) => {
      let past = [...state.past, compositeEntry]
      if (past.length > MAX_UNDO_ENTRIES) {
        past = past.slice(past.length - MAX_UNDO_ENTRIES)
      }
      return { past, future: [], isDirty: true, _transaction: null }
    })
  },

  abortTransaction: () => {
    const tx = get()._transaction
    if (!tx) return
    // Undo all buffered mutations in reverse
    for (let i = tx.entries.length - 1; i >= 0; i--) {
      tx.entries[i].inverse()
    }
    set({ _transaction: null })
  },
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

  // If inside a transaction, buffer the entry instead of pushing to main stack
  const tx = useUndoStore.getState()._transaction
  if (tx) {
    tx.entries.push(entry)
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
