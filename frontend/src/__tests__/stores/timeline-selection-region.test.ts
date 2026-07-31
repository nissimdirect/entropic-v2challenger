/**
 * W1.5b PK.A4 — timeline.ts selectionRegion store oracle.
 *
 * setSelectionRegion/clearSelectionRegion are plain (NOT undoable — R3
 * reconciliation, same tier as scrollX/zoom/selectedTrackId). Also covers
 * the "Cmd+L copies exactly" oracle: App.tsx's `copy_selection_to_loop`
 * handler is a two-line closure (`if (region) setLoopRegion(region.in,
 * region.out)`) — mirrored here at the store level rather than mounting
 * App.tsx, matching this suite's existing logic-mirror convention (see
 * marquee-overlay.test.ts).
 */

;(globalThis as any).window = {
  entropic: {
    onEngineStatus: () => {},
    sendCommand: async () => ({ ok: true }),
    selectFile: async () => null,
    selectSavePath: async () => null,
    onExportProgress: () => {},
  },
}

import { describe, it, expect, beforeEach } from 'vitest'
import { useTimelineStore } from '../../renderer/stores/timeline'
import { useUndoStore } from '../../renderer/stores/undo'

beforeEach(() => {
  useTimelineStore.getState().reset()
  useUndoStore.getState().clear()
})

/** Mirrors App.tsx's `copy_selection_to_loop` shortcut handler exactly. */
function copySelectionToLoop() {
  const timeline = useTimelineStore.getState()
  const region = timeline.selectionRegion
  if (region) timeline.setLoopRegion(region.in, region.out)
}

describe('setSelectionRegion / clearSelectionRegion', () => {
  it('sets and reads back the region', () => {
    useTimelineStore.getState().setSelectionRegion({ in: 2, out: 5 })
    expect(useTimelineStore.getState().selectionRegion).toEqual({ in: 2, out: 5 })
  })

  it('overwrites a prior region (live-preview semantics — no accumulation)', () => {
    useTimelineStore.getState().setSelectionRegion({ in: 2, out: 5 })
    useTimelineStore.getState().setSelectionRegion({ in: 3, out: 4 })
    expect(useTimelineStore.getState().selectionRegion).toEqual({ in: 3, out: 4 })
  })

  it('clearSelectionRegion nulls it out', () => {
    useTimelineStore.getState().setSelectionRegion({ in: 2, out: 5 })
    useTimelineStore.getState().clearSelectionRegion()
    expect(useTimelineStore.getState().selectionRegion).toBeNull()
  })

  it('starts null after reset()', () => {
    useTimelineStore.getState().setSelectionRegion({ in: 2, out: 5 })
    useTimelineStore.getState().reset()
    expect(useTimelineStore.getState().selectionRegion).toBeNull()
  })

  it('is undo-transparent: setSelectionRegion pushes NO undo entry (R3 reconciliation)', () => {
    const before = useUndoStore.getState().past.length
    useTimelineStore.getState().setSelectionRegion({ in: 2, out: 5 })
    expect(useUndoStore.getState().past.length).toBe(before)
  })

  it('is undo-transparent: clearSelectionRegion pushes NO undo entry', () => {
    useTimelineStore.getState().setSelectionRegion({ in: 2, out: 5 })
    const before = useUndoStore.getState().past.length
    useTimelineStore.getState().clearSelectionRegion()
    expect(useUndoStore.getState().past.length).toBe(before)
  })
})

describe('Cmd+L — copy selection to loop (D12)', () => {
  it('copies the selectionRegion into loopRegion exactly', () => {
    useTimelineStore.getState().setSelectionRegion({ in: 4, out: 9.5 })
    copySelectionToLoop()
    expect(useTimelineStore.getState().loopRegion).toEqual({ in: 4, out: 9.5 })
  })

  it('is a no-op when there is no active selection', () => {
    expect(useTimelineStore.getState().selectionRegion).toBeNull()
    copySelectionToLoop()
    expect(useTimelineStore.getState().loopRegion).toBeNull()
  })

  it('does not mutate selectionRegion itself (loop brace stays independently settable per D12)', () => {
    useTimelineStore.getState().setSelectionRegion({ in: 1, out: 3 })
    copySelectionToLoop()
    // Loop copy is undoable (existing setLoopRegion) — moving it independently afterwards must not touch selectionRegion.
    useTimelineStore.getState().setLoopRegion(10, 20)
    expect(useTimelineStore.getState().selectionRegion).toEqual({ in: 1, out: 3 })
    expect(useTimelineStore.getState().loopRegion).toEqual({ in: 10, out: 20 })
  })

  it('setLoopRegion via Cmd+L IS undoable (unlike selectionRegion itself)', () => {
    useTimelineStore.getState().setSelectionRegion({ in: 1, out: 3 })
    const before = useUndoStore.getState().past.length
    copySelectionToLoop()
    expect(useUndoStore.getState().past.length).toBe(before + 1)
    useUndoStore.getState().undo()
    expect(useTimelineStore.getState().loopRegion).toBeNull()
  })
})
