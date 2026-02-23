interface PreviewControlsProps {
  currentFrame: number
  totalFrames: number
  fps: number
  isPlaying: boolean
  onSeek: (frame: number) => void
  onPlayPause: () => void
}

function formatTimecode(frame: number, fps: number): string {
  if (fps <= 0) return '0:00'
  const totalSeconds = frame / fps
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toFixed(1).padStart(4, '0')}`
}

export default function PreviewControls({
  currentFrame,
  totalFrames,
  fps,
  isPlaying,
  onSeek,
  onPlayPause,
}: PreviewControlsProps) {
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    onSeek(parseInt(e.target.value, 10))
  }

  return (
    <div className="preview-controls">
      <button className="preview-controls__play-btn" onClick={onPlayPause}>
        {isPlaying ? '||' : '>'}
      </button>
      <input
        type="range"
        className="preview-controls__scrub"
        min={0}
        max={Math.max(0, totalFrames - 1)}
        value={currentFrame}
        onChange={handleSeek}
        disabled={totalFrames === 0}
      />
      <span className="preview-controls__counter">
        {formatTimecode(currentFrame, fps)} / {formatTimecode(totalFrames, fps)}
      </span>
    </div>
  )
}
