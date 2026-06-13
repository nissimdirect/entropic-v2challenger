import { create } from 'zustand'
import type { Asset, EffectInstance, MatteRef, Track } from '../../shared/types'
import { COMPOSITE_EFFECT_ID } from '../../shared/types'
import { randomUUID } from '../utils'
import { LIMITS, ZERO_DEFAULT_EFFECT_IDS } from '../../shared/limits'
import { undoable, useUndoStore, setCommitValidator } from './undo'
import { useToastStore } from './toast'
import { useTimelineStore } from './timeline'
import { useInstrumentsStore, resolveRackNode } from './instruments'
import { pruneEffectDependents, restoreEffectDependents } from './crossStoreCleanup'
import { validateCompositeChain, rejectCompositeOnAudio } from './compositeValidator'

// Stable empty array for the no-selection case (avoid re-render churn). (design D4)
const EMPTY: EffectInstance[] = []

/**
 * B4-pad-chain UI — the rack pad whose insert chain the bottom DeviceChain
 * editor currently targets (Ableton drum-rack model). `null` → DeviceChain
 * edits the active TRACK's chain (today's behavior, unchanged).
 *
 * NOTE: this is the EDITOR TARGET only. It is DECOUPLED from the render/freeze/
 * export chain source (`getActiveEffectChain`, track-scoped) — selecting a pad
 * retargets the editor, NOT what the main render composites (the render reads
 * `pad.chain` directly via buildRackLayers).
 */
export interface SelectedRackPad {
  trackId: string
  padId: string
  /**
   * B5.2 — the branch path (array of pad ids) the selected pad lives under.
   * Empty/absent → the pad is in the TOP rack (B4 behavior, byte-identical). A
   * non-empty path means the DeviceChain edits a NESTED pad's insert chain — the
   * pad-chain resolvers/mutations walk `pad.branch` along this path before
   * locating `padId`.
   */
  branchPath?: string[]
}

interface ProjectState {
  assets: Record<string, Asset>
  selectedEffectId: string | null
  /** B4-pad-chain UI: the rack pad the DeviceChain editor targets, or null (track). */
  selectedRackPad: SelectedRackPad | null
  /**
   * B4-pad-chain UI: point the DeviceChain editor at a rack pad's insert chain.
   * B5.2 — optional `branchPath` addresses a pad NESTED inside `pad.branch`
   * (empty/omitted → a TOP-rack pad, byte-identical to B4).
   */
  setSelectedRackPad: (trackId: string, padId: string, branchPath?: string[]) => void
  /** B4-pad-chain UI: clear the pad target → DeviceChain falls back to the track. */
  clearSelectedRackPad: () => void

  // --- B5.2 nested-rack navigation ---
  /**
   * B5.2 — the branch path (array of pad ids) the RackDevice is currently editing.
   * Empty = the TOP rack (flat behavior, byte-identical to B4). enterBranch pushes
   * a pad id; exitBranch pops; resetRackEditPath clears (called on track-switch or
   * when the branch the user is inside is deleted — no dangling path → no crash).
   */
  rackEditPath: string[]
  /** B5.2 — drill INTO the branch held by `padId` (push onto rackEditPath). */
  enterBranch: (padId: string) => void
  /** B5.2 — drill OUT one level (pop the last segment of rackEditPath). */
  exitBranch: () => void
  /** B5.2 — jump to an arbitrary prefix length of the current path (breadcrumb click). */
  setRackEditPathDepth: (depth: number) => void
  /** B5.2 — clear the edit path back to the top rack (track-switch / stale-path reset). */
  resetRackEditPath: () => void
  currentFrame: number
  totalFrames: number
  isIngesting: boolean
  ingestError: string | null
  projectPath: string | null
  projectName: string
  // HT-4 (2026-05-16 red-team): project-level deterministic seed. Used by
  // every render + freeze call so cached frames are reproducible. Pre-fix,
  // call sites used `Date.now() % 2147483647` which made freeze cache-ids
  // non-deterministic across re-freezes.
  seed: number
  setSeed: (seed: number) => void

  addAsset: (asset: Asset) => void
  removeAsset: (id: string) => void
  /** UE.5: Update an asset's path after media relink. */
  relinkAsset: (id: string, newPath: string) => void
  addEffect: (trackId: string, effect: EffectInstance) => void
  removeEffect: (trackId: string, id: string) => void
  reorderEffect: (trackId: string, fromIndex: number, toIndex: number) => void
  updateParam: (trackId: string, effectId: string, paramName: string, value: number | string | boolean) => void
  setMix: (trackId: string, effectId: string, mix: number) => void
  /** MK.3: assign (or clear, with null) a device's mask-routing ref. Undoable. */
  setEffectMaskRef: (trackId: string, effectId: string, maskRef: MatteRef | null) => void
  toggleEffect: (trackId: string, effectId: string) => void
  selectEffect: (id: string | null) => void
  setCurrentFrame: (frame: number) => void
  setTotalFrames: (total: number) => void
  setIngesting: (ingesting: boolean) => void
  setIngestError: (error: string | null) => void
  setProjectPath: (path: string | null) => void
  bpm: number
  setBpm: (bpm: number) => void
  /**
   * P2.1: Derived effective BPM after applying all 'projectParam'/'bpm' modulation routes.
   * Computed by applyProjectModulations.ts; NEVER persisted to save files.
   * Initialised to `bpm` at startup; reset to `bpm` whenever setBpm is called.
   */
  effectiveBpm: number
  /**
   * P2.1: Apply a modulation delta to effectiveBpm.
   * `delta` is an additive BPM offset (e.g. from an automation lane at current frame).
   * Clamps the result to [1, 300]. Ignores NaN/Infinity deltas (clampFinite guard).
   */
  applyBpmModulationDelta: (delta: number) => void
  /**
   * P2.1: Reset effectiveBpm back to the persisted bpm baseline.
   * Called at the top of every frame render cycle before re-applying modulations.
   */
  resetEffectiveBpm: () => void
  setProjectName: (name: string) => void
  canvasResolution: [number, number]
  setCanvasResolution: (width: number, height: number) => void
  resetProject: () => void

  // Phase 14A: A/B switching (NOT undoable — comparison tool)
  activateAB: (trackId: string, effectId: string) => void
  toggleAB: (trackId: string, effectId: string) => void
  copyToInactiveAB: (trackId: string, effectId: string) => void
  deactivateAB: (trackId: string, effectId: string) => void

  // Phase 14B: Device Groups (metadata-only, undoable)
  deviceGroups: Record<string, { name: string; effectIds: string[]; mix: number; isEnabled: boolean }>
  /** D5 (Epic 02): trackId scopes validation — ids validated against that track's chain. */
  groupEffects: (trackId: string, effectIds: string[], groupName?: string) => string | null
  ungroupEffects: (groupId: string) => void
}

const PROJECT_DEFAULTS = {
  assets: {} as Record<string, Asset>,
  selectedEffectId: null as string | null,
  // B4-pad-chain UI: DeviceChain editor target. null → active track's chain.
  selectedRackPad: null as SelectedRackPad | null,
  // B5.2: nested-rack edit path (array of branch pad ids). [] → top rack.
  rackEditPath: [] as string[],
  currentFrame: 0,
  totalFrames: 0,
  isIngesting: false,
  ingestError: null as string | null,
  projectPath: null as string | null,
  projectName: 'Untitled',
  // HT-4: deterministic project seed. 0 is a valid default (matches new_project()
  // in backend schema.py); hydrate overrides on load.
  seed: 0,
  bpm: 120,
  effectiveBpm: 120,
  canvasResolution: [1920, 1080] as [number, number],
  deviceGroups: {} as Record<string, { name: string; effectIds: string[]; mix: number; isEnabled: boolean }>,
}

/** Helper: read a track's effectChain from the timeline store. */
function getTrackChain(trackId: string): EffectInstance[] {
  return useTimelineStore.getState().tracks.find((t) => t.id === trackId)?.effectChain ?? []
}

/** Helper: read a track (full record) from the timeline store. */
function getTrack(trackId: string): Track | undefined {
  return useTimelineStore.getState().tracks.find((t) => t.id === trackId)
}

/**
 * P2.2a: Run an effect-chain mutation inside an undo transaction whose COMMIT is
 * gated by the terminal-composite validator. The mutation's `undoable()` entries
 * buffer into the transaction; on commit, the validator inspects EVERY track chain
 * (see the registered commit validator below). A violation aborts (rolls back) the
 * whole transaction and toasts — so addEffect / reorderEffect can never leave an
 * invalid terminal-composite shape. Intermediate states inside the transaction are
 * never validated (validation runs only at commit).
 */
function withCompositeValidation(_trackId: string, description: string, mutate: () => void): void {
  const undo = useUndoStore.getState()
  undo.beginTransaction(description)
  mutate()
  undo.commitTransaction()
}

/** Helper: write a track's effectChain via the timeline store primitive. */
function setTrackChain(trackId: string, updater: (chain: EffectInstance[]) => EffectInstance[]): void {
  useTimelineStore.getState().updateTrackEffectChain(trackId, updater)
}

/** Dev-mode loud no-op guard. (design D8, task 7b) */
function warnNoTrack(trackId: string): boolean {
  const exists = useTimelineStore.getState().tracks.some((t) => t.id === trackId)
  if (!exists && process.env.NODE_ENV !== 'test') {
    console.warn(`[effect-chain] no track for trackId=${JSON.stringify(trackId)}; mutation skipped`)
  }
  return !exists
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  ...PROJECT_DEFAULTS,

  addAsset: (asset) =>
    set((state) => ({
      assets: { ...state.assets, [asset.id]: asset },
    })),

  removeAsset: (id) =>
    set((state) => {
      const { [id]: _, ...rest } = state.assets
      return { assets: rest }
    }),

  relinkAsset: (id, newPath) =>
    set((state) => {
      const existing = state.assets[id]
      if (!existing) return state
      return {
        assets: {
          ...state.assets,
          [id]: { ...existing, path: newPath },
        },
      }
    }),

  addEffect: (trackId, effect) => {
    // Guard: no-op if track doesn't exist (D8 loud no-op)
    if (warnNoTrack(trackId)) return

    // P2.2a (R3): reject a Composite added to an audio track up front (audio has
    // no visual compositing). Toast + bail before mutating.
    const track = getTrack(trackId)
    if (track) {
      const audioReject = rejectCompositeOnAudio(track.type, effect)
      if (audioReject) {
        useToastStore.getState().addToast({ level: 'warning', message: audioReject, source: 'composite-validator' })
        return
      }
    }

    const chain = getTrackChain(trackId)
    if (chain.length >= LIMITS.MAX_EFFECTS_PER_CHAIN) {
      useToastStore.getState().addToast({ level: 'warning', message: `Effect chain limit (${LIMITS.MAX_EFFECTS_PER_CHAIN}) reached`, source: 'project' })
      return
    }

    // F-0516-7: surface zero-adjustment effects with a one-time info toast.
    // Util effects (curves, levels, hsl, color_balance) start neutral by
    // design — without a hint, they look identical to "no effect" and the
    // user reports the chain as broken.
    if (ZERO_DEFAULT_EFFECT_IDS.has(effect.effectId)) {
      const lsKey = `entropic.toast.zeroDefault.shown.${effect.effectId}`
      try {
        if (!localStorage.getItem(lsKey)) {
          useToastStore.getState().addToast({
            level: 'info',
            message: `${effect.effectId.split('.').pop()} starts neutral — drag params to see changes.`,
            source: `zero-default:${effect.effectId}`,
          })
          localStorage.setItem(lsKey, '1')
        }
      } catch {
        // localStorage unavailable (e.g. SSR) — skip gating, toast every time.
      }
    }

    // P2.2a: validate at transaction commit. If adding `effect` produces an
    // invalid terminal-composite shape (mid-chain composite, second composite),
    // the transaction aborts and rolls back.
    withCompositeValidation(trackId, 'Add effect', () => {
      undoable(
        'Add effect',
        () => setTrackChain(trackId, (prev) => [...prev, effect]),
        () => {
          setTrackChain(trackId, (prev) => prev.filter((e) => e.id !== effect.id))
          if (get().selectedEffectId === effect.id) set({ selectedEffectId: null })
        },
      )
    })
  },

  removeEffect: (trackId, id) => {
    // Guard: no-op if track doesn't exist (D8 loud no-op)
    if (warnNoTrack(trackId)) return

    // Snapshot PRE-undoable reads from the track chain (CTO finding #3)
    const chain = getTrackChain(trackId)
    const idx = chain.findIndex((e) => e.id === id)
    if (idx === -1) return
    const removed = { ...chain[idx] }
    const prevId = idx > 0 ? chain[idx - 1].id : null

    // Closure var: populated by pruneEffectDependents in forward, consumed by inverse.
    // eslint-disable-next-line prefer-const
    let snap: ReturnType<typeof pruneEffectDependents> | undefined

    undoable(
      'Remove effect',
      () => {
        // 1. Remove the effect from the track chain
        setTrackChain(trackId, (prev) => prev.filter((e) => e.id !== id))
        if (get().selectedEffectId === id) set({ selectedEffectId: null })

        // 2. Cross-store cleanup via shared helper (D2: behavior-preserving extraction)
        snap = pruneEffectDependents([id])
      },
      () => {
        // Restore effect at original position in the track chain
        setTrackChain(trackId, (prev) => {
          const chain = [...prev]
          const insertIdx = prevId !== null ? chain.findIndex((e) => e.id === prevId) + 1 : 0
          chain.splice(insertIdx, 0, removed)
          return chain
        })
        // Restore cross-store state from snapshot
        if (snap) restoreEffectDependents(snap)
      },
    )
  },

  reorderEffect: (trackId, fromIndex, toIndex) => {
    // Guard: no-op if track doesn't exist (D8 loud no-op)
    if (warnNoTrack(trackId)) return

    // Snapshot PRE-undoable reads from the track chain (CTO finding #3)
    const chain = getTrackChain(trackId)
    if (fromIndex < 0 || fromIndex >= chain.length) return
    if (toIndex < 0 || toIndex >= chain.length) return
    if (fromIndex === toIndex) return
    const oldOrder = chain.map((e) => e.id)

    // P2.2a: validate at transaction commit. A reorder that moves the composite
    // off the terminal position (mid-chain), or any composite on an audio track,
    // aborts and rolls back. (R2 / R3 enforced at commit on the resulting chain.)
    withCompositeValidation(trackId, 'Reorder effects', () => {
      undoable(
        'Reorder effects',
        () => {
          setTrackChain(trackId, (prev) => {
            const current = [...prev]
            const [moved] = current.splice(fromIndex, 1)
            current.splice(toIndex, 0, moved)
            return current
          })
        },
        () => {
          setTrackChain(trackId, (prev) => {
            return oldOrder
              .map((id) => prev.find((e) => e.id === id))
              .filter((e): e is EffectInstance => e !== undefined)
          })
        },
      )
    })
  },

  updateParam: (trackId, effectId, paramName, value) => {
    // Guard: no-op if track doesn't exist (D8 loud no-op)
    if (warnNoTrack(trackId)) return

    // Snapshot PRE-undoable read from the track chain (CTO finding #3)
    const chain = getTrackChain(trackId)
    const effect = chain.find((e) => e.id === effectId)
    if (!effect) return
    const oldValue = effect.parameters[paramName]

    undoable(
      `Update ${paramName}`,
      () => setTrackChain(trackId, (prev) =>
        prev.map((e) =>
          e.id === effectId ? { ...e, parameters: { ...e.parameters, [paramName]: value } } : e,
        ),
      ),
      () => setTrackChain(trackId, (prev) =>
        prev.map((e) =>
          e.id === effectId ? { ...e, parameters: { ...e.parameters, [paramName]: oldValue } } : e,
        ),
      ),
    )
  },

  setMix: (trackId, effectId, mix) => {
    // Guard: no-op if track doesn't exist (D8 loud no-op)
    if (warnNoTrack(trackId)) return

    // Snapshot PRE-undoable read from the track chain (CTO finding #3)
    const chain = getTrackChain(trackId)
    const effect = chain.find((e) => e.id === effectId)
    if (!effect) return
    const oldMix = effect.mix
    const clamped = Math.max(0, Math.min(1, mix))

    undoable(
      'Set effect mix',
      () => setTrackChain(trackId, (prev) =>
        prev.map((e) => (e.id === effectId ? { ...e, mix: clamped } : e)),
      ),
      () => setTrackChain(trackId, (prev) =>
        prev.map((e) => (e.id === effectId ? { ...e, mix: oldMix } : e)),
      ),
    )
  },

  setEffectMaskRef: (trackId, effectId, maskRef) => {
    // MK.3: assign / clear a device's mask routing ref. Undoable so it round-
    // trips with Cmd+Z like every other device edit. Guard: loud no-op on bad
    // track (D8).
    if (warnNoTrack(trackId)) return

    // Snapshot PRE-undoable read from the track chain (CTO finding #3).
    const chain = getTrackChain(trackId)
    const effect = chain.find((e) => e.id === effectId)
    if (!effect) return
    const oldRef = effect.maskRef ?? null

    undoable(
      maskRef ? 'Assign device mask' : 'Clear device mask',
      () => setTrackChain(trackId, (prev) =>
        prev.map((e) => (e.id === effectId ? { ...e, maskRef } : e)),
      ),
      () => setTrackChain(trackId, (prev) =>
        prev.map((e) => (e.id === effectId ? { ...e, maskRef: oldRef } : e)),
      ),
    )
  },

  toggleEffect: (trackId, effectId) => {
    // Guard: no-op if track doesn't exist (D8 loud no-op)
    if (warnNoTrack(trackId)) return

    // Snapshot PRE-undoable read from the track chain (CTO finding #3)
    const chain = getTrackChain(trackId)
    const effect = chain.find((e) => e.id === effectId)
    if (!effect) return
    const wasEnabled = effect.isEnabled

    undoable(
      `${wasEnabled ? 'Disable' : 'Enable'} effect`,
      () => setTrackChain(trackId, (prev) =>
        prev.map((e) => (e.id === effectId ? { ...e, isEnabled: !wasEnabled } : e)),
      ),
      () => setTrackChain(trackId, (prev) =>
        prev.map((e) => (e.id === effectId ? { ...e, isEnabled: wasEnabled } : e)),
      ),
    )
  },

  bpm: PROJECT_DEFAULTS.bpm,
  effectiveBpm: PROJECT_DEFAULTS.effectiveBpm,
  setBpm: (bpm: number) => {
    if (!Number.isFinite(bpm)) return
    const clamped = Math.max(1, Math.min(300, Math.round(bpm)))
    // P2.1: When the user edits BPM, also reset the derived effectiveBpm to the
    // new baseline so modulation consumers start from the correct reference.
    set({ bpm: clamped, effectiveBpm: clamped })
  },
  applyBpmModulationDelta: (delta: number) => {
    // P2.1: Ignore non-finite deltas — clampFinite boundary guard.
    if (!Number.isFinite(delta)) return
    const current = get().bpm
    const next = Math.max(1, Math.min(300, current + delta))
    set({ effectiveBpm: next })
  },
  resetEffectiveBpm: () => {
    set({ effectiveBpm: get().bpm })
  },
  selectEffect: (id) => set({ selectedEffectId: id }),
  // B4-pad-chain UI: retarget the DeviceChain editor onto a rack pad's chain.
  // NOT undoable (a view-selection, like selectEffect/selectedTrackId).
  // B5.2: optional branchPath addresses a nested pad; omitted → top-rack pad.
  setSelectedRackPad: (trackId, padId, branchPath) =>
    set({
      selectedRackPad: { trackId, padId, ...(branchPath && branchPath.length ? { branchPath } : {}) },
    }),
  clearSelectedRackPad: () => set({ selectedRackPad: null }),

  // B5.2: nested-rack navigation — view state, NOT undoable (like selectEffect).
  rackEditPath: PROJECT_DEFAULTS.rackEditPath,
  enterBranch: (padId) => set((state) => ({ rackEditPath: [...state.rackEditPath, padId] })),
  exitBranch: () => set((state) => ({ rackEditPath: state.rackEditPath.slice(0, -1) })),
  setRackEditPathDepth: (depth) =>
    set((state) => {
      // Trust boundary: clamp to a valid prefix length of the current path.
      const d = Math.max(0, Math.min(state.rackEditPath.length, Math.floor(depth)))
      if (d === state.rackEditPath.length) return state
      return { rackEditPath: state.rackEditPath.slice(0, d) }
    }),
  resetRackEditPath: () => set({ rackEditPath: [] }),
  setCurrentFrame: (frame) => set({ currentFrame: frame }),
  setTotalFrames: (total) => set({ totalFrames: total }),
  setIngesting: (ingesting) => set({ isIngesting: ingesting }),
  setIngestError: (error) => set({ ingestError: error }),
  setProjectPath: (path) => set({ projectPath: path }),
  setProjectName: (name) => set({ projectName: name }),
  // HT-4: seed clamp matches backend schema.py SEED_MIN/MAX (0..2^31-1).
  // Out-of-range or non-integer input is silently dropped — the load path
  // already validates the value before it reaches the store.
  setSeed: (seed: number) => {
    if (!Number.isInteger(seed) || seed < 0 || seed > 2147483647) return
    set({ seed })
  },
  canvasResolution: PROJECT_DEFAULTS.canvasResolution,
  setCanvasResolution: (width: number, height: number) => {
    if (!Number.isFinite(width) || !Number.isFinite(height)) return
    const w = Math.max(1, Math.min(7680, Math.round(width)))
    const h = Math.max(1, Math.min(4320, Math.round(height)))
    set({ canvasResolution: [w, h] })
  },
  resetProject: () => set(PROJECT_DEFAULTS),

  // Phase 14A: A/B switching — NOT undoable (comparison tool)
  // CTO finding #6: these are non-undoable; use set() directly, NOT undoable().
  activateAB: (trackId, effectId) => {
    if (warnNoTrack(trackId)) return
    setTrackChain(trackId, (prev) =>
      prev.map((e) => {
        if (e.id !== effectId) return e
        if (e.abState) return e // already active
        return {
          ...e,
          abState: {
            a: { ...e.parameters },
            b: { ...e.parameters },
            active: 'a' as const,
          },
        }
      }),
    )
  },

  toggleAB: (trackId, effectId) => {
    if (warnNoTrack(trackId)) return
    setTrackChain(trackId, (prev) =>
      prev.map((e) => {
        if (e.id !== effectId || !e.abState) return e
        const { a, b, active } = e.abState
        const nextActive = active === 'a' ? 'b' : 'a'
        // Save current params to the active slot, load from the other slot
        const saved = { ...e.parameters }
        const loaded = nextActive === 'a' ? { ...a } : { ...b }
        return {
          ...e,
          parameters: loaded,
          abState: {
            a: active === 'a' ? saved : a,
            b: active === 'b' ? saved : b,
            active: nextActive,
          },
        }
      }),
    )
  },

  copyToInactiveAB: (trackId, effectId) => {
    if (warnNoTrack(trackId)) return
    setTrackChain(trackId, (prev) =>
      prev.map((e) => {
        if (e.id !== effectId || !e.abState) return e
        const current = { ...e.parameters }
        return {
          ...e,
          abState: {
            ...e.abState,
            a: e.abState.active === 'b' ? current : e.abState.a,
            b: e.abState.active === 'a' ? current : e.abState.b,
          },
        }
      }),
    )
  },

  deactivateAB: (trackId, effectId) => {
    if (warnNoTrack(trackId)) return
    setTrackChain(trackId, (prev) =>
      prev.map((e) => {
        if (e.id !== effectId) return e
        return { ...e, abState: null }
      }),
    )
  },

  // Phase 14B: Device Groups
  // D5 (Epic 02): trackId scopes validation — ids validated against that track's chain.
  groupEffects: (trackId, effectIds, groupName) => {
    if (effectIds.length < 2) {
      useToastStore.getState().addToast({
        level: 'warning',
        message: 'Select at least 2 effects to group',
        source: 'project',
      })
      return null
    }

    // D5: validate against the track's chain (not the global effectChain)
    const chain = getTrackChain(trackId)
    const validIds = effectIds.filter((id) => chain.some((e) => e.id === id))

    // P2.2a (R4): a terminal composite must never live inside a device group.
    // Reject the grouping if any selected id is the chain's composite effect.
    const compositeIds = new Set(chain.filter((e) => e.effectId === COMPOSITE_EFFECT_ID).map((e) => e.id))
    if (validIds.some((id) => compositeIds.has(id))) {
      useToastStore.getState().addToast({
        level: 'warning',
        message: 'Composite effect cannot be placed inside a device group',
        source: 'composite-validator',
      })
      return null
    }

    if (validIds.length < 2) return null

    const groupId = randomUUID()
    const groupMeta = {
      name: groupName ?? `Group ${groupId.slice(0, 4)}`,
      effectIds: validIds,
      mix: 1,
      isEnabled: true,
    }

    const forward = () => {
      set((state) => ({
        deviceGroups: { ...state.deviceGroups, [groupId]: groupMeta },
      }))
    }

    const inverse = () => {
      set((state) => {
        const { [groupId]: _, ...rest } = state.deviceGroups
        return { deviceGroups: rest }
      })
    }

    undoable('Group effects', forward, inverse)
    return groupId
  },

  ungroupEffects: (groupId) => {
    const groups = get().deviceGroups
    if (!groups[groupId]) return

    const forward = () => {
      set((state) => {
        const { [groupId]: _, ...rest } = state.deviceGroups
        return { deviceGroups: rest }
      })
    }

    const inverse = () => {
      set((state) => ({
        deviceGroups: { ...state.deviceGroups, [groupId]: groups[groupId] },
      }))
    }

    undoable('Ungroup effects', forward, inverse)
  },
}))

// P2.2a: register the transaction-commit validator. Runs AFTER buffered mutations
// are applied (so it sees the final chains); returns the FIRST error string found
// across all tracks to abort and roll back the transaction. Validating every track
// (not just one) means any committed transaction that leaves an invalid terminal-
// composite shape anywhere is rejected, while intermediate in-transaction states
// are never inspected.
setCommitValidator((): string | null => {
  const deviceGroups = useProjectStore.getState().deviceGroups
  for (const track of useTimelineStore.getState().tracks) {
    const error = validateCompositeChain(track, deviceGroups)
    if (error) return error
  }
  return null
})

// ─── Epic 02: Active-track resolution (design D1) ────────────────────────────

/**
 * Non-reactive: returns the active track id.
 * Resolution order: selectedTrackId (if valid) → first video track → null.
 * Call in event handlers and non-hook contexts.
 */
export const getActiveTrackId = (): string | null => {
  const tl = useTimelineStore.getState()
  if (tl.selectedTrackId && tl.tracks.some((t) => t.id === tl.selectedTrackId)) return tl.selectedTrackId
  const firstVideo = tl.tracks.find((t) => t.type === 'video')
  return firstVideo?.id ?? null
}

/**
 * Reactive hook: returns the active track id.
 * Resolution order: selectedTrackId (if valid) → first video track → null.
 */
export const useActiveTrackId = () =>
  useTimelineStore((s) =>
    (s.selectedTrackId && s.tracks.some((t) => t.id === s.selectedTrackId))
      ? s.selectedTrackId
      : (s.tracks.find((t) => t.type === 'video')?.id ?? null),
  )

// ─── Epic 01/02: Active-chain selectors ──────────────────────────────────────

/**
 * Returns the effect chain of the currently selected track, or [] when no
 * track is selected. Non-reactive — call in event handlers / non-hook contexts.
 * Epic 02: resolves through the active-track rule (D1) so display and mutation agree.
 */
export const getActiveEffectChain = (): EffectInstance[] => {
  const tid = getActiveTrackId()
  if (!tid) return EMPTY
  return useTimelineStore.getState().tracks.find((t) => t.id === tid)?.effectChain ?? EMPTY
}

/**
 * Reactive hook: returns the effect chain of the active track (selected if valid,
 * else first video track), or a stable empty array when no active track exists.
 * Epic 02: resolves through the active-track rule (D1).
 */
export const useActiveEffectChain = () =>
  useTimelineStore((s) => {
    // D1 resolution: selectedTrackId if valid, else first video track, else null
    const activeId = (s.selectedTrackId && s.tracks.some((t) => t.id === s.selectedTrackId))
      ? s.selectedTrackId
      : (s.tracks.find((t) => t.type === 'video')?.id ?? null)
    const t = activeId ? s.tracks.find((trk) => trk.id === activeId) : null
    return t?.effectChain ?? EMPTY
  })

// ─── B4-pad-chain UI: pad-scoped chain resolution (Ableton drum-rack) ─────────
//
// These resolve the SELECTED RACK PAD's insert chain from the instruments store
// (`racks[trackId].pads[i].chain`). They are SEPARATE from the track-scoped
// getActiveEffectChain/useActiveEffectChain above (which freeze/export/render use
// and MUST stay track-scoped). When no pad is selected, OR the selected pad/track
// is gone, they return a stable empty array (graceful fallback — no crash).

/**
 * Non-reactive: the selected rack pad's insert chain, or [] when no pad is
 * selected (or the pad/track no longer exists). Call in event handlers.
 */
export const getActivePadChain = (): EffectInstance[] => {
  const sel = useProjectStore.getState().selectedRackPad
  if (!sel) return EMPTY
  const rack = useInstrumentsStore.getState().racks[sel.trackId]
  if (!rack) return EMPTY
  // B5.2: walk to the RackNode at the selection's branchPath (null → stale path).
  const node = resolveRackNode(rack, sel.branchPath ?? [])
  if (!node) return EMPTY
  return node.pads.find((p) => p.id === sel.padId)?.chain ?? EMPTY
}

/**
 * Reactive hook: the selected rack pad's insert chain, or a stable empty array
 * when no pad is selected (or the pad/track no longer exists). Subscribes to
 * BOTH the project store (selection) and the instruments store (the pad chain)
 * so a mutation to either re-renders the DeviceChain.
 */
export const useActivePadEffectChain = (): EffectInstance[] => {
  const sel = useProjectStore((s) => s.selectedRackPad)
  return useInstrumentsStore((s) => {
    if (!sel) return EMPTY
    const rack = s.racks[sel.trackId]
    if (!rack) return EMPTY
    // B5.2: resolve the nested RackNode at the selection's branchPath.
    const node = resolveRackNode(rack, sel.branchPath ?? [])
    if (!node) return EMPTY
    return node.pads.find((p) => p.id === sel.padId)?.chain ?? EMPTY
  })
}
