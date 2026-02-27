interface ExportProgressProps {
  isExporting: boolean
  progress: number
  error: string | null
  onCancel: () => void
}

export default function ExportProgress({ isExporting, progress, error, onCancel }: ExportProgressProps) {
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
          <div className="export-progress__info">
            <span>Exporting... {percent}%</span>
            <button className="export-progress__cancel" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </>
      )}
      {error && (
        <div className="export-progress__error">
          Export failed: {error}
        </div>
      )}
      {!isExporting && !error && progress >= 1 && (
        <div className="export-progress__done">Export complete!</div>
      )}
    </div>
  )
}
