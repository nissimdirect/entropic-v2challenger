/**
 * P2.2a (slice 3c) — terminal-only Composite validator tests.
 *
 * Compositing is a single TERMINAL CompositeEffect at the END of a track's
 * effect chain (Decision D1 clean break — track-level opacity/blendMode removed).
 * These tests pin the placement rules enforced at TRANSACTION COMMIT:
 *   - composite must be the last chain entry (mid-chain rejected);
 *   - audio tracks never carry a composite (rejected in addEffect + reorderEffect);
 *   - a composite must not live inside a DeviceGroup;
 *   - intermediate states inside an open transaction are NOT validated.
 *
 * The named tests below match the packet's required titles verbatim.
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
import { useUndoStore, undoable } from '../../renderer/stores/undo'
import {
  getTerminalComposite,
  isCompositeEffect,
  type EffectInstance,
  type BlendMode,
} from '../../shared/types'

function reset() {
  useTimelineStore.getState().reset()
  useProjectStore.getState().resetProject()
  useUndoStore.getState().clear()
}

let _seq = 0
function makeEffect(effectId: string): EffectInstance {
  return {
    id: `eff-${effectId}-${_seq++}`,
    effectId,
    isEnabled: true,
    isFrozen: false,
    parameters: {},
    modulations: {},
    mix: 1,
    mask: null,
  }
}

function makeComposite(opacity = 1, mode: BlendMode = 'normal'): EffectInstance {
  return {
    id: `composite-${_seq++}`,
    effectId: 'composite',
    isEnabled: true,
    isFrozen: false,
    parameters: { opacity, mode },
    modulations: {},
    mix: 1,
    mask: null,
  }
}

function chainOf(trackId: string): EffectInstance[] {
  return useTimelineStore.getState().tracks.find((t) => t.id === trackId)!.effectChain
}

describe('composite-terminal-validator', () => {
  beforeEach(reset)

  it('rejects composite mid-chain', () => {
    const id = useTimelineStore.getState().addTrack('V1', '#f00')!
    // A composite is added, then a non-composite effect is added AFTER it,
    // pushing the composite off the terminal position. The commit validator on
    // the second add must reject and roll back, leaving the composite terminal.
    useProjectStore.getState().addEffect(id, makeComposite())
    expect(getTerminalComposite(chainOf(id))).not.toBeNull()

    const trailing = makeEffect('blur')
    useProjectStore.getState().addEffect(id, trailing)

    // The trailing add was rolled back: composite is still the last entry and
    // the trailing effect is NOT present.
    const chain = chainOf(id)
    expect(isCompositeEffect(chain[chain.length - 1])).toBe(true)
    expect(chain.some((e) => e.id === trailing.id)).toBe(false)
  })

  it('rejects composite on audio track via addEffect', () => {
    // Build an audio track directly (addTrack defaults to video).
    useTimelineStore.setState((s) => ({
      tracks: [
        ...s.tracks,
        {
          id: 'audio-1',
          type: 'audio',
          name: 'A1',
          color: '#0f0',
          isMuted: false,
          isSoloed: false,
          clips: [],
          effectChain: [],
          automationLanes: [],
        },
      ],
    }))

    useProjectStore.getState().addEffect('audio-1', makeComposite())
    // Rejected up front — no composite landed on the audio track.
    expect(getTerminalComposite(chainOf('audio-1'))).toBeNull()
    expect(chainOf('audio-1')).toHaveLength(0)
  })

  it('rejects composite on audio track via reorderEffect', () => {
    // Seed an audio track that already (illegitimately) holds a regular effect
    // and a composite, then attempt to reorder. The commit validator sees a
    // composite on an audio track and rolls the reorder back.
    const composite = makeComposite()
    const blur = makeEffect('blur')
    useTimelineStore.setState((s) => ({
      tracks: [
        ...s.tracks,
        {
          id: 'audio-2',
          type: 'audio',
          name: 'A2',
          color: '#0f0',
          isMuted: false,
          isSoloed: false,
          clips: [],
          effectChain: [blur, composite],
          automationLanes: [],
        },
      ],
    }))

    const before = chainOf('audio-2').map((e) => e.id)
    useProjectStore.getState().reorderEffect('audio-2', 0, 1)
    // Reorder rolled back — order unchanged because the resulting chain is
    // invalid (composite on an audio track).
    expect(chainOf('audio-2').map((e) => e.id)).toEqual(before)
  })

  it('rejects composite inside DeviceGroup', () => {
    const id = useTimelineStore.getState().addTrack('V2', '#00f')!
    const effA = makeEffect('blur')
    const composite = makeComposite()
    // Place a regular effect then a terminal composite.
    useProjectStore.getState().addEffect(id, effA)
    useProjectStore.getState().addEffect(id, composite)

    // Attempt to group the regular effect with the composite — must be rejected.
    const groupId = useProjectStore.getState().groupEffects(id, [effA.id, composite.id])
    expect(groupId).toBeNull()
    expect(Object.keys(useProjectStore.getState().deviceGroups)).toHaveLength(0)
  })

  it('allows intermediate states mid-transaction', () => {
    const id = useTimelineStore.getState().addTrack('V3', '#ff0')!
    const composite = makeComposite()
    const blur = makeEffect('blur')
    const setChain = (next: EffectInstance[]) =>
      useTimelineStore.getState().updateTrackEffectChain(id, () => next)

    // Inside ONE transaction (buffered via undoable() so the commit validator
    // runs at commit): add the composite (terminal, valid), then add a trailing
    // effect so the composite is mid-chain (INVALID intermediate), then reorder
    // the composite back to the end (valid final). Validation runs only at commit,
    // so the invalid intermediate must NOT abort; the valid final chain persists.
    const undo = useUndoStore.getState()
    undo.beginTransaction('multi-step composite edit')
    undoable('step1', () => setChain([composite]), () => setChain([]))                       // [composite] valid
    undoable('step2', () => setChain([composite, blur]), () => setChain([composite]))         // [composite, blur] INVALID mid-chain
    undoable('step3', () => setChain([blur, composite]), () => setChain([composite, blur]))    // [blur, composite] valid terminal
    undo.commitTransaction()

    const chain = chainOf(id)
    expect(chain.map((e) => e.id)).toEqual([blur.id, composite.id])
    expect(isCompositeEffect(chain[chain.length - 1])).toBe(true)
    // The transaction committed (was not rolled back): it is on the undo stack.
    expect(useUndoStore.getState().past.length).toBeGreaterThan(0)
  })
})
