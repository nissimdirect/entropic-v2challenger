import { create } from 'zustand'

export type ToastLevel = 'info' | 'warning' | 'error' | 'state'

export interface Toast {
  id: string
  level: ToastLevel
  message: string
  source?: string
  action?: { label: string; fn: () => void }
  details?: string
  persistent?: boolean
  count: number
  createdAt: number
}

interface ToastState {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id' | 'count' | 'createdAt'>) => void
  dismissToast: (id: string) => void
  clearAll: () => void
}

const MAX_VISIBLE = 5
const RATE_LIMIT_MS = 2000

const AUTO_DISMISS_MS: Record<ToastLevel, number> = {
  info: 4000,
  warning: 6000,
  error: 8000,
  state: 0, // manual only
}

let nextId = 0

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  addToast: (toast) => {
    const now = Date.now()
    const { toasts } = get()

    // Rate limiting: if same source fired within window, increment count
    if (toast.source) {
      const existing = toasts.find(
        (t) => t.source === toast.source && now - t.createdAt < RATE_LIMIT_MS,
      )
      if (existing) {
        set({
          toasts: toasts.map((t) =>
            t.id === existing.id ? { ...t, count: t.count + 1, message: toast.message } : t,
          ),
        })
        return
      }
    }

    const id = `toast-${++nextId}`
    const newToast: Toast = { ...toast, id, count: 1, createdAt: now }

    let updated = [...toasts, newToast]

    // Evict oldest non-persistent when exceeding max
    while (updated.length > MAX_VISIBLE) {
      const evictIdx = updated.findIndex((t) => !t.persistent)
      if (evictIdx === -1) break
      updated.splice(evictIdx, 1)
    }

    set({ toasts: updated })

    // Auto-dismiss
    const dismissMs = toast.persistent ? 0 : AUTO_DISMISS_MS[toast.level]
    if (dismissMs > 0) {
      setTimeout(() => {
        get().dismissToast(id)
      }, dismissMs)
    }
  },

  dismissToast: (id) => {
    set({ toasts: get().toasts.filter((t) => t.id !== id) })
  },

  clearAll: () => {
    set({ toasts: [] })
  },
}))
