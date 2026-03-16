import { create } from 'zustand'

type EngineStatus = 'connected' | 'disconnected' | 'restarting'

interface EngineState {
  status: EngineStatus
  uptime: number | undefined
  lastFrameMs: number | undefined
  setStatus: (status: EngineStatus, uptime?: number, lastFrameMs?: number) => void
}

export const useEngineStore = create<EngineState>((set) => ({
  status: 'disconnected',
  uptime: undefined,
  lastFrameMs: undefined,
  setStatus: (status, uptime, lastFrameMs) => set({ status, uptime, lastFrameMs }),
}))

// Listen for IPC messages from main process via preload bridge
if (typeof window !== 'undefined' && window.entropic) {
  window.entropic.onEngineStatus(({ status, uptime, lastFrameMs }) => {
    useEngineStore.getState().setStatus(status as EngineStatus, uptime, lastFrameMs)
  })
}
