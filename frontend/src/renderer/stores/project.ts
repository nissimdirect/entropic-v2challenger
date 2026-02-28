import { create } from 'zustand'
import type { Asset, EffectInstance } from '../../shared/types'

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
}

const MAX_CHAIN_LENGTH = 10

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

export const useProjectStore = create<ProjectState>((set) => ({
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

  addEffect: (effect) =>
    set((state) => {
      if (state.effectChain.length >= MAX_CHAIN_LENGTH) return state
      return { effectChain: [...state.effectChain, effect] }
    }),

  removeEffect: (id) =>
    set((state) => ({
      effectChain: state.effectChain.filter((e) => e.id !== id),
      selectedEffectId: state.selectedEffectId === id ? null : state.selectedEffectId,
    })),

  reorderEffect: (fromIndex, toIndex) =>
    set((state) => {
      const chain = [...state.effectChain]
      if (fromIndex < 0 || fromIndex >= chain.length) return state
      if (toIndex < 0 || toIndex >= chain.length) return state
      const [moved] = chain.splice(fromIndex, 1)
      chain.splice(toIndex, 0, moved)
      return { effectChain: chain }
    }),

  updateParam: (effectId, paramName, value) =>
    set((state) => ({
      effectChain: state.effectChain.map((e) =>
        e.id === effectId
          ? { ...e, parameters: { ...e.parameters, [paramName]: value } }
          : e,
      ),
    })),

  setMix: (effectId, mix) =>
    set((state) => ({
      effectChain: state.effectChain.map((e) =>
        e.id === effectId ? { ...e, mix: Math.max(0, Math.min(1, mix)) } : e,
      ),
    })),

  toggleEffect: (effectId) =>
    set((state) => ({
      effectChain: state.effectChain.map((e) =>
        e.id === effectId ? { ...e, isEnabled: !e.isEnabled } : e,
      ),
    })),

  selectEffect: (id) => set({ selectedEffectId: id }),
  setCurrentFrame: (frame) => set({ currentFrame: frame }),
  setTotalFrames: (total) => set({ totalFrames: total }),
  setIngesting: (ingesting) => set({ isIngesting: ingesting }),
  setIngestError: (error) => set({ ingestError: error }),
  setProjectPath: (path) => set({ projectPath: path }),
  setProjectName: (name) => set({ projectName: name }),
  resetProject: () => set(PROJECT_DEFAULTS),
}))
