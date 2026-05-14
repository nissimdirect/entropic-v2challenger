import { useState, useCallback } from 'react'
import { AUDIO_LIMITS } from '../../../shared/types'

const AUDIO_EXTENSIONS = ['.wav', '.mp3', '.m4a', '.aif', '.aiff', '.ogg', '.flac']
const VIDEO_IMAGE_EXTENSIONS = [
  '.mp4', '.mov', '.avi', '.webm', '.mkv', '.mxf', '.ts',
  '.png', '.jpg', '.jpeg', '.tiff', '.tif', '.webp', '.bmp', '.heic', '.heif',
]
const ALLOWED_EXTENSIONS = [...VIDEO_IMAGE_EXTENSIONS, ...AUDIO_EXTENSIONS]

function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i === -1 ? '' : name.slice(i).toLowerCase()
}

function isAudioExt(ext: string): boolean {
  return AUDIO_EXTENSIONS.includes(ext)
}

interface DropZoneProps {
  onFileDrop: (path: string) => void
  /** Optional audio-specific callback. When omitted, audio files fall through to onFileDrop. */
  onAudioDrop?: (path: string) => void
  disabled?: boolean
}

export default function DropZone({ onFileDrop, onAudioDrop, disabled }: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

      // Batch-drop cap — protect the pipeline from a 1000-file drop.
      if (files.length > AUDIO_LIMITS.MAX_BATCH_DROP) {
        setError(`Too many files (${files.length}). Drop up to ${AUDIO_LIMITS.MAX_BATCH_DROP} at once.`)
        return
      }

      const getPath = window.entropic?.getPathForFile
      const rejected: string[] = []

      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const ext = extOf(file.name)
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
          rejected.push(file.name)
          continue
        }
        const filePath = getPath ? getPath(file) : file.path
        if (!filePath) {
          rejected.push(file.name)
          continue
        }
        if (isAudioExt(ext) && onAudioDrop) {
          onAudioDrop(filePath)
        } else {
          onFileDrop(filePath)
        }
      }

      if (rejected.length > 0) {
        setError(`Unsupported or unresolved: ${rejected.join(', ')}`)
      } else {
        setError(null)
      }
    },
    [disabled, onFileDrop, onAudioDrop],
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
        <span className="drop-zone__text">Drop video, image, or audio file here</span>
        <span className="drop-zone__hint">MP4, MOV, PNG, WAV, MP3, FLAC, OGG, M4A …</span>
      </div>
      {error && <div className="drop-zone__error">{error}</div>}
    </div>
  )
}
