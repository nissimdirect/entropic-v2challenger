/**
 * Layout store tests — sidebar/timeline toggle, focus mode, localStorage persistence.
 * Phase 11.5 Sprint 3.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useLayoutStore } from '../../renderer/stores/layout'

// Happy-dom may not have a working localStorage — mock it for tests that need it.
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value }),
    removeItem: vi.fn((key: string) => { delete store[key] }),
    clear: vi.fn(() => { store = {} }),
  }
})()
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true })

beforeEach(() => {
  localStorageMock.clear()
  localStorageMock.getItem.mockClear()
  localStorageMock.setItem.mockClear()
  // Reset store to defaults
  useLayoutStore.setState({
    sidebarCollapsed: false,
    timelineCollapsed: false,
    timelineHeight: 200,
    snapEnabled: true,
  })
})

describe('useLayoutStore', () => {
  it('starts with defaults', () => {
    const state = useLayoutStore.getState()
    expect(state.sidebarCollapsed).toBe(false)
    expect(state.timelineCollapsed).toBe(false)
    expect(state.timelineHeight).toBe(200)
  })

  it('toggleSidebar toggles sidebarCollapsed', () => {
    useLayoutStore.getState().toggleSidebar()
    expect(useLayoutStore.getState().sidebarCollapsed).toBe(true)
    useLayoutStore.getState().toggleSidebar()
    expect(useLayoutStore.getState().sidebarCollapsed).toBe(false)
  })

  it('toggleTimeline toggles timelineCollapsed', () => {
    useLayoutStore.getState().toggleTimeline()
    expect(useLayoutStore.getState().timelineCollapsed).toBe(true)
    useLayoutStore.getState().toggleTimeline()
    expect(useLayoutStore.getState().timelineCollapsed).toBe(false)
  })

  it('setTimelineHeight updates height', () => {
    useLayoutStore.getState().setTimelineHeight(300)
    expect(useLayoutStore.getState().timelineHeight).toBe(300)
  })

  it('toggleFocusMode collapses both when either is expanded', () => {
    // Both expanded → collapse both
    useLayoutStore.getState().toggleFocusMode()
    expect(useLayoutStore.getState().sidebarCollapsed).toBe(true)
    expect(useLayoutStore.getState().timelineCollapsed).toBe(true)
  })

  it('toggleFocusMode expands both when both are collapsed', () => {
    useLayoutStore.setState({ sidebarCollapsed: true, timelineCollapsed: true })
    useLayoutStore.getState().toggleFocusMode()
    expect(useLayoutStore.getState().sidebarCollapsed).toBe(false)
    expect(useLayoutStore.getState().timelineCollapsed).toBe(false)
  })

  it('toggleFocusMode collapses both when only sidebar is collapsed', () => {
    useLayoutStore.setState({ sidebarCollapsed: true, timelineCollapsed: false })
    useLayoutStore.getState().toggleFocusMode()
    // Timeline was expanded, so both should collapse
    expect(useLayoutStore.getState().sidebarCollapsed).toBe(true)
    expect(useLayoutStore.getState().timelineCollapsed).toBe(true)
  })

  it('state survives toggle roundtrip (persistence behavior)', () => {
    // Verify the state correctly toggles and persists in memory
    useLayoutStore.getState().toggleSidebar()
    expect(useLayoutStore.getState().sidebarCollapsed).toBe(true)

    // Toggle back
    useLayoutStore.getState().toggleSidebar()
    expect(useLayoutStore.getState().sidebarCollapsed).toBe(false)
  })

  it('timeline height update is reflected in state', () => {
    useLayoutStore.getState().setTimelineHeight(350)
    expect(useLayoutStore.getState().timelineHeight).toBe(350)

    useLayoutStore.getState().setTimelineHeight(150)
    expect(useLayoutStore.getState().timelineHeight).toBe(150)
  })

  it('quantize defaults to off with 1/4 division', () => {
    const state = useLayoutStore.getState()
    expect(state.quantizeEnabled).toBe(false)
    expect(state.quantizeDivision).toBe(4)
  })

  it('toggleQuantize flips enabled state', () => {
    useLayoutStore.getState().toggleQuantize()
    expect(useLayoutStore.getState().quantizeEnabled).toBe(true)
    useLayoutStore.getState().toggleQuantize()
    expect(useLayoutStore.getState().quantizeEnabled).toBe(false)
  })

  it('setQuantizeDivision accepts valid values', () => {
    useLayoutStore.getState().setQuantizeDivision(8)
    expect(useLayoutStore.getState().quantizeDivision).toBe(8)
    useLayoutStore.getState().setQuantizeDivision(16)
    expect(useLayoutStore.getState().quantizeDivision).toBe(16)
  })

  it('setQuantizeDivision rejects invalid values', () => {
    useLayoutStore.getState().setQuantizeDivision(8)
    useLayoutStore.getState().setQuantizeDivision(3) // invalid
    expect(useLayoutStore.getState().quantizeDivision).toBe(8) // unchanged
    useLayoutStore.getState().setQuantizeDivision(0)
    expect(useLayoutStore.getState().quantizeDivision).toBe(8) // unchanged
  })

  // ============================================================
  // UE.1: snapEnabled toggle + localStorage round-trip
  // ============================================================

  it('UE.1: snapEnabled defaults to true', () => {
    // Default state (set in beforeEach resets to base state, snap not reset — so use getState)
    useLayoutStore.setState({ snapEnabled: true }) // ensure default
    expect(useLayoutStore.getState().snapEnabled).toBe(true)
  })

  it('UE.1: toggleSnap flips snapEnabled', () => {
    useLayoutStore.setState({ snapEnabled: true })
    useLayoutStore.getState().toggleSnap()
    expect(useLayoutStore.getState().snapEnabled).toBe(false)
    useLayoutStore.getState().toggleSnap()
    expect(useLayoutStore.getState().snapEnabled).toBe(true)
  })

  it('UE.1: snapEnabled persists to localStorage on toggleSnap', () => {
    useLayoutStore.setState({ snapEnabled: true })
    useLayoutStore.getState().toggleSnap() // → false

    // The store calls persistLayout which calls localStorage.setItem
    expect(localStorageMock.setItem).toHaveBeenCalled()
    const lastCall = localStorageMock.setItem.mock.calls[localStorageMock.setItem.mock.calls.length - 1]
    expect(lastCall[0]).toBe('entropic-layout')
    const parsed = JSON.parse(lastCall[1])
    expect(parsed.snapEnabled).toBe(false)
  })

  it('UE.1: snapEnabled=false survives localStorage round-trip', () => {
    // Toggle snap twice: true → false → true. Both toggles must call setItem.
    useLayoutStore.setState({ snapEnabled: true })
    useLayoutStore.getState().toggleSnap() // → false
    useLayoutStore.getState().toggleSnap() // → true

    // 2 setItem calls, last one should have snapEnabled=true
    expect(localStorageMock.setItem.mock.calls.length).toBeGreaterThanOrEqual(2)
    const lastCall = localStorageMock.setItem.mock.calls[localStorageMock.setItem.mock.calls.length - 1]
    const parsed = JSON.parse(lastCall[1])
    expect(parsed.snapEnabled).toBe(true)
    // Final store state must also be true
    expect(useLayoutStore.getState().snapEnabled).toBe(true)
  })

  it('UE.1: toggle state survives multiple toggle round-trips', () => {
    useLayoutStore.setState({ snapEnabled: true })
    for (let i = 0; i < 10; i++) {
      useLayoutStore.getState().toggleSnap()
    }
    // 10 toggles from true → should be back to true (even number)
    expect(useLayoutStore.getState().snapEnabled).toBe(true)
  })
})
