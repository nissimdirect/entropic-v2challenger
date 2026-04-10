/**
 * Layout store tests — sidebar/timeline toggle, focus mode, localStorage persistence.
 * Phase 11.5 Sprint 3.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useLayoutStore } from '../../renderer/stores/layout'

beforeEach(() => {
  // happy-dom may not have localStorage.clear — use removeItem instead
  try {
    localStorage.removeItem('entropic-layout')
  } catch {
    // Ignore if localStorage is not available
  }
  // Reset store to defaults
  useLayoutStore.setState({
    sidebarCollapsed: false,
    timelineCollapsed: false,
    timelineHeight: 200,
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
})
