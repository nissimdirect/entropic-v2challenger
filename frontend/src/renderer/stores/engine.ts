import { create } from 'zustand'
import { useToastStore } from './toast'

type EngineStatus = 'connected' | 'disconnected' | 'restarting'

interface EngineState {
  status: EngineStatus
  uptime: number | undefined
  lastFrameMs: number | undefined
  setStatus: (status: EngineStatus, uptime?: number, lastFrameMs?: number) => void
}

export const useEngineStore = create<EngineState>((set, get) => ({
  status: 'disconnected',
  uptime: undefined,
  lastFrameMs: undefined,
  setStatus: (status, uptime, lastFrameMs) => {
    const prev = get().status
    set({ status, uptime, lastFrameMs })

    // Toast on status transitions
    if (prev !== status) {
      if (status === 'disconnected' && prev === 'connected') {
        useToastStore.getState().addToast({
          level: 'warning',
          message: 'Engine disconnected — attempting reconnect',
          source: 'engine-status',
        })
      } else if (status === 'connected' && prev !== 'connected') {
        useToastStore.getState().addToast({
          level: 'info',
          message: 'Engine connected',
          source: 'engine-status',
        })
      }
    }
  },
}))

// Listen for IPC messages from main process via preload bridge
if (typeof window !== 'undefined' && window.entropic) {
  window.entropic.onEngineStatus(({ status, uptime, lastFrameMs }) => {
    useEngineStore.getState().setStatus(status as EngineStatus, uptime, lastFrameMs)
  })
}
