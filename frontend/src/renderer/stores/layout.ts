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
  deviceChainHeight: number
  isPopOutOpen: boolean
  popOutBounds: PopOutBounds | null
  quantizeEnabled: boolean
  quantizeDivision: number
  /** UE.1: snap clips to edges/playhead/markers. Persisted to localStorage. */
  snapEnabled: boolean
  /**
   * B10.2: When true, performance-track pad triggers snap to the NEXT division
   * of the existing edit/slice grid (uses `quantizeDivision` for the grid size).
   * OFF by default — when false, trigger frameIndex is passed UNCHANGED.
   * Separate from `quantizeEnabled` (timeline-quantize) because launch-quantize
   * and timeline-quantize are different concerns that can be toggled independently.
   */
  launchQuantizeEnabled: boolean
  toggleSidebar: () => void
  toggleTimeline: () => void
  setTimelineHeight: (h: number) => void
  setDeviceChainHeight: (h: number) => void
  toggleFocusMode: () => void
  setPopOutOpen: (open: boolean) => void
  setPopOutBounds: (bounds: PopOutBounds | null) => void
  toggleQuantize: () => void
  setQuantizeDivision: (div: number) => void
  /** UE.1: Toggle clip-edge/playhead/marker snapping. */
  toggleSnap: () => void
  /** B10.2: Toggle launch-quantize for performance-track pad triggers. */
  toggleLaunchQuantize: () => void
  // Creatrix grid layout vars (F_CREATRIX_LAYOUT) — P3.1
  leftColW: number
  inspectorH: number
  previewHPct: number
  deviceChainH: number
  previewCollapsed: boolean
  setLeftColW: (w: number) => void
  setInspectorH: (h: number) => void
  setPreviewHPct: (pct: number) => void
  setDeviceChainH: (h: number) => void
  setPreviewCollapsed: (v: boolean) => void
}

const STORAGE_KEY = 'entropic-layout'
const CREATRIX_STORAGE_KEY = 'creatrix-layout'

interface PersistedLayout {
  sidebarCollapsed: boolean
  timelineCollapsed: boolean
  timelineHeight: number
  deviceChainHeight: number
  snapEnabled: boolean
}

interface PersistedCreatrixLayout {
  leftColW: number
  inspectorH: number
  previewHPct: number
  deviceChainH: number
}

// Creatrix layout clamp ranges and defaults
const CX_LEFT_COL_W = { min: 200, max: 600, def: 260 }
const CX_INSPECTOR_H = { min: 100, max: 300, def: 150 }
const CX_PREVIEW_H_PCT = { min: 10, max: 70, def: 38 }
const CX_DEVICE_CHAIN_H = { min: 100, max: 400, def: 180 }

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
    if (typeof parsed.deviceChainHeight === 'number' && parsed.deviceChainHeight >= 100 && parsed.deviceChainHeight <= 600) {
      result.deviceChainHeight = parsed.deviceChainHeight
    }
    if (typeof parsed.snapEnabled === 'boolean') result.snapEnabled = parsed.snapEnabled
    return result
  } catch {
    return {}
  }
}

function loadPersistedCreatrixLayout(): Partial<PersistedCreatrixLayout> {
  try {
    const raw = localStorage.getItem(CREATRIX_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return {}
    const result: Partial<PersistedCreatrixLayout> = {}
    // Numeric trust boundary: clampFinite validates finite + range
    if (typeof parsed.leftColW === 'number') {
      result.leftColW = clampFinite(parsed.leftColW, CX_LEFT_COL_W.min, CX_LEFT_COL_W.max, CX_LEFT_COL_W.def)
    }
    if (typeof parsed.inspectorH === 'number') {
      result.inspectorH = clampFinite(parsed.inspectorH, CX_INSPECTOR_H.min, CX_INSPECTOR_H.max, CX_INSPECTOR_H.def)
    }
    if (typeof parsed.previewHPct === 'number') {
      result.previewHPct = clampFinite(parsed.previewHPct, CX_PREVIEW_H_PCT.min, CX_PREVIEW_H_PCT.max, CX_PREVIEW_H_PCT.def)
    }
    if (typeof parsed.deviceChainH === 'number') {
      result.deviceChainH = clampFinite(parsed.deviceChainH, CX_DEVICE_CHAIN_H.min, CX_DEVICE_CHAIN_H.max, CX_DEVICE_CHAIN_H.def)
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

function persistCreatrixLayout(state: PersistedCreatrixLayout): void {
  try {
    localStorage.setItem(CREATRIX_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Best-effort
  }
}

const persisted = loadPersistedLayout()
const persistedCx = loadPersistedCreatrixLayout()

export const useLayoutStore = create<LayoutState>((set, get) => ({
  sidebarCollapsed: persisted.sidebarCollapsed ?? false,
  timelineCollapsed: persisted.timelineCollapsed ?? false,
  timelineHeight: persisted.timelineHeight ?? 200,
  deviceChainHeight: persisted.deviceChainHeight ?? 180,
  isPopOutOpen: false,
  popOutBounds: null,
  quantizeEnabled: false,
  quantizeDivision: 4, // 1/4 note
  snapEnabled: persisted.snapEnabled ?? true, // on by default
  launchQuantizeEnabled: false, // B10.2: OFF by default (B10 spec §15)
  // Creatrix layout vars — P3.1
  leftColW: persistedCx.leftColW ?? CX_LEFT_COL_W.def,
  inspectorH: persistedCx.inspectorH ?? CX_INSPECTOR_H.def,
  previewHPct: persistedCx.previewHPct ?? CX_PREVIEW_H_PCT.def,
  deviceChainH: persistedCx.deviceChainH ?? CX_DEVICE_CHAIN_H.def,
  previewCollapsed: false,

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

  setDeviceChainHeight: (h: number) => {
    const clamped = clampFinite(h, 100, 600, 180)
    set({ deviceChainHeight: clamped })
    persistLayout({ ...get(), deviceChainHeight: clamped })
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

  toggleSnap: () => {
    const next = !get().snapEnabled
    set({ snapEnabled: next })
    persistLayout({ ...get(), snapEnabled: next })
  },

  // B10.2: Toggle launch-quantize (not persisted — off by default every session)
  toggleLaunchQuantize: () => {
    set({ launchQuantizeEnabled: !get().launchQuantizeEnabled })
  },

  // Creatrix resize actions — P3.1
  setLeftColW: (w: number) => {
    const clamped = clampFinite(w, CX_LEFT_COL_W.min, CX_LEFT_COL_W.max, CX_LEFT_COL_W.def)
    set({ leftColW: clamped })
    const s = get()
    persistCreatrixLayout({ leftColW: clamped, inspectorH: s.inspectorH, previewHPct: s.previewHPct, deviceChainH: s.deviceChainH })
  },

  setInspectorH: (h: number) => {
    const clamped = clampFinite(h, CX_INSPECTOR_H.min, CX_INSPECTOR_H.max, CX_INSPECTOR_H.def)
    set({ inspectorH: clamped })
    const s = get()
    persistCreatrixLayout({ leftColW: s.leftColW, inspectorH: clamped, previewHPct: s.previewHPct, deviceChainH: s.deviceChainH })
  },

  setPreviewHPct: (pct: number) => {
    const clamped = clampFinite(pct, CX_PREVIEW_H_PCT.min, CX_PREVIEW_H_PCT.max, CX_PREVIEW_H_PCT.def)
    set({ previewHPct: clamped })
    const s = get()
    persistCreatrixLayout({ leftColW: s.leftColW, inspectorH: s.inspectorH, previewHPct: clamped, deviceChainH: s.deviceChainH })
  },

  setDeviceChainH: (h: number) => {
    const clamped = clampFinite(h, CX_DEVICE_CHAIN_H.min, CX_DEVICE_CHAIN_H.max, CX_DEVICE_CHAIN_H.def)
    set({ deviceChainH: clamped })
    const s = get()
    persistCreatrixLayout({ leftColW: s.leftColW, inspectorH: s.inspectorH, previewHPct: s.previewHPct, deviceChainH: clamped })
  },

  setPreviewCollapsed: (v: boolean) => {
    set({ previewCollapsed: v })
  },
}))
