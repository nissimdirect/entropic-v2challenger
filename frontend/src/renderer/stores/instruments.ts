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

import type { SamplerInstrumentV1, RackNode, RackPad } from '../components/instruments/types'

let _counter = 0
function nextId(): string {
  _counter += 1
  return `sampler-${_counter}`
}

let _rackCounter = 0
function nextRackId(): string {
  _rackCounter += 1
  return `rack-${_rackCounter}`
}

let _padCounter = 0
function nextPadId(): string {
  _padCounter += 1
  return `rackpad-${_padCounter}`
}

/** B4.1 — a fresh pad channel with an unsourced sampler leaf. */
export function createRackPad(): RackPad {
  return {
    id: nextPadId(),
    instrument: {
      id: nextId(),
      type: 'sampler',
      clipId: '',
      startFrame: 0,
      speed: 1,
      opacity: 1,
      blendMode: 'normal',
    },
    opacity: 1,
    blend: 'normal',
    mute: false,
    solo: false,
  }
}

interface InstrumentsState {
  /** trackId → its Sampler. A track with no entry has no instrument. */
  instruments: Record<string, SamplerInstrumentV1>
  /**
   * B4.1 — trackId → its Sample Rack. A track with no entry has no rack.
   * Additive to `instruments`: a track holds EITHER a bare sampler OR a rack.
   * Persisted alongside `instruments` (additive optional, no version bump).
   */
  racks: Record<string, RackNode>
  /** Instantiate a Sampler on a track (no-op if it already has one). clipId '' = unsourced. */
  addSampler: (trackId: string, clipId?: string) => void
  /** Set/replace the source clip (called when a video is dropped on the sampler). */
  setSource: (trackId: string, clipId: string) => void
  /** Patch start/speed/opacity/blend for a track's sampler. */
  updateSampler: (trackId: string, patch: Partial<Omit<SamplerInstrumentV1, 'id' | 'type'>>) => void
  /** Remove a track's sampler (also called on track delete for cleanup). */
  removeSampler: (trackId: string) => void
  getSampler: (trackId: string) => SamplerInstrumentV1 | undefined

  // --- B4.1 Sample Rack ---
  /** Instantiate a Rack on a track (no-op if it already has one). padCount default 1. */
  addRack: (trackId: string, padCount?: number) => void
  /** Remove a track's rack (also called on track delete for cleanup). */
  removeRack: (trackId: string) => void
  getRack: (trackId: string) => RackNode | undefined
  /** Patch a single pad's channel controls (opacity/blend/mute/solo) or its instrument. */
  updateRackPad: (
    trackId: string,
    padId: string,
    patch: Partial<Omit<RackPad, 'id'>>,
  ) => void
}

export const useInstrumentsStore = create<InstrumentsState>((set, get) => ({
  instruments: {},
  racks: {},

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

  // --- B4.1 Sample Rack ---
  addRack: (trackId, padCount = 1) =>
    set((state) => {
      if (state.racks[trackId]) return state
      const count = Math.max(1, Math.min(64, Math.round(padCount)))
      const pads: RackPad[] = []
      for (let i = 0; i < count; i++) pads.push(createRackPad())
      return {
        racks: {
          ...state.racks,
          [trackId]: { id: nextRackId(), type: 'rack', pads },
        },
      }
    }),

  removeRack: (trackId) =>
    set((state) => {
      if (!state.racks[trackId]) return state
      const next = { ...state.racks }
      delete next[trackId]
      return { racks: next }
    }),

  getRack: (trackId) => get().racks[trackId],

  updateRackPad: (trackId, padId, patch) =>
    set((state) => {
      const rack = state.racks[trackId]
      if (!rack) return state
      const idx = rack.pads.findIndex((p) => p.id === padId)
      if (idx === -1) return state
      const old = rack.pads[idx]
      // id is immutable; instrument is merged shallowly when patched.
      const { id: _ignore, instrument: patchInst, ...rest } = patch as Record<string, unknown> & {
        instrument?: Partial<SamplerInstrumentV1>
      }
      const merged: RackPad = {
        ...old,
        ...(rest as Partial<RackPad>),
        id: old.id,
        instrument: patchInst
          ? { ...old.instrument, ...patchInst, id: old.instrument.id, type: 'sampler' }
          : old.instrument,
      }
      const pads = rack.pads.slice()
      pads[idx] = merged
      return { racks: { ...state.racks, [trackId]: { ...rack, pads } } }
    }),
}))
