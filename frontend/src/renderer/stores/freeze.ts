import { create } from 'zustand'

interface FreezeInfo {
  cacheId: string
  cutIndex: number
}

type FreezeOp = 'idle' | 'freezing' | 'unfreezing' | 'flattening'

interface FreezeState {
  /** Map of trackId → freeze cache info */
  frozenPrefixes: Record<string, FreezeInfo>

  /** Current operation state — prevents concurrent freeze/unfreeze/flatten */
  operationState: FreezeOp

  /** Freeze effects 0..cutIndex for a track */
  freezePrefix: (trackId: string, cutIndex: number, assetPath: string, chain: Record<string, unknown>[], projectSeed: number, frameCount: number, resolution: [number, number]) => Promise<void>

  /** Remove freeze for a track */
  unfreezePrefix: (trackId: string) => Promise<void>

  /** Check if a specific effect index is frozen */
  isFrozen: (trackId: string, effectIndex: number) => boolean

  /** Get freeze info for a track */
  getFreezeInfo: (trackId: string) => FreezeInfo | null

  /** Flatten a frozen prefix to a new video file */
  flattenPrefix: (trackId: string, outputPath: string, fps?: number) => Promise<string | null>

  /** Clear all freeze state (does not delete caches on backend) */
  reset: () => void
}

function sendCommand(cmd: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (typeof window !== 'undefined' && window.entropic) {
    return window.entropic.sendCommand(cmd)
  }
  return Promise.resolve({ ok: false, error: 'No bridge' })
}

export const useFreezeStore = create<FreezeState>((set, get) => ({
  frozenPrefixes: {},
  operationState: 'idle' as FreezeOp,

  freezePrefix: async (trackId, cutIndex, assetPath, chain, projectSeed, frameCount, resolution) => {
    if (get().operationState !== 'idle') return
    set({ operationState: 'freezing' })

    try {
      const res = await sendCommand({
        cmd: 'freeze_prefix',
        asset_path: assetPath,
        chain,
        project_seed: projectSeed,
        frame_count: frameCount,
        resolution,
      })

      if (res.ok && typeof res.cache_id === 'string') {
        set((state) => ({
          frozenPrefixes: {
            ...state.frozenPrefixes,
            [trackId]: { cacheId: res.cache_id as string, cutIndex },
          },
        }))
      }
    } finally {
      set({ operationState: 'idle' })
    }
  },

  unfreezePrefix: async (trackId) => {
    const info = get().frozenPrefixes[trackId]
    if (!info) return
    if (get().operationState !== 'idle') return
    set({ operationState: 'unfreezing' })

    try {
      await sendCommand({
        cmd: 'invalidate_cache',
        cache_id: info.cacheId,
      })

      set((state) => {
        const { [trackId]: _, ...rest } = state.frozenPrefixes
        return { frozenPrefixes: rest }
      })
    } finally {
      set({ operationState: 'idle' })
    }
  },

  isFrozen: (trackId, effectIndex) => {
    const info = get().frozenPrefixes[trackId]
    if (!info) return false
    return effectIndex <= info.cutIndex
  },

  getFreezeInfo: (trackId) => {
    return get().frozenPrefixes[trackId] ?? null
  },

  flattenPrefix: async (trackId, outputPath, fps = 30) => {
    const info = get().frozenPrefixes[trackId]
    if (!info) return null
    if (get().operationState !== 'idle') return null
    set({ operationState: 'flattening' })

    try {
      const res = await sendCommand({
        cmd: 'flatten',
        cache_id: info.cacheId,
        output_path: outputPath,
        fps,
      })

      if (res.ok && typeof res.output_path === 'string') {
        return res.output_path
      }
      return null
    } finally {
      set({ operationState: 'idle' })
    }
  },

  reset: () => set({ frozenPrefixes: {}, operationState: 'idle' }),
}))
