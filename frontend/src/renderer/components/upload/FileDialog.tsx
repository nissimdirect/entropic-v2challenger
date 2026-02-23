interface FileDialogProps {
  onFileSelect: (path: string) => void
  disabled?: boolean
  label?: string
}

export default function FileDialog({ onFileSelect, disabled, label }: FileDialogProps) {
  const handleClick = async () => {
    if (disabled || !window.entropic) return

    const path = await window.entropic.selectFile([
      { name: 'Video', extensions: ['mp4', 'mov', 'avi', 'webm', 'mkv'] },
    ])

    if (path) {
      onFileSelect(path)
    }
  }

  return (
    <button
      className="file-dialog-btn"
      onClick={handleClick}
      disabled={disabled}
    >
      {label ?? 'Browse...'}
    </button>
  )
}
