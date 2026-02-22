interface IngestProgressProps {
  isIngesting: boolean
  error: string | null
}

export default function IngestProgress({ isIngesting, error }: IngestProgressProps) {
  if (!isIngesting && !error) return null

  return (
    <div className="ingest-progress">
      {isIngesting && (
        <div className="ingest-progress__loading">
          <div className="ingest-progress__spinner" />
          <span>Analyzing video...</span>
        </div>
      )}
      {error && (
        <div className="ingest-progress__error">
          <span>Error: {error}</span>
        </div>
      )}
    </div>
  )
}
