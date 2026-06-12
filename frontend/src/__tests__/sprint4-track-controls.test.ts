/**
 * Sprint 4: Track Controls UI Wiring.
 *
 * P2.2a (slice 3c): track compositing migrated from Track.opacity/blendMode
 * setters to a terminal CompositeEffect on the chain. Opacity/blend are now read
 * via getTrackCompositing and edited via updateParam on the composite effect.
 * These tests verify that resolution + clamp + undoability through the new model.
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
import { useProjectStore } from '../renderer/stores/project'
import { getTrackCompositing, type EffectInstance, type BlendMode } from '../shared/types'

function resetTimeline() {
  useTimelineStore.getState().reset()
  useUndoStore.getState().clear()
}

/** Add a terminal composite to a track and return its effect id. */
function addComposite(trackId: string, opacity = 1, mode: BlendMode = 'normal'): string {
  const composite: EffectInstance = {
    id: `composite-${trackId}`,
    effectId: 'composite',
    isEnabled: true,
    isFrozen: false,
    parameters: { opacity, mode },
    modulations: {},
    mix: 1,
    mask: null,
  }
  useProjectStore.getState().addEffect(trackId, composite)
  return composite.id
}

function chainOf(trackId: string): EffectInstance[] {
  return useTimelineStore.getState().tracks.find((t) => t.id === trackId)!.effectChain
}

describe('Track opacity + blend mode UI wiring (terminal composite)', () => {
  beforeEach(resetTimeline)

  it('composite opacity resolves and clamps to [0,1] via getTrackCompositing', () => {
    const id = useTimelineStore.getState().addTrack('V1', '#ff0000')!
    const cid = addComposite(id)
    expect(getTrackCompositing(chainOf(id)).opacity).toBe(1)

    useProjectStore.getState().updateParam(id, cid, 'opacity', 0.5)
    expect(getTrackCompositing(chainOf(id)).opacity).toBe(0.5)

    // Clamp below 0
    useProjectStore.getState().updateParam(id, cid, 'opacity', -0.5)
    expect(getTrackCompositing(chainOf(id)).opacity).toBe(0)

    // Clamp above 1
    useProjectStore.getState().updateParam(id, cid, 'opacity', 2.0)
    expect(getTrackCompositing(chainOf(id)).opacity).toBe(1)
  })

  it('composite blend mode resolves for all 9 modes via getTrackCompositing', () => {
    const id = useTimelineStore.getState().addTrack('V1', '#ff0000')!
    const cid = addComposite(id)
    expect(getTrackCompositing(chainOf(id)).mode).toBe('normal')

    const modes: BlendMode[] = [
      'add', 'multiply', 'screen', 'overlay',
      'difference', 'exclusion', 'darken', 'lighten', 'normal',
    ]

    for (const mode of modes) {
      useProjectStore.getState().updateParam(id, cid, 'mode', mode)
      expect(getTrackCompositing(chainOf(id)).mode).toBe(mode)
    }
  })

  it('composite opacity edit is undoable', () => {
    const id = useTimelineStore.getState().addTrack('V1', '#ff0000')!
    const cid = addComposite(id)
    useProjectStore.getState().updateParam(id, cid, 'opacity', 0.3)
    expect(getTrackCompositing(chainOf(id)).opacity).toBe(0.3)

    useUndoStore.getState().undo()
    expect(getTrackCompositing(chainOf(id)).opacity).toBe(1)
  })
})
