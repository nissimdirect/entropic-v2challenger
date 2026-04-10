import { create } from 'zustand'
import { clampFinite } from '../../shared/numeric'

interface PopOutBounds {
  x: number
  y: number
  width: number
  height: number
}

interface LayoutState {
  sidebarCollapsed: boolean
  timelineCollapsed: boolean
  timelineHeight: number
  isPopOutOpen: boolean
  popOutBounds: PopOutBounds | null
  quantizeEnabled: boolean
  quantizeDivision: number
  toggleSidebar: () => void
  toggleTimeline: () => void
  setTimelineHeight: (h: number) => void
  toggleFocusMode: () => void
  setPopOutOpen: (open: boolean) => void
  setPopOutBounds: (bounds: PopOutBounds | null) => void
  toggleQuantize: () => void
  setQuantizeDivision: (div: number) => void
}

const STORAGE_KEY = 'entropic-layout'

interface PersistedLayout {
  sidebarCollapsed: boolean
  timelineCollapsed: boolean
  timelineHeight: number
}

function loadPersistedLayout(): Partial<PersistedLayout> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return {}
    const result: Partial<PersistedLayout> = {}
    if (typeof parsed.sidebarCollapsed === 'boolean') result.sidebarCollapsed = parsed.sidebarCollapsed
    if (typeof parsed.timelineCollapsed === 'boolean') result.timelineCollapsed = parsed.timelineCollapsed
    if (typeof parsed.timelineHeight === 'number' && parsed.timelineHeight >= 120 && parsed.timelineHeight <= 800) {
      result.timelineHeight = parsed.timelineHeight
    }
    return result
  } catch {
    return {}
  }
}

function persistLayout(state: PersistedLayout): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Best-effort
  }
}

const persisted = loadPersistedLayout()

export const useLayoutStore = create<LayoutState>((set, get) => ({
  sidebarCollapsed: persisted.sidebarCollapsed ?? false,
  timelineCollapsed: persisted.timelineCollapsed ?? false,
  timelineHeight: persisted.timelineHeight ?? 200,
  isPopOutOpen: false,
  popOutBounds: null,
  quantizeEnabled: false,
  quantizeDivision: 4, // 1/4 note

  toggleSidebar: () => {
    const next = !get().sidebarCollapsed
    set({ sidebarCollapsed: next })
    persistLayout({ ...get(), sidebarCollapsed: next })
  },

  toggleTimeline: () => {
    const next = !get().timelineCollapsed
    set({ timelineCollapsed: next })
    persistLayout({ ...get(), timelineCollapsed: next })
  },

  setTimelineHeight: (h: number) => {
    const clamped = clampFinite(h, 100, 800, 250)
    set({ timelineHeight: clamped })
    persistLayout({ ...get(), timelineHeight: clamped })
  },

  toggleFocusMode: () => {
    const { sidebarCollapsed, timelineCollapsed } = get()
    // If either is expanded, collapse both. If both collapsed, expand both.
    const shouldCollapse = !sidebarCollapsed || !timelineCollapsed
    set({ sidebarCollapsed: shouldCollapse, timelineCollapsed: shouldCollapse })
    persistLayout({ ...get(), sidebarCollapsed: shouldCollapse, timelineCollapsed: shouldCollapse })
  },

  setPopOutOpen: (open: boolean) => {
    set({ isPopOutOpen: open })
  },

  setPopOutBounds: (bounds: PopOutBounds | null) => {
    set({ popOutBounds: bounds })
  },

  toggleQuantize: () => {
    set({ quantizeEnabled: !get().quantizeEnabled })
  },

  setQuantizeDivision: (div: number) => {
    const valid = [1, 2, 4, 8, 16, 32]
    if (valid.includes(div)) set({ quantizeDivision: div })
  },
}))
