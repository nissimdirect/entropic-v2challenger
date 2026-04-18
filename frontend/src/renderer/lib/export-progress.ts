/**
 * Pure reducer for the onExportProgress payload.
 *
 * App.tsx delegates to this so the state-transition + toast logic is
 * independently unit-testable (Vitest). See export-handler-uat.test.tsx.
 */

export type ExportStatus = 'idle' | 'running' | 'complete' | 'cancelled' | 'error'

export interface ExportProgressPayload {
  jobId: string | null
  progress: number
  done: boolean
  error?: string
  currentFrame?: number
  totalFrames?: number
  etaSeconds?: number | null
  outputPath?: string
  status?: ExportStatus
}

export interface ExportEffects {
  setExportProgress: (p: number) => void
  setExportCurrentFrame: (n: number) => void
  setExportTotalFrames: (n: number) => void
  setExportEta: (s: number | null) => void
  setExportOutputPath: (p: string | null) => void
  setIsExporting: (b: boolean) => void
  setExportJobId: (id: string | null) => void
  setExportError: (e: string | null) => void
  addToast: (toast: {
    level: 'info' | 'warning' | 'error' | 'state'
    message: string
    source: string
    details?: string
  }) => void
}

/**
 * Apply an export-progress payload to app state + emit the appropriate toast.
 *
 * Guarded by `activeJobId` — if the payload's jobId doesn't match the
 * currently-active export, the payload is ignored (prevents stale events
 * from previous exports leaking into current state).
 */
export function applyExportProgress(
  payload: ExportProgressPayload,
  activeJobId: string | null,
  fx: ExportEffects,
): void {
  const { jobId, progress, done, error, currentFrame, totalFrames, etaSeconds, outputPath, status } = payload

  if (activeJobId && jobId !== activeJobId) return

  fx.setExportProgress(progress)
  if (currentFrame !== undefined) fx.setExportCurrentFrame(currentFrame)
  if (totalFrames !== undefined) fx.setExportTotalFrames(totalFrames)
  if (etaSeconds !== undefined) fx.setExportEta(etaSeconds)
  if (outputPath !== undefined) fx.setExportOutputPath(outputPath)

  if (status === 'complete') {
    fx.setIsExporting(false)
    fx.setExportJobId(null)
    fx.addToast({
      level: 'state',
      message: 'Export complete',
      source: 'export-complete',
      details: outputPath ?? 'File saved.',
    })
    return
  }

  if (status === 'cancelled') {
    fx.setIsExporting(false)
    fx.setExportJobId(null)
    fx.addToast({
      level: 'warning',
      message: 'Export cancelled',
      source: 'export-cancelled',
    })
    return
  }

  if (status === 'error' || error) {
    fx.setExportError(error ?? 'Export failed')
    fx.setIsExporting(false)
    fx.setExportJobId(null)
    fx.addToast({
      level: 'error',
      message: 'Export failed',
      source: 'export-error',
      details: error ?? 'Unknown error',
    })
    return
  }

  // Fallback for legacy payloads without a status field.
  if (done) {
    fx.setIsExporting(false)
    fx.setExportJobId(null)
  }
}
