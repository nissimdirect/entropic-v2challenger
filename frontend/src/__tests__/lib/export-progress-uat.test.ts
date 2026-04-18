/**
 * UAT: applyExportProgress reducer — covers E-06 (start), E-09 (cancel),
 * E-10 (error), E-11 (instant complete), E-11b (stale job guard).
 *
 * Pure-function unit test — no DOM, no IPC.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { applyExportProgress, type ExportEffects } from '../../renderer/lib/export-progress'

function makeFx(): ExportEffects & Record<string, ReturnType<typeof vi.fn>> {
  return {
    setExportProgress: vi.fn(),
    setExportCurrentFrame: vi.fn(),
    setExportTotalFrames: vi.fn(),
    setExportEta: vi.fn(),
    setExportOutputPath: vi.fn(),
    setIsExporting: vi.fn(),
    setExportJobId: vi.fn(),
    setExportError: vi.fn(),
    addToast: vi.fn(),
  } as ExportEffects & Record<string, ReturnType<typeof vi.fn>>
}

describe('UAT: applyExportProgress reducer', () => {
  let fx: ReturnType<typeof makeFx>

  beforeEach(() => {
    fx = makeFx()
  })

  it('running: updates progress + frame counters, no toast, no state teardown', () => {
    applyExportProgress(
      { jobId: null, progress: 0.42, done: false, currentFrame: 63, totalFrames: 150, etaSeconds: 8, status: 'running' },
      null,
      fx,
    )
    expect(fx.setExportProgress).toHaveBeenCalledWith(0.42)
    expect(fx.setExportCurrentFrame).toHaveBeenCalledWith(63)
    expect(fx.setExportTotalFrames).toHaveBeenCalledWith(150)
    expect(fx.setExportEta).toHaveBeenCalledWith(8)
    expect(fx.addToast).not.toHaveBeenCalled()
    expect(fx.setIsExporting).not.toHaveBeenCalled()
  })

  it('E-08/E-11 (complete): clears exporting state + fires "state"-level "Export complete" toast with path', () => {
    applyExportProgress(
      { jobId: null, progress: 1, done: true, currentFrame: 16, totalFrames: 16, outputPath: '/tmp/x.mp4', status: 'complete' },
      null,
      fx,
    )
    expect(fx.setIsExporting).toHaveBeenCalledWith(false)
    expect(fx.setExportJobId).toHaveBeenCalledWith(null)
    expect(fx.addToast).toHaveBeenCalledTimes(1)
    const toast = (fx.addToast as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(toast.level).toBe('state')
    expect(toast.message).toBe('Export complete')
    expect(toast.details).toBe('/tmp/x.mp4')
  })

  it('E-11b (instant complete): fast 1-frame export still produces completion toast', () => {
    // First poll returns status=complete (race where export finishes in <500ms)
    applyExportProgress(
      { jobId: null, progress: 1, done: true, currentFrame: 1, totalFrames: 1, outputPath: '/tmp/instant.mp4', status: 'complete' },
      null,
      fx,
    )
    expect((fx.addToast as ReturnType<typeof vi.fn>).mock.calls[0][0].message).toBe('Export complete')
    expect(fx.setIsExporting).toHaveBeenCalledWith(false)
  })

  it('E-09 (cancelled): clears state + fires "warning"-level "Export cancelled" toast', () => {
    applyExportProgress(
      { jobId: null, progress: 0.6, done: true, status: 'cancelled' },
      null,
      fx,
    )
    expect(fx.setIsExporting).toHaveBeenCalledWith(false)
    expect(fx.setExportJobId).toHaveBeenCalledWith(null)
    const toast = (fx.addToast as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(toast.level).toBe('warning')
    expect(toast.message).toBe('Export cancelled')
  })

  it('E-10 (error with status=error): clears state + fires "error" toast with details', () => {
    applyExportProgress(
      { jobId: null, progress: 0.3, done: true, error: 'Bad codec', status: 'error' },
      null,
      fx,
    )
    expect(fx.setExportError).toHaveBeenCalledWith('Bad codec')
    expect(fx.setIsExporting).toHaveBeenCalledWith(false)
    const toast = (fx.addToast as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(toast.level).toBe('error')
    expect(toast.message).toBe('Export failed')
    expect(toast.details).toBe('Bad codec')
  })

  it('E-10b (legacy error-only payload without status): still fires error toast', () => {
    // Pre-status-field payloads that only set `error` must still surface the toast.
    applyExportProgress(
      { jobId: null, progress: 0, done: true, error: 'Disk full' },
      null,
      fx,
    )
    expect((fx.addToast as ReturnType<typeof vi.fn>).mock.calls[0][0].message).toBe('Export failed')
    expect((fx.addToast as ReturnType<typeof vi.fn>).mock.calls[0][0].details).toBe('Disk full')
  })

  it('stale job guard: payload for a different jobId is ignored', () => {
    applyExportProgress(
      { jobId: 'old-job', progress: 0.5, done: false, status: 'running' },
      'current-job',
      fx,
    )
    expect(fx.setExportProgress).not.toHaveBeenCalled()
    expect(fx.addToast).not.toHaveBeenCalled()
  })

  it('jobId match: payload for active jobId IS applied', () => {
    applyExportProgress(
      { jobId: 'current-job', progress: 0.5, done: false, status: 'running' },
      'current-job',
      fx,
    )
    expect(fx.setExportProgress).toHaveBeenCalledWith(0.5)
  })

  it('fallback (no status, no error, done=true): only clears exporting state, no toast', () => {
    applyExportProgress({ jobId: null, progress: 1, done: true }, null, fx)
    expect(fx.setIsExporting).toHaveBeenCalledWith(false)
    expect(fx.setExportJobId).toHaveBeenCalledWith(null)
    expect(fx.addToast).not.toHaveBeenCalled()
  })
})
