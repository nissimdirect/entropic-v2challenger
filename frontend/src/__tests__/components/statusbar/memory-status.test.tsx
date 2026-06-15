/**
 * memory-status.test.tsx — P5b.2 (SG-8 frontend) named tests.
 *
 * Named tests per spec:
 *   "renders nothing at ok"
 *   "shows badge and feature list at auto_disable"
 *   "toast fired once per newly disabled feature (dedup)"
 *   "emergency state is manual-dismiss"
 *   "malformed/non-finite IPC payload renders fallback not crash"
 *
 * Additional:
 *   "recovery clears degraded state"
 *   "poll interval cleared on unmount"
 *   "guardPressureReply clamps out-of-range pct"
 *   "guardPressureReply rejects unknown level"
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import { renderHook } from '@testing-library/react'

// ─── Mock window.entropic BEFORE store imports ────────────────────────────────
const mockSendCommand = vi.fn()

;(window as unknown as { entropic: unknown }).entropic = {
  onEngineStatus: () => {},
  sendCommand: mockSendCommand,
  selectFile: async () => null,
  selectSavePath: async () => null,
  onExportProgress: () => () => {},
  onMenuAction: () => () => {},
}

import { useMemoryPressureStore, guardPressureReply } from '../../../renderer/stores/memoryPressure'
import { useToastStore } from '../../../renderer/stores/toast'
import MemoryStatus from '../../../renderer/components/statusbar/MemoryStatus'
import { useMemoryPressurePoll } from '../../../renderer/hooks/useMemoryPressurePoll'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resetAll() {
  useMemoryPressureStore.getState().reset()
  useToastStore.getState().clearAll()
  mockSendCommand.mockReset()
}

// ─── Guard tests ─────────────────────────────────────────────────────────────

describe('guardPressureReply — trust boundary', () => {
  it('passes through a valid reply unchanged', () => {
    const out = guardPressureReply({
      ok: true,
      level: 'auto_disable',
      current_pct: 78.3,
      degraded_features: ['grain_engine', 'frame_bank'],
    })
    expect(out.level).toBe('auto_disable')
    expect(out.current_pct).toBeCloseTo(78.3)
    expect(out.degraded_features).toEqual(['grain_engine', 'frame_bank'])
  })

  it('clamps current_pct to [0, 100]', () => {
    expect(guardPressureReply({ level: 'warn', current_pct: 200, degraded_features: [] }).current_pct).toBe(100)
    expect(guardPressureReply({ level: 'ok', current_pct: -5, degraded_features: [] }).current_pct).toBe(0)
  })

  it('guardPressureReply clamps out-of-range pct', () => {
    const out = guardPressureReply({ level: 'warn', current_pct: 999, degraded_features: [] })
    expect(out.current_pct).toBe(100)
  })

  it('guardPressureReply rejects unknown level', () => {
    const out = guardPressureReply({ level: 'BOGUS', current_pct: 50, degraded_features: [] })
    expect(out.level).toBe('ok')
  })

  it('malformed/non-finite IPC payload renders fallback not crash', () => {
    // NaN pct
    const out1 = guardPressureReply({ level: 'warn', current_pct: NaN, degraded_features: [] })
    expect(out1.current_pct).toBe(0)
    // Infinity pct — not finite, so clamps to fallback (0), NOT 100
    const out2 = guardPressureReply({ level: 'auto_disable', current_pct: Infinity, degraded_features: [] })
    expect(out2.current_pct).toBe(0)
    // non-array features
    const out3 = guardPressureReply({ level: 'ok', current_pct: 10, degraded_features: null })
    expect(out3.degraded_features).toEqual([])
    // missing fields → fallback to safe defaults
    const out4 = guardPressureReply({})
    expect(out4.level).toBe('ok')
    expect(out4.current_pct).toBe(0)
    expect(out4.degraded_features).toEqual([])
  })
})

// ─── MemoryStatus render tests ────────────────────────────────────────────────

describe('MemoryStatus — render', () => {
  beforeEach(() => resetAll())
  afterEach(() => cleanup())

  it('renders nothing at ok', () => {
    useMemoryPressureStore.setState({ level: 'ok', current_pct: 10, degraded_features: [] })
    const { container } = render(<MemoryStatus />)
    expect(container.firstChild).toBeNull()
  })

  it('renders badge at warn level', () => {
    useMemoryPressureStore.setState({ level: 'warn', current_pct: 65, degraded_features: [] })
    const { container } = render(<MemoryStatus />)
    const badge = container.querySelector('[data-level="warn"]')
    expect(badge).not.toBeNull()
    expect(badge?.getAttribute('data-pct')).toBe('65')
  })

  it('shows badge and feature list at auto_disable', () => {
    useMemoryPressureStore.setState({
      level: 'auto_disable',
      current_pct: 80,
      degraded_features: ['grain_engine', 'frame_bank'],
    })
    const { container } = render(<MemoryStatus />)
    expect(container.querySelector('[data-level="auto_disable"]')).not.toBeNull()
    const items = container.querySelectorAll('.memory-status__feature')
    expect(items).toHaveLength(2)
    expect(items[0].textContent).toContain('grain_engine')
    expect(items[1].textContent).toContain('frame_bank')
  })

  it('shows badge at emergency level', () => {
    useMemoryPressureStore.setState({
      level: 'emergency',
      current_pct: 95,
      degraded_features: ['grain_engine'],
    })
    const { container } = render(<MemoryStatus />)
    expect(container.querySelector('[data-level="emergency"]')).not.toBeNull()
    expect(container.querySelector('.memory-status--emergency')).not.toBeNull()
  })
})

// ─── Store / toast integration tests ─────────────────────────────────────────

describe('useMemoryPressureStore — toast integration', () => {
  beforeEach(() => resetAll())

  it('toast fired once per newly disabled feature (dedup)', () => {
    // First tick: grain_engine newly disabled
    useMemoryPressureStore.getState().setStatus({
      level: 'auto_disable',
      current_pct: 80,
      degraded_features: ['grain_engine'],
    })
    const toasts1 = useToastStore.getState().toasts
    expect(toasts1.some((t) => t.message.includes('grain_engine'))).toBe(true)
    const count1 = toasts1.filter((t) => t.message.includes('grain_engine')).length
    expect(count1).toBe(1)

    // Second tick: grain_engine STILL disabled — no new toast
    useMemoryPressureStore.getState().setStatus({
      level: 'auto_disable',
      current_pct: 82,
      degraded_features: ['grain_engine'],
    })
    const toasts2 = useToastStore.getState().toasts
    // The toast store deduplicates by source within 2s; count stays at 1
    const count2 = toasts2.filter((t) => t.source?.startsWith('sg8-pressure:grain_engine')).length
    expect(count2).toBe(1)
  })

  it('recovery clears degraded state', () => {
    // Disable
    useMemoryPressureStore.getState().setStatus({
      level: 'auto_disable',
      current_pct: 80,
      degraded_features: ['grain_engine'],
    })
    // Recover
    useMemoryPressureStore.getState().setStatus({
      level: 'ok',
      current_pct: 45,
      degraded_features: [],
    })
    const state = useMemoryPressureStore.getState()
    expect(state.degraded_features).toEqual([])
    expect(state.level).toBe('ok')
    // Recovery toast fired
    const recoveryToast = useToastStore
      .getState()
      .toasts.find((t) => t.source?.startsWith('sg8-pressure-recovery:grain_engine'))
    expect(recoveryToast).toBeTruthy()
  })

  it('emergency state is manual-dismiss', () => {
    useMemoryPressureStore.getState().setStatus({
      level: 'emergency',
      current_pct: 92,
      degraded_features: ['grain_engine'],
    })
    const emergencyToast = useToastStore
      .getState()
      .toasts.find((t) => t.source === 'sg8-pressure-emergency')
    expect(emergencyToast).toBeTruthy()
    expect(emergencyToast?.persistent).toBe(true)
    expect(emergencyToast?.level).toBe('state')
  })

  it('emergency toast only fires on transition into emergency (not every tick)', () => {
    // First tick → emergency
    useMemoryPressureStore.getState().setStatus({
      level: 'emergency',
      current_pct: 93,
      degraded_features: [],
    })
    const count1 = useToastStore
      .getState()
      .toasts.filter((t) => t.source === 'sg8-pressure-emergency').length
    expect(count1).toBe(1)

    // Second tick → still emergency (no new persistent toast)
    useMemoryPressureStore.getState().setStatus({
      level: 'emergency',
      current_pct: 95,
      degraded_features: [],
    })
    // dedup by source means count is still 1 (store dedup increments count)
    const count2 = useToastStore
      .getState()
      .toasts.filter((t) => t.source === 'sg8-pressure-emergency').length
    expect(count2).toBe(1)
  })
})

// ─── Poll hook tests ──────────────────────────────────────────────────────────

describe('useMemoryPressurePoll', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllTimers()
    resetAll()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('fires an immediate poll on mount', async () => {
    mockSendCommand.mockResolvedValue({
      ok: true,
      level: 'ok',
      current_pct: 20,
      degraded_features: [],
    })
    renderHook(() => useMemoryPressurePoll())
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(mockSendCommand).toHaveBeenCalledWith({ cmd: 'pressure_status' })
  })

  it('pressure status renders level/pct — store updated after poll', async () => {
    mockSendCommand.mockResolvedValue({
      ok: true,
      level: 'auto_disable',
      current_pct: 78,
      degraded_features: ['grain_engine'],
    })
    renderHook(() => useMemoryPressurePoll())
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    const state = useMemoryPressureStore.getState()
    expect(state.level).toBe('auto_disable')
    expect(state.current_pct).toBe(78)
    expect(state.degraded_features).toContain('grain_engine')
  })

  it('degrade toast fires on feature auto-disable', async () => {
    mockSendCommand.mockResolvedValue({
      ok: true,
      level: 'auto_disable',
      current_pct: 78,
      degraded_features: ['frame_bank'],
    })
    renderHook(() => useMemoryPressurePoll())
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    const toasts = useToastStore.getState().toasts
    expect(toasts.some((t) => t.message.includes('frame_bank'))).toBe(true)
  })

  it('poll interval cleared on unmount', async () => {
    mockSendCommand.mockResolvedValue({
      ok: true,
      level: 'ok',
      current_pct: 10,
      degraded_features: [],
    })
    const { unmount } = renderHook(() => useMemoryPressurePoll())
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    const countBeforeUnmount = mockSendCommand.mock.calls.length

    unmount()
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    // After unmount, the interval was cleared — no further polls.
    expect(mockSendCommand.mock.calls.length).toBe(countBeforeUnmount)
  })

  it('malformed IPC reply guarded — no crash, fallback to safe state', async () => {
    // Return a completely malformed payload
    mockSendCommand.mockResolvedValue({
      ok: true,
      level: 'GARBAGE',
      current_pct: NaN,
      degraded_features: 'not-an-array',
    })
    renderHook(() => useMemoryPressurePoll())
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    const state = useMemoryPressureStore.getState()
    // guardPressureReply must have clamped everything to safe defaults
    expect(state.level).toBe('ok')
    expect(Number.isFinite(state.current_pct)).toBe(true)
    expect(Array.isArray(state.degraded_features)).toBe(true)
  })
})
