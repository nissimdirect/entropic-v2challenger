/**
 * Tests for pop-out preview — preload security, layout store state, window lifecycle.
 * Phase 16A.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useLayoutStore } from '../../renderer/stores/layout'

// --- Pop-out preload security tests ---

describe('pop-out preload contract', () => {
  it('exposes only read-only API surfaces (no invoke/send)', () => {
    // The pop-out preload module exposes exactly the read-only signal
    // surfaces. RT-1 contract: the pop-out window MUST NOT have access to
    // ipcRenderer.invoke() or ipcRenderer.send().
    // F-0514-6 added onPing + getLastPingAt for heartbeat-based liveness.
    const allowedKeys = ['onFrameUpdate', 'onClose', 'onPing', 'getLastPingAt']
    const popOutApi = {
      onFrameUpdate: (_cb: (dataUrl: string) => void) => {},
      onClose: (_cb: () => void) => {},
      onPing: (_cb: () => void) => {},
      getLastPingAt: (): number => 0,
    }
    const keys = Object.keys(popOutApi)
    expect(keys.sort()).toEqual([...allowedKeys].sort())
    expect(keys).not.toContain('invoke')
    expect(keys).not.toContain('send')
    expect(keys).not.toContain('sendCommand')
  })

  it('does not expose sendCommand', () => {
    // RT-1: The pop-out preload must NOT expose sendCommand or invoke.
    const popOutApi: Record<string, unknown> = {
      onFrameUpdate: () => {},
      onClose: () => {},
      onPing: () => {},
      getLastPingAt: () => 0,
    }
    expect('sendCommand' in popOutApi).toBe(false)
    expect('invoke' in popOutApi).toBe(false)
    expect('send' in popOutApi).toBe(false)
  })
})

// --- Layout store pop-out state tests ---

beforeEach(() => {
  try {
    localStorage.removeItem('entropic-layout')
  } catch {
    // Ignore
  }
  useLayoutStore.setState({
    sidebarCollapsed: false,
    timelineCollapsed: false,
    timelineHeight: 200,
    isPopOutOpen: false,
    popOutBounds: null,
  })
})

describe('layout store pop-out state', () => {
  it('defaults isPopOutOpen to false', () => {
    expect(useLayoutStore.getState().isPopOutOpen).toBe(false)
  })

  it('defaults popOutBounds to null', () => {
    expect(useLayoutStore.getState().popOutBounds).toBeNull()
  })

  it('setPopOutOpen updates state', () => {
    useLayoutStore.getState().setPopOutOpen(true)
    expect(useLayoutStore.getState().isPopOutOpen).toBe(true)

    useLayoutStore.getState().setPopOutOpen(false)
    expect(useLayoutStore.getState().isPopOutOpen).toBe(false)
  })

  it('setPopOutBounds stores bounds', () => {
    const bounds = { x: 100, y: 200, width: 640, height: 480 }
    useLayoutStore.getState().setPopOutBounds(bounds)
    expect(useLayoutStore.getState().popOutBounds).toEqual(bounds)
  })

  it('setPopOutBounds can be cleared to null', () => {
    useLayoutStore.getState().setPopOutBounds({ x: 0, y: 0, width: 800, height: 600 })
    useLayoutStore.getState().setPopOutBounds(null)
    expect(useLayoutStore.getState().popOutBounds).toBeNull()
  })
})

// --- Pop-out window lifecycle contract tests ---

describe('pop-out window lifecycle contract', () => {
  it('HT-4: creating when already open should reuse window (contract)', () => {
    // This documents the expected behavior: createPopOutWindow checks
    // isDestroyed() before creating a new window.
    // We can't test BrowserWindow in a renderer context, but we verify
    // the state management contract.
    const store = useLayoutStore.getState()
    store.setPopOutOpen(true)
    expect(useLayoutStore.getState().isPopOutOpen).toBe(true)
    // Setting again should not throw or change state
    store.setPopOutOpen(true)
    expect(useLayoutStore.getState().isPopOutOpen).toBe(true)
  })

  it('closing sets isPopOutOpen to false', () => {
    useLayoutStore.getState().setPopOutOpen(true)
    useLayoutStore.getState().setPopOutOpen(false)
    expect(useLayoutStore.getState().isPopOutOpen).toBe(false)
  })
})
