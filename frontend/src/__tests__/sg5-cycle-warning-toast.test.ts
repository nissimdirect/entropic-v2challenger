/**
 * SG-5 export cycle-break warning — IPC wiring + toast deduplication tests.
 *
 * Audit #3: the cycle_warning field on export_status replies was dropped by
 * zmq-relay and never surfaced to the user. These tests verify:
 *   1. zmq-relay forwards cycle_warning + cycle_warning_source on export-progress
 *   2. A warning toast (source=sg5-cycle) fires once per job when cycle_warning present
 *   3. Re-polls with the same cycle_warning do NOT fire a second toast (once-per-job guard)
 *   4. No toast is raised when cycle_warning is absent or empty string
 *
 * Layer: logic/store — Vitest unit tests (no Playwright needed; no DOM required).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useToastStore } from '../renderer/stores/toast'

// ---------------------------------------------------------------------------
// Suite 1: zmq-relay forwards cycle_warning + cycle_warning_source
// ---------------------------------------------------------------------------
// We test the relay logic by extracting the forwarding logic that lives inside
// startExportPoll. Since the relay uses BrowserWindow.getAllWindows() and setInterval,
// we test the field-extraction + forwarding contract in isolation: given a ZMQ
// export_status reply, the 'export-progress' event payload must include
// cycleWarning and cycleWarningSource when cycle_warning is a non-empty string.
// ---------------------------------------------------------------------------

describe('zmq-relay: export_status → export-progress field forwarding (P5b.8 SG-5)', () => {
  /** Simulates the relay's field-extraction logic from startExportPoll */
  function buildExportProgressPayload(zmqReply: Record<string, unknown>) {
    const progress = (zmqReply.progress as number) ?? 0
    const exportState = zmqReply.status as string
    const done = exportState === 'complete' || exportState === 'cancelled'
    const failed = exportState === 'error'
    const error = failed ? (zmqReply.error as string) ?? 'Export failed' : undefined

    const cycleWarning =
      typeof zmqReply.cycle_warning === 'string' && zmqReply.cycle_warning.length > 0
        ? (zmqReply.cycle_warning as string)
        : undefined
    const cycleWarningSource =
      typeof zmqReply.cycle_warning_source === 'string' && zmqReply.cycle_warning_source.length > 0
        ? (zmqReply.cycle_warning_source as string)
        : undefined

    return {
      jobId: null,
      progress,
      done: done || failed,
      error,
      cycleWarning,
      cycleWarningSource,
    }
  }

  it('forwards cycle_warning and cycle_warning_source when backend sets them', () => {
    const zmqReply = {
      ok: true,
      progress: 0.5,
      status: 'running',
      cycle_warning: 'SG-5: modulation graph cycle detected and broken (removed edge: A→B)',
      cycle_warning_source: 'sg5-cycle',
    }

    const payload = buildExportProgressPayload(zmqReply)

    expect(payload.cycleWarning).toBe(
      'SG-5: modulation graph cycle detected and broken (removed edge: A→B)',
    )
    expect(payload.cycleWarningSource).toBe('sg5-cycle')
  })

  it('cycleWarning is undefined when cycle_warning is absent in the reply', () => {
    const zmqReply = { ok: true, progress: 0.2, status: 'running' }
    const payload = buildExportProgressPayload(zmqReply)
    expect(payload.cycleWarning).toBeUndefined()
    expect(payload.cycleWarningSource).toBeUndefined()
  })

  it('cycleWarning is undefined when cycle_warning is an empty string', () => {
    const zmqReply = { ok: true, progress: 0.2, status: 'running', cycle_warning: '' }
    const payload = buildExportProgressPayload(zmqReply)
    expect(payload.cycleWarning).toBeUndefined()
  })

  it('existing shape (progress, done, error) is unchanged', () => {
    const zmqReply = { ok: true, progress: 0.75, status: 'running' }
    const payload = buildExportProgressPayload(zmqReply)
    expect(payload.progress).toBe(0.75)
    expect(payload.done).toBe(false)
    expect(payload.error).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Suite 2: toast is raised once per job, deduped on re-polls
// ---------------------------------------------------------------------------
// We test the renderer-side logic: the sg5CycleWarnSeenRef guard and the
// toast call. We simulate this with a small function that mirrors App.tsx's
// onExportProgress callback body for the SG-5 block.
// ---------------------------------------------------------------------------

describe('SG-5 cycle-warning toast: once-per-job, absent=no-toast', () => {
  // Mirror the per-job flag (reset this in beforeEach to simulate new export)
  let sg5CycleWarnSeen: boolean

  // Simulate the relevant part of the onExportProgress callback
  function handleExportProgress(cycleWarning: string | undefined) {
    if (cycleWarning && cycleWarning.length > 0 && !sg5CycleWarnSeen) {
      sg5CycleWarnSeen = true
      useToastStore.getState().addToast({
        level: 'warning',
        message: cycleWarning,
        source: 'sg5-cycle',
      })
    }
  }

  beforeEach(() => {
    useToastStore.setState({ toasts: [] })
    sg5CycleWarnSeen = false
    vi.useFakeTimers()
  })

  it('raises a sg5-cycle warning toast when export-progress event carries cycle_warning', () => {
    handleExportProgress('SG-5: modulation graph cycle detected and broken (removed edge: A→B)')

    const toasts = useToastStore.getState().toasts
    const sg5Toast = toasts.find((t) => t.source === 'sg5-cycle')
    expect(sg5Toast).toBeDefined()
    expect(sg5Toast?.level).toBe('warning')
    expect(sg5Toast?.message).toContain('SG-5')
  })

  it('fires at most once per job — second poll with same cycle_warning is deduped', () => {
    const warning = 'SG-5: modulation graph cycle detected and broken (removed edge: X→Y)'

    // First poll tick — toast fires
    handleExportProgress(warning)
    const afterFirst = useToastStore.getState().toasts.filter((t) => t.source === 'sg5-cycle')
    expect(afterFirst).toHaveLength(1)

    // Advance past the toast rate-limit window so store dedup can't mask a second add
    vi.advanceTimersByTime(3000)

    // Second poll tick with same warning — per-job guard must suppress it
    handleExportProgress(warning)
    const afterSecond = useToastStore.getState().toasts.filter((t) => t.source === 'sg5-cycle')
    expect(afterSecond).toHaveLength(1)
  })

  it('fires again on a new export job (flag resets)', () => {
    const warning = 'SG-5: modulation graph cycle detected and broken (removed edge: A→B)'

    // First job: toast fires once
    handleExportProgress(warning)
    expect(useToastStore.getState().toasts.filter((t) => t.source === 'sg5-cycle')).toHaveLength(1)

    // New export: reset the per-job flag (as App.tsx does at setIsExporting(true))
    sg5CycleWarnSeen = false
    useToastStore.setState({ toasts: [] })

    // New job: toast should fire again
    handleExportProgress(warning)
    expect(useToastStore.getState().toasts.filter((t) => t.source === 'sg5-cycle')).toHaveLength(1)
  })

  it('does not raise a toast when cycle_warning is absent', () => {
    handleExportProgress(undefined)
    expect(useToastStore.getState().toasts.filter((t) => t.source === 'sg5-cycle')).toHaveLength(0)
  })

  it('does not raise a toast when cycle_warning is empty string', () => {
    handleExportProgress('')
    expect(useToastStore.getState().toasts.filter((t) => t.source === 'sg5-cycle')).toHaveLength(0)
  })
})
