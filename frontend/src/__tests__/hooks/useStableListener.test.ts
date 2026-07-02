import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useStableListener } from '../../renderer/hooks/useStableListener'

describe('useStableListener', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('fires handler on document event', () => {
    const handler = vi.fn()
    renderHook(() => useStableListener(document, 'click', handler))

    act(() => {
      document.dispatchEvent(new Event('click'))
    })

    expect(handler).toHaveBeenCalledOnce()
  })

  it('fires handler on window event', () => {
    const handler = vi.fn()
    renderHook(() => useStableListener(window, 'resize', handler))

    act(() => {
      window.dispatchEvent(new Event('resize'))
    })

    expect(handler).toHaveBeenCalledOnce()
  })

  it('cleans up listener on unmount', () => {
    const handler = vi.fn()
    const { unmount } = renderHook(() => useStableListener(document, 'click', handler))

    unmount()

    document.dispatchEvent(new Event('click'))
    expect(handler).not.toHaveBeenCalled()
  })

  it('handler ref updates without re-registering listener', () => {
    const addSpy = vi.spyOn(document, 'addEventListener')
    const handler1 = vi.fn()
    const handler2 = vi.fn()

    const { rerender } = renderHook(
      ({ handler }) => useStableListener(document, 'keydown', handler),
      { initialProps: { handler: handler1 } },
    )

    // Initial registration
    const initialCallCount = addSpy.mock.calls.filter(c => c[0] === 'keydown').length
    expect(initialCallCount).toBe(1)

    // Rerender with new handler — should NOT add another listener
    rerender({ handler: handler2 })
    const afterRerenderCallCount = addSpy.mock.calls.filter(c => c[0] === 'keydown').length
    expect(afterRerenderCallCount).toBe(1)

    // But the new handler should be called
    act(() => {
      document.dispatchEvent(new Event('keydown'))
    })
    expect(handler1).not.toHaveBeenCalled()
    expect(handler2).toHaveBeenCalledOnce()
  })

  it('does not attach listener when enabled=false', () => {
    const handler = vi.fn()
    renderHook(() => useStableListener(document, 'click', handler, false))

    document.dispatchEvent(new Event('click'))
    expect(handler).not.toHaveBeenCalled()
  })

  it('re-attaches listener when enabled changes to true', () => {
    const handler = vi.fn()
    const { rerender } = renderHook(
      ({ enabled }) => useStableListener(document, 'click', handler, enabled),
      { initialProps: { enabled: false } },
    )

    document.dispatchEvent(new Event('click'))
    expect(handler).not.toHaveBeenCalled()

    rerender({ enabled: true })

    act(() => {
      document.dispatchEvent(new Event('click'))
    })
    expect(handler).toHaveBeenCalledOnce()
  })
})
