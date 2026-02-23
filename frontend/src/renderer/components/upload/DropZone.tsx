import { useState, useCallback } from 'react'

const ALLOWED_EXTENSIONS = ['.mp4', '.mov', '.avi', '.webm', '.mkv']

interface DropZoneProps {
  onFileDrop: (path: string) => void
  disabled?: boolean
}

export default function DropZone({ onFileDrop, disabled }: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const validateFile = useCallback((name: string): boolean => {
    const ext = name.slice(name.lastIndexOf('.')).toLowerCase()
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setError(`Unsupported format: ${ext}. Use ${ALLOWED_EXTENSIONS.join(', ')}`)
      return false
    }
    setError(null)
    return true
  }, [])

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (!disabled) setIsDragOver(true)
    },
    [disabled],
  )

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragOver(false)

      if (disabled) return

      const files = e.dataTransfer.files
      if (files.length === 0) return

      const file = files[0]
      if (validateFile(file.name)) {
        // webUtils.getPathForFile is reliable in all Electron modes.
        // file.path can be empty when loaded via Vite dev server (HTTP).
        const filePath = window.entropic?.getPathForFile
          ? window.entropic.getPathForFile(file)
          : file.path
        if (filePath) {
          onFileDrop(filePath)
        } else {
          setError('Could not resolve file path. Try using Browse instead.')
        }
      }
    },
    [disabled, onFileDrop, validateFile],
  )

  return (
    <div
      className={`drop-zone ${isDragOver ? 'drop-zone--active' : ''} ${disabled ? 'drop-zone--disabled' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="drop-zone__content">
        <span className="drop-zone__icon">+</span>
        <span className="drop-zone__text">Drop video file here</span>
        <span className="drop-zone__hint">MP4, MOV, AVI, WebM, MKV</span>
      </div>
      {error && <div className="drop-zone__error">{error}</div>}
    </div>
  )
}
