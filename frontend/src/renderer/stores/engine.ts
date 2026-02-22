import { create } from 'zustand'

type EngineStatus = 'connected' | 'disconnected' | 'restarting'

interface EngineState {
  status: EngineStatus
  uptime: number | undefined
  setStatus: (status: EngineStatus, uptime?: number) => void
}

export const useEngineStore = create<EngineState>((set) => ({
  status: 'disconnected',
  uptime: undefined,
  setStatus: (status, uptime) => set({ status, uptime }),
}))

// Listen for IPC messages from main process via preload bridge
if (typeof window !== 'undefined' && window.entropic) {
  window.entropic.onEngineStatus(({ status, uptime }) => {
    useEngineStore.getState().setStatus(status as EngineStatus, uptime)
  })
}
