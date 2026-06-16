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
  GranulatorInstrument,
  GranulatorAxis,
  GranulatorAxisParams,
  GranulatorSelectionRule,
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
  GRANULATOR_DENSITY_MIN,
  GRANULATOR_DENSITY_MAX,
  GRANULATOR_AXES,
  defaultGranulatorInstrument,
  defaultAxisParams,
} from '../components/instruments/types'
import type { SlotRef } from '../components/instruments/types'
import { clampFinite } from '../../shared/numeric'
import { LIMITS } from '../../shared/limits'
import type { BlendMode, EffectInstance, ParamValue } from '../../shared/types'
import { useUndoStore, undoable } from './undo'

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

/**
 * Deep-clone a RackNode (pads, nested branches, macros, routes, pad chains) so an
 * undo inverse can RESTORE the exact prior subtree by VALUE, never by reference.
 * Required by the undo.ts conventions header: inverse closures must capture data,
 * not a live array that a later mutation would alias. Pure; no IDs regenerated
 * (an undo must restore the SAME ids, per convention #1).
 */
function cloneRackNode(node: RackNode): RackNode {
  return {
    ...node,
    pads: node.pads.map((p) => ({
      ...p,
      instrument: { ...p.instrument },
      ...(p.chain ? { chain: p.chain.map((e) => ({ ...e, parameters: { ...e.parameters } })) } : {}),
      ...(p.branch ? { branch: cloneRackNode(p.branch) } : {}),
    })),
    ...(node.macros
      ? { macros: node.macros.map((m) => ({ ...m, routes: (m.routes ?? []).map((r) => ({ ...r })) })) }
      : {}),
  }
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
  /**
   * B8 — trackId → its Granulator instrument. A track with no entry has no
   * granulator. Additive to the other instrument maps (a track holds a bare
   * sampler OR a rack OR a frame-bank OR a granulator). Persisted alongside
   * them (additive optional, no version bump). Absent / empty → no
   * `performance.granulator` in the render payload → byte-identical
   * (regression-safe). The UI is P5b.19.
   */
  granulators: Record<string, GranulatorInstrument>
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
  /**
   * P5b.23 — B9: set the timeAxis for this frame-bank ('t'|'y'|'x', lowercase only).
   * 't' = legacy time (default); 'y' = slit-scan rows; 'x' = slit-scan columns.
   * The backend validator enforces lowercase; the store enforces the same whitelist.
   * No-op on unknown value or absent bank.
   */
  setFrameBankTimeAxis: (trackId: string, axis: FrameBankInstrument['timeAxis']) => void

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

  // --- B8 Granulator (P5b.19) ---
  /**
   * Instantiate a Granulator on a track (no-op if it already has one). Seeds a
   * default 4-grain instrument with all six axes at safe defaults.
   */
  addGranulator: (trackId: string) => void
  /** Remove a track's granulator (also called on track delete for cleanup). */
  removeGranulator: (trackId: string) => void
  getGranulator: (trackId: string) => GranulatorInstrument | undefined
  /**
   * Set grain density, clamped [GRANULATOR_DENSITY_MIN, GRANULATOR_DENSITY_MAX].
   * The backend enforces the hard MAX_GRAINS cap; this mirrors it at the store
   * boundary (feedback_numeric-trust-boundary).
   */
  setGranulatorDensity: (trackId: string, density: number) => void
  /** Set grain window shape ('hann' | 'tri' | 'rect'). */
  setGranulatorWindow: (trackId: string, window: GranulatorInstrument['window']) => void
  /**
   * Set a per-axis param (grain/jitter/position/envelope), clamped [0,1].
   * `axis` must be lowercase (P1-A canon: t/y/x/c/f/l). Unknown axis → no-op.
   */
  setGranulatorAxisParam: (
    trackId: string,
    axis: GranulatorAxis,
    param: keyof GranulatorAxisParams,
    value: number,
  ) => void
  /** Toggle the L-axis SG-3 gate flag. */
  setGranulatorLAxisEnabled: (trackId: string, enabled: boolean) => void
  /**
   * Set the grain selection rule.
   * `latentSimilarity` is accepted ONLY when the caller's env flag is on —
   * this store action enforces that at the write boundary.
   * `scenePayload` is NEVER accepted (reserved — no UI should call this).
   */
  setGranulatorSelection: (trackId: string, rule: GranulatorSelectionRule, latentFlagOn: boolean) => void
}

let _granulatorCounter = 0
function nextGranulatorId(): string {
  _granulatorCounter += 1
  return `granulator-${_granulatorCounter}`
}

export const useInstrumentsStore = create<InstrumentsState>((set, get) => ({
  instruments: {},
  racks: {},
  frameBanks: {},
  granulators: {},

  addSampler: (trackId, clipId = '') => {
    // No-op guard BEFORE undoable() — don't push an empty history entry.
    if (get().instruments[trackId]) return
    // Pre-generate the id BEFORE undoable() (undo.ts convention #1: deterministic redo).
    const newSampler: SamplerInstrumentV1 = {
      id: nextId(),
      type: 'sampler',
      clipId,
      startFrame: 0,
      speed: 1,
      opacity: 1,
      blendMode: 'normal',
    }
    const forward = () => {
      set((state) => ({ instruments: { ...state.instruments, [trackId]: newSampler } }))
    }
    const inverse = () => {
      set((state) => {
        const next = { ...state.instruments }
        delete next[trackId]
        return { instruments: next }
      })
    }
    undoable(`Add sampler to ${trackId}`, forward, inverse)
  },

  setSource: (trackId, clipId) => {
    const old = get().instruments[trackId]
    if (!old) return
    if (old.clipId === clipId) return // no change → no history entry
    const prevClipId = old.clipId
    const forward = () => {
      set((state) =>
        state.instruments[trackId]
          ? { instruments: { ...state.instruments, [trackId]: { ...state.instruments[trackId], clipId } } }
          : state,
      )
    }
    const inverse = () => {
      set((state) =>
        state.instruments[trackId]
          ? { instruments: { ...state.instruments, [trackId]: { ...state.instruments[trackId], clipId: prevClipId } } }
          : state,
      )
    }
    undoable(`Set sampler source on ${trackId}`, forward, inverse)
  },

  updateSampler: (trackId, patch) => {
    const old = get().instruments[trackId]
    if (!old) return
    // Capture prior values of just the patched keys (id/type are immutable).
    const { id: _ignoreId, type: _ignoreType, ...safePatch } = patch as Record<string, unknown>
    const prev: Record<string, unknown> = {}
    for (const k of Object.keys(safePatch)) prev[k] = (old as Record<string, unknown>)[k]
    const forward = () => {
      set((state) =>
        state.instruments[trackId]
          ? { instruments: { ...state.instruments, [trackId]: { ...state.instruments[trackId], ...safePatch, id: old.id, type: old.type } } }
          : state,
      )
    }
    const inverse = () => {
      set((state) =>
        state.instruments[trackId]
          ? { instruments: { ...state.instruments, [trackId]: { ...state.instruments[trackId], ...prev, id: old.id, type: old.type } } }
          : state,
      )
    }
    undoable(`Edit sampler on ${trackId}`, forward, inverse)
  },

  removeSampler: (trackId) => {
    const removed = get().instruments[trackId]
    if (!removed) return
    // Capture the removed sampler so inverse restores the SAME instrument (same id).
    const snapshot = { ...removed }
    const forward = () => {
      set((state) => {
        const next = { ...state.instruments }
        delete next[trackId]
        return { instruments: next }
      })
    }
    const inverse = () => {
      set((state) => ({ instruments: { ...state.instruments, [trackId]: snapshot } }))
    }
    undoable(`Remove sampler from ${trackId}`, forward, inverse)
  },

  getSampler: (trackId) => get().instruments[trackId],

  // --- B6.3 Frame-Bank (Wavetable) UI actions ---
  // All immutable; every numeric crossing the store-write boundary is clamped +
  // finite-guarded (the backend security.validate_frame_bank re-enforces). Caps
  // mirror the backend (MAX_FRAMEBANK_SLOTS / byte-budget MIN-MAX / position 0..1).
  addFrameBank: (trackId, seedClipIds) => {
    if (get().frameBanks[trackId]) return
    // Pre-generate id + build the new bank BEFORE undoable() (deterministic redo).
    const slots: SlotRef[] = []
    for (const clipId of (seedClipIds ?? []).slice(0, MAX_FRAMEBANK_SLOTS)) {
      if (clipId) slots.push({ clipId, frameIndex: 0 })
    }
    const newBank: FrameBankInstrument = {
      id: nextFrameBankId(),
      type: 'frameBank',
      slots,
      position: 0.5,
      interp: 'blend',
      byteBudget: FRAMEBANK_BYTE_BUDGET_MIN,
    }
    const forward = () => {
      set((state) => ({ frameBanks: { ...state.frameBanks, [trackId]: newBank } }))
    }
    const inverse = () => {
      set((state) => {
        const next = { ...state.frameBanks }
        delete next[trackId]
        return { frameBanks: next }
      })
    }
    undoable(`Add frame-bank to ${trackId}`, forward, inverse)
  },

  removeFrameBank: (trackId) => {
    const removed = get().frameBanks[trackId]
    if (!removed) return
    // Deep-copy slots so inverse restores the full bank (same id + slots).
    const snapshot: FrameBankInstrument = { ...removed, slots: removed.slots.map((s) => ({ ...s })) }
    const forward = () => {
      set((state) => {
        const next = { ...state.frameBanks }
        delete next[trackId]
        return { frameBanks: next }
      })
    }
    const inverse = () => {
      set((state) => ({ frameBanks: { ...state.frameBanks, [trackId]: snapshot } }))
    }
    undoable(`Remove frame-bank from ${trackId}`, forward, inverse)
  },

  getFrameBank: (trackId) => get().frameBanks[trackId],

  addFrameBankSlot: (trackId, slot) => {
    const fb = get().frameBanks[trackId]
    if (!fb) return
    // SLOT CAP (trust boundary): refuse to grow past MAX_FRAMEBANK_SLOTS.
    if (fb.slots.length >= MAX_FRAMEBANK_SLOTS) return
    if (!slot.clipId) return
    const frameIndex = Math.round(clampFinite(Number(slot.frameIndex), 0, 1_000_000, 0))
    const newSlot: SlotRef = { clipId: slot.clipId, frameIndex }
    const prevSlots = fb.slots.map((s) => ({ ...s }))
    const forward = () => {
      set((state) => {
        const cur = state.frameBanks[trackId]
        if (!cur) return state
        return { frameBanks: { ...state.frameBanks, [trackId]: { ...cur, slots: [...cur.slots, newSlot] } } }
      })
    }
    const inverse = () => {
      set((state) => {
        const cur = state.frameBanks[trackId]
        if (!cur) return state
        return { frameBanks: { ...state.frameBanks, [trackId]: { ...cur, slots: prevSlots } } }
      })
    }
    undoable(`Add frame-bank slot on ${trackId}`, forward, inverse)
  },

  removeFrameBankSlot: (trackId, index) => {
    const fb = get().frameBanks[trackId]
    if (!fb) return
    if (index < 0 || index >= fb.slots.length) return
    const prevSlots = fb.slots.map((s) => ({ ...s }))
    const forward = () => {
      set((state) => {
        const cur = state.frameBanks[trackId]
        if (!cur) return state
        return { frameBanks: { ...state.frameBanks, [trackId]: { ...cur, slots: cur.slots.filter((_, i) => i !== index) } } }
      })
    }
    const inverse = () => {
      set((state) => {
        const cur = state.frameBanks[trackId]
        if (!cur) return state
        return { frameBanks: { ...state.frameBanks, [trackId]: { ...cur, slots: prevSlots } } }
      })
    }
    undoable(`Remove frame-bank slot on ${trackId}`, forward, inverse)
  },

  reorderFrameBankSlot: (trackId, from, to) => {
    const fb = get().frameBanks[trackId]
    if (!fb) return
    if (from < 0 || from >= fb.slots.length) return
    if (to < 0 || to >= fb.slots.length) return
    if (from === to) return
    const prevSlots = fb.slots.map((s) => ({ ...s }))
    const forward = () => {
      set((state) => {
        const cur = state.frameBanks[trackId]
        if (!cur) return state
        const slots = cur.slots.slice()
        const [moved] = slots.splice(from, 1)
        slots.splice(to, 0, moved)
        return { frameBanks: { ...state.frameBanks, [trackId]: { ...cur, slots } } }
      })
    }
    const inverse = () => {
      set((state) => {
        const cur = state.frameBanks[trackId]
        if (!cur) return state
        return { frameBanks: { ...state.frameBanks, [trackId]: { ...cur, slots: prevSlots } } }
      })
    }
    undoable(`Reorder frame-bank slot on ${trackId}`, forward, inverse)
  },

  setFrameBankPosition: (trackId, pos) => {
    const fb = get().frameBanks[trackId]
    if (!fb) return
    const position = clampFinite(pos, FRAMEBANK_POSITION_MIN, FRAMEBANK_POSITION_MAX, fb.position)
    if (position === fb.position) return
    const prev = fb.position
    const forward = () => {
      set((state) => {
        const cur = state.frameBanks[trackId]
        if (!cur) return state
        return { frameBanks: { ...state.frameBanks, [trackId]: { ...cur, position } } }
      })
    }
    const inverse = () => {
      set((state) => {
        const cur = state.frameBanks[trackId]
        if (!cur) return state
        return { frameBanks: { ...state.frameBanks, [trackId]: { ...cur, position: prev } } }
      })
    }
    undoable(`Set frame-bank position on ${trackId}`, forward, inverse)
  },

  setFrameBankInterp: (trackId, interp) => {
    const fb = get().frameBanks[trackId]
    if (!fb) return
    // Trust boundary: only known interp modes are accepted.
    if (interp !== 'nearest' && interp !== 'blend' && interp !== 'flow') return
    if (interp === fb.interp) return
    const prev = fb.interp
    const forward = () => {
      set((state) => {
        const cur = state.frameBanks[trackId]
        if (!cur) return state
        return { frameBanks: { ...state.frameBanks, [trackId]: { ...cur, interp } } }
      })
    }
    const inverse = () => {
      set((state) => {
        const cur = state.frameBanks[trackId]
        if (!cur) return state
        return { frameBanks: { ...state.frameBanks, [trackId]: { ...cur, interp: prev } } }
      })
    }
    undoable(`Set frame-bank interp on ${trackId}`, forward, inverse)
  },

  setFrameBankByteBudget: (trackId, bytes) => {
    const fb = get().frameBanks[trackId]
    if (!fb) return
    const byteBudget = clampFinite(
      bytes,
      FRAMEBANK_BYTE_BUDGET_MIN,
      FRAMEBANK_BYTE_BUDGET_MAX,
      fb.byteBudget,
    )
    if (byteBudget === fb.byteBudget) return
    const prev = fb.byteBudget
    const forward = () => {
      set((state) => {
        const cur = state.frameBanks[trackId]
        if (!cur) return state
        return { frameBanks: { ...state.frameBanks, [trackId]: { ...cur, byteBudget } } }
      })
    }
    const inverse = () => {
      set((state) => {
        const cur = state.frameBanks[trackId]
        if (!cur) return state
        return { frameBanks: { ...state.frameBanks, [trackId]: { ...cur, byteBudget: prev } } }
      })
    }
    undoable(`Set frame-bank byte budget on ${trackId}`, forward, inverse)
  },

  // P5b.23 — B9: set the slit-scan time axis (lowercase only; unknown → no-op).
  setFrameBankTimeAxis: (trackId, axis) => {
    const fb = get().frameBanks[trackId]
    if (!fb) return
    // Trust boundary: only known lowercase axes accepted (P1-A axis canon).
    if (axis !== 't' && axis !== 'y' && axis !== 'x') return
    if (axis === fb.timeAxis) return
    const prev = fb.timeAxis
    const forward = () => {
      set((state) => {
        const cur = state.frameBanks[trackId]
        if (!cur) return state
        return { frameBanks: { ...state.frameBanks, [trackId]: { ...cur, timeAxis: axis } } }
      })
    }
    const inverse = () => {
      set((state) => {
        const cur = state.frameBanks[trackId]
        if (!cur) return state
        return { frameBanks: { ...state.frameBanks, [trackId]: { ...cur, timeAxis: prev } } }
      })
    }
    undoable(`Set frame-bank time axis on ${trackId}`, forward, inverse)
  },

  // --- B4.1 Sample Rack ---
  addRack: (trackId, padCount = 1) => {
    if (get().racks[trackId]) return
    // Pre-generate the rack + pad ids BEFORE undoable() (deterministic redo).
    const count = Math.max(1, Math.min(64, Math.round(padCount)))
    const pads: RackPad[] = []
    for (let i = 0; i < count; i++) pads.push(createRackPad())
    const newRack: RackNode = { id: nextRackId(), type: 'rack', pads }
    const forward = () => {
      set((state) => ({ racks: { ...state.racks, [trackId]: newRack } }))
    }
    const inverse = () => {
      set((state) => {
        const next = { ...state.racks }
        delete next[trackId]
        return { racks: next }
      })
    }
    undoable(`Add rack to ${trackId}`, forward, inverse)
  },

  removeRack: (trackId) => {
    const removed = get().racks[trackId]
    if (!removed) return
    // Deep-copy the whole rack subtree so inverse restores pads + branches +
    // macros + routes by value (same ids).
    const snapshot = cloneRackNode(removed)
    const forward = () => {
      set((state) => {
        const next = { ...state.racks }
        delete next[trackId]
        return { racks: next }
      })
    }
    const inverse = () => {
      set((state) => ({ racks: { ...state.racks, [trackId]: snapshot } }))
    }
    undoable(`Remove rack from ${trackId}`, forward, inverse)
  },

  getRack: (trackId) => get().racks[trackId],

  // B4-editor — append a fresh (unsourced) pad channel to a track's rack.
  addRackPad: (trackId) => {
    const rack = get().racks[trackId]
    if (!rack) return
    // Mirror addRack's 64-pad ceiling — refuse to grow past it.
    if (rack.pads.length >= 64) return
    // Pre-generate the new pad (with its ids) BEFORE undoable() (deterministic redo).
    const newPad = createRackPad()
    const newPadId = newPad.id
    const forward = () => {
      set((state) => {
        const r = state.racks[trackId]
        if (!r) return state
        return { racks: { ...state.racks, [trackId]: { ...r, pads: [...r.pads, newPad] } } }
      })
    }
    const inverse = () => {
      set((state) => {
        const r = state.racks[trackId]
        if (!r) return state
        return { racks: { ...state.racks, [trackId]: { ...r, pads: r.pads.filter((p) => p.id !== newPadId) } } }
      })
    }
    undoable(`Add rack pad to ${trackId}`, forward, inverse)
  },

  // B4-editor — set a rack pad's sample source (clipId). Immutable update;
  // mirrors the bare-sampler `setSource`. A missing rack / pad is a no-op.
  setRackPadSource: (trackId, padId, clipId) => {
    const rack = get().racks[trackId]
    if (!rack) return
    const idx = rack.pads.findIndex((p) => p.id === padId)
    if (idx === -1) return
    const prevClipId = rack.pads[idx].instrument.clipId
    const forward = () => {
      set((state) => applyRackPadSource(state, trackId, padId, clipId))
    }
    const inverse = () => {
      set((state) => applyRackPadSource(state, trackId, padId, prevClipId))
    }
    undoable(`Set rack pad source on ${trackId}`, forward, inverse)
  },

  updateRackPad: (trackId, padId, patch) => {
    const rack = get().racks[trackId]
    if (!rack) return
    const idx = rack.pads.findIndex((p) => p.id === padId)
    if (idx === -1) return
    // Capture the prior pad by value so inverse restores it exactly (same id,
    // same instrument, same chain/branch) — never by array index.
    const prevPad: RackPad = {
      ...rack.pads[idx],
      instrument: { ...rack.pads[idx].instrument },
    }
    const forward = () => {
      set((state) => applyRackPadPatch(state, trackId, padId, patch))
    }
    const inverse = () => {
      set((state) => {
        const r = state.racks[trackId]
        if (!r) return state
        const i = r.pads.findIndex((p) => p.id === padId)
        if (i === -1) return state
        const pads = r.pads.slice()
        pads[i] = prevPad
        return { racks: { ...state.racks, [trackId]: { ...r, pads } } }
      })
    }
    undoable(`Edit rack pad on ${trackId}`, forward, inverse)
  },

  // B4-pad-delete — remove a pad + prune any macro route pointed at it.
  removeRackPad: (trackId, padId) => {
    const rack = get().racks[trackId]
    if (!rack) return
    const idx = rack.pads.findIndex((p) => p.id === padId)
    if (idx === -1) return // pad absent — no-op (guard).
    // Deep-snapshot the WHOLE rack so inverse restores the deleted pad AND the
    // macro routes pruned alongside it (the route cleanup is part of the same
    // mutation — its inverse must un-prune, per undo.ts: "inverse must RESTORE
    // cleaned data"). Events live in performance.ts and are restored by the
    // companion clearRackPadEvents undo entry.
    const snapshot = cloneRackNode(rack)
    const forward = () => {
      set((state) => {
        const r = state.racks[trackId]
        if (!r) return state

        // (a) Drop the pad (immutable; other pads untouched).
        const pads = r.pads.filter((p) => p.id !== padId)

        // (b) Prune macro routes pointed at the deleted pad. A route targets a pad
        // via `pad.<padId>.<param>` — drop only those whose path starts with the
        // deleted pad's prefix. Surviving routes (other pads) are left intact.
        const prefix = `pad.${padId}.`
        let macros = r.macros
        if (r.macros) {
          macros = r.macros.map((m) => {
            const routes = m.routes ?? []
            const kept = routes.filter((r2) => !r2.targetPath.startsWith(prefix))
            // Only allocate a new macro object when a route was actually pruned.
            return kept.length === routes.length ? m : { ...m, routes: kept }
          })
        }

        return {
          racks: {
            ...state.racks,
            [trackId]: { ...r, pads, ...(macros ? { macros } : {}) },
          },
        }
      })
    }
    const inverse = () => {
      set((state) => ({ racks: { ...state.racks, [trackId]: snapshot } }))
    }
    undoable(`Remove rack pad from ${trackId}`, forward, inverse)
  },

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
    // Pre-generate the new branch + its leaf pad ids BEFORE undoable() so redo is
    // deterministic and undo restores the SAME ids.
    const newBranch: RackNode = {
      id: nextBranchId(),
      type: 'rack',
      pads: [createRackPad()],
      macros: [],
    }
    let didConvert = false
    const nextTop = updateRackNodeAt(rack, branchPath, (node) => {
      const idx = node.pads.findIndex((p) => p.id === padId)
      if (idx === -1) return node // pad absent at this level — no-op
      const pad = node.pads[idx]
      if (pad.branch) return node // already a branch — no-op
      const pads = node.pads.slice()
      // B5.1 model: a pad with a `branch` is a GROUP; its leaf instrument is kept
      // (inert) and the branch starts with ONE default leaf pad + empty macros.
      pads[idx] = { ...pad, branch: newBranch }
      didConvert = true
      return { ...node, pads }
    })
    if (!nextTop || !didConvert) return false
    // Snapshot the prior rack subtree so inverse un-branches the pad exactly.
    const snapshot = cloneRackNode(rack)
    const forward = () => {
      set((state) => ({ racks: { ...state.racks, [trackId]: nextTop } }))
    }
    const inverse = () => {
      set((state) => ({ racks: { ...state.racks, [trackId]: snapshot } }))
    }
    undoable(`Convert pad to branch on ${trackId}`, forward, inverse)
    return true
  },

  addRackPadAt: (trackId, branchPath) => {
    undoableRackTransform(set, get, trackId, branchPath, `Add rack pad on ${trackId}`, (node) => {
      if (node.pads.length >= 64) return node // 64-pad ceiling (mirrors addRackPad)
      return { ...node, pads: [...node.pads, createRackPad()] }
    })
  },

  setRackPadSourceAt: (trackId, branchPath, padId, clipId) => {
    undoableRackTransform(set, get, trackId, branchPath, `Set rack pad source on ${trackId}`, (node) =>
      applyPadSource(node, padId, clipId),
    )
  },

  updateRackPadAt: (trackId, branchPath, padId, patch) => {
    undoableRackTransform(set, get, trackId, branchPath, `Edit rack pad on ${trackId}`, (node) =>
      applyPadUpdate(node, padId, patch),
    )
  },

  setRackPadChokeGroupAt: (trackId, branchPath, padId, group) => {
    undoableRackTransform(set, get, trackId, branchPath, `Set rack pad choke group on ${trackId}`, (node) =>
      applyPadChokeGroup(node, padId, group),
    )
  },

  removeRackPadAt: (trackId, branchPath, padId) => {
    undoableRackTransform(set, get, trackId, branchPath, `Remove rack pad on ${trackId}`, (node) =>
      applyPadRemove(node, padId),
    )
  },

  // B4-choke — set a pad's choke-group membership (null or small int [1,8]).
  setRackPadChokeGroup: (trackId, padId, group) => {
    undoableRackTransform(set, get, trackId, [], `Set rack pad choke group on ${trackId}`, (node) =>
      applyPadChokeGroup(node, padId, group),
    )
  },

  // --- B4.2 Sample Rack macros — store-write fan-out caps (layer 1) ---
  addRackMacro: (trackId, name) => {
    const rack = get().racks[trackId]
    if (!rack) return null
    const macros = rack.macros ?? []
    // FAN-OUT CAP (store-write): reject a 9th macro.
    if (macros.length >= MAX_MACROS_PER_RACK) return null
    // Pre-generate the macro id BEFORE undoable() (deterministic redo; undo
    // restores the SAME id).
    const id = nextMacroId()
    const macro: RackMacro = {
      id,
      name: name ?? `Macro ${macros.length + 1}`,
      value: 0,
      routes: [],
    }
    const forward = () => {
      set((state) => {
        const r = state.racks[trackId]
        if (!r) return state
        return { racks: { ...state.racks, [trackId]: { ...r, macros: [...(r.macros ?? []), macro] } } }
      })
    }
    const inverse = () => {
      set((state) => {
        const r = state.racks[trackId]
        if (!r || !r.macros) return state
        return { racks: { ...state.racks, [trackId]: { ...r, macros: r.macros.filter((m) => m.id !== id) } } }
      })
    }
    undoable(`Add macro to ${trackId}`, forward, inverse)
    return id
  },

  updateRackMacro: (trackId, macroId, patch) => {
    const rack = get().racks[trackId]
    if (!rack || !rack.macros) return
    const idx = rack.macros.findIndex((m) => m.id === macroId)
    if (idx === -1) return
    const old = rack.macros[idx]
    // Capture prior name/value so inverse restores them exactly (by macro id).
    const prevName = old.name
    const prevValue = old.value
    const { name, value } = patch
    if (name === undefined && value === undefined) return // no-op
    const forward = () => {
      set((state) => applyMacroPatch(state, trackId, macroId, {
        ...(name !== undefined ? { name } : {}),
        ...(value !== undefined ? { value } : {}),
      }))
    }
    const inverse = () => {
      set((state) => applyMacroPatch(state, trackId, macroId, {
        ...(name !== undefined ? { name: prevName } : {}),
        ...(value !== undefined ? { value: prevValue } : {}),
      }))
    }
    undoable(`Edit macro on ${trackId}`, forward, inverse)
  },

  removeRackMacro: (trackId, macroId) => {
    const rack = get().racks[trackId]
    if (!rack || !rack.macros) return
    const idx = rack.macros.findIndex((m) => m.id === macroId)
    if (idx === -1) return // macro absent — no-op (don't push empty entry).
    // UH.3: removing a macro removes the macro AND all its routes (a multi-route
    // fan-out). Wrap it in ONE transaction so undo reverts the whole fan-out as a
    // single history entry. The inverse deep-restores the macro WITH its routes.
    const removed: RackMacro = { ...rack.macros[idx], routes: (rack.macros[idx].routes ?? []).map((r) => ({ ...r })) }
    const macroIdx = idx
    const undoStore = useUndoStore.getState()
    undoStore.beginTransaction(`Remove macro from ${trackId}`)
    const forward = () => {
      set((state) => {
        const r = state.racks[trackId]
        if (!r || !r.macros) return state
        const macros = r.macros.filter((m) => m.id !== macroId)
        if (macros.length === r.macros.length) return state
        return { racks: { ...state.racks, [trackId]: { ...r, macros } } }
      })
    }
    const inverse = () => {
      set((state) => {
        const r = state.racks[trackId]
        if (!r) return state
        const macros = [...(r.macros ?? [])]
        // Re-insert at its original position (clamped — list may have shrunk).
        macros.splice(Math.min(macroIdx, macros.length), 0, removed)
        return { racks: { ...state.racks, [trackId]: { ...r, macros } } }
      })
    }
    undoable(`Remove macro from ${trackId}`, forward, inverse)
    undoStore.commitTransaction()
  },

  addMacroRoute: (trackId, macroId, route) => {
    const rack = get().racks[trackId]
    if (!rack || !rack.macros) return false
    const idx = rack.macros.findIndex((m) => m.id === macroId)
    if (idx === -1) return false
    const macro = rack.macros[idx]
    // FAN-OUT CAPS (store-write): reject past the per-macro OR the rack total.
    if ((macro.routes?.length ?? 0) >= MAX_MODROUTES_PER_MACRO) return false
    if (totalRackEdges(rack) >= MAX_TOTAL_EDGES) return false
    // Capture prior routes by value so inverse restores them exactly (by macro id).
    const prevRoutes = (macro.routes ?? []).map((r) => ({ ...r }))
    const newRoute: MacroRoute = { ...route }
    const forward = () => {
      set((state) => {
        const r = state.racks[trackId]
        if (!r || !r.macros) return state
        const mi = r.macros.findIndex((m) => m.id === macroId)
        if (mi === -1) return state
        const macros = r.macros.slice()
        macros[mi] = { ...macros[mi], routes: [...(macros[mi].routes ?? []), newRoute] }
        return { racks: { ...state.racks, [trackId]: { ...r, macros } } }
      })
    }
    const inverse = () => {
      set((state) => applyMacroRoutes(state, trackId, macroId, prevRoutes))
    }
    undoable(`Add macro route on ${trackId}`, forward, inverse)
    return true
  },

  removeMacroRoute: (trackId, macroId, routeIndex) => {
    const rack = get().racks[trackId]
    if (!rack || !rack.macros) return
    const mi = rack.macros.findIndex((m) => m.id === macroId)
    if (mi === -1) return
    const prevRoutes = (rack.macros[mi].routes ?? []).map((r) => ({ ...r }))
    if (routeIndex < 0 || routeIndex >= prevRoutes.length) return // out of range — no-op
    const nextRoutes = prevRoutes.filter((_, i) => i !== routeIndex)
    const forward = () => {
      set((state) => applyMacroRoutes(state, trackId, macroId, nextRoutes.map((r) => ({ ...r }))))
    }
    const inverse = () => {
      set((state) => applyMacroRoutes(state, trackId, macroId, prevRoutes.map((r) => ({ ...r }))))
    }
    undoable(`Remove macro route on ${trackId}`, forward, inverse)
  },

  // --- B4-pad-chain UI — pad-scoped insert-chain mutations ---
  // Shared shape: locate the pad in racks[trackId], immutably transform its
  // `chain` (default [] when absent), write the new pads array back. A missing
  // track/rack/pad is a no-op. Mirrors the project.ts track-chain semantics.
  addEffectToPad: (trackId, padId, effect, branchPath) => {
    undoablePadChain(set, get, trackId, branchPath, padId, `Add effect to pad on ${trackId}`, (chain) => {
      // Trust boundary: mirror addEffect's chain-length cap.
      if (chain.length >= LIMITS.MAX_EFFECTS_PER_CHAIN) return chain
      return [...chain, effect]
    })
  },

  removeEffectFromPad: (trackId, padId, instanceId, branchPath) => {
    undoablePadChain(set, get, trackId, branchPath, padId, `Remove effect from pad on ${trackId}`, (chain) =>
      chain.filter((e) => e.id !== instanceId),
    )
  },

  reorderPadEffect: (trackId, padId, fromIndex, toIndex, branchPath) => {
    undoablePadChain(set, get, trackId, branchPath, padId, `Reorder pad effect on ${trackId}`, (chain) => {
      if (fromIndex < 0 || fromIndex >= chain.length) return chain
      if (toIndex < 0 || toIndex >= chain.length) return chain
      if (fromIndex === toIndex) return chain
      const next = chain.slice()
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      return next
    })
  },

  updatePadEffectParam: (trackId, padId, instanceId, paramName, value, branchPath) => {
    undoablePadChain(set, get, trackId, branchPath, padId, `Edit pad effect param on ${trackId}`, (chain) =>
      chain.map((e) =>
        e.id === instanceId
          ? { ...e, parameters: { ...e.parameters, [paramName]: value } }
          : e,
      ),
    )
  },

  togglePadEffect: (trackId, padId, instanceId, branchPath) => {
    undoablePadChain(set, get, trackId, branchPath, padId, `Toggle pad effect on ${trackId}`, (chain) =>
      chain.map((e) => (e.id === instanceId ? { ...e, isEnabled: !e.isEnabled } : e)),
    )
  },

  // --- B8 Granulator (P5b.19) ---
  addGranulator: (trackId) => {
    if (get().granulators[trackId]) return
    // Pre-generate the granulator (with its id) BEFORE undoable() (deterministic redo).
    const newGran = defaultGranulatorInstrument(nextGranulatorId())
    const forward = () => {
      set((state) => ({ granulators: { ...state.granulators, [trackId]: newGran } }))
    }
    const inverse = () => {
      set((state) => {
        const next = { ...state.granulators }
        delete next[trackId]
        return { granulators: next }
      })
    }
    undoable(`Add granulator to ${trackId}`, forward, inverse)
  },

  removeGranulator: (trackId) => {
    const removed = get().granulators[trackId]
    if (!removed) return
    // Deep-snapshot so inverse restores the full granulator (same id + axes).
    const snapshot = cloneGranulator(removed)
    const forward = () => {
      set((state) => {
        const next = { ...state.granulators }
        delete next[trackId]
        return { granulators: next }
      })
    }
    const inverse = () => {
      set((state) => ({ granulators: { ...state.granulators, [trackId]: snapshot } }))
    }
    undoable(`Remove granulator from ${trackId}`, forward, inverse)
  },

  getGranulator: (trackId) => get().granulators[trackId],

  setGranulatorDensity: (trackId, density) => {
    const g = get().granulators[trackId]
    if (!g) return
    // Trust boundary: clamp + finite-guard (feedback_numeric-trust-boundary).
    const next = clampFinite(Math.round(density), GRANULATOR_DENSITY_MIN, GRANULATOR_DENSITY_MAX, g.density)
    if (next === g.density) return
    const prev = g.density
    undoableGranulatorPatch(set, get, trackId, `Set granulator density on ${trackId}`,
      (gr) => ({ ...gr, density: next }),
      (gr) => ({ ...gr, density: prev }),
    )
  },

  setGranulatorWindow: (trackId, window) => {
    const g = get().granulators[trackId]
    if (!g) return
    // Trust boundary: only known window shapes accepted.
    if (window !== 'hann' && window !== 'tri' && window !== 'rect') return
    if (window === g.window) return
    const prev = g.window
    undoableGranulatorPatch(set, get, trackId, `Set granulator window on ${trackId}`,
      (gr) => ({ ...gr, window }),
      (gr) => ({ ...gr, window: prev }),
    )
  },

  setGranulatorAxisParam: (trackId, axis, param, value) => {
    const g = get().granulators[trackId]
    if (!g) return
    // Trust boundary: only lowercase canonical axes (P1-A axis canon).
    if (!GRANULATOR_AXES.includes(axis)) return
    // Trust boundary: only known axis params.
    if (param !== 'grain' && param !== 'jitter' && param !== 'position' && param !== 'envelope') return
    const oldAx = g.axes[axis] ?? defaultAxisParams()
    // Trust boundary: clamp [0,1] + finite-guard (feedback_numeric-trust-boundary).
    const clamped = clampFinite(value, 0, 1, oldAx[param])
    if (clamped === oldAx[param]) return
    const prevAx: GranulatorAxisParams = { ...oldAx }
    const newAx: GranulatorAxisParams = { ...oldAx, [param]: clamped }
    undoableGranulatorPatch(set, get, trackId, `Set granulator ${axis}-axis ${param} on ${trackId}`,
      (gr) => ({ ...gr, axes: { ...gr.axes, [axis]: newAx } }),
      (gr) => ({ ...gr, axes: { ...gr.axes, [axis]: prevAx } }),
    )
  },

  setGranulatorLAxisEnabled: (trackId, enabled) => {
    const g = get().granulators[trackId]
    if (!g) return
    const b = Boolean(enabled)
    if (b === g.lAxisEnabled) return
    const prev = g.lAxisEnabled
    undoableGranulatorPatch(set, get, trackId, `${b ? 'Enable' : 'Disable'} granulator L-axis on ${trackId}`,
      (gr) => ({ ...gr, lAxisEnabled: b }),
      (gr) => ({ ...gr, lAxisEnabled: prev }),
    )
  },

  setGranulatorSelection: (trackId, rule, latentFlagOn) => {
    const g = get().granulators[trackId]
    if (!g) return
    // Trust boundary: `scenePayload` is NEVER accepted (reserved, no source on main).
    // `latentSimilarity` is accepted only when latentFlagOn is true.
    if (rule === ('scenePayload' as GranulatorSelectionRule)) return
    if (rule === 'latentSimilarity' && !latentFlagOn) return
    if (rule !== 'random' && rule !== 'onset' && rule !== 'latentSimilarity') return
    if (rule === g.selection) return
    const prev = g.selection
    undoableGranulatorPatch(set, get, trackId, `Set granulator selection on ${trackId}`,
      (gr) => ({ ...gr, selection: rule }),
      (gr) => ({ ...gr, selection: prev }),
    )
  },
}))

/**
 * State-level wrapper: set a top-level rack pad's source clipId, reusing the same
 * pure node transform (`applyPadSource`) the B4/B5.2 actions use. Returns a new
 * `{ racks }` slice or the unchanged state on a no-op (missing rack/pad).
 */
function applyRackPadSource(
  state: InstrumentsState,
  trackId: string,
  padId: string,
  clipId: string,
): InstrumentsState | Pick<InstrumentsState, 'racks'> {
  const rack = state.racks[trackId]
  if (!rack) return state
  const next = applyPadSource(rack, padId, clipId)
  if (next === rack) return state
  return { racks: { ...state.racks, [trackId]: next } }
}

/**
 * State-level wrapper: apply a guarded pad patch to a top-level rack pad, reusing
 * the same pure node transform (`applyPadUpdate`) the B4/B5.2 actions use.
 */
function applyRackPadPatch(
  state: InstrumentsState,
  trackId: string,
  padId: string,
  patch: Partial<Omit<RackPad, 'id'>>,
): InstrumentsState | Pick<InstrumentsState, 'racks'> {
  const rack = state.racks[trackId]
  if (!rack) return state
  const next = applyPadUpdate(rack, padId, patch)
  if (next === rack) return state
  return { racks: { ...state.racks, [trackId]: next } }
}

type InstrumentsSet = (
  partial:
    | InstrumentsState
    | Partial<InstrumentsState>
    | ((state: InstrumentsState) => InstrumentsState | Partial<InstrumentsState>),
) => void
type InstrumentsGet = () => InstrumentsState

/** Deep-clone a GranulatorInstrument (axes record copied per-axis) for undo snapshots. */
function cloneGranulator(g: GranulatorInstrument): GranulatorInstrument {
  const axes = {} as Record<GranulatorAxis, GranulatorAxisParams>
  for (const ax of GRANULATOR_AXES) {
    if (g.axes[ax]) axes[ax] = { ...g.axes[ax] }
  }
  return { ...g, axes }
}

/**
 * Undoable helper for a single granulator edit. `applyFwd`/`applyInv` map the
 * current granulator to its new/prior shape (immutably). Caller has already done
 * all trust-boundary guards + no-op checks BEFORE calling, so this always pushes
 * exactly one history entry. No-op if the granulator vanished by forward time.
 */
function undoableGranulatorPatch(
  set: InstrumentsSet,
  get: InstrumentsGet,
  trackId: string,
  description: string,
  applyFwd: (g: GranulatorInstrument) => GranulatorInstrument,
  applyInv: (g: GranulatorInstrument) => GranulatorInstrument,
): void {
  const forward = () => {
    set((state) => {
      const g = state.granulators[trackId]
      if (!g) return state
      return { granulators: { ...state.granulators, [trackId]: applyFwd(g) } }
    })
  }
  const inverse = () => {
    set((state) => {
      const g = state.granulators[trackId]
      if (!g) return state
      return { granulators: { ...state.granulators, [trackId]: applyInv(g) } }
    })
  }
  undoable(description, forward, inverse)
}

/**
 * Undoable helper for a pad-scoped insert-chain edit (B4/B5.2). Applies the
 * `updater` once to compute the next rack; if the rack changed, snapshots the
 * PRIOR rack subtree by value (deep) and pushes one undoable entry whose inverse
 * restores it. A no-op updater / stale path → nothing pushed (no empty entry).
 * Param-drag gestures coalesce when the caller opens a transaction (drag-start)
 * around the per-tick updatePadEffectParam calls and commits on drag-end.
 */
function undoablePadChain(
  set: InstrumentsSet,
  get: InstrumentsGet,
  trackId: string,
  branchPath: string[] | undefined,
  padId: string,
  description: string,
  updater: (chain: EffectInstance[]) => EffectInstance[],
): void {
  const rack = get().racks[trackId]
  if (!rack) return
  const slice = mutatePadChain(get(), trackId, branchPath, padId, updater)
  // mutatePadChain returns the SAME state object on a no-op → nothing changed.
  if (slice === get()) return
  const snapshot = cloneRackNode(rack)
  const forward = () => {
    set((state) => mutatePadChain(state, trackId, branchPath, padId, updater))
  }
  const inverse = () => {
    set((state) => ({ racks: { ...state.racks, [trackId]: snapshot } }))
  }
  undoable(description, forward, inverse)
}

/**
 * Undoable helper for the B5.2 path-aware rack-node transforms (and the flat
 * setRackPadChokeGroup). Resolves the new top rack via `updateRackNodeAt` with
 * the given pure `updater`; if it changed, snapshots the PRIOR rack subtree by
 * value (deep) and pushes one undoable entry whose inverse restores it. A stale
 * path / no-op updater → nothing pushed (no empty history entry). The snapshot
 * captures ids by value, never array indices — per undo.ts convention #1.
 */
function undoableRackTransform(
  set: InstrumentsSet,
  get: InstrumentsGet,
  trackId: string,
  branchPath: string[],
  description: string,
  updater: (node: RackNode) => RackNode | null,
): void {
  const rack = get().racks[trackId]
  if (!rack) return
  const nextTop = updateRackNodeAt(rack, branchPath, updater)
  if (!nextTop) return // stale path or no-op → nothing to undo
  const snapshot = cloneRackNode(rack)
  const forward = () => {
    set((state) => ({ racks: { ...state.racks, [trackId]: nextTop } }))
  }
  const inverse = () => {
    set((state) => ({ racks: { ...state.racks, [trackId]: snapshot } }))
  }
  undoable(description, forward, inverse)
}

/**
 * State-level wrapper: patch a macro's name/value by macro id. id + routes are
 * never touched here. Returns the unchanged state when rack/macro is absent.
 */
function applyMacroPatch(
  state: InstrumentsState,
  trackId: string,
  macroId: string,
  patch: Partial<Pick<RackMacro, 'name' | 'value'>>,
): InstrumentsState | Pick<InstrumentsState, 'racks'> {
  const rack = state.racks[trackId]
  if (!rack || !rack.macros) return state
  const idx = rack.macros.findIndex((m) => m.id === macroId)
  if (idx === -1) return state
  const macros = rack.macros.slice()
  macros[idx] = {
    ...macros[idx],
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.value !== undefined ? { value: patch.value } : {}),
  }
  return { racks: { ...state.racks, [trackId]: { ...rack, macros } } }
}

/**
 * State-level wrapper: replace a macro's full `routes` array by macro id (used by
 * the add/remove-route forward+inverse closures). Returns unchanged state when
 * rack/macro is absent.
 */
function applyMacroRoutes(
  state: InstrumentsState,
  trackId: string,
  macroId: string,
  routes: MacroRoute[],
): InstrumentsState | Pick<InstrumentsState, 'racks'> {
  const rack = state.racks[trackId]
  if (!rack || !rack.macros) return state
  const idx = rack.macros.findIndex((m) => m.id === macroId)
  if (idx === -1) return state
  const macros = rack.macros.slice()
  macros[idx] = { ...macros[idx], routes }
  return { racks: { ...state.racks, [trackId]: { ...rack, macros } } }
}

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
