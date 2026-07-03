/**
 * B3 / L4 — arrangement row-order = z-order (compositing order the backend
 * consumes) + round-trip.
 *
 * The arrangement IS the layer stack: the `tracks` array order is the
 * compositing z-order. Drag-to-restack calls reorderTrack(fromIdx, toIdx); this
 * test asserts (a) reorderTrack changes the array order, (b) the change is one
 * undoable transaction (single Cmd+Z restores prior order), and (c) the new
 * order survives serialize → hydrate (so a restacked comp reloads in the same
 * z-order). Guards the PRD's compositing-order-coupling risk at the store seam.
 */
import { describe, it, expect, beforeEach } from 'vitest'

const mockEntropic = {
  onEngineStatus: () => {},
  sendCommand: async () => ({ ok: true }),
  selectFile: async () => null,
  selectSavePath: async () => null,
  onExportProgress: () => () => {},
  getPathForFile: () => '/test/video.mp4',
}
;(globalThis as unknown as { window: unknown }).window = { entropic: mockEntropic }

import { useTimelineStore } from '../../renderer/stores/timeline'
import { useProjectStore } from '../../renderer/stores/project'
import { useUndoStore } from '../../renderer/stores/undo'
import { useAutomationStore } from '../../renderer/stores/automation'
import { serializeProject, hydrateStores } from '../../renderer/project-persistence'

function reset() {
  useProjectStore.getState().resetProject()
  useTimelineStore.getState().reset()
  useUndoStore.getState().clear()
  useAutomationStore.getState().resetAutomation()
}

function orderNames(): string[] {
  return useTimelineStore.getState().tracks.map((t) => t.name)
}

describe('B3 arrangement restack — row order = z-order', () => {
  beforeEach(reset)

  it('reorderTrack moves a row to a new z-position', () => {
    useTimelineStore.getState().addTrack('T1', '#111111')
    useTimelineStore.getState().addTrack('V1', '#222222')
    useTimelineStore.getState().addTrack('V2', '#333333')
    useUndoStore.getState().clear()
    expect(orderNames()).toEqual(['T1', 'V1', 'V2'])

    // Drag V2 (idx 2) to the front (idx 0).
    useTimelineStore.getState().reorderTrack(2, 0)
    expect(orderNames()).toEqual(['V2', 'T1', 'V1'])
  })

  it('restack is a single undoable transaction', () => {
    useTimelineStore.getState().addTrack('T1', '#111111')
    useTimelineStore.getState().addTrack('V1', '#222222')
    useTimelineStore.getState().addTrack('V2', '#333333')
    useUndoStore.getState().clear()

    useTimelineStore.getState().reorderTrack(0, 2)
    expect(orderNames()).toEqual(['V1', 'V2', 'T1'])

    useUndoStore.getState().undo()
    expect(orderNames()).toEqual(['T1', 'V1', 'V2'])
  })

  it('restacked z-order survives save→reload', () => {
    useTimelineStore.getState().addTrack('T1', '#111111')
    useTimelineStore.getState().addTrack('V1', '#222222')
    useTimelineStore.getState().addTrack('V2', '#333333')
    useUndoStore.getState().clear()

    useTimelineStore.getState().reorderTrack(2, 0)
    const expected = orderNames()
    expect(expected).toEqual(['V2', 'T1', 'V1'])

    const data = JSON.parse(serializeProject())
    reset()
    hydrateStores(data)

    // M.1 (Master-Out Bus PRD): no Master track in this fixture -> hydrate
    // injects one, appended AFTER the restored z-order (never reorders the
    // restacked tracks that came before it).
    expect(orderNames()).toEqual([...expected, 'Master'])
  })
})
