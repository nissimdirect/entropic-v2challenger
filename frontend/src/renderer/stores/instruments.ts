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
  FrameBankInstrument,
} from '../components/instruments/types'
import {
  MAX_MACROS_PER_RACK,
  MAX_MODROUTES_PER_MACRO,
  MAX_TOTAL_EDGES,
  MAX_BRANCH_DEPTH,
  RACK_PAD_OPACITY_MIN,
  RACK_PAD_OPACITY_MAX,
  RACK_CHOKE_GROUP_MIN,
  RACK_CHOKE_GROUP_MAX,
  MAX_FRAMEBANK_SLOTS,
  FRAMEBANK_BYTE_BUDGET_MIN,
  FRAMEBANK_BYTE_BUDGET_MAX,
  FRAMEBANK_POSITION_MIN,
  FRAMEBANK_POSITION_MAX,
} from '../components/instruments/types'
import type { SlotRef } from '../components/instruments/types'
import { clampFinite } from '../../shared/numeric'
import { LIMITS } from '../../shared/limits'
import type { BlendMode, EffectInstance, ParamValue } from '../../shared/types'

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

let _branchCounter = 0
function nextBranchId(): string {
  _branchCounter += 1
  return `branch-${_branchCounter}`
}

let _frameBankCounter = 0
function nextFrameBankId(): string {
  _frameBankCounter += 1
  return `framebank-${_frameBankCounter}`
}

/**
 * B5.2 — resolve the nested RackNode addressed by `branchPath` (an array of pad
 * ids). An EMPTY path returns `top` itself (the per-track rack — flat behavior
 * byte-identical). For each id in the path, find that pad in the current node's
 * pads and descend into its `branch`; if any hop is missing (bad pad id, or the
 * pad has no branch), return null so the caller no-ops/falls back (trust boundary
 * — a stale path never throws). Pure read; does NOT mutate.
 */
export function resolveRackNode(top: RackNode, branchPath: string[]): RackNode | null {
  let node: RackNode = top
  for (const padId of branchPath) {
    const pad = node.pads.find((p) => p.id === padId)
    if (!pad || !pad.branch) return null
    node = pad.branch
  }
  return node
}

/**
 * B5.2 — immutably transform the RackNode at `branchPath` and rebuild the spine
 * of new node objects from the leaf back up to the top rack (so React/Zustand
 * sees a fresh reference at every level on the edited path; untouched siblings
 * keep their identity → no needless re-render). `updater` receives the resolved
 * node and returns a new node (or the SAME node to signal a no-op). Returns the
 * new TOP rack, or null when the path is stale OR the updater no-ops.
 */
function updateRackNodeAt(
  top: RackNode,
  branchPath: string[],
  updater: (node: RackNode) => RackNode | null,
): RackNode | null {
  if (branchPath.length === 0) {
    const next = updater(top)
    return next && next !== top ? next : null
  }
  const [padId, ...rest] = branchPath
  const idx = top.pads.findIndex((p) => p.id === padId)
  if (idx === -1) return null
  const pad = top.pads[idx]
  if (!pad.branch) return null
  const nextBranch = updateRackNodeAt(pad.branch, rest, updater)
  if (!nextBranch) return null
  const pads = top.pads.slice()
  pads[idx] = { ...pad, branch: nextBranch }
  return { ...top, pads }
}

/**
 * B5.2 — pure pad transforms on a single RackNode (one rack LEVEL). Each returns
 * a NEW node when the pad changes, or the SAME node (referentially equal) on a
 * no-op (missing pad / no change). These are the level-local logic the B4
 * top-level actions and the B5.2 path-aware actions BOTH reuse, so a top-level
 * (empty-path) edit is byte-identical to the pre-B5.2 inlined code.
 */
function applyPadSource(node: RackNode, padId: string, clipId: string): RackNode {
  const idx = node.pads.findIndex((p) => p.id === padId)
  if (idx === -1) return node
  const old = node.pads[idx]
  const pads = node.pads.slice()
  pads[idx] = { ...old, instrument: { ...old.instrument, clipId } }
  return { ...node, pads }
}

function applyPadUpdate(
  node: RackNode,
  padId: string,
  patch: Partial<Omit<RackPad, 'id'>>,
): RackNode {
  const idx = node.pads.findIndex((p) => p.id === padId)
  if (idx === -1) return node
  const old = node.pads[idx]
  // id is immutable; instrument merged shallowly when patched.
  const { id: _ignore, instrument: patchInst, ...rest } = patch as Record<string, unknown> & {
    instrument?: Partial<SamplerInstrumentV1>
  }
  // Trust-boundary guards (mirror B4 updateRackPad): clamp opacity, validate
  // blend, coerce mute/solo to bool.
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
  const pads = node.pads.slice()
  pads[idx] = merged
  return { ...node, pads }
}

function applyPadChokeGroup(node: RackNode, padId: string, group: number | null): RackNode {
  const idx = node.pads.findIndex((p) => p.id === padId)
  if (idx === -1) return node
  let next: number | null
  if (group === null) {
    next = null
  } else if (
    Number.isInteger(group) &&
    group >= RACK_CHOKE_GROUP_MIN &&
    group <= RACK_CHOKE_GROUP_MAX
  ) {
    next = group
  } else {
    return node // invalid → no-op
  }
  const old = node.pads[idx]
  if (old.chokeGroup === next) return node // no change
  const pads = node.pads.slice()
  pads[idx] = { ...old, chokeGroup: next }
  return { ...node, pads }
}

function applyPadRemove(node: RackNode, padId: string): RackNode {
  const idx = node.pads.findIndex((p) => p.id === padId)
  if (idx === -1) return node
  const pads = node.pads.filter((p) => p.id !== padId)
  // Prune macro routes pointed at the deleted pad (`pad.<padId>.<param>`).
  const prefix = `pad.${padId}.`
  let macros = node.macros
  if (node.macros) {
    macros = node.macros.map((m) => {
      const routes = m.routes ?? []
      const kept = routes.filter((r) => !r.targetPath.startsWith(prefix))
      return kept.length === routes.length ? m : { ...m, routes: kept }
    })
  }
  return { ...node, pads, ...(macros ? { macros } : {}) }
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
  /**
   * B6.1 — trackId → its Frame-Bank (wavetable) instrument. A track with no entry
   * has no frame-bank. Additive to `instruments`/`racks` (a track holds a bare
   * sampler OR a rack OR a frame-bank). Persisted alongside them (additive
   * optional, no version bump). The editing UI is a LATER slice — this slice ships
   * the model + the export-path render + serialization, so a frame-bank reaches
   * the backend. Absent / empty → no `frameBanks` in the export payload → render
   * byte-identical (regression-safe).
   */
  frameBanks: Record<string, FrameBankInstrument>
  /** Instantiate a Sampler on a track (no-op if it already has one). clipId '' = unsourced. */
  addSampler: (trackId: string, clipId?: string) => void
  /** Set/replace the source clip (called when a video is dropped on the sampler). */
  setSource: (trackId: string, clipId: string) => void
  /** Patch start/speed/opacity/blend for a track's sampler. */
  updateSampler: (trackId: string, patch: Partial<Omit<SamplerInstrumentV1, 'id' | 'type'>>) => void
  /** Remove a track's sampler (also called on track delete for cleanup). */
  removeSampler: (trackId: string) => void
  getSampler: (trackId: string) => SamplerInstrumentV1 | undefined

  // --- B6.3 Frame-Bank (Wavetable) UI actions ---
  /**
   * Instantiate a Frame-Bank on a track (no-op if it already has one). Seeds a
   * couple of slots from `seedClipIds` (frameIndex 0) when provided — else an
   * empty bank. Defaults: position 0.5, interp 'blend', byteBudget MIN.
   */
  addFrameBank: (trackId: string, seedClipIds?: string[]) => void
  /** Remove a track's frame-bank (also called on track delete for cleanup). */
  removeFrameBank: (trackId: string) => void
  getFrameBank: (trackId: string) => FrameBankInstrument | undefined
  /** Append a slot to the bank (no-op if at MAX_FRAMEBANK_SLOTS or no bank). */
  addFrameBankSlot: (trackId: string, slot: SlotRef) => void
  /** Remove a slot by index (no-op if out of range or no bank). */
  removeFrameBankSlot: (trackId: string, index: number) => void
  /** Move a slot from→to (bounds-checked; no-op on bad index or no bank). */
  reorderFrameBankSlot: (trackId: string, from: number, to: number) => void
  /** Set the scan position, clamped [0,1] + finite-guarded. */
  setFrameBankPosition: (trackId: string, pos: number) => void
  /** Set the interpolation mode (nearest/blend/flow). */
  setFrameBankInterp: (trackId: string, interp: FrameBankInstrument['interp']) => void
  /** Set the resident-frame byte budget, clamped [MIN, MAX] + finite-guarded. */
  setFrameBankByteBudget: (trackId: string, bytes: number) => void

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
  /**
   * B4-pad-delete — remove a pad from a track's rack with SYMMETRIC route
   * cleanup. Drops the pad from `racks[trackId].pads` AND prunes every macro
   * route whose `targetPath` points at the deleted pad (`pad.<padId>.<param>`),
   * so no route is left dangling at a gone pad. No-op if track/rack/pad absent;
   * other pads, other macros' unrelated routes, and other tracks are untouched.
   * An emptied rack keeps an empty pads array (the rack itself is NOT deleted).
   *
   * The performance-store event cleanup (`trackEvents['${trackId}:${padId}']`)
   * is NOT done here (instruments.ts must not import the performance store
   * circularly) — the COMPONENT calls `clearRackPadEvents` alongside this.
   */
  removeRackPad: (trackId: string, padId: string) => void

  // --- B5.2 nested-rack editing (branch create + path-aware pad CRUD) ---
  /**
   * B5.2 — convert a LEAF pad (addressed by `branchPath` + `padId`) into a BRANCH:
   * set `pad.branch = { id, type:'rack', pads:[<1 default leaf>], macros:[] }`.
   * When `branch` is present the pad is a GROUP (B5.1 model: the leaf `instrument`
   * is ignored for rendering — kept on the object, inert). No-op if the pad is
   * already a branch. REJECTS (no-op, returns false) when the new branch would
   * exceed MAX_BRANCH_DEPTH (the new branch sits at depth `branchPath.length + 1`).
   * Returns true on success.
   */
  convertPadToBranch: (trackId: string, branchPath: string[], padId: string) => boolean
  /**
   * B5.2 — append a fresh leaf pad to the RackNode addressed by `branchPath`
   * (empty path = the top rack, byte-identical to addRackPad). No-op if the path
   * is stale or the node is at the 64-pad ceiling.
   */
  addRackPadAt: (trackId: string, branchPath: string[]) => void
  /** B5.2 — path-aware setRackPadSource (empty path = top rack). */
  setRackPadSourceAt: (trackId: string, branchPath: string[], padId: string, clipId: string) => void
  /** B5.2 — path-aware updateRackPad (empty path = top rack). */
  updateRackPadAt: (
    trackId: string,
    branchPath: string[],
    padId: string,
    patch: Partial<Omit<RackPad, 'id'>>,
  ) => void
  /** B5.2 — path-aware setRackPadChokeGroup (empty path = top rack). */
  setRackPadChokeGroupAt: (
    trackId: string,
    branchPath: string[],
    padId: string,
    group: number | null,
  ) => void
  /** B5.2 — path-aware removeRackPad (empty path = top rack). Prunes that level's macro routes. */
  removeRackPadAt: (trackId: string, branchPath: string[], padId: string) => void

  /**
   * B4-choke — set a rack pad's choke-group membership. `group` is null (clear) or
   * a small int in [RACK_CHOKE_GROUP_MIN, RACK_CHOKE_GROUP_MAX]; an out-of-range or
   * non-finite value is a no-op (trust boundary — the membership is unchanged
   * rather than silently coerced). No-op if track/rack/pad absent. Immutable.
   */
  setRackPadChokeGroup: (trackId: string, padId: string, group: number | null) => void

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

  // --- B4-pad-chain UI — pad-scoped insert-chain mutations ---
  // These mirror the TRACK-scoped chain actions in project.ts (add/remove/
  // reorder/updateParam/toggle), but write to `racks[trackId].pads[i].chain`
  // (the instruments store) instead of `track.effectChain` (the timeline store).
  // The bottom DeviceChain dispatches these when a rack pad is selected, so the
  // user edits the SELECTED PAD's insert chain (Ableton drum-rack model). All
  // are immutable + no-op when track/rack/pad is absent.
  //
  // B5.2: each takes an OPTIONAL trailing `branchPath` (array of pad ids). Omitted
  // / `[]` → the TOP rack pad, byte-identical to B4. A non-empty path addresses a
  // pad nested inside `pad.branch` so a nested pad's insert chain is editable too.
  /** Append an effect to a pad's insert chain (capped at MAX_EFFECTS_PER_CHAIN). */
  addEffectToPad: (trackId: string, padId: string, effect: EffectInstance, branchPath?: string[]) => void
  /** Remove an effect from a pad's insert chain by instance id. */
  removeEffectFromPad: (trackId: string, padId: string, instanceId: string, branchPath?: string[]) => void
  /** Move an effect within a pad's insert chain (bounds-checked). */
  reorderPadEffect: (trackId: string, padId: string, fromIndex: number, toIndex: number, branchPath?: string[]) => void
  /** Patch one parameter of an effect in a pad's insert chain. */
  updatePadEffectParam: (
    trackId: string,
    padId: string,
    instanceId: string,
    paramName: string,
    value: ParamValue,
    branchPath?: string[],
  ) => void
  /** Toggle an effect's enabled flag in a pad's insert chain. */
  togglePadEffect: (trackId: string, padId: string, instanceId: string, branchPath?: string[]) => void
}

export const useInstrumentsStore = create<InstrumentsState>((set, get) => ({
  instruments: {},
  racks: {},
  frameBanks: {},

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

  // --- B6.3 Frame-Bank (Wavetable) UI actions ---
  // All immutable; every numeric crossing the store-write boundary is clamped +
  // finite-guarded (the backend security.validate_frame_bank re-enforces). Caps
  // mirror the backend (MAX_FRAMEBANK_SLOTS / byte-budget MIN-MAX / position 0..1).
  addFrameBank: (trackId, seedClipIds) =>
    set((state) => {
      if (state.frameBanks[trackId]) return state
      const slots: SlotRef[] = []
      for (const clipId of (seedClipIds ?? []).slice(0, MAX_FRAMEBANK_SLOTS)) {
        if (clipId) slots.push({ clipId, frameIndex: 0 })
      }
      return {
        frameBanks: {
          ...state.frameBanks,
          [trackId]: {
            id: nextFrameBankId(),
            type: 'frameBank',
            slots,
            position: 0.5,
            interp: 'blend',
            byteBudget: FRAMEBANK_BYTE_BUDGET_MIN,
          },
        },
      }
    }),

  removeFrameBank: (trackId) =>
    set((state) => {
      if (!state.frameBanks[trackId]) return state
      const next = { ...state.frameBanks }
      delete next[trackId]
      return { frameBanks: next }
    }),

  getFrameBank: (trackId) => get().frameBanks[trackId],

  addFrameBankSlot: (trackId, slot) =>
    set((state) => {
      const fb = state.frameBanks[trackId]
      if (!fb) return state
      // SLOT CAP (trust boundary): refuse to grow past MAX_FRAMEBANK_SLOTS.
      if (fb.slots.length >= MAX_FRAMEBANK_SLOTS) return state
      if (!slot.clipId) return state
      const frameIndex = Math.round(clampFinite(Number(slot.frameIndex), 0, 1_000_000, 0))
      return {
        frameBanks: {
          ...state.frameBanks,
          [trackId]: { ...fb, slots: [...fb.slots, { clipId: slot.clipId, frameIndex }] },
        },
      }
    }),

  removeFrameBankSlot: (trackId, index) =>
    set((state) => {
      const fb = state.frameBanks[trackId]
      if (!fb) return state
      if (index < 0 || index >= fb.slots.length) return state
      return {
        frameBanks: {
          ...state.frameBanks,
          [trackId]: { ...fb, slots: fb.slots.filter((_, i) => i !== index) },
        },
      }
    }),

  reorderFrameBankSlot: (trackId, from, to) =>
    set((state) => {
      const fb = state.frameBanks[trackId]
      if (!fb) return state
      if (from < 0 || from >= fb.slots.length) return state
      if (to < 0 || to >= fb.slots.length) return state
      if (from === to) return state
      const slots = fb.slots.slice()
      const [moved] = slots.splice(from, 1)
      slots.splice(to, 0, moved)
      return { frameBanks: { ...state.frameBanks, [trackId]: { ...fb, slots } } }
    }),

  setFrameBankPosition: (trackId, pos) =>
    set((state) => {
      const fb = state.frameBanks[trackId]
      if (!fb) return state
      const position = clampFinite(pos, FRAMEBANK_POSITION_MIN, FRAMEBANK_POSITION_MAX, fb.position)
      if (position === fb.position) return state
      return { frameBanks: { ...state.frameBanks, [trackId]: { ...fb, position } } }
    }),

  setFrameBankInterp: (trackId, interp) =>
    set((state) => {
      const fb = state.frameBanks[trackId]
      if (!fb) return state
      // Trust boundary: only known interp modes are accepted.
      if (interp !== 'nearest' && interp !== 'blend' && interp !== 'flow') return state
      if (interp === fb.interp) return state
      return { frameBanks: { ...state.frameBanks, [trackId]: { ...fb, interp } } }
    }),

  setFrameBankByteBudget: (trackId, bytes) =>
    set((state) => {
      const fb = state.frameBanks[trackId]
      if (!fb) return state
      const byteBudget = clampFinite(
        bytes,
        FRAMEBANK_BYTE_BUDGET_MIN,
        FRAMEBANK_BYTE_BUDGET_MAX,
        fb.byteBudget,
      )
      if (byteBudget === fb.byteBudget) return state
      return { frameBanks: { ...state.frameBanks, [trackId]: { ...fb, byteBudget } } }
    }),

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

  // B4-pad-delete — remove a pad + prune any macro route pointed at it.
  removeRackPad: (trackId, padId) =>
    set((state) => {
      const rack = state.racks[trackId]
      if (!rack) return state
      const idx = rack.pads.findIndex((p) => p.id === padId)
      if (idx === -1) return state // pad absent — no-op (guard).

      // (a) Drop the pad (immutable; other pads untouched).
      const pads = rack.pads.filter((p) => p.id !== padId)

      // (b) Prune macro routes pointed at the deleted pad. A route targets a pad
      // via `pad.<padId>.<param>` — drop only those whose path starts with the
      // deleted pad's prefix. Surviving routes (other pads) are left intact.
      const prefix = `pad.${padId}.`
      let macros = rack.macros
      if (rack.macros) {
        macros = rack.macros.map((m) => {
          const routes = m.routes ?? []
          const kept = routes.filter((r) => !r.targetPath.startsWith(prefix))
          // Only allocate a new macro object when a route was actually pruned.
          return kept.length === routes.length ? m : { ...m, routes: kept }
        })
      }

      return {
        racks: {
          ...state.racks,
          [trackId]: { ...rack, pads, ...(macros ? { macros } : {}) },
        },
      }
    }),

  // --- B5.2 nested-rack editing ----------------------------------------------
  // All path-aware actions resolve the RackNode at `branchPath` via
  // updateRackNodeAt (rebuilds the spine immutably) and reuse the SAME pure pad
  // transforms the B4 top-level actions use → flat behavior is byte-identical.
  convertPadToBranch: (trackId, branchPath, padId) => {
    const rack = get().racks[trackId]
    if (!rack) return false
    // DEPTH CAP (trust boundary): the new branch sits at depth path.length + 1.
    // Reject if that exceeds MAX_BRANCH_DEPTH (fail-closed; no mutation).
    if (branchPath.length + 1 > MAX_BRANCH_DEPTH) return false
    let didConvert = false
    const nextTop = updateRackNodeAt(rack, branchPath, (node) => {
      const idx = node.pads.findIndex((p) => p.id === padId)
      if (idx === -1) return node // pad absent at this level — no-op
      const pad = node.pads[idx]
      if (pad.branch) return node // already a branch — no-op
      const pads = node.pads.slice()
      // B5.1 model: a pad with a `branch` is a GROUP; its leaf instrument is kept
      // (inert) and the branch starts with ONE default leaf pad + empty macros.
      pads[idx] = {
        ...pad,
        branch: { id: nextBranchId(), type: 'rack', pads: [createRackPad()], macros: [] },
      }
      didConvert = true
      return { ...node, pads }
    })
    if (!nextTop || !didConvert) return false
    set((state) => ({ racks: { ...state.racks, [trackId]: nextTop } }))
    return true
  },

  addRackPadAt: (trackId, branchPath) =>
    set((state) => {
      const rack = state.racks[trackId]
      if (!rack) return state
      const nextTop = updateRackNodeAt(rack, branchPath, (node) => {
        if (node.pads.length >= 64) return node // 64-pad ceiling (mirrors addRackPad)
        return { ...node, pads: [...node.pads, createRackPad()] }
      })
      if (!nextTop) return state
      return { racks: { ...state.racks, [trackId]: nextTop } }
    }),

  setRackPadSourceAt: (trackId, branchPath, padId, clipId) =>
    set((state) => {
      const rack = state.racks[trackId]
      if (!rack) return state
      const nextTop = updateRackNodeAt(rack, branchPath, (node) =>
        applyPadSource(node, padId, clipId),
      )
      if (!nextTop) return state
      return { racks: { ...state.racks, [trackId]: nextTop } }
    }),

  updateRackPadAt: (trackId, branchPath, padId, patch) =>
    set((state) => {
      const rack = state.racks[trackId]
      if (!rack) return state
      const nextTop = updateRackNodeAt(rack, branchPath, (node) =>
        applyPadUpdate(node, padId, patch),
      )
      if (!nextTop) return state
      return { racks: { ...state.racks, [trackId]: nextTop } }
    }),

  setRackPadChokeGroupAt: (trackId, branchPath, padId, group) =>
    set((state) => {
      const rack = state.racks[trackId]
      if (!rack) return state
      const nextTop = updateRackNodeAt(rack, branchPath, (node) =>
        applyPadChokeGroup(node, padId, group),
      )
      if (!nextTop) return state
      return { racks: { ...state.racks, [trackId]: nextTop } }
    }),

  removeRackPadAt: (trackId, branchPath, padId) =>
    set((state) => {
      const rack = state.racks[trackId]
      if (!rack) return state
      const nextTop = updateRackNodeAt(rack, branchPath, (node) =>
        applyPadRemove(node, padId),
      )
      if (!nextTop) return state
      return { racks: { ...state.racks, [trackId]: nextTop } }
    }),

  // B4-choke — set a pad's choke-group membership (null or small int [1,8]).
  setRackPadChokeGroup: (trackId, padId, group) =>
    set((state) => {
      const rack = state.racks[trackId]
      if (!rack) return state
      const idx = rack.pads.findIndex((p) => p.id === padId)
      if (idx === -1) return state
      // Trust boundary: only null or an in-range integer is accepted. Anything
      // else (NaN, out-of-range, fractional) leaves membership unchanged.
      let next: number | null
      if (group === null) {
        next = null
      } else if (
        Number.isInteger(group) &&
        group >= RACK_CHOKE_GROUP_MIN &&
        group <= RACK_CHOKE_GROUP_MAX
      ) {
        next = group
      } else {
        return state // invalid → no-op
      }
      const old = rack.pads[idx]
      if (old.chokeGroup === next) return state // no change
      const pads = rack.pads.slice()
      pads[idx] = { ...old, chokeGroup: next }
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

  // --- B4-pad-chain UI — pad-scoped insert-chain mutations ---
  // Shared shape: locate the pad in racks[trackId], immutably transform its
  // `chain` (default [] when absent), write the new pads array back. A missing
  // track/rack/pad is a no-op. Mirrors the project.ts track-chain semantics.
  addEffectToPad: (trackId, padId, effect, branchPath) =>
    set((state) => mutatePadChain(state, trackId, branchPath, padId, (chain) => {
      // Trust boundary: mirror addEffect's chain-length cap.
      if (chain.length >= LIMITS.MAX_EFFECTS_PER_CHAIN) return chain
      return [...chain, effect]
    })),

  removeEffectFromPad: (trackId, padId, instanceId, branchPath) =>
    set((state) => mutatePadChain(state, trackId, branchPath, padId, (chain) =>
      chain.filter((e) => e.id !== instanceId),
    )),

  reorderPadEffect: (trackId, padId, fromIndex, toIndex, branchPath) =>
    set((state) => mutatePadChain(state, trackId, branchPath, padId, (chain) => {
      if (fromIndex < 0 || fromIndex >= chain.length) return chain
      if (toIndex < 0 || toIndex >= chain.length) return chain
      if (fromIndex === toIndex) return chain
      const next = chain.slice()
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      return next
    })),

  updatePadEffectParam: (trackId, padId, instanceId, paramName, value, branchPath) =>
    set((state) => mutatePadChain(state, trackId, branchPath, padId, (chain) =>
      chain.map((e) =>
        e.id === instanceId
          ? { ...e, parameters: { ...e.parameters, [paramName]: value } }
          : e,
      ),
    )),

  togglePadEffect: (trackId, padId, instanceId, branchPath) =>
    set((state) => mutatePadChain(state, trackId, branchPath, padId, (chain) =>
      chain.map((e) => (e.id === instanceId ? { ...e, isEnabled: !e.isEnabled } : e)),
    )),
}))

/**
 * B4-pad-chain UI / B5.2 — immutably transform a pad's `chain` at the RackNode
 * addressed by `branchPath` (empty/undefined → the TOP rack, byte-identical to
 * B4). Returns a NEW InstrumentsState slice ({ racks }) when the chain changes,
 * or the unchanged `state` when the track/rack/pad is absent, the path is stale,
 * OR the updater returns a chain referentially equal to the old one (no-op → no
 * re-render churn). `pad.chain` defaults to [] when absent.
 */
function mutatePadChain(
  state: InstrumentsState,
  trackId: string,
  branchPath: string[] | undefined,
  padId: string,
  updater: (chain: EffectInstance[]) => EffectInstance[],
): InstrumentsState | Pick<InstrumentsState, 'racks'> {
  const rack = state.racks[trackId]
  if (!rack) return state
  const nextTop = updateRackNodeAt(rack, branchPath ?? [], (node) => {
    const idx = node.pads.findIndex((p) => p.id === padId)
    if (idx === -1) return node // pad absent at this level — no-op
    const old = node.pads[idx]
    const oldChain = old.chain ?? []
    const nextChain = updater(oldChain)
    if (nextChain === oldChain) return node // no-op guard (no spine churn)
    const pads = node.pads.slice()
    pads[idx] = { ...old, chain: nextChain }
    return { ...node, pads }
  })
  if (!nextTop) return state // stale path or no-op → unchanged
  return { racks: { ...state.racks, [trackId]: nextTop } }
}
