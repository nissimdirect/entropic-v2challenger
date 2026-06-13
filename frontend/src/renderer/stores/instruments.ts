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

import type {
  SamplerInstrumentV1,
  RackNode,
  RackPad,
  RackMacro,
  MacroRoute,
} from '../components/instruments/types'
import {
  MAX_MACROS_PER_RACK,
  MAX_MODROUTES_PER_MACRO,
  MAX_TOTAL_EDGES,
  RACK_PAD_OPACITY_MIN,
  RACK_PAD_OPACITY_MAX,
} from '../components/instruments/types'
import { clampFinite } from '../../shared/numeric'
import type { BlendMode } from '../../shared/types'

/** Valid blend modes a rack pad channel may use (trust-boundary allowlist). */
const BLEND_MODES = new Set<BlendMode>([
  'normal', 'add', 'multiply', 'screen', 'overlay',
  'difference', 'exclusion', 'darken', 'lighten',
])

let _macroCounter = 0
function nextMacroId(): string {
  _macroCounter += 1
  return `macro-${_macroCounter}`
}

/** Sum of all macro routes across a rack (the MAX_TOTAL_EDGES denominator). */
function totalRackEdges(rack: RackNode): number {
  let n = 0
  for (const m of rack.macros ?? []) n += m.routes?.length ?? 0
  return n
}

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
  /** B4-editor — append a fresh (unsourced) pad channel to a track's rack. */
  addRackPad: (trackId: string) => void
  /** B4-editor — set a rack pad's sample source clipId (no-op if rack/pad absent). */
  setRackPadSource: (trackId: string, padId: string, clipId: string) => void
  /** Patch a single pad's channel controls (opacity/blend/mute/solo) or its instrument. */
  updateRackPad: (
    trackId: string,
    padId: string,
    patch: Partial<Omit<RackPad, 'id'>>,
  ) => void

  // --- B4.2 Sample Rack macros (fan-out capped at the store-write boundary) ---
  /**
   * Add a macro to a track's rack. REJECTS (no-op) when the rack already has
   * MAX_MACROS_PER_RACK macros — the store-write fan-out cap (layer 1). Returns
   * the new macro id, or null if rejected / no rack.
   */
  addRackMacro: (trackId: string, name?: string) => string | null
  /** Patch a macro's name/value (value clamped [0,1] by the resolver). */
  updateRackMacro: (
    trackId: string,
    macroId: string,
    patch: Partial<Pick<RackMacro, 'name' | 'value'>>,
  ) => void
  /** Remove a macro (and its routes) from a track's rack. */
  removeRackMacro: (trackId: string, macroId: string) => void
  /**
   * Add a route to a macro. REJECTS (no-op, returns false) when the macro
   * already has MAX_MODROUTES_PER_MACRO routes OR the rack is already at
   * MAX_TOTAL_EDGES — the per-macro + total fan-out caps (layer 1).
   */
  addMacroRoute: (
    trackId: string,
    macroId: string,
    route: MacroRoute,
  ) => boolean
  /** Remove a route (by index) from a macro. */
  removeMacroRoute: (trackId: string, macroId: string, routeIndex: number) => void
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

  // B4-editor — append a fresh (unsourced) pad channel to a track's rack.
  addRackPad: (trackId) =>
    set((state) => {
      const rack = state.racks[trackId]
      if (!rack) return state
      // Mirror addRack's 64-pad ceiling — refuse to grow past it.
      if (rack.pads.length >= 64) return state
      return {
        racks: {
          ...state.racks,
          [trackId]: { ...rack, pads: [...rack.pads, createRackPad()] },
        },
      }
    }),

  // B4-editor — set a rack pad's sample source (clipId). Immutable update;
  // mirrors the bare-sampler `setSource`. A missing rack / pad is a no-op.
  setRackPadSource: (trackId, padId, clipId) =>
    set((state) => {
      const rack = state.racks[trackId]
      if (!rack) return state
      const idx = rack.pads.findIndex((p) => p.id === padId)
      if (idx === -1) return state
      const old = rack.pads[idx]
      const pads = rack.pads.slice()
      pads[idx] = {
        ...old,
        instrument: { ...old.instrument, clipId },
      }
      return { racks: { ...state.racks, [trackId]: { ...rack, pads } } }
    }),

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
      // B4-editor — trust-boundary guards on channel-control patches (every
      // numeric crossing the store boundary is clamped + finite-guarded; blend
      // must be a known BlendMode; mute/solo coerced to bool).
      const safeRest = { ...(rest as Partial<RackPad>) }
      if ('opacity' in safeRest) {
        safeRest.opacity = clampFinite(
          Number((safeRest as { opacity: unknown }).opacity),
          RACK_PAD_OPACITY_MIN,
          RACK_PAD_OPACITY_MAX,
          old.opacity,
        )
      }
      if ('blend' in safeRest && !BLEND_MODES.has(safeRest.blend as BlendMode)) {
        delete safeRest.blend
      }
      if ('mute' in safeRest) safeRest.mute = Boolean(safeRest.mute)
      if ('solo' in safeRest) safeRest.solo = Boolean(safeRest.solo)
      const merged: RackPad = {
        ...old,
        ...safeRest,
        id: old.id,
        instrument: patchInst
          ? { ...old.instrument, ...patchInst, id: old.instrument.id, type: 'sampler' }
          : old.instrument,
      }
      const pads = rack.pads.slice()
      pads[idx] = merged
      return { racks: { ...state.racks, [trackId]: { ...rack, pads } } }
    }),

  // --- B4.2 Sample Rack macros — store-write fan-out caps (layer 1) ---
  addRackMacro: (trackId, name) => {
    const rack = get().racks[trackId]
    if (!rack) return null
    const macros = rack.macros ?? []
    // FAN-OUT CAP (store-write): reject a 9th macro.
    if (macros.length >= MAX_MACROS_PER_RACK) return null
    const id = nextMacroId()
    const macro: RackMacro = {
      id,
      name: name ?? `Macro ${macros.length + 1}`,
      value: 0,
      routes: [],
    }
    set((state) => {
      const r = state.racks[trackId]
      if (!r) return state
      return {
        racks: {
          ...state.racks,
          [trackId]: { ...r, macros: [...(r.macros ?? []), macro] },
        },
      }
    })
    return id
  },

  updateRackMacro: (trackId, macroId, patch) =>
    set((state) => {
      const rack = state.racks[trackId]
      if (!rack || !rack.macros) return state
      const idx = rack.macros.findIndex((m) => m.id === macroId)
      if (idx === -1) return state
      const macros = rack.macros.slice()
      // id + routes are not patched here (routes via addMacroRoute); value left
      // as-is (the resolver clamps [0,1] at render — single source of truth).
      const { name, value } = patch
      macros[idx] = {
        ...macros[idx],
        ...(name !== undefined ? { name } : {}),
        ...(value !== undefined ? { value } : {}),
      }
      return { racks: { ...state.racks, [trackId]: { ...rack, macros } } }
    }),

  removeRackMacro: (trackId, macroId) =>
    set((state) => {
      const rack = state.racks[trackId]
      if (!rack || !rack.macros) return state
      const macros = rack.macros.filter((m) => m.id !== macroId)
      if (macros.length === rack.macros.length) return state
      return { racks: { ...state.racks, [trackId]: { ...rack, macros } } }
    }),

  addMacroRoute: (trackId, macroId, route) => {
    const rack = get().racks[trackId]
    if (!rack || !rack.macros) return false
    const idx = rack.macros.findIndex((m) => m.id === macroId)
    if (idx === -1) return false
    const macro = rack.macros[idx]
    // FAN-OUT CAPS (store-write): reject past the per-macro OR the rack total.
    if ((macro.routes?.length ?? 0) >= MAX_MODROUTES_PER_MACRO) return false
    if (totalRackEdges(rack) >= MAX_TOTAL_EDGES) return false
    set((state) => {
      const r = state.racks[trackId]
      if (!r || !r.macros) return state
      const mi = r.macros.findIndex((m) => m.id === macroId)
      if (mi === -1) return state
      const macros = r.macros.slice()
      macros[mi] = { ...macros[mi], routes: [...(macros[mi].routes ?? []), route] }
      return { racks: { ...state.racks, [trackId]: { ...r, macros } } }
    })
    return true
  },

  removeMacroRoute: (trackId, macroId, routeIndex) =>
    set((state) => {
      const rack = state.racks[trackId]
      if (!rack || !rack.macros) return state
      const mi = rack.macros.findIndex((m) => m.id === macroId)
      if (mi === -1) return state
      const routes = (rack.macros[mi].routes ?? []).filter((_, i) => i !== routeIndex)
      const macros = rack.macros.slice()
      macros[mi] = { ...macros[mi], routes }
      return { racks: { ...state.racks, [trackId]: { ...rack, macros } } }
    }),
}))
