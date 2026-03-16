/**
 * Integration test: keyboard shortcuts → store updates.
 * Tests that window.addEventListener('keydown') correctly routes
 * Cmd+B → toggleSidebar and F → toggleFocusMode.
 *
 * Uses the same handler logic as App.tsx but without rendering the full component tree.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useLayoutStore } from '../../renderer/stores/layout'
import { usePerformanceStore } from '../../renderer/stores/performance'

// Replicate the exact handler wiring from App.tsx lines 240-415
function installKeyboardHandler(): () => void {
  const handleKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement
    const isInput =
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT'
    if (isInput) return

    const mod = e.metaKey || e.ctrlKey
    const perfStore = usePerformanceStore.getState()

    // P key toggle perform mode
    if (e.code === 'KeyP' && !mod && !e.shiftKey) {
      e.preventDefault()
      perfStore.setPerformMode(!perfStore.isPerformMode)
      return
    }

    // Perform mode gate
    if (perfStore.isPerformMode && !mod) {
      e.preventDefault()
      return
    }

    // Sidebar toggle (Cmd+B)
    if (mod && e.key === 'b' && !e.shiftKey) {
      e.preventDefault()
      useLayoutStore.getState().toggleSidebar()
    }
    // Focus mode (F key)
    else if (e.key === 'f' && !mod && !e.shiftKey) {
      e.preventDefault()
      useLayoutStore.getState().toggleFocusMode()
    }
  }

  window.addEventListener('keydown', handleKeyDown)
  return () => window.removeEventListener('keydown', handleKeyDown)
}

// Same but with capture phase (the fix)
function installKeyboardHandlerWithCapture(): () => void {
  const handleKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement
    const isInput =
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT'
    if (isInput) return

    const mod = e.metaKey || e.ctrlKey
    const perfStore = usePerformanceStore.getState()

    if (e.code === 'KeyP' && !mod && !e.shiftKey) {
      e.preventDefault()
      perfStore.setPerformMode(!perfStore.isPerformMode)
      return
    }

    if (perfStore.isPerformMode && !mod) {
      e.preventDefault()
      return
    }

    if (mod && e.key === 'b' && !e.shiftKey) {
      e.preventDefault()
      useLayoutStore.getState().toggleSidebar()
    } else if (e.key === 'f' && !mod && !e.shiftKey) {
      e.preventDefault()
      useLayoutStore.getState().toggleFocusMode()
    }
  }

  window.addEventListener('keydown', handleKeyDown, true) // capture phase
  return () => window.removeEventListener('keydown', handleKeyDown, true)
}

function fireKey(key: string, code: string, opts: { metaKey?: boolean } = {}) {
  const event = new KeyboardEvent('keydown', {
    key,
    code,
    metaKey: opts.metaKey ?? false,
    ctrlKey: false,
    shiftKey: false,
    bubbles: true,
    cancelable: true,
  })
  window.dispatchEvent(event)
}

describe('keyboard shortcuts integration', () => {
  let cleanup: () => void

  beforeEach(() => {
    useLayoutStore.setState({
      sidebarCollapsed: false,
      timelineCollapsed: false,
      timelineHeight: 200,
    })
    usePerformanceStore.getState().setPerformMode(false)
  })

  afterEach(() => {
    cleanup?.()
  })

  describe('bubble phase (current implementation)', () => {
    beforeEach(() => {
      cleanup = installKeyboardHandler()
    })

    it('Cmd+B toggles sidebar', () => {
      expect(useLayoutStore.getState().sidebarCollapsed).toBe(false)
      fireKey('b', 'KeyB', { metaKey: true })
      expect(useLayoutStore.getState().sidebarCollapsed).toBe(true)
    })

    it('F toggles focus mode', () => {
      expect(useLayoutStore.getState().sidebarCollapsed).toBe(false)
      expect(useLayoutStore.getState().timelineCollapsed).toBe(false)
      fireKey('f', 'KeyF')
      expect(useLayoutStore.getState().sidebarCollapsed).toBe(true)
      expect(useLayoutStore.getState().timelineCollapsed).toBe(true)
    })

    it('does not fire when target is INPUT', () => {
      const input = document.createElement('input')
      document.body.appendChild(input)
      const event = new KeyboardEvent('keydown', {
        key: 'f',
        code: 'KeyF',
        bubbles: true,
        cancelable: true,
      })
      // Override target by dispatching from the input element
      input.dispatchEvent(event)
      expect(useLayoutStore.getState().sidebarCollapsed).toBe(false)
      document.body.removeChild(input)
    })

    it('F is blocked in perform mode', () => {
      usePerformanceStore.getState().setPerformMode(true)
      fireKey('f', 'KeyF')
      expect(useLayoutStore.getState().sidebarCollapsed).toBe(false)
    })

    it('Cmd+B works even in perform mode (modifier key)', () => {
      usePerformanceStore.getState().setPerformMode(true)
      fireKey('b', 'KeyB', { metaKey: true })
      expect(useLayoutStore.getState().sidebarCollapsed).toBe(true)
    })

    it('blocked when another listener calls stopPropagation', () => {
      // Simulate a child component that stops propagation
      const blocker = (e: KeyboardEvent) => {
        e.stopPropagation()
      }
      // blocker on capture phase fires before bubble handler
      window.addEventListener('keydown', blocker, true)

      fireKey('f', 'KeyF')
      // The handler uses bubble phase, so stopPropagation in capture blocks it
      expect(useLayoutStore.getState().sidebarCollapsed).toBe(false)

      window.removeEventListener('keydown', blocker, true)
    })
  })

  describe('capture phase (proposed fix)', () => {
    beforeEach(() => {
      cleanup = installKeyboardHandlerWithCapture()
    })

    it('Cmd+B toggles sidebar', () => {
      fireKey('b', 'KeyB', { metaKey: true })
      expect(useLayoutStore.getState().sidebarCollapsed).toBe(true)
    })

    it('F toggles focus mode', () => {
      fireKey('f', 'KeyF')
      expect(useLayoutStore.getState().sidebarCollapsed).toBe(true)
      expect(useLayoutStore.getState().timelineCollapsed).toBe(true)
    })

    it('survives stopPropagation from another capture listener added later', () => {
      // When both are capture, order matters — our handler was added first
      const blocker = (e: KeyboardEvent) => {
        e.stopPropagation()
      }
      window.addEventListener('keydown', blocker, true)

      fireKey('f', 'KeyF')
      // Our capture handler fires first (added first), so it still works
      expect(useLayoutStore.getState().sidebarCollapsed).toBe(true)
      expect(useLayoutStore.getState().timelineCollapsed).toBe(true)

      window.removeEventListener('keydown', blocker, true)
    })
  })
})
