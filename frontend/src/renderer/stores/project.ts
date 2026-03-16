import { create } from 'zustand'
import type { Asset, EffectInstance } from '../../shared/types'
import { LIMITS } from '../../shared/limits'
import { undoable } from './undo'
import { useToastStore } from './toast'
import { useOperatorStore } from './operators'
import { useAutomationStore } from './automation'
import { useMIDIStore } from './midi'

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

  addAsset: (asset: Asset) => void
  removeAsset: (id: string) => void
  addEffect: (effect: EffectInstance) => void
  removeEffect: (id: string) => void
  reorderEffect: (fromIndex: number, toIndex: number) => void
  updateParam: (effectId: string, paramName: string, value: number | string | boolean) => void
  setMix: (effectId: string, mix: number) => void
  toggleEffect: (effectId: string) => void
  selectEffect: (id: string | null) => void
  setCurrentFrame: (frame: number) => void
  setTotalFrames: (total: number) => void
  setIngesting: (ingesting: boolean) => void
  setIngestError: (error: string | null) => void
  setProjectPath: (path: string | null) => void
  setProjectName: (name: string) => void
  resetProject: () => void

  // Phase 14A: A/B switching (NOT undoable — comparison tool)
  activateAB: (effectId: string) => void
  toggleAB: (effectId: string) => void
  copyToInactiveAB: (effectId: string) => void
  deactivateAB: (effectId: string) => void
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

  addEffect: (effect) => {
    if (get().effectChain.length >= LIMITS.MAX_EFFECTS_PER_CHAIN) {
      useToastStore.getState().addToast({ level: 'warning', message: `Effect chain limit (${LIMITS.MAX_EFFECTS_PER_CHAIN}) reached`, source: 'project' })
      return
    }

    undoable(
      'Add effect',
      () => set({ effectChain: [...get().effectChain, effect] }),
      () => set({
        effectChain: get().effectChain.filter((e) => e.id !== effect.id),
        selectedEffectId: get().selectedEffectId === effect.id ? null : get().selectedEffectId,
      }),
    )
  },

  removeEffect: (id) => {
    const chain = get().effectChain
    const idx = chain.findIndex((e) => e.id === id)
    if (idx === -1) return
    const removed = { ...chain[idx] }
    const prevId = idx > 0 ? chain[idx - 1].id : null

    // Snapshot cross-store state for undo restoration
    const opStore = useOperatorStore.getState()
    const savedOperators = opStore.operators.map((op) => ({
      ...op,
      mappings: [...op.mappings],
    }))
    const autoStore = useAutomationStore.getState()
    const savedLanes = JSON.parse(JSON.stringify(autoStore.lanes))
    const midiStore = useMIDIStore.getState()
    const savedCCMappings = [...midiStore.ccMappings]

    undoable(
      'Remove effect',
      () => {
        // 1. Remove the effect
        set({
          effectChain: get().effectChain.filter((e) => e.id !== id),
          selectedEffectId: get().selectedEffectId === id ? null : get().selectedEffectId,
        })
        // 2. Cross-store cleanup: operator mappings targeting this effect
        const ops = useOperatorStore.getState().operators
        const cleanedOps = ops.map((op) => ({
          ...op,
          mappings: op.mappings.filter((m) => m.targetEffectId !== id),
        }))
        useOperatorStore.setState({ operators: cleanedOps })

        // 3. Automation lanes for this effect (paramPath starts with effectId.)
        const lanes = { ...useAutomationStore.getState().lanes }
        for (const trackId of Object.keys(lanes)) {
          lanes[trackId] = lanes[trackId].filter((l) => !l.paramPath.startsWith(`${id}.`))
          if (lanes[trackId].length === 0) delete lanes[trackId]
        }
        useAutomationStore.setState({ lanes })

        // 4. CC mappings targeting this effect
        const ccMappings = useMIDIStore.getState().ccMappings.filter((m) => m.effectId !== id)
        useMIDIStore.setState({ ccMappings })
      },
      () => {
        // Restore effect
        const chain = [...get().effectChain]
        const insertIdx = prevId !== null ? chain.findIndex((e) => e.id === prevId) + 1 : 0
        chain.splice(insertIdx, 0, removed)
        set({ effectChain: chain })
        // Restore cross-store state
        useOperatorStore.setState({ operators: savedOperators })
        useAutomationStore.setState({ lanes: savedLanes })
        useMIDIStore.setState({ ccMappings: savedCCMappings })
      },
    )
  },

  reorderEffect: (fromIndex, toIndex) => {
    const chain = get().effectChain
    if (fromIndex < 0 || fromIndex >= chain.length) return
    if (toIndex < 0 || toIndex >= chain.length) return
    if (fromIndex === toIndex) return
    const oldOrder = chain.map((e) => e.id)

    undoable(
      'Reorder effects',
      () => {
        const current = [...get().effectChain]
        const [moved] = current.splice(fromIndex, 1)
        current.splice(toIndex, 0, moved)
        set({ effectChain: current })
      },
      () => {
        const current = get().effectChain
        const restored = oldOrder
          .map((id) => current.find((e) => e.id === id))
          .filter((e): e is EffectInstance => e !== undefined)
        set({ effectChain: restored })
      },
    )
  },

  updateParam: (effectId, paramName, value) => {
    const effect = get().effectChain.find((e) => e.id === effectId)
    if (!effect) return
    const oldValue = effect.parameters[paramName]

    undoable(
      `Update ${paramName}`,
      () => set({
        effectChain: get().effectChain.map((e) =>
          e.id === effectId ? { ...e, parameters: { ...e.parameters, [paramName]: value } } : e,
        ),
      }),
      () => set({
        effectChain: get().effectChain.map((e) =>
          e.id === effectId ? { ...e, parameters: { ...e.parameters, [paramName]: oldValue } } : e,
        ),
      }),
    )
  },

  setMix: (effectId, mix) => {
    const effect = get().effectChain.find((e) => e.id === effectId)
    if (!effect) return
    const oldMix = effect.mix
    const clamped = Math.max(0, Math.min(1, mix))

    undoable(
      'Set effect mix',
      () => set({
        effectChain: get().effectChain.map((e) => (e.id === effectId ? { ...e, mix: clamped } : e)),
      }),
      () => set({
        effectChain: get().effectChain.map((e) => (e.id === effectId ? { ...e, mix: oldMix } : e)),
      }),
    )
  },

  toggleEffect: (effectId) => {
    const effect = get().effectChain.find((e) => e.id === effectId)
    if (!effect) return
    const wasEnabled = effect.isEnabled

    undoable(
      `${wasEnabled ? 'Disable' : 'Enable'} effect`,
      () => set({
        effectChain: get().effectChain.map((e) => (e.id === effectId ? { ...e, isEnabled: !wasEnabled } : e)),
      }),
      () => set({
        effectChain: get().effectChain.map((e) => (e.id === effectId ? { ...e, isEnabled: wasEnabled } : e)),
      }),
    )
  },

  selectEffect: (id) => set({ selectedEffectId: id }),
  setCurrentFrame: (frame) => set({ currentFrame: frame }),
  setTotalFrames: (total) => set({ totalFrames: total }),
  setIngesting: (ingesting) => set({ isIngesting: ingesting }),
  setIngestError: (error) => set({ ingestError: error }),
  setProjectPath: (path) => set({ projectPath: path }),
  setProjectName: (name) => set({ projectName: name }),
  resetProject: () => set(PROJECT_DEFAULTS),

  // Phase 14A: A/B switching — NOT undoable (comparison tool)
  activateAB: (effectId) => {
    set((state) => ({
      effectChain: state.effectChain.map((e) => {
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
    }))
  },

  toggleAB: (effectId) => {
    set((state) => ({
      effectChain: state.effectChain.map((e) => {
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
    }))
  },

  copyToInactiveAB: (effectId) => {
    set((state) => ({
      effectChain: state.effectChain.map((e) => {
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
    }))
  },

  deactivateAB: (effectId) => {
    set((state) => ({
      effectChain: state.effectChain.map((e) => {
        if (e.id !== effectId) return e
        return { ...e, abState: null }
      }),
    }))
  },
}))
