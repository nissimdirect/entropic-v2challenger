/**
 * B1 — minimal instruments store (single sampler).
 *
 * B1 holds ONE sampler instrument (no polyphony, no FSM — that's B2). The
 * render effect in App.tsx subscribes to `instrument` and appends
 * computeSamplerVoice(...) to the render_composite layers when it's non-null
 * and a base clip exists. B2 generalizes this to a Performance-Track-bound
 * collection.
 */
import { create } from 'zustand'

import type { SamplerInstrumentV1 } from '../components/instruments/types'

let _counter = 0
function nextId(): string {
  _counter += 1
  return `sampler-${_counter}`
}

interface InstrumentsState {
  instrument: SamplerInstrumentV1 | null
  addSampler: (clipId: string) => void
  updateSampler: (patch: Partial<Omit<SamplerInstrumentV1, 'id' | 'type'>>) => void
  removeSampler: () => void
}

export const useInstrumentsStore = create<InstrumentsState>((set) => ({
  instrument: null,

  addSampler: (clipId) =>
    set({
      instrument: {
        id: nextId(),
        type: 'sampler',
        clipId,
        startFrame: 0,
        speed: 1,
        opacity: 1,
        blendMode: 'normal',
      },
    }),

  updateSampler: (patch) =>
    set((state) =>
      state.instrument
        ? { instrument: { ...state.instrument, ...patch } }
        : state,
    ),

  removeSampler: () => set({ instrument: null }),
}))
