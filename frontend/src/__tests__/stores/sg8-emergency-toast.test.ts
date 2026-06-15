/**
 * SG-8 emergency memory-pressure toast — symmetric show/dismiss regression tests.
 *
 * Audit HIGH #7: the persistent emergency toast never dismissed on recovery
 * because the old code attempted to "overwrite" it via the rate-limit dedup
 * path, which cannot remove a persistent toast. The fix: explicitly call
 * dismissBySource('sg8-pressure-emergency') on any downgrade from emergency.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useToastStore } from '../../renderer/stores/toast'
import { useMemoryPressureStore } from '../../renderer/stores/memoryPressure'

beforeEach(() => {
  useToastStore.setState({ toasts: [] })
  useMemoryPressureStore.getState().reset()
  vi.useFakeTimers()
})

// ---------------------------------------------------------------------------
// Helper — build a PressureStatus-shaped object
// ---------------------------------------------------------------------------
const status = (
  level: 'ok' | 'warn' | 'auto_disable' | 'emergency',
  features: string[] = [],
) => ({ level, current_pct: 50, degraded_features: features })

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SG-8 emergency toast — symmetric show / dismiss', () => {
  it('entering emergency shows the persistent sg8-pressure-emergency toast', () => {
    useMemoryPressureStore.getState().setStatus(status('emergency', ['clap_unloaded']))

    const toasts = useToastStore.getState().toasts
    const emergencyToast = toasts.find((t) => t.source === 'sg8-pressure-emergency')

    expect(emergencyToast).toBeDefined()
    expect(emergencyToast?.persistent).toBe(true)
    expect(emergencyToast?.level).toBe('state')
  })

  it('recovering to ok DISMISSES the emergency toast (regression: was stuck forever)', () => {
    // Step 1 — enter emergency
    useMemoryPressureStore.getState().setStatus(status('emergency', ['clap_unloaded']))
    expect(
      useToastStore.getState().toasts.find((t) => t.source === 'sg8-pressure-emergency'),
    ).toBeDefined()

    // Step 2 — advance time (simulates the 60s recovery window described in the audit repro)
    vi.advanceTimersByTime(60_000)

    // Step 3 — recover to ok
    useMemoryPressureStore.getState().setStatus(status('ok', []))

    // The emergency toast MUST be gone
    const emergencyToast = useToastStore
      .getState()
      .toasts.find((t) => t.source === 'sg8-pressure-emergency')
    expect(emergencyToast).toBeUndefined()
  })

  it('recovering to warn also clears the emergency toast (any downgrade from emergency)', () => {
    useMemoryPressureStore.getState().setStatus(status('emergency', ['clap_unloaded']))
    useMemoryPressureStore.getState().setStatus(status('warn', ['clap_unloaded']))

    expect(
      useToastStore.getState().toasts.find((t) => t.source === 'sg8-pressure-emergency'),
    ).toBeUndefined()
  })

  it('recovering to auto_disable also clears the emergency toast', () => {
    useMemoryPressureStore.getState().setStatus(status('emergency', ['clap_unloaded']))
    useMemoryPressureStore.getState().setStatus(status('auto_disable', ['clap_unloaded']))

    expect(
      useToastStore.getState().toasts.find((t) => t.source === 'sg8-pressure-emergency'),
    ).toBeUndefined()
  })

  it('emergency toast is NOT shown again if already in emergency on a repeat poll tick', () => {
    useMemoryPressureStore.getState().setStatus(status('emergency', ['clap_unloaded']))
    const countAfterFirst = useToastStore
      .getState()
      .toasts.filter((t) => t.source === 'sg8-pressure-emergency').length

    // Second poll tick still at emergency — should NOT add another toast
    vi.advanceTimersByTime(2001) // past rate-limit window
    useMemoryPressureStore.getState().setStatus(status('emergency', ['clap_unloaded']))

    const countAfterSecond = useToastStore
      .getState()
      .toasts.filter((t) => t.source === 'sg8-pressure-emergency').length

    expect(countAfterFirst).toBe(1)
    expect(countAfterSecond).toBe(1) // still only one — transition guard prevents re-fire
  })
})

// ---------------------------------------------------------------------------
// dismissBySource isolation — no collateral damage to other toasts
// ---------------------------------------------------------------------------

describe('dismissBySource — only removes matching-source toasts', () => {
  it('does not remove toasts from a different source', () => {
    useToastStore.getState().addToast({ level: 'warning', message: 'Other warning', source: 'some-other-feature' })
    useToastStore.getState().addToast({
      level: 'state',
      message: 'Emergency',
      source: 'sg8-pressure-emergency',
      persistent: true,
    })

    useToastStore.getState().dismissBySource('sg8-pressure-emergency')

    const remaining = useToastStore.getState().toasts
    expect(remaining).toHaveLength(1)
    expect(remaining[0].source).toBe('some-other-feature')
  })

  it('removes all toasts matching the source (handles duplicates gracefully)', () => {
    // Simulate two toasts from the same source (edge case if rate-limit window expired)
    useToastStore.setState({
      toasts: [
        { id: 'toast-100', level: 'state', message: 'A', source: 'sg8-pressure-emergency', persistent: true, count: 1, createdAt: Date.now() - 5000 },
        { id: 'toast-101', level: 'state', message: 'B', source: 'sg8-pressure-emergency', persistent: true, count: 1, createdAt: Date.now() },
        { id: 'toast-102', level: 'info', message: 'Unrelated', source: 'unrelated', count: 1, createdAt: Date.now() },
      ],
    })

    useToastStore.getState().dismissBySource('sg8-pressure-emergency')

    const remaining = useToastStore.getState().toasts
    expect(remaining).toHaveLength(1)
    expect(remaining[0].id).toBe('toast-102')
  })

  it('is a no-op when no toast matches the source', () => {
    useToastStore.getState().addToast({ level: 'info', message: 'Hello', source: 'foo' })
    useToastStore.getState().dismissBySource('nonexistent-source')
    expect(useToastStore.getState().toasts).toHaveLength(1)
  })
})
