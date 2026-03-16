import { useState, useEffect } from 'react'

interface UpdateInfo {
  version: string
  releaseDate?: string
}

export default function UpdateBanner() {
  const [updateAvailable, setUpdateAvailable] = useState<UpdateInfo | null>(null)
  const [downloaded, setDownloaded] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!window.entropic) return

    const cleanup1 = window.entropic.onUpdateAvailable?.((info: UpdateInfo) => {
      setUpdateAvailable(info)
    })
    const cleanup2 = window.entropic.onUpdateDownloaded?.(() => {
      setDownloaded(true)
    })
    return () => {
      cleanup1?.()
      cleanup2?.()
    }
  }, [])

  if (!updateAvailable || dismissed) return null

  return (
    <div className="update-banner">
      <span className="update-banner__text">
        {downloaded
          ? `Update v${updateAvailable.version} ready — restart to install`
          : `Update v${updateAvailable.version} available`}
      </span>
      <div className="update-banner__actions">
        {!downloaded && (
          <button
            className="update-banner__download"
            onClick={() => window.entropic?.downloadUpdate?.()}
          >
            Download
          </button>
        )}
        {downloaded && (
          <button
            className="update-banner__install"
            onClick={() => window.entropic?.installUpdate?.()}
          >
            Restart
          </button>
        )}
        <button className="update-banner__dismiss" onClick={() => setDismissed(true)}>
          ×
        </button>
      </div>
    </div>
  )
}
