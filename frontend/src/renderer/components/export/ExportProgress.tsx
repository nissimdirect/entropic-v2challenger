import { useState, useEffect, useRef, useCallback } from 'react'

interface ExportProgressProps {
  isExporting: boolean
  progress: number
  currentFrame: number
  totalFrames: number
  etaSeconds: number | null
  outputPath: string | null
  error: string | null
  onCancel: () => void
}

function formatEta(seconds: number | null): string {
  if (seconds === null) return ''
  if (seconds >= 3600) return '> 1h'
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60)
    const s = Math.round(seconds % 60)
    return `${m}m ${s}s`
  }
  return `${Math.round(seconds)}s`
}

function formatElapsed(seconds: number): string {
  if (seconds >= 3600) {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    return `${h}h ${m}m ${s}s`
  }
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}m ${s}s`
  }
  return `${seconds}s`
}

function truncatePath(path: string, maxLen = 50): string {
  if (path.length <= maxLen) return path
  const parts = path.split('/')
  if (parts.length <= 3) return path
  const filename = parts[parts.length - 1]
  const root = parts.slice(0, 2).join('/')
  return `${root}/.../${filename}`
}

export default function ExportProgress({
  isExporting,
  progress,
  currentFrame,
  totalFrames,
  etaSeconds,
  outputPath,
  error,
  onCancel,
}: ExportProgressProps) {
  const [elapsed, setElapsed] = useState(0)
  const [cancelPending, setCancelPending] = useState(false)
  const cancelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startTimeRef = useRef<number | null>(null)

  // Elapsed time counter
  useEffect(() => {
    if (isExporting) {
      if (startTimeRef.current === null) {
        startTimeRef.current = Date.now()
      }
      const interval = setInterval(() => {
        if (startTimeRef.current !== null) {
          setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000))
        }
      }, 1000)
      return () => clearInterval(interval)
    }
    // Reset on new export
    if (!isExporting && progress < 1 && !error) {
      startTimeRef.current = null
      setElapsed(0)
    }
  }, [isExporting, progress, error])

  // Clear cancel confirmation after 3s
  useEffect(() => {
    if (cancelPending) {
      cancelTimerRef.current = setTimeout(() => setCancelPending(false), 3000)
      return () => {
        if (cancelTimerRef.current) clearTimeout(cancelTimerRef.current)
      }
    }
  }, [cancelPending])

  const handleCancel = useCallback(() => {
    if (progress > 0.5 && !cancelPending) {
      setCancelPending(true)
      return
    }
    setCancelPending(false)
    onCancel()
  }, [progress, cancelPending, onCancel])

  const isComplete = !isExporting && !error && progress >= 1

  if (!isExporting && !error && progress < 1) return null

  const percent = Math.round(progress * 100)

  return (
    <div className="export-progress">
      {isExporting && (
        <>
          <div className="export-progress__bar-container">
            <div
              className="export-progress__bar"
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="export-progress__details">
            <span>Exporting... {percent}% ({currentFrame}/{totalFrames} frames)</span>
            {etaSeconds !== null && <span>ETA: {formatEta(etaSeconds)}</span>}
            <span>Elapsed: {formatElapsed(elapsed)}</span>
            {outputPath && <span>Output: {truncatePath(outputPath)}</span>}
          </div>
          <div className="export-progress__info">
            <button className="export-progress__cancel" onClick={handleCancel}>
              {cancelPending ? `Cancel? (${percent}% done)` : 'Cancel'}
            </button>
          </div>
        </>
      )}

      {error && (
        <div className="export-progress__error">
          Export failed: {error}
        </div>
      )}

      {isComplete && (
        <div className="export-progress__done">
          <span>Export complete!</span>
          {outputPath && (
            <span className="export-progress__output-path">
              {truncatePath(outputPath)}
            </span>
          )}
          <button
            className="export-progress__open-btn"
            onClick={() => { /* noop for now */ }}
          >
            Open in Finder
          </button>
        </div>
      )}
    </div>
  )
}
