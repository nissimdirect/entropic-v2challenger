import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock window.entropic before store import
;(globalThis as any).window = {
  entropic: {
    onEngineStatus: () => {},
    sendCommand: async () => ({ ok: true }),
    selectFile: async () => null,
    selectSavePath: async () => null,
    onExportProgress: () => {},
  },
}

import { useUndoStore } from '../../renderer/stores/undo'
import type { UndoEntry } from '../../shared/types'

function makeEntry(overrides: Partial<UndoEntry> = {}): UndoEntry {
  return {
    forward: overrides.forward ?? vi.fn(),
    inverse: overrides.inverse ?? vi.fn(),
    description: overrides.description ?? 'test action',
    timestamp: overrides.timestamp ?? Date.now(),
  }
}

describe('UndoStore', () => {
  beforeEach(() => {
    useUndoStore.getState().clear()
  })

  it('starts with empty stacks', () => {
    const { past, future, isDirty } = useUndoStore.getState()
    expect(past).toHaveLength(0)
    expect(future).toHaveLength(0)
    expect(isDirty).toBe(false)
  })

  describe('execute', () => {
    it('calls forward and pushes to past', () => {
      const forward = vi.fn()
      const entry = makeEntry({ forward })
      useUndoStore.getState().execute(entry)

      expect(forward).toHaveBeenCalledOnce()
      expect(useUndoStore.getState().past).toHaveLength(1)
    })

    it('clears future on execute', () => {
      // Build up a future stack via execute + undo
      const entry1 = makeEntry()
      const entry2 = makeEntry()
      useUndoStore.getState().execute(entry1)
      useUndoStore.getState().execute(entry2)
      useUndoStore.getState().undo()
      expect(useUndoStore.getState().future).toHaveLength(1)

      // New execute should clear future (linear branching)
      const entry3 = makeEntry()
      useUndoStore.getState().execute(entry3)
      expect(useUndoStore.getState().future).toHaveLength(0)
    })

    it('sets isDirty', () => {
      useUndoStore.getState().execute(makeEntry())
      expect(useUndoStore.getState().isDirty).toBe(true)
    })
  })

  describe('undo', () => {
    it('calls inverse and moves entry to future', () => {
      const inverse = vi.fn()
      const entry = makeEntry({ inverse })
      useUndoStore.getState().execute(entry)

      useUndoStore.getState().undo()

      expect(inverse).toHaveBeenCalledOnce()
      expect(useUndoStore.getState().past).toHaveLength(0)
      expect(useUndoStore.getState().future).toHaveLength(1)
    })

    it('with empty history is no-op', () => {
      // Should not crash
      useUndoStore.getState().undo()
      expect(useUndoStore.getState().past).toHaveLength(0)
      expect(useUndoStore.getState().future).toHaveLength(0)
    })
  })

  describe('redo', () => {
    it('calls forward and moves entry back to past', () => {
      const forward = vi.fn()
      const entry = makeEntry({ forward })
      useUndoStore.getState().execute(entry)
      expect(forward).toHaveBeenCalledTimes(1)

      useUndoStore.getState().undo()
      useUndoStore.getState().redo()

      expect(forward).toHaveBeenCalledTimes(2)
      expect(useUndoStore.getState().past).toHaveLength(1)
      expect(useUndoStore.getState().future).toHaveLength(0)
    })

    it('with empty future is no-op', () => {
      useUndoStore.getState().execute(makeEntry())
      // No undo first — future is empty
      useUndoStore.getState().redo()
      expect(useUndoStore.getState().past).toHaveLength(1)
    })
  })

  describe('500 entry cap', () => {
    it('drops oldest entries when cap exceeded', () => {
      for (let i = 0; i < 505; i++) {
        useUndoStore.getState().execute(makeEntry({ description: `action-${i}` }))
      }
      expect(useUndoStore.getState().past).toHaveLength(500)
      // Oldest should be action-5 (0-4 dropped)
      expect(useUndoStore.getState().past[0].description).toBe('action-5')
    })
  })

  describe('linear branching', () => {
    it('executing after undo clears the future stack', () => {
      useUndoStore.getState().execute(makeEntry({ description: 'a1' }))
      useUndoStore.getState().execute(makeEntry({ description: 'a2' }))
      useUndoStore.getState().execute(makeEntry({ description: 'a3' }))

      // Undo twice: past=[a1], future=[a2, a3]
      useUndoStore.getState().undo()
      useUndoStore.getState().undo()
      expect(useUndoStore.getState().past).toHaveLength(1)
      expect(useUndoStore.getState().future).toHaveLength(2)

      // Execute new action: past=[a1, a4], future=[]
      useUndoStore.getState().execute(makeEntry({ description: 'a4' }))
      expect(useUndoStore.getState().past).toHaveLength(2)
      expect(useUndoStore.getState().future).toHaveLength(0)
      expect(useUndoStore.getState().past[1].description).toBe('a4')
    })
  })

  describe('isDirty', () => {
    it('set on execute', () => {
      useUndoStore.getState().execute(makeEntry())
      expect(useUndoStore.getState().isDirty).toBe(true)
    })

    it('cleared on clear()', () => {
      useUndoStore.getState().execute(makeEntry())
      useUndoStore.getState().clear()
      expect(useUndoStore.getState().isDirty).toBe(false)
    })

    it('cleared on clearDirty()', () => {
      useUndoStore.getState().execute(makeEntry())
      useUndoStore.getState().clearDirty()
      expect(useUndoStore.getState().isDirty).toBe(false)
    })
  })

  describe('undo/redo integration', () => {
    it('multiple undo then redo restores state', () => {
      let value = 0
      const entry1 = makeEntry({
        forward: () => { value = 1 },
        inverse: () => { value = 0 },
      })
      const entry2 = makeEntry({
        forward: () => { value = 2 },
        inverse: () => { value = 1 },
      })

      useUndoStore.getState().execute(entry1) // value=1
      expect(value).toBe(1)

      useUndoStore.getState().execute(entry2) // value=2
      expect(value).toBe(2)

      useUndoStore.getState().undo() // value=1
      expect(value).toBe(1)

      useUndoStore.getState().undo() // value=0
      expect(value).toBe(0)

      useUndoStore.getState().redo() // value=1
      expect(value).toBe(1)

      useUndoStore.getState().redo() // value=2
      expect(value).toBe(2)
    })
  })
})
