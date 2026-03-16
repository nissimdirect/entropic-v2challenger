import { useExportStore, type ExportJob } from '../../stores/export'

interface RenderQueueProps {
  isOpen: boolean
  onClose: () => void
}

const STATUS_COLORS: Record<ExportJob['status'], string> = {
  queued: '#6b7280',
  rendering: '#3b82f6',
  complete: '#4ade80',
  failed: '#ef4444',
  cancelled: '#f59e0b',
}

const STATUS_LABELS: Record<ExportJob['status'], string> = {
  queued: 'Queued',
  rendering: 'Rendering',
  complete: 'Complete',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

function basename(path: string): string {
  return path.split(/[\\/]/).pop() || path
}

function formatEta(seconds: number | null): string {
  if (seconds === null) return ''
  if (seconds < 60) return `${Math.ceil(seconds)}s remaining`
  const m = Math.floor(seconds / 60)
  const s = Math.ceil(seconds % 60)
  return `${m}m ${s}s remaining`
}

export default function RenderQueue({ isOpen, onClose }: RenderQueueProps) {
  const jobs = useExportStore((s) => s.jobs)
  const isProcessing = useExportStore((s) => s.isProcessing)
  const startQueue = useExportStore((s) => s.startQueue)
  const stopQueue = useExportStore((s) => s.stopQueue)
  const removeJob = useExportStore((s) => s.removeJob)
  const clearCompleted = useExportStore((s) => s.clearCompleted)
  const currentJobIndex = useExportStore((s) => s.currentJobIndex)

  if (!isOpen) return null

  const queuedCount = jobs.filter((j) => j.status === 'queued').length
  const renderingCount = jobs.filter((j) => j.status === 'rendering').length
  const completeCount = jobs.filter((j) => j.status === 'complete').length
  const hasQueued = queuedCount > 0

  return (
    <div className="render-queue__overlay" onClick={onClose}>
      <div className="render-queue" onClick={(e) => e.stopPropagation()}>
        <div className="render-queue__header">
          <span>Render Queue</span>
          <div className="render-queue__header-actions">
            <button
              className="render-queue__clear-btn"
              onClick={clearCompleted}
            >
              Clear Completed
            </button>
            <button className="render-queue__close" onClick={onClose}>
              x
            </button>
          </div>
        </div>

        <div className="render-queue__list">
          {jobs.length === 0 && (
            <div className="render-queue__empty">No jobs in queue</div>
          )}
          {jobs.map((job, idx) => {
            const isCurrentRendering =
              currentJobIndex !== null && idx === currentJobIndex
            const percent = Math.round(job.progress * 100)

            return (
              <div
                key={job.id}
                className={`render-queue__job render-queue__job--${job.status}`}
              >
                <div className="render-queue__job-header">
                  <span className="render-queue__job-status">
                    <span
                      className="render-queue__job-dot"
                      style={{ backgroundColor: STATUS_COLORS[job.status] }}
                    />
                    {STATUS_LABELS[job.status]}
                  </span>
                  <span className="render-queue__job-filename">
                    {basename(job.outputPath)}
                  </span>
                  <button
                    className="render-queue__job-remove"
                    disabled={isCurrentRendering}
                    onClick={() => removeJob(job.id)}
                    title={
                      isCurrentRendering
                        ? 'Cannot remove while rendering'
                        : 'Remove job'
                    }
                  >
                    x
                  </button>
                </div>

                {job.status === 'rendering' && (
                  <div className="render-queue__job-progress">
                    <div className="render-queue__job-bar-container">
                      <div
                        className="render-queue__job-bar"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <div className="render-queue__job-eta">
                      {percent}%{' '}
                      {job.etaSeconds !== null && formatEta(job.etaSeconds)}
                    </div>
                  </div>
                )}

                {job.status === 'failed' && job.error && (
                  <div className="render-queue__job-error">{job.error}</div>
                )}
              </div>
            )
          })}
        </div>

        <div className="render-queue__footer">
          <div className="render-queue__footer-actions">
            {!isProcessing && (
              <button
                className="render-queue__start-btn"
                disabled={!hasQueued}
                onClick={startQueue}
              >
                Start Queue
              </button>
            )}
            {isProcessing && (
              <button className="render-queue__stop-btn" onClick={stopQueue}>
                Stop
              </button>
            )}
          </div>
          <div className="render-queue__summary">
            {queuedCount} queued, {renderingCount} rendering, {completeCount}{' '}
            complete
          </div>
        </div>
      </div>
    </div>
  )
}
