/**
 * History panel tests — undo history list UI behavior.
 * Item 4.11 of Phase 4 plan.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

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

import { useUndoStore } from '../../../renderer/stores/undo'

// We test HistoryPanel behavior through its store interactions,
// since it's a thin view layer over the undo store.
// Component render tests would require React test infrastructure
// (jsdom + @testing-library/react), which isn't configured.
// Instead, test the exact logic the component uses.

function makeEntry(description: string) {
  return {
    forward: vi.fn(),
    inverse: vi.fn(),
    description,
    timestamp: Date.now(),
  }
}

describe('HistoryPanel logic', () => {
  beforeEach(() => {
    useUndoStore.getState().clear()
  })

  describe('empty state', () => {
    it('shows no entries when history is empty', () => {
      const { past, future } = useUndoStore.getState()
      const allEntries = [...past, ...future]
      expect(allEntries).toHaveLength(0)
    })
  })

  describe('entry list', () => {
    it('past entries appear in the list', () => {
      useUndoStore.getState().execute(makeEntry('Add Track'))
      useUndoStore.getState().execute(makeEntry('Add Clip'))

      const { past, future } = useUndoStore.getState()
      const allEntries = [...past, ...future]

      expect(allEntries).toHaveLength(2)
      expect(allEntries[0].description).toBe('Add Track')
      expect(allEntries[1].description).toBe('Add Clip')
    })

    it('undo moves entry to future, appearing after past', () => {
      useUndoStore.getState().execute(makeEntry('Add Track'))
      useUndoStore.getState().execute(makeEntry('Add Clip'))
      useUndoStore.getState().undo()

      const { past, future } = useUndoStore.getState()
      const allEntries = [...past, ...future]

      expect(allEntries).toHaveLength(2)
      // past=[Add Track], future=[Add Clip]
      expect(past).toHaveLength(1)
      expect(future).toHaveLength(1)
      expect(allEntries[0].description).toBe('Add Track')
      expect(allEntries[1].description).toBe('Add Clip')
    })

    it('current index is past.length - 1', () => {
      useUndoStore.getState().execute(makeEntry('a1'))
      useUndoStore.getState().execute(makeEntry('a2'))
      useUndoStore.getState().execute(makeEntry('a3'))

      const currentIndex = useUndoStore.getState().past.length - 1
      expect(currentIndex).toBe(2)

      useUndoStore.getState().undo()
      const afterUndo = useUndoStore.getState().past.length - 1
      expect(afterUndo).toBe(1)
    })
  })

  describe('jump to entry (click behavior)', () => {
    it('jump backward triggers multiple undos', () => {
      // Simulate HistoryPanel's handleJump logic
      const e1 = makeEntry('a1')
      const e2 = makeEntry('a2')
      const e3 = makeEntry('a3')
      useUndoStore.getState().execute(e1)
      useUndoStore.getState().execute(e2)
      useUndoStore.getState().execute(e3)

      // Current index is 2 (pointing at a3)
      // Click entry at index 0 (a1) — need 2 undos
      const targetIndex = 0
      const currentIndex = useUndoStore.getState().past.length - 1
      const steps = currentIndex - targetIndex

      for (let i = 0; i < steps; i++) {
        useUndoStore.getState().undo()
      }

      expect(useUndoStore.getState().past).toHaveLength(1)
      expect(useUndoStore.getState().past[0].description).toBe('a1')
      expect(useUndoStore.getState().future).toHaveLength(2)

      // Inverse should have been called for a3 and a2
      expect(e3.inverse).toHaveBeenCalledOnce()
      expect(e2.inverse).toHaveBeenCalledOnce()
      expect(e1.inverse).not.toHaveBeenCalled()
    })

    it('jump forward triggers multiple redos', () => {
      const e1 = makeEntry('a1')
      const e2 = makeEntry('a2')
      const e3 = makeEntry('a3')
      useUndoStore.getState().execute(e1)
      useUndoStore.getState().execute(e2)
      useUndoStore.getState().execute(e3)

      // Undo all
      useUndoStore.getState().undo()
      useUndoStore.getState().undo()
      useUndoStore.getState().undo()

      // Current index is -1, click on index 2 (a3)
      const targetIndex = 2
      const currentIndex = useUndoStore.getState().past.length - 1 // -1
      const steps = targetIndex - currentIndex // 3

      for (let i = 0; i < steps; i++) {
        useUndoStore.getState().redo()
      }

      expect(useUndoStore.getState().past).toHaveLength(3)
      expect(useUndoStore.getState().future).toHaveLength(0)
    })

    it('jump to current index is no-op', () => {
      useUndoStore.getState().execute(makeEntry('a1'))
      useUndoStore.getState().execute(makeEntry('a2'))

      const currentIndex = useUndoStore.getState().past.length - 1
      const targetIndex = currentIndex // same

      // No undo or redo needed
      if (targetIndex < currentIndex) {
        const steps = currentIndex - targetIndex
        for (let i = 0; i < steps; i++) {
          useUndoStore.getState().undo()
        }
      } else if (targetIndex > currentIndex) {
        const steps = targetIndex - currentIndex
        for (let i = 0; i < steps; i++) {
          useUndoStore.getState().redo()
        }
      }

      // State unchanged
      expect(useUndoStore.getState().past).toHaveLength(2)
      expect(useUndoStore.getState().future).toHaveLength(0)
    })
  })

  describe('entry classification', () => {
    it('entries before currentIndex are past (not highlighted)', () => {
      useUndoStore.getState().execute(makeEntry('a1'))
      useUndoStore.getState().execute(makeEntry('a2'))
      useUndoStore.getState().execute(makeEntry('a3'))

      const { past } = useUndoStore.getState()
      const currentIndex = past.length - 1 // 2

      // Index 0 and 1 are past (before current)
      expect(0 < currentIndex).toBe(true)
      expect(1 < currentIndex).toBe(true)
      // Index 2 is current
      expect(2 === currentIndex).toBe(true)
    })

    it('entries after currentIndex are future (dimmed)', () => {
      useUndoStore.getState().execute(makeEntry('a1'))
      useUndoStore.getState().execute(makeEntry('a2'))
      useUndoStore.getState().execute(makeEntry('a3'))
      useUndoStore.getState().undo()

      const { past, future } = useUndoStore.getState()
      const allEntries = [...past, ...future]
      const currentIndex = past.length - 1 // 1

      // Index 2 is future
      expect(2 > currentIndex).toBe(true)
      expect(allEntries[2].description).toBe('a3')
    })
  })

  describe('entry key generation', () => {
    it('entries have unique description+timestamp keys', () => {
      const now = Date.now()
      const e1 = { ...makeEntry('a1'), timestamp: now }
      const e2 = { ...makeEntry('a2'), timestamp: now + 1 }
      const e3 = { ...makeEntry('a1'), timestamp: now + 2 } // same description, different timestamp

      useUndoStore.getState().execute(e1)
      useUndoStore.getState().execute(e2)
      useUndoStore.getState().execute(e3)

      const { past } = useUndoStore.getState()
      const keys = past.map((e) => `${e.description}-${e.timestamp}`)
      const unique = new Set(keys)

      expect(unique.size).toBe(keys.length)
    })
  })
})
