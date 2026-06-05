/**
 * B2 — track-bound instruments store.
 *
 * Each Performance/MIDI track owns at most one Sampler instrument, keyed by
 * trackId. Instantiated by dragging "Sampler" from the Instruments browser onto
 * a performance track (clipId starts empty); a source clip is set by dropping a
 * video onto the track's Sampler. The render effect in App.tsx iterates these
 * per-track samplers and appends each as a composite layer.
 *
 * (B1 was a single global sampler; this generalizes it per INSTRUMENTS.md §5 +
 * B1-1VOICE-SAMPLER-PLAN.md "B2 generalizes to a Performance-Track-bound collection".)
 */
import { create } from 'zustand'

import type { SamplerInstrumentV1 } from '../components/instruments/types'

let _counter = 0
function nextId(): string {
  _counter += 1
  return `sampler-${_counter}`
}

interface InstrumentsState {
  /** trackId → its Sampler. A track with no entry has no instrument. */
  instruments: Record<string, SamplerInstrumentV1>
  /** Instantiate a Sampler on a track (no-op if it already has one). clipId '' = unsourced. */
  addSampler: (trackId: string, clipId?: string) => void
  /** Set/replace the source clip (called when a video is dropped on the sampler). */
  setSource: (trackId: string, clipId: string) => void
  /** Patch start/speed/opacity/blend for a track's sampler. */
  updateSampler: (trackId: string, patch: Partial<Omit<SamplerInstrumentV1, 'id' | 'type'>>) => void
  /** Remove a track's sampler (also called on track delete for cleanup). */
  removeSampler: (trackId: string) => void
  getSampler: (trackId: string) => SamplerInstrumentV1 | undefined
}

export const useInstrumentsStore = create<InstrumentsState>((set, get) => ({
  instruments: {},

  addSampler: (trackId, clipId = '') =>
    set((state) =>
      state.instruments[trackId]
        ? state
        : {
            instruments: {
              ...state.instruments,
              [trackId]: {
                id: nextId(),
                type: 'sampler',
                clipId,
                startFrame: 0,
                speed: 1,
                opacity: 1,
                blendMode: 'normal',
              },
            },
          },
    ),

  setSource: (trackId, clipId) =>
    set((state) =>
      state.instruments[trackId]
        ? { instruments: { ...state.instruments, [trackId]: { ...state.instruments[trackId], clipId } } }
        : state,
    ),

  updateSampler: (trackId, patch) =>
    set((state) =>
      state.instruments[trackId]
        ? { instruments: { ...state.instruments, [trackId]: { ...state.instruments[trackId], ...patch } } }
        : state,
    ),

  removeSampler: (trackId) =>
    set((state) => {
      if (!state.instruments[trackId]) return state
      const next = { ...state.instruments }
      delete next[trackId]
      return { instruments: next }
    }),

  getSampler: (trackId) => get().instruments[trackId],
}))
