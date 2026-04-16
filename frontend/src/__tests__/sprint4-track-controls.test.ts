/**
 * Sprint 4: Track Controls UI Wiring — verifies setTrackOpacity and
 * setTrackBlendMode store actions update state correctly when called
 * the way the new TrackHeader controls call them.
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

import { useTimelineStore } from '../renderer/stores/timeline'
import { useUndoStore } from '../renderer/stores/undo'

function resetTimeline() {
  useTimelineStore.getState().reset()
  useUndoStore.getState().clear()
}

describe('Track opacity + blend mode UI wiring', () => {
  beforeEach(resetTimeline)

  it('setTrackOpacity updates track.opacity and clamps to [0,1]', () => {
    const id = useTimelineStore.getState().addTrack('V1', '#ff0000')!
    expect(useTimelineStore.getState().tracks.find((t) => t.id === id)?.opacity).toBe(1)

    useTimelineStore.getState().setTrackOpacity(id, 0.5)
    expect(useTimelineStore.getState().tracks.find((t) => t.id === id)?.opacity).toBe(0.5)

    // Clamp below 0
    useTimelineStore.getState().setTrackOpacity(id, -0.5)
    expect(useTimelineStore.getState().tracks.find((t) => t.id === id)?.opacity).toBe(0)

    // Clamp above 1
    useTimelineStore.getState().setTrackOpacity(id, 2.0)
    expect(useTimelineStore.getState().tracks.find((t) => t.id === id)?.opacity).toBe(1)
  })

  it('setTrackBlendMode updates track.blendMode for all 9 modes', () => {
    const id = useTimelineStore.getState().addTrack('V1', '#ff0000')!
    expect(useTimelineStore.getState().tracks.find((t) => t.id === id)?.blendMode).toBe('normal')

    const modes = [
      'add', 'multiply', 'screen', 'overlay',
      'difference', 'exclusion', 'darken', 'lighten', 'normal',
    ] as const

    for (const mode of modes) {
      useTimelineStore.getState().setTrackBlendMode(id, mode)
      expect(useTimelineStore.getState().tracks.find((t) => t.id === id)?.blendMode).toBe(mode)
    }
  })

  it('setTrackOpacity is undoable', () => {
    const id = useTimelineStore.getState().addTrack('V1', '#ff0000')!
    useTimelineStore.getState().setTrackOpacity(id, 0.3)
    expect(useTimelineStore.getState().tracks.find((t) => t.id === id)?.opacity).toBe(0.3)

    useUndoStore.getState().undo()
    expect(useTimelineStore.getState().tracks.find((t) => t.id === id)?.opacity).toBe(1)
  })
})
