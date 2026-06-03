import { create } from 'zustand'
import type { Asset, EffectInstance } from '../../shared/types'
import { randomUUID } from '../utils'
import { LIMITS, ZERO_DEFAULT_EFFECT_IDS } from '../../shared/limits'
import { undoable } from './undo'
import { useToastStore } from './toast'
import { useTimelineStore } from './timeline'
import { pruneEffectDependents, restoreEffectDependents } from './crossStoreCleanup'

// Stable empty array for the no-selection case (avoid re-render churn). (design D4)
const EMPTY: EffectInstance[] = []

interface ProjectState {
  assets: Record<string, Asset>
  effectChain: EffectInstance[]
  selectedEffectId: string | null
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
  addEffect: (trackId: string, effect: EffectInstance) => void
  removeEffect: (trackId: string, id: string) => void
  reorderEffect: (trackId: string, fromIndex: number, toIndex: number) => void
  updateParam: (trackId: string, effectId: string, paramName: string, value: number | string | boolean) => void
  setMix: (trackId: string, effectId: string, mix: number) => void
  toggleEffect: (trackId: string, effectId: string) => void
  selectEffect: (id: string | null) => void
  setCurrentFrame: (frame: number) => void
  setTotalFrames: (total: number) => void
  setIngesting: (ingesting: boolean) => void
  setIngestError: (error: string | null) => void
  setProjectPath: (path: string | null) => void
  bpm: number
  setBpm: (bpm: number) => void
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
  groupEffects: (effectIds: string[], groupName?: string) => string | null
  ungroupEffects: (groupId: string) => void
}

const PROJECT_DEFAULTS = {
  assets: {} as Record<string, Asset>,
  effectChain: [] as EffectInstance[],
  selectedEffectId: null as string | null,
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
  canvasResolution: [1920, 1080] as [number, number],
  deviceGroups: {} as Record<string, { name: string; effectIds: string[]; mix: number; isEnabled: boolean }>,
}

/** Helper: read a track's effectChain from the timeline store. */
function getTrackChain(trackId: string): EffectInstance[] {
  return useTimelineStore.getState().tracks.find((t) => t.id === trackId)?.effectChain ?? []
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

  addEffect: (trackId, effect) => {
    // Guard: no-op if track doesn't exist (D8 loud no-op)
    if (warnNoTrack(trackId)) return

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

    undoable(
      'Add effect',
      () => setTrackChain(trackId, (prev) => [...prev, effect]),
      () => {
        setTrackChain(trackId, (prev) => prev.filter((e) => e.id !== effect.id))
        if (get().selectedEffectId === effect.id) set({ selectedEffectId: null })
      },
    )
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
  setBpm: (bpm: number) => {
    if (!Number.isFinite(bpm)) return
    set({ bpm: Math.max(1, Math.min(300, Math.round(bpm))) })
  },
  selectEffect: (id) => set({ selectedEffectId: id }),
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
  groupEffects: (effectIds, groupName) => {
    if (effectIds.length < 2) {
      useToastStore.getState().addToast({
        level: 'warning',
        message: 'Select at least 2 effects to group',
        source: 'project',
      })
      return null
    }

    const chain = get().effectChain
    const validIds = effectIds.filter((id) => chain.some((e) => e.id === id))

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

// ─── Epic 01: Active-chain selectors (design D4) ─────────────────────────────

/**
 * Returns the effect chain of the currently selected track, or [] when no
 * track is selected. Non-reactive — call in event handlers / non-hook contexts.
 */
export const getActiveEffectChain = (): EffectInstance[] => {
  const tid = useTimelineStore.getState().selectedTrackId
  if (!tid) return EMPTY
  return useTimelineStore.getState().tracks.find((t) => t.id === tid)?.effectChain ?? EMPTY
}

/**
 * Reactive hook: returns the effect chain of the currently selected track, or
 * a stable empty array when no track is selected (no re-render churn).
 */
export const useActiveEffectChain = () =>
  useTimelineStore((s) => {
    const t = s.tracks.find((trk) => trk.id === s.selectedTrackId)
    return t?.effectChain ?? EMPTY
  })
