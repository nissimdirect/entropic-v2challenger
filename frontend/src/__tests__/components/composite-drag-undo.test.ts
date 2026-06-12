/**
 * P2.2b (slice 3c) — composite-drag creation flow undoes in ONE transaction.
 *
 * Dropping a Composite on a track header (Track.tsx onDrop / "+ Composite"
 * affordance) creates a TERMINAL CompositeEffect via the validated addEffect
 * transaction (project.ts withCompositeValidation). The creation must:
 *   - land the composite as the chain terminal,
 *   - push exactly ONE undo-history entry (not one per buffered mutation),
 *   - be fully removed by a single undo() — no orphaned terminal state.
 *
 * The drop handler builds `makeCompositeEffect(randomUUID())` and calls
 * `addEffect`; this test exercises that exact store path (the React onDrop is a
 * thin wrapper around it — see Track.tsx handleAddComposite).
 */
import { describe, it, expect, beforeEach } from 'vitest'

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

import { useTimelineStore } from '../../renderer/stores/timeline'
import { useProjectStore } from '../../renderer/stores/project'
import { useUndoStore } from '../../renderer/stores/undo'
import { getTerminalComposite, makeCompositeEffect } from '../../shared/types'
import { randomUUID } from '../../renderer/utils'

function reset() {
  useTimelineStore.getState().reset()
  useProjectStore.getState().resetProject()
  useUndoStore.getState().clear()
}

function chainOf(trackId: string) {
  return useTimelineStore.getState().tracks.find((t) => t.id === trackId)!.effectChain
}

/** Mirror Track.tsx handleAddComposite: build a fresh composite + add it. */
function dropCompositeOnTrack(trackId: string) {
  if (getTerminalComposite(chainOf(trackId))) return
  useProjectStore.getState().addEffect(trackId, makeCompositeEffect(randomUUID()))
}

describe('composite drag undoes in one transaction', () => {
  beforeEach(reset)

  it('composite drag undoes in one transaction', () => {
    const trackId = useTimelineStore.getState().addTrack('V1', '#f00')!
    // No composite yet, empty chain, clean history.
    expect(getTerminalComposite(chainOf(trackId))).toBeNull()
    const beforeHistory = useUndoStore.getState().past.length

    // Simulate the drag-drop creation flow.
    dropCompositeOnTrack(trackId)

    // (1) terminal composite present
    const composite = getTerminalComposite(chainOf(trackId))
    expect(composite).not.toBeNull()
    expect(chainOf(trackId)).toHaveLength(1)

    // (2) exactly ONE history entry was pushed (one transaction, not one per
    // buffered mutation).
    expect(useUndoStore.getState().past.length).toBe(beforeHistory + 1)

    // (3) a single undo removes it entirely — chain empty, no orphan terminal.
    useUndoStore.getState().undo()
    expect(getTerminalComposite(chainOf(trackId))).toBeNull()
    expect(chainOf(trackId)).toHaveLength(0)
    // history is back to the pre-drop depth (the single entry was popped).
    expect(useUndoStore.getState().past.length).toBe(beforeHistory)
  })

  it('a second drop does not create a second composite (terminal stays unique)', () => {
    const trackId = useTimelineStore.getState().addTrack('V1', '#0f0')!
    dropCompositeOnTrack(trackId)
    const firstId = getTerminalComposite(chainOf(trackId))!.id
    const historyAfterFirst = useUndoStore.getState().past.length

    // Second drop is a no-op (the guard hides the affordance + early-returns).
    dropCompositeOnTrack(trackId)
    expect(chainOf(trackId)).toHaveLength(1)
    expect(getTerminalComposite(chainOf(trackId))!.id).toBe(firstId)
    // no new history entry from the no-op second drop.
    expect(useUndoStore.getState().past.length).toBe(historyAfterFirst)
  })
})
