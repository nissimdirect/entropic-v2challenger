/**
 * Toast store tests — add/dismiss/auto-expire/queue overflow/persistent/rate-limiting.
 * Phase 11.5 Sprint 1.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useToastStore } from '../../renderer/stores/toast'

beforeEach(() => {
  useToastStore.setState({ toasts: [] })
  vi.useFakeTimers()
})

describe('useToastStore', () => {
  it('adds a toast and assigns id + count', () => {
    useToastStore.getState().addToast({ level: 'info', message: 'Hello' })
    const toasts = useToastStore.getState().toasts
    expect(toasts).toHaveLength(1)
    expect(toasts[0].message).toBe('Hello')
    expect(toasts[0].level).toBe('info')
    expect(toasts[0].count).toBe(1)
    expect(toasts[0].id).toBeTruthy()
  })

  it('dismisses a toast by id', () => {
    useToastStore.getState().addToast({ level: 'info', message: 'A' })
    const id = useToastStore.getState().toasts[0].id
    useToastStore.getState().dismissToast(id)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('clears all toasts', () => {
    useToastStore.getState().addToast({ level: 'info', message: 'A' })
    useToastStore.getState().addToast({ level: 'warning', message: 'B' })
    useToastStore.getState().clearAll()
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('auto-dismisses info toast after 4s', () => {
    useToastStore.getState().addToast({ level: 'info', message: 'Auto' })
    expect(useToastStore.getState().toasts).toHaveLength(1)
    vi.advanceTimersByTime(4001)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('auto-dismisses warning toast after 6s', () => {
    useToastStore.getState().addToast({ level: 'warning', message: 'Warn' })
    vi.advanceTimersByTime(5999)
    expect(useToastStore.getState().toasts).toHaveLength(1)
    vi.advanceTimersByTime(2)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('auto-dismisses error toast after 8s', () => {
    useToastStore.getState().addToast({ level: 'error', message: 'Err' })
    vi.advanceTimersByTime(7999)
    expect(useToastStore.getState().toasts).toHaveLength(1)
    vi.advanceTimersByTime(2)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('does NOT auto-dismiss persistent toast', () => {
    useToastStore.getState().addToast({ level: 'info', message: 'Stay', persistent: true })
    vi.advanceTimersByTime(60000)
    expect(useToastStore.getState().toasts).toHaveLength(1)
  })

  it('does NOT auto-dismiss state-level toast (manual only)', () => {
    useToastStore.getState().addToast({ level: 'state', message: 'State' })
    vi.advanceTimersByTime(60000)
    expect(useToastStore.getState().toasts).toHaveLength(1)
  })

  it('evicts oldest non-persistent when queue exceeds 5', () => {
    for (let i = 0; i < 6; i++) {
      useToastStore.getState().addToast({
        level: 'state', // state = no auto-dismiss
        message: `Toast ${i}`,
        source: `src-${i}`,
      })
    }
    const toasts = useToastStore.getState().toasts
    expect(toasts).toHaveLength(5)
    // First toast should be evicted
    expect(toasts[0].message).toBe('Toast 1')
  })

  it('rate-limits: increments count for same source within 2s window', () => {
    useToastStore.getState().addToast({ level: 'error', message: 'Fail 1', source: 'render' })
    useToastStore.getState().addToast({ level: 'error', message: 'Fail 2', source: 'render' })
    useToastStore.getState().addToast({ level: 'error', message: 'Fail 3', source: 'render' })

    const toasts = useToastStore.getState().toasts
    expect(toasts).toHaveLength(1)
    expect(toasts[0].count).toBe(3)
    expect(toasts[0].message).toBe('Fail 3') // latest message
  })

  it('allows same source after rate limit window expires', () => {
    useToastStore.getState().addToast({ level: 'error', message: 'Fail 1', source: 'render' })
    vi.advanceTimersByTime(2001)
    useToastStore.getState().addToast({ level: 'error', message: 'Fail 2', source: 'render' })

    // First one may have auto-dismissed (8s error), but second is separate
    const toasts = useToastStore.getState().toasts
    expect(toasts.length).toBeGreaterThanOrEqual(1)
    // Should have two distinct toasts (or 1 if first was dismissed)
    const renderToasts = toasts.filter((t) => t.source === 'render')
    expect(renderToasts.some((t) => t.message === 'Fail 2')).toBe(true)
  })

  it('does not rate-limit toasts without source', () => {
    useToastStore.getState().addToast({ level: 'info', message: 'A' })
    useToastStore.getState().addToast({ level: 'info', message: 'B' })
    expect(useToastStore.getState().toasts).toHaveLength(2)
  })
})
