import { create } from 'zustand'
import type { EffectInfo } from '../../shared/types'

interface EffectsState {
  registry: EffectInfo[]
  isLoading: boolean
  error: string | null
  fetchRegistry: () => Promise<void>
}

export const useEffectsStore = create<EffectsState>((set) => ({
  registry: [],
  isLoading: false,
  error: null,

  fetchRegistry: async () => {
    if (typeof window === 'undefined' || !window.entropic) return
    set({ isLoading: true, error: null })
    try {
      const res = await window.entropic.sendCommand({ cmd: 'list_effects' })
      if (res.ok) {
        set({ registry: res.effects as EffectInfo[], isLoading: false })
      } else {
        set({ error: res.error as string, isLoading: false })
      }
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to fetch effects',
        isLoading: false,
      })
    }
  },
}))
